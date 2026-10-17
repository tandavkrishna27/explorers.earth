# Analytics Reliability and Public Music Completion Design

**Date:** 2026-08-28  
**Branch:** `codex/profile-settings-tabs-rebase-20260828`  
**PR:** #103  
**Status:** Proposed for user review

## Goal

Make dashboard analytics truthful and timezone-safe, and complete Music as a secure, dedicated public-profile destination whose playlists, player, queue, history, requests, and guest permissions behave consistently across dashboard and public surfaces.

## Product Decisions

1. The dashboard Home card reports a bounded recent period, not an unbounded all-time raw-event count. The displayed label and requested interval must agree.
2. Analytics date inputs represent calendar dates, not UTC instants. Date-only state remains `YYYY-MM-DD` until the API boundary.
3. Music remains a dedicated public navigation destination. It is not a Strapi recommendation-list category and does not participate in recommendation category ordering.
4. The friendly public route is `/{username}/music` and renders inside the existing public profile shell.
5. `/music/share/{publicSlug}` remains the canonical direct-share surface. Unlisted Music is accessible only through its capability-bearing share URL and is never advertised in public navigation.
6. Username lookup is presentation routing only. Local Tunes authorizes public Music using its stable Strapi account binding, publication state, opaque public slug, and optional unlisted capability.
7. Dashboard guest-control changes and owner queue/player changes update an already-open public Music page without a manual refresh.
8. Local Tunes remains authoritative for every guest permission. The browser must never be the only enforcement layer.
9. No Strapi server code changes and no Redis dependency are required.

## Existing System

### Analytics

- Dashboard Home currently requests raw analytics from the Unix epoch through now.
- Local Tunes rejects ranges longer than 93 inclusive calendar days.
- Failure is contained by displaying an empty event collection, which makes the Home count incorrectly appear as zero.
- Analytics custom date inputs currently pass browser date strings through `new Date(value)`, which treats `YYYY-MM-DD` as UTC and can shift the selected calendar day in non-UTC time zones.

### Music owner system

The authenticated Music dashboard already supports:

- private, unlisted, and public publication modes;
- playlist creation, editing, visibility, ordering, and queue replacement;
- owner playback and queue operations;
- five guest controls;
- Local Tunes identity bound to both `strapi_user_document_id` and `strapi_account_document_id`.

### Music public system

Local Tunes already returns permission-filtered public resources. The current public React page implements shared playlists and optional queue visibility, but does not implement guest-device playback, song requests, recently played, or live synchronization. Public profile navigation intentionally excludes the retired mutable-username Music route. The only active public Music route is `/music/share/{publicSlug}`.

## Architecture

### 1. Bounded Home analytics

The Home dashboard requests one recent interval within the existing 93-day backend contract. The UI uses a human-readable label such as `Views · last 90 days`, calculated from the same date-range utility used to build the request.

The request failure state must not masquerade as a real zero. The card distinguishes:

- loading;
- loaded zero;
- loaded non-zero;
- temporarily unavailable.

A true all-time summary is a separate future read model, not part of this PR. It would use server-side aggregate counters or daily buckets rather than downloading historical raw events.

### 2. Date-only analytics range model

The analytics filter stores custom dates as validated `YYYY-MM-DD` strings. Shared utilities provide:

- `formatLocalDateInput(date): string`;
- `parseLocalDateInput(value): Date | null`;
- inclusive-day calculation;
- local start-of-day and end-of-day API instants.

Parsing splits year, month, and day and constructs `new Date(year, month - 1, day)`. It rejects impossible or non-canonical values. It never uses `new Date("YYYY-MM-DD")`.

The analytics HTTP boundary sends `{ fromDate, toDate, timeZone }` with canonical date-only strings and a validated IANA timezone. Local Tunes validates no more than 93 inclusive calendar dates before deriving instants. It never treats `93 × 24 hours` as equivalent to 93 calendar dates across DST.

The two existing analytics date-control render paths become one reusable control component so empty and populated dashboard states cannot diverge.

### 3. Public Music discovery

The public profile already resolves the username to a public Account containing a stable `documentId`. That document ID is passed to a new read-only Local Tunes publication-discovery endpoint.

The endpoint:

- accepts only a canonical account document ID path parameter;
- returns a minimal public descriptor only for an active, discoverable, public publication;
- returns `404` for absent, private, unlisted, suspended, pending-deletion, tombstoned, or conflicting identities;
- returns the opaque `publicSlug` and no owner credentials or internal numeric identity;
- is rate-limited and does not accept username, email, user ID, or owner-supplied authority headers;
- uses a constant response shape and generic not-found behavior to limit identity enumeration.

`PublicNav` displays Music only when both Strapi `public_music === "Yes"` and Local Tunes returns a public descriptor. A Local Tunes outage does not break the rest of the public profile; the Music item is temporarily omitted or shown as unavailable according to the resolved UI state.

One account-keyed, single-flight availability resolver under `PublicLayout` supplies navigation, first-view resolution, and `ProfileMusic`. It owns cache lifetime, abort behavior, reconnect invalidation, and fail-closed state so those consumers cannot disagree or issue three descriptor requests.

The owner UI treats Local Tunes publication as authority and `public_music` as the profile-navigation preference. It exposes these states without attempting a cross-service transaction:

| Profile preference | Local Tunes publication | Owner state |
|---|---|---|
| hidden | private/unlisted | Hidden |
| enabled | private/unlisted | Setup required |
| hidden | public | Published but hidden |
| enabled | public descriptor ready | Live |
| either | descriptor unavailable | Status unavailable; never claim Live |

Each non-live state gives a concrete corrective action and refresh affordance.

### 4. Friendly route and canonical share route

`/{username}/music` is a nested public-profile route guarded by `public_music`. It resolves the stable Account document ID, obtains the public descriptor, and renders the same public Music content within `PublicLayout`.

`/music/share/{publicSlug}` remains a standalone direct-share route:

- public mode works without a capability;
- unlisted mode requires the 43-character capability in the fragment and retains it in session storage;
- capability fragments are removed from visible browser history after capture;
- private or revoked resources produce the generic unavailable/not-found state.

The content renderer is shared between both routes. Routing and discovery wrappers remain separate so the direct-share path never needs Strapi profile lookup.

Entry behavior is explicit:

- first-view resolution from `/{username}` falls back to the first available normal tab when Music is not ready;
- an explicit `/{username}/music` URL remains in the profile shell and shows Retry plus Return to Profile rather than silently redirecting;
- a Music tab that becomes unavailable shows that same in-shell state, then disappears after canonical refetch;
- an unknown username preserves the existing profile-not-found behavior.

### 5. Appearance controls

Music is removed from recommendation-category ordering and from labels of the form `Recommendations — Music first`.

The First view selector retains a dedicated `Music page` option. Selecting it means:

- if a public Music destination is available, visitors entering `/{username}` are taken to `/{username}/music`;
- if Music is private, unavailable, or disabled, the normal public-profile fallback resolver selects the first available Recommendations, Gallery, or Business tab;
- previously saved `landingTab: "music"` remains valid and is reinterpreted as the dedicated Music destination rather than discarded.

Recommendation layout and category-order controls continue to cover Places, Movies, Books, Games, Guides, Apps, Products, and People.

### 6. Public Music capability matrix

| Owner control | Public data | Public interface | Server enforcement |
|---|---|---|---|
| Allow song requests | Request capability metadata | Search/paste and Request button | Request route checks current permission on every mutation |
| Allow playback on guest devices | Current playable item and permitted playlist songs | Embedded player, play/pause, seek where supported, and Play on this device | Playback is local to the guest browser; it never mutates owner playback |
| Show shared playlists | Only explicitly shared playlists | Playlist cards and song selection | Repository excludes playlists when disabled and excludes private playlists always |
| Show recently played | Bounded recent history | Recently played section | Repository returns no history when disabled |
| Show queue | Current item and bounded up-next queue | Playing now and Up next | Repository returns no queue/current item when disabled |

All 32 boolean combinations must produce a coherent page. Controls that depend on unavailable data disappear rather than rendering disabled shells, except where an explanatory empty state helps the visitor.

Field exposure and interactivity are separate rules:

| Field or control | Rule |
|---|---|
| `currentlyPlaying` | Exposed when guest playback **or** queue visibility is enabled; playable only when guest playback is enabled |
| `queue` | Exposed only when queue visibility is enabled |
| playlist metadata and songs | Exposed only when playlist sharing is enabled |
| `recentlyPlayed` | Exposed only when recent-history visibility is enabled |
| player controls | Render only when guest playback is enabled and at least one exposed playable song exists |
| request interface | Render only when requests are enabled |

A song exposed through queue visibility never becomes playable unless guest playback is independently enabled. When playback is enabled but no playlist or queue is visible, `currentlyPlaying` is the only possible playable source.

### 7. Guest playback semantics

`Allow playback on guest devices` means playback occurs only in the visitor's browser or device. It does not control the owner's device, alter the owner's current song, or reorder the owner's queue.

The player:

- uses the existing supported YouTube media identity;
- requires an explicit user gesture before audio starts;
- exposes accessible play/pause controls and visible playback state;
- handles embed unavailable, autoplay denied, removed video, and network failure states;
- stops and removes controls immediately when permission is revoked;
- never sends owner-authorized queue or playback commands.

### 8. Song requests

When requests are enabled, guests can search or paste a supported YouTube URL and submit a song request. The existing Local Tunes request endpoint remains the mutation authority.

The UI handles:

- successful acceptance;
- invalid search or URL input;
- queue capacity;
- per-guest rate limiting and retry timing;
- permission revoked between search and submission;
- publication revoked while the page is open;
- duplicate submissions through idempotent UI behavior.

Public users never receive owner credentials. Unlisted requests include the retained capability; public requests use the public slug authority already supported by the backend.

### 9. Live synchronization

The existing Music socket service becomes a notification channel, not a second source of truth.

Server events identify only a revisioned resource change:

- `publication_changed`;
- `guest_controls_changed`;
- `playback_changed`;
- `queue_changed`;
- `playlists_changed`.

On an accepted event, the public client coalesces bursts and refetches the canonical public Music resource. It ignores stale revisions and cancels obsolete requests on navigation.

When the socket is unavailable, foreground polling runs every 30 seconds with ±20% jitter. Failures back off through 30, 60, 120, 240, and 300 seconds; a success resets the schedule. Hidden, offline, and unmounted pages stop immediately.

Public discoverable pages receive read-only socket admission using the public slug. Unlisted pages use the retained capability. Socket admission rechecks publication and lifecycle state. Mutation routes independently recheck permissions, so a delayed socket cannot extend authority.

Fallback behavior:

- reconnect with bounded exponential backoff and jitter;
- refetch on reconnect, tab visibility restoration, and network restoration;
- if sockets remain unavailable, use a conservative foreground polling interval;
- stop polling and disconnect when the document is hidden for an extended period or the component unmounts.

### 10. Error and privacy behavior

Public responses do not reveal whether a private, deleted, suspended, or unknown identity exists. The UI uses the same unavailable/not-found copy for all non-public states.

The public profile remains usable when Local Tunes fails. Music-specific failures are isolated to the Music destination. Direct-share capability values never enter logs, analytics payloads, query strings, page titles, referrers, or error messages.

Analytics tracks safe product events such as:

- Music navigation opened;
- playlist opened;
- guest playback started;
- request submitted or failed by normalized reason;
- Music unavailable by normalized public-safe state.

It never records capability tokens, raw search queries, media URLs, or Local Tunes credentials.

## Data and API Contracts

### Public descriptor

```ts
interface PublicMusicDescriptor {
  version: "music-public-descriptor/v1";
  publication: {
    mode: "public";
    publicSlug: string;
    revision: number;
  };
}
```

### Public resource

The browser validates the public resource with a strict schema before rendering. Required permission booleans are explicit rather than optional. Arrays are bounded. Unknown keys or malformed successful responses are treated as service failures.

```ts
interface PublicMusicResource {
  version: "music-public-resource/v1";
  revision: number;
  user: { username: string; venueName: string | null };
  permissions: {
    allowSongRequests: boolean;
    allowGuestPlayOnDevice: boolean;
    allowPlaylistSharing: boolean;
    allowRecentlyPlayedVisibility: boolean;
    allowQueueVisibility: boolean;
  };
  currentlyPlaying: MusicSong | null;
  queue: { items: PublicMusicSong[]; total: number; truncated: boolean };
  recentlyPlayed: { items: PublicMusicSong[]; total: number; truncated: boolean };
  playlists: { items: PublicMusicPlaylist[]; total: number; truncated: boolean };
}
```

`PublicMusicSong` and `PublicMusicPlaylist` are dedicated public types. They contain display metadata, non-authority public/media keys, and bounded nested song envelopes only. They never reuse owner types or expose numeric/internal `id`, `userId`, `playlistId`, Account/User document IDs, capability hashes, credentials, or unknown keys.

The canonical resource endpoint is additive: `GET /api/music/public-resource/v1/:publicSlug`. Legacy `/api/playlist/:guestUrl` retains its current response shape through rollout so the old frontend and direct shares remain compatible. Collection truncation is visible to guests as `Showing N of M`; legacy removal is a later explicitly approved migration.

The server returns empty or null protected fields according to the field-level truth table above. The client separately derives both data visibility and permitted interactivity from permissions as defense in depth.

`revision` is one monotonically increasing public-snapshot revision, not a queue-only or playback-only counter. Every committed mutation that changes the public descriptor or resource advances it transactionally. Socket events carry this revision and never become the source of content.

The stable public `/music/share/{publicSlug}` URL is the SEO canonical for both public entry paths. Friendly `/{username}/music` declares that stable share URL after descriptor resolution, so username renames cannot stale canonical metadata. Public direct share is self-canonical. Unlisted share is always `noindex, nofollow` and never exposes the capability.

## UI States

Every Music entry surface defines:

- resolving profile;
- resolving publication;
- loading resource;
- ready with content;
- ready but empty;
- rate-limited with countdown and retry;
- temporarily unavailable with retry;
- not public/not found;
- stale content during reconnect;
- permission removed while interacting.

Mobile is the primary layout. Player controls remain reachable above the browser safe area, lists use touch-sized targets, and long playlist/track names truncate without hiding essential actions.

## Test Strategy

### Unit tests

- Date-only parser/formatter in UTC, America/New_York, America/Los_Angeles, Asia/Kolkata, and Pacific/Kiritimati.
- DST spring and fall transitions, leap day, month/year boundaries, invalid dates, reversed ranges, 93 inclusive days, and 94 rejected days.
- Home analytics label and range use the same source of truth.
- Public descriptor and public-resource strict parsing.
- Recommendation ordering excludes Music while `landingTab: "music"` remains valid.
- Public-tab fallback when Music is unavailable.
- Capability capture, retention, removal from URL, revocation, and navigation between slugs.
- Permission-derived public sections for all 32 guest-control combinations.

### Backend contract and integration tests

- Stable account document ID resolves only a public active publication.
- Username, email, numeric owner ID, conflicting identifiers, and owner authority headers are rejected.
- Private, unlisted, suspended, deleted, tombstoned, unknown, and collision states all produce the same public not-found contract.
- All five permissions filter the returned resource and are rechecked on mutations.
- Guest requests cover public/unlisted authority, rate limits, queue capacity, revocation, and malformed input.
- Socket admission, revision monotonicity, reconnect, revocation, lifecycle transitions, and event recipient isolation.
- Load qualification for descriptor lookup, public resource reads, socket fan-out, reconnect storms, and request-rate saturation.

### Component and route tests

- `/{username}/music` remains in `PublicLayout` and shares rendering with `/music/share/{publicSlug}`.
- Navigation shows Music only when Strapi visibility and Local Tunes public publication both allow it.
- Music first-view selection routes correctly and falls back safely.
- Each permission adds/removes only its intended UI.
- Player, search/request, queue, history, playlists, loading, empty, retry, stale, and error states are accessible by touch and keyboard.
- A live permission revocation closes or disables the affected interaction and refetches canonical data.

### E2E matrix

Automated browser tests cover representative pairwise combinations across:

- publication: public, unlisted, private;
- navigation: profile click, direct friendly URL, direct share URL, refresh, back/forward;
- profile presentation: every theme, hero present/absent, mobile/tablet/desktop;
- content: no data, playlists only, queue only, history only, all populated;
- permissions: all 32 combinations at the contract/component level and pairwise UI E2E plus five single-control toggle journeys;
- live behavior: owner toggles each control while guest page is open, queue/player update, publication becomes private, reconnect after network interruption;
- analytics: UTM retained through friendly navigation and expected safe events recorded exactly once.

The live-write E2E lane uses a dedicated test account and restores the original publication, playlists, queue, and permission state in `finally` cleanup. Destructive playlist deletion is limited to test-created fixtures.

### Manual UAT

Two browser contexts are used simultaneously:

1. Owner dashboard logged in.
2. Guest Chrome context logged out.

The owner changes publication and each guest control while the guest watches the public page. UAT records screenshots or video, network evidence, emitted analytics, and final restored account state. Chrome mobile emulation and at least one real narrow viewport are included.

## Rollout and Compatibility

- Existing public and unlisted share URLs continue to work.
- Existing `landingTab: "music"` settings are preserved.
- Existing recommendation category arrays containing Music are normalized without destroying unknown forward-compatible fields in the stored wire object.
- Public Music navigation is fail-closed behind descriptor availability.
- New socket events are additive and versioned; older clients continue using snapshot reads.
- Deployment order is Local Tunes backend first, then Explorers frontend. The frontend treats an unavailable descriptor endpoint as Music temporarily unavailable and does not break other public routes.

## Observability

Local Tunes records bounded metrics without secrets:

- descriptor lookup outcome and latency;
- public resource outcome and latency;
- socket admissions, reconnects, disconnect reasons, and refetch invalidations;
- guest request accepted/rejected normalized codes;
- permission-revocation enforcement;
- rate-limit saturation.

Alerts distinguish backend outage, elevated malformed responses, connection churn, and permission-denied spikes.

## Not in Scope

- True all-time analytics aggregation.
- Redis introduction.
- Strapi server changes.
- Remote control of the owner's playback device by guests.
- Spotify or Apple Music playback integrations.
- Music cards inside the Recommendations layout.
- Collaborative queue editing beyond bounded guest song requests.

## Acceptance Criteria

1. Home analytics never requests more than the backend maximum and never displays a failed request as a real zero.
2. A selected custom calendar date produces the same calendar date in every supported timezone.
3. Music appears as a dedicated public navigation item only for a discoverable public Music publication.
4. `/{username}/music` renders within the public profile shell without using username as Music authority.
5. Direct public and unlisted share URLs remain functional and capability-safe.
6. Each of the five guest controls changes both public UI and backend authorization correctly.
7. An already-open public page reflects owner permission, playlist, queue, playback, and publication changes without manual refresh.
8. Guest-device playback never mutates owner playback.
9. Music is absent from recommendation category ordering but remains a valid dedicated first-view destination.
10. Unit, integration, contract, route, component, E2E, accessibility, responsive, and manual UAT evidence pass before PR approval.
