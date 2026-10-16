# Independent re-groom review — 2026-10-09

Four read-only subagents reviewed identity/Music, categories/public/media, CI/retirement, and plans/decisions. Baselines: integration `46274e06`, pending PR #121 `67260702`. No runtime tests or external mutations were performed. This is an independent source/planning review, not fresh acceptance of historical execution receipts.

## Findings adopted

| Finding | Evidence | Plan disposition |
|---|---|---|
| Lifecycle held-completion scope overstated | `e2e/replatform/lifecycle.spec.ts:202–214` holds feedback only; legacy spec `:369` holds deactivation, with narrower replacement identity | L19 partial; add exact terminal completion cases for B/fresh A. |
| Logout proof overclaims live socket behavior | Pending canonical identity integration deletes `auth_session`; no browser sign-out/live socket in that case | Reuse principal recheck proof; add actual connected browser sign-out qualification. Preserve old no-sid/uid credential compatibility until its bounded expiry is explicitly dispositioned. |
| “Receipt” legend actually means committed assertion | Lifecycle map legend | Separate authored assertion, historical execution, current-head execution, hosted acceptance. |
| Google receipt wording overclaims recovery | First consent from empty DB, stops at onboarding | Retain real receipt; do not infer recovery/repeated-consent/full-onboarding evidence. |
| 6.4 implemented design contradicts ADR | `0042`, lifecycle integration `:486–532`, ADR-008 decision 5 | Amend decision record for account-operation retirement; numeric ID nonreuse proof remains separately assigned. |
| Core replacement caller and negatives already present | `useAddRecommendation.ts:523`, `placesCommands.ts:80`, `placesClient.ts:123–128`, book integration `:50–69` | Remove duplicate implementation package; bind current receipts. |
| Several public parity artifacts already exist | Pending typed HTTP route/matrix/53-item/ETag/media tests | Retain tests; qualify all projections/browser/Music separately. |
| Duplicate committed collection position fixture is impossible | Deferred storage uniqueness and pending assertion | Record adapted requirement: deterministic traversal + duplicate-at-commit refusal; requirement acceptance needs explicit traceability, not impossible fixture data. |
| Ninth product category is separate Music surface | Eight-category recommendation enum; actual Music runtime | Preserve enum and combined Music qualification. |
| Local 7.3 record is partial | `03cfede6` record: 122 DB passes, 126 skips; no browser/provider/UAT | Preserve count custody and skipped requirements. |
| QA candidate order cyclic | 3.5 required CI success; route red closed only at later cutover | Local qualification → bounded coordinated cutover → required green → trusted candidate/hosted QA; operational retirement stays separately gated. |
| Mode flip alone drops Music graph | Canonical startup plain HTTP; Music/socket in other entrypoint | Allocate actual runtime topology/probe/fixture package. |
| Provider/category residuals are genuine | Games catalog unconditional503; People category null; Places D3/D5 | Games wiring, People browse, taxonomy/pin dispositions separated from already-delivered feature work. |
| Detailed analytics deferred | Pending owner decision | No dashboard port. Producer attestation still required; marginal dimensions cannot reconstruct cross-tabs. Historical route retention blocks zero-Strapi claim. |
| Creator probe overlap already resolved | Ticket10.1/10.2 correction tails | 10.1 owns minimal probe;10.2 extends same tool. |
| Future technical edges over-serialized | 10.1 consumes9.1+2.2;9.2 consumes9.1+analytics producer | Prepare9.2 and10.1 independently after9.1;10.3 joins9.2+10.2. Keep Milestone3 release gate and proposed9.1 edge change unapproved. |

## Concrete next packages

1. **Existing source consolidation:** review PR #121, receipt custody, base filters, exact post-integration checks. Do not rebuild delivered fixes. No main merge/deploy authorized by this audit.
2. **Lifecycle evidence and record repair:** correct L19/legacy maps and ADR-008 contradiction, assign numeric retirement fence proof and exact held completions. Keep legacy protected suite.
3. **Canonical acceptance harness:** actual canonical auth issuer + actual Music server/socket + frontend over one owned database/signing authority; include actual sign-out disconnect, owner/guest, reconnect, expiry, suspension/deletion and terminal maintenance. Then register guarded retained category/public/analytics lanes with receipt-producing runner changes.
4. **Runtime cutover design:** explicit ingress/service graph, probe replacements, production fixture-authority denial and deployment contract changes. Standalone mode flip and probe deletion are not acceptable. Conditional execution before trusted QA only for bounded technical scope; no operational shutdown or absence-proof grant implied.
5. **QA Q1 preparation concurrently:** candidate/QA artifact producers, exact image/schema/provenance interface, external inputs. Trusted Q2 candidate waits for required green and Q3 deployment authority.

Later work: hosted provider/milestone evidence; authorized operational retirement; duplicate frontend removal; rename; final candidate/recovery/production receipt join; web acceptance; public/creator transports under retained release gates.

## Remaining decisions, not invented engineering blockers

Historical analytics route disposition; numeric retirement identity guarantee if no existing proof; preexisting credential lifetime disposition; coordinated cutover's boundary if it requires operational retirement; hosted resources/run spend; fixture acknowledgement; external identity absence-proof authority; legal values; D3/D5; optional People suppression administration. Existing Google-only/claim/AI/analytics-deferral/probe ownership decisions are settled.

The current [sequence](../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md) incorporates these findings. Future implementation packages require file ownership, interface and resource allocation at their frozen source before dispatch. Audit gaps are not evidence of a production defect.
