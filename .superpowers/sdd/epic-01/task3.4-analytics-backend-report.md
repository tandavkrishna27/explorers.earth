# Task3.4 analytics backend qualification

Backend subpackage only, source base3ccdb0a81bd45f60397fcbdce6ce3f93623aaf45 (2026-10-03). Frontend consent/immutable-body/public-data wiring and browser acceptance remain pending; this report does not accept ticket3.4 or a full milestone.

Canonical POST now writes PostgreSQL payload/receipt atomically with same-account key/hash identity. Canonical summary GET derives current Actor authority, bounds UTC366-day queries, emits version1 aggregate counts with eight100-bucket dimensions and exact remainder, and rechecks authority before release, including after COMMIT. Consent denial creates no state/enrichment. Public/category/resource gates are repeated under transaction locks before receipt replay. Generic timestamps bind the semantic hash; minimal Music semantics use accepted DB time and an existing immutable identity bridge, with live public/capability checks. No identity provisioning, catalog invention, Strapi publisher or generic/raw owner GET was added. Historical GET remains explicitly distinct, lazily activating its existing reader until7.2. Guide ingestion remains unavailable until its delivered producer.

0036 adds strict payload/32-byte receipt linkage, account/category resource FKs and indexed owner reads. The composite receipt FK uses RESTRICT plus explicit transactionally retire/clear/delete, the reviewed alternative to nullable-action ambiguity. Retention excludes old payload immediately from summaries, deletes at most100 rows per invocation, preserves receipt markers, and runs independently in single-flight minute maintenance with awaited shutdown. It retains account-first lock ordering and materializes bounded candidate rows before volatile advisory acquisition. The guarded terminal purge retires/deletes analytics before referenced content, preserving prior lifecycle and category-lock authority. Runtime receives SELECT/INSERT and narrow maintenance EXECUTE, with direct UPDATE/DELETE rejected. ORM/manifest/inventory/readiness/restore/current0036 operational markers move atomically; historical0035 chain and workflow evidence remain intact. No workflow/cloud/gate authority expansion.

Portable Node24.21.0/npm11.19.0: clean locked root, Tunes, auth-runtime and frontend installs in an isolated source export, with no blanket native-script approval. Qualified source includes the actual base plus scoped overlay; the report is not a claim that the overlay was already committed while tests ran.

Final backend evidence:
- Analytics application/maintenance/route/privacy/policy/runtime manifest/documentation contracts: clean6files184passed. Compatibility service/adapters/limiter/receipt/historical composition: clean6files92passed.
- Marker/readiness/files guards:2files28passed. Additional current-marker/startup/environment/local database/CLI/migration/restore contracts: clean6files132passed through actual Node-owned npm test command. Deployment executable/controller and historical analytics startup migration: clean3files91passed.
- Actual owned source-attested PG15 analytics:15passed, zero skipped in the full run. Covers concurrent same-key single commit, changed-body409, consent/private/foreign zero state, hidden replay404, owner isolation/scope/revocation, same-key FK, payload retirement/aged accepted replay versus new aged422, lost real COMMIT acknowledgment, rollback atomicity, UTC boundaries, post-COMMIT revocation, bounded dimension transfer, permitted metadata/no summary leakage, Music bridge/server time, actual restricted runtime and guarded terminal purge.
- Retention regression: forced sequential plan with400-row backlog/batch1 was red with400 acquired advisory locks; materialized candidate fix makes the full15 green. The initial targeted red run intentionally selected one test and therefore reports13 unselected identities; it is not qualification evidence.
- PG fresh/replay/checksum/catalog/readiness/0035→0036 upgrade:24passed; populated category revisions preserved. Final clean combined analytics+migration:2files39passed (15+24), zero skipped. Clean analytics+runtime-role before final retention-only refinement:2files40passed; the final analytics full15 separately verifies protected runtime/maintenance against final0036.
- Existing lifecycle:18passed; runtime-role:27passed. These counts are individual suite evidence, not an aggregate invented acceptance total.
- Populated payload, active and retired receipt restore: clean owned UAT PG15 run3passed before the retention-only contention-budget refinement, unchanged512MiB allocation; exact owned database/container removed.
- Analytics/canonical-startup production dependency closure TypeScript and existing music-c0 TypeScript both pass. Broad Tunes TypeScript remains red: untouchedHEAD and final overlay both exit2 with exactly identical174 diagnostic lines. No baseline debt was hidden or broadened into this change.

Retained failures/limits: the earlier combined23-migration+restore run filled the owned512MiB UAT database after migration bodies passed; migration cleanup and restore setup failed, with restore bodies unexecuted. Allocation was not increased and this run is not green evidence. Separate owned migration and restore runs qualify their actual results. Early fixture SQL mistakes (invalid onboarding/handle/missing display_order and migration fixture table typo), unsorted protected table inventory, ORM-CTE parser omission and metadata DDL omission were diagnosed and corrected; relevant full suites were rerun. One worktree unit attempt discovered unrelated retained CLI clone scratch and one root-cwd attempt misresolved relative fixture paths; clean export/correct-cwd evidence supersedes neither as an invented pass. No full38 browser milestone rerun, frontend acceptance, hosted run, production action or push is claimed.

Owned PG runs acquired existing attested local authority, used random private temporary fixture secret files, and removed their exact containers/database through existing teardown. No real provider/production credentials or raw analytics exports/traces were captured. Test-only body markers and HTTP responses are fixture data. Unrelated dirty reports, robots/sitemap, historical scratch and frontend TDD edits remain outside this backend commit.
Additional retention red→green: two busy candidates in the first account exhausted a requested two-row inspection budget, but the earlier candidate-limited loop inspected a third payload in another account. The final function counts every inspected candidate, including busy keys, and stops at the supplied budget. Full15 and final clean39 verify the final function. Temporary test syntax/cwd/npm-entrypoint prerequisite mistakes were corrected without altering checks: the CLI envelope contract refused a direct Vitest invocation without npm_execpath; the real Node-owned npm test run passed all132. The final protected typed closure was rerun after operational markers changed.

Source provenance: ordered repository paths plus Git-filtered blob IDs, LF tab-separated with one terminal newline. This represents scoped source inputs rather than an aggregate whole-repository hash. The source export has the baseHEAD above plus these exact owned files; frontend TDD files and unrelated dirty files are excluded. Source manifest SHA256:
6cdca93c3eb7d612c34b33b6c81f607b65729eb64a3f50adde1efaf9ac2c3e9e

```text
.env.music.example	459db4afdc7f268d8dec0eb5228f59831b6da7d9
.env.music.test.example	e2259a908a7c4ebcc498d9a519414765a51d007d
docker-compose.music-test.yml	517257e348641f178841a7323589f4c9a63e0b25
docker-compose.replatform.yml	fbcea71711d9f0869114a95b086ef6f409634043
docker-compose.yml	548c7838d472addbdf67c741736a3ad4326d967f
docs/architecture/music-documentation-contract.json	93b43b5917e68343e55fdb30ecde65048b7c17a7
docs/architecture/music-runtime-surface-inventory.json	11fbcc1acdc93005709fbcf1bcd040c6e27aad61
fixtures/db/music-runtime-table-manifest.json	474ec223c87ad8bf8e858b985bd22b84fa9f3b47
tunes/deployment/music-deploy-engine.sh	319c3afcfae4688760cafcc86ac15cc195f23310
tunes/migrations/0036_explorers_analytics_events.sql	236dca81ae41077b9b86784f95a17a37b69ac215
tunes/scripts/inventory-runtime-surfaces.ts	aa39c8d86e2d83b6323e8c93c84f8d8662cbd931
tunes/scripts/inventory-runtime-tables.ts	1280e2714492a2a9c920dd6fa6210d845e2e9447
tunes/scripts/music-docker-release-rehearsal.ts	f8453838767292988959be97be7240743e49aa73
tunes/server/application/__tests__/analytics.test.ts	e46057d04a53b418d8479cf6210745042372f09b
tunes/server/application/__tests__/analyticsMaintenance.test.ts	75f6a6d10f06763255c1e1572e14827fe9107d88
tunes/server/application/analytics.ts	ae48792599bd98ce01d0286fdf6d29dc046e359f
tunes/server/application/analyticsMaintenance.ts	1923c973b6af23f58d153c03546501c4b9449a6f
tunes/server/auth/canonicalApp.ts	ee04d874dc0280ff687a8573f7a0310049930d88
tunes/server/auth/canonicalStartup.ts	ce546e0276b2bc16febf1ad7cf64c90d815fbc1f
tunes/server/db/music-runtime-role.ts	d6e39d92aa7ed21294de78c60cdb5e3b79200b0f
tunes/server/policies/musicSurfacePolicy.ts	c5eb4eedac523506e74981a5b28eaa85894293ad
tunes/server/repositories/explorersAnalyticsEventRepository.ts	dd45395853a0f0a33410396264f6644e90177e07
tunes/server/routes/__tests__/explorersAnalyticsRoutes.test.ts	a8c1cfed6270534a04c528bb48a4f30bb2256565
tunes/server/routes/explorersAnalyticsRoutes.ts	6fbeb23f955f085481982149878a967f8c7e8c76
tunes/server/routes/explorersCanonicalAnalyticsRoutes.ts	6633858d5c3a9b9c3311181396f960c597d38091
tunes/server/routes/index.ts	d5b0a5651ac9eb1b7c115c19ad2bee1d2906887e
tunes/server/services/explorers-analytics-composition.ts	7e4ea3b71c664f60c6d58137d0f315f52b3773b0
tunes/server/test/contracts/music-cli-contract.test.ts	3470d2ceba149e7a9c7c3333e471e9d77100245c
tunes/server/test/contracts/music-e2e-state-restore.test.ts	7cd14889bc84853fa56f9e290507706d1b7d6953
tunes/server/test/contracts/music-environment-contract.test.ts	68b9f48dac62169b346ed70fd6d32bf56c7878c9
tunes/server/test/contracts/music-local-database.test.ts	acab1b7f411fdf10b2af9d336d34503d30accc58
tunes/server/test/contracts/runtime-table-manifest.test.ts	e060db79b065b0940dbbdbb3a68665668eedcbd6
tunes/server/test/deployment/music-deploy-executable.test.ts	9dddcd79c47a1e93a82ceee2112f4bc4ff333336
tunes/server/test/deployment/music-deployment-files.test.ts	18d13a6b9289d852eb94607651319db1378636f2
tunes/server/test/deployment/music-readiness.test.ts	c036dc8a90ef277123e236b27f1fe985f621de32
tunes/server/test/explorers-analytics-events.integration.test.ts	deab0b8a540f6974623f2c6f0f4f948d671b8a1a
tunes/server/test/fixtures/music-production-environment.ts	af5d1c744046fa48ed961e75eff76143b35ad117
tunes/server/test/migrations/music-migration-contract.test.ts	d558405350f0038e722a777053e4847e0985f80b
tunes/server/test/migrations/music-migration.integration.test.ts	e4cd704ee9e688544348aba77952d3084a6274c8
tunes/server/test/music-e2e-state-restore.integration.test.ts	5a7c109fa021ba7de1bf5fd68a9ce5f4923363ca
tunes/server/test/music-startup-bootstrap.test.ts	ae5d5898ae6c759a5874016be0d177c82e60de65
tunes/server/test/music-surface-policy.test.ts	013e3fe7b54f51ef5d40a876be26804d140d67fb
tunes/shared/explorersContract.ts	5ad731c43edba7d16cb7bb0562b0333b6c09c061
tunes/shared/explorersSchema.ts	5432f0c62e13aafdf564a3a0f06982fc017141e0
tunes/shared/music-migration-contract.ts	1a38e165393326a986eac5e2361773c4795370cd
```
