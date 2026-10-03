# Ticket4.1 Movies Package A: revised source freeze after early audit

Base commit975cd4bddd70bd1eb6e27f202292ffff04724f41, codex/unified-replatform in isolated replatform-audit worktree. Working source is frozen; no completed package commit/push yet per controller's independent-review requirement. Exact owned file hashes/manifest: `.superpowers/movie-package-a-source-hashes.json`. Clean locked snapshot: path in `.superpowers/movie-package-a-clean-path`; dependency ownership receipt stored at snapshot root. No original writer source edits planned unless review identifies repairs.

## Delivered finite package

Server-owned TMDB Movie/TV search/details, exactkind/id provenance and immutable facts, declared manual facts, bounded account-bound opaque continuation and Actor revalidation. Genres use canonical taxonomy and explicit migrator0037 seeds accepted independently:35kind/ID mappings,27terms,eight deliberate same-ID merges. Official provider example hashes plus independently reviewed English-translation provenance are retained; no live provider observation claim. SQL composite ownership/FKs, read-only global mappings, immutable catalog facts, strict nested watch/cast facts, finite byte/field/count limits, locked/deferred genre/association ordering and parent immutability, watch-context replacement atomicity. Seven real Drizzle declarations/inventories and runtime capability rules match SQL. Exact MoviesGET owner admission preserves Books and denies ALL/retired routes.

Typed owner/public detail and client/manual boundaries preserve sparse overrides, zero/null facts and explicit watch clear/inherit context; public ancestors remain authoritative. Pure derived watch helper implements defaultUS context, first-mode provider dedup, priority order and max8; no invented selector/UI. Current runtime marker37 coupling retains36/history/checksums across compose/deploy/examples/proxy/runtime-plan and restore authorities.

## Regression receipts and results

Meaningful red/green fixed real childtrigger42703, missingseeds/typedprojection, BooksMoviefieldauthority, mixedqueue undercharge, failed101-array raw-scan counting, detail501title persistence mismatch, retained raw+mapped detail/watch bytes, SQLposition32/active-term bypass, association reparent bypass, malformed watch arrays/unsafe provider/castIDs, inherited Books-only8KiB Movie editorial limits, and the initial500emit implementation. The early audit invalidated the original partial500/null receipt: revised behavior emits a partial finalpage ONLY when actual sources and queues are exhausted; remaining upstream results produce explicit CONTINUATION_LIMIT with no tentative-page commit. Cached replays consume quota; fourglobal/oneaccount active slots recover and another account progresses. Serialized/raw-byte budgets are explicitly logical accounting, not measured heap guarantees; live offset search is not a snapshot.

- Final actual PG15 composed fivefiles86PASS (Movies9, lifecycle18, runtime-role27, Books7, migrations25), C5 enabled/no skips. Latest exact authenticated MoviesGET/422-beforeI/O/401 test adds MoviesHTTP10PASS. PG tests include concurrent sameparent locking and independent accounts, ownership/active/count/order/nested facts, fresh37 and historical36-to37 upgrade preserving checksums/schema_checksum/applied_at and refusing old-floor readiness. Historical0036 untouched.
- Populated exact-hash restore3PASS includes TVzero facts/explicit-empty watch context/taxonomy rows and revision trigger restoration. Lifecycle retains sharedfacts/globalterms/otheraccount associations while removing deleted-account associations/context.
- Windows real deployment shell/marker combined14files363PASS. This source marker lane took752.80seconds locally; no assertion/deadline weakening. Other changes afterwards are scoped Movie provider/new SQL/test metadata, not engine changes.
- Final clean locked root/backend/auth-runtime: npmci33/779/24packages, scripts suppressed and nestedauth install explicitly performed; all tested module owners resolve inside snapshot. Backend Vitest4.1.9/TS5.6.3/Zod3.25.76; nested auth better-auth1.7.6/Drizzle0.45.3/Zod4.6.5. No dependency edits required.
- Clean fullC0 PASS. Baseline compare clean142current/103resolved/compilerexit2 is existing accepted baseline, not zero errors.15files291PASS current finite contract/provider/inventory selection. First archive run had287PASS/one Gitmetadata-only failure because archive has no.git; historical canonicalblob test separately source16PASS, then same clean291PASS with read-only originalHEAD metadata exposed to git show only. No borrowed original runtime modules.
- Initial provider24PASS superseded by repaired provider30PASS; frontend contained3files8PASS (Movie3/Book4/sharedbundle1). Manifest formatting reduced to purposeful delta with unchanged parsed semantics; clean manifest/restore13PASS after formatting.

Both owned disposable PG resources at51538/58038 were stopped using their original guarded authority/harness. Clean snapshot and evidence artifacts intentionally retained for review, not claimed trusted release artifacts. No secret values inspected/logged, no unowned resource deletion.

## Qualification limits and next action

This qualifies finite PackageA working source for independent review, not all Ticket4.1 parity. Mandatory PackageB provider image-copy/media/UI/public browser acceptance remains, real TMDB credentials/livecompatibility absent, actual Moviesbrowser flow not yet implemented/qualified. Ticket3.5 QA/hostname/producer authority and exact hostedqualification remain open. No merge/production/release, workflow or gate weakening. Separate proof floor37 fixture package belongs to proxy_acceptance_resume and is excluded from writer manifest. After independent review, repair findings, commit only manifest-owned source, then requalify exact committed source before explicit controller push. Do not substitute these local slice results for future category/Music parity.

## Owned frozen source manifest

- .env.music.example
- .env.music.test.example
- deploy/platform.compose.yml
- docker-compose.music-test.yml
- docker-compose.replatform.yml
- docker-compose.yml
- docs/architecture/music-authorization-matrix.json
- docs/architecture/music-runtime-surface-inventory.json
- explorers-earth/src/lib/__tests__/movieCatalogClient.test.ts
- explorers-earth/src/lib/__tests__/ownerSharedBundle.test.ts
- explorers-earth/src/lib/explorersApiClient.ts
- fixtures/db/music-runtime-table-manifest.json
- scripts/platform-runtime-plan.ts
- scripts/platform-runtime-smoke-contract.mjs
- tunes/deployment/music-deploy-engine.sh
- tunes/migrations/0037_explorers_movies_provider_context.sql
- tunes/scripts/music-docker-release-rehearsal.ts
- tunes/scripts/music-e2e-state-restore.mjs
- tunes/scripts/platform-proxy-browser-fixture.ts
- tunes/server/application/catalog.ts
- tunes/server/application/ownerContent.ts
- tunes/server/application/publicContent.ts
- tunes/server/auth/canonicalApp.ts
- tunes/server/db/music-runtime-role.ts
- tunes/server/explorers/categories/movieGenreSeeds.ts
- tunes/server/explorers/categories/movies.ts
- tunes/server/policies/musicSurfacePolicy.ts
- tunes/server/repositories/explorersRecommendationRepository.ts
- tunes/server/repositories/movieCatalogRepository.ts
- tunes/server/routes/explorersCatalogRoutes.ts
- tunes/server/routes/explorersRecommendationRoutes.ts
- tunes/server/services/movieCatalog.ts
- tunes/server/test/contracts/music-e2e-state-restore.test.ts
- tunes/server/test/contracts/music-environment-contract.test.ts
- tunes/server/test/contracts/music-local-database.test.ts
- tunes/server/test/contracts/platform-runtime-plan.test.ts
- tunes/server/test/contracts/platform-runtime-smoke.test.ts
- tunes/server/test/contracts/runtime-surface-inventory.test.ts
- tunes/server/test/deployment/music-deploy-executable.test.ts
- tunes/server/test/deployment/music-deployment-files.test.ts
- tunes/server/test/explorers-lifecycle.integration.test.ts
- tunes/server/test/explorers/movies.integration.test.ts
- tunes/server/test/explorers/movies.test.ts
- tunes/server/test/fixtures/music-production-environment.ts
- tunes/server/test/migrations/music-migration-contract.test.ts
- tunes/server/test/migrations/music-migration.integration.test.ts
- tunes/server/test/movie-catalog.test.ts
- tunes/server/test/movie-writes.test.ts
- tunes/server/test/music-e2e-state-restore.integration.test.ts
- tunes/server/test/music-startup-bootstrap.test.ts
- tunes/server/test/music-surface-policy.test.ts
- tunes/shared/explorersContract.ts
- tunes/shared/explorersMovieContract.ts
- tunes/shared/explorersOwnerContentContract.ts
- tunes/shared/explorersPublicContentContract.ts
- tunes/shared/explorersSchema.ts
- tunes/shared/music-migration-contract.ts
- tunes/tsconfig.music-c0.json

## Early audit repair qualification (supersedes prior freeze)

All six initial findings reproduced against the original frozen snapshot before application edits: provider26 selection had three failures (500 false exhaustion, absent LRU, premature detached-fetch ownership release); actual protected PG13 selection had three failures (genre reparent, unchanged taxonomy child, manual nonempty genre authority). Additional identity deletion regression reproduced separately (PG14 four failures). This is meaningful red evidence; the busy-cursor/cancel cases below are supplementary boundary checks, not falsely described as pre-repair failures.

0037 now rejects genre-companion parent mutation, checks existing children when taxonomy parent category changes, requires provider-origin/canonical TMDB kind/positive-safe-ID/sourceURL/fetchedAt for nonempty genres, and preserves that invariant on identity DELETE/reparenting. Manual empty facts still resolve. Identity DELETE changes the actual constraint trigger fingerprint21->29, coordinated in restore implementation and exact contract expectation. First repair run exposed polymorphic OLD.provider evaluation on another trigger table (42703); nested table-specific control flow repaired it, then fresh PG14 passed. A later clean contract run caught the old fingerprint21 expectation; corrected29 agrees with actual populated restore.

Cursor behavior now promotes legitimate accesses, evicts only eligible least-recently-used states, protects flight/pinned states, and returns opaque410 for eviction. The500 emission cap yields CONTINUATION_LIMIT when upstream work remains; exact true exhaustion at500 is separately proved. Public Movies transport retains CONTINUATION_LIMIT/CURSOR_EXPIRED codes through the shared API contract. No limits/assertions were relaxed. A previous account-cap test expecting refusal despite evictable old states was corrected to the reviewed LRU contract and explicitly checks retained account cache size20, while busy/global/eviction tests independently enforce protection and410.

Native fetch/read/cancel promises and owning async work remain charged to a finite operation lease after a caller deadline. A detached nonsettling operation retains its account/global slot and reservation/retained bytes until actual settlement; four stalled operations deny a fifth before I/O. Nonsettling cancellation and rejected-response body cancellation retain ownership too. Late/failed response bodies are cancelled without awaiting cancellation on caller path, and all promise settlements are observed. Permanently noncooperative transports can quarantine capacity until process restart; this is fail-closed bounded admission, not a claim that arbitrary transport resources are forcibly terminated or that serialized budgets measure heap.

Final receipts on revised source:
- Clean backend full C0 exit0; baseline clean142current/103resolved/compilerexit2. Actual module ownership rechecked inside clean snapshot for Vitest/TypeScript/Zod and auth-runtime better-auth/Drizzle/Zod, unchanged locked dependency topology33/779/24 from original clean receipt.
- Clean15files297PASS, including provider30, SQL migration/checksum, inventories, strict Books/Movie writes, policy112, runtime37/restore fingerprint29 coupling. Read-only originalHEAD Git metadata used only by canonical historical git-blob test; clean dependencies remain archive-owned.
- Actual PG4files84PASS = Movies14+lifecycle18+runtime-role27+migration25 (no skips). Separate book-catalog.integration7PASS and books-public-gateway2PASS. Latest frozen-source Movies14PASS repeats source/transport/SQL edge qualification. Do not sum repeated tests as unique obligations.
- Populated exact-hash restore3PASS with actual fingerprint29, TVzero/context/taxonomy data and revision restoration.
- Original-worktree contained frontend3files8PASS (Movie3/Books4/sharedbundle1). A clean frontend attempt failed before running because that backend-only archive intentionally has no frontend node_modules; it is NOT claimed clean frontend execution. Existing contained frontend runtime is4.1.6; backend clean runtime4.1.9. No dependency borrowing workaround.
- Original Windows real deployment lane363PASS remains applicable because no deployment-engine/marker edits occurred in this audit repair; it was not needlessly repeated. Changes are confined to existing owned SQL/provider/route/shared-error/restore/test files.

Revised58-owned-file hashes are frozen in `.superpowers/movie-package-a-source-hashes.json`. Both owned sidecars51538/58038 stopped through original guarded harnesses. No package commit/push; independent rereview is required. PackageB media/UI/public browser and liveTMDB compatibility remain mandatory/unqualified;3.5 QA/trusted producer and genuine exact-commit hosted qualification remain open. The initial freeze and500partial claim are expressly superseded, not silently counted as success.

## Final watch-order review repair and revised freeze

Independent task4.1-movies-package-a-review.md identified a retained-behavior regression in the pure effective-watch helper. Before edits, the exact independent probe plus duplicate-within-one-mode, equal-priority ties and >8 cross-mode tests produced category5/4FAIL. Corrected existing expectation to retained[3,4,1,2], not a new policy. Source now concatenates original flatrate/rent/buy arrays, FIRST-ID deduplicates before any sorting, globally stable-sorts priority only, then takes8. No providerID tie-breaking or per-mode presort. Explicit selected IDs still resolve original first occurrence in owner-selected order, even outside default8.

Only helper and its existing owned category test changed in this review repair. Retained clean archive overlaid exact two files. category5PASS (review-watch-order-green.json); full prior15-file selector now300PASS (review-movies-final300.json), success:true/failed0. FullC0 separately exited0; baseline clean142current/103resolved/compilerexit2 remains unchanged. Copyable selector/scoped/baseline commands and no-activePG status are saved in task4.1-movies-package-a-qualification-commands.md. Prior297 is historical receipt superseded by300, not relabeled. No fresh SQL/restore/engine execution needed for pure-helper-only change; their separately attributed preceding receipts remain unchanged.

All58 owned hashes refreshed and compared to clean snapshot. CurrentHEAD includes separately committed fixture e3c1ff49; these fixtures require composed0037 and must never push alone. Original source archive base remains accurately recorded in manifest. PackageA application source remains uncommitted, no push, both guardedPG resources stopped. Final independent rereview acceptance remains required. MandatoryPackageB/liveprovider/QA/hosted/prod release limitations unchanged.
