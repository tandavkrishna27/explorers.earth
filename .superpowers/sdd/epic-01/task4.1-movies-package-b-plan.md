# Movies Package B media and retained UI implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for sequential owned implementation, or controller-authorized subagent-driven-development with exclusive ownership. Steps below require independent plan verdict before application edits.

**Goal:** Deliver retained Movies/Shows owner and anonymous public flows against canonical backend operations, including controlled provider image copies and uploaded snapshots.

**Architecture:** Reuse PackageA catalog/facts/context/taxonomy plus shared observed-revision commands, publication eligibility, media lifecycle and bounded read contracts. Add a narrowly typed Movie media companion and public projection, then adapt retained dashboard/public components without reviving legacy GraphQL/provider credentials. This is one composed feature package; local helper success does not qualify Ticket4.1.

**Tech stack:** Node24.21.0, locked backend Vitest4.1.9/TS5.6.3, nested auth runtime, PostgreSQL15, existing object-storage adapter, React and contained frontend Vitest4.1.6, actual protected browser harness.

**Spec:** docs/replatform-audit/tickets/ticket-4-1.md; target-database-schema.md; reviewed task4.1-movies-source-preflight.md and PackageA delta. Source base7048c2ecf6a09e521fffa1edc840c10da58acc8e composed over proof fixturee3c1ff49; exact hosted gates pending controller qualification.

## Global constraints and status

- No PackageB source/SQL changes until independent plan verdict. Migration0038 is a proposed next allocation, NOT reserved yet; controller confirms no competing schema writer.
- Preserve canonical numeric movie/TV-ID distinction; TMDB-only global taxonomy authority35mappings/27terms; no caller-created global terms or provider facts.
- Owner rich note/rating/context/images/pins/list membership never mutate canonical provider facts or another account. Publication requires all current account/category/collection/recommendation ancestors.
- Keep current500/52/5200 catalog limits,20/200 LRU,410 expiry/eviction and4global/1account transport leases; no CI/gate/assertion weakening or new infrastructure.
- Preserve exact watch algorithm concat flatrate/rent/buy -> FIRST-ID dedup -> global stable priority ->8; explicit selection retains owner order.
- PackageA committed58 source uses Git-normalized LF; rawWindows hash receipts differ by EOL only. Actual committed0037 checksum must be qualified from exact committed source; never relabel prior rawCRLF PG receipt. No QA/producer/fullparity/release claim.

## Source-grounded retained behavior

AddMoviePage.tsx selects first10 upstream cast entries (both Movie/TV), copies posterw780/backdropw1280/castw185, and falls back to original provider URL on per-image copy failure. Watch logos remain metadata, not a copied media slot. Uploaded snapshots and existing snapshot removal are independent owner media. Current form edits incorrectly collapse numeric0 to empty; typed mapper must preserve0 versusnull. TopPicksManager retains15 category cap, drag staged updates and explicit Save replacement. Current Movies queries are legacy GraphQL; public hook already goes through public gateway, but postgresPublicProfileGateway.ts currently only implements Books pages/list and returns empty for Movies. Current deduplicateMovies keys tmdb_id alone and can conflate movie/TV same-ID; canonical recommendation identity/kind must replace that behavior.

Existing reuse: application/bookCoverImport.ts supplies advisory lock, pending durable receipt, exact account/category/recommendation revalidation, partial slot progress and stale cleanup. services/bookCoverFetch.ts supplies DNS-unicast/socket pinning/MIME sniff/5MiB pattern but is fixed to books.google.com and cannot simply admit another caller URL. application/media.ts, routes/explorersMediaRoutes.ts and shared command receipts supply actual owned storage/revision/purge authority. repositories/bookCovers.ts and publicProfile/publicBooksProjection.ts supply bounded projection pattern, not a generic two-slot Movie schema.

## Review focus

1. Same numeric movie/TV ID, duplicate credits/person IDs, absent/zero facts: no collisions or fabricated metadata.
2. Partial provider/image/upload failure and stale account/entity replacement: entered notes/old media remain, replay does not duplicate bytes, cleanup only owned new assets.
3. Public unpublish/private ancestors during page/media read: fresh recheck before headers/body; anonymous cache and username switches do not expose previous subject.
4. More than first owner/public page and cross-list pins: complete bounded observation/revision check; no truncated category or omitted pin deletion on staged reorder.
5. Retained first-duplicate/stable watch priorities and explicit clear: display/default8/provider selection does not regress again.

## Exclusive file/generator manifest proposed for controller reservation

New backend: tunes/shared/explorersMovieMediaContract.ts; tunes/server/services/movieImageFetch.ts; tunes/server/application/movieMediaImport.ts; tunes/server/repositories/movieMedia.ts; tunes/server/publicProfile/publicMoviesProjection.ts; tunes/migrations/0038_explorers_movie_media.sql (only if confirmed); tests movie-image-fetch.test.ts, movie-image-production-transport.test.ts, movie-media-import.integration.test.ts, publicProfile/moviesGateway.test.ts, moviesPrivacy.test.ts, movies-public-gateway.integration.test.ts.

Existing shared backend: tunes/shared/explorersContract.ts, explorersOwnerContentContract.ts, explorersPublicContentContract.ts, explorersSchema.ts, music-migration-contract.ts; server/application/{ownerContent,publicContent,media}.ts; repositories/explorersRecommendationRepository.ts; auth/canonicalApp.ts; routes/explorersRecommendationRoutes.ts, explorersMediaRoutes.ts, explorersCatalogRoutes.ts; policies/musicSurfacePolicy.ts; publicProfile/postgresPublicProfileGateway.ts; db/music-runtime-role.ts; lifecycle service only exact reference/purge additions. New GET taxonomy contract proposal below must be reviewed before route/policy admission.

Frontend new: features/Movies/api/explorersAdapter.ts, moviesClient.ts, moviesViewModel.ts, publicMoviesContinuation.ts; api/__tests__/explorersAdapter.test.ts, moviesClient.test.ts, moviesViewModel.test.ts. Existing: api/query.ts, mutation.ts, types/index.ts, hooks/useTMDBSearch.ts; dashboard/AddMoviePage.tsx, MovieListView.tsx, MoviesHome.tsx, TopPicksManager.tsx; public/PublicMovies.tsx, PublicMovieList.tsx, PublicMovieGenre.tsx, MovieDetailModal.tsx, MoviePosterCard.tsx, TopPicksHero.tsx, TopPicksMobileHero.tsx, GenreBrowse.tsx; utils/movieHelpers.ts; services/tmdbService.ts; lib/explorersApiClient.ts; existing common public category/list hooks/types only exact Movie shape/source-bound validation. Preserve Books consumers; legacy file deletion remainsEpic8.

Runtime/schema coupling if0038 approved: examples, compose/deploy, runtime plan/smoke contract, current proxy fixture marker, restore script/expectations, migration/currentfloor/deployment tests analogous reviewed0037 manifest. Historical0036/0037 immutable. Proof floor38 fixtures require separate controller-owned coordination, not silently edited by Movie writer. Generated inventories from actual tunes/scripts/inventory-runtime-surfaces.ts and inventory-runtime-tables.ts -> docs/architecture/music-runtime-surface-inventory.json, music-authorization-matrix.json, fixtures/db/music-runtime-table-manifest.json. Browser source collector scripts/browser-source-inventory.mjs is an exported closure module, not a file-producing generator; use its real runner/attestation path and report actual discovery, never invent a checked-in output.

Browser new: explorers-earth/e2e/replatform/movies.spec.ts, movies.playwright.config.ts, movies.vite.config.ts; tunes/scripts/movies-browser-fixture.ts. Existing suite-manifest.json/platform-proxy.manifest.json and actual proxy browser wrapper/contracts only to register implemented delivery scope and precise discovery tests. No speculative futurecategory admission.

## Task1: controlled Movie image import and owned persistence

Consumes canonical observed recommendation/entity facts, RequestContext/Actor, existing MediaService and receipt/authorization. Proposed POST /recommendations/:id/movie-media/import consumes ONLY expectedRevision and idempotency key; no URL/host/kind/castID/media-ID authority from caller. Produces strict MovieMediaImportResult{revision,slots}, slot statuses copied/unavailable, owned MediaDto for copied slots and canonical external fallback metadata for failed slots.

Proposed finite profile for independent review: poster/backdrop + first10 original canonical cast entries (12slots max); cast key stores ordinal plus personId/creditId and validates against observed canonical source, never index-alone identity. Source paths must be exact image.tmdb.org /t/p/{w780|w1280|w185}/{safe basename}, rederived from canonical facts and trusted slot. No redirects, userinfo/customport, auth headers or crosshost. DNS entire response must be public-unicast and chosen socket IP pinned with native TLS hostname verification; separate deterministic seam cannot disable policy. Allowed PNG/JPEG/WebP/GIF with MIME+magic exact agreement,5MiB/slot,60MiB cumulative lineage received-byte budget (including failures),2concurrent downloads/global4imports/1account,5s perI/O,60s caller operation,24total native attempts per durable import lineage. These are proposed bounds, not already qualified assumptions. Noncooperative native DNS/socket/body operations retain owned finite slots until actual settlement; prompt caller deadline never resets counters/capacity. Upload concurrency and bytes use same reservation accounting. If profile budget fails, preserve canonical fallback and bounded partial statuses; don't fabricate copied media.

Companion table proposal recommendation_movie_media(recommendation_id,account_id,slot,cast_ordinal/person_id/credit_id,media_id) with exact composite recommendation/account/category ownership and media/account FK, slot/cast shape validation, immutable parent identity, media-reference guard/refcount and deferred cap12. Importreceipt progress stores source entity/observed revision/keyhashed authority and bounded statuses; copied previous slots reused on same-key retry, pending interrupted work resumes under fixed request/source and durable counters; completed partial receipts replay immutably. Explicit retry uses NEW key/current revision and reuses valid owned copied slots, attempting only unavailable slots. Replacement may retain existing data until success; attach final progress atomically and retire/cleanup exact new assets on stale/deleted/suspended/expiredreceipt; all errors leave old owned refs intact. Clarify receipt completion/revision semantics against existing Book command before SQL freeze; no UI duplicate creation to recover import failure.

- [ ] Reproduce callerURL/DNS private or mappedaddress/redirect/rebinding/MIME/magic/oversize/bodydeadline and noncooperative ownership negatives before fetch implementation.
- [ ] Reproduce Movie/TV42 and duplicate cast-person differentcredits collisions, stale/foreign entity/revision, partialcopy retry/replay and owner swap; independently count object puts/removals and unchanged old refs.
- [ ] Implement exact schema/service/contracts within reviewed bounds; actualPG runtime-role grants, concurrentlock/replay, nonempty purge, populated restore, fresh and0037->0038 upgrade immutablechecksums.
- [ ] Produce independently reviewable media API slice with exact owned artifact cleanup and no claim whole4.1 completed.

## Task2: retained owner Movies UI and complete typed observation

Consumes PackageA catalog/search/resolve, typed editable detail and shared completeCategory pagination/revision and staged/exact pins. moviesViewModel maps canonicalkind to retained Movie/TV casing, safeproviderID, zero/null/year/first10cast, ordered effective watchoffers, translated taxonomy terms and owned copied image preferred over canonicalfallback. No enrichment from browser/provider/legacyGraphQL after observation.

readMoviesOwnerContent(signal) uses complete category read and bounded4-worker detail fanout,64MiB aggregate detail envelope, final category/pinrevision recheck, abort/account-generation fence and cloned typed result. >cap returns explicit READ_LIMIT without partial UI. Preserve all actual membershippages; recommendation identity, not bareTMDBID, keys lists/cards/top picks. Reuse Book client sourcebound protocol, not unbounded Promise.all.

Genre-selector missing interface: PackageA supplies assigned movieTerms but no authenticated complete global taxonomy read. Propose GET /catalog/movie-genres (fixed movies category/en translation, max27active reviewed globalterms, strict DTO{id,slug,label,providerMappings}); backend actualtaxonomy source/read-only grants, no caller-created terms. Do not serve static frontend arbitrarylabels or resurrect legacy MOVIE_CATEGORIES. Review route/DTO necessity and exact GET owner admission before implementation.

- [ ] Failing mapper/client tests: Movie/TV42,0vsnull/yearabsence, firstcastlimit/creditidentity, completepagination, stale detail/finalrevision, requestabort/accountswitch, watchordering and explicitclear.
- [ ] Wire search and providerselection to server IDs; providerfailure preserves entered title/note/rating/genre/watch draft; account-generation fence rejects stale selection/save and media progress.
- [ ] Adopt collectioncreate/rename/publication prompts, revisionchecked recommendationcreate/edit/sparseoverrideclear, snapshots upload/remove with failure preserving old images, importer partialprogress/retry UI. No invented watchselector beyond retained context contract/UI requirement.
- [ ] Stage category15pins on drag retaining omitted savedpins; Save exact replacement. Test two lists/reload, duplicate membership, listremove versus recommendationarchive-fromalllists separately; remove misleading legacy delete-copy if semantics now sharedoperations.
- [ ] Run actual component tests for existing publishprompt/navigation, keyboard/focus/loading/retry/errors and account switches, plus affected Books/commonclient regressions.

## Task3: anonymous public projection/list/genre/detail and media authority

Consumes eligible public scope and shared Movie facts/context/taxonomy/copied media. Add publicMoviesProjection following publicBooksProjection snapshot+freshscope checks and exact bounded continuation, no giant firstpage arrays. Map retained publicMovie DTO with first-occurrence canonical images, richnotes sanitized, genre IDs/slugs/labels, collection identity, categorywide pin order and typed Movie/TV. Generic public detail PackageA path is not sufficient: publicProfile gateway currently returns Movies empty pages, so exercise actual retained hook route/source.

- [ ] Red public tests for private/unpublished/account-suspended/collectiondeleted/recommendationarchived ancestor, cursorcrossusername/list/genre, multi-page child/categorycollections, malicious projection shape and inflightunpublish beforeemit.
- [ ] Implement pages/list/genre routes and sourcebound strict shape/continuation; main hero dedup by recommendation/canonicalkind identity, categorypin order distinct from collection membership order.
- [ ] Extend media content authority for copiedMovie refs and uploaded snapshots before HEAD/Range/ETag/304/body; no cache headers disclose inaccessible resources. Recheck anonymouseligibility/races, refcounts and terminalpurge aftermediareference change.
- [ ] Wire retained PublicMovies/list/genre/deeplink/detail; twoanonymouscontexts cached usernamechange, private/public toggles and both deletions preserve unavailabledirectURLs; first10cast and default8watch match owner/preservedbaseline.

## Task4: composed exact-source qualification and review

- [ ] Fresh owned root/backend/auth-runtime/frontend npmci under pinnedNode24; prove actualmodule owners and no root/nativeVitest borrowing. ScopedC0 and baseline comparison separately recordstatus; exact committedSQLLF checksums under realPG.
- [ ] Build actual API and frontend, generatedruntime/table/authorization inventories and no-namespuriousGET/ALL/retired admission. Run PackageA300, proof272 and Bookaffected/securitytests only once stablefreeze unless new failure/edit justifies repeat.
- [ ] Real protectedPG/runtime-role browser desktop/mobile: create Movie42+TV42, notes/title/providerRating0/genre/watchclear, two-list categorypins/reorder/reload, providerdetailfailure preservesdraft, image partialretry/uploadfailure, list+genre+modal deep links, twoanonymousprofiles private/public/unpublish races, both deletion scopes and mediareload. Deterministic providerfixture changes native upstream only; auth/backend/storage/publicqueries remain actual. LiveTMDB smoke separately blocked if config absent, never substitute fixture for livecompatibility.
- [ ] Register only actual Movies deliveredspec in real wrapper/discovery/egress manifests; exactfixture authority includescurrent schema. Preserve screenshots/requestfailures sanitized and exact source receipt; abandoned owned sidecars/resources cleaned via protected authorities.
- [ ] Independent review fullcomposedfreeze before scopedcommit/controllerexplicitpush; exact hosted gates mustqualify that commit. Full4.1 requires allmedia/owner/public obligations,3.5 milestone/QA/fullparity/prodrelease remain separate.

## Decisions/prerequisites requiring plan verdict

Controller selected12slots(first10cast),60MiB cumulative received lineage/24attempt/60s caller/5s I/O. Distinct retained-memory/settlement leases are specified in task4.1-movies-package-b-delta.md; cast compositekey and partialreceipt/revision semantics; allocate0038 and schema-marker/prooffixture coordination; approve strict authenticatedMoviegenreterm route. Existing credentials names TMDB_ACCESS_TOKEN/TMDB_API_KEY only (presence must be checked booleans by allowed localconfig owner; no values/logs). Providerimagefetch needs no browsersecret. Existing QA hostname/OAuth/providerdeployment inputs and trusted candidate producer remain separate missing operational authority; deterministic PackageB can progress only after source/gates and finiteplan approved. No productionrelease decision requested here.

Eight review corrections supersede earlier ambiguous descriptions: authoritative finite delta is task4.1-movies-package-b-delta.md. No source implementation until delta verdict.
