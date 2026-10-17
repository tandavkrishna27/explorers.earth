# Ticket 8.2: Remove duplicate Tunes frontend

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-08.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** waiting. **Technical inputs:** 8.1. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Consolidate approved API-only/Music topology after retirement; retain security and role boundaries.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Prerequisite:** 8.1; API-only 1.4; Explorers Music acceptance complete.

**Files:** remove `tunes/client/`, frontend-only `tunes/vite.config.ts` and Vite-serving code after import audit; modify `tunes/package.json`/lockfile, Dockerfile, TypeScript/Vitest configuration, root commands, fixture build scripts and CI scripts referencing client tests. Keep any UI library still imported by server tooling until dependency resolution proves unnecessary.

**Interface produced:** backend has no duplicate frontend build or runtime dependency. Explorers owns corresponding client behavior tests.

- [ ] Map every deleted test, particularly `client/src/lib/musicCredential.test.ts` and `musicPublicationClient.test.ts`, to retained Explorers equivalents. Preserve retry, credential expiry, public capability and idempotency assertions; document genuinely retired behaviors.
- [ ] Remove client/config/imports and regenerate lockfile reproducibly. Do not make unrelated dependency upgrades.
- [ ] Run API build, production graph smoke, contract/unit/database suites, critical coverage using updated source paths, and Explorers owner/guest/reconnect/publication browser scenarios.
- [ ] Inspect packaged image for removed UI assets and verify health/API errors still correct. Commit separately from rename. **Gate:** removal loses no retained behavioral coverage and no runtime imports resolve into client.


## Independent review correction (2026-10-05)

**Verdict: NOT-STARTED.** All requirements and gates above are retained. This section records exactly where the duplicate frontend still lives, and corrects the ticket's implied risk profile: **product risk is lower than the ticket implies, and CI-gating risk is higher.**

### Where the duplicate frontend still lives

- **It exists.** `tunes/client/` is present with **162 tracked files**.
- **It is the Vite root.** `tunes/vite.config.ts:31` sets `root: path.resolve(__dirname, "client")`.
- **It is built.** `tunes/package.json:18` defines `"build": "vite build && esbuild …"`, reached from the root workspace by `package.json:14` `build:all` (`npm run build --prefix tunes && …`).
- **It is served.** `tunes/server/index.ts:20` wires `setupVite`; `tunes/server/runtime.ts:18` exports `serveStatic`; `tunes/server/config/music-startup.ts:124` selects `runtime.serveStatic(app)`.
- **It is still CI-gated.** `.github/workflows/test.yml:70` runs `test:music-critical-coverage --prefix tunes`, and that script at `tunes/package.json:36` includes `client/src/lib/musicCredential.test.ts` and `client/src/lib/musicPublicationClient.test.ts` with `--coverage.thresholds.perFile=true` and lines/branches/functions/statements all at **100**, with `client/src/lib/musicCredential.ts` and `client/src/lib/musicPublicationClient.ts` in `--coverage.include`.

### It is NOT in the shipped image

- `tunes/Dockerfile:40` runs `npm run build:api` (not `build`), and `:74` is `CMD ["node", "dist/server/api.js"]`.
- `tunes/server/test/contracts/api-only-build.test.ts:119` asserts the esbuild metafile contains **no** input matching `client/`, `vite.config.ts` or `server/vite.ts`.

So production does not ship this client. The ticket's framing — remove a duplicate frontend that users could be served — overstates the product exposure. What the ticket **understates** is that two of its deletion targets currently hold 100%-per-file coverage thresholds inside a required CI lane, so deleting them without re-homing them will either break `test:music-critical-coverage` or silently drop a 100% gate.

### Required removal order

This ordering is a gate, not a suggestion. Any other order either deletes coverage-gated behavior with no replacement, or breaks a required lane:

- [x] **First**, re-home `client/src/lib/musicCredential.test.ts` and `client/src/lib/musicPublicationClient.test.ts` to retained Explorers equivalents, including their `--coverage.include` targets, and update `tunes/package.json:36` so `test:music-critical-coverage` still names real files at 100% per-file thresholds. A reduced threshold, a removed `--coverage.include` entry or a dropped test file is a weakened gate, not a completed removal.

  **Audited 2026-10-09: the re-homing is already done, and this step needs no new tests.**
  The ticket assumes the Explorers equivalents must be written. They exist, and so does an
  equivalent gate.

  `explorers-earth/package.json:27` defines its **own** `test:music-critical-coverage`,
  and `.github/workflows/test.yml:71` runs it immediately after the tunes one at `:70`.
  It holds `src/lib/musicCredentialStore.ts`, `src/lib/localTunesApiClient.ts` and
  `src/features/music/publicMusicClient.ts` at `perFile` 100% on lines, branches,
  functions and statements - the same shape as the tunes lane. So removing the two client
  files from the tunes lane does not reduce the number of 100%-gated client modules in CI;
  it removes a duplicate.

  Behaviour mapping, by the four properties the ticket names:

  | Property | Retained in |
  |---|---|
  | Credential expiry, mint de-duplication, fail-closed with no proof, abort on authority change | `src/lib/__tests__/music-critical-client-coverage.test.ts`, `musicCredentialStore.test.ts`, `musicApi.startup.test.ts`, `musicIdentityCoordinator.test.ts` |
  | Retry | `usePublicMusicResource.ts`'s `loadPublicMusicWithTransientRetry`, covered by `usePublicMusicResource.test.ts` and `publicMusicClient.test.ts` |
  | Public capability | `publicMusicClient.test.ts` ("keeps an unlisted capability out of the URL and sends no owner credential", "rejects malformed slugs before the network and ignores malformed capabilities") and `PublicMusic.test.tsx` ("retains a scrubbed unlisted capability for a same-tab remount", "applies canonical live refetches and removes revoked content and capability") |
  | Idempotency | `musicPublicationCommandRegistry.test.ts`, `musicPublishOperationStore.test.ts`, `musicPublishCoordinator.test.ts` |

  **Genuinely retired, to be documented rather than ported - the mechanism changed.** The
  tunes client acquired a guest capability through an explicit out-of-band *prompt* and a
  header-only handoff it could rotate and revoke (`guestCapabilityHandoff`,
  `importGuestMusicCapability`, `acquireGuestMusicCapability`,
  `GuestCapabilityRequiredError`, and the "hidden prompt" and "cancelled prompt" cases).
  Explorers has none of those symbols. It takes the capability from the URL fragment,
  scrubs it, and keeps it in `sessionStorage` under a **per-slug** key
  (`explorers.music.unlisted-capability.v1:<publicSlug>`, `pages/public/PublicMusic.tsx:20-38`).
  So "never reuses A's authority on B" is now structural - separate keys - rather than a
  runtime check, and there is no prompt to cancel. Those cases describe a flow that no
  longer exists; they are not uncovered behaviour.

  What remains for this step is therefore mechanical and belongs with the deletion: drop
  the two files from the tunes script's test list and its two `--coverage.include`
  entries. Nothing needs writing first.
- [ ] **Then** remove the Vite build path: `tunes/package.json:18` `build`, `tunes/vite.config.ts`, `tunes/server/index.ts:20` `setupVite` and the `serveStatic` branch at `tunes/server/config/music-startup.ts:124` / `tunes/server/runtime.ts:18`. Reconcile `package.json:14` `build:all` in the same change.
- [ ] **Then** delete `tunes/client/` and regenerate lockfiles reproducibly, with no unrelated dependency upgrades.
- [ ] Retain `api-only-build.test.ts:119` as the post-removal regression: it must still pass, and must not be relaxed to accommodate the removal.

**Why steps 2-4 are one atomic change, measured 2026-10-09.** They cannot be sliced, and
the two obvious slices both fail:

- *Delete only the two coverage-gated files.* `client/src/lib/musicCredential.ts` has
  **nine importers inside `client/src`** - `components/guest-capability-import.tsx`,
  `components/playlist-table.tsx`, `components/search-songs.tsx`,
  `hooks/use-auth-compat.tsx`, `hooks/use-auth.tsx`, `hooks/use-neon-user.ts`,
  `hooks/use-strapi-auth.tsx`, `hooks/use-websocket.tsx` and `lib/queryClient.music.test.ts`.
  `tunes/package.json:18` `build` still runs `vite build`, so deleting them breaks that
  build.
- *Remove the serving path first.* The two entrypoints differ exactly here:
  `server/api.ts:14` passes `apiOnly: true` and gets a typed 404 catch-all, while
  `server/index.ts` passes nothing and so reaches `setupVite` in development or
  `serveStatic` in production (`config/music-startup.ts:121-124`). Removing that branch
  changes what `npm start` and `npm run build` produce, which is pinned by the deployment
  contracts - `api-only-build.test.ts`, the compose-safety manifest, the image-digest
  contracts and 46 release-authority cases.

So the change is: drop the two script entries, delete `client/`, remove the Vite branch
and reconcile `build`/`build:all`, in one commit.

**What it needs that this session could not provide**, and the reason it is left for
whoever can: the ticket's own gate requires a packaged-image inspection, a production
graph smoke and the Explorers owner/guest/reconnect/publication browser scenarios. Those
need Docker image builds and the browser lane. Landing the deletion without them would be
an unverified change to a deployment path, which is worse than leaving it.

One useful side effect to expect: the duplicate client is where roughly 138 of the
pre-existing `tsc -p tunes/tsconfig.json` errors live, so removal should move that
baseline to near zero. Do not treat that drop as a regression in the error count.
