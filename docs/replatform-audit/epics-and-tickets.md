# Unified Explorers: epic and ticket backlog

> **Current reconciliation (2026-10-09):** [All 39 ticket dispositions and integrated versus pending evidence](reconciliation-2026-10-09.md) · [Corrected execution sequence](../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). This notice supersedes older current-status, blocker and next-package claims below; original requirements and historical receipts remain preserved.

## Current authority (2026-10-05)

Everything below this header is a **historical grooming draft**. It is retained because it preserves the original requirement set, and it must not be deleted. It is **not** current completion status, and **not** current execution order. For those, use the [current status](current-status-2026-10-05.md), the [individual ticket plans and verdicts](ticket-index.md), the [corrected execution order](implementation-plan.md#corrected-execution-order-2026-10-05) and the [re-groomed execution plan](../superpowers/plans/2026-10-05-replatform-regroomed-execution.md). Do not regenerate amended tickets from the grouped drafts below; the organizer validates custody read-only.

**Completion, stated precisely.** Seven tickets are complete as recorded, and all recorded evidence verified — every acceptance SHA resolves and all 18 hosted run IDs the ledger cites resolve to the correct head SHA with conclusion `success`. **1.1, 1.3, 1.4, 2.1, 2.2 and 2.3 hold. 1.2 is the exception: its recorded acceptance stands and was independently re-executed, but it does not close the epic-01 route-graph invariant**, so present 1.2 as *accepted with an open invariant*, never as plainly complete. Separately, 2.3's cited acceptance SHA `8ce52776…` is an acceptance-time hosted head containing no 2.3 source — the delivering commit is `79edeea8`; the acceptance itself is unaffected. Several other acceptance SHAs are likewise hosted heads rather than implementing commits: benign, but misleading in a brief.

**Corrected verdict spread (2026-10-05).** Across the 38 tickets: **6 ACCEPTED · 5 INCOMPLETE · 6 BOUNDED-SLICE · 1 BLOCKED-EXTERNAL · 20 NOT-STARTED.** Across the 10 epics: **01–04 and 06–07 INCOMPLETE; 05 and 08–10 NOT-STARTED.** Per-ticket and per-epic verdicts live in the [ticket index](ticket-index.md). BOUNDED-SLICE means evidence for a stated subset only; it is not partial credit toward completion.

**Ticket count: keep 38 — the decision stands.** Every mandatory requirement traced has exactly one owner, and the duplications found are **file** duplications (`AuthSyncManager.tsx`, `Settings/api/mutation.ts`), not requirement duplications; adding tickets would introduce the duplicate-owner problem this backlog currently avoids, and nothing is safely removable. The under-specified layer is the **package** layer, not the ticket layer: formalise 2.4 into four subpackages and 3.1 into two, giving roughly **44 dispatchable packages under 38 tickets**. The one genuinely oversized ticket is **8.1**, which should split into **8.1a** (server, compose and workflow retirement) and **8.1b** (frontend Apollo / Strapi-REST retirement) as subpackages under the same number. The grouped-draft tables below predate all of this and must not be used for allocation.

**Verify every proposed path and command in the historical body against current source before using it.** Many do not resolve, and several are stated in downstream epic and ticket files as mandatory run steps rather than as proposals — so a dispatched writer can execute a spelling that does not exist. Confirmed non-resolving at 2026-10-05: `playwright.replatform.config.ts`, `e2e/replatform/fixtures.ts` and `e2e/replatform/global-setup.ts` (no such files anywhere in the tree), the runner spelled as `scripts/replatform-e2e.ts` (the actual file is `scripts/replatform-e2e.mjs`), and the generic command flags `--suite` / `--project` / `--environment` / `--milestone 1|2` on the `platform:test:e2e` CLI, together with the project names `desktop-chromium` and `mobile-chromium`. The canonical suite instead lives as per-lane configs and a manifest under `explorers-earth/e2e/replatform/`. One narrower point: `--suite` **is** live on the inner fixture runner — only the outer `platform:test:e2e` CLI lacks it. Two tickets also list **existing** files under "Create"; a literal reading invites overwriting reviewed code, so treat those as "modify" and read the file first. The command-custody note that corrects these spellings is a separate document a dispatched writer may never open, which is why the warning is repeated here.


---

**Historical grooming draft begins here. Its original framing — "no implementation authorized or started" — was true when written and is no longer true:** implementation is authorized and partly delivered, as the verdict spread above records. Read the rest of this document as the preserved requirement set only.

Goal: reuse Tunes as the unified backend, preserve the existing Explorers experience, and add ChatGPT immediately after web completion. [Agreed scope and source findings](revised-direction.md).

This is the concise backlog for joint grooming, not a code-level execution script. Ticket-specific files, commands and interface signatures will be pinned when grooming each epic. Dependencies are sequenced, not eliminated. Do not start a ticket whose prerequisite contract is incomplete.

## Working agreement

- One dedicated replatform integration branch and draft PR; small commits by ticket. No implementation branch has been created yet.
- Local disposable database and fixtures first; remote CI at meaningful checkpoints, starting early.
- Current Tunes host becomes QA; main host remains production. Current Tunes availability need not be preserved. Separate configuration, databases and upload namespaces/buckets across environments.
- Same immutable release artifact is tested in QA and promoted to production with environment configuration. Never rebuild different code for production after QA approval.
- Before pushing, audit automatic deployment triggers and establish validation-only behavior for the replatform branch. Existing credentials will be used through approved mechanisms; presence does not prove access or correct callbacks.
- Unit/domain, database integration and browser acceptance checks belong inside functional tickets. No separate final “add all tests” epic.
- Agent-run acceptance/UAT-style scenarios per feature; milestone reports contain evidence, failures, skipped cases and optional owner test steps. No routine ticket-by-ticket owner approvals.
- Four milestone reviews. Production promotion and actual old-service retirement are separate explicit release actions, not consequences of a normal push.
- Google-only login is the agreed visible exception to frontend parity. No followers/community, new admin UI or monetization in this scope.

## Milestone 1 — Google login, profile and Books

### Epic 1: Reproducible development and safe CI

| Ticket | Deliverable | Done when |
|---|---|---|
| 1.1 Baseline and scope matrix | Existing routes/screens/behaviors mapped to acceptance scenarios; all nine categories and explicit exclusions recorded | Each retained flow has a test scenario; current failures recorded separately from replacement regressions |
| 1.2 Local environment | Repeatable local API/web/PostgreSQL startup, clean database and deterministic reference/acceptance fixtures | A clean environment starts without production dependencies; seed reruns do not duplicate rows |
| 1.3 CI/deployment separation | Inventory and update workflow triggers, checks, secrets usage and paths for the integration branch | PR/push validation works without deploying either host; meaningful existing checks retained |
| 1.4 API-only build seam | Separate backend build/start from duplicate Tunes client build without deleting client yet | Backend boots, health checks pass and existing server contract tests run without building Tunes UI |

**Dependencies:** none beyond reviewed scope and repository access. Existing areas: package scripts, Tunes build/startup, compose and GitHub workflows. This epic establishes the commands all later tickets use.

### Epic 2: Google identity and account-owned profiles

| Ticket | Deliverable | Done when |
|---|---|---|
| 2.1 Auth and ownership schema | Better Auth tables, canonical creator accounts and owner memberships; Google-only login | Duplicate/concurrent callbacks provision one account; sign-in/logout and invalid callback cases tested |
| 2.2 Authorization boundary | Server-resolved user/account principal, lifecycle and ownership checks; documented Music adapter boundary | Anonymous, owner, other owner and suspended-account cases behave correctly; caller IDs cannot grant ownership |
| 2.3 Existing profile/onboarding integration | Existing screens wired to new profile/settings/media contracts; public handles and defaults | Profile setup/edit/public page and default category visibility match baseline; handle collisions handled |
| 2.4 Auth UX and lifecycle parity | Replace Strapi browser token/session logic; remove password-only flows; retain active account settings/lifecycle behavior | Google dev callback works with real provider; session/CSRF and deactivation behavior checked |

**Dependencies:** Epic 1. Better Auth provider-account records remain distinct from creator accounts. One profile per login is initial policy; no profile-switching UI.

### Epic 3: Recommendation foundation and Books vertical slice

| Ticket | Deliverable | Done when |
|---|---|---|
| 3.1 Shared application contracts | Account-owned recommendations/collections, shared entities, ordering/revisions and explicit visibility | Two accounts can recommend one entity independently; ambiguous matches stay separate; ownership and concurrent edit tests pass |
| 3.2 Media and catalog boundary | Upload ownership/storage checks and server-side catalog lookup; necessary seed values | Valid upload works; invalid/unauthorized upload fails; provider timeout and missing metadata recover cleanly |
| 3.3 Books end to end | Existing Books forms/list/detail/public views use new application operations | Create/edit/remove/order/pin/visibility behavior passes local browser acceptance on desktop/mobile |
| 3.4 Analytics foundation | Consent-aware event contract/store and Books/profile instrumentation | Consent denial, duplicate retry and private/invalid target cases tested; events no longer depend on Strapi payload storage |
| 3.5 QA deployment and milestone evidence | Unified build deployed to former Tunes host with separate QA configuration | Real Google and provider smoke checks run in QA; CI results and acceptance evidence reported |

**Dependencies:** Epic 2; shared contracts before Books wiring. Set up QA early so the first milestone is demonstrable, not only a local screenshot.

**Milestone 1 demo:** Google sign-in → onboarding/profile → Books CRUD/publication → anonymous public view. Include private/other-owner denial and local/CI/QA results.

## Milestone 2 — All nine categories, including Music

### Epic 4: Remaining catalog categories

| Ticket | Deliverable | Done when |
|---|---|---|
| 4.1 Movies & Shows | Existing category and catalog adapter, distinguishing movie/TV identity | List/item CRUD, metadata, order and public visibility scenarios pass |
| 4.2 Games | Existing Games flow and server-side provider access | Genre/platform metadata and provider-error scenarios pass; no provider secret in browser bundle |
| 4.3 Apps & Tools | Existing Apps flow and typed entity details | URL/platform/pricing-tier data round-trip; list/item/public scenarios pass |
| 4.4 Products | Existing Products flow and offer fields | Price/currency/links round-trip without losing meaning; list/item/public scenarios pass |
| 4.5 People | Existing People flow and typed person data | Social/profile fields round-trip; no automatic linkage to login users; public/private scenarios pass |

**Dependencies:** Epic 3. Tickets can be executed sequentially; optional parallel work only after shared contracts are stable. Place-linked product/people attachment acceptance is completed in Epic 5.

### Epic 5: Places and Guides

| Ticket | Deliverable | Done when |
|---|---|---|
| 5.1 Places and taxonomy | Place lists/recommendations, reusable categories/subcategories, contact/media fields | Existing add/edit/list/detail/filter behavior passes without copying incorrect Strapi relation cardinality |
| 5.2 Maps, QR and linked lists | Existing maps/location/QR behavior; attach Products/People lists | URLs resolve, visibility is enforced and linked content behaves as before |
| 5.3 Guides and sections | Rich guide data, ordered sections and itinerary blocks | Create/edit/reorder/public detail round-trip without losing timeline/transport/stay/budget content |
| 5.4 Existing claim flow | Retained claim submission/evidence behavior, where present in baseline | Submission/upload works without falsely granting verified ownership or requiring a new admin UI |

**Dependencies:** Epic 4 for linked lists; Epic 3 for collections/media. No new claim-review product or community feature.

### Epic 6: Music on canonical identity

| Ticket | Deliverable | Done when |
|---|---|---|
| 6.1 Replace identity bridge | Canonical account principal feeds retained Music services; retire Strapi proof/absence dependency for new path | Owner isolation, suspension and credential/socket authority tests pass without Strapi |
| 6.2 Owner Music parity | Existing playlists, queue/playback/history and controls remain functional | Existing Explorers Music screens pass contract/integration/browser acceptance |
| 6.3 Guest/public/socket parity | Sharing/publication, guest requests, revocation and reconnect | Guest permissions, idempotent replay, revision ordering and disconnect/reconnect scenarios pass |

**Dependencies:** Epic 2 principal contract and Epic 3 backend foundation. Resolve the principal design in Epic 2; do not leave its first examination until here. Numeric internal music IDs may remain behind the canonical account mapping.

### Epic 7: Complete cross-category experience

| Ticket | Deliverable | Done when |
|---|---|---|
| 7.1 Public navigation and profile parity | All category tabs, pins, slug handling, pagination and visibility | Full public/private matrix passes, including nested data and pagination beyond initial previews |
| 7.2 Analytics and platform content | Current dashboard behavior, consent, reference/legal/help data and remaining active settings | Dashboard counts reconcile against fixtures; settings and retained utility flows have no required Strapi calls |
| 7.3 All-category regression/UAT | Combined local/CI/QA evidence for all retained features | All nine categories demonstrated; defects and unverified provider cases explicitly listed |

**Dependencies:** Epics 4–6. No new paid subscriptions or revival of tombstoned integrations.

**Milestone 2 demo:** complete category feature coverage on the unified backend, before architectural retirement. A milestone is not “passing” if required scenarios are skipped or failing.

## Milestone 3 — Final web acceptance and retirement

### Epic 8: Remove old coupling and finish deployment

| Ticket | Deliverable | Done when |
|---|---|---|
| 8.1 Strapi dependency removal | Remove replaced queries/adapters/configuration and bridge code; retain no-required-call proof | Static inventory and runtime checks show no required Strapi traffic for retained features |
| 8.2 Duplicate frontend removal | Remove Tunes client and unused frontend-only dependencies | Backend builds/starts/tests with equivalent retained coverage; Explorers Music remains functional |
| 8.3 Backend rename | Mechanical package/path/image/script/CI updates to unified backend name | Local commands, tests, Docker build and QA deploy all resolve the new paths |
| 8.4 Production topology | Same-host web/API/socket routing, separate QA/prod data/configuration, immutable artifact promotion | QA rehearsal verifies routing, TLS/cookies/sockets, restart and health behavior; production release remains gated |
| 8.5 Recovery and final acceptance | Backup/restore drill, complete regression, deployment/retirement runbook and evidence | Tested release is ready for production; existing secrets/configuration gaps explicitly resolved or blocked |

**Dependencies:** Milestone 2 technical gate. Remove/rename in separate commits; CI changes accompany each removal. Actual production deployment/service retirement happens only under release authorization. No need to preserve the old Tunes host as a live service.

**Milestone 3 report:** web feature parity, no old-runtime requirements, local/CI/QA results, recovery evidence and production readiness. New admin/commerce remain deferred.

## Milestone 4 — ChatGPT immediately afterward

### Epic 9: Public discovery

| Ticket | Deliverable | Done when |
|---|---|---|
| 9.1 MCP adapter and public tools | Search creators/recommendations, creator profile and collections through existing services | Protocol/client checks and bounded results work; private resources never leak |
| 9.2 Discovery quality and observability | Small query evaluation set, provenance/canonical links and honest result-returned analytics | Category/creator/overlap queries meet reviewed expectations; no claims of unobserved impressions |

**Dependencies:** Milestone 3. Refresh official platform requirements before implementation. Optional UI is not required for the first functional tools.

### Epic 10: Linked creator actions and review readiness

| Ticket | Deliverable | Done when |
|---|---|---|
| 10.1 OAuth linking | Better Auth consent/discovery and appropriately scoped, audience-bound tokens | Real ChatGPT linking, denied/revoked access and account ownership checks pass |
| 10.2 Creator tools | Recommendation/collection edits and authorized analytics using existing operations | Explicit intent, ambiguity, revision conflict and retry cases pass; no duplicate business logic |
| 10.3 Publication readiness | Current review cases, privacy/support materials and demonstration package | Review requirements are satisfied; submission/publication remains a separate explicit action |

**Dependencies:** Epic 9 and proven web operations. No in-plugin digital sales, upgrade funnel or sponsored placements.

## Ticket execution template

1. Confirm prerequisite contract and exact file scope during grooming.
2. Add/run the meaningful failing regression or contract check for changed behavior.
3. Implement the smallest coherent change; update relevant CI/build wiring in the same ticket.
4. Run applicable local automated checks and browser acceptance; record real-provider limitations.
5. Commit a reviewable change, run remote validation at the appropriate checkpoint, and record results.

Low-impact mechanical/documentation changes use direct verification rather than artificial tests. Changes to ownership, persistence, lifecycle and external effects require meaningful automated coverage.

## Self-review and grooming result

| Concern | Resolution in this backlog |
|---|---|
| CI deferred until cleanup | Epic 1 owns safe validation; every later ticket updates affected checks |
| QA only arrives at final deployment | Ticket 3.5 deploys the first vertical slice to QA |
| Music identity discovered too late | Epic 2 defines the boundary; Epic 6 replaces the bridge |
| All-category milestone missing | Explicit Milestone 2 precedes retirement |
| Analytics/uploads treated as optional cleanup | Epic 3 establishes them; Epic 7 completes parity |
| Missing reference data | Epic 1 fixtures and Epic 7 content; schema exports are not seed rows |
| Cross-owner access or duplicate onboarding | Epic 2 tests ownership/concurrent login; Epic 3 tests independent recommendations |
| Public leakage after pagination/settings changes | Epic 7 exercises nested visibility and full pagination |
| Build broken by deleting Tunes UI | API-only seam in Epic 1, actual deletion only in Epic 8 |
| “No dependencies” promise | Linear prerequisites stated explicitly; cross-cutting contracts resolved early |
| Fresh database mistaken for lost safeguards | Keep FK, lifecycle, replay and recovery checks; no historical import work |

**Next grooming step:** review ticket scope and acceptance, then pin technical contracts/files for Epic 1–3. No new product decisions are required to start that grooming. Final estimates follow executable baseline checks rather than guessed dates.
