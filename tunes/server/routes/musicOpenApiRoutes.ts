import { randomUUID } from "node:crypto";
import type { Express } from "express";
import {
  musicEnsureResponseOpenApiSchema,
  musicErrorOpenApiSchema,
  musicPrincipalResponseOpenApiSchema,
} from "../../shared/musicError";

type Schema = Record<string, unknown>;
type Security = Array<Record<string, never[]>>;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const requestIdParameter = { $ref: "#/components/parameters/XRequestId" } as const;
const originParameter = { $ref: "#/components/parameters/Origin" } as const;
const guestCapabilityOptional = { $ref: "#/components/parameters/GuestCapabilityOptional" } as const;
const guestCapabilityRequired = { $ref: "#/components/parameters/GuestCapabilityRequired" } as const;
const ownerSecurity: Security = [{ musicCredential: [] }];
const explorerSecurity: Security = [{ explorerProof: [] }];
const guestSecurity: Security = [{ guestCapability: [] }];

const pathParameter = (name: string, description: string, pattern = "^[1-9][0-9]*$") => ({
  name,
  in: "path" as const,
  required: true,
  description,
  schema: { type: "string", pattern },
});

const body = (schema: Schema, description: string) => ({
  required: true,
  description,
  content: { "application/json": { schema } },
});

const responseHeaders = (extra: Record<string, unknown> = {}) => ({
  "X-Request-Id": { $ref: "#/components/headers/XRequestId" },
  ...extra,
});

const success = (description: string, schema?: Schema, extraHeaders: Record<string, unknown> = {}, example?: unknown) => ({
  description,
  headers: responseHeaders(extraHeaders),
  ...(schema ? { content: { "application/json": { schema, ...(example === undefined ? {} : { examples: { success: { value: example } } }) } } } : {}),
});

const failure = (description: string, codes: string[], retryAfter = false) => ({
  description,
  headers: responseHeaders(retryAfter ? { "Retry-After": { $ref: "#/components/headers/RetryAfter" } } : {}),
  content: {
    "application/json": {
      schema: ref("MusicError"),
      examples: {
        failure: { value: { version: "music-error/v1", error: {
          code: codes[0], message: description, action: retryAfter ? "retry" : "none", retryable: retryAfter, requestId: "request-123",
        } } },
      },
    },
  },
  "x-error-codes": codes,
});

const ownerErrors = () => ({
  "400": failure("The request input is invalid.", ["REQUEST_INVALID"]),
  "401": failure("The C5 Music credential is missing, invalid, expired, or revoked.", ["AUTH_REQUIRED", "TOKEN_INVALID", "TOKEN_EXPIRED", "TOKEN_REVOKED"]),
  "403": failure("The Music identity is suspended or the exact request origin is not allowed.", ["IDENTITY_SUSPENDED", "ORIGIN_FORBIDDEN"]),
  "409": failure("The Music identity is pending deletion.", ["IDENTITY_PENDING_DELETION"]),
  "413": failure("The request body exceeds 64 KiB.", ["PAYLOAD_TOO_LARGE"]),
  "500": failure("A safe internal failure occurred.", ["INTERNAL_ERROR"]),
});

const ownerOperation = (options: {
  summary: string;
  status: "200" | "201" | "204";
  response?: Schema;
  request?: ReturnType<typeof body>;
  parameters?: unknown[];
  errors?: Record<string, unknown>;
  description?: string;
  origin?: boolean;
  success?: boolean;
}) => ({
  summary: options.summary,
  ...(options.description ? { description: options.description } : {}),
  security: ownerSecurity,
  parameters: [requestIdParameter, ...(options.origin ?? !(options.status === "200" && !options.request) ? [originParameter] : []), ...(options.parameters ?? [])],
  ...(options.request ? { requestBody: options.request } : {}),
  responses: {
    ...(options.success === false ? {} : { [options.status]: success(options.status === "204" ? "Mutation completed with no response body." : "Operation completed.", options.response) }),
    ...ownerErrors(),
    ...(options.errors ?? {}),
  },
  "x-origin-policy": options.origin ?? !(options.status === "200" && !options.request) ? "required-exact-allowlist-match" : "not-required-for-read",
});

const playlistId = pathParameter("playlistId", "Owner-predicated saved playlist identifier");
const songId = pathParameter("songId", "Owner-predicated song identifier");
const guestUrl = pathParameter("guestUrl", "Public playlist slug; never a capability", "^[A-Za-z0-9_-]{8,128}$");
const publicSlug = pathParameter("publicSlug", "Stable public Music resource slug; never a capability", "^[A-Za-z0-9_-]{8,128}$");
const accountDocumentId = {
  name: "accountDocumentId",
  in: "path" as const,
  required: true,
  description: "Stable Account document ID used only to discover an active public Music publication.",
  schema: { type: "string", minLength: 1, maxLength: 512 },
};
const idempotencyKeyParameter = {
  name: "Idempotency-Key", in: "header" as const, required: true,
  description: "Owner-scoped, issuance-timestamped UUIDv4 replay key for one atomic publication command. Keys older than 30 days are permanently retired.",
  schema: {
    type: "string",
    minLength: 65,
    maxLength: 65,
    pattern: "^tunes-share-v1-[0-9]{13}-[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89AaBb][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$",
  },
};
const queueIdempotencyKeyParameter = {
  name: "Idempotency-Key", in: "header" as const, required: true,
  description: "Opaque owner-scoped replay key for one atomic queue replacement. Exact same-key replay returns the stored response; different input conflicts.",
  schema: { type: "string", minLength: 1, maxLength: 128 },
};
const guestRequestIdempotencyKeyParameter = {
  name: "Idempotency-Key", in: "header" as const, required: true,
  description: "Opaque guest replay key retained for 24 hours. Exact same-key replay returns the acknowledgement; different canonical song input conflicts.",
  schema: { type: "string", minLength: 8, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" },
};
const playlistCreateIdempotencyKeyParameter = {
  name: "Idempotency-Key", in: "header" as const, required: true,
  description: "Opaque owner-scoped replay key for one saved-playlist create. Exact same-key replay returns the stored playlist; different input conflicts.",
  schema: { type: "string", minLength: 1, maxLength: 128 },
};
const playlistSongIdempotencyKeyParameter = {
  name: "Idempotency-Key", in: "header" as const, required: true,
  description: "Opaque owner-scoped replay key for one saved-playlist song insertion. Exact same-key replay returns the stored song; different playlist or song input conflicts.",
  schema: { type: "string", minLength: 1, maxLength: 128 },
};
const historyRemoveIdempotencyKeyParameter = {
  name: "Idempotency-Key", in: "header" as const, required: true,
  description: "Opaque owner-scoped replay key for one history-row removal. Exact same-key and target replay succeeds; a different target conflicts.",
  schema: { type: "string", minLength: 1, maxLength: 128 },
};

const lifecycleOperation = (summary: string, responseSchema = "MusicLifecycleResponse", includesIneligibleProof = false) => ({
  summary,
  description: "Bodyless Explorer identity-boundary operation. Browser owner, user, Account, document, username, and email selectors are forbidden.",
  security: explorerSecurity,
  parameters: [requestIdParameter],
  responses: {
    "200": success("Durable Music lifecycle status.", ref(responseSchema)),
    "400": failure("The bodyless lifecycle request is invalid.", ["REQUEST_INVALID"]),
    "401": failure("The authoritative Explorer proof is missing or invalid.", ["AUTH_REQUIRED", "AUTH_INVALID"]),
    ...(includesIneligibleProof ? {
      "403": failure("The authoritative Explorer identity is ineligible for reactivation.", ["IDENTITY_INELIGIBLE"]),
    } : {}),
    "409": failure("The lifecycle operation conflicts or can no longer be cancelled.", ["IDENTITY_CONFLICT", "LIFECYCLE_NOT_FOUND", "LIFECYCLE_CANCEL_FORBIDDEN"]),
    "429": failure("The identity boundary is rate limited.", ["RATE_LIMITED"], true),
    "500": failure("A safe internal failure occurred.", ["INTERNAL_ERROR"]),
    "502": failure("The authoritative Explorer response is malformed.", ["UPSTREAM_MALFORMED"]),
    "503": failure("The identity boundary is temporarily unavailable.", ["UPSTREAM_UNAVAILABLE", "DATABASE_UNAVAILABLE"], true),
  },
});

const paths = {
  "/api-docs": {
    get: {
      summary: "Read this live Music OpenAPI document",
      security: [],
      parameters: [requestIdParameter],
      responses: { "200": success("OpenAPI 3.1 document.", { type: "object" }) },
    },
  },
  "/api/music/identity/ensure": {
    post: {
      summary: "Mint a C5 local Music credential from one authoritative Explorer proof",
      description: "Bodyless endpoint. Browser owner/account/document selectors are forbidden.",
      security: explorerSecurity,
      parameters: [requestIdParameter],
      responses: {
        "200": success("Stable local identity and exact 600-second C5 credential.", ref("MusicIdentityEnsureResponse")),
        "400": failure("The bodyless identity request is invalid.", ["REQUEST_INVALID"]),
        "401": failure("The Explorer proof is missing or invalid.", ["AUTH_REQUIRED", "AUTH_INVALID"]),
        "403": failure("The Explorer identity is ineligible or suspended.", ["IDENTITY_INELIGIBLE", "ONBOARDING_INCOMPLETE", "IDENTITY_SUSPENDED"]),
        "409": failure("The identity is ambiguous, tombstoned, pending deletion, or conflicts.", ["ACCOUNT_AMBIGUOUS", "ACCOUNT_SWITCH_CONFLICT", "IDENTITY_CONFLICT", "IDENTITY_TOMBSTONED", "IDENTITY_PENDING_DELETION"]),
        "413": failure("The bodyless endpoint received a payload.", ["PAYLOAD_TOO_LARGE"]),
        "429": failure("The identity boundary is rate limited.", ["RATE_LIMITED"], true),
        "500": failure("A safe internal failure occurred.", ["INTERNAL_ERROR"]),
        "502": failure("The authoritative Explorer response is malformed.", ["UPSTREAM_MALFORMED"]),
        "503": failure("The identity boundary is temporarily unavailable.", ["UPSTREAM_UNAVAILABLE", "DATABASE_UNAVAILABLE", "ENTRY_DISABLED"], true),
      },
    },
  },
  "/api/music/identity/current": {
    get: ownerOperation({
      summary: "Resolve the current C5 local Music principal",
      status: "200",
      response: ref("MusicPrincipalResponse"),
    }),
  },
  "/api/music/identity/lifecycle/prepare": {
    post: lifecycleOperation("Prepare durable Music deletion and revoke live Music authority"),
  },
  "/api/music/identity/lifecycle/status": {
    get: lifecycleOperation("Read durable Music deletion status after reload"),
  },
  "/api/music/identity/lifecycle/boundary": {
    post: lifecycleOperation("Durably mark the upstream deletion-attempt boundary"),
  },
  "/api/music/identity/lifecycle/cancel": {
    post: lifecycleOperation("Cancel deletion before the upstream attempt boundary"),
  },
  "/api/music/identity/lifecycle/suspend": {
    post: lifecycleOperation("Suspend Music before Explorer account deactivation", "MusicSuspensionResponse"),
  },
  "/api/music/identity/lifecycle/resume": {
    post: lifecycleOperation("Reactivate Music when Explorer deactivation cannot be confirmed", "MusicReactivationResponse", true),
  },
  "/api/playlists": {
    get: ownerOperation({ summary: "List owner saved playlists", status: "200", response: { type: "array", items: ref("Playlist") } }),
    post: ownerOperation({ summary: "Create an owner saved playlist", status: "201", response: ref("Playlist"), request: body(ref("PlaylistInput"), "Saved playlist input"), parameters: [playlistCreateIdempotencyKeyParameter], errors: { "409": failure("The replay key was reused with different playlist input.", ["IDEMPOTENCY_CONFLICT"]) } }),
  },
  "/api/playlists/{playlistId}": {
    get: ownerOperation({ summary: "Read one owner saved playlist", status: "200", response: ref("Playlist"), parameters: [playlistId], errors: { "404": failure("The owner-predicated playlist was not found.", ["PUBLIC_NOT_FOUND"]) } }),
    patch: ownerOperation({ summary: "Update one owner saved playlist", status: "200", response: ref("Playlist"), request: body(ref("PlaylistInput"), "Saved playlist input"), parameters: [playlistId], errors: { "404": failure("The owner-predicated playlist was not found.", ["PUBLIC_NOT_FOUND"]) } }),
    delete: ownerOperation({ summary: "Delete one owner saved playlist", status: "204", parameters: [playlistId], errors: { "404": failure("The owner-predicated playlist was not found.", ["PUBLIC_NOT_FOUND"]) } }),
  },
  "/api/playlists/{playlistId}/songs": {
    post: ownerOperation({ summary: "Add a saved-playlist song", status: "201", response: ref("PlaylistSong"), request: body(ref("SongInput"), "Saved song input"), parameters: [playlistId, playlistSongIdempotencyKeyParameter], errors: { "404": failure("The owner-predicated playlist was not found.", ["PUBLIC_NOT_FOUND"]), "409": failure("The replay key was reused with different saved-song input.", ["IDEMPOTENCY_CONFLICT"]) } }),
  },
  "/api/playlists/{playlistId}/songs/{songId}": {
    delete: ownerOperation({ summary: "Remove a saved-playlist song", status: "204", parameters: [playlistId, songId], errors: { "404": failure("The owner-predicated song was not found.", ["PUBLIC_NOT_FOUND"]) } }),
  },
  "/api/playlists/{playlistId}/reorder": {
    patch: ownerOperation({ summary: "Reposition a saved-playlist song", status: "204", request: body(ref("SavedReorderInput"), "Saved song position"), parameters: [playlistId], errors: { "404": failure("The owner-predicated song was not found.", ["PUBLIC_NOT_FOUND"]) } }),
  },
  "/api/playlists/{playlistId}/visibility": {
    patch: ownerOperation({ summary: "Set saved-playlist guest visibility", status: "204", request: body(ref("VisibilityInput"), "Explicit guest visibility"), parameters: [playlistId], errors: { "404": failure("The owner-predicated playlist was not found.", ["PUBLIC_NOT_FOUND"]) } }),
  },
  "/api/playlist/songs": {
    get: ownerOperation({ summary: "List the owner queue", status: "200", response: { type: "array", items: ref("Song") } }),
    post: ownerOperation({ summary: "Add to the owner queue", status: "201", response: ref("Song"), request: body(ref("SongInput"), "Queue song input") }),
  },
  "/api/music/features": {
    get: ownerOperation({
      summary: "Resolve fail-closed runtime Music feature decisions for the verified account",
      status: "200",
      response: {
        type: "object",
        additionalProperties: false,
        required: ["ownerWorkspace", "guestWorkspace", "playlistImports", "exposureId", "expiresAt"],
        properties: {
          ownerWorkspace: { type: "boolean" }, guestWorkspace: { type: "boolean" }, playlistImports: { type: "boolean" },
          exposureId: { type: "string", minLength: 1, maxLength: 128 }, expiresAt: { type: "string", format: "date-time" },
        },
      },
      description: "Decisions expire within 60 seconds. Emergency kill switches override account allowlists and stable salted cohorts.",
      origin: true,
      errors: { "503": failure("Runtime Music decisions are temporarily unavailable and fail closed.", ["SERVICE_UNAVAILABLE"], true) },
    }),
  },
  "/api/music/queue/replace": {
    post: ownerOperation({
      summary: "Atomically replace the owner queue from saved playlist songs",
      status: "200",
      response: ref("QueueReplaceResponse"),
      request: body(ref("QueueReplaceInput"), "Expected revision and ordered owner-predicated saved-song sources"),
      parameters: [queueIdempotencyKeyParameter],
      errors: {
        "404": failure("An owner-predicated playlist or song was not found.", ["PUBLIC_NOT_FOUND"]),
        "409": failure("The queue revision is stale or the replay key conflicts.", ["QUEUE_REVISION_CONFLICT", "IDEMPOTENCY_CONFLICT"]),
        "503": failure("The queue replacement is temporarily unavailable.", ["DATABASE_UNAVAILABLE"], true),
      },
      description: "The server validates every playlist and saved song against the verified principal, replaces active queue rows in one transaction, increments the queue revision, and durably stores the exact result for replay for 24 hours. After the database-clock window has expired, the idempotency key may be reused.",
    }),
  },
  "/api/music/socket-ticket": {
    post: ownerOperation({
      summary: "Mint a purpose-limited ticket for one Music socket handshake",
      status: "200",
      response: {
        type: "object",
        additionalProperties: false,
        required: ["version", "ticket"],
        properties: {
          version: { type: "string", const: "music-socket-ticket/v1" },
          ticket: {
            type: "object",
            additionalProperties: false,
            required: ["token", "expiresAt"],
            properties: {
              token: { type: "string", minLength: 1 },
              expiresAt: { type: "integer", minimum: 0, description: "Unix seconds at which the ticket expires." },
            },
          },
        },
      },
      origin: true,
      description: "Ticket 6.3. The ticket carries the purpose claim 'music-socket' and expires 60 seconds after issue, so it is far shorter-lived than a Music credential. Verification is asymmetric and exact: the credential verifier rejects any token carrying a purpose, and the socket verifier rejects any token without this exact purpose, so neither can be presented where the other is expected. A client mints one per connection attempt, including every reconnect, and never reuses one.",
    }),
  },
  "/api/music/dashboard": {
    get: ownerOperation({ summary: "Read private owner playback state", status: "200", response: ref("Dashboard") }),
  },
  "/api/music/queue/append": {
    post: ownerOperation({
      summary: "Atomically append owner saved-playlist songs to the active queue",
      status: "200",
      response: ref("QueueReplaceResponse"),
      request: body(ref("QueueAppendInput"), "Expected revision and non-empty ordered owner-predicated saved-song sources"),
      parameters: [queueIdempotencyKeyParameter],
      errors: {
        "400": failure("The resulting queue exceeds its maximum size.", ["REQUEST_INVALID"]),
        "404": failure("An owner-predicated playlist or song was not found.", ["PUBLIC_NOT_FOUND"]),
        "409": failure("The queue revision is stale or the replay key conflicts.", ["QUEUE_REVISION_CONFLICT", "IDEMPOTENCY_CONFLICT"]),
        "503": failure("The queue append is temporarily unavailable.", ["DATABASE_UNAVAILABLE"], true),
      },
      description: "The server validates every source against the verified principal, preserves the active queue, appends the ordered saved songs in one transaction, increments the queue revision, and durably stores the exact result for same-key replay for 24 hours.",
    }),
  },
  "/api/music/guest-controls": {
    get: ownerOperation({ summary: "Read owner guest controls", status: "200", response: ref("GuestControls") }),
    patch: ownerOperation({ summary: "Update owner guest controls", status: "200", response: ref("GuestControls"), request: body(ref("GuestControlsUpdate"), "Complete guest control state; legacy four-field updates preserve queue visibility") }),
  },
  "/api/playlist/currently-playing": {
    post: ownerOperation({ summary: "Set or complete the owner playing song", status: "200", response: { oneOf: [ref("Song"), ref("PlaybackCommandResponse")] }, request: body(ref("PlayingInput"), "Song identifier or null to complete playback; new clients include the expected owner queue revision and the server advances it on success"), errors: {
      "204": success("Current playback completed with no response body."),
      "404": failure("The owner-predicated song was not found.", ["PUBLIC_NOT_FOUND"]),
      "409": failure("The queue or owner playback intent changed.", ["PLAYBACK_REVISION_CONFLICT", "PLAYBACK_QUEUE_REVISION_CONFLICT"]),
    } }),
  },
  "/api/playlist/songs/bulk": {
    delete: ownerOperation({ summary: "Remove up to 500 owner queue songs", status: "204", request: body(ref("BulkSongInput"), "Owner queue identifiers") }),
  },
  "/api/playlist/songs/{songId}": {
    delete: ownerOperation({ summary: "Remove one owner queue song", status: "204", parameters: [songId], errors: { "404": failure("The owner-predicated song was not found.", ["PUBLIC_NOT_FOUND"]) } }),
  },
  "/api/playlist/songs/{songId}/position": {
    patch: ownerOperation({ summary: "Reposition one owner queue song", status: "200", response: ref("Song"), request: body(ref("PositionInput"), "Non-negative queue position"), parameters: [songId], errors: { "404": failure("The owner-predicated song was not found.", ["PUBLIC_NOT_FOUND"]) } }),
  },
  "/api/playlist/history": {
    delete: ownerOperation({ summary: "Clear owner playback history", status: "204" }),
  },
  "/api/playlist/history/{songId}": {
    delete: ownerOperation({
      summary: "Durably remove one owner history row",
      status: "204",
      parameters: [songId, historyRemoveIdempotencyKeyParameter],
      errors: {
        "404": failure("The owner-predicated played song was not found.", ["PUBLIC_NOT_FOUND"]),
        "409": failure("The replay key was reused with a different history target.", ["IDEMPOTENCY_CONFLICT"]),
      },
      description: "Only played rows belonging to the verified owner can be removed. The same key and target replay as 204 for 24 hours.",
    }),
  },
  "/api/youtube/search": {
    post: ownerOperation({ summary: "Run bounded server-only YouTube search", status: "200", response: ref("YouTubeSearchResponse"), request: body(ref("YouTubeSearchInput"), "Search query and optional page token") }),
  },
  "/api/youtube/video-from-url": {
    post: ownerOperation({ summary: "Resolve one YouTube video URL", status: "200", response: ref("YouTubeVideo"), request: body(ref("YouTubeUrlInput"), "YouTube URL"), errors: { "404": failure("The video was not found.", ["PUBLIC_NOT_FOUND"]) } }),
  },
  "/api/music/publication": {
    post: ownerOperation({
      summary: "Atomically change owner Music publication mode",
      status: "200",
      response: ref("PublicationCommandResponse"),
      request: body(ref("PublicationCommandInput"), "Private, unlisted, or public mode"),
      parameters: [idempotencyKeyParameter],
      errors: {
        "409": failure("The identity is pending deletion, the key conflicts, or its replay window expired.", ["IDENTITY_PENDING_DELETION", "IDEMPOTENCY_CONFLICT", "PUBLICATION_REPLAY_EXPIRED"]),
        "429": failure("The owner has reached the quota of 100 replayable publication commands in 24 hours.", ["RATE_LIMITED"], true),
      },
      description: "One owner-predicated transaction changes discovery and rotates or revokes capability authority. Same-key same-request replay returns the exact response for 24 hours; after that the key is permanently retired without another mutation. Each owner may retain at most 100 replayable commands in that window. Only an unlisted success returns one in-memory capability; no capability material appears in the owner dashboard.",
    }),
  },
  "/api/music/paid/import": {
    post: ownerOperation({
      summary: "Entitlement-gated retired import boundary",
      status: "204",
      success: false,
      request: body({ type: "object", additionalProperties: false, required: ["source"], properties: { source: { type: "string", enum: ["youtube"] } } }, "Import source"),
      errors: {
        "403": failure("A current server-derived entitlement and exact origin are required.", ["ENTITLEMENT_REQUIRED", "IDENTITY_SUSPENDED", "ORIGIN_FORBIDDEN"]),
        "410": failure("The paid import operation is retired.", ["SURFACE_REMOVED"]),
      },
      description: "The browser cannot assert entitlement or refresh its source timestamp. The live operation currently returns typed 410 after entitlement authorization.",
    }),
  },
  "/api/music/entitlement": {
    get: ownerOperation({ summary: "Read server-derived entitlement freshness", status: "200", response: ref("EntitlementResponse"), description: "Core personal Music remains readable and mutable for every retained state. Local reads never refresh sourceUpdatedAt; paidMutation is true only for a fresh entitled state within the 600-second maximum freshness window. Eligible is not upgrade authority, and revoked is not lifecycle suspension or core read-only state." }),
  },
  "/api/music/public-profile/{accountDocumentId}": {
    get: {
      summary: "Discover one active public Music publication by stable Account identity",
      description: "The path value is the only accepted discovery input. Username, email, User ID, owner headers, query parameters, request bodies, private/unlisted publication, lifecycle state, tombstones, unknown identity, and collisions never establish authority and never disclose account state.",
      security: [],
      parameters: [requestIdParameter, accountDocumentId],
      responses: {
        "200": success("Active discoverable public Music descriptor.", ref("PublicMusicDescriptor"), {}, { version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "public_slug-123", revision: 7 } }),
        "400": failure("The descriptor request contains an unexpected authority input.", ["REQUEST_INVALID"]),
        "404": failure("The Music resource was not found.", ["PUBLIC_NOT_FOUND"]),
        "413": failure("The request exceeds 64 KiB.", ["PAYLOAD_TOO_LARGE"]),
        "429": failure("The public descriptor rate limit was exceeded.", ["RATE_LIMITED"], true),
        "500": failure("A safe internal failure occurred.", ["INTERNAL_ERROR"]),
        "503": failure("The Music service is temporarily unavailable.", ["SERVICE_UNAVAILABLE"], true),
      },
      "x-authority-policy": "stable-account-document-id-discovery-only",
    },
  },
  "/api/music/public-resource/v1/{publicSlug}": {
    get: {
      summary: "Read one strict bounded public Music resource",
      description: "Additive versioned resource for public or header-authorized unlisted access. Permission-protected fields are empty or null, collections are deterministically ordered and bounded, and the encoded response never exceeds 512 KiB. The legacy guest endpoint remains unchanged.",
      security: [{}, ...guestSecurity],
      parameters: [requestIdParameter, publicSlug, guestCapabilityOptional],
      responses: {
        "200": success("Strict music-public-resource/v1 snapshot. X-Robots-Tag is present only for unlisted capability access.", ref("PublicMusicResource"), { "X-Robots-Tag": { $ref: "#/components/headers/RobotsTag" } }, { version: "music-public-resource/v1", revision: 7, user: { username: "fixture-owner", venueName: "Fixture Venue" }, permissions: { allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: false, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false }, currentlyPlaying: null, queue: { items: [], total: 0, truncated: false }, recentlyPlayed: { items: [], total: 0, truncated: false }, playlists: { items: [], total: 0, truncated: false } }),
        "400": failure("The public resource request is invalid.", ["REQUEST_INVALID"]),
        "404": failure("The Music resource was not found.", ["PUBLIC_NOT_FOUND"]),
        "413": failure("The public resource exceeds its 512 KiB encoded contract.", ["PAYLOAD_TOO_LARGE"]),
        "429": failure("The public read rate limit was exceeded.", ["RATE_LIMITED"], true),
        "500": failure("A safe internal failure occurred.", ["INTERNAL_ERROR"]),
        "503": failure("The Music service is temporarily unavailable.", ["SERVICE_UNAVAILABLE"], true),
      },
      "x-publication-modes": ["public/discoverable", "unlisted capability; noindex/no-sitemap"],
      "x-max-encoded-bytes": 524288,
    },
  },
  "/api/explorers/analytics/events": {
    get: {
      summary: "Read historical Explorer analytics for the bearer-owned account",
      description: "Temporary historical Strapi read retained until Epic7.2; the authoritative Explorer bearer must own accountId. Inclusive fromDate/toDate calendar dates and an IANA timeZone form a window of at most93 calendar days. This is not the canonical Actor summary or Music credential flow.",
      security: explorerSecurity,
      parameters: [requestIdParameter,
        {name:"accountId",in:"query",required:true,schema:{type:"string",minLength:1,maxLength:128}},
        {name:"fromDate",in:"query",required:true,schema:{type:"string",format:"date"}},
        {name:"toDate",in:"query",required:true,schema:{type:"string",format:"date"}},
        {name:"timeZone",in:"query",required:true,schema:{type:"string"},description:"A valid IANA timezone; calendar dates must exist in this zone."}],
      responses: {
        "200": success("Historical scoped records; pagination is bounded to10000 records.",{type:"object",additionalProperties:false,required:["events"],properties:{events:{type:"array",maxItems:10000,items:{}}}}),
        "400": success("Invalid account/date/timezone scope.",{type:"object",required:["message"],properties:{message:{type:"string"}}}),
        "403": success("Authoritative bearer does not own the selected account.",{type:"object",required:["message"],properties:{message:{type:"string"}}}),
        "502": success("Historical identity/read provider is unavailable.",{type:"object",required:["message"],properties:{message:{type:"string"}}}),
      },
    },
  },
  "/api/explorers/analytics/music/{publicSlug}/events": {
    post: {
      summary: "Record one privacy-safe public Music product interaction",
      description: "The route resolves analytics ownership internally from current public or header-authorized unlisted publication state. The strict body accepts only normalized low-cardinality interaction names, bounded outcome properties, consent, an idempotency key, and approved campaign attribution.",
      security: [{}, ...guestSecurity],
      parameters: [requestIdParameter, publicSlug, guestCapabilityOptional],
      requestBody: body({
        type: "object",
        additionalProperties: false,
        required: ["consent", "eventId", "event"],
        properties: {
          consent: { type: "boolean", const: true },
          eventId: { type: "string", minLength: 8, maxLength: 128 },
          event: {
            oneOf: [
              { type: "object", additionalProperties: false, required: ["name", "route"], properties: { name: { const: "navigation_opened" }, route: { enum: ["friendly", "direct"] } } },
              { type: "object", additionalProperties: false, required: ["name", "section"], properties: { name: { const: "section_opened" }, section: { enum: ["player", "request", "queue", "playlists", "history"] } } },
              { type: "object", additionalProperties: false, required: ["name"], properties: { name: { const: "playlist_opened" } } },
              { type: "object", additionalProperties: false, required: ["name", "source"], properties: { name: { const: "song_selected" }, source: { enum: ["current", "queue", "playlist"] } } },
              { type: "object", additionalProperties: false, required: ["name", "source"], properties: { name: { const: "playback_started" }, source: { enum: ["current", "queue", "playlist"] } } },
              { type: "object", additionalProperties: false, required: ["name", "outcome"], properties: { name: { const: "request_submitted" }, outcome: { enum: ["accepted", "invalid", "rate_limited", "queue_full", "forbidden", "unavailable"] } } },
              { type: "object", additionalProperties: false, required: ["name", "reason"], properties: { name: { const: "unavailable" }, reason: { enum: ["not_public", "rate_limited", "service_unavailable"] } } },
            ],
          },
          utmParams: {
            type: "object", additionalProperties: false,
            properties: Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].map((name) => [name, { type: "string", minLength: 1, maxLength: 100 }])),
          },
        },
      }, "Strict privacy-safe product event"),
      responses: {
        "200": success("An exact replay was already committed.", { type: "object" }),
        "201": success("The interaction was committed.", { type: "object" }),
        "202": success("The same interaction is still being committed.", { type: "object" }),
        "400": success("The event shape is invalid.", { type: "object" }),
        "404": success("The Music page is unavailable.", { type: "object" }),
        "409": success("The event key conflicts with a different payload.", { type: "object" }),
        "429": success("The analytics write rate limit was exceeded.", { type: "object" }, { "Retry-After": { $ref: "#/components/headers/RetryAfter" } }),
        "502": success("Analytics ingestion is temporarily unavailable.", { type: "object" }),
      },
      "x-privacy-policy": "identity-free-body-server-resolved-owner",
    },
  },
  "/api/explorers/analytics/music-account/{accountDocumentId}/events": {
    post: {
      summary: "Record one privacy-safe friendly-route Music interaction",
      description: "The Account document identifier is URL path authority only. The server resolves one active local binding and the strict body contains no account, publication, capability, query, or media identity.",
      security: [{}],
      parameters: [requestIdParameter, { name: "accountDocumentId", in: "path", required: true, schema: { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9_-]+$" } }],
      requestBody: body({
        type: "object", additionalProperties: false, required: ["consent", "eventId", "event"],
        properties: {
          consent: { type: "boolean", const: true }, eventId: { type: "string", minLength: 8, maxLength: 128 },
          event: { oneOf: [
            { type: "object", additionalProperties: false, required: ["name", "route"], properties: { name: { const: "navigation_opened" }, route: { enum: ["friendly", "direct"] } } },
            { type: "object", additionalProperties: false, required: ["name", "section"], properties: { name: { const: "section_opened" }, section: { enum: ["player", "request", "queue", "playlists", "history"] } } },
            { type: "object", additionalProperties: false, required: ["name"], properties: { name: { const: "playlist_opened" } } },
            { type: "object", additionalProperties: false, required: ["name", "source"], properties: { name: { const: "song_selected" }, source: { enum: ["current", "queue", "playlist"] } } },
            { type: "object", additionalProperties: false, required: ["name", "source"], properties: { name: { const: "playback_started" }, source: { enum: ["current", "queue", "playlist"] } } },
            { type: "object", additionalProperties: false, required: ["name", "outcome"], properties: { name: { const: "request_submitted" }, outcome: { enum: ["accepted", "invalid", "rate_limited", "queue_full", "forbidden", "unavailable"] } } },
            { type: "object", additionalProperties: false, required: ["name", "reason"], properties: { name: { const: "unavailable" }, reason: { enum: ["not_public", "rate_limited", "service_unavailable"] } } },
          ] },
          utmParams: { type: "object", additionalProperties: false, properties: Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].map((name) => [name, { type: "string", minLength: 1, maxLength: 100 }])) },
        },
      }, "Strict identity-free product event"),
      responses: {
        "200": success("An exact replay was already committed.", { type: "object" }), "201": success("The interaction was committed.", { type: "object" }),
        "202": success("The same interaction is still being committed.", { type: "object" }), "400": success("The event shape is invalid.", { type: "object" }),
        "404": success("The Music page is unavailable.", { type: "object" }), "409": success("The event key conflicts with a different payload.", { type: "object" }),
        "429": success("The analytics write rate limit was exceeded.", { type: "object" }, { "Retry-After": { $ref: "#/components/headers/RetryAfter" } }), "502": success("Analytics ingestion is temporarily unavailable.", { type: "object" }),
      },
      "x-privacy-policy": "identity-free-body-server-resolved-owner",
    },
  },
  "/api/playlist/{guestUrl}": {
    get: {
      summary: "Read an explicit public or unlisted capability playlist",
      description: "Public discovery requires explicit publish. A valid public owner remains reachable with an empty playlists array when no playlist is visible. Unlisted responses set X-Robots-Tag: noindex, nofollow and never enter the sitemap. Unknown, private, suspended, pending, and revoked resources share the same safe 404.",
      security: [{}, ...guestSecurity],
      parameters: [requestIdParameter, guestUrl, guestCapabilityOptional],
      responses: {
        "200": success("Published playlist. X-Robots-Tag is present only for unlisted capability access.", ref("PublicPlaylist"), { "X-Robots-Tag": { $ref: "#/components/headers/RobotsTag" } }),
        "404": failure("The Music resource was not found.", ["PUBLIC_NOT_FOUND"]),
        "413": failure("The request exceeds 64 KiB.", ["PAYLOAD_TOO_LARGE"]),
        "429": failure("The public read rate limit was exceeded.", ["RATE_LIMITED"], true),
        "500": failure("A safe internal failure occurred.", ["INTERNAL_ERROR"]),
        "503": failure("The Music service is temporarily unavailable.", ["SERVICE_UNAVAILABLE"], true),
      },
      "x-publication-modes": ["public/discoverable", "unlisted capability; noindex/no-sitemap"],
    },
  },
  "/api/playlist/{guestUrl}/requests": {
    post: {
      summary: "Submit an allowlisted guest song request bound to this public slug",
      description: "Public publications use the slug; unlisted publications bind the header capability and slug atomically. Idempotency receipts, queue insertion, revision, and notification commit together for 24 hours. Secrets are forbidden from URLs, logs, sitemap, and analytics.",
      security: [{}, ...guestSecurity],
      parameters: [requestIdParameter, originParameter, guestUrl, guestCapabilityOptional, guestRequestIdempotencyKeyParameter],
      requestBody: body(ref("SongInput"), "Allowlisted guest song request"),
      responses: {
        "201": success("The request was accepted once; exact replays return the same safe acknowledgement.", { type: "object", additionalProperties: false, required: ["accepted"], properties: { accepted: { type: "boolean", enum: [true] } } }, {}, { accepted: true }),
        "409": failure("The idempotency key was reused with different canonical song input.", ["IDEMPOTENCY_CONFLICT"]),
        "400": failure("The request body is invalid.", ["REQUEST_INVALID"]),
        "403": failure("The capability, slug binding, lifecycle, permission, or origin is invalid.", ["GUEST_CAPABILITY_INVALID", "ORIGIN_FORBIDDEN"]),
        "413": failure("The request body exceeds 64 KiB or the bounded Music queue is full.", ["PAYLOAD_TOO_LARGE", "REQUEST_INVALID"]),
        "429": failure("The guest request rate limit was exceeded.", ["RATE_LIMITED"], true),
        "500": failure("A safe internal failure occurred.", ["INTERNAL_ERROR"]),
        "503": failure("The Music service is temporarily unavailable.", ["SERVICE_UNAVAILABLE"], true),
      },
      "x-origin-policy": "required-exact-allowlist-match",
    },
  },
  "/api/playlist/{guestUrl}/youtube/search": {
    post: {
      summary: "Run bounded YouTube search for an authorized guest request",
      description: "Public publications work anonymously. Unlisted publications use the optional per-slug capability header, which is hashed and resolved with the slug. No C5 owner credential or browser entitlement is accepted.",
      security: [{}, ...guestSecurity],
      parameters: [requestIdParameter, originParameter, guestUrl, guestCapabilityOptional],
      requestBody: body(ref("YouTubeSearchInput"), "Bounded guest search query"),
      responses: {
        "200": success("Bounded guest search results.", ref("YouTubeSearchResponse")),
        "400": failure("The search input is invalid.", ["REQUEST_INVALID"]),
        "403": failure("The capability, slug binding, lifecycle, permission, or origin is invalid.", ["GUEST_CAPABILITY_INVALID", "ORIGIN_FORBIDDEN"]),
        "413": failure("The request body exceeds 64 KiB.", ["PAYLOAD_TOO_LARGE"]),
        "429": failure("The guest lookup rate limit was exceeded.", ["RATE_LIMITED"], true),
        "500": failure("A safe internal failure occurred.", ["INTERNAL_ERROR"]),
      },
      "x-origin-policy": "required-exact-allowlist-match",
    },
  },
  "/api/playlist/{guestUrl}/youtube/video-from-url": {
    post: {
      summary: "Resolve one YouTube URL for an authorized guest request",
      description: "Public publications work anonymously. Unlisted publications use the optional per-slug capability header, which is hashed and resolved with the slug. No C5 owner credential or browser entitlement is accepted.",
      security: [{}, ...guestSecurity],
      parameters: [requestIdParameter, originParameter, guestUrl, guestCapabilityOptional],
      requestBody: body(ref("YouTubeUrlInput"), "Bounded guest YouTube URL"),
      responses: {
        "200": success("Resolved guest video.", ref("YouTubeVideo")),
        "400": failure("The YouTube URL is invalid.", ["REQUEST_INVALID"]),
        "403": failure("The capability, slug binding, lifecycle, permission, or origin is invalid.", ["GUEST_CAPABILITY_INVALID", "ORIGIN_FORBIDDEN"]),
        "404": failure("The video was not found.", ["PUBLIC_NOT_FOUND"]),
        "413": failure("The request body exceeds 64 KiB.", ["PAYLOAD_TOO_LARGE"]),
        "429": failure("The guest lookup rate limit was exceeded.", ["RATE_LIMITED"], true),
        "500": failure("A safe internal failure occurred.", ["INTERNAL_ERROR"]),
      },
      "x-origin-policy": "required-exact-allowlist-match",
    },
  },
} as const;

export const MUSIC_OPENAPI_DOCUMENT = {
  openapi: "3.1.0",
  info: {
    title: "Explorers Music API",
    version: "music-principal-v1",
    description: "Live C5 owner, guest capability, publication, and identity routes only.",
  },
  paths,
  components: {
    securitySchemes: {
      explorerProof: { type: "http", scheme: "bearer", bearerFormat: "Authoritative Explorer access token" },
      musicCredential: { type: "http", scheme: "bearer", bearerFormat: "C5 Music credential; 600-second TTL" },
      guestCapability: { type: "apiKey", in: "header", name: "X-Music-Guest-Capability", description: "Per-slug 256-bit guest secret; never place it in a URL." },
    },
    parameters: {
      XRequestId: { name: "X-Request-Id", in: "header", required: false, description: "Optional safe caller correlation ID; unsafe values are replaced.", schema: { type: "string", minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$" } },
      Origin: { name: "Origin", in: "header", required: true, description: "Exact configured browser origin. Missing, opaque, wildcard, or suffix matches are rejected.", schema: { type: "string", format: "uri" } },
      GuestCapabilityOptional: { name: "X-Music-Guest-Capability", in: "header", required: false, description: "Required only for unlisted capability access; omitted for explicit public discovery.", schema: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" } },
      GuestCapabilityRequired: { name: "X-Music-Guest-Capability", in: "header", required: true, description: "Capability for this exact guestUrl slug.", schema: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" } },
    },
    headers: {
      XRequestId: { description: "Request correlation ID matching a Music error envelope when present.", required: true, schema: { type: "string", minLength: 1, maxLength: 64 } },
      RetryAfter: { description: "Positive whole seconds before retry.", required: true, schema: { type: "string", pattern: "^[1-9][0-9]*$" } },
      RobotsTag: { description: "Present as noindex, nofollow for unlisted capability access; omitted for public discovery.", required: false, schema: { type: "string", const: "noindex, nofollow" } },
    },
    schemas: {
      MusicError: musicErrorOpenApiSchema,
      MusicIdentityEnsureResponse: musicEnsureResponseOpenApiSchema,
      MusicPrincipalResponse: musicPrincipalResponseOpenApiSchema,
      PublicMusicDescriptor: {
        type: "object",
        additionalProperties: false,
        required: ["version", "publication"],
        properties: {
          version: { type: "string", const: "music-public-descriptor/v1" },
          publication: {
            type: "object",
            additionalProperties: false,
            required: ["mode", "publicSlug", "revision"],
            properties: {
              mode: { type: "string", const: "public" },
              publicSlug: { type: "string", minLength: 8, maxLength: 128, pattern: "^[A-Za-z0-9_-]+$" },
              revision: { type: "integer", minimum: 0 },
            },
          },
        },
      },
      MusicLifecycleResponse: {
        type: "object", additionalProperties: false, required: ["version", "operation"], properties: {
          version: { type: "string", const: "music-lifecycle/v1" },
          operation: {
            type: "object", additionalProperties: false,
            required: [
              "operationId", "status", "phase", "state", "boundaryCrossed", "retryable", "deadLetter",
              "upstreamUserDocumentId", "upstreamAccountDocumentId",
            ],
            properties: {
              operationId: { type: "string", minLength: 1, maxLength: 128 },
              status: { type: "string", enum: ["pending_deletion", "suspended", "tombstoned", "not_present"] },
              phase: { type: "string", enum: ["prepared", "finalized"] },
              state: { type: "string", enum: ["completed", "requested", "running", "failed", "cancelled"] },
              boundaryCrossed: { type: "boolean" }, retryable: { type: "boolean" }, deadLetter: { type: "boolean" },
              upstreamUserDocumentId: { type: "string", minLength: 1, maxLength: 512 },
              upstreamAccountDocumentId: { type: "string", minLength: 1, maxLength: 512 },
            },
          },
        },
      },
      MusicSuspensionResponse: {
        type: "object", additionalProperties: false, required: ["version", "identity"], properties: {
          version: { type: "string", const: "music-lifecycle/v1" },
          identity: {
            type: "object", additionalProperties: false, required: ["status"], properties: {
              status: { type: "string", enum: ["suspended", "not_present"] },
            },
          },
        },
      },
      MusicReactivationResponse: {
        type: "object", additionalProperties: false, required: ["version", "identity"], properties: {
          version: { type: "string", const: "music-lifecycle/v1" },
          identity: {
            type: "object", additionalProperties: false, required: ["status"], properties: {
              status: { type: "string", enum: ["active", "not_present"] },
            },
          },
        },
      },
      PlaylistInput: { type: "object", additionalProperties: false, required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 120 }, description: { type: ["string", "null"], maxLength: 2_000 } } },
      SongInput: { type: "object", additionalProperties: false, required: ["youtubeId", "title", "artist", "thumbnailUrl"], properties: { youtubeId: { type: "string", minLength: 11, maxLength: 11, pattern: "^[A-Za-z0-9_-]{11}$" }, title: { type: "string", minLength: 1, maxLength: 1_024 }, artist: { type: "string", minLength: 1, maxLength: 1_024 }, thumbnailUrl: { type: "string", minLength: 1, maxLength: 2_048 } } },
      Song: { type: "object", additionalProperties: false, required: ["id", "userId", "youtubeId", "title", "artist", "thumbnailUrl", "position", "status", "playedAt"], properties: { id: { type: "integer", minimum: 1 }, userId: { type: "integer", minimum: 1 }, youtubeId: { type: "string", minLength: 11, maxLength: 11, pattern: "^[A-Za-z0-9_-]{11}$" }, title: { type: "string" }, artist: { type: "string" }, thumbnailUrl: { type: "string" }, position: { type: "integer", minimum: 0 }, status: { type: "string", enum: ["queued", "playing", "played"] }, playedAt: { type: ["string", "null"], format: "date-time" } } },
      QueueReplaceSource: { type: "object", additionalProperties: false, required: ["playlistId", "songId"], properties: { playlistId: { type: "integer", minimum: 1 }, songId: { type: "integer", minimum: 1 } } },
      QueueReplaceInput: { type: "object", additionalProperties: false, required: ["expectedRevision", "songs"], properties: { expectedRevision: { type: "integer", minimum: 0 }, songs: { type: "array", maxItems: 500, items: ref("QueueReplaceSource") } } },
      QueueAppendInput: { type: "object", additionalProperties: false, required: ["expectedRevision", "songs"], properties: { expectedRevision: { type: "integer", minimum: 0 }, songs: { type: "array", minItems: 1, maxItems: 500, items: ref("QueueReplaceSource") } } },
      QueueReplaceResponse: { type: "object", additionalProperties: false, required: ["version", "revision", "songs"], properties: { version: { type: "string", const: "music-queue/v1" }, revision: { type: "integer", minimum: 1 }, songs: { type: "array", items: ref("Song") } } },
      PlaylistSong: { type: "object", additionalProperties: false, required: ["id", "playlistId", "youtubeId", "title", "artist", "thumbnailUrl", "position", "addedAt"], properties: { id: { type: "integer", minimum: 1 }, playlistId: { type: "integer", minimum: 1 }, youtubeId: { type: "string", minLength: 11, maxLength: 11, pattern: "^[A-Za-z0-9_-]{11}$" }, title: { type: "string" }, artist: { type: "string" }, thumbnailUrl: { type: "string" }, position: { type: "integer", minimum: 0 }, addedAt: { type: "string", format: "date-time" } } },
      Playlist: { type: "object", additionalProperties: false, required: ["id", "userId", "name", "description", "isVisibleToGuests", "createdAt", "updatedAt", "songs"], properties: { id: { type: "integer", minimum: 1 }, userId: { type: "integer", minimum: 1 }, name: { type: "string" }, description: { type: ["string", "null"] }, isVisibleToGuests: { type: "boolean" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" }, songs: { type: "array", items: ref("PlaylistSong") } } },
      Dashboard: { type: "object", additionalProperties: false, required: ["queueRevision", "playbackRevision", "songs", "currentlyPlaying", "playedSongs", "publication", "guestControls"], properties: { queueRevision: { type: "integer", minimum: 0 }, playbackRevision: { type: "integer", minimum: 0 }, songs: { type: "array", items: ref("Song") }, currentlyPlaying: { oneOf: [ref("Song"), { type: "null" }] }, playedSongs: { type: "array", items: ref("Song") }, publication: { type: "object", additionalProperties: false, required: ["mode", "publicSlug"], properties: { mode: { type: "string", enum: ["private", "unlisted", "public"] }, publicSlug: { type: "string", minLength: 8, maxLength: 128, pattern: "^[A-Za-z0-9_-]+$" } } }, guestControls: ref("GuestControls") } },
      GuestControls: { type: "object", additionalProperties: false, required: ["allowSongRequests", "allowGuestPlayOnDevice", "allowPlaylistSharing", "allowRecentlyPlayedVisibility", "allowQueueVisibility"], properties: { allowSongRequests: { type: "boolean" }, allowGuestPlayOnDevice: { type: "boolean" }, allowPlaylistSharing: { type: "boolean" }, allowRecentlyPlayedVisibility: { type: "boolean" }, allowQueueVisibility: { type: "boolean" } } },
      GuestControlsUpdate: { type: "object", additionalProperties: false, required: ["allowSongRequests", "allowGuestPlayOnDevice", "allowPlaylistSharing", "allowRecentlyPlayedVisibility"], properties: { allowSongRequests: { type: "boolean" }, allowGuestPlayOnDevice: { type: "boolean" }, allowPlaylistSharing: { type: "boolean" }, allowRecentlyPlayedVisibility: { type: "boolean" }, allowQueueVisibility: { type: "boolean" } } },
      PublicMusicSong: {
        type: "object", additionalProperties: false,
        required: ["id", "youtubeId", "title", "artist", "thumbnailUrl", "position", "status", "playedAt"],
        properties: {
          id: { type: "string", minLength: 43, maxLength: 43, pattern: "^[A-Za-z0-9_-]{43}$" },
          youtubeId: { type: "string", minLength: 11, maxLength: 11, pattern: "^[A-Za-z0-9_-]{11}$" },
          title: { type: "string", minLength: 1, maxLength: 1_024 },
          artist: { type: "string", minLength: 1, maxLength: 1_024 },
          thumbnailUrl: { type: ["string", "null"], format: "uri", minLength: 1, maxLength: 2_048 },
          position: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
          status: { type: "string", enum: ["queued", "playing", "played", "saved"] },
          playedAt: { type: ["string", "null"], format: "date-time" },
        },
      },
      PublicMusicSongEnvelope100: {
        type: "object", additionalProperties: false, required: ["items", "total", "truncated"],
        properties: { items: { type: "array", maxItems: 100, items: ref("PublicMusicSong") }, total: { type: "integer", minimum: 0 }, truncated: { type: "boolean" } },
      },
      PublicMusicSongEnvelope50: {
        type: "object", additionalProperties: false, required: ["items", "total", "truncated"],
        properties: { items: { type: "array", maxItems: 50, items: ref("PublicMusicSong") }, total: { type: "integer", minimum: 0 }, truncated: { type: "boolean" } },
      },
      PublicMusicPlaylist: {
        type: "object", additionalProperties: false, required: ["id", "name", "description", "songs"],
        properties: {
          id: { type: "string", minLength: 43, maxLength: 43, pattern: "^[A-Za-z0-9_-]{43}$" },
          name: { type: "string", minLength: 1, maxLength: 120 },
          description: { type: ["string", "null"], maxLength: 2_000 },
          songs: ref("PublicMusicSongEnvelope50"),
        },
      },
      PublicMusicPlaylistEnvelope: {
        type: "object", additionalProperties: false, required: ["items", "total", "truncated"],
        properties: { items: { type: "array", maxItems: 20, items: ref("PublicMusicPlaylist") }, total: { type: "integer", minimum: 0 }, truncated: { type: "boolean" } },
      },
      PublicMusicResource: {
        type: "object", additionalProperties: false,
        required: ["version", "revision", "user", "permissions", "currentlyPlaying", "queue", "recentlyPlayed", "playlists"],
        properties: {
          version: { type: "string", const: "music-public-resource/v1" },
          revision: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
          user: { type: "object", additionalProperties: false, required: ["username", "venueName"], properties: { username: { type: "string", minLength: 1, maxLength: 255 }, venueName: { type: ["string", "null"], maxLength: 255 } } },
          permissions: ref("GuestControls"),
          currentlyPlaying: { oneOf: [ref("PublicMusicSong"), { type: "null" }] },
          queue: ref("PublicMusicSongEnvelope100"),
          recentlyPlayed: ref("PublicMusicSongEnvelope50"),
          playlists: ref("PublicMusicPlaylistEnvelope"),
        },
      },
      PublicTheme: { type: "object", additionalProperties: false, required: ["primary"], properties: { primary: { type: "string" } } },
      PublicUser: { type: "object", additionalProperties: false, required: ["id", "username", "guestUrl", "venueName", "theme", "allowSongRequests", "allowGuestPlayOnDevice", "allowPlaylistSharing", "allowRecentlyPlayedVisibility", "allowQueueVisibility"], properties: { id: { type: "integer", minimum: 1 }, username: { type: "string" }, guestUrl: { type: "string" }, venueName: { type: ["string", "null"] }, theme: { oneOf: [ref("PublicTheme"), { type: "null" }] }, allowSongRequests: { type: "boolean" }, allowGuestPlayOnDevice: { type: "boolean" }, allowPlaylistSharing: { type: "boolean" }, allowRecentlyPlayedVisibility: { type: "boolean" }, allowQueueVisibility: { type: "boolean" } } },
      PublicPlaylist: { type: "object", additionalProperties: false, required: ["songs", "currentlyPlaying", "playedSongs", "user", "allowGuestPlayOnDevice", "allowRecentlyPlayedVisibility", "allowQueueVisibility", "playlists"], properties: { songs: { type: "array", items: ref("Song") }, currentlyPlaying: { oneOf: [ref("Song"), { type: "null" }] }, playedSongs: { type: "array", items: ref("Song") }, user: ref("PublicUser"), allowGuestPlayOnDevice: { type: "boolean" }, allowRecentlyPlayedVisibility: { type: "boolean" }, allowQueueVisibility: { type: "boolean" }, playlists: { type: "array", items: ref("Playlist") } } },
      SavedReorderInput: { type: "object", additionalProperties: false, required: ["songId", "position"], properties: { songId: { type: "integer", minimum: 1 }, position: { type: "integer", minimum: 0 } } },
      VisibilityInput: { type: "object", additionalProperties: false, required: ["isVisibleToGuests"], properties: { isVisibleToGuests: { type: "boolean" } } },
      PlayingInput: { type: "object", additionalProperties: false, required: ["songId"], properties: { songId: { type: ["integer", "null"], minimum: 1 }, expectedRevision: { type: "integer", minimum: 0 }, expectedPlaybackRevision: { type: "integer", minimum: 0 } } },
      PlaybackCommandResponse: { type: "object", additionalProperties: false, required: ["version", "revision", "playbackRevision", "song"], properties: { version: { type: "string", const: "music-playback/v1" }, revision: { type: "integer", minimum: 1 }, playbackRevision: { type: "integer", minimum: 0 }, song: { oneOf: [ref("Song"), { type: "null" }] } } },
      BulkSongInput: { type: "object", additionalProperties: false, required: ["songIds"], properties: { songIds: { type: "array", minItems: 1, maxItems: 500, uniqueItems: true, items: { type: "integer", minimum: 1 } } } },
      PositionInput: { type: "object", additionalProperties: false, required: ["position"], properties: { position: { type: "integer", minimum: 0 } } },
      PublicationCommandInput: { type: "object", additionalProperties: false, required: ["mode"], properties: { mode: { type: "string", enum: ["private", "unlisted", "public"] } } },
      PublicationCommandResponse: {
        oneOf: (["private", "unlisted", "public"] as const).map((mode) => ({
          type: "object",
          additionalProperties: false,
          required: mode === "unlisted" ? ["version", "publication", "capability"] : ["version", "publication"],
          properties: {
            version: { const: "music-publication/v1" },
            publication: {
              type: "object", additionalProperties: false, required: ["mode", "publicSlug"], properties: {
                mode: { const: mode },
                publicSlug: { type: "string", minLength: 8, maxLength: 128, pattern: "^[A-Za-z0-9_-]+$" },
              },
            },
            ...(mode === "unlisted" ? { capability: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" } } : {}),
          },
        })),
      },
      EntitlementResponse: {
        type: "object",
        additionalProperties: false,
        required: ["state", "paidMutation", "coreRead", "coreMutation", "maxAgeSeconds"],
        properties: {
          state: {
            type: "string",
            enum: ["unknown", "included", "eligible", "entitled", "revoked"],
            description: "Authoritative premium-policy state. Every value retains universal core Music; only a fresh entitled state may grant paid mutation.",
          },
          sourceUpdatedAt: { type: "string", format: "date-time", description: "Authoritative policy-source timestamp; a local read never refreshes it." },
          paidMutation: { type: "boolean", description: "True only for a fresh entitled state; false for unknown, included, eligible, and revoked." },
          coreRead: { type: "boolean", const: true },
          coreMutation: { type: "boolean", const: true },
          maxAgeSeconds: { type: "integer", const: 600 },
        },
        allOf: [
          {
            if: { required: ["state"], properties: { state: { enum: ["unknown", "included", "eligible", "revoked"] } } },
            then: { properties: { paidMutation: { const: false } } },
          },
          {
            if: { required: ["paidMutation"], properties: { paidMutation: { const: true } } },
            then: { required: ["sourceUpdatedAt"] },
          },
        ],
      },
      YouTubeSearchInput: { type: "object", additionalProperties: false, required: ["query"], properties: { query: { type: "string", minLength: 1, maxLength: 200 }, pageToken: { type: "string", maxLength: 256 } } },
      YouTubeUrlInput: { type: "object", additionalProperties: false, required: ["url"], properties: { url: { type: "string", maxLength: 2_048 } } },
      YouTubeVideoId: { type: "object", additionalProperties: false, required: ["videoId"], properties: { videoId: { type: "string", pattern: "^[A-Za-z0-9_-]{11}$" } } },
      YouTubeThumbnail: { type: "object", additionalProperties: false, required: ["url"], properties: { url: { type: "string", maxLength: 2_048 } } },
      YouTubeThumbnails: { type: "object", additionalProperties: false, required: ["default"], properties: { default: ref("YouTubeThumbnail") } },
      YouTubeSnippet: { type: "object", additionalProperties: false, required: ["title", "channelTitle", "thumbnails"], properties: { title: { type: "string", maxLength: 1_024 }, channelTitle: { type: "string", maxLength: 1_024 }, thumbnails: ref("YouTubeThumbnails") } },
      YouTubeVideo: { type: "object", additionalProperties: false, required: ["id", "snippet"], properties: { id: ref("YouTubeVideoId"), snippet: ref("YouTubeSnippet") } },
      YouTubeSearchResponse: { type: "object", additionalProperties: false, required: ["items", "nextPageToken"], properties: { items: { type: "array", items: ref("YouTubeVideo") }, nextPageToken: { type: ["string", "null"] } } },
    },
  },
} as const;

export function setupMusicOpenApiRoutes(app: Express): void {
  app.get("/api-docs", (req, res) => {
    const supplied = req.get("x-request-id");
    const requestId = supplied && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(supplied) ? supplied : randomUUID();
    res.setHeader("X-Request-Id", requestId);
    res.status(200).json(MUSIC_OPENAPI_DOCUMENT);
  });
}
