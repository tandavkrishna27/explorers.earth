# Implementation-plan review and grooming record

## Current authority (2026-10-05)

Historical draft/review below preserves requirements, not current completion or execution order. Use the [current status](current-status-2026-10-05.md), [individual ticket plans](ticket-index.md) and [re-groomed execution plan](../superpowers/plans/2026-10-05-replatform-regroomed-execution.md). Seven original tickets remain complete. Do not regenerate amended tickets from grouped drafts; the organizer now validates custody read-only. Proposed original paths/commands need current-source verification before implementation.


**Status:** documentation reviewed; implementation and application tests not started.

Three source-inspection subagents drafted backend, feature and operations plans. The primary agent drafted ChatGPT and the master plan, cross-reviewed contracts/dependencies, and reconciled findings. The operations subagent then independently reviewed the combined drafts. These are design reviews, not proof that unimplemented behavior passes tests.

## Findings resolved

| Finding | Change to plan |
|---|---|
| Profile acceptance depended on later media foundation | Basic upload/storage and HTTP client now belong to Epic 2; Epic 3 extends them |
| Shared contract file created after first consumer | Identity/error/profile primitives created in 2.1 and extended later |
| Web-only actor could not represent OAuth | Server-only credential union distinguishes web session from delegated grant; same ownership policy |
| Missing guide, attachment, claim and reference operations | Feature plan pins command signatures and schema-grounded payloads; baseline claim phone/address flow retained |
| Creator search/overlap lacked a service owner | Public discovery contracts pinned; basic reads in Epic 3 and indexed overlap/search in Epic 9 |
| Owner profile tool could reuse an unsafe public shortcut | Explicit `getMyProfile(actor)` with scope/membership policy |
| Existing browser tests mock persistence | New real-API fixture suite/config and root runner defined separately from retained UI tests |
| Proposed E2E file names differed across plans | Shared `e2e/replatform` suite names and wrapper agreed |
| Existing local Music composition omits routes | New fixture runtime must mount canonical route graph, reusing DB safeguards only |
| Database tests might skip silently | Attested PG15 authority and executed/non-skipped suite evidence required |
| Multiple QA implementation descriptions | Ticket 3.5 has one owner, included in Epic 3 from operations draft |
| QA/prod build-time configuration could change artifact | Environment-neutral assets/runtime public config required before immutable promotion |
| Old workflow triggers can deploy | Trigger/authority checks before first push; expired direct deploy not reused for QA |
| Anonymous MCP lacks web-cookie consent | No per-user/product analytics by default; linked consent separate from OAuth access |
| Static generator treated as a proven network dependency | Corrected: canonical URL configuration verified; live Strapi fetch not established |

## Structural verification

- Ten individual epic documents generated under `epics/`.
- All **38 backlog tickets** appear exactly once across individual epic plans.
- Local Markdown links resolve.
- Existing source files inspected by the corresponding planning agents; proposed files explicitly called out.
- No tracked application changes in the audit checkout; only documentation and read-only documentation tooling added.

## Explicit execution-time gates

### Second independent grooming pass

All 38 tickets were reviewed again after splitting them into individual files. Reports: [feature review](grooming-feature-review.md), [operations review](grooming-operations-review.md), [media/auth review](grooming-media-auth-review.md). The grouped sources and generated tickets now correct location-list attachment ownership, deletion-feedback writes, collection/guide archive, provider/manual entity resolution and creator overrides, typed guide parent data, and claim lookup population from newly published places. The canonical feedback command is `recordDeletionFeedback` at `/account/deletion-feedback`; the review's alternative naming is not a second operation.

Operations corrections pin a candidate-artifact producer, actual required-check setup, QA environment creation, E2E paths under the shared test directory and backup CLI interfaces. Media delivery is an explicit **proposal awaiting discussion**, with external input closure tracked in [readiness](readiness-and-inputs.md). This review did not create repository protections or cloud configuration.

1. Supported released Better Auth/Express/Drizzle APIs and actual Google/OAuth integration must be qualified; no installed integration was assumed.
2. Existing GitHub secret names do not prove server access, callback correctness, environment protection or capacity. Verify through normal mechanisms when implementing.
3. Required reference/legal data values must be supplied or reviewed; schema definitions cannot provide rows. No invented legal content.
4. Baseline automated/browser runs will establish actual defects and performance limits. No green CI or E2E run is claimed by this planning work.
5. Recheck source drift when implementation begins; plans are pinned to audited commits.

The readable individual epic plans are the review entry points. Grouped `implementation-backend`, `implementation-features`, `implementation-operations` and `implementation-chatgpt` files retain the coordinated drafting source; `organize-plans.cjs` reproduces the individual documents. Keep grouped sources and generated epic documents synchronized if plans change.

## Superpowers detail and consistency pass

Applied writing-plans self-review plus independent backend, feature and operations reviews. Corrected accepted one-client/one-bucket/self-hosted database topology, shared AWS credential boundaries, per-ticket assertions and commands, early profile/Strapi startup dependencies, media byte/range delivery, session-bound sockets, recovery-only authority, distinct legal-content variants, immutable artifact provenance, milestone-specific E2E selection and backup/media recovery consistency. ChatGPT tickets now pin concrete visibility, pagination, consent, revocation and idempotency assertions. Regenerate individual documents from grouped sources after every correction.

Remaining qualification gates are external QA hostname/DNS, Google callbacks and runtime credentials, actual AWS/host permissions, provider behavior, reference content, and pinned Better Auth recovery-hook compatibility. These are not completed checks. No application test, CI run or deployment is claimed by this planning review.

## Consolidated database review

The [authoritative target schema](target-database-schema.md) consolidates core, feature, Music and delegated-access storage. Independent review corrected category/entity-kind exceptions, duplicate overrides/location links, guide money/rich text/gallery representation, claim field/evidence requirements, media dimensions, rating field alias and terminal-deletion tombstone consistency. Music SQL includes a revision field missing from ORM; the SQL appendix is retained as evidence. Library-managed Better Auth physical DDL remains a named version-generation gate; no database or migration tests were executed.

## Frontend consumer and interaction closure

Source review found additional concrete gaps beyond generic CRUD: global route/session consumers and recovery pages; category-wide top-pick authority; owner-page accumulation; URL-based merging; guide inline editors; one-shot publish/return state; guide/place collection pin rules; public compatibility flags and cold-entry invalidation. Assigned to existing tickets2.3/2.4/3.1/3.3/4.x/5.x/7.1, with reports [auth/global state](frontend-auth-gap-review.md) and [feature interactions](frontend-feature-gap-review.md). The schema now separates category pins from list display order. Strict existing pin Save/autosave timing is selected; no silent UX simplification. Frontend browser scenarios are specified, not executed in this review.
