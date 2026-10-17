import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Kind, parse, print, visit, type DocumentNode } from "graphql";
import { RECOMMENDATION_CATEGORY_IDS } from "../../explorers-earth/src/features/Profile/types/themeTypes.ts";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const PROFILE_STATE_VERSION = "music-fixture-profile-state/v1" as const;
const PROFILE_SNAPSHOT_VERSION = "music-fixture-profile-snapshot/v1" as const;
const FIXTURE_UPDATED_AT_EPOCH = Date.parse("2026-08-29T00:00:00.000Z");
const MAX_PROFILE_JSON_BYTES = 48 * 1024;
const MAX_CAPTURED_PROFILE_SNAPSHOTS = 128;

const operationSources = [
  ["tunes/scripts/legacy-profile-fixture-documents.txt", ["MusicIdentityEligibility"]],
  // Retired from the UI in step 8; the pre-migration snapshot still restores through it.
  ["tunes/scripts/legacy-profile-fixture-documents.txt", ["MusicPageEligibility"]],
  // Retired UI readers remain fixtures for the pre-migration Music identity snapshot.
  ["tunes/scripts/legacy-profile-fixture-documents.txt", ["CheckOnboardingStatus", "SidebarAccount", "user", "UsersPermissionsUser"]],
  ["explorers-earth/src/features/Settings/api/mutation.ts", ["UsersPermissionsUser", "UpdateAccount"]],
  ["explorers-earth/src/features/PublicHome/api/query.ts", ["PublicCategoryListCounts", "PublicAccountBasic", "PublicProfileData"]],
] as const;

const identityOperations = new Set([
  "MusicIdentityEligibility", "MusicPageEligibility", "CheckOnboardingStatus", "SidebarAccount", "user", "UsersPermissionsUser",
]);

const categoryRoots = new Map([
  ["GetPlacesLists", "recommendationLists"],
  ["GetMoviesLists", "movieLists"],
  ["GetBooksLists", "bookLists"],
  ["GetGamesLists", "gameLists"],
  ["GetAppsLists", "appLists"],
  ["GetProductsLists", "productLists"],
  ["GetPeopleLists", "personLists"],
  ["GetGuidesLists", "guides"],
]);

const gatewayCategories = new Map<string, readonly [string, string]>([
  ["places", ["GetPlacesLists", "recommendationLists"]],
  ["movies", ["GetMoviesLists", "movieLists"]],
  ["books", ["GetBooksLists", "bookLists"]],
  ["games", ["GetGamesLists", "gameLists"]],
  ["apps", ["GetAppsLists", "appLists"]],
  ["products", ["GetProductsLists", "productLists"]],
  ["people", ["GetPeopleLists", "personLists"]],
  ["guides", ["GetGuidesLists", "guides"]],
] as const);

function clone<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, canonicalValue(nested)]));
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function profileHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function withoutInjectedTypenames(document: DocumentNode): DocumentNode {
  return visit(document, {
    Field(node) {
      if (node.name.value === "__typename" && !node.alias
          && (node.arguments?.length ?? 0) === 0 && (node.directives?.length ?? 0) === 0) return null;
      return undefined;
    },
  });
}

function canonicalGraphql(source: string): { operation: string; signature: string } | undefined {
  try {
    const document = withoutInjectedTypenames(parse(source, { noLocation: true }));
    if (document.definitions.length !== 1) return undefined;
    const definition = document.definitions[0];
    if (definition.kind !== Kind.OPERATION_DEFINITION || !definition.name) return undefined;
    return { operation: definition.name.value, signature: print(document) };
  } catch {
    return undefined;
  }
}

function checkedInDocuments(relativePath: string): string[] {
  const source = readFileSync(resolve(repositoryRoot, relativePath), "utf8");
  return [...source.matchAll(/gql`([\s\S]*?)`/g)].map((match) => match[1]!);
}

function buildGraphqlRegistry(): Map<string, Set<string>> {
  const registry = new Map<string, Set<string>>();
  for (const [relativePath, expectedOperations] of operationSources) {
    const documents = checkedInDocuments(relativePath);
    for (const operation of expectedOperations) {
      const matches = documents.map(canonicalGraphql).filter((entry) => entry?.operation === operation);
      if (matches.length !== 1) throw new Error(`fixture GraphQL registry requires one checked-in ${operation} document`);
      const signatures = registry.get(operation) ?? new Set<string>();
      signatures.add(matches[0]!.signature);
      registry.set(operation, signatures);
    }
  }
  return registry;
}

const graphqlRegistry = buildGraphqlRegistry();

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value as Record<string, unknown>).sort().join("\0") === [...keys].sort().join("\0");
}

function boundedJson(value: unknown, depth = 0): boolean {
  if (depth > 10) return false;
  if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return true;
  if (typeof value === "string") return value.length <= 4_096;
  if (Array.isArray(value)) return value.length <= 100 && value.every((entry) => boundedJson(entry, depth + 1));
  if (!value || typeof value !== "object") return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 100
    && entries.every(([key, nested]) => /^[A-Za-z0-9_-]{1,128}$/.test(key)
      && !["__proto__", "prototype", "constructor"].includes(key)
      && boundedJson(nested, depth + 1));
}

function boundedString(value: unknown, nullable = false): boolean {
  return (nullable && value === null) || (typeof value === "string" && value.length <= 4_096);
}

const accountInputFields = new Set([
  "Bio", "Account_Name", "username", "Addresss", "Primary_Address", "Public_Profile_Address",
  "Feed_Data", "social_media", "Account_Type", "mobile_number_visibility", "mobile_number",
  "public_profile", "public_recommendations", "public_music", "public_movie", "public_guides",
  "public_books", "public_games", "public_apps", "public_products", "public_people",
  "pinned_nav_tabs", "auto_pinning",
]);
const publicPreferenceFields = new Set([
  "public_profile", "public_recommendations", "public_music", "public_movie", "public_guides",
  "public_books", "public_games", "public_apps", "public_products", "public_people",
]);

function validAccountInput(value: unknown, configuredUsername: string): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length === 0 || Object.keys(data).some((key) => !accountInputFields.has(key))
      || Buffer.byteLength(JSON.stringify(data)) > MAX_PROFILE_JSON_BYTES) return false;
  if ("Bio" in data && !boundedString(data.Bio, true)) return false;
  if ("Account_Name" in data && !boundedString(data.Account_Name)) return false;
  if ("username" in data && data.username !== configuredUsername) return false;
  if ("Account_Type" in data && !boundedString(data.Account_Type)) return false;
  if ("mobile_number" in data && !boundedString(data.mobile_number, true)) return false;
  if ("Public_Profile_Address" in data && !boundedString(data.Public_Profile_Address, true)) return false;
  if ("mobile_number_visibility" in data && typeof data.mobile_number_visibility !== "boolean") return false;
  if ("auto_pinning" in data && typeof data.auto_pinning !== "boolean") return false;
  if ("pinned_nav_tabs" in data && (!Array.isArray(data.pinned_nav_tabs)
      || data.pinned_nav_tabs.some((entry) => typeof entry !== "string" || entry.length > 64))) return false;
  if ([...publicPreferenceFields].some((key) => key in data && !["Yes", "No"].includes(String(data[key])))) return false;
  if ("Feed_Data" in data && !Array.isArray(data.Feed_Data)) return false;
  for (const key of ["Addresss", "Primary_Address", "Feed_Data", "social_media"] as const) {
    if (key in data && !boundedJson(data[key])) return false;
  }
  return true;
}

function timestamp(revision: number): string {
  return new Date(FIXTURE_UPDATED_AT_EPOCH + revision * 1_000).toISOString();
}

function exactUsernameFilter(variables: Record<string, unknown>, username: string): boolean {
  return exactKeys(variables, ["filters"])
    && exactKeys(variables.filters, ["username"])
    && exactKeys((variables.filters as Record<string, unknown>).username, ["eq"])
    && ((variables.filters as Record<string, any>).username.eq === username);
}

function categoryFixture(operation: string, namespace: string): unknown {
  const documentId = `${namespace}-${operation.replace(/^Get|Lists$/g, "").toLowerCase()}-list`;
  const base = { documentId, List_Name: `Fixture ${operation}`, slug: documentId,
    ...(operation === "GetBooksLists" ? { visibility: true } : { Visibility: true }) };
  if (operation === "GetPlacesLists") return { ...base, List_Name_Details: "Fixture places", recommended_places: [{ documentId: `${documentId}-item`, media_details: {}, Media: null, Place_Details: { name: "Fixture Place" } }] };
  if (operation === "GetMoviesLists") return { ...base, cover_image: null, recommended_movies: [{ documentId: `${documentId}-item`, poster_path: null }] };
  if (operation === "GetBooksLists") return { ...base, cover_image: null, recommended_books: [{ documentId: `${documentId}-item`, cover_url: null }] };
  if (operation === "GetGamesLists") return { ...base, cover_image: null, recommended_games: [{ documentId: `${documentId}-item`, cover_url: null, media_details: {} }] };
  if (operation === "GetAppsLists") return { ...base, cover_image: null, recommended_apps: [{ documentId: `${documentId}-item`, logo_url: null }] };
  if (operation === "GetProductsLists") return { ...base, cover_image: null, recommended_products: [{ documentId: `${documentId}-item`, logo_url: null, images: [] }] };
  if (operation === "GetPeopleLists") return { ...base, recommended_people: [{ documentId: `${documentId}-item`, avatar_path: null, media_details: {} }] };
  return { documentId, Title: "Fixture Guide", slug: documentId, Visibility: true, Guide_Media: null };
}

export function createFixtureProfileController(config: {
  username: string;
  accountDocumentId: string;
  userDocumentId: string;
  baseUser: Record<string, unknown>;
  baseAccount: Record<string, unknown>;
}) {
  const namespace = config.username.replace(/-owner$/, "");
  let revision = 0;
  let account = {
    ...clone(config.baseAccount),
    __typename: "Account",
    documentId: config.accountDocumentId,
    username: config.username,
    Account_Name: "Fixture Explorer",
    Account_Type: "Personal",
    Bio: "Disposable local profile fixture",
    Addresss: { city: "Fixture City" },
    Primary_Address: { address: "Fixture City" },
    Public_Profile_Address: "Fixture City",
    Feed_Data: [{
      id: `${namespace}-gallery-image`,
      documentId: `${namespace}-gallery-image`,
      url: "/images/tuneslogo.png",
      fileName: "tuneslogo.png",
      type: "image",
      aspectRatio: "1:1",
      width: 512,
      height: 512,
      uploadSource: "fixture",
    }],
    social_media: {
      theme_settings: {
        preset: "cinematic-dark",
        wallpaperMode: "banner-top",
        wallpaperUrl: "",
        accentColor: "#10B981",
        customTextColor: "",
        landingTab: "all-recommendations",
        visibleTabs: { recommendations: true, gallery: true, business: true },
        footerBranding: "enabled",
        recommendations: {
          layout: "shelves",
          categoryOrder: [...RECOMMENDATION_CATEGORY_IDS],
        },
      },
    },
    mobile_number: String(config.baseAccount.mobile_number ?? "+10000000000"),
    mobile_number_visibility: false,
    createdAt: timestamp(0),
    updatedAt: timestamp(0),
    profile_picture: null,
    bg_picture: null,
    public_profile: "Yes",
    public_recommendations: "Yes",
    public_music: "No",
    public_guides: "Yes",
    public_movie: "Yes",
    public_books: "Yes",
    public_games: "Yes",
    public_apps: "Yes",
    public_products: "Yes",
    public_people: "Yes",
    pinned_nav_tabs: [],
    auto_pinning: true,
  } as Record<string, unknown>;
  const captured = new Map<string, { snapshot: Record<string, unknown>; serialized: string }>();

  const currentAccount = () => clone(account);
  const publicAccount = () => {
    const source = currentAccount();
    const projection = Object.fromEntries([
      "username", "Account_Name", "Account_Type", "Primary_Address", "Bio", "bg_picture", "createdAt",
      "documentId", "profile_picture", "social_media", "Public_Profile_Address", "Feed_Data",
      "mobile_number_visibility", "public_profile", "public_recommendations", "public_music", "public_movie",
      "public_books", "public_guides", "public_games", "public_apps", "public_products", "public_people",
      "pinned_nav_tabs", "auto_pinning",
    ].map((key) => [key, source[key]]));
    if (source.mobile_number_visibility === true && typeof source.mobile_number === "string") {
      projection.mobile_number = source.mobile_number;
    }
    return projection;
  };
  const identity = () => ({
    ...clone(config.baseUser),
    __typename: "UsersPermissionsUser",
    id: config.userDocumentId,
    documentId: config.userDocumentId,
    username: config.username,
    createdAt: timestamp(0),
    updatedAt: account.updatedAt,
    accounts: [currentAccount()],
  });
  const safeState = () => ({
    version: PROFILE_STATE_VERSION,
    revision,
    stateHash: profileHash({ revision, account }),
  });
  const tupleMatches = (body: unknown, restore: boolean): body is Record<string, unknown> => {
    const keys = restore ? ["namespace", "username", "accountDocumentId", "userDocumentId", "snapshot"] : ["namespace", "username", "accountDocumentId", "userDocumentId"];
    return exactKeys(body, keys)
      && body.namespace === namespace
      && body.username === config.username
      && body.accountDocumentId === config.accountDocumentId
      && body.userDocumentId === config.userDocumentId;
  };

  const update = (data: Record<string, unknown>) => {
    revision += 1;
    account = { ...account, ...clone(data), documentId: config.accountDocumentId, username: config.username, updatedAt: timestamp(revision) };
  };

  return {
    account: currentAccount,
    identity,
    setPublicMusic(value: "Yes" | "No") {
      update({ public_music: value });
      return currentAccount();
    },
    publicGateway(path: string, method: string | undefined): { status: number; body: unknown } | undefined {
      const profilePath = `/api/explorers/v1/profiles/${encodeURIComponent(config.username)}`;
      if (path !== profilePath && !path.startsWith(`${profilePath}/recommendations/`)) return undefined;
      if (method !== "GET") return { status: 405, body: { error: "fixture public profile method denied" } };
      if (path === profilePath) return { status: 200, body: publicAccount() };
      const category = path.slice(`${profilePath}/recommendations/`.length);
      const projection = gatewayCategories.get(category);
      if (!projection) return { status: 404, body: { error: "fixture public category not found" } };
      const [operation, root] = projection;
      return { status: 200, body: { [root]: [categoryFixture(operation, namespace)] } };
    },
    privateResponse(path: string, method: string | undefined, body: unknown): { status: number; body: unknown } | undefined {
      if (path === "/__music-fixture/profile-state/snapshot") {
        if (method !== "POST") return { status: 405, body: { error: "fixture profile state operation denied" } };
        if (!tupleMatches(body, false)) return { status: 403, body: { error: "fixture profile state tuple denied" } };
        const snapshot = {
          version: PROFILE_SNAPSHOT_VERSION,
          namespace,
          username: config.username,
          accountDocumentId: config.accountDocumentId,
          userDocumentId: config.userDocumentId,
          revision,
          account: currentAccount(),
        };
        const serialized = stableJson(snapshot);
        const stateHash = profileHash({ revision, account });
        captured.set(stateHash, { snapshot: clone(snapshot), serialized });
        if (captured.size > MAX_CAPTURED_PROFILE_SNAPSHOTS) captured.delete(captured.keys().next().value!);
        return { status: 200, body: { ...safeState(), snapshot } };
      }
      if (path === "/__music-fixture/profile-state/restore") {
        if (method !== "POST") return { status: 405, body: { error: "fixture profile state operation denied" } };
        if (!tupleMatches(body, true)) return { status: 403, body: { error: "fixture profile state tuple denied" } };
        const rawSnapshot = body.snapshot;
        if (!rawSnapshot || typeof rawSnapshot !== "object" || Array.isArray(rawSnapshot)) {
          return { status: 400, body: { error: "fixture profile state snapshot invalid" } };
        }
        const snapshotRecord = rawSnapshot as Record<string, unknown>;
        const stateHash = profileHash({ revision: snapshotRecord.revision, account: snapshotRecord.account });
        const known = captured.get(stateHash);
        if (!known || known.serialized !== stableJson(rawSnapshot)) {
          return { status: 403, body: { error: "fixture profile state snapshot denied" } };
        }
        revision = Number(known.snapshot.revision);
        account = clone(known.snapshot.account as Record<string, unknown>);
        return { status: 200, body: { version: PROFILE_STATE_VERSION, restored: true, revision, stateHash } };
      }
      return undefined;
    },
    graphql(query: string, variables: Record<string, unknown>, options: { expectedRevision?: number } = {}): { status: number; body: unknown } {
      const parsed = canonicalGraphql(query);
      if (!parsed || !graphqlRegistry.get(parsed.operation)?.has(parsed.signature)) {
        return { status: 403, body: { error: "fixture GraphQL operation denied" } };
      }
      if (identityOperations.has(parsed.operation)) {
        if (!exactKeys(variables, ["documentId"]) || variables.documentId !== config.userDocumentId) {
          return { status: 403, body: { error: "fixture browser identity subject denied" } };
        }
        return { status: 200, body: { data: { usersPermissionsUser: identity() } } };
      }
      if (parsed.operation === "UpdateAccount") {
        if (options.expectedRevision !== undefined && options.expectedRevision !== revision) {
          return { status: 409, body: { error: "fixture profile revision stale" } };
        }
        if (!exactKeys(variables, ["documentId", "data"]) || variables.documentId !== config.accountDocumentId
            || !validAccountInput(variables.data, config.username)) {
          return { status: 403, body: { error: "fixture profile mutation denied" } };
        }
        update(variables.data);
        return { status: 200, body: { data: { updateAccount: currentAccount() } } };
      }
      if (parsed.operation === "PublicProfileData" || parsed.operation === "PublicAccountBasic") {
        if (!exactUsernameFilter(variables, config.username)) {
          return { status: 403, body: { error: "fixture public profile subject denied" } };
        }
        return { status: 200, body: { data: { accounts: [currentAccount()] } } };
      }
      if (parsed.operation === "PublicCategoryListCounts") {
        if (!exactKeys(variables, ["accountDocumentId"]) || variables.accountDocumentId !== config.accountDocumentId) {
          return { status: 403, body: { error: "fixture public profile subject denied" } };
        }
        return { status: 200, body: { data: Object.fromEntries([...categoryRoots.values()].map((root) => [root, [{ documentId: `${namespace}-${root}-count` }]])) } };
      }
      const categoryRoot = categoryRoots.get(parsed.operation);
      if (categoryRoot) {
        if (!exactKeys(variables, ["accountDocumentId"]) || variables.accountDocumentId !== config.accountDocumentId) {
          return { status: 403, body: { error: "fixture public profile subject denied" } };
        }
        return { status: 200, body: { data: { [categoryRoot]: [categoryFixture(parsed.operation, namespace)] } } };
      }
      return { status: 403, body: { error: "fixture GraphQL operation denied" } };
    },
  };
}
