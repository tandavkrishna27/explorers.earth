# Replatform reconciliation — 2026-10-09

This is the current status entry point. It supersedes current-state claims in the October 5 index, status and execution cards, and the October 8 sequence. Those remain historical evidence and requirement definitions. No acceptance requirement is removed or checkbox promoted by this reconciliation.

## Source custody

| Tree | SHA | Custody |
|---|---|---|
| Integration, `codex/unified-replatform`, PR #119 | `46274e061ffb44f5b7ec5bdea84cd57e4748a541` | Clean local checkout, fetched origin identical. Draft PR to main. |
| Pending package, `claude/wave3-auth-lifecycle`, PR #121 | `67260702ecca801d5e10301161ade8fefafcbece` | Remote, 102 commits ahead of integration, zero integration-only commits. Open, non-draft, mergeable PR into integration. NOT integrated. |

Read both trees. `git show origin/claude/wave3-auth-lifecycle:<path>` was used to inspect pending documentation and workflow changes. This audit does not independently re-execute the Google, database, browser or provider receipts. A delivered implementation, authored test, recorded receipt and full ticket acceptance are distinct states.

Live GitHub checks were inspected on both PRs. At integration head, `replatform-required` succeeds; `music-required` fails through `platform-fixture`. At pending head, all returned checks succeed except `platform-fixture` and `music-required`; `load-chaos` is skipped. PR #121 does not run the entire frontend/image pipeline: base-branch filters differ. Its green jobs cannot substitute for exact post-integration checks. Integration workflow run `37843970375` reaches `platform:test:routes`; this is the route mismatch, not a registry-rate-limit diagnosis. The accepted red does not satisfy ticket 1.2 or grant production promotion authority.

Sources: [PR #119](https://github.com/MeteoriteLabs/explorers.earth/pull/119), [PR #121](https://github.com/MeteoriteLabs/explorers.earth/pull/121), current ticket documents, `HANDOFF.md` on both trees, `category-execution-order.md`, `owner-decisions-2026-10-08.md`, and October 9 commits cited below.

## All 39 tickets

“Delivered” below means the described scope exists. Residual acceptance remains binding until an exact source/environment receipt closes it. Historical ACCEPTED records are retained; new whole-ticket acceptance is not inferred from passing aggregates.

| Ticket | Integrated state | Pending PR #121 additions / remaining closure |
|---|---|---|
| 1.1 | Accepted baseline, bounded to its recorded marketing routes | Preserve accepted scope; no reimplementation. |
| 1.2 | Harness accepted; canonical route invariant open (`b4975654`) | Red deliberately accepted. Coordinated runtime/fixture cutover still needed for closure. |
| 1.3 | Accepted CI separation | Pending whole-tree test gating; reconcile lifecycle protected evidence and branch-filter gaps. |
| 1.4 | Accepted API-only seam | Preserve; packaged image proof still belongs to retirement/release. |
| 2.1 | Accepted identity/ownership schema | Real Google callback receipt recorded in `bd802e22`; receipt is not re-executed here. |
| 2.2 | Accepted authorization boundary | Preserve; pending logout socket revocation strengthens lifecycle closure. |
| 2.3 | Accepted profile/onboarding | Delivering commit `79edeea8`; do not reopen from stale execution cards. |
| 2.4 | Observation contract delivered; L19 and legacy replacement map are partial | Google first-consent receipt and session-bound principal revocation pending; actual held terminal completions, live socket sign-out and hosted acceptance remain. |
| 3.1 | Core revision-checked replacement, Places consumer and negative assertions delivered | Bind exact execution receipts; no missing-consumer or foreign-owner implementation package. |
| 3.2 | Owned media/catalog foundation delivered, bounded | Canonical media URL defects fixed in pending package. Qualify retained uploads and actual storage policy; selection hook presence is not upload acceptance. |
| 3.3 | Books 20-case bounded acceptance | Static no-Strapi proof/cover fix `d6209e77`, `3d7f3ed8`; exact hosted re-attestation remains. |
| 3.4 | Producer and canonical summary delivered; detailed owner analytics intentionally unavailable | Pending owner decision defers dashboard port. Analytics browser lane exists but milestone attestation remains pending. Do not add manifest entries without receipts. Historical events route remains Strapi-dependent; final retirement must resolve that route explicitly. |
| 3.5 | QA deployment/milestone evidence blocked | Named artifact-producing workflows and QA hostname/credentials required; current CI is not hosted QA. |
| 4.1 | Movies manual implementation and bounded acceptance | Named tests/traceability and integration gating `e951e5b8`, `6acaca3d`, `1b966866`; live TMDB smoke open. |
| 4.2 | Games manual slice; provider incomplete | IGDB path remains unconditional 503 in recorded inventory. Keep provider scope separate from retirement, with explicit launch disposition. |
| 4.3 | Apps migration/owner/public implementation delivered | Reserved protected category qualification and scraper-era nightly assertions remain. |
| 4.4 | Products migration/owner/public implementation delivered | Same qualification obligation; preserve offer/media contracts. |
| 4.5 | People migration/owner/public implementation delivered | Same qualification obligation; preserve contact disclosure and suppression. |
| 5.1 | Places implementation delivered; taxonomy deferred | Named unit suite `796c6380` in pending package. Protected Places lane, taxonomy/sector browse and per-place pin decision remain. |
| 5.2 | Place-links implementation delivered (`0049`, `61043b99`) | Protected place-links lane/manifest receipt remains. This is linked collections, not the guide aggregate. |
| 5.3 | Guides owner/public aggregate and category picker delivered (`0050`, `004e5873`, `f84f96df`) | Exact full feature qualification remains; do not recreate deleted `guideService.ts` or invent category vocabulary. |
| 5.4 | Dropped by D4; removed `7399cfe1` | Authorized exclusion, not unstarted implementation. Keep reserved handle protection. |
| 6.1 | Canonical Music provisioning delivered | Named real-PG acceptance `111466e6`; logout revocation `e809d57b`. |
| 6.2 | Owner implementation and split browser/real-stack proofs delivered, as October 7 ticket note records | Full two-origin real-stack browser acceptance remains a recorded deviation. Do not label implementation unstarted. |
| 6.3 | Guest capability, ticket-only socket admission and revocation implementation/proofs delivered | Pending remeasurement finds `public-music-revision-contract.test.ts` and existing reconnect browser coverage. Missing milestone lane/receipt remains; do not duplicate transposed-name test. |
| 6.4 | Release function0042 delivered in24b6d46f using account deletion operation retirement record | Gated proof/guard hardening pending; amend ADR008 stale claim and establish separate numeric retired-ID nonreuse proof. |
| 7.1 | Canonical navigation and eight non-Music public producers delivered | Media boundary/URL builders, visibility matrix, reserved handles and route bodies in pending package (`f16b6202`, `1b18157e`, `9e3e00d2`, `0ecb7eea`, `c2ff8ca6`). Remaining full browser traversal/ETag/Music milestone obligations need mapping. |
| 7.2 | Repo reference content delivered `cc9f3e4b` | Brand fix `f1940ac8`; legal entity/jurisdiction/contact placeholders remain owner input. Locale widening `b1297182` already integrated. Detailed analytics is owned by 3.4 and deferred. |
| 7.3 | Full all-category milestone not accepted | Runner/manifest scopes and actual protected receipts must be built/reconciled; existing six-lane manifest is not all-category acceptance. |
| 8.1 | Classification/scan delivered; retirement incomplete | Pending helper move `550a5924`, dead REST/gql/server cleanup (`8a07f479`, `db153810`, `edff0514`, `30475300`). Runtime cutover, ops, absence-proof authority and historical events route remain. |
| 8.2 | Duplicate frontend not removed | Pending note confirms coverage rehoming prerequisite satisfied. Image inspection + production graph/browser acceptance precede atomic removal. |
| 8.3 | Mechanical backend rename not delivered | After 8.1/8.2; update paths/scripts/images/contracts together. |
| 8.4 | Synthetic topology/verifier scaffolding | Replace placeholders with real image/evidence identities and join to 8.5 recovery acceptance. Deployment authorization is separate. |
| 8.5 | Restore drill/final web acceptance not delivered | Real backup/restore, promotion and recovery evidence required. |
| 9.1 | Not started | Public MCP tools after 8.5; reuse application operations. |
| 9.2 | Not started | Discovery quality/observability after 9.1. Absence of adapter is not evidence of permission quality. |
| 10.1 | Not started | OAuth linking/delegation after web acceptance and scoped consent design. |
| 10.2 | Not started | Creator catalog after10.1; extends its already-owned minimal profile probe and registration. |
| 10.3 | Not started | Publication qualification after 10.2; external submission separately authorized. |

## Epic disposition

All of epics 1–8 have delivered scope, but none should be promoted to full release acceptance by this audit. Epics 1/2 are foundation plus closure evidence; 3–5 are implemented feature packages plus provider/category/QA qualification; 6 has implemented Music with a combined two-origin proof deviation; 7 lacks consolidated all-category milestone evidence; 8 has partial retirement and operational release work. Epics 9/10 have no delivered adapter/tool implementation.

## Settled decisions and unresolved inputs

Integrated: AI removed; 100 creator requests/month cap and suppression list in `6fcf0187`; Google-only; claim flow dropped; creator-field translations dropped with locale contract widened; guide categories from creator history/free text; legal content stored in repo. Presence of suppression code is not proof of live Resend webhook delivery.

Pending branch: preserve read-only recovery observation; detailed analytics port deferred; route-fixture red accepted; D8 list detail mapping found already delivered. These are existing owner decisions, not new questions.

Inputs still required: D3 taxonomy and D5 per-place pin disposition; actual legal values; hosted QA/provider credentials and evidence environment; scope/spend for qualification workflows; explicit disposable fixture acknowledgement where its guard requires it; lifecycle absence-proof retirement authority; recorded cron disablement and deployment cutover. Deferring analytics UI does not authorize deleting its historical route or claiming zero Strapi reachability.

## Corrections to the previous chat summary

- Media uploads already have canonical paths. The old REST fallback calls require reachability analysis, not a new upload implementation. `Profile.tsx` canonical branches return after `createMedia`; pending `f0ad0c5b` traces them. Checkout's alleged unconditional activity conflicts with the visible `MUSIC_SUBSCRIPTION_FLOWS_ENABLED` guard; inspect mount effects and route reachability before deleting/porting it.
- 6.2/6.3 are implemented, with qualification deviations, not unstarted.
- 6.4's release function is integrated; its later qualification is pending in PR #121.
- Media boundary, Google receipt, Places named unit suite and Movies named cases are pending branch work, not a new backlog.
- Analytics dashboard port is deferred by the owner, not next engineering work.
- Green frontend aggregate and red Music aggregate coexist. Neither “CI green” nor “all CI red” is accurate.

## Independent audit corrections

The subagent audit lowers several claims above. These corrections govern dispatch and ticket closure.

1. **2.4 is not merely awaiting hosted attestation.** L19's canonical tests at `e2e/replatform/lifecycle.spec.ts:202` hold deletion-feedback, not deletion/deactivation/recovery completion. They prove feedback fencing for A→B/A only. The legacy map also retains two gaps and five partials. Canonical replacement coverage and held terminal-completion fencing remain engineering/qualification work before retiring the legacy gate.
2. **Logout socket evidence is bounded.** Pending `canonical-music-identity.integration.test.ts` deletes `auth_session`, then tests principal and saved socket-subject rechecks. It does not exercise Better Auth sign-out with a live socket. `musicPrincipal.ts` retains old canonical credentials without `sid`/`uid` until expiry. Combined browser logout/live-disconnect qualification remains open.
3. **Google receipt proves first consent from an empty database to one canonical account/session**, stopping at onboarding with no Music mapping. It is not an inactive-account recovery or completed-onboarding receipt.
4. **6.4 release is proved at source and has recorded execution; remaining work is not rebuilding the release.** Its retirement record is the completed account deletion operation, not a Strapi tombstone. ADR-008 decision 5 still describes it as unimplemented. Reconcile that contradiction and prove the numeric retired-ID nonreuse requirement separately; the cited finalization test explicitly expects no Music tombstone.
5. **3.1 replacement consumer and negatives already exist.** `features/Favorites/api/placesClient.ts:128` calls replacement; `book-catalog.integration.test.ts:66–69` asserts foreign-owner, stale/cross-kind and other-owner preservation. Bind them to receipts rather than implementing duplicates.
6. **Public HTTP route pins, visibility matrix and pagination assertions exist in pending source.** Inspect `publicVisibility.integration.test.ts`; a deferred uniqueness constraint disallows duplicate display order at commit, so groom the duplicate-order traversal requirement against actual storage semantics. Named filename gaps are not behavior gaps.
7. **People sector browse remains incomplete:** `publicPeopleProjection.ts:60` emits `person_category: null`. Its category taxonomy/suppression-admin requirements are distinct from Places D3 and Resend email suppression. Games provider services exist; unconditional 503 in `application/catalog.ts` is a wiring/qualification residual, not a service rebuild.
8. **3.5 candidate and retirement sequencing was cyclic.** Trusted candidates require exact-head required CI success; accepted `music-required` red does not waive this. QA preparation can start now. Coordinated runtime/fixture cutover and local qualification must precede trusted candidate/hosted QA, while operational Strapi shutdown and final retirement authority remain later gates. Do not perform a standalone green-making fixture flip.
9. **Existing local 7.3 evidence is bounded.** Pending `docs/replatform/evidence/2026-10-09/local-automated-7-3/record.md` at `03cfede6` records 122 integration passes and 126 skips, with browser/provider/owner UAT not run. Preserve skipped identities rather than quoting a universal database acceptance.

The lifecycle map's word “receipt” means committed assertions. This audit uses separate concepts: authored assertion, historical execution, current-head execution, hosted acceptance. Four independent domain reviews inform this document; none re-executed runtime tests.

Next work is governed by [the reconciled execution plan](../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). Historical requirement checkboxes remain unchanged; follow the per-ticket row and its evidence owner, not checkbox totals. This is ticket-level reconciliation, not independent re-certification of every historical receipt.
