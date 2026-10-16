# Ticket 2.3: Profile/onboarding integration

> **Current status and dispatch (2026-10-09):** Read [the two-tree reconciliation](../reconciliation-2026-10-09.md) and [the reconciled sequence](../../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Earlier verdicts/execution cards below are historical; requirements and checkboxes remain binding and do not record completed runs.

**Status:** consult the [durable implementation ledger](../../../.superpowers/sdd/epic-01/progress.md); checkboxes below do not assert implementation status.

[Parent epic and shared contracts](../epics/epic-02.md) · [Master plan](../implementation-plan.md) · [All tickets](../ticket-index.md) · [Shared execution checklist](../execution-checklist.md)

## 2026-10-05 execution amendment

Read the [re-groomed dependency and ownership plan](../../superpowers/plans/2026-10-05-replatform-regroomed-execution.md), including this ticket's all-ticket disposition, before allocation. Preserve the implementation and acceptance requirements below. Canonical producer, active consumer, fixture, real-backend evidence and exact-commit hosted status must be tracked separately; missing future producers are dependencies, never fixture waivers. Every new delegated assignment uses a fresh agent. Proposed original paths/commands must be checked against current source before execution.

## Current execution card

**Disposition:** complete. **Technical inputs:** 2.2. Dependencies refer to reviewed interfaces for partial packages; complete-ticket acceptance retains all original gates.

**Next package:** Preserve the accepted 2.3 scope; new navigation overlay belongs to repair review, not reopening this ticket. **Correction (2026-10-05):** `8ce52776` is the acceptance-time **hosted head**, not the delivering commit — delivery is `79edeea8`. See [Independent review correction (2026-10-05) — acceptance SHA relabelled](#independent-review-correction-2026-10-05--acceptance-sha-relabelled) below.

**Ownership:** The ticket owns its category/feature files listed below. Shared schema, migration identifiers, route registration, auth clients, Settings, seeds and protected manifests require coordinator allocation before any writer starts. Do not dispatch overlapping writers.

**Execution gate:** Verify listed paths and actual package scripts against current source; classify proposed tests as to-create, never executed. Record the exact failing behavior before changing production code; run focused automated regressions, canonical real-backend/browser acceptance, fresh independent review, then commit/push and exact-SHA hosted checks. Preserve source/dependency hashes, counts/skips, first failure and owned-resource cleanup. Historical acceptance is retained, not rerun by default. External inputs and deployment authority remain explicit gates.

**Current commands:** Read the [command custody correction](../command-custody-2026-10-05.md). Historical generic suite/project/environment commands are proposed interfaces, not supported current runner flags; original behavior obligations remain required.

## Required context

Read the [authoritative database schema](../target-database-schema.md) and apply the [shared execution checklist](../execution-checklist.md) to affected surfaces. Apply the parent epic's global constraints, shared interface definitions, review focus and test-harness prerequisites. Those contracts are maintained once in the epic, rather than copied into thirty-eight potentially conflicting versions. Existing files refer to the pinned audit source; paths labelled create/new were proposed when authored. Commands and checkboxes specify required verification, not completed runs.

## Implementation and acceptance

**Depends on:** 2.2. This ticket delivers the base upload service required for profile parity; 3.2 extends it to recommendation/catalog usage, so Epic 2 has no dependency on Epic 3.

**Grooming focus:** inspect the actual Profile, Settings and onboarding payloads, including blank optional enum values, before finalizing validators. Exercise two tabs and repeated saves against the real API; prove public/private profile and media cache transitions, concurrent attachment/deletion and durable orphan cleanup. Complete the full affected frontend regression selection before review, with base-commit proof for any claimed preexisting failure. The hosted fixture and runtime image gates remain separate from local tests.

**Create:** `tunes/server/application/profiles.ts`, `tunes/server/routes/explorersAccountRoutes.ts`, `tunes/server/repositories/explorersAccountRepository.ts`, `explorers-earth/src/lib/explorersApiClient.ts`, `explorers-earth/src/features/Profile/api/profileClient.ts`, `tunes/server/test/explorers-profile.integration.test.ts`, `explorers-earth/e2e/replatform/profile.spec.ts`.

**Also create here:** `tunes/server/application/media.ts`, `tunes/server/repositories/mediaRepository.ts`, `tunes/server/services/objectStorage.ts`, `tunes/server/routes/explorersMediaRoutes.ts`, `tunes/server/test/explorers-media.integration.test.ts` and media persistence through an append-only migration. Implement the shared `createMedia`/`deleteMedia` contract for profile/avatar/background purposes, MIME/size validation, owner attachment/deletion, storage rollback cleanup and private delivery. Modify `explorers-earth/src/hooks/useFileUpload.ts` and `explorers-earth/src/features/Profile/components/ImageUpload.tsx` here. Ticket 3.2 extends these files rather than creating a second upload system.

**Modify:** `explorers-earth/src/pages/OnBoarding.tsx`, `explorers-earth/src/pages/onboardingAccountDecision.ts`, `explorers-earth/src/pages/onboardingFinalizeLock.ts`, `explorers-earth/src/features/Profile/components/ProfileForm.tsx`, `explorers-earth/src/features/Profile/components/FeedFields.tsx`, `explorers-earth/src/features/Profile/api/query.ts`, `explorers-earth/src/features/Profile/api/mutation.ts`, `explorers-earth/src/features/Authentication/hooks/useCurrentUser.ts`, `tunes/server/publicProfile/publicProfileService.ts`, `tunes/server/routes/explorersPublicProfileRoutes.ts`.

**Contract:** `GET /api/explorers/v1/me`, `PATCH /api/explorers/v1/account` with revision; `getMyProfile(actor:Actor): Promise<AccountDto>` and `updateAccount(actor,input & RevisionInput,context): Promise<AccountDto>` live in `application/profiles.ts`. Owner profile reads authorize `profile:read` for OAuth credentials and active membership for web sessions; public `getCreatorProfile` is a separate projection and cannot implement an owner-profile tool. AccountDto includes onboarding status, handle, profile field values, category flags, appearance/navigation preferences and revision. Preserve public profile Yes/category No/auto-pinning true defaults as semantic booleans internally; adapters retain current view-model shapes.

Define `UpdateAccountInput` in `shared/explorersContract.ts` as the explicit editable subset of AccountDto; the service signature is `updateAccount(actor:Actor,input:UpdateAccountInput & RevisionInput,context:RequestContext):Promise<AccountDto>`. Reject unknown fields and attempts to write owner IDs, lifecycle status or server revision. The public profile PostgreSQL adapter is created here as `tunes/server/publicProfile/postgresPublicProfileGateway.ts`, satisfying the existing public service's shell contract without importing the not-yet-created Epic 3 discovery module. Epic 3 extends that adapter for Books/category data. Before 2.4 connects the final Google UI, 2.3 browser tests use only the isolated development/CI session fixture from Epic 1; real Google profile flow is a combined 2.4/Milestone 1 acceptance case, not a backwards implementation dependency.

- [ ] Add failing tests for normalized handle collision/reserved route, concurrent saves, blank optional fields, lost-update rejection and public redaction; preserve baseline localized content, theme/feed/social/address and contact visibility field coverage from the schema inventory. Assert two distinct handles differing only by case cannot both commit, and an update at revision N fails after another update commits N+1.
- [ ] Implement repository/service/route, PostgreSQL public shell adapter and a compatibility view-model mapper in `profileClient.ts`; existing `documentId` UI fields may temporarily carry canonical IDs, clearly marked adapter-only. No persisted schema uses Strapi names solely to satisfy components. Move the public-place saved-media URL allowlist change forward to this ticket so profile/public media can render at Milestone 1: accept only the configured same-origin `/api/explorers/v1/media/` content route; retain provider-specific external media rules separately. Add the regression to `explorers-earth/src/features/PublicHome/components/__tests__/PublicHome.place-image.test.tsx`; Epic 7 broadens cross-category coverage rather than first enabling the new URL.
- [ ] Replace profile/onboarding data calls, preserving `ProfileSaveResult` deferred-save semantics and existing cross-tab completion behavior. Implement the base media service and profile photo/background wiring here; add failing unauthorized/invalid-upload/storage-failure tests before its implementation.
- [ ] Run profile integration, existing Profile save/cross-tab tests and `replatform/profile.spec.ts` on real local API at desktop/mobile widths. Commit. **Done:** onboarding and complete settings round-trip after reload, public policy holds, layouts match baseline.

**Frontend consumer closure (2.3):** also modify `explorers-earth/src/components/Header.tsx`, `Sidenav.tsx`, `store/useSetupStore.ts` and the account/profile readers in `pages/Home.tsx`, `pages/Favorites.tsx`. Read [frontend auth gap review](../frontend-auth-gap-review.md) for exact source findings and existing test paths.

- [ ] Header/sidebar/public links use canonical account handle/avatar, never Google display name or `accounts[0]`. Test incomplete onboarding, handle/avatar edit, reload and late A response after B login.
- [ ] Derive setup completion from canonical account state; scope/reset walkthrough state per account. Test B cannot inherit A's completion or pinned navigation, and onboarding failure is retryable rather than mistaken for incomplete data.


**Verified completed status:** Original2.3 accepted2026-10-01 at8ce5277665cda33b36b59ab0495ab51c9c39c8f7 after independent review and all four exact-head hosted workflows succeeded. Later navigation repair qualification is a separate shared package; do not restart or reopen the original ticket by inference. External Google/AWS/QA evidence remains separately owned.

## Independent review correction (2026-10-05) — acceptance SHA relabelled

Source: the second independent read-only review of `codex/unified-replatform` @ `225d83e5` (2026-10-05), §6 row 2.3. Verdict **ACCEPTED** and **not reopened**: the implementation and integration coverage are present, 4/4 exact-head hosted workflows concluded `success`, and the 2026-10-01 confirmation stands. The correction below is to the *labelling* of the commits, not to the status.

The preceding paragraph and the execution card above call `8ce52776…` the commit at which 2.3 was accepted, which invites a reader to look there for this ticket's source. The hash resolves on the branch, but its diff contains **no 2.3 source**: `8ce5277665cda33b36b59ab0495ab51c9c39c8f7` is *"Pin official mirrored platform images and include canonical contract"*, touching `.dockerignore`, `tunes/Dockerfile`, `explorers-earth/Dockerfile.music-fixture`, `docker-compose.replatform.yml`, `scripts/replatform-local.ts` and image/deployment contract tests. Corrected attribution:

| Role | Commit | Basis |
|---|---|---|
| **Delivery of 2.3** | `79edeea8` — *"integrate canonical profile onboarding and local media"* | Carries the canonical profile/onboarding and local media source this ticket specifies. |
| **Acceptance-time hosted head** | `8ce52776…` | The branch head at which the 4/4 hosted workflows ran `success`, 2026-10-01 confirmed. It proves the gate held at that head, not that it implemented the seam. |

Cite `79edeea8` when looking for or reviewing this ticket's implementation, and `8ce52776…` only as the hosted-evidence head. Where earlier prose names `8ce52776` as "the acceptance", read it as the acceptance-time head; that prose is retained as historical and is not restated.

**Not a second commit:** the fragment `/65cda33b36b59ab0495ab51c9c39c8f7` appearing in historical notes is the tail of the same 40-character hash `8ce5277665cda33b36b59ab0495ab51c9c39c8f7`, split across a line or path boundary. Do not treat it as a distinct revision or attempt to resolve it.
