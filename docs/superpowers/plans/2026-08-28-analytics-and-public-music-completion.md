<!-- autoplan restore: C:\Users\TK\.gstack\projects\profile-settings-tabs-rebase-20260828\autoplan-restore\20260828-164253-codex-profile-settings-tabs-rebase-20260828.md -->

# Analytics Reliability and Public Music Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make analytics ranges truthful and timezone-safe, and ship Music as a secure, live, permission-complete public-profile destination.

**Architecture:** Analytics uses one bounded recent query and a date-only calendar model. Public Music is discovered through a stable Strapi Account document ID, authorized and served by Local Tunes through opaque publication identity, rendered through one shared content surface at both `/{username}/music` and `/music/share/{publicSlug}`, and refreshed by revisioned socket invalidations with a bounded polling fallback.

**Tech Stack:** React 18, TypeScript 5.6, React Router, Apollo Client, TanStack Query, Zod, Express 5, PostgreSQL, Socket.IO, Vitest, Testing Library, Playwright, axe-core.

**Spec:** `docs/superpowers/specs/2026-08-28-analytics-and-public-music-completion-design.md`

## Approved Product Premises

Approved by the user on 2026-08-28 before independent plan review:

- Accuracy and authorization safety take priority over minimizing PR size.
- Local Tunes remains authoritative for public Music data.
- `/{username}/music` uses username only for discovery and resolves a stable Account document ID before Local Tunes authorization.
- `/music/share/{publicSlug}` remains supported.
- All five guest controls are enforced and tested.
- No Strapi server code changes and no Redis dependency.
- Backend may deploy before the dependent frontend where compatibility requires it.
- Analytics distinguishes unavailable data from a real zero.
- Verification includes unit, integration, all 32 permission combinations at contract level, pairwise browser E2E, live-toggle journeys, and manual UAT.
- Analytics and public Music completion remain within PR #103.

## Global Constraints

- Work only in the isolated `codex/profile-settings-tabs-rebase-20260828` worktree and preserve the separate user-sync agent's work.
- Use TDD for every production change: failing focused test, minimal implementation, focused pass, then wider regression pass.
- Do not change Strapi server code and do not add Redis.
- Do not authorize Music with username, email, numeric user ID, browser-supplied owner ID, or owner authority headers.
- Preserve existing `/music/share/{publicSlug}` public and unlisted URLs and `landingTab: "music"` data.
- Guest-device playback must never mutate owner playback or queue state.
- Local Tunes enforces all five guest permissions; UI visibility is defense in depth only.
- Never log or track unlisted capabilities, credentials, raw music searches, or media URLs.
- Local Tunes backend must deploy before the frontend that consumes its descriptor and live-event contracts.
- Keep all public Music DTOs strict, versioned, bounded, and fail-closed.
- Unit/contract tests cover all 32 guest-control combinations; browser E2E uses pairwise coverage plus one live journey for each individual control.
- Before executing a task, replace every remaining shorthand verification sentence with its exact working directory, command/script, prerequisites, expected RED reason, expected GREEN invariant/pass count, and sanitized artifact path. A vague “run focused tests” is not an executable checkpoint.

## File and Responsibility Map

### Analytics

- Create `explorers-earth/src/features/Analytics/components/AnalyticsDateRangeControls.tsx`: the single custom-date input renderer.
- Modify `explorers-earth/src/features/Analytics/utils/analyticsDateRange.ts`: canonical date-only parsing, formatting, validation, and bounded ranges.
- Modify `explorers-earth/src/features/Analytics/components/AnalyticsDashboard.tsx`: string state and shared controls.
- Modify `explorers-earth/src/pages/Home.tsx`: bounded recent count and explicit loading/error/zero states.
- Test `explorers-earth/src/features/Analytics/__tests__/analyticsDateRange.test.ts`, `AnalyticsDashboard.test.tsx`, and `explorers-earth/src/pages/__tests__/Home.analytics.test.tsx`.

### Local Tunes public Music

- Modify `tunes/server/repositories/musicDomainRepository.ts`: stable-account descriptor lookup, strict permission-filtered public snapshot, public revision.
- Modify `tunes/server/routes/musicSurfaceRoutes.ts`: descriptor route and versioned public DTO.
- Modify `tunes/server/routes/musicOpenApiRoutes.ts`: contract documentation.
- Modify `tunes/server/socket/musicSocketServer.ts`: read-only public admission and revisioned invalidation events.
- Modify owner mutation paths in `musicSurfaceRoutes.ts` and repository command returns only where required to emit invalidations.
- Test repository, route, OpenAPI, socket, security, integration, and load suites under `tunes/server/test/`.

### Explorers public Music

- Modify `explorers-earth/src/features/music/publicMusicClient.ts`: strict descriptor/resource parsing and guest request client.
- Create `explorers-earth/src/features/music/publicMusicLiveClient.ts`: socket lifecycle, coalescing, polling fallback, and refetch invalidation.
- Create `explorers-earth/src/features/music/components/PublicMusicPlayer.tsx`.
- Create `explorers-earth/src/features/music/components/PublicMusicRequest.tsx`.
- Create `explorers-earth/src/features/music/components/PublicMusicSections.tsx`: permission-derived queue, history, and playlist sections.
- Refactor `explorers-earth/src/pages/public/PublicMusic.tsx`: shared controller/content renderer for direct and friendly routes.
- Create `explorers-earth/src/pages/public/ProfileMusic.tsx`: stable-profile discovery wrapper.
- Modify `explorers-earth/src/routes/PublicRoutes.tsx`, `PublicNav.tsx`, and visibility/username guards.

### Presentation and verification

- Modify `explorers-earth/src/features/Profile/constants/recommendationsPresentation.ts` and appearance controls so Music remains a landing destination but not an ordered recommendation category.
- Modify `PublicProfile.tsx` landing resolution.
- Extend Playwright Music, profile presentation, analytics, accessibility, and full-stack suites.
- Create `docs/uat/2026-08-28-analytics-public-music-uat.md` from recorded live verification evidence.

## Public Music Design Contract

Classification: hybrid public-profile shell plus app-like Music controls. Reuse profile theme normalization, public navigation/max-five logic, owner Music language, capability capture, generic public errors, and the typed `PublicLayout` readiness contract. Do not reuse the owner `MusicWorkspaceShell` visual structure or authority-bearing clients.

### Information hierarchy

```text
Friendly Music
├─ Shared profile chrome / identity / navigation
├─ Music heading + live or reconnecting status
├─ Now playing + guest-local player (primary visual anchor)
├─ Song request action, when allowed
├─ Up next queue
├─ Shared playlists
└─ Recently played

Direct share
├─ Neutral Explorers brand + owner/venue identity
└─ The same Music content hierarchy
```

If Now Playing is unavailable, the first populated allowed section moves up without leaving an empty player shell. Disabled permissions remove sections completely. Enabled-but-empty sections use guest-facing copy: `Nothing queued yet`, `No shared playlists yet`, and `Nothing played recently`. Requests retain instructional input. If everything is disabled or empty, render one page-level `Nothing has been shared here yet` state rather than five messages.

When a bounded collection is truncated, show `Showing N of M` next to its heading without implying hidden entries are unavailable because of permission.

### Responsive layout and fixed navigation

- `<768px`: one column in hierarchy order.
- `768–1199px`: player full width; request and queue below; playlists and history follow.
- `>=1200px`: primary player/playlists column plus bounded request/queue/history column.
- Now Playing is the only primary visual anchor. Cards exist only where containment or interaction requires them; avoid a decorative bordered-card stack.
- Define shared `--public-nav-height`. Content bottom padding is `calc(var(--public-nav-height) + env(safe-area-inset-bottom) + 1rem)`. The fixed nav includes safe-area padding and any sticky player sits above the combined inset.

### Visible state policy

| Surface | Loading | Empty | Error | Success | Partial/stale |
|---|---|---|---|---|---|
| Friendly descriptor | Earth loader | N/A | In-shell unavailable, Retry, Return to Profile | Reveal Music/nav | Existing profile remains; no Music flash |
| Direct resource | Neutral Music loading shell | One page-level empty state | Generic unavailable + Retry | Content hierarchy | Existing safe content + `Reconnecting…` |
| Player | Reserved media ratio, no fake controls | No shell | Keep metadata + `Choose another track` | Local controls | Revocation stops/unmounts and moves focus |
| Requests | Hidden until permission known | Instructional input | Normalized inline error | Accepted confirmation | Countdown/revocation recovery |
| Queue/playlists/history | No unauthorized skeleton | Warm enabled-empty copy | Whole-resource retry only | Semantic lists | Preserve safe state with update announcement |
| Home analytics | Value skeleton | Real `0` | `Unavailable` | Count + range | Prior value only if visibly marked stale |

The Music resource is atomic. Do not invent independent section network errors unless the API is deliberately split in a later design.

### Theme and hero inheritance

Friendly Music receives normalized profile tokens, wallpaper mode, footer branding, and nav treatment from shared profile chrome above both public routes. Direct share uses a stable neutral Explorers theme.

- `banner-top` with a valid image uses the profile hero.
- `full-wallpaper-image` is continuous and does not duplicate a hero panel.
- `ambient-gradient` and `solid-color` reserve no empty hero height.
- Missing or failed imagery falls back to the selected theme surface without layout shift.

Component/visual-contract coverage is exhaustive for six presets × four wallpaper modes (24). Valid, absent, and failed imagery are covered where applicable. Viewports and browsers use deterministic pairwise E2E selection; do not claim a full cross-product unless it actually ran.

### Accessibility and interaction acceptance

- Public destinations are links with `aria-current="page"`, not ARIA tabs, and retain open-in-new-tab behavior.
- Client navigation focuses the destination `<h1>` or skip-linked main except on Back/Forward.
- Exactly one `<main>` landmark and a valid heading hierarchy.
- WCAG AA: 4.5:1 normal text and 3:1 large text, controls, and focus indicators. Unsafe custom theme combinations derive accessible foreground/focus colors.
- Minimum 44px touch targets and 16px request input text; 200% zoom and 320 CSS-pixel reflow without two-dimensional scrolling.
- Track rows are buttons only when playable; selected/playing state is textual, not color-only.
- Request results are abortable, status is announced without per-second countdown spam, success receives focus after acknowledgement, and permission revocation closes results and focuses the Music heading.
- Respect `prefers-reduced-motion`; loading completion, reconnect, request result, player error, and permission revocation have screen-reader announcements.

### Owner readiness language

| State | Status | Primary | Secondary |
|---|---|---|---|
| Hidden | Hidden from profile | Enable profile Music | Open sharing settings |
| Setup required | Profile enabled, Music not public | Make Music public | Hide profile Music |
| Published but hidden | Public link active, profile tab hidden | Show on profile | Copy public link |
| Live | Live on profile | View as guest | Copy public link |
| Status unavailable | Status unavailable | Retry status | Open Music workspace |

Never use Live styling before descriptor confirmation. Preference-save and readiness-reconciliation announcements are separate. Partial reconciliation says `Saved; status could not be confirmed.` Five-slot exclusion names the omitted item and links to pin reordering.

## Engineering Contracts Added by Independent Review

### Isolation and migration gate

Before backend work, fetch `origin/main`, record merge base/status/diff inventory, and allocate the next append-only Music migration marker from the then-current chain. Do not assume `0020`; if another branch advances the chain, rebase and renumber before implementation. Never edit previous migrations, reconciliation, or user-sync files. Run identity/reconciliation and forbidden-authority suites as non-regression evidence.

Add `public_snapshot_revision BIGINT NOT NULL DEFAULT 0` to `users` through that migration, with the runtime role's narrowly scoped UPDATE grant. Update the migration contract, marker/checksum, deployment/readiness/rollback-floor tests, Docker evidence, and both Tunes workflows. Keep `music_queue_revision` for old clients. Queue/playback transactions advance both counters; other public-output mutations advance only `public_snapshot_revision`.

### Transactional public invalidation

Use PostgreSQL transactional `pg_notify` plus a reconnecting `LISTEN` service; do not use Redis or route-level post-commit callbacks. Each public-output transaction mutates state, advances the public revision, and calls `pg_notify` inside the same transaction. PostgreSQL releases the notification only after commit. Every Local Tunes replica listens and fans out to its local Socket.IO rooms.

- Internal notification: `{ musicUserId, kind, revision }`.
- Browser envelope: `{ version: "music-public-change/v1", kind, revision }` only.
- Public-slug and unlisted-capability admission are read-only, isolated, and rechecked before sensitive delivery.
- Rollback/no-op/stale/replay/conflict emits nothing.
- Listener reconnect, lag, malformed messages, and fatal shutdown are tested.

### Mutation completeness oracle

Task 5 must inventory every repository/lifecycle path that can change the public descriptor or snapshot: guest controls, publication mode/lifecycle, visible playlists, playlist metadata/songs/order, queue/current playback, recent-history clear/append, guest request, suspension/deletion/tombstone. For each row record repository method, event kind, transaction/lock, counter updates, notification, and old-client compatibility. A real-PostgreSQL table test executes every row and proves exactly one revision/event after commit.

### Strict bounded public DTO

The public v1 DTO excludes all numeric/internal `id`, `userId`, `playlistId`, Account/User document IDs, capability hashes, credentials, and unknown nested keys. Public client keys use non-authority media identity plus ordinal or explicit random public IDs. Deny-list serialization tests inspect every nested level.

Atomic snapshot caps are server-enforced before aggregation: queue 100, recent history 50, shared playlists 20, songs per playlist 50, and encoded JSON 512 KiB. Ordering is deterministic. Each collection has a truthful `truncated` flag/count summary. The client schema matches these caps; it is not the first line of defense. Worst-case SQL, payload, memory, and latency tests enforce the budget.

### Cache and race semantics

Use existing TanStack Query infrastructure:

- descriptor key uses stable Account document ID; resource key uses public slug plus an opaque in-memory capability fingerprint, never raw capability;
- pass AbortSignals; no retry for 404/revoked; bounded jittered retry for transient failures;
- short descriptor staleness and immediate cache removal on revocation;
- unlisted data is session-only and removed on slug/capability change, unmount, or revocation;
- one in-flight refetch, burst coalescing, and `lastAppliedRevision` prevent older HTTP completions replacing newer snapshots;
- foreground polling runs every 30 seconds with ±20% jitter; failures back off 30/60/120/240/300 seconds; success resets; hidden, offline, or unmounted stops immediately.

### Guest request idempotency

Task 10 includes server-side `Idempotency-Key` validation/storage with request hash, 24-hour retention, replay response, concurrent duplicate collapse, and `409` for the same key with a different body. Queue insert, public revision, notification, and idempotency record commit atomically. Never persist capability, raw query, or media URL beyond the canonical public song fields already required.

### Route/readiness composition

Shared Music content is landmark-neutral. `PublicLayout` owns `<main>` for friendly routes; the direct-share wrapper owns `<main>` for standalone routes. Readiness is route-keyed `{ routeKey, phase, settle }`, not a shared boolean. A Music-specific visibility boundary preserves explicit in-shell unavailable behavior instead of reusing redirecting `TabVisibilityGuard`.

### Observability and load budget

Add low-cardinality outcome/latency metrics and structured logs for descriptor/resource, parser failures, socket admission/disconnect/reconnect/invalidation, listener health/lag, guest request outcome, and fallback-poll activation. Labels never contain slug, account, capability, query, or media URL. Define measurable concurrent-guest, latency, error-rate, and listener-lag canary thresholds and rollback triggers; do not claim alerts that are not provisioned.

### Dependency graph

```text
timezone dates → shared controls → truthful Home analytics

isolation + next migration marker
  → public revision migration/grants/deploy contracts
  → transaction mutation inventory
      ├─ strict bounded descriptor/resource DTO
      ├─ guest request idempotency
      └─ pg_notify → LISTEN service → Socket.IO public rooms
  → strict frontend parsers
      → stable Account discovery → shared availability provider
          ├─ PublicNav
          ├─ first-view resolver
          └─ ProfileMusic/direct controller
              → sections/player/request/live refresh
              → analytics/theme/readiness/a11y
              → component/E2E/full-stack/UAT/canary
```

---

### Task 1: Make analytics calendar dates timezone-safe

**Files:**
- Modify: `explorers-earth/src/features/Analytics/utils/analyticsDateRange.ts`
- Modify: `explorers-earth/src/features/Analytics/__tests__/analyticsDateRange.test.ts`
- Modify: `explorers-earth/src/services/explorersAnalyticsClient.ts` and tests.
- Modify: `tunes/server/routes/explorersAnalyticsRoutes.ts` and route tests.

**Interfaces:**
- Produces: `formatLocalDateInput(date: Date): string`
- Produces: `parseLocalDateInput(value: string): Date | null`
- Produces: `getAnalyticsDateRange(filter: AnalyticsTimeFilter, now?: Date): AnalyticsDateRange | null`
- `AnalyticsTimeFilter` custom dates become canonical strings: `{ type: "custom"; startDate: string; endDate: string }`.
- Defines “last 90 days” as exactly 90 inclusive local calendar dates: local start of `today - 89` through local end of today.
- Analytics API boundary is `{ fromDate, toDate, timeZone }` using canonical date-only strings and a validated IANA timezone. Local Tunes validates inclusive calendar-day count before deriving query instants.

- [ ] **Step 1: Add failing date-only and timezone tests**

Add table tests proving canonical parsing and formatting:

```ts
it.each([
  ["2024-02-29", [2024, 1, 29]],
  ["2026-01-01", [2026, 0, 1]],
  ["2026-12-31", [2026, 11, 31]],
])("parses %s as a local calendar date", (input, expected) => {
  const parsed = parseLocalDateInput(input)!;
  expect([parsed.getFullYear(), parsed.getMonth(), parsed.getDate()]).toEqual(expected);
});

it.each(["", "2026-02-30", "2026-2-03", "not-a-date"])(
  "rejects non-canonical date-only input %s",
  (input) => expect(parseLocalDateInput(input)).toBeNull(),
);
```

Keep the existing 93-inclusive and 94-rejected assertions, but pass strings instead of `new Date("YYYY-MM-DD")`.

Use a fixed clock to assert the 90-day helper emits exactly 90 local calendar labels and remains invariant through DST transitions.

Accept `2026-08-15…2026-11-15` in `America/New_York` as 93 inclusive calendar dates despite the fall-DST elapsed duration; cover spring DST and reject the adjacent 94-calendar-day range on both client and server.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- --run src/features/Analytics/__tests__/analyticsDateRange.test.ts` from `explorers-earth`.

Expected: FAIL because the date-only utilities and string filter contract do not exist.

- [ ] **Step 3: Implement explicit local-calendar parsing**

Use this validation shape:

```ts
export function parseLocalDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const day = Number(dayText);
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date
    : null;
}

export function formatLocalDateInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
```

Normalize API boundaries from validated date-only strings and IANA timezone on the server. Replace elapsed-millisecond clamping with an inclusive calendar-day count `<=93`, then derive start/end instants for the existing query service.

- [ ] **Step 4: Run focused tests in five time zones**

Run the same test under `TZ=UTC`, `America/New_York`, `America/Los_Angeles`, `Asia/Kolkata`, and `Pacific/Kiritimati` using PowerShell environment assignment.

Expected: PASS in every timezone, including DST and leap-day cases.

- [ ] **Step 5: Commit the date model**

```bash
git add explorers-earth/src/features/Analytics/utils/analyticsDateRange.ts explorers-earth/src/features/Analytics/__tests__/analyticsDateRange.test.ts
git commit -m "fix: keep analytics custom dates timezone safe"
```

### Task 2: Unify analytics date controls

**Files:**
- Create: `explorers-earth/src/features/Analytics/components/AnalyticsDateRangeControls.tsx`
- Modify: `explorers-earth/src/features/Analytics/components/AnalyticsDashboard.tsx`
- Modify: `explorers-earth/src/features/Analytics/__tests__/AnalyticsDashboard.test.tsx`

**Interfaces:**
- Consumes Task 1 date-only helpers.
- Produces:

```ts
interface AnalyticsDateRangeControlsProps {
  startDate: string;
  endDate: string;
  error: string | null;
  onStartDateChange(value: string): void;
  onEndDateChange(value: string): void;
}
```

- [ ] **Step 1: Write failing shared-control tests**

Assert that both empty and populated Analytics states render exactly one `From` input and one `To` input from the shared component, retain the entered string, and send the intended local calendar day to `readExplorersAnalyticsEvents`.

```ts
await user.type(screen.getByLabelText(/from/i), "03/08/2026");
await user.type(screen.getByLabelText(/to/i), "03/10/2026");
expect(screen.getByLabelText(/from/i)).toHaveValue("2026-03-08");
```

- [ ] **Step 2: Confirm RED**

Run: `npm test -- --run src/features/Analytics/__tests__/AnalyticsDashboard.test.tsx`.

Expected: FAIL because duplicated inputs still parse via `new Date(value)`.

- [ ] **Step 3: Extract the shared component and change state to strings**

Replace both custom-input branches with `AnalyticsDateRangeControls`. Keep native input `value`, `min`, and `max` as date-only strings. Derive validation through `getAnalyticsDateRange` and never call `toISOString()` to populate an input.

- [ ] **Step 4: Run focused tests and lint touched files**

Run the focused test, then `npx eslint src/features/Analytics/components/AnalyticsDateRangeControls.tsx src/features/Analytics/components/AnalyticsDashboard.tsx`.

Expected: PASS with zero lint errors.

- [ ] **Step 5: Commit the unified controls**

```bash
git add explorers-earth/src/features/Analytics/components/AnalyticsDateRangeControls.tsx explorers-earth/src/features/Analytics/components/AnalyticsDashboard.tsx explorers-earth/src/features/Analytics/__tests__/AnalyticsDashboard.test.tsx
git commit -m "refactor: unify analytics custom date controls"
```

### Task 3: Make the Home analytics card bounded and truthful

**Files:**
- Modify: `explorers-earth/src/pages/Home.tsx`
- Create: `explorers-earth/src/pages/__tests__/Home.analytics.test.tsx`
- Modify: relevant English i18n key and run the existing i18n synchronization script for locale parity.

**Interfaces:**
- Consumes Task 1 `getAnalyticsDateRange({ type: "90d" })` or an exported `getRecentAnalyticsDateRange(90, now)`.
- Produces explicit card state: `loading | ready | unavailable` and label `Views · last 90 days`.

- [ ] **Step 1: Write failing request and UI-state tests**

```ts
expect(readExplorersAnalyticsEvents).toHaveBeenCalledWith(expect.objectContaining({
  from: expect.any(String),
  to: expect.any(String),
}));
expect(Date.parse(call.to) - Date.parse(call.from)).toBeLessThanOrEqual(93 * 86_400_000);
```

Add separate assertions for loading, real zero, non-zero, and failed request. Failure must render `Unavailable`, not `0`.

Under a fixed clock, assert the request spans local `today - 89` through local today inclusively rather than 90 elapsed UTC days.

- [ ] **Step 2: Confirm RED**

Run: `npm test -- --run src/pages/__tests__/Home.analytics.test.tsx`.

Expected: FAIL because Home requests from `new Date(0)` and collapses failure into zero.

- [ ] **Step 3: Implement the bounded query and explicit state**

Use the same range utility as Analytics. Count only normalized view events after a successful response. Update card copy and accessible label to state the 90-day period.

- [ ] **Step 4: Verify Home and analytics regression suites**

Run Home analytics, AnalyticsDashboard, analyticsDateRange, and `explorersAnalyticsClient` tests together.

Expected: PASS.

- [ ] **Step 5: Synchronize translations and commit**

Run `npm run i18n:sync` and `npm run i18n:check`, stage only intended locale changes, then commit:

```bash
git commit -m "fix: bound and label dashboard analytics views"
```

### Task 4A: Allocate and qualify the public snapshot revision migration

**Files:**
- Create: the next append-only `tunes/migrations/NNNN_public_snapshot_revision.sql` after fetching current `origin/main`.
- Modify: `tunes/shared/music-migration-contract.ts`.
- Modify: `tunes/server/deployment/music-deployment.ts` and its tests.
- Modify: migration, runtime-role, startup-readiness, rollback-floor, Docker, and workflow contract tests.
- Modify: `.github/workflows/tunes.yml` and protected/reusable deployment contracts only as required by the new marker.
- Preserve or strengthen `.github/workflows/tunes-test-direct-deploy.yml` expiry/refusal; do not advance or revive this temporary path.

- [ ] **Step 1: Prove branch isolation and allocate the marker**

Record fetch SHA, merge base, clean status, and intended backend file inventory. Determine the next migration ID from the current chain. If main advanced, rebase before allocating. Assert no reconciliation or user-sync files enter the inventory.

- [ ] **Step 2: Write failing migration/deployment tests**

Cover clean install, upgrade, checksum/marker, runtime-role grant, concurrent revision increment, readiness, rollback compatibility, Docker evidence, and old binary tolerance of the additive column.

Assert the temporary direct-deploy workflow refuses execution after its declared expiry.

- [ ] **Step 3: Confirm RED**

Run the migration contract, fixture migration/verify, deployment, startup, runtime-role, and workflow contract suites.

- [ ] **Step 4: Add the append-only migration and update contracts**

Add `public_snapshot_revision BIGINT NOT NULL DEFAULT 0`, the narrow runtime UPDATE grant, and every marker/checksum/readiness/deployment reference. Do not alter an existing migration or `music_queue_revision`.

- [ ] **Step 5: Re-run migration qualification**

Run guarded fixture migrate/verify, upgrade, concurrency, runtime-role, deployment, rollback-floor, and Docker evidence suites.

- [ ] **Step 6: Commit the migration contract**

```bash
git commit -m "feat(music): add transactional public snapshot revision"
```

### Task 4: Add fail-closed public Music descriptor lookup

**Files:**
- Modify: `tunes/server/repositories/musicDomainRepository.ts`
- Modify: `tunes/server/routes/musicSurfaceRoutes.ts`
- Modify: `tunes/server/routes/musicOpenApiRoutes.ts`
- Modify: `tunes/server/test/music-domain-repository.test.ts`
- Modify: `tunes/server/test/music-domain-repository.integration.test.ts`
- Modify: `tunes/server/test/music-surface-routes.test.ts`
- Modify: `tunes/server/test/contracts/music-openapi-contract.test.ts`
- Modify: `tunes/server/test/security/music-security-qualification.test.ts`

**Interfaces:**
- Produces repository method:

```ts
resolvePublicDescriptor(accountDocumentId: string): Promise<{
  mode: "public";
  publicSlug: string;
  revision: number;
} | undefined>;
```

- Produces `GET /api/music/public-profile/:accountDocumentId` returning `music-public-descriptor/v1`.

- [ ] **Step 1: Write failing repository and route tests**

Cover active public success and indistinguishable 404 responses for private, unlisted, suspended, pending deletion, tombstoned, unknown, malformed, and collision inputs. Assert forbidden username/email/owner headers and query keys are rejected.

- [ ] **Step 2: Confirm RED in Local Tunes**

Run the four focused Vitest files from `tunes`.

Expected: FAIL because descriptor repository and route do not exist.

- [ ] **Step 3: Implement stable-account lookup**

Use a single parameterized query constrained by `strapi_account_document_id`, `identity_status='active'`, `guest_discoverable=true`, non-null canonical `guest_url`, and public publication state. Return no internal user ID.

- [ ] **Step 4: Add route validation, rate limiting, DTO, and OpenAPI**

Validate the account document ID with the same bounded character policy used for synchronized identity fields. The route must ignore no authority input: reject unexpected query/body/identity headers and use generic `PUBLIC_NOT_FOUND` for non-public states.

- [ ] **Step 5: Run focused, integration, OpenAPI, and security tests**

Expected: PASS, including SQL injection-shaped input and enumeration-safe failures.

- [ ] **Step 6: Commit the descriptor contract**

```bash
git commit -m "feat(music): resolve public publication by stable profile identity"
```

### Task 5: Normalize the strict public Music resource contract

**Files:**
- Modify: `tunes/server/repositories/musicDomainRepository.ts`
- Modify: `tunes/server/routes/musicSurfaceRoutes.ts`
- Modify: `tunes/server/routes/musicOpenApiRoutes.ts`
- Modify: backend repository, route, and contract tests.
- Modify: `explorers-earth/src/features/music/publicMusicClient.ts`
- Modify: `explorers-earth/src/features/music/__tests__/publicMusicClient.test.ts`

**Interfaces:**
- Produces additive `GET /api/music/public-resource/v1/:publicSlug` with required `version: "music-public-resource/v1"`, `revision`, `permissions`, `currentlyPlaying`, and bounded collection envelopes.
- Keeps legacy `/api/playlist/:guestUrl` and its current JSON shape unchanged through the frontend rollout.
- Produces strict Zod parsers `parsePublicMusicDescriptor` and `parsePublicMusicResource`.
- Defines one transactionally incremented public-snapshot revision shared by descriptor, resource, and invalidation events.

**Field-level permission truth table:**

| Field/control | Exposure/interactivity rule |
|---|---|
| `currentlyPlaying` | Expose when playback OR queue visibility is true; permit playback only when playback is true |
| `queue` | Expose only when queue visibility is true |
| playlist metadata/songs | Expose only when playlist sharing is true |
| `recentlyPlayed` | Expose only when history visibility is true |
| player controls | Render only when playback is true and an exposed playable song exists |
| request UI | Render only when requests are true |

- [ ] **Step 1: Write failing backend permission-matrix tests**

Generate all 32 combinations of the five booleans. Assert data exposure and interactivity separately using the truth table. A queue-visible song must not become playable when playback is false. Assert private playlists never escape even when playlist sharing is enabled.

- [ ] **Step 2: Write failing frontend malformed-success tests**

Reject unknown keys, missing permissions, oversized arrays, invalid song IDs/status, invalid slug/revision, and legacy optional-boolean shapes.

- [ ] **Step 3: Confirm RED on both packages**

Run focused Local Tunes contract tests and the frontend `publicMusicClient` test.

- [ ] **Step 4: Implement the versioned canonical DTO and strict client parser**

Return the version and permission object explicitly and keep the five booleans required. Define dedicated `PublicMusicSong`/`PublicMusicPlaylist` schemas and bounded `{ items, total, truncated }` envelopes, including playlist songs. Use `.strict()` objects and parse before resolving `load()`. Introduce one public-snapshot revision and a mutation-to-revision table covering publication lifecycle, all five permissions, playlists, queue, playback, and history; increment it inside the state transaction, with PostgreSQL releasing the notification only after commit.

- [ ] **Step 5: Run focused and integration tests**

Expected: all 32 matrix cases and malformed response cases pass.

Also pass frozen legacy-client/new-backend compatibility and new-frontend/old-backend isolation: friendly Music may be unavailable, but existing profile routes and legacy direct shares remain usable. Legacy endpoint retirement requires a separately approved migration after frontend adoption evidence.

- [ ] **Step 6: Commit the shared contract**

```bash
git commit -m "refactor(music): make public resource permission complete"
```

### Task 6: Separate Music landing destination from recommendation ordering

**Files:**
- Modify: `explorers-earth/src/features/Profile/constants/recommendationsPresentation.ts`
- Modify: `explorers-earth/src/features/Profile/types/themeTypes.ts`
- Modify: `explorers-earth/src/features/Profile/components/ThemeAppearanceSection.tsx`
- Modify: `explorers-earth/src/features/Profile/components/RecommendationsPresentationControls.tsx`
- Modify: associated Profile tests.
- Modify: `explorers-earth/src/features/PublicHome/components/PublicProfile.tsx`
- Modify: associated PublicProfile presentation tests.

**Interfaces:**
- Produces separate constants:

```ts
export const RECOMMENDATION_CATEGORY_IDS = [
  "places", "movies", "books", "games", "guides", "apps", "products", "people",
] as const;
export const PUBLIC_LANDING_DESTINATION_IDS = [
  "all-recommendations", ...RECOMMENDATION_CATEGORY_IDS, "gallery", "business", "music",
] as const;
```

- [ ] **Step 1: Write failing normalization and UI tests**

Assert Music does not appear in drag ordering or `Recommendations — Music first`, appears once as `Music page`, and saved `landingTab: "music"` survives normalization. Assert stale category orders containing Music normalize to the eight valid recommendation categories without corrupting other wire fields.

- [ ] **Step 2: Confirm RED**

Run constants, ThemeAppearanceSection, RecommendationsPresentationControls, reorder transaction, and PublicProfile presentation tests.

- [ ] **Step 3: Split category and destination metadata**

Keep `music` in landing-destination parsing but remove it from recommendation category metadata and ordering functions. Update fallback resolution to choose the first available normal profile tab when public Music is unavailable.

- [ ] **Step 4: Run focused profile tests**

Expected: PASS with no changed behavior for the eight recommendation categories.

- [ ] **Step 5: Commit presentation semantics**

```bash
git commit -m "fix: treat music as a dedicated public destination"
```

### Task 7: Add secure friendly Music routing and navigation

**Files:**
- Create: `explorers-earth/src/pages/public/ProfileMusic.tsx`
- Modify: `explorers-earth/src/pages/public/PublicMusic.tsx`
- Modify: `explorers-earth/src/routes/PublicRoutes.tsx`
- Modify: `explorers-earth/src/components/PublicNav.tsx`
- Modify: `explorers-earth/src/utils/navPinning.ts`
- Modify: `explorers-earth/src/utils/__tests__/navPinning.test.ts`
- Modify: the dashboard pin-selection UI and its tests.
- Modify: `explorers-earth/src/features/music/publicMusicClient.ts`
- Create: `explorers-earth/src/features/music/PublicMusicAvailabilityProvider.tsx`
- Create: `explorers-earth/src/features/music/__tests__/PublicMusicAvailabilityProvider.test.tsx`
- Create/refactor: shared `PublicProfileChrome` / `PublicProfileThemeProvider` above `PublicProfile` and `ProfileMusic`, with focused tests.
- Modify: `explorers-earth/src/layouts/PublicLayout.tsx` and readiness tests.
- Modify: `explorers-earth/src/components/MusicDashboard.tsx` and its tests for owner publication readiness.
- Create/modify route, navigation, legacy-boundary, and public-page tests.

**Interfaces:**
- Consumes Task 4 descriptor endpoint and Task 5 strict resource parser.
- Produces `ProfileMusic` using Account `documentId` only for discovery.
- Produces shared `PublicMusicPageController` and `PublicMusicContent` used by friendly and share routes.
- Produces one account-keyed, single-flight availability resolver consumed by navigation, first-view resolution, and `ProfileMusic`.

- [ ] **Step 1: Write failing route and security-boundary tests**

Assert `/{username}/music` exists under `PublicLayout`, is guarded by `public_music`, calls descriptor lookup with the Account document ID, and never passes username to Local Tunes. Update the legacy boundary test to forbid username authority while allowing the friendly presentation route.

Assert `ProfileMusic` owns the typed layout-readiness handshake: initial profile/descriptor work uses the Earth loader on every refresh; every terminal descriptor branch dismisses it exactly once; subsequent resource refreshes use inline state and cannot restore the full-screen loader. Route transitions reset readiness without inheriting stale child state.

- [ ] **Step 2: Write failing navigation tests**

Music appears only when Strapi visibility is `Yes` and Local Tunes descriptor is public. It is eligible for the same maximum-five slots. Manual position is retained while unavailable, auto mode uses a deterministic rank independent of Strapi list counts, Profile remains guaranteed, and the owner UI explains when Music is enabled but excluded by the five-slot limit. Cover more than five eligible tabs, descriptor transitions, and duplicate/blank-slot prevention. Descriptor loading must not flash an unauthorized Music tab, remove other navigation items, or crash the profile.

Add owner state-machine tests for Hidden, Setup required, Published but hidden, Live, and Status unavailable. Each non-live state must show a corrective action; failed refresh/save must never claim Live. Keep Local Tunes authoritative and do not create a cross-service pseudo-transaction.

- [ ] **Step 3: Confirm RED**

Run PublicRoutes visibility, PublicNav, UsernameValidator, legacy Music boundary, and PublicMusic tests.

- [ ] **Step 4: Implement discovery wrapper and shared renderer**

`ProfileMusic` obtains the already-public Account document ID through the shared availability provider, then loads the public resource by slug. Define cache lifetime, cancellation, reconnect invalidation, and fail-closed behavior. Assert one descriptor request per profile load and consistent state across all three consumers. Direct share continues to capture optional unlisted capability without Strapi lookup.

Move normalized theme/chrome ownership above both friendly profile routes. Friendly Music inherits all profile tokens, hero/wallpaper rules, footer branding, and nav treatment; direct share remains neutral and performs no theme lookup.

- [ ] **Step 5: Implement dedicated first-view navigation**

When `landingTab === "music"`, route to `/{username}/music` only after descriptor availability. Otherwise invoke the existing public-profile fallback resolver without loops. An explicit `/{username}/music` stays in the profile shell and renders unavailable with Retry and Return to Profile; it never silently redirects. If an open Music tab becomes unavailable, show that state before removing the tab after canonical refetch.

- [ ] **Step 6: Run focused route tests and inspect history behavior**

Verify direct URL, navigation click, refresh, back/forward, wrong username, visibility disabled, private Music, and Local Tunes outage.

Verify canonical metadata: friendly public Music points to stable `/music/share/{publicSlug}`, public direct share is self-canonical, and unlisted share is `noindex, nofollow` without leaking capability data. Add a username-rename test proving canonical metadata never depends on stale username state.

- [ ] **Step 7: Commit routing and navigation**

```bash
git commit -m "feat(music): add secure public profile music route"
```

### Task 8: Complete permission-derived public Music sections

**Files:**
- Create: `explorers-earth/src/features/music/components/PublicMusicSections.tsx`
- Modify: `explorers-earth/src/pages/public/PublicMusic.tsx`
- Create: `explorers-earth/src/features/music/components/__tests__/PublicMusicSections.test.tsx`
- Modify: `explorers-earth/src/pages/__tests__/PublicMusic.test.tsx`

**Interfaces:**
- Consumes Task 5 `PublicMusicResource`.
- Produces presentational queue, history, and playlist sections with no network authority.

- [ ] **Step 1: Write all 32 UI matrix tests**

Use `it.each` over bit masks `0..31`. For each mask, build permissions and assert each section's presence exactly matches its permission and available content. Include empty enabled states and malicious non-empty disabled payloads to prove defense-in-depth hiding.

Assert data exposure separately from interactivity: queue visibility may expose a song without making it playable, playback without playlist sharing may play only an otherwise exposed source, and no playable source means no player shell.

- [ ] **Step 2: Confirm RED**

Run the new component test and existing PublicMusic test.

- [ ] **Step 3: Implement focused accessible sections**

Use semantic headings/lists, decorative empty alt text, touch targets of at least 44 CSS pixels, and responsive cards. Do not duplicate permission logic in route controllers.

- [ ] **Step 4: Run component tests and axe checks**

Expected: 32 matrix cases pass and no serious/critical axe violations.

- [ ] **Step 5: Commit public sections**

```bash
git commit -m "feat(music): render guest-controlled public sections"
```

### Task 9: Add guest-device playback without owner mutation authority

**Files:**
- Create: `explorers-earth/src/features/music/components/PublicMusicPlayer.tsx`
- Create: `explorers-earth/src/features/music/components/__tests__/PublicMusicPlayer.test.tsx`
- Modify: `PublicMusicSections.tsx` and tests.
- Modify: production-bundle boundary tests if the player library changes the Music chunk.

**Interfaces:**
- Consumes public song YouTube identity only.
- Produces local component state and callbacks; imports neither `musicQueueClient` nor owner `musicApi`.

- [ ] **Step 1: Write failing player behavior and authority tests**

Cover explicit user gesture, play/pause, selected playlist song, autoplay denial, removed video, network/embed failure, permission revocation, unmount cleanup, and keyboard labels. Add a source-boundary assertion that public player files do not import owner queue/playback clients.

- [ ] **Step 2: Confirm RED**

Run the new player test and Music boundary tests.

- [ ] **Step 3: Implement local-only playback**

Use the existing `react-player` dependency or a narrowly wrapped YouTube embed. Set playing state only after a user click. On permission change to false, set playing false and unmount the player.

- [ ] **Step 4: Run tests, build, and inspect the production bundle guard**

Expected: component tests and `npm run build` pass; no owner credential or command code leaks into the public Music chunk.

- [ ] **Step 5: Commit guest playback**

```bash
git commit -m "feat(music): add local guest-device playback"
```

### Task 10: Add bounded public song requests

**Files:**
- Create: `explorers-earth/src/features/music/components/PublicMusicRequest.tsx`
- Create: `explorers-earth/src/features/music/components/__tests__/PublicMusicRequest.test.tsx`
- Modify: `explorers-earth/src/features/music/publicMusicClient.ts`
- Modify: `tunes/server/routes/musicSurfaceRoutes.ts`, `tunes/server/repositories/musicDomainRepository.ts`, and backend guest-request tests.
- Add a reviewed bounded guest-operation persistence migration only if no suitable existing store exists; allocate its marker from current main.

**Interfaces:**
- Produces client methods `search(publicSlug, query, capability?, signal?)`, `videoFromUrl(...)`, and `requestSong(publicSlug, song, capability?, idempotencyKey)`.
- Consumes existing public Local Tunes search, URL, and request endpoints.

- [ ] **Step 1: Write failing client and component tests**

Cover success, empty/oversized query, malformed URL, no results, rate limit with retry countdown, queue full, permission revoked between search and submit, publication revoked, duplicate click suppression, abort on query/navigation, and safe telemetry payloads. Backend cases include malformed/missing keys, concurrent duplicates, exact replay, same-key/different-body `409`, 24-hour expiry, rollback, and no duplicate queue/revision/event.

- [ ] **Step 2: Confirm RED**

Run the new component/client tests and focused backend guest request tests.

- [ ] **Step 3: Implement strict guest request client**

Send only the public slug, optional capability header, canonical song fields, and an idempotency key. The server validates and hashes the canonical body and atomically commits operation record, queue insert, public revision, and PG notification. Never send or persist username, Account ID, owner credential, raw capability/query, or owner queue revision.

- [ ] **Step 4: Implement the request UI**

Render only when `allowSongRequests` is true. Keep one active search and one active submission, expose normalized error copy, and cancel obsolete work.

- [ ] **Step 5: Run focused frontend/backend tests**

Expected: PASS, including direct API rejection when the UI control would be hidden.

- [ ] **Step 6: Commit song requests**

```bash
git commit -m "feat(music): complete public song request flow"
```

### Task 11: Add revisioned live invalidation and fallback refresh

**Files:**
- Modify: `tunes/server/socket/musicSocketServer.ts`
- Modify: `tunes/server/routes/index.ts`
- Create: `tunes/server/services/musicPublicChangePublisher.ts` and `musicPublicChangeListener.ts` (or locally conventional names).
- Modify: every owner/guest/lifecycle mutation path named by Task 5's completeness table.
- Modify: socket, repository, route, and load tests.
- Create: `explorers-earth/src/features/music/publicMusicLiveClient.ts`
- Create: `explorers-earth/src/features/music/__tests__/publicMusicLiveClient.test.ts`
- Modify: `PublicMusic.tsx` and tests.

**Interfaces:**
- Produces socket events `{ version: "music-public-change/v1"; kind; revision }`.
- Produces `subscribeToPublicMusic({ publicSlug, capability, onInvalidate, signal }): PublicMusicSubscription`.

- [ ] **Step 1: Write failing server socket tests**

Cover public-slug read-only admission, unlisted capability admission, private/revoked rejection, room isolation, monotonic revisions, every mutation-table event kind, permission/publication/lifecycle revocation, reconnect storms, forbidden guest mutation events, rollback-no-event, commit-event, listener reconnect/fatal shutdown, and two-server fanout without Redis.

- [ ] **Step 2: Write failing browser live-client tests**

Use fake timers and a fake socket to prove burst coalescing, stale revision rejection, reconnect refetch, visibility/online refetch, bounded jittered backoff, foreground polling fallback, hidden/unmounted shutdown, and no duplicate concurrent fetches.

- [ ] **Step 3: Confirm RED**

Run focused server socket/load tests and browser live-client tests.

- [ ] **Step 4: Implement additive server invalidations**

Inside each repository transaction, advance Task 5's public revision and call transactional `pg_notify`. A dedicated reconnecting listener fans committed notifications to local Socket.IO rooms on every replica. Never put songs, capabilities, account IDs, or credentials in browser payloads. Recheck lifecycle/publication authority during admission and sensitive delivery. The mutation-to-revision table is the completeness oracle.

- [ ] **Step 5: Implement client invalidation/refetch**

Treat HTTP snapshot as canonical. Coalesce a burst into one refetch, compare revision, abort stale requests, and disconnect on component cleanup or revocation.

- [ ] **Step 6: Run focused, security, and load tests**

Expected: PASS within existing socket admission and fan-out thresholds; no cross-owner event delivery.

- [ ] **Step 7: Commit live synchronization**

```bash
git commit -m "feat(music): synchronize public permissions and playback live"
```

### Task 11A: Make public Music observable and incident-ready

**Files:**
- Modify/create Local Tunes public-Music structured logging/metrics adapter and tests, following existing injection conventions.
- Modify descriptor/resource/request routes and the PostgreSQL listener/socket boundary to emit safe outcomes.
- Modify Explorers public Music client/parser/live-client instrumentation and tests.
- Modify: `docs/operations/music-deploy-runbook.md`, `docs/tunes/websockets.md`, and troubleshooting/operator-query documentation.

**Contract:**
- Reuse `music-error/v1`, bounded `Retry-After`, and safe `X-Request-Id` propagation.
- Record low-cardinality descriptor/resource/request latency+outcome, parser rejection class, socket admission/disconnect/reconnect/invalidation, listener connected/reconnect/lag, fallback polling, and revocation enforcement.
- Never label or log slug, Account/User identity, capability, query, media URL, or credentials.

- [ ] **Step 1: Write failing observability and privacy tests**

Assert event names, bounded properties, request-ID propagation, normalized error envelopes, operator-query fields, and forbidden-value absence. Cover malformed parser responses, listener reconnect, socket rejection, fallback poll, and permission/publication revocation.

- [ ] **Step 2: Confirm RED with exact focused commands**

Run the named backend and frontend observability tests and record the missing events/envelopes as the expected RED reason.

- [ ] **Step 3: Implement instrumentation through injected adapters**

Use existing structured-console/metrics injection points. Do not introduce an unprovisioned monitoring platform or high-cardinality labels. The browser may show a sanitized support reference from `X-Request-Id`.

- [ ] **Step 4: Add executable canary gates and operator queries**

Initial gates, calibrated against the fixture load baseline: descriptor/resource p95 <500ms; public Music 5xx <2% for five minutes; listener disconnect <30s; notification-to-fanout p95 <2s; fallback polling <10% of active sessions for ten minutes. Any authorization leak, cross-owner event, or capability exposure is an immediate containment/rollback trigger.

- [ ] **Step 5: Run privacy, route, socket, parser, and load regressions**

Expected: exact safe metrics/logs and error contracts pass with no secret/authority value in captured telemetry.

- [ ] **Step 6: Commit observability and runbook work**

```bash
git commit -m "feat(music): add public surface observability"
```

### Task 12: Add safe analytics for public Music interactions

**Files:**
- Modify: public analytics event types/normalization utilities.
- Modify: `ProfileMusic.tsx`, `PublicMusic.tsx`, player/request/section components only at interaction boundaries.
- Modify/create analytics wiring tests.

**Interfaces:**
- Emits normalized event names and non-sensitive properties only.

- [ ] **Step 1: Write failing privacy and exactly-once tests**

Assert navigation, playlist open, playback start, request success/failure code, and unavailable state emit once. Assert serialized events never contain capability, raw query, media URL, credential, Account document ID, or public slug.

- [ ] **Step 2: Confirm RED**

Run public category analytics and new Music analytics tests.

- [ ] **Step 3: Implement event boundaries**

Track after user-visible acknowledgement, not on render. Preserve inbound UTM through friendly navigation using existing UTM/session helpers.

- [ ] **Step 4: Run analytics regression tests**

Expected: PASS with existing public category and UTM suites.

- [ ] **Step 5: Commit Music analytics**

```bash
git commit -m "feat(analytics): track safe public music interactions"
```

### Task 13: Build the browser E2E and visual verification matrix

**Files:**
- Modify: `explorers-earth/playwright.config.ts`
- Modify: `explorers-earth/package.json`, `.github/workflows/ci.yml`, and `.github/workflows/test.yml`.
- Modify: `explorers-earth/e2e/analytics.spec.ts`
- Modify: `explorers-earth/e2e/music-public-contract.spec.ts`
- Modify: `explorers-earth/e2e/music-fullstack.spec.ts`
- Modify: `explorers-earth/e2e/music-accessibility.spec.ts`
- Modify: `explorers-earth/e2e/profile-theme.spec.ts`
- Modify: `explorers-earth/e2e/profile-presentation-visual.spec.ts`
- Modify: `explorers-earth/e2e/setup/music.ts`
- Modify: root/package scripts for `music:test:public-fast`, `music:test:public-pr`, `music:test:public-e2e`, and `music:fixture:public:verify`.
- Modify: `docs/getting-started.md`, `docs/testing.md`, `docs/troubleshooting.md`, `docs/README.md`, API/OpenAPI examples, and WebSocket documentation.

**Interfaces:**
- Uses dedicated test-account state snapshot/restore helpers.
- Produces PR-safe read-only coverage and authorized live-write coverage as separate Playwright projects/tags.
- Uses a versioned guarded fixture with deterministic public, unlisted, private, suspended, tombstoned, all-content, empty, queue-only, playlists-only, history-only, request-allowed, and request-rate-limited states.

- [ ] **Step 1: Add failing analytics browser cases**

Cover Home 90-day label, failure-not-zero, custom ranges at boundary dates, 93/94 days, and request payload dates under browser timezone overrides.

- [ ] **Step 2: Add failing friendly/direct route cases**

Cover `/{username}/music`, public share, unlisted share, invalid capability, private publication, refresh, history navigation, wrong username, descriptor outage isolation, explicit-route unavailable behavior, first-view fallback, all owner publication/profile-preference quadrants, one-request availability resolution, canonical URLs, and unlisted `noindex`.

- [ ] **Step 3: Add permission pairwise and five live-toggle journeys**

Use a deterministic pairwise matrix for browser combinations and one owner/guest two-context test for each control. Each test snapshots state first and restores it in `finally`.

- [ ] **Step 4: Add player/request/live/reconnect cases**

Cover guest playback isolation, request acceptance/revocation/rate limit, queue/player update, publication-to-private, socket interruption, reconnect and refetch.

- [ ] **Step 5: Add responsive/theme/accessibility coverage**

Run the 24 structural theme/wallpaper combinations at component/visual-contract level, including valid/absent/failed imagery and footer/nav colors. Use deterministic pairwise viewport/browser E2E at 320px reflow, 375x667, 390x844, 768x1024, and 1440x900. Add 200% zoom, reduced motion, five long nav labels, and safe-area/player collision checks. Assert the last interactive control scrolls above the fixed nav.

Keep all 24 theme/wallpaper combinations as cheap DOM/token/contrast contracts. Commit six risk-based deterministic `toHaveScreenshot` baselines with documented thresholds and nondeterministic media masks: dark banner/full content, Minimal Light/solid, failed-image fallback, mobile reconnecting, 320px long-nav stress, and desktop full content. Failure-only captures cover the remaining pairwise journeys. Run contrast assertions separately.

Require axe plus explicit checks for one main landmark, heading order, link navigation with `aria-current`, WCAG AA contrast including custom colors, screen-reader announcements, complete keyboard path, 44px targets, and no two-dimensional scrolling.

- [ ] **Step 6: Run PR-safe E2E**

Run: `PLAYWRIGHT_PR_SAFE=true npm run test:e2e`.

Expected: all read-only suites pass; live-write suites are explicitly skipped, not silently absent.

Configure named `chromium-pr-safe`, `chromium-music-fixture`, `chromium-music-live`, and selected cross-browser visual projects. Install every claimed browser and update both workflows/scripts to invoke the new names. Live tests use an explicit runtime `test.skip` reason rather than `testIgnore`; traces/screenshots/video retain on failure. Add a configuration test proving PR jobs cannot acquire live-write authority. Document backend/PostgreSQL orchestration and `finally` cleanup, and cover public-versus-unlisted cache isolation.

- [ ] **Step 7: Run authorized live-write E2E**

Run the existing full-stack Music environment with the dedicated test identity. Confirm restoration by comparing the post-run snapshot to the pre-run snapshot.

The fixture bootstrap prints version, stable test Account document ID/username, sanitized URLs, lane, and evidence path. It refuses non-disposable targets. Teardown is idempotent, namespaced, runs globally and in per-test `finally`, saves a normalized before/after hash, and retains a sanitized recovery artifact on failure. Any restoration failure stops subsequent live-write tests.

- [ ] **Step 8: Commit E2E coverage**

```bash
git commit -m "test: cover analytics and public music end to end"
```

- [ ] **Step 9: Verify the discoverable developer path**

Run the four root public-Music commands from a clean warm fixture. Each prints fixture version, services/URLs, lane, result, cleanup result, and sanitized evidence path. Update the documentation index and copy-paste OpenAPI examples for descriptor/resource/request successes, `PUBLIC_NOT_FOUND`, `REQUEST_INVALID`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, idempotency replay/conflict, and socket admission/reconnect.

### Task 14: Full regression, UAT, and PR evidence

**Files:**
- Create: `docs/uat/2026-08-28-analytics-public-music-uat.md`
- Modify: PR description/checklist only after all evidence exists.

**Interfaces:**
- Produces reproducible verification commands, results, environment, screenshots/video references, and restored-state proof.

- [ ] **Step 1: Run Local Tunes verification**

From `tunes`, run `npm run check`, `npm test`, the Music critical coverage lane, repository integration coverage, OpenAPI/security contracts, and load qualification.

Expected: zero failures and required coverage thresholds met.

- [ ] **Step 2: Run Explorers verification**

From `explorers-earth`, run `npm run lint`, `npm run build`, `npm run test:unit`, Music critical coverage, i18n checks, and PR-safe E2E.

Expected: zero lint errors, successful production build, all unit tests passing, coverage thresholds met, and E2E green.

- [ ] **Step 3: Run timezone qualification**

Run analytics date suites under all five specified timezones and record exact pass counts.

- [ ] **Step 4: Perform two-context Chrome UAT**

Use the authenticated owner dashboard and logged-out guest page. Verify every control live, playlist visibility, queue/player changes, request flow, publication revocation, reconnect, all owner readiness states, five-slot navigation behavior, all themes, hero variants, and mobile/desktop sizes. Include the owner readiness checklist and a logged-out View as guest journey.

- [ ] **Step 5: Restore and prove account state**

Record the before/after normalized snapshot hash and list every test-created fixture removed. Do not claim UAT complete if restoration differs.

- [ ] **Step 6: Write the UAT evidence document**

Include commit SHA, commands, pass counts, skipped tests with reasons, tested URLs, viewport matrix, permission matrix, observed analytics events, screenshots/video paths, and remaining concerns.

Include a reviewer index: `requirement → test/lane → CI job → sanitized artifact → result → commit`. Map evidence to `docs-contracts`, `static`, `unit-coverage`, `contracts`, `database`, `security`, `frontend`, `browser`, `load-chaos`, and `image-deploy-contract`. Live-write UAT is non-PR and opt-in; PR-safe CI fails if its expected tests disappear rather than reporting an intentional skip.

- [ ] **Step 7: Run final diff review and secret scan**

Review `git diff origin/main...HEAD`, run repository secret scanning, confirm no unrelated Tune sync changes, and resolve every actionable review comment.

- [ ] **Step 8: Commit evidence and push**

```bash
git add docs/uat/2026-08-28-analytics-public-music-uat.md
git commit -m "docs: record analytics and public music UAT"
git push origin HEAD:codex/profile-settings-tabs
```

- [ ] **Step 9: Request final PR review and watch checks**

Comment `@codex review` on PR #103 after the pushed SHA is visible. Wait for all required checks and the fresh review. Investigate and fix any valid finding with the same red-green-verification process.

- [ ] **Step 10: Qualify rollout without production mutation**

In the guarded fixture, prove old-frontend/new-backend compatibility, migration readiness, and reversed-order isolation. Generate immutable image digest, commit SHA, compatibility evidence, smoke commands, canary queries/thresholds, and rollback conditions. Mark the PR `release qualified`, never `deployed`. Feature-branch agents cannot open `GATE_PROD`, mutate production, or treat local UAT as deployment authorization.

- [ ] **Step 11: Post-merge authorized deployment handoff**

Document, but do not execute from this PR, the protected-main operator sequence in `docs/operations/music-deploy-runbook.md` and `docs/testing/music-release-evidence-template.md`: deploy the attested Local Tunes image; record workflow URL/digest/SHA/operator approval; smoke descriptor, existing public/unlisted share, owner APIs, listener, and canary metrics; then deploy Explorers; smoke friendly/direct routes, analytics, navigation, and live invalidation; promote or roll back using recorded conditions. The protected workflow must refuse non-main deployment.

## Required Final Evidence Table

| Layer | Required evidence |
|---|---|
| Analytics unit | Five timezones, DST, leap day, 93/94-day boundaries |
| Home UI | loading, real zero, non-zero, unavailable, 90-day label |
| Music contract | strict DTO parsing and all 32 permission combinations |
| Music security | stable identity, no username authority, generic not-found, capability secrecy |
| Music integration | public/unlisted/private, lifecycle states, permission enforcement |
| Music live | all invalidations, reconnect, fallback polling, revocation, isolation |
| Component | player, request, queue, history, playlists, empty/error/stale states |
| Routing | friendly route, direct share, navigation, first view, fallback, history |
| Browser E2E | pairwise permissions, five live toggles, themes, heroes, viewports |
| Accessibility | axe, keyboard, focus, touch targets, reduced motion |
| Analytics/UTM | safe fields, exactly once, UTM preserved |
| UAT | owner and guest Chrome contexts, recorded evidence, restored account state |

## Stop Conditions

- Stop if implementation requires Strapi server code, Redis, or returning username-based Music authority; revise the design instead.
- Stop if a public API or event can reveal a capability, owner credential, internal numeric identity, or private publication existence.
- Stop if live-write E2E cannot restore the dedicated account exactly.
- Stop if the Music change overlaps unrelated user-sync work; isolate or coordinate before continuing.
- Do not merge while any required CI check, fresh PR review, or UAT restoration proof is missing.

## AUTOPLAN Independent Review Record

### CEO/product review

Accepted amendments: field-level permission truth table; deterministic five-slot Music navigation; two-switch owner readiness state machine; one shared availability resolver; explicit direct-route recovery; one public revision; executable backend-first compatibility gates; exact inclusive 90-day definition. Deferred low-value expansion: no new product surface beyond View as guest/readiness affordances and canonical metadata.

### Design review

Accepted amendments: typed Earth-loader ownership; shared profile chrome/theme provider; exact Music information hierarchy and breakpoints; atomic-resource visible-state table; fixed-nav/safe-area contract; six-theme/four-wallpaper structural coverage; six risk-based screenshot baselines; owner readiness copy; link navigation semantics; focus/revocation behavior; WCAG/zoom/reflow/screen-reader acceptance. The guest page explicitly avoids copying the bordered owner-workspace card stack.

### Engineering review

Accepted amendments: append-only public revision migration and deployment contracts; PostgreSQL transactional `LISTEN/NOTIFY` multi-replica fanout without Redis; mutation completeness oracle; server-side guest idempotency; dedicated no-internal-ID public schemas; SQL/payload bounds; route-keyed readiness; TanStack Query cache/race rules; branch isolation from Tune user-sync; concrete observability; named Playwright projects; additive versioned endpoint preserving legacy clients.

```text
L0 static/security → L1 pure/unit/property → L2 real PostgreSQL
  → L3 HTTP/OpenAPI/Socket contracts → L4 React route/component
  → L5 PR-safe browser → L6 fixture full-stack
  → L7 authorized live-write/UAT → L8 protected-main canary
```

### Developer-experience/operability review

Accepted amendments: PR qualification separated from protected-main production deployment; expired temporary direct-deploy path not revived; dedicated instrumentation task; versioned guarded fixtures and restoration failure containment; four discoverable root commands; existing error/request-ID contract reuse; exact command/evidence requirement; requirement-to-CI-artifact index; protected rollout handoff and rollback evidence.

### Outside Codex review

Accepted amendments: additive `music-public-resource/v1` endpoint and required DTO version; frozen legacy-client compatibility; server-owned date-only/IANA-timezone analytics boundary; stable share URL as rename-safe SEO canonical; explicit polling schedule; workflow/project wiring; reduced screenshot portfolio while retaining all 24 structural contracts.

### Decision audit trail

| Decision | Resolution | Reason |
|---|---|---|
| Review posture | Selective expansion | Complete correctness/operability without adding unrelated product surfaces |
| Music authority | Local Tunes by stable Account document ID | Username remains presentation, never authority |
| Friendly vs share URL | Friendly route in profile; stable share is SEO canonical | Preserves UX and rename-safe identity |
| Live fanout | PostgreSQL transactional LISTEN/NOTIFY | Commit-safe, multi-replica, no Redis |
| Resource rollout | Additive v1 endpoint; legacy unchanged | Makes backend-first deployment compatible |
| Permission coverage | 32 contract cases + pairwise E2E + five live journeys | Exhaustive logic with bounded browser cost |
| Visual coverage | 24 DOM/token/contrast contracts + six screenshots | Detects theme regressions without baseline explosion |
| Deployment | Pre-merge qualification, protected-main operator rollout | Matches repository production authority |
| Strapi/Redis | No code changes / no Redis | User-approved constraints preserved |

## GSTACK REVIEW REPORT

| Run | Status | Findings absorbed |
|---|---|---:|
| CEO/product independent subagent | DONE_WITH_CONCERNS → RESOLVED | 7 required, 2 low-cost expansions |
| Design independent subagent | DONE_WITH_CONCERNS → RESOLVED | 5 P1, 7 P2 |
| Engineering independent subagent | DONE_WITH_CONCERNS → RESOLVED | 3 P0, 7 P1/P2 |
| DX/operability independent subagent | DONE_WITH_CONCERNS → RESOLVED | 3 P1, 5 P2 |
| Codex outside voice | NOT_READY → RESOLVED | 2 P0, 5 P1, 1 scope reduction |

VERDICT: APPROVED FOR TDD EXECUTION after the mandatory isolation/migration-marker preflight. Product premises, UI states, security boundaries, rollout compatibility, test topology, UAT restoration, and protected deployment authority are explicit.

NO UNRESOLVED DECISIONS
