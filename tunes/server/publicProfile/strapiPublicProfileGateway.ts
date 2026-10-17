import { type PublicCategory } from "./publicProfilePolicy";
import { publicProfileCursorStart } from "./publicProfileContract";

const PUBLIC_PLACE_SELECTION = "documentId Place_Details Recommendation_Type Contact_Name Places_Social_Link Users_Social_URL user_recommendation_note user_rating google_rating media_details Media{url alternativeText} recommendation_category{Category_Name}";

type FetchLike = typeof fetch;

type StrapiGraphqlResponse<T> = {
  data?: T;
  errors?: unknown[];
};

const SENSITIVE_PUBLIC_KEYS = new Set([
  "access_token", "api_key", "authorization", "cookie", "contact_number", "email",
  "formatted_phone_number", "mobile_number", "password", "secret", "token",
]);

/** GraphQL's field selection protects normal relations, but some Strapi fields
 * are JSON scalars. Redact sensitive nested keys before a public response can
 * leave the protected service. */
function redactPublicValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPublicValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SENSITIVE_PUBLIC_KEYS.has(key.toLowerCase()) && !key.startsWith("__"))
    .map(([key, nested]) => [key, redactPublicValue(nested)]));
}

function projectPublicSocialMedia(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    if (key.startsWith("__")) return [];
    if (entry && typeof entry === "object" && !Array.isArray(entry) && "visibility" in entry) {
      if ((entry as Record<string, unknown>).visibility !== true) return [];
      return [[key, redactPublicValue(entry)]];
    }
    if (SENSITIVE_PUBLIC_KEYS.has(key.toLowerCase())) return [];
    return [[key, redactPublicValue(entry)]];
  }));
}

const PUBLIC_ACCOUNT_SELECTION = `
  username
  Account_Name
  Account_Type
  Primary_Address
  Bio
  bg_picture { url alternativeText }
  createdAt
  documentId
  profile_picture { url alternativeText }
  social_media
  Public_Profile_Address
  Feed_Data
  mobile_number_visibility
  mobile_number
  public_profile
  public_recommendations
  public_music
  public_movie
  public_books
  public_guides
  public_games
  public_apps
  public_products
  public_people
  pinned_nav_tabs
  auto_pinning
`;

const PUBLIC_GUIDE_DETAIL_SELECTION = `documentId Title Description Guide_Type Visibility Estimated_Budget Budget_Type is_Multicity slug Guide_Media{url name alternativeText} Place_Details Number_Of_Days Category Best_Time_To_Visit Guide_Tags Tips_Notes Guide_Section_Details is_pinned pin_order display_order createdAt updatedAt guide_sections(pagination:{limit:$limit},sort:["Sequence:asc"]){documentId Title Sequence Description Timeline Transport Stay Recommendation_Activity Map_Details Packing_List Pre_Tasks Section_tags Budget}`;

type PublicGuideHeader = {
  documentId?: unknown;
  Title?: unknown;
  slug?: unknown;
};

type PublicGuidesResult = {
  guides?: unknown[];
};

const PUBLIC_NAVIGATION_COUNT_CONNECTIONS = {
  public_recommendations: "recommendationListsCount",
  public_movie: "movieListsCount",
  public_books: "bookListsCount",
  public_games: "gameListsCount",
  public_guides: "guidesCount",
  public_apps: "appListsCount",
  public_products: "productListsCount",
  public_people: "personListsCount",
} as const;

const PUBLIC_NAVIGATION_COUNT_SELECTION = `
  recommendationListsCount: recommendationLists_connection(filters:{account:{username:{eq:$username}},Visibility:{eq:true}}) { pageInfo { total } }
  movieListsCount: movieLists_connection(filters:{account:{username:{eq:$username}},Visibility:{eq:true}}) { pageInfo { total } }
  bookListsCount: bookLists_connection(filters:{account:{username:{eq:$username}},visibility:{eq:true}}) { pageInfo { total } }
  gameListsCount: gameLists_connection(filters:{account:{username:{eq:$username}},Visibility:{eq:true}}) { pageInfo { total } }
  guidesCount: guides_connection(filters:{account:{username:{eq:$username}},Visibility:{eq:true}}) { pageInfo { total } }
  appListsCount: appLists_connection(filters:{account:{username:{eq:$username}},Visibility:{eq:true}}) { pageInfo { total } }
  productListsCount: productLists_connection(filters:{account:{username:{eq:$username}},Visibility:{eq:true}}) { pageInfo { total } }
  personListsCount: personLists_connection(filters:{account:{username:{eq:$username}},Visibility:{eq:true}}) { pageInfo { total } }
`;

const hasGuide = (value: PublicGuidesResult): boolean => Array.isArray(value.guides) && value.guides.length > 0;
const emptyGuides = (): PublicGuidesResult => ({ guides: [] });
const legacyGuideTitleSlug = (title: string): string => title.toLowerCase().replace(/\s+/g, "-");

export class StrapiPublicProfileGateway {
  constructor(private readonly options: { origin: string; token: string; fetchImpl: FetchLike }) {}

  private async request<T>(query: string, variables: Record<string, unknown>, redact = true, maxAttempts = 2, timeoutMs = 4_000): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await this.options.fetchImpl(`${this.options.origin}/graphql`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.options.token}` },
          body: JSON.stringify({ query, variables }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("PUBLIC_PROFILE_UPSTREAM_FAILED");
        const body = await response.json() as StrapiGraphqlResponse<T>;
        if (body.errors?.length || body.data === undefined || body.data === null) {
          throw new Error("PUBLIC_PROFILE_UPSTREAM_FAILED");
        }
        return (redact ? redactPublicValue(body.data) : body.data) as T;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error("PUBLIC_PROFILE_UPSTREAM_FAILED", { cause: lastError });
  }

  async resolveCategory(username: string, category: PublicCategory, limit: number, cursor?: string): Promise<unknown> {
    const documents: Record<PublicCategory, string> = {
      places: `recommendationLists(filters:{account:{username:{eq:$username}},Visibility:{eq:true}},sort:["display_order:asc"],pagination:{limit:$limit}){documentId List_Name slug Visibility is_pinned pin_order List_Name_Details recommended_places(sort:["createdAt:asc"],pagination:{limit:24}){${PUBLIC_PLACE_SELECTION}}}`,
      movies: "movieLists(filters:{account:{username:{eq:$username}},Visibility:{eq:true}},sort:[\"display_order:asc\"],pagination:{limit:$limit}){documentId List_Name list_description slug Visibility cover_image{url alternativeText} display_order top_picks_heading recommended_movies(sort:[\"display_order:asc\"],pagination:{limit:12}){documentId tmdb_id media_type title poster_path backdrop_path year genres tmdb_rating user_rating overview watch_providers is_pinned pin_order user_recommendation_note cast_details media_details Media{documentId url caption}}}",
      books: "bookLists(filters:{account:{username:{eq:$username}},visibility:{eq:true}},sort:[\"display_order:asc\"],pagination:{limit:$limit}){documentId List_Name list_description slug visibility cover_image{url alternativeText} display_order top_reads_heading recommended_books(sort:[\"display_order:asc\"],pagination:{limit:12}){documentId volume_id title subtitle authors year cover_url cover_url_large subjects google_rating user_rating description user_recommendation_note buy_links is_pinned pin_order media_details Media{documentId url caption}}}",
      games: "gameLists(filters:{account:{username:{eq:$username}},Visibility:{eq:true}},sort:[\"display_order:asc\"],pagination:{limit:$limit}){documentId List_Name list_description slug Visibility cover_image{url alternativeText} top_picks_heading recommended_games(sort:[\"display_order:asc\"],pagination:{limit:12}){documentId igdb_id title cover_url summary release_year platforms genres screenshot_ids media_details igdb_rating user_rating is_pinned pin_order Media{documentId url} game_categories{documentId genre_name}}}",
      guides: "guides(filters:{account:{username:{eq:$username}},Visibility:{eq:true}},sort:[\"display_order:asc\"],pagination:{limit:$limit}){documentId Title Description Guide_Type Visibility Estimated_Budget Budget_Type is_Multicity slug Guide_Media{url name alternativeText} Place_Details Number_Of_Days Category Best_Time_To_Visit Guide_Tags Tips_Notes Guide_Section_Details is_pinned pin_order display_order createdAt updatedAt}",
      apps: "appLists(filters:{account:{username:{eq:$username}},Visibility:{eq:true}},sort:[\"display_order:asc\"],pagination:{limit:$limit}){documentId List_Name list_description slug Visibility cover_image{url alternativeText} top_apps_heading recommended_apps(sort:[\"display_order:asc\"],pagination:{limit:12}){documentId app_url title description logo_url developer platforms price_tier download_url is_pinned display_order screenshots user_recommendation_note user_rating pin_order app_category{documentId name slug}}}",
      products: "productLists(filters:{account:{username:{eq:$username}},Visibility:{eq:true}},sort:[\"display_order:asc\"],pagination:{limit:$limit}){documentId List_Name list_description slug Visibility cover_image{url alternativeText} top_products_heading recommended_products(sort:[\"display_order:asc\"],pagination:{limit:12}){documentId product_url title logo_url brand price currency buy_url images description specifications user_recommendation_note user_rating is_pinned pin_order product_category{documentId name slug}}}",
      people: "personLists(filters:{account:{username:{eq:$username}},Visibility:{eq:true}},sort:[\"display_order:asc\"],pagination:{limit:$limit}){documentId List_Name list_description slug Visibility cover_image{url alternativeText} top_people_heading:top_picks_heading recommended_people(sort:[\"display_order:asc\"],pagination:{limit:12}){documentId name full_name:name username_handle handle:username_handle headline location avatar_path avatar_url:avatar_path media_details primary_platform platform:primary_platform social_urls skills_tags user_recommendation_note user_rating is_pinned pin_order people_category{documentId Category_name}}}",
    };
    return this.request(
      `query PublicCategory($username: String!, $limit: Int!, $start: Int!) { ${documents[category].replace("pagination:{limit:$limit}", "pagination:{start:$start,limit:$limit}")} }`,
      { username, limit, start: publicProfileCursorStart(cursor) },
    );
  }

  private async resolveGuideByDocumentId(
    username: string,
    documentId: string,
    limit: number,
    start: number,
  ): Promise<PublicGuidesResult> {
    return this.request<PublicGuidesResult>(
      `query PublicGuideDocumentDetail($username: String!, $documentId: ID!, $limit: Int!, $start: Int!) { guides(filters:{account:{username:{eq:$username}},documentId:{eq:$documentId},Visibility:{eq:true}},pagination:{limit:1}){${PUBLIC_GUIDE_DETAIL_SELECTION.replace("pagination:{limit:$limit}", "pagination:{start:$start,limit:$limit}")}} }`,
      { username, documentId, limit, start },
    );
  }

  private async resolveLegacyGuideTitle(
    username: string,
    slug: string,
    limit: number,
    start: number,
  ): Promise<PublicGuidesResult> {
    const candidates = new Map<string, PublicGuideHeader>();
    let headerStart = 0;
    let returnedHeaders = 0;
    let reachedTerminalPage = false;

    for (let requestCount = 0; requestCount < 6; requestCount += 1) {
      const headerLimit = Math.min(24, 101 - returnedHeaders);
      const data = await this.request<{ guides?: PublicGuideHeader[] }>(
        `query PublicGuideHeaders($username: String!, $start: Int!, $limit: Int!) { guides(filters:{account:{username:{eq:$username}},Visibility:{eq:true}},sort:["documentId:asc"],pagination:{start:$start,limit:$limit}){documentId Title slug} }`,
        { username, start: headerStart, limit: headerLimit },
        true,
        1,
      );
      const page = Array.isArray(data.guides) ? data.guides : [];
      if (page.length === 0) {
        reachedTerminalPage = true;
        break;
      }

      returnedHeaders += page.length;
      if (returnedHeaders >= 101) return emptyGuides();
      headerStart += page.length;

      for (const header of page) {
        if (
          typeof header.documentId === "string"
          && typeof header.Title === "string"
          && legacyGuideTitleSlug(header.Title) === slug
        ) {
          candidates.set(header.documentId, header);
        }
      }
    }

    if (!reachedTerminalPage || candidates.size !== 1) return emptyGuides();
    const documentId = candidates.keys().next().value;
    if (typeof documentId !== "string") return emptyGuides();
    return this.resolveGuideByDocumentId(username, documentId, limit, start);
  }

  async resolveDetail(username: string, category: PublicCategory, slug: string, limit: number, cursor?: string): Promise<unknown> {
    const documents: Record<PublicCategory, string> = {
      places: `recommendationLists(filters:{account:{username:{eq:$username}},slug:{eq:$slug},Visibility:{eq:true}},pagination:{limit:1}){documentId List_Name List_Name_Details slug Visibility is_pinned pin_order recommended_places(sort:["createdAt:asc"],pagination:{limit:$limit}){${PUBLIC_PLACE_SELECTION}}}`,
      movies: `movieLists(filters:{account:{username:{eq:$username}},slug:{eq:$slug},Visibility:{eq:true}},pagination:{limit:1}){documentId List_Name list_description slug Visibility cover_image{url alternativeText} display_order top_picks_heading recommended_movies(sort:["display_order:asc"],pagination:{limit:$limit}){documentId tmdb_id media_type title poster_path backdrop_path year genres tmdb_rating user_rating overview watch_providers is_pinned pin_order user_recommendation_note cast_details media_details Media{documentId url caption}}}`,
      books: `bookLists(filters:{account:{username:{eq:$username}},slug:{eq:$slug},visibility:{eq:true}},pagination:{limit:1}){documentId List_Name list_description slug visibility cover_image{url alternativeText} display_order top_reads_heading recommended_books(sort:["display_order:asc"],pagination:{limit:$limit}){documentId volume_id title subtitle authors year cover_url cover_url_large subjects google_rating user_rating description user_recommendation_note buy_links is_pinned pin_order media_details Media{documentId url caption}}}`,
      games: `gameLists(filters:{account:{username:{eq:$username}},slug:{eq:$slug},Visibility:{eq:true}},pagination:{limit:1}){documentId List_Name list_description slug Visibility cover_image{url alternativeText} top_picks_heading recommended_games(sort:["display_order:asc"],pagination:{limit:$limit}){documentId igdb_id title cover_url summary release_year platforms genres screenshot_ids media_details igdb_rating user_rating is_pinned pin_order Media{documentId url} game_categories{documentId genre_name}}}`,
      guides: `guides(filters:{account:{username:{eq:$username}},slug:{eq:$slug},Visibility:{eq:true}},pagination:{limit:1}){${PUBLIC_GUIDE_DETAIL_SELECTION}}`,
      apps: `appLists(filters:{account:{username:{eq:$username}},slug:{eq:$slug},Visibility:{eq:true}},pagination:{limit:1}){documentId List_Name list_description slug Visibility cover_image{url alternativeText} top_apps_heading recommended_apps(sort:["display_order:asc"],pagination:{limit:$limit}){documentId app_url title description logo_url developer platforms price_tier download_url is_pinned display_order screenshots user_recommendation_note user_rating pin_order app_category{documentId name slug}}}`,
      products: `productLists(filters:{account:{username:{eq:$username}},slug:{eq:$slug},Visibility:{eq:true}},pagination:{limit:1}){documentId List_Name list_description slug Visibility cover_image{url alternativeText} top_products_heading recommended_products(sort:["display_order:asc"],pagination:{limit:$limit}){documentId product_url title logo_url brand price currency buy_url images description specifications user_recommendation_note user_rating is_pinned pin_order product_category{documentId name slug}}}`,
      people: `personLists(filters:{account:{username:{eq:$username}},slug:{eq:$slug},Visibility:{eq:true}},pagination:{limit:1}){documentId List_Name list_description slug Visibility cover_image{url alternativeText} top_people_heading:top_picks_heading recommended_people(sort:["display_order:asc"],pagination:{limit:$limit}){documentId name full_name:name username_handle handle:username_handle headline location avatar_path avatar_url:avatar_path media_details primary_platform platform:primary_platform social_urls skills_tags user_recommendation_note user_rating is_pinned pin_order people_category{documentId Category_name}}}`,
    };
    const start = publicProfileCursorStart(cursor);
    const exact = await this.request<unknown>(
      `query Public${category}Detail($username: String!, $slug: String!, $limit: Int!, $start: Int!) { ${documents[category].replace("pagination:{limit:$limit}", "pagination:{start:$start,limit:$limit}")} }`,
      { username, slug, limit, start },
    );
    if (category !== "guides") return exact;
    const exactGuide = exact as PublicGuidesResult;
    if (hasGuide(exactGuide)) return exactGuide;

    const direct = await this.resolveGuideByDocumentId(username, slug, limit, start);
    if (hasGuide(direct)) return direct;
    return this.resolveLegacyGuideTitle(username, slug, limit, start);
  }

  async resolveAccount(username: string): Promise<Record<string, unknown> | undefined> {
    const data = await this.request<{ accounts?: Record<string, unknown>[] }>(
      `query PublicAccount($username: String!) { accounts(filters: { username: { eq: $username } }, pagination: { limit: 1 }) { ${PUBLIC_ACCOUNT_SELECTION} } }`,
      { username },
      false,
    );
    const account = data.accounts?.[0];
    if (!account) return undefined;
    const projected = redactPublicValue(account) as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(account, "social_media")) {
      projected.social_media = projectPublicSocialMedia(account.social_media);
    }
    try {
      const countData = await this.request<Record<string, unknown>>(
        `query PublicNavigationCounts($username: String!) { ${PUBLIC_NAVIGATION_COUNT_SELECTION} }`,
        { username },
        true,
        1,
        250,
      );
      const navigationCounts = Object.entries(PUBLIC_NAVIGATION_COUNT_CONNECTIONS).map(([tabId, responseKey]) => {
        const connection = countData[responseKey] as { pageInfo?: { total?: unknown } } | undefined;
        const total = connection?.pageInfo?.total;
        return [tabId, Number.isSafeInteger(total) && Number(total) >= 0 ? total : undefined] as const;
      });
      if (navigationCounts.every(([, total]) => total !== undefined)) {
        projected.public_navigation_counts = Object.fromEntries(navigationCounts);
      }
    } catch {
      // Counts improve auto-pin ordering but are never part of shell readiness.
    }
    if (account.mobile_number_visibility === true && typeof account.mobile_number === "string") {
      projected.mobile_number = account.mobile_number;
    }
    return projected;
  }
}
