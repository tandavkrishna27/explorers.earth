# Ticket 4.2: Games

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.


**Current finite status (2026-10-05):** Manual Games slice independently reviewed, committed and pushed at46eea549d0d2661424a3dd2b8d71cee38cc47f30, with exact committed canonical82 acceptance and separate native Games checks. Later1a5c image/C0 hosted validation succeeded. Full IGDB/provider parity, required broader browser QA, operational QA and release remain open. Earlier commit-preparation wording is historical. See [checked status](../current-status-2026-10-05.md).

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-04.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** partial. **Technical inputs:** 3.1, 3.2. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Preserve committed manual Games 46ee; package G-provider owns IGDB, search and taxonomy parity with explicit provider access.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** Epic 3 shared contracts; can follow 4.1 sequentially without new infrastructure. **Produces:** Games data mapper and server-owned provider access.

**Existing:** `explorers-earth/src/features/Games/api/query.ts`, `api/mutation.ts`, `components/dashboard/AddGamePage.tsx`, `GameListView.tsx`, `GamesHome.tsx`, `components/public/PublicGames.tsx`, `PublicGamesGenre.tsx`, `PublicGamesList.tsx`; `explorers-earth/src/services/igdbService.ts`, `src/types/igdbTypes.ts`.

**Create:** `tunes/server/explorers/categories/games.ts`, `tunes/server/explorers/providers/igdb.ts`; `explorers-earth/src/features/Games/api/explorersAdapter.ts`; `tunes/server/test/explorers/games.test.ts`, `games.integration.test.ts`; `explorers-earth/e2e/replatform/games.spec.ts`.

**Behavior contract:** Retain IGDB ID, source URLs/image IDs, platforms, genres, release information, modes, developer/publisher and media. Browser requests bounded catalog searches; server owns Twitch credentials/token refresh. Existing `VITE_IGDB_CLIENT_SECRET` usage must disappear from runtime browser code and build inputs. Missing credentials must produce a truthful unavailable state, never a fabricated successful catalog response.

**Provider interface:** extend `explorersCatalogRoutes.ts` with GET `/catalog/games?query=...&cursor=...`; `tunes/server/explorers/providers/igdb.ts` exports `searchGames(actor:Actor,input:{query:string;cursor?:string}):Promise<Page<GameCatalogCandidate>>`, sharing Epic 3 catalog error/candidate conventions. Candidate carries `provider:'igdb'`, `externalKind:'game'`, `externalId:string` and mapped metadata. Query length 1–200 and page size 24; server constructs IGDB queries rather than accepting caller query syntax. Resolve through the canonical `resolveEntity` provider registry, extending its allowlist in this ticket.

- [ ] Add tests `provider_credentials_never_enter_browser_dto`, `token_refresh_is_shared_under_concurrency`, `provider_429_is_recoverable`, and `platforms_and_genres_round_trip`.
- [ ] Replace client-side token acquisition through the Epic 3 catalog boundary; coordinate removal of corresponding workflow/build secret injection in the same ticket.
- [ ] Execute the common cycle, then scan built JavaScript/source maps for the old secret variable and a nonsecret sentinel used in the test build. No real secret needs to be printed or logged.
- [ ] Run frontend unit tests filtered to `src/features/Games src/services/__tests__/igdbService`; backend commands with `games`; existing/new `games.spec.ts` via the respective configs.
- [ ] UAT: search, select, create list, edit rating, filter platform/genre, reorder, anonymous detail, provider failure. QA real IGDB lookup is reported separately from fixture lookup.
- [ ] In `games.test.ts`, run ten concurrent catalog requests with an expired server token and assert exactly one refresh; provider 429 produces the shared rate-limit/upstream error rather than empty success. In `games.integration.test.ts`, save two platform/genre values, reload, and assert both survive without converting provider rating into creator rating.
- [ ] In the real Games browser spec, fail the provider after typing a note, assert the draft remains, recover provider lookup and save once. Fetch uploaded cover bytes as owner/public after publication and assert another-owner attach is rejected. Run `npm --prefix explorers-earth run test:unit -- src/features/Games/api/__tests__/explorersAdapter.test.ts` in addition to existing units.

**Acceptance gate:** search→resolve→save→public view works; client build contains no IGDB credential input or server token; fixtures and actual QA provider smoke are reported separately.

## Current Games delivery status (2026-10-05)

The additive A3M manual native Games slice is locally qualified and independently reviewed. Current104 source freeze b76b20edc744cfcf517e34b15df1fbe4e90c040c693bbc23d9f5bee6c2ec579e has4231 frontend tests/0fail/0skip, types/build/lint0errors (1658 retained warnings), source-bound frontend image and JavaScript/sourcemap retirement checks, and actual canonical protected82 PASS (auth6/profile2/Books20/lifecycle10/Movies24/Games20; retries0; source/artifact/owned cleanup guards passed). This qualifies delivered manual behavior, not completion of Ticket4.2.

Hosted qualification of the proposed commit remains pending. Full IGDB acquisition/import/live-provider/media/taxonomy parity remains open; unavailable provider behavior is truthful. Ticket3.5 operational QA/full parity and production release remain separate. No next category batch begins before the agreed consolidation/discussion. Historical intermittent Books cover/paging and Games publication/reader failures remain preserved with unproved causes; a later canonical pass does not erase them.


## Independent review correction (2026-10-05)

The earlier category-batch hold records historical failure diagnosis. It is superseded for read-only field mapping and package preparation by the re-groomed plan. Production category writes still require exact shared-contract handoff and independent review; this does not erase original red required consumers or approve a full category batch.

### The Games provider is dead code behind an unconditional 503 — this surface is NOT provider parity

**What is delivered.** The manual Games slice is real: `explorers-earth/e2e/replatform/games.spec.ts` declares **10** `test(` cases and `games.playwright.config.ts` declares **2** projects (`games-desktop`, `games-mobile`), i.e. **20 identities**, both files committed and clean, matching the `games` lane in the committed `suite-manifest.json` and `games:{count:20}` at `scripts/replatform-e2e.mjs:11`. Browser-credential retirement is also delivered: `explorers-earth/src/services/igdbService.ts` is a **pure mapper** — it contains no `fetch`, no `clientSecret` and no `import.meta.env` read — and the retirement is backed by a built-JavaScript/sourcemap scan as `:44` requires.

**What is NOT delivered, stated plainly so the surface is not mistaken for provider parity.** The mounted Games catalog route **can never succeed**:

- `tunes/server/application/catalog.ts:35` — `searchGames(actor,input)` authorizes, parses the input with `gameCatalogRequestSchema`, and then **`throw new GameCatalogFailure()` unconditionally** (503 `PROVIDER_UNAVAILABLE`, per `tunes/server/services/gameCatalogTypes.ts:7`). There is no credential check, no feature flag and no branch — every call throws.
- `tunes/server/application/catalog.ts:41` — `resolveEntity` does the same for `kind:'provider', category:'games'`: `throw new GameCatalogFailure()` before any provider work. So `resolveProviderGameSchema` (`tunes/shared/explorersContract.ts:88`) parses, and then resolution is refused.
- Meanwhile a **complete IGDB/Twitch implementation exists with no production call site**: `tunes/server/services/gameCatalog.ts` (class `GameCatalog` at `:18`, with bounded paging, cursor expiry, rate limits, per-page authorization re-checks and `resolve`) and `tunes/server/services/gameProviderTransport.ts` (`createGameProviderTransport` at `:61`, with shared token flight, DNS/private-address denial, fixed provider URLs and body limits). The **only** constructors of either are tests — `tunes/server/test/game-catalog.test.ts:8,20,31` instantiate `new GameCatalog(...)`, and `tunes/server/test/game-provider-transport.test.ts:3,11-18` call `createGameProviderTransport(...)`. `CatalogService` never does.

The 503 is **truthful today** and must stay truthful: `:38` requires that missing credentials produce an unavailable state and never a fabricated successful catalog response. Do not replace the throw with a stub, a fixture response or an empty success.

- [ ] **Package G-provider owns the wiring**, and this is now an explicit part of its scope: construct `GameCatalog` with `createGameProviderTransport` and inject it into `CatalogService`, replace the unconditional throw at `catalog.ts:35` with a real delegation, and extend `resolveEntity`'s provider allowlist at `catalog.ts:41` so `kind:'provider', category:'games'` resolves instead of refusing (as `:40` already mandates: "Resolve through the canonical `resolveEntity` provider registry, extending its allowlist in this ticket"). Keep the 503 as the correct response for genuinely missing credentials after wiring.
- [ ] **The typed `GameProviderFacts` contract cannot round-trip — the provider package owes a migration.** `tunes/shared` has **no `game_entity_details` table in any of the 38 migrations** (`0001`–`0038`; a repo-wide search for `game_entity_details` under `tunes/` returns nothing). The IGDB ID, source URLs/image IDs, platforms, genres, release information, modes and developer/publisher fields required at `:38` have **no typed storage**, so `platforms_and_genres_round_trip` is not merely untested — it is currently unimplementable. G-provider must author the next append-only migration together with the wiring; a mapper without storage is not parity.
- [x] **All four mandated provider test names are absent by name** (0 non-documentation hits repo-wide, each): `provider_credentials_never_enter_browser_dto`, `token_refresh_is_shared_under_concurrency`, `provider_429_is_recoverable`, `platforms_and_genres_round_trip`. Behavior resembling the middle two exists in `game-provider-transport.test.ts:11` (one token flight across ten callers) and `game-catalog.test.ts`, but the named cases required at `:42` have no named assertion, so per-assertion traceability is owed.

  **Traceability map produced 2026-10-09**, which is what `:42` actually owes. Three of the
  four were already covered under different names; one had a genuinely missing half.

  | Mandated name | Where the behaviour is asserted |
  |---|---|
  | `provider_credentials_never_enter_browser_dto` | `game-provider-transport.test.ts` — *"fixed URLs own headers and secrets stay out of URL/DTO"*, plus *"rejects distinct credentials before cached/inflight attachment and never emits fingerprint"* and *"missing credentials deny before lookup and request creation"*. The **build-input** half of the same concern is now `src/test/__tests__/igdbBuildInput.test.ts` (see below). |
  | `token_refresh_is_shared_under_concurrency` | `game-provider-transport.test.ts` — *"shares one token flight across ten callers with truthful four starts and no hidden queue"*, with the edges in *"32 waiter cap is finite and 33rd fails before attaching"*, *"cancelled sole token waiter cannot publish late token"* and *"old 401 cannot invalidate newer token generation"*. Covered more thoroughly than the name implies. |
  | `provider_429_is_recoverable` | **Written 2026-10-09 under that exact name**, in `game-provider-transport.test.ts`. A first catalog call takes a 429 with `Retry-After: 2`, the clock advances past the window, and a second call returns real rows. The assertion that carries it is the token count: a 429 must **not** invalidate the cached token, so exactly one token flight happens across both calls - which is what separates a recoverable rate limit from a 401, and the neighbouring case shows a 401 *does* invalidate. Mutation-checked: adding the 429 failure to `unauthorizedResponses` fails this case and only this case. The pre-existing halves stand beside it - *"429 is not empty success"* for classification, and `game-catalog.test.ts`'s *"failed page spends attempt but retries same offset without dropping prior rows"* for the catalog-level retry. |
  | `platforms_and_genres_round_trip` | `game-catalog-contracts.test.ts` — *"retains zero raw rating/count/epoch and provider names/order independently"* pinned `platforms` with id and name. **`genres` had no assertion anywhere**; its only other mention in the Games suites is `games.test.ts:63`, as a *rejected* extra key. Added 2026-10-09 to the same case, together with the empty `gameModes`, since absent-versus-empty is how a mapper starts inventing terms. |

  So the naming gap is closed as traceability where behaviour already existed - rather than
  by renaming existing cases, which would have churned four suites for no behavioural gain -
  and by writing the two halves that genuinely had no assertion: `genres` round-tripping, and
  the 429 recovery path. **All four names now resolve to a real assertion**, and two of them
  are mutation-checked.

- [ ] **`VITE_IGDB_*` is still declared as a build input, which `:38` forbids.** `explorers-earth/e2e/general.vite.config.ts:25-26` still defines `import.meta.env.VITE_IGDB_CLIENT_ID` and `import.meta.env.VITE_IGDB_CLIENT_SECRET` (both as `''`). `:38` requires that "Existing `VITE_IGDB_CLIENT_SECRET` usage must disappear from runtime browser code and build inputs" — runtime browser code is clean, **build inputs are not**. Empty values do not satisfy the obligation; the declarations must go, and `:43` makes removing the corresponding workflow/build secret injection part of this ticket.

### "Canonical 82" is the whole six-lane suite, not the Games lane

The Games lane is **20**. The committed `explorers-earth/e2e/replatform/suite-manifest.json` totals **82** across six lanes: auth **6** + profile **2** + books **20** + lifecycle **10** + movies **24** + games **20** = 82. `:54` of this ticket already decomposes it correctly; the status line at `:4` ("exact committed canonical82 acceptance") is **whole-suite** acceptance and is corrected here to say so, because read as a Games figure it overstates the lane **4×**. Any wording in this ticket, or quoting it, that presents 82 as a Games count is wrong — and it is doubly wrong to count 82 as Games while separately counting its Books-20 and Movies-24 components elsewhere. Use "Games lane: 20 identities" and "canonical suite: 82 identities across six lanes" as the only correct forms.
