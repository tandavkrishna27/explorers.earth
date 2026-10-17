import { describe, expect, it, vi } from "vitest";
import {
  resolveCountryFromIp,
  StrapiAnalyticsPublisher,
  StrapiAnalyticsTargetValidator,
  verifyAnalyticsAccountOwnership,
} from "../explorers-analytics-adapters";
import { AnalyticsPublishDispatchError, type NormalizedExplorersAnalyticsEvent } from "../explorers-analytics-service";
it('loads the production geoip data and resolves a public address through the default adapter',()=>{
  expect(resolveCountryFromIp('8.8.8.8')).toBe('US');
});

const payload: NormalizedExplorersAnalyticsEvent = {
  eventId: "evt-adapter-0001",
  accountId: "account-1",
  locationId: "list-1",
  recommendationId: "item-1",
  event: {
    type: "click",
    timestamp: "2026-08-24T03:30:00.000Z",
    page: "public-books",
    element: "book-card",
    canonicalPath: "/tk2727/books/reading",
    country: "IN",
    utmParams: {
      utm_source: "newsletter",
      utm_medium: "email",
      utm_campaign: "launch",
      utm_term: "travel",
      utm_content: "hero",
    },
  },
};

const targetInput = {
  consent: true,
  eventId: "evt-target-0001",
  accountId: "account-1",
  event: {
    type: "view" as const,
    timestamp: "2026-08-24T03:30:00.000Z",
    page: "public-profile",
    canonicalPath: "/tk2727",
  },
};

const bookTargetInput = {
  ...targetInput,
  eventId: "evt-target-book-0001",
  locationId: "book-list-1",
  recommendationId: "book-1",
  event: {
    ...targetInput.event,
    page: "public-books",
    canonicalPath: "/tk2727/books",
  },
};

describe("StrapiAnalyticsTargetValidator", () => {
  it("validates a real account without exposing Strapi data", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({ data: { accounts: [{ documentId: "account-1", username: "tk2727", public_profile: "Yes" }] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const validator = new StrapiAnalyticsTargetValidator({
      strapiUrl: "https://cms.example/",
      accessToken: "server-only-token",
      fetchImpl,
    });

    await expect(validator.validate(targetInput)).resolves.toBe(true);
    await expect(validator.validate(targetInput)).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://cms.example/graphql");
    expect(init.headers.Authorization).toBe("Bearer server-only-token");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init.body);
    expect(body.variables).toEqual({ accountId: "account-1", username: "tk2727" });
    expect(body.query).toContain("documentId: { eq: $accountId }");
  });

  it("revalidates a previously public target so unpublishing takes effect immediately", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ data: { accounts: [{
          documentId: "account-1",
          username: "tk2727",
          public_profile: "Yes",
        }] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ data: { accounts: [{
          documentId: "account-1",
          username: "tk2727",
          public_profile: "No",
        }] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ));
    const validator = new StrapiAnalyticsTargetValidator({
      strapiUrl: "https://cms.example",
      accessToken: "server-only-token",
      fetchImpl,
    });

    await expect(validator.validate(targetInput)).resolves.toBe(true);
    await expect(validator.validate(targetInput)).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects an unknown account and briefly caches the negative result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { accounts: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const validator = new StrapiAnalyticsTargetValidator({
      strapiUrl: "https://cms.example",
      accessToken: "server-only-token",
      fetchImpl,
    });

    await expect(validator.validate(targetInput)).resolves.toBe(false);
    await expect(validator.validate(targetInput)).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a top-level event when its canonical username belongs to another account", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            accounts: [{
              documentId: "account-1",
              username: "someone-else",
              public_profile: "Yes",
            }],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const validator = new StrapiAnalyticsTargetValidator({
      strapiUrl: "https://cms.example",
      accessToken: "server-only-token",
      fetchImpl,
    });

    await expect(validator.validate(targetInput)).resolves.toBe(false);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.variables).toEqual({ accountId: "account-1", username: "tk2727" });
  });

  it("rejects a top-level category event when that public category is unpublished", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            accounts: [{
              documentId: "account-1",
              username: "tk2727",
              public_profile: "Yes",
              public_books: "No",
            }],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const validator = new StrapiAnalyticsTargetValidator({
      strapiUrl: "https://cms.example",
      accessToken: "server-only-token",
      fetchImpl,
    });

    await expect(
      validator.validate({
        ...bookTargetInput,
        locationId: null,
        recommendationId: null,
      }),
    ).resolves.toBe(false);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.variables.username).toBe("tk2727");
    expect(body.query).toContain("public_books");
  });

  it("does not reuse a canonical-account cache entry for a mismatched username path", async () => {
    const publicAccount = {
      documentId: "account-1",
      username: "tk2727",
      public_profile: "Yes",
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ data: { accounts: [publicAccount] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ data: { accounts: [] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ));
    const validator = new StrapiAnalyticsTargetValidator({
      strapiUrl: "https://cms.example",
      accessToken: "server-only-token",
      fetchImpl,
    });

    await expect(validator.validate(targetInput)).resolves.toBe(true);
    await expect(validator.validate({
      ...targetInput,
      eventId: "evt-target-forged-path",
      event: { ...targetInput.event, canonicalPath: "/someone-else" },
    })).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("accepts optional list and item IDs only when both belong to the account", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            accounts: [{
              documentId: "account-1",
              username: "tk2727",
              public_profile: "Yes",
              public_books: "Yes",
              locationTargets: [{
                documentId: "book-list-1",
                recommendationTargets: [{ documentId: "book-1" }],
              }],
            }],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const validator = new StrapiAnalyticsTargetValidator({
      strapiUrl: "https://cms.example",
      accessToken: "server-only-token",
      fetchImpl,
    });

    await expect(validator.validate(bookTargetInput)).resolves.toBe(true);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.variables).toEqual({
      accountId: "account-1",
      username: "tk2727",
      locationId: "book-list-1",
      recommendationId: "book-1",
    });
    expect(body.query).toContain("book_lists");
    expect(body.query).toContain("recommended_books");
    expect(body.query).toMatch(/locationTargets:\s*book_lists\([\s\S]*visibility:\s*\{\s*eq:\s*true\s*\}/);
  });

  it("validates a guide only through its published relation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: { accounts: [{
        documentId: "account-1",
        username: "tk2727",
        public_profile: "Yes",
        public_guides: "Yes",
        recommendationTargets: [{ documentId: "guide-1" }],
      }] } }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    const validator = new StrapiAnalyticsTargetValidator({
      strapiUrl: "https://cms.example",
      accessToken: "server-only-token",
      fetchImpl,
    });

    await expect(validator.validate({
      ...targetInput,
      eventId: "evt-target-guide-0001",
      recommendationId: "guide-1",
      event: {
        ...targetInput.event,
        page: "public-guides",
        canonicalPath: "/tk2727/guides",
      },
    })).resolves.toBe(true);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.query).toMatch(/recommendationTargets:\s*guides\([\s\S]*Visibility:\s*\{\s*eq:\s*true\s*\}/);
  });

  it("rejects a forged item ID even when the account and list are valid", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            accounts: [{
              documentId: "account-1",
              locationTargets: [{
                documentId: "book-list-1",
                recommendationTargets: [],
              }],
            }],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const validator = new StrapiAnalyticsTargetValidator({
      strapiUrl: "https://cms.example",
      accessToken: "server-only-token",
      fetchImpl,
    });

    await expect(validator.validate(bookTargetInput)).resolves.toBe(false);
  });

  it("does not reuse an account-only cache entry for a later forged entity ID", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { accounts: [{ documentId: "account-1", username: "tk2727", public_profile: "Yes" }] } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              accounts: [{
                documentId: "account-1",
                username: "tk2727",
                public_profile: "Yes",
                public_books: "Yes",
                locationTargets: [{
                  documentId: "book-list-1",
                  recommendationTargets: [],
                }],
              }],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    const validator = new StrapiAnalyticsTargetValidator({
      strapiUrl: "https://cms.example",
      accessToken: "server-only-token",
      fetchImpl,
    });

    await expect(validator.validate(targetInput)).resolves.toBe(true);
    await expect(validator.validate(bookTargetInput)).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("validates an item-only target with a filtered owning-list lookup", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            accounts: [{
              documentId: "account-1",
              username: "tk2727",
              public_profile: "Yes",
              public_books: "Yes",
              recommendationOwnerLists: [{ documentId: "book-list-1" }],
            }],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const validator = new StrapiAnalyticsTargetValidator({
      strapiUrl: "https://cms.example",
      accessToken: "server-only-token",
      fetchImpl,
    });

    await expect(
      validator.validate({ ...bookTargetInput, locationId: null }),
    ).resolves.toBe(true);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.query).toMatch(
      /recommended_books:\s*\{\s*documentId:\s*\{\s*eq:\s*\$recommendationId\s*\}/,
    );
    expect(body.query).toContain("pagination: { page: 1, pageSize: 1 }");
  });
});

describe("StrapiAnalyticsPublisher", () => {
  it("classifies only a synchronous pre-dispatch fetch failure as safely retryable", async () => {
    const publisher = new StrapiAnalyticsPublisher({
      strapiUrl: "https://cms.example", accessToken: "server-only-token",
      fetchImpl: (() => { throw new Error("request construction failed"); }) as typeof fetch,
    });
    await expect(publisher.publish(payload)).rejects.toMatchObject({
      name: "AnalyticsPublishDispatchError", safeToRetry: true,
    } satisfies Partial<AnalyticsPublishDispatchError>);
  });
  it("writes the normalized event server-side without any raw IP", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          data: {
            createPublicPageAnalytic: { documentId: "strapi-event-1" },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const publisher = new StrapiAnalyticsPublisher({
      strapiUrl: "https://cms.example",
      accessToken: "server-only-token",
      fetchImpl,
    });

    await expect(publisher.publish(payload)).resolves.toEqual({
      documentId: "strapi-event-1",
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://cms.example/graphql");
    expect(init.headers.Authorization).toBe("Bearer server-only-token");
    const body = JSON.parse(init.body);
    expect(body.variables.data).toEqual({
      Account_Id: "account-1",
      Location_Id: "list-1",
      Recommendation_Id: "item-1",
      Stats: [{ ...payload.event, eventId: "evt-adapter-0001" }],
    });
    expect(JSON.stringify(body)).not.toMatch(/ipAddress|rawIp|\"ip\"/i);
  });

  it("scopes reads by account and date on the server", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            publicPageAnalytics: [
              {
                Account_Id: "account-1",
                Location_Id: null,
                Recommendation_Id: null,
                Stats: [],
                createdAt: "2026-08-24T03:30:00.000Z",
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const publisher = new StrapiAnalyticsPublisher({
      strapiUrl: "https://cms.example/",
      accessToken: "server-only-token",
      fetchImpl,
    });

    const events = await publisher.readAccountEvents({
      accountId: "account-1",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.999Z",
    });

    expect(events).toHaveLength(1);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.variables).toEqual({
      accountId: "account-1",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.999Z",
      page: 1,
      pageSize: 100,
    });
    expect(body.query).toContain("Account_Id: { eq: $accountId }");
    expect(body.query).not.toContain("limit: -1");
  });
});

describe("verifyAnalyticsAccountOwnership", () => {
  it("uses the authenticated Strapi /users/me relation and allows only an owned account", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          id: 27,
          username: "tk2727",
          accounts: [{ documentId: "account-1" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      verifyAnalyticsAccountOwnership({
        strapiUrl: "https://cms.example",
        authorization: "Bearer visitor-owner-token",
        accountId: "account-1",
        fetchImpl,
      }),
    ).resolves.toBe(true);
    await expect(
      verifyAnalyticsAccountOwnership({
        strapiUrl: "https://cms.example",
        authorization: "Bearer visitor-owner-token",
        accountId: "other-account",
        fetchImpl,
      }),
    ).resolves.toBe(false);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://cms.example/api/users/me?populate=accounts",
    );
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer visitor-owner-token",
    );
  });
});

describe("resolveCountryFromIp", () => {
  it("returns a coarse uppercase country and rejects private/local addresses", () => {
    const lookup = vi.fn().mockReturnValue({ country: "in" });

    expect(resolveCountryFromIp("8.8.8.8", lookup)).toBe("IN");
    expect(resolveCountryFromIp("127.0.0.1", lookup)).toBeNull();
    expect(resolveCountryFromIp("10.1.2.3", lookup)).toBeNull();
    expect(resolveCountryFromIp("192.168.1.5", lookup)).toBeNull();
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
