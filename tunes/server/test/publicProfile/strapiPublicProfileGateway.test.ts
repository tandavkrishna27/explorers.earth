import { describe, expect, it, vi } from "vitest";
import { parse, visit } from "graphql";
import { StrapiPublicProfileGateway } from "../../publicProfile/strapiPublicProfileGateway";

type GuideHeader = { documentId: string; Title: string; slug: string | null };

const graphqlResponse = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });

function guideLookupFetch(options: {
  exact?: Record<string, unknown>[];
  documents?: Record<string, Record<string, unknown>>;
  headers?: GuideHeader[];
  headerPage?: (requestIndex: number) => GuideHeader[];
}) {
  let headerRequestIndex = 0;
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body));
    const query = String(payload.query);
    if (query.includes("query PublicGuideHeaders")) {
      const rows = options.headerPage
        ? options.headerPage(headerRequestIndex++)
        : (options.headers ?? []).slice(
          payload.variables.start,
          payload.variables.start + payload.variables.limit,
        );
      return graphqlResponse({ guides: rows });
    }
    if (query.includes("$documentId")) {
      const guide = options.documents?.[payload.variables.documentId];
      return graphqlResponse({ guides: guide ? [guide] : [] });
    }
    return graphqlResponse({ guides: options.exact ?? [] });
  });
}

const fullGuide = (documentId: string, Title = "One Day in Hyderabad") => ({
  documentId,
  Title,
  slug: null,
  Visibility: true,
  guide_sections: [{ documentId: `${documentId}-section`, Sequence: 1 }],
});

describe("StrapiPublicProfileGateway", () => {
  it.each(["category", "detail"] as const)("preserves public Places modal fields in emitted %s selections", async (kind) => {
    const fetchImpl = vi.fn().mockImplementation(() => graphqlResponse({ recommendationLists: [] }));
    const gateway = new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl });
    if (kind === "category") await gateway.resolveCategory("alice", "places", 12);
    else await gateway.resolveDetail("alice", "places", "city-13", 24);
    const query = JSON.parse(fetchImpl.mock.calls[0][1].body).query;
    let fields: string[] = [];
    visit(parse(query), { Field(node) {
      if (node.name.value === "recommended_places") fields = node.selectionSet!.selections.flatMap(selection => selection.kind === "Field" ? [selection.name.value] : []);
    } });
    expect(fields).toEqual(expect.arrayContaining(["Places_Social_Link", "Users_Social_URL", "user_recommendation_note", "user_rating", "google_rating"]));
  });
  it("uses a fixed server-owned query and authorization header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { appLists: [] } }), { status: 200 }));
    const gateway = new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl });
    await gateway.resolveCategory("tk2727", "apps", 12);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://cms.example/graphql");
    expect(init.headers.authorization).toBe("Bearer server-only-token");
    expect(JSON.parse(init.body)).toMatchObject({ variables: { username: "tk2727", limit: 12 } });
  });

  it("returns the bounded App card fields required by the existing public overview", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { appLists: [] } }), { status: 200 }));
    await new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl }).resolveCategory("tk2727", "apps", 12);
    const query = JSON.parse(fetchImpl.mock.calls[0][1].body).query;
    expect(query).toContain("recommended_apps(sort:[\"display_order:asc\"],pagination:{limit:12})");
    expect(query).toContain("title");
    expect(query).toContain("app_category{documentId name slug}");
  });

  it.each([["books", "recommended_books", "title"], ["products", "recommended_products", "title"]] as const)("returns bounded %s card data for the public overview", async (category, relation, requiredField) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    await new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl }).resolveCategory("tk2727", category, 12);
    const query = JSON.parse(fetchImpl.mock.calls[0][1].body).query;
    expect(query).toContain(`${relation}(sort:["display_order:asc"],pagination:{limit:12})`);
    expect(query).toContain(requiredField);
  });

  it("uses the live-supported timestamp ordering for nested Place recommendations", async () => {
    const fetchImpl = vi.fn().mockImplementation(() => new Response(JSON.stringify({ data: { recommendationLists: [] } }), { status: 200 }));
    const gateway = new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl });
    await gateway.resolveCategory("tk2727", "places", 12);
    await gateway.resolveDetail("tk2727", "places", "hyderabad", 24);
    const queries = fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body).query);

    expect(queries).toContainEqual(expect.stringContaining('recommended_places(sort:["createdAt:asc"],pagination:{limit:24})'));
    expect(queries).not.toContainEqual(expect.stringContaining('recommended_places(sort:["display_order:asc"]'));
  });

  it("exposes location-list pin metadata for the existing Places hero carousel", async () => {
    const fetchImpl = vi.fn().mockImplementation(() => new Response(JSON.stringify({ data: { recommendationLists: [] } }), { status: 200 }));
    const gateway = new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl });

    await gateway.resolveCategory("tk2727", "places", 12);
    await gateway.resolveDetail("tk2727", "places", "hyderabad", 24);

    const [categoryRequest, detailRequest] = fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body).query);
    expect(categoryRequest).toMatch(/Visibility\s+is_pinned\s+pin_order\s+List_Name_Details/);
    expect(detailRequest).toMatch(/Visibility\s+is_pinned\s+pin_order\s+recommended_places/);
    expect(categoryRequest).not.toMatch(/recommended_places[^}]*is_pinned/);
  });

  it("uses the valid Places detail projection and preserves the saved list thumbnail", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        recommendationLists: [{
          documentId: "list-1",
          List_Name: "Tokyo",
          List_Name_Details: { thumbnail: "https://cdn.example/tokyo.jpg" },
          recommended_places: [],
        }],
      },
    }), { status: 200 }));

    const value = await new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl })
      .resolveDetail("tk2727", "places", "tokyo", 24);
    const query = JSON.parse(fetchImpl.mock.calls[0][1].body).query;

    expect(query).toContain("List_Name_Details");
    expect(query).not.toMatch(/\bcover_image\b/);
    expect(value).toEqual({
      recommendationLists: [{
        documentId: "list-1",
        List_Name: "Tokyo",
        List_Name_Details: { thumbnail: "https://cdn.example/tokyo.jpg" },
        recommended_places: [],
      }],
    });
  });

  it.each([["places", "recommended_places"], ["movies", "recommended_movies"], ["books", "recommended_books"], ["games", "recommended_games"], ["guides", "Guide_Media"], ["apps", "recommended_apps"], ["products", "recommended_products"], ["people", "recommended_people"]] as const)("uses the allowlisted %s projection", async (category, field) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    await new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl }).resolveCategory("tk2727", category, 12);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).query).toContain(field);
  });

  it("never requests a creator or recommendation phone number for a public Places response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { recommendationLists: [] } }), { status: 200 }));
    await new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl }).resolveCategory("tk2727", "places", 12);

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).query).not.toMatch(/\bContact_Number\b/);
  });

  it("redacts sensitive keys that arrive inside a JSON-shaped upstream field", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        recommendationLists: [{
          documentId: "list-1",
          Contact_Number: "+10000000000",
          Place_Details: { Title: "Amber Fort", formatted_phone_number: "+10000000001", api_key: "upstream-secret" },
        }],
      },
    }), { status: 200 }));

    await expect(new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl })
      .resolveCategory("tk2727", "places", 12))
      .resolves.toEqual({ recommendationLists: [{ documentId: "list-1", Place_Details: { Title: "Amber Fort" } }] });
  });

  it("unwraps the allowlisted GraphQL data instead of forwarding its envelope", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { appLists: [{ documentId: "list-1" }] }, extensions: { traceId: "internal" } }), { status: 200 }));
    const value = await new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl }).resolveCategory("tk2727", "apps", 12);
    expect(value).toEqual({ appLists: [{ documentId: "list-1" }] });
  });

  it("fails closed when Strapi returns GraphQL errors with an OK status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: null, errors: [{ message: "Forbidden" }] }), { status: 200 }));
    await expect(new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl }).resolveCategory("tk2727", "apps", 12)).rejects.toThrow("PUBLIC_PROFILE_UPSTREAM_FAILED");
  });

  it("retries one failed upstream read and keeps the server-only authorization header", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { appLists: [] } }), { status: 200 }));
    const gateway = new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl });

    await expect(gateway.resolveCategory("tk2727", "apps", 12)).resolves.toEqual({ appLists: [] });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1].headers.authorization).toBe("Bearer server-only-token");
    expect(fetchImpl.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("fails closed when an account response contains GraphQL errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: null, errors: [{ message: "Forbidden" }] }), { status: 200 }));
    await expect(new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl }).resolveAccount("tk2727")).rejects.toThrow("PUBLIC_PROFILE_UPSTREAM_FAILED");
  });

  it("uses a dedicated public shell projection and releases a mobile number only when its visibility flag is enabled", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (_url, init) => {
      const payload = JSON.parse(String(init?.body));
      if (String(payload.query).includes("PublicNavigationCounts")) return graphqlResponse({});
      return graphqlResponse({ accounts: [payload.variables.username === "tk2727" ? {
        documentId: "account-1", mobile_number_visibility: false, mobile_number: "+10000000000",
      } : {
        documentId: "account-2", mobile_number_visibility: true, mobile_number: "+10000000001",
      }] });
    });
    const gateway = new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl });
    await expect(gateway.resolveAccount("tk2727")).resolves.toEqual({ documentId: "account-1", mobile_number_visibility: false });
    await expect(gateway.resolveAccount("visible-phone")).resolves.toEqual({ documentId: "account-2", mobile_number_visibility: true, mobile_number: "+10000000001" });
    const query = JSON.parse(fetchImpl.mock.calls[0][1].body).query;
    expect(query).toMatch(/pagination:\s*\{\s*limit:\s*1\s*\}\s*\)\s*\{\s*username\s+Account_Name/);
    expect(query).toContain("Account_Name");
    expect(query).toMatch(/profile_picture\s*\{\s*url\s+alternativeText/);
    expect(query).toMatch(/\bmobile_number\b/);
  });

  it("projects only visible social links while preserving a visible email entry", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (_url, init) => {
      const payload = JSON.parse(String(init?.body));
      if (String(payload.query).includes("PublicNavigationCounts")) return graphqlResponse({});
      return graphqlResponse({ accounts: [{
        documentId: "account-1",
        social_media: {
          instagram: { link: "https://instagram.example/private", visibility: false },
          email: { link: "hello@example.test", visibility: true },
          website: { link: "https://example.test", visibility: true, token: "must-not-leak" },
        },
      }] });
    });

    await expect(new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl })
      .resolveAccount("tk2727")).resolves.toMatchObject({
        social_media: {
          email: { link: "hello@example.test", visibility: true },
          website: { link: "https://example.test", visibility: true },
        },
      });
    const account = await new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl })
      .resolveAccount("tk2727");
    expect(account?.social_media).not.toHaveProperty("instagram");
    expect(account?.social_media).not.toHaveProperty("website.token");
  });

  it("projects exact published-list totals for navigation ranking without loading list rows", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(graphqlResponse({ accounts: [{ documentId: "account-1", public_profile: "Yes" }] }))
      .mockResolvedValueOnce(graphqlResponse({
      recommendationListsCount: { pageInfo: { total: 50 } },
      movieListsCount: { pageInfo: { total: 12 } },
      bookListsCount: { pageInfo: { total: 7 } },
      gameListsCount: { pageInfo: { total: 6 } },
      guidesCount: { pageInfo: { total: 5 } },
      appListsCount: { pageInfo: { total: 4 } },
      productListsCount: { pageInfo: { total: 3 } },
      personListsCount: { pageInfo: { total: 2 } },
      }));

    await expect(new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl })
      .resolveAccount("tk2727")).resolves.toMatchObject({
        public_navigation_counts: {
          public_recommendations: 50,
          public_movie: 12,
          public_books: 7,
          public_games: 6,
          public_guides: 5,
          public_apps: 4,
          public_products: 3,
          public_people: 2,
        },
      });

    const query = JSON.parse(fetchImpl.mock.calls[1][1].body).query;
    expect(query).toContain("recommendationListsCount: recommendationLists_connection");
    expect(query).toContain("pageInfo { total }");
    expect(query).not.toMatch(/recommendationListsCount:[^{]+\{\s*nodes\b/);
  });

  it("returns the public shell when optional navigation-count projection is forbidden", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(graphqlResponse({ accounts: [{ documentId: "account-1", public_profile: "Yes" }] }))
      .mockResolvedValueOnce(graphqlResponse(null))
      .mockResolvedValueOnce(graphqlResponse(null));

    await expect(new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl })
      .resolveAccount("tk2727")).resolves.toEqual({ documentId: "account-1", public_profile: "Yes" });
  });

  it("bounds optional navigation-count latency without delaying the public shell", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn()
        .mockResolvedValueOnce(graphqlResponse({ accounts: [{ documentId: "account-1", public_profile: "Yes" }] }))
        .mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        }));
      const pending = new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl })
        .resolveAccount("tk2727");
      let result: unknown;
      void pending.then((value) => { result = value; });

      await vi.advanceTimersByTimeAsync(500);

      expect(result).toEqual({ documentId: "account-1", public_profile: "Yes" });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("converts a bounded public cursor into Strapi's supported start/limit pagination", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { appLists: [] } }), { status: 200 }));
    await new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl }).resolveCategory("tk2727", "apps", 12, "o24");
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);

    expect(payload.variables).toMatchObject({ username: "tk2727", limit: 12, start: 24 });
    expect(payload.query).toContain("pagination:{start:$start,limit:$limit}");
  });

  it("uses a fixed account-scoped Apps detail query rather than client-side list filtering", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { appLists: [] } }), { status: 200 }));
    await new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl }).resolveDetail("tk2727", "apps", "useful-apps", 24);
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload.variables).toMatchObject({ username: "tk2727", slug: "useful-apps", limit: 24 });
    expect(payload.query).toContain("slug:{eq:$slug}");
    expect(payload.query).toContain("recommended_apps(sort:[\"display_order:asc\"],pagination:{start:$start,limit:$limit})");
  });

  it.each([
    ["places", "recommendationLists", "recommended_places"],
    ["movies", "movieLists", "recommended_movies"],
    ["books", "bookLists", "recommended_books"],
    ["games", "gameLists", "recommended_games"],
    ["guides", "guides", "guide_sections"],
    ["apps", "appLists", "recommended_apps"],
    ["products", "productLists", "recommended_products"],
    ["people", "personLists", "recommended_people"],
  ] as const)("uses an exact, account-scoped %s detail projection", async (category, collection, detailField) => {
    const fetchImpl = vi.fn().mockImplementation(() => new Response(JSON.stringify({ data: { [collection]: [] } }), { status: 200 }));
    await new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl }).resolveDetail("tk2727", category, "published-list", 24);
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload.variables).toMatchObject({ username: "tk2727", slug: "published-list", limit: 24 });
    expect(payload.query).toContain(`${collection}(filters:{account:{username:{eq:$username}},slug:{eq:$slug}`);
    expect(payload.query).toContain(detailField);
  });

  it("returns an exact stored Guide slug before trying compatibility lookups", async () => {
    const exact = { ...fullGuide("guide-exact"), slug: "hyderabad-day" };
    const fetchImpl = guideLookupFetch({ exact: [exact] });

    await expect(new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl })
      .resolveDetail("tk2727", "guides", "hyderabad-day", 12, "o24"))
      .resolves.toEqual({ guides: [exact] });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string);
    expect(payload.variables).toEqual({ username: "tk2727", slug: "hyderabad-day", limit: 12, start: 24 });
  });

  it("resolves a stable Guide documentId directly without scanning titles", async () => {
    const guide = fullGuide("guide-stable-id");
    const fetchImpl = guideLookupFetch({ documents: { "guide-stable-id": guide } });

    await expect(new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl })
      .resolveDetail("tk2727", "guides", "guide-stable-id", 24))
      .resolves.toEqual({ guides: [guide] });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const directPayload = JSON.parse(fetchImpl.mock.calls[1][1]?.body as string);
    expect(directPayload.variables).toMatchObject({ username: "tk2727", documentId: "guide-stable-id", limit: 24, start: 0 });
    expect(directPayload.query).toContain("account:{username:{eq:$username}}");
    expect(directPayload.query).toContain("documentId:{eq:$documentId}");
    expect(directPayload.query).toContain("Visibility:{eq:true}");
    expect(directPayload.query).toContain('guide_sections(pagination:{start:$start,limit:$limit},sort:["Sequence:asc"])');
  });

  it("resolves one legacy null-slug Guide title and preserves the section cursor", async () => {
    const guide = fullGuide("legacy-hyderabad");
    const fetchImpl = guideLookupFetch({
      headers: [{ documentId: "legacy-hyderabad", Title: "One Day in Hyderabad", slug: null }],
      documents: { "legacy-hyderabad": guide },
    });

    await expect(new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl })
      .resolveDetail("tk2727", "guides", "one-day-in-hyderabad", 12, "o36"))
      .resolves.toEqual({ guides: [guide] });

    const payloads = fetchImpl.mock.calls.map(([, init]) => JSON.parse(init?.body as string));
    const headerPayloads = payloads.filter(({ query }) => query.includes("query PublicGuideHeaders"));
    expect(headerPayloads).toHaveLength(2);
    expect(headerPayloads[0].variables).toEqual({ username: "tk2727", start: 0, limit: 24 });
    expect(headerPayloads[1].variables).toEqual({ username: "tk2727", start: 1, limit: 24 });
    expect(headerPayloads[0].query).toContain("account:{username:{eq:$username}}");
    expect(headerPayloads[0].query).toContain("Visibility:{eq:true}");
    expect(headerPayloads[0].query).toContain('sort:["documentId:asc"]');
    expect(headerPayloads[0].query).toMatch(/\{documentId Title slug\}/);
    const detailPayload = payloads.at(-1);
    expect(detailPayload.variables).toMatchObject({ username: "tk2727", documentId: "legacy-hyderabad", limit: 12, start: 36 });
  });

  it.each([
    ["absent", []],
    ["hidden", [{ documentId: "guide-hidden", Title: "One Day in Hyderabad", slug: null, owner: "tk2727", Visibility: false }]],
    ["another account", [{ documentId: "guide-foreign", Title: "One Day in Hyderabad", slug: null, owner: "another-user", Visibility: true }]],
  ] as const)("fails closed for an %s legacy Guide fixture", async (_fixture, sourceHeaders) => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      const query = String(payload.query);
      if (query.includes("query PublicGuideHeaders")) {
        const rows = sourceHeaders
          .filter((header) => !query.includes("account:{username:{eq:$username}}") || header.owner === payload.variables.username)
          .filter((header) => !query.includes("Visibility:{eq:true}") || header.Visibility === true)
          .map(({ documentId, Title, slug }) => ({ documentId, Title, slug }));
        return graphqlResponse({ guides: rows });
      }
      return graphqlResponse({ guides: [] });
    });

    await expect(new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl })
      .resolveDetail("tk2727", "guides", "one-day-in-hyderabad", 24))
      .resolves.toEqual({ guides: [] });

    const payloads = fetchImpl.mock.calls.map(([, init]) => JSON.parse(init?.body as string));
    const headerPayload = payloads
      .find(({ query }) => query.includes("query PublicGuideHeaders"));
    expect(headerPayload.query).toContain("account:{username:{eq:$username}}");
    expect(headerPayload.query).toContain("Visibility:{eq:true}");
    expect(payloads.filter(({ query }) => query.includes("query PublicGuideDocumentDetail"))).toHaveLength(1);
  });

  it("fails closed when title normalization matches more than one Guide documentId", async () => {
    const fetchImpl = guideLookupFetch({ headers: [
      { documentId: "guide-a", Title: "One Day in Hyderabad", slug: null },
      { documentId: "guide-b", Title: "One   Day in Hyderabad", slug: null },
      { documentId: "guide-a", Title: "One Day in Hyderabad", slug: null },
    ] });

    await expect(new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl })
      .resolveDetail("tk2727", "guides", "one-day-in-hyderabad", 24))
      .resolves.toEqual({ guides: [] });

    expect(fetchImpl.mock.calls.some(([, init]) => String(init?.body).includes("$documentId"))).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it.each([99, 100])("resolves a unique legacy title after proving %i visible Guide headers are complete", async (count) => {
    const headers: GuideHeader[] = Array.from({ length: count }, (_, index) => ({
      documentId: `guide-${String(index).padStart(3, "0")}`,
      Title: index === 0 ? "One Day in Hyderabad" : `Guide ${index}`,
      slug: null,
    }));
    const selected = fullGuide(headers[0].documentId);
    const fetchImpl = guideLookupFetch({ headers, documents: { [headers[0].documentId]: selected } });

    await expect(new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl })
      .resolveDetail("tk2727", "guides", "one-day-in-hyderabad", 24))
      .resolves.toEqual({ guides: [selected] });

    const headerPayloads = fetchImpl.mock.calls
      .map(([, init]) => JSON.parse(init?.body as string))
      .filter(({ query }) => query.includes("query PublicGuideHeaders"));
    expect(headerPayloads).toHaveLength(6);
    expect(headerPayloads.map(({ variables }) => variables.start)).toEqual([0, 24, 48, 72, 96, count]);
    expect(headerPayloads.every(({ variables }) => variables.limit <= 24)).toBe(true);
  });

  it("fails closed at the 101-header overflow sentinel even after seeing a candidate", async () => {
    const headers: GuideHeader[] = Array.from({ length: 101 }, (_, index) => ({
      documentId: `guide-${String(index).padStart(3, "0")}`,
      Title: index === 0 ? "One Day in Hyderabad" : `Guide ${index}`,
      slug: null,
    }));
    const fetchImpl = guideLookupFetch({ headers, documents: { [headers[0].documentId]: fullGuide(headers[0].documentId) } });

    await expect(new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl })
      .resolveDetail("tk2727", "guides", "one-day-in-hyderabad", 24))
      .resolves.toEqual({ guides: [] });

    const payloads = fetchImpl.mock.calls.map(([, init]) => JSON.parse(init?.body as string));
    expect(payloads.filter(({ query }) => query.includes("query PublicGuideHeaders"))).toHaveLength(5);
    expect(payloads.at(-1).query).toContain("query PublicGuideHeaders");
  });

  it("fails closed when six non-terminal header requests exhaust the budget after a match", async () => {
    const fetchImpl = guideLookupFetch({
      documents: { "guide-match": fullGuide("guide-match") },
      headerPage: (requestIndex) => [{
        documentId: requestIndex === 0 ? "guide-match" : `guide-${requestIndex}`,
        Title: requestIndex === 0 ? "One Day in Hyderabad" : `Other ${requestIndex}`,
        slug: null,
      }],
    });

    await expect(new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl })
      .resolveDetail("tk2727", "guides", "one-day-in-hyderabad", 24))
      .resolves.toEqual({ guides: [] });

    const payloads = fetchImpl.mock.calls.map(([, init]) => JSON.parse(init?.body as string));
    expect(payloads.filter(({ query }) => query.includes("query PublicGuideHeaders"))).toHaveLength(6);
    expect(payloads.at(-1).query).toContain("query PublicGuideHeaders");
  });

  it("never retries a header page beyond the six-request compatibility budget", async () => {
    let headerRequests = 0;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const { query } = JSON.parse(String(init?.body));
      if (!query.includes("query PublicGuideHeaders")) return graphqlResponse({ guides: [] });
      headerRequests += 1;
      if (headerRequests >= 6) throw new Error("header transport failed");
      return graphqlResponse({ guides: [{
        documentId: `guide-${headerRequests}`,
        Title: headerRequests === 1 ? "One Day in Hyderabad" : `Other ${headerRequests}`,
        slug: null,
      }] });
    });

    await expect(new StrapiPublicProfileGateway({ origin: "https://cms.example", token: "server-only-token", fetchImpl })
      .resolveDetail("tk2727", "guides", "one-day-in-hyderabad", 24))
      .rejects.toThrow("PUBLIC_PROFILE_UPSTREAM_FAILED");
    expect(headerRequests).toBe(6);
  });
});
