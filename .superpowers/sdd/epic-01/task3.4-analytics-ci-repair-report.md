# Analytics checkpoint CI repair diagnosis and finite delta

Exact hosted checkpointc8fb27bf, native37069070746 and image37069071080 logs inspected. No scanner, gates/workflows, production route/authorization or retention behavior changes. Broad category/Music browser parity is outside this repair.

## First causes from all failed names

1. `music-openapi-contract.test.ts`: historical GET `/api/explorers/analytics/events` became explicitly live under its retained Strapi bearer identity boundary. Source scanner already correctly discovers it, and live handler still exists; OpenAPI omitted it. Initial interpretation of the diff direction was corrected through directtsx and Vitest source probes: missing entry is in the documentation, not in discovered live routes.
2. `music-authorization-matrix.test.ts`: committed generated matrix retained137 routes and old tombstone decisions; live inventory now138 including canonical Actor summary, public genericPOST and historical bearerGET, plus immediate maintenance job. Inventory producer and route policy are correct; the committed matrix was not refreshed with analytics implementation. The committed runtime inventory already contained the correct138 routes; its normal regeneration only updates the API-docs source line offset after the OpenAPI edit.
3. `scripts/analytics-browser-contract.test.mjs`: native node:test assertions independently passed15, but normal Vitest discovers the filename and reports no Vitest suite. All15 tests converted to the repository's Vitest test entry, no excludes or renamed hiding.
4. `music-security-containment.test.ts`: intentionally DB-free HTTP containment composition acquired actual immediate-retention pool.query from new analytics startup. Add narrow background-maintenance fixture mock alongside existing notification listener mocks; DB-free unauthorized request/query assertions remain unchanged. Actual immediate/nonoverlap/await-shutdown maintenance test and realPG analytics retention qualification remain authoritative, not disabled production behavior.

Image scanner outcome skipped/empty report is a consequence of TestTunes failure; it is not a discovered vulnerability/build/tool failure.

## Finite delta and red evidence

Normal producers regenerate `music-runtime-surface-inventory.json` then `music-authorization-matrix.json`. Add historical bearer GET OpenAPI entry with required accountId/fromDate/toDate/timeZone,93-inclusive-calendar-day limit, 200/400/403/502 and bounded historical events response. Exact Music OpenAPI parity retained; new Explorer bearer read is asserted as Explorer proof rather than incorrectly demanding Music C5 credentials. All other owners keep original Music credential checks. Add regression verifying live summary/GET classification, no scanner override.

Clean tracked Git archive plus actual installed tunes and isolated auth-runtime dependency junctions; local Git metadata initialized for CLI contracts. This is clean source with actual current locked installed topology, not a claim of fresh npmci. Initial clean probe lacked auth-runtime junction and failed import before containment, recorded and corrected. Proper red then reproduces both old contracts, native-test collection and immediate pool query. New historical endpoint assertions fail because operation absent. Preserved workspace scratch copy added unrelated old migration expectations only during initial exploratory workspace command; clean qualification excludes scratch by containing tracked source, not by changing committed test discovery.

## Qualification

Focused seven files125passed, zero skipped/failures: OpenAPI8, generated matrix2, actual current inventory1, DB-free containment68, converted contract15, maintenance1, historical analytics route30. Full native contract lane47files/718passed3existing skips exit0,65.79s. Skips retained; no new skip/exclude/threshold changes. Full clean default backend lane completed exit0:159files/2708passed4existing skips,729.58s (session84719/final tool chunk556e53). These are observed local execution results; hosted checks on the repaired commit remain pending.

Node24.21 portable/npm11.19 exact entrypoint; no global changes, no live/QA/prod operations. Browser qualification remains originalc8 ten-case evidence; changing a pure test harness to Vitest and documentation does not claim another full browser run. Independentreview/hostedverification required before push. Root QA package edits unrelated and not staged.
