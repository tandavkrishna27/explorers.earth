# Individual ticket implementation plans

> **Current reconciliation (2026-10-09):** [All 39 ticket dispositions and integrated versus pending evidence](reconciliation-2026-10-09.md) · [Corrected execution sequence](../superpowers/plans/2026-10-09-replatform-reconciled-sequence.md). This notice supersedes older current-status, blocker and next-package claims below; original requirements and historical receipts remain preserved.

**2026-10-05 re-groom:** [Current dependency order, all-ticket disposition and parallel ownership](../superpowers/plans/2026-10-05-replatform-regroomed-execution.md). Required red cases retain their acceptance owner; saving a plan changes no delivery status.

**Sequencing (2026-10-08):** [Remaining work, in the order we will do it](remaining-work-sequence.md)
is the whole outstanding backlog as one sequence, starting from the current state of
`codex/unified-replatform` and measured from the live Apollo call sites rather than from epic
status. Read it to decide *what next*; read the tickets below for scope and acceptance. It
also lists which "partial" epics do **not** block Strapi retirement, and the eight decisions
that are the owner's rather than engineering's.

Consult the [durable implementation ledger](../../.superpowers/sdd/epic-01/progress.md) for current status. [Master plan](implementation-plan.md) · [Shared execution checklist](execution-checklist.md). Each ticket links its epic for mandatory shared contracts, safety rules and test-harness prerequisites.

## Verdict vocabulary and how to read this index (2026-10-05)

The **Verdict** column carries the dispositions of the independent read-only review of `codex/unified-replatform` @ `225d83e5`. It is a status *surface*, not a receipt: the authority remains the ledger and [current status](current-status-2026-10-05.md), and the [corrected execution order](implementation-plan.md#corrected-execution-order-2026-10-05) governs dispatch.

| Verdict | Meaning |
|---|---|
| **ACCEPTED** | Recorded acceptance verified: acceptance SHA resolves and every hosted run the ledger cites resolves to the correct head SHA with conclusion `success`. |
| **BOUNDED-SLICE** | Evidence exists for a **stated subset only**. Not partial credit toward completion — the residual is named in the ticket. |
| **INCOMPLETE** | Started, with real delivered work, but a mandatory requirement or invariant is unmet. |
| **BLOCKED-EXTERNAL** | Cannot progress until an artifact, host or decision outside the ticket lands. |
| **NOT-STARTED** | No delivered implementation for the ticket's own scope. |

**Spread: 6 ACCEPTED · 5 INCOMPLETE · 6 BOUNDED-SLICE · 1 BLOCKED-EXTERNAL · 20 NOT-STARTED = 38.**

Two cautions that apply to the whole table:

- **Every checkbox in all 39 ticket documents is unticked, including in the tickets whose verdict is ACCEPTED.** The 262-of-262 count was measured on 2026-10-05 against 38 documents; ticket 6.4 was added on 2026-10-06, so re-measure rather than cite that figure. No per-requirement disposition is recordable from the ticket files themselves; it lives only in the ledger and the status docs. `[ ]` is a requirement, never a receipt — do not tick one to record this column.
- A verdict here is a ticket-level judgement. It does **not** imply a hosted pass: at `225d83e5` both protected aggregates were red (`music-required` FAILURE; Explorers validation FAILURE with Category A, Category B and Publishing failed, Music-and-account still running, so `replatform-required` had not concluded).

| Ticket | Implementation plan | Epic | Verdict (2026-10-05) |
|---|---|---|---|
| 1.1 | [Baseline and scope matrix](tickets/ticket-1-1.md) | [Epic 1](epics/epic-01.md) | **ACCEPTED** (narrow — evidence scope is 2 marketing routes) |
| 1.2 | [Reproducible local environment](tickets/ticket-1-2.md) | [Epic 1](epics/epic-01.md) | **INCOMPLETE** — acceptance stands and was independently re-executed, but the epic-01 route-graph invariant is **not** closed; harness delivered with a different layout |
| 1.3 | [CI and deployment separation](tickets/ticket-1-3.md) | [Epic 1](epics/epic-01.md) | **ACCEPTED** — protection receipt still matches live protection |
| 1.4 | [API-only build seam](tickets/ticket-1-4.md) | [Epic 1](epics/epic-01.md) | **ACCEPTED** |
| 2.1 | [Auth and ownership schema](tickets/ticket-2-1.md) | [Epic 2](epics/epic-02.md) | **ACCEPTED** — real Google smoke explicitly deferred |
| 2.2 | [Authorization and Music boundary](tickets/ticket-2-2.md) | [Epic 2](epics/epic-02.md) | **ACCEPTED** (strongest — commit content matches the claim) |
| 2.3 | [Profile/onboarding integration](tickets/ticket-2-3.md) | [Epic 2](epics/epic-02.md) | **ACCEPTED** — cited SHA `8ce52776…` is an acceptance-time head with no 2.3 source; delivering commit is `79edeea8` |
| 2.4 | [Auth UX and lifecycle](tickets/ticket-2-4.md) | [Epic 2](epics/epic-02.md) | **INCOMPLETE** — formalise into four subpackages (L0→L1…); legacy spec unmigrated; prerequisite lifecycle map absent |
| 3.1 | [Shared entities, recommendations and collections](tickets/ticket-3-1.md) | [Epic 3](epics/epic-03.md) | **BOUNDED-SLICE** — revision-checked replacement **is** delivered and route-mounted; split into two subpackages; residual is the UI consumer and two negatives |
| 3.2 | [Media and catalog providers](tickets/ticket-3-2.md) | [Epic 3](epics/epic-03.md) | **BOUNDED-SLICE** — mandated upload-hook changes not made; live storage/provider deferred |
| 3.3 | [Books end to end](tickets/ticket-3-3.md) | [Epic 3](epics/epic-03.md) | **BOUNDED-SLICE** — 20 of 20 identities verified and committed; "no Books flow requires Strapi" unproven at an exact SHA |
| 3.4 | [Analytics foundation](tickets/ticket-3-4.md) | [Epic 3](epics/epic-03.md) | **INCOMPLETE** — producer chain real and mounted; 10 identities **authored, 0 attested** (no analytics lane in runner or manifest) |
| 3.5 | [QA deployment and Milestone 1 evidence](tickets/ticket-3-5.md) | [Epic 3](epics/epic-03.md) | **BLOCKED-EXTERNAL** — both mandated workflows absent, so Q2 has no artifact producer; QA hostname pending; blocked by red aggregates |
| 4.1 | [Movies & Shows](tickets/ticket-4-1.md) | [Epic 4](epics/epic-04.md) | **BOUNDED-SLICE** — 24 of 24 verified and committed; two named cases absent by name; live provider open |
| 4.2 | [Games](tickets/ticket-4-2.md) | [Epic 4](epics/epic-04.md) | **INCOMPLETE** — manual slice real (20 of 20); provider chain is dead code behind an unconditional 503; four named provider cases absent |
| 4.3 | [Apps & Tools](tickets/ticket-4-3.md) | [Epic 4](epics/epic-04.md) | **NOT-STARTED** — all mandated files missing; category query still live Apollo |
| 4.4 | [Products](tickets/ticket-4-4.md) | [Epic 4](epics/epic-04.md) | **NOT-STARTED** — same; category query still live Apollo |
| 4.5 | [People](tickets/ticket-4-5.md) | [Epic 4](epics/epic-04.md) | **NOT-STARTED** — same; category query still live Apollo |
| 5.1 | [Places and taxonomy](tickets/ticket-5-1.md) | [Epic 5](epics/epic-05.md) | **NOT-STARTED** — graph-unblocked, but its qualification gate still pulls 5.2/5.4 specs in the epic files |
| 5.2 | [Maps, QR and linked lists](tickets/ticket-5-2.md) | [Epic 5](epics/epic-05.md) | **NOT-STARTED** — best-specified DTO in the set; owner unallocated |
| 5.3 | [Guides and sections](tickets/ticket-5-3.md) | [Epic 5](epics/epic-05.md) | **NOT-STARTED** — Guides is schema-unreachable; needs a new migration, not only code |
| 5.4 | [Existing claim flow](tickets/ticket-5-4.md) | [Epic 5](epics/epic-05.md) | **NOT-STARTED** — no claim service, repository, routes or migration |
| 6.1 | [Replace the identity bridge](tickets/ticket-6-1.md) | [Epic 6](epics/epic-06.md) | **Re-measured 2026-10-09: substantially delivered, not a stub.** `ensureMusicAccount` is built and route-wired, owner HTTP is on the canonical session, the 60-second handshake credential and its per-event recheck exist, and the named acceptance suite `canonical-music-identity.integration.test.ts` now runs in CI's `database` job. **Residual:** the `musicSocketCredential.ts` file split, and the socket-credential authority shape — the ticket specifies a web-session Actor, the implementation requires a Music credential (owner decision 2026-10-09: left as built). The 2026-10-05 "lookup-only stub" verdict predates all of it. |
| 6.2 | [Owner Music parity](tickets/ticket-6-2.md) | [Epic 6](epics/epic-06.md) | **Re-measured 2026-10-09: its real-PostgreSQL qualification already exists.** Every concurrency case the ticket names is in `music-domain-repository.integration.test.ts` — rollback leaves the prior queue intact ("rolls back an injected mid-replacement failure without changing queue, revision, or operation history"), a duplicate command does not append twice ("serializes concurrent duplicate queue replacements and durably replays the exact result"), stale-revision conflicts, notification only after commit ("releases exactly one public invalidation after commit and none after rollback") and A/B owner isolation. That file is gated in CI's `database` job as of 4c86ab6b. **Residual is the frontend client adaptation and the browser lane**, not the data-layer proof. |
| 6.3 | [Guest, public and socket parity](tickets/ticket-6-3.md) | [Epic 6](epics/epic-06.md) | **Partly delivered, with one real gap. Measured 2026-10-09.** The socket is no longer keyed on the general HTTP bearer: `resolveSocketTicket` accepts only the purpose-limited 60-second handshake, and `music-socket-handshake.integration.test.ts` asserts both directions. Unlisted-vs-revoked capability, durable replay, retired keys and denied origin are covered server-side. **The gap is the browser lane: no two-context owner-and-guest Music spec exists** — `e2e/replatform/` has analytics, auth, books, games, lifecycle, movies and profile and no music spec — and the ticket requires guest request with owner acceptance, player-state update, drop/reconnect, and revocation while connected. That lane needs `suite-manifest.json` and a browser fixture, both **coordinator-reserved** by the execution checklist, so it is not a writer's to take unilaterally. 7.1's full parity waits on this. |
| 6.4 | [Canonical Music owner deletion saga](tickets/ticket-6-4.md) | [Epic 6](epics/epic-06.md) | **NOT-STARTED** — added 2026-10-06; a real Music owner's deletion request never finalises, because 6.1 delivered provisioning without the release ADR-008 decision 5 deferred. Blocking preflight: an ADR must first decide how a canonical owner is represented in the Strapi-keyed lifecycle tables |
| 7.1 | [Public navigation and profile parity](tickets/ticket-7-1.md) | [Epic 7](epics/epic-07.md) | **BOUNDED-SLICE** — **corrected 2026-10-09: the overlay is committed**, with both importer specs migrated in step, and the P0 identifier seam is closed. Category coverage is 8 of 9 with no ninth to error on. The media boundary that was the last live finding is closed too (`f16b6202`). Full parity still depends on 6.3. See [public parity state](public-parity-7-1-state.md). |
| 7.2 | [Analytics and platform content](tickets/ticket-7-2.md) | [Epic 7](epics/epic-07.md) | **Corrected 2026-10-09** — the reference-content module exists at `explorers-earth/src/content/reference/`, ten locales with per-section English fallback, and `useFaqs`/`usePlatformTerms` read it instead of Strapi. The analytics dashboard's dead token gate is fixed and its read repointed is scoped under 3.4. Residual: the email suppression table landed under D2 (`6fcf0187`); the legal copy is placeholder pending the owner's values. |
| 7.3 | [All-category regression and milestone evidence](tickets/ticket-7-3.md) | [Epic 7](epics/epic-07.md) | **NOT-STARTED** — no milestone-2 evidence; its mandated command flags do not exist in the runner |
| 8.1 | [Remove remaining Strapi coupling](tickets/ticket-8-1.md) | [Epic 8](epics/epic-08.md) | **NOT-STARTED** — Strapi still load-bearing, not residual; **oversized: split into 8.1a / 8.1b subpackages under this number** |
| 8.2 | [Remove duplicate Tunes frontend](tickets/ticket-8-2.md) | [Epic 8](epics/epic-08.md) | **NOT-STARTED** — client still built and served; not in the shipped image, so the risk is CI-gating rather than product |
| 8.3 | [Mechanical backend rename](tickets/ticket-8-3.md) | [Epic 8](epics/epic-08.md) | **NOT-STARTED** — correctly sequenced after 8.1/8.2 |
| 8.4 | [Final production topology and promotion authority](tickets/ticket-8-4.md) | [Epic 8](epics/epic-08.md) | **BOUNDED-SLICE** — verifier/compose/routing exist but self-label synthetic with placeholder digests; acceptance join to 8.5 is prose |
| 8.5 | [Recovery drill and final web acceptance](tickets/ticket-8-5.md) | [Epic 8](epics/epic-08.md) | **NOT-STARTED** — prose only; every named artifact absent, no restore evidence |
| 9.1 | [MCP adapter and public tools](tickets/ticket-9-1.md) | [Epic 9](epics/epic-09.md) | **NOT-STARTED** — no MCP module or dependency; only research probes under `docs/` |
| 9.2 | [Discovery quality and observability](tickets/ticket-9-2.md) | [Epic 9](epics/epic-09.md) | **NOT-STARTED** — default-deny currently holds only **vacuously** |
| 10.1 | [OAuth linking and delegated principal](tickets/ticket-10-1.md) | [Epic 10](epics/epic-10.md) | **NOT-STARTED** — prerequisites unmet |
| 10.2 | [Creator tools](tickets/ticket-10-2.md) | [Epic 10](epics/epic-10.md) | **NOT-STARTED** — one ownership overlap with 10.1 to resolve |
| 10.3 | [Publication readiness](tickets/ticket-10-3.md) | [Epic 10](epics/epic-10.md) | **NOT-STARTED** — no plugin/release directory |

## Epic verdicts (2026-10-05)

| Epic | Verdict | Principal unmet condition |
|---|---|---|
| [1. Local development and safe CI](epics/epic-01.md) | **INCOMPLETE** | Claims 1.1–1.4 accepted, but 1.2's route-graph invariant is unmet and "continuously verifiable" is false while both aggregates are red |
| [2. Google identity and accounts](epics/epic-02.md) | **INCOMPLETE** | 2.4 open; the "no browser authority from account IDs" constraint holds for bearers but is violated for subjects |
| [3. Core recommendations and Books](epics/epic-03.md) | **INCOMPLETE** | Blocked on 3.4's unattested analytics and 3.5's absent artifact producer |
| [4. Catalog categories](epics/epic-04.md) | **INCOMPLETE** | 2 of 6 producers exist; the mandated shared fixture module does not exist, so six lanes roll bespoke setup |
| [5. Places and Guides](epics/epic-05.md) | **NOT-STARTED** | No module, adapter, test or spec for 5.1–5.4; Guides is DB-blocked |
| [6. Music identity and parity](epics/epic-06.md) | **INCOMPLETE** | Exit requires Music with zero required Strapi config; source eagerly constructs the Strapi gateway from a required origin |
| [7. Cross-category completion](epics/epic-07.md) | **INCOMPLETE** | One uncommitted shared slice against ~9 gates; 3 of 9 public categories; no milestone evidence |
| [8. Retirement and deployment](epics/epic-08.md) | **NOT-STARTED** | No epic-level exit section; all five tickets unstarted; harness milestone contract contradicts the implemented runner |
| [9. Public ChatGPT discovery](epics/epic-09.md) | **NOT-STARTED** | Prerequisite Milestone 3 unmet because 8.5 has not started |
| [10. Linked creator tools](epics/epic-10.md) | **NOT-STARTED** | Prerequisites unmet; one tool double-claimed with 10.1 |
