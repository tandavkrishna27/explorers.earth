# Movies Package B frozen contract and ownership delta for independent review

2026-10-03. Specifies the response to all eight corrections in task4.1-movies-package-b-plan-review.md. Controller selected60MiB cumulative received lineage,24attempt,60s caller and5s I/O; exact globalgenreGET accepted. Review-only: no SQL/application edits.0037 immutable. Current composedPackageA7048 was independently committed/qualified/pushed. Source tree has no0038 migration; no competing schema reservation observed; controller tentatively reserves0038_explorers_movie_media.sql exclusively to this writer pending verdict. One source writer owns all shared files below; UI delegation only after these contracts freeze and parent assigns exclusive nonoverlapping components.

## 1. Frozen wire contracts

New shared explorersMovieMediaContract.ts exports:
- MovieMediaSource{entityId:UUID,provider:'tmdb',externalKind:'movie'|'tv',externalId:positive-safe decimal string,mappingVersion:1,fetchedAt:nonnegative safe integer}. Exact entity/kind/ID/current immutable facts resolved by server, not accepted as request authority.
- MovieMediaSlotKey discriminated {kind:'poster'}|{kind:'backdrop'}|{kind:'cast',ordinal:int0..9,personId:positive-safe-int,creditId:string1..200}. First10 ORIGINAL canonical cast positions selected BEFORE filtering absent profile images; no eleventh substitute. Duplicated person/credit pairs remain separate by originalordinal.
- MovieProviderMedia{source:MovieMediaSource,poster:MovieOwnedImage|null,backdrop:MovieOwnedImage|null,cast:array<=10 of{slot:castkey,media:MovieOwnedImage|null}}; MovieOwnedImage uses same strict ownedURL/id/MIME/size/alt/caption shape as Book cover media,5MiB and MIME PNG/JPEG/WebP/GIF. Copied refs projected only when current recommendation.entity_id equals source.entityId and canonical tuple/fetchedAt/mappingVersion/slot matches. Uploaded snapshots remain existing recommendation.mediaIds max20 and5MiB each, independent of provider12cap and replacement.
- ImportMovieMediaRequest{expectedRevision:positive-safe-int} strict; idempotency key existing8..200 commandheader. POST /api/explorers/v1/recommendations/:id/movie-media/import accepts no URL/mediaID/source/cast overrides. ImportMovieMediaResult{id,revision,source,slots:<=12 ordered(slot,status:'copied'|'unavailable'|'absent',media:copied-only)} strict. Canonical fallback URL comes ONLY from source-bound detail mapper, not receipt/request; absent source is absent rather than failure. No arbitrary server error text/URL secret in statuses.
- MovieGenreTermsResult{version:'explorers-movie-genres/v1',items:array<=27 of{id:UUID,slug:canonical-seededslug,label:Englishtranslation,providerMappings:array<=2 of{externalKind,providerGenreId}}} strict. GET /api/explorers/v1/catalog/movie-genres consumes NO queryparameters; fixed movies/en, active seeded canonical terms, stable slug/id order and mapping kind/id order. Fetch28terms then explicit READ_LIMIT/configuration error if>27, never truncate; validate exact35 reviewed kind/ID mapping membership and expected27term/eightmerge taxonomy authority. Mapping drift fails closed, not silently expandsseeds. Actor entities:resolve scope revalidated beforequery andbeforeemit,401withoutsession,403insufficientdelegatedscope. Exact GET-only policy/authorization entries; ALL/retired/othercategory aliases denied. New READ_LIMIT error code declared narrowly in shared enum if absent, no genericerrorrelaxation.

Movie owner editable detail gains providerMedia (null for manual or no valid copies); public retainedprojection uses same source-boundmedia resolver. Effective details remain authoritative allcanonicalcast<=200, but retainedvisualcard/modalfirst10 positions match originalAdd behavior; no canonicalfact deletion. Watchlogos stay trustedmetadata, no new copiedslot/watchUI. ProviderRating0/runtime0/season0 preservezero; creatoruserRating remains existingnull or1..10, no expandedratingrange.

## 2. SQL/source/replacement and references

0038 creates recommendation_movie_media with recommendation_id UUID/account_id UUID/category fixed'movies'; source_entity_id UUID and source_external_kind/source_external_id/source_fetched_at/source_mapping_version=1; slot discriminator poster/backdrop/cast; cast_ordinal nullable0..9/person_id/credit_id nullable together; media_id UUID; slot_index0poster,1backdrop,2+ordinalcast. PK(recommendation_id,slot_index), unique(recommendation_id,account_id,slot_index), compositeFK recommendation(id,account_id,category), media(id,account_id), entityidFK entities. Immutableparent/slot/source identity on UPDATE; replace slot via controlled delete/insert. Allmedia refs require ready/purpose'recommendation'/PNGJPEGWebPGIF/1..5MiB and source tuple/current recommendation entity/type/canonical slot URL/credit match. Beforeparentlock + deferred count/source/order/fact checks apply inverse media status/purpose/size changes and recommendation entity/category changes. Runtime triggerfunctionEXECUTE denied; runtime CRUDonly exact newrelation, no globaltaxonomywrites. Cast holes for absent images legal; no fake contiguous10count requirement.

Source tuple stores actualidentityfetchedAt/mappingVersion1; canonical Movie facts immutable (existing catalogrepository). No invented mutable facts-version/hash needed: entityID+exactproviderkind/ID/fetchedAt/mapping1 and SQL canonicalslot equality bind immutable source. If futurefact refresh supported, new version semantics require separatereview, not silentlyreusecopies.

replaceRecommendationEntity transaction locks account/category/recommendation in existing order, validatesnewentity/context/terms, detaches all old-source provider companionrefs BEFORE source update, records exact newlyunreferencedasset IDs for owned cleanup, then updatesentity/revision once; uploaded snapshotrecommendation_media untouched. Rollback leavesoldrefs+objectsintact. Commit makesoldcopiesineligible atomically; only then deletezero-ref oldassets, with durable pending_delete intent in same replacementtxn for exactzero-ref ownedrecords and existing cleanup mechanism. Otherrefs including another slot/snapshot/profile/book preventdeletion. No media object removed before commit, no anotheraccountglobalfacts purge. SQL guard and projection mask failclosedevenif applicationreplacementmissescleanup; directSQL invalidsourcecannotcommit.

mediaRepository.ts expands referencecount, abandonedready exclusion and publicattachment queries for source-boundMovie refs; preserve Books. Publicattachment includes BOTH Moviesrecommendation_media snapshots and recommendation_movie_media with exactcurrent source plus currentactive/onboarded/publicaccount/category and at leastonepublishedpublicunarchivedcollectionmembership and recommendation. MediaService resolveMediaContent fresh authorization beforestorage AND afterstorage read, before returnedbytes/ETag/HEAD/Range/304; owner/private auth rechecked too. Media route emitsnothing sensitive untilfresh check. Repeated sharedasset references count perrelation; zero-refonly cleanup. SQL reverse media guard includesnewrefs; media purpose/status mutation cannotbypassownership. Lifecycle/purge function public.purge_explorers_account_content amended in0038 only, cascaded newrelation plus zero-refassets/objects under existing terminalauthority; sourcefacts/globalterms retained. Existing accountLifecycleMaintenance uploadgate alreadysettleslivewriters; preserveitslockorder.

## 3. Immutable receipt, pending resume and crash semantics

Use existing application_command_receipts key(operation='importMovieMedia',account,keyhash), fixed requesthash(id,expectedRevision), expiry/status semantics; bounded strict progress storedresponse, no unrelated receipt/table redesign. Source binding and original expectedrevision frozen on first transaction; Actor/source/currentrevision rerevalidated before eachnativeadmission/progresswrite/attachment/final response. Pending samekey canresume only exactrequest/source and livependingreceipt; completed response is immutable replay withoriginalresultrevision evenifpartial, neverrerunsunavailable orchangesresponse. Replay still revalidates Actor/current source eligibility; subsequent unrelated revisionchange does not recomputeoriginalreceipt, source replacement invalidates delivery and retiresoldsource authority instead of returning oldimages.

ExplicitRetry uses NEW key and freshlyobserved currentrevision. Reads currentlyvalidcopiedrefs and reusesthem (no newput/no bytes/noattempt), attempts only unavailable slots. Same canonical URL appearinginmultipleprovider slots reusesONEownedasset within this account/recommendation/source lineage; aliasrefs count separately and cleanup requiresallaliasesgone. Reusekey includes exacttrusted reconstructedURL and acceptedMIME; never crossaccount/recommendation scope caches. Castordinalidentity remainsdistinct evenwhenURLshared.

Before everynative download/upload admission, persist monotonic counters/slotinprogressmarker in shorttransaction under receipt+recommendation lock; no remoteI/O withSQLtransactionopen. Downloadticket encompasses exactlyoneDNS resolution, one pinnedTLSconnect and one boundedbody transfer; retry any failedstage requires NEWdownloadticket; no automaticDNS/socket/redirectretry. Objectput consumes separateuploadticket, so12unique sourceimages requireup to24 tickets. Stage counts persist alongside tickets: dns<=downloadTickets,connect<=downloadTickets,body<=downloadTickets,put<=uploadTickets and download+upload<=24. Everyadmitted phase/failure consumesitsassignedticket, no phase oruploadhiddenoutsidecounter. Redirect is refused andconsumescurrentdownloadticket. Native body read acceptedintoownedbuffers is metered; counters chargefailedacceptedbytes too. Reserve full5MiB durablebyteescrow before eachdownload, decrement unusedescrow to exactobserved acceptedbytes ONLY on confirmednormalsettlement; crash/uncertain settlement leavesfullcharge, so restartcannotreclaimunknownquota. received+reserved<=60MiB enforcedSQLpendingprogress; no reset onpendingresume. Newexplicit command hasfreshfinite lineage but peraccount native leases/ratecap remain. Do NOTclaimTCP/kernel/network-discardedbytes are heap/receivedapplicationbytes; bounded reader acceptsno morethanreservedprofile, abortoncontentlength/premature/oversize/malformedmime, retainsopaque nativebuffer reservation untilsettlement.

Crashobjectput beforeprogress: MediaService.reserve already persistsobjectkey/ownedmedia uploading reservation before nativeput; use readyWrite callback to atomicallymarkready AND saveprogress. Lostcommitack follows existing actualreadyreceipt lookup, no deletionofcommitted/uncertainwork. Resume finds durablematchingprogress; absentprogresswitholdowneduploadrow is compensated byexistingabandoned/pendingdelete mechanism, never guessesglobalobjectkeys. Crashafterfinalattachcommit/beforeHTTPresponse replays immutablecompletedreceipt, one revision bump/assetput. Suspension/delete/sourcechange orpendingexpiry retiresreceipt and records ownednewunattachedassetcleanup; preexistingreusedassets never compensated. No process-local slotstatus treated as durableauthority.

## 4. Counters, retained memory and genuine native settlement

Controllerbounds:60MiB cumulativeacceptedreceived+conservativeunsettledescrow,24download+puttickets,60s caller,5s DNS/socket/body/nativeput phase. Two workers/import; global4 and1/account nativeleases. Rate30newcommandadmissions/60s/account, completedreplay authenticated but no nativeadmission; mapcap10000 with expirycleanup, consistent existingcatalogfinitepolicy.

Distinct retainedreservation:20MiB/import imagebuffer escrow (2workers x (5MiBchunkretention+5MiB contiguousconcatenation)) plus256KiB boundedprogress/requestmetadata; global81MiB =4*(20MiB+256KiB). Upload uses same contiguousbuffer reservation until actualobjectputsettles, no releasingdownloadreservation whilestorageholdsbuffer. Dedupaliases keeponlyIDs/statuses afterput, notall12buffers. Exactserializedmetadata<=256KiB, canonical/progressbasearrays independentlyslot12caps. No measuredheapguarantee: nativeTLS/S3 opaquebuffers are outsidelogicalownedBuffer account, but admittedoperationcount bounded and actualsettlementleases never releasedbycaller race.

Source probe shows ObjectStorage.put currentlywraps nativeS3send in storageDeadline Promise.race, so observingouterput alone is INSUFFICIENT. Add narrowly scoped optionalowned-put API in services/objectStorage.ts returning{completion:Promise<version>,settlement:Promise<void>}; productionS3send and localfilesystem work trackedatnative boundary, callercompletiondeadline doesnot resolve settlement. Corresponding MediaService ownedimport method holdsaccountuploadgate/compensation untilnative settles; caller canreturnboundederror while continuationretainsreservation and onlythen checksreadyreceipt/cleanup. Existing ordinaryBook/Profile APIs preservebehavior; no trustfixture thatfakesproductionsettlement. Fake seam tests exercise identicalpolicy/counter/controller path and explicitnever/late/rejectednative cases. If actualS3/librarysemantic cannot expose trustworthysettlement, providerimportfailsclosedratherthanclaimboundedresources, and reportpreciseblocker beforebroadeninginfrastructure.

## 5. Exact exclusive path manifest

CREATE:
- tunes/migrations/0038_explorers_movie_media.sql
- tunes/shared/explorersMovieMediaContract.ts
- tunes/server/services/movieImageFetch.ts
- tunes/server/application/movieMediaImport.ts
- tunes/server/repositories/movieMedia.ts
- tunes/server/publicProfile/publicMoviesProjection.ts
- tunes/server/test/movie-image-fetch.test.ts
- tunes/server/test/movie-image-production-transport.test.ts
- tunes/server/test/movie-media-import.integration.test.ts
- tunes/server/test/publicProfile/moviesGateway.test.ts
- tunes/server/test/publicProfile/moviesPrivacy.test.ts
- tunes/server/test/movies-public-gateway.integration.test.ts
- explorers-earth/src/features/Movies/api/explorersAdapter.ts
- explorers-earth/src/features/Movies/api/moviesClient.ts
- explorers-earth/src/features/Movies/api/moviesViewModel.ts
- explorers-earth/src/features/Movies/api/publicMoviesContinuation.ts
- explorers-earth/src/features/Movies/api/__tests__/explorersAdapter.test.ts
- explorers-earth/src/features/Movies/api/__tests__/moviesClient.test.ts
- explorers-earth/src/features/Movies/api/__tests__/moviesViewModel.test.ts
- explorers-earth/e2e/replatform/movies.spec.ts
- explorers-earth/e2e/replatform/movies.playwright.config.ts
- explorers-earth/e2e/replatform/movies.vite.config.ts
- tunes/scripts/movies-browser-fixture.ts
- explorers-earth/src/features/Movies/api/usePublicMovieGenre.ts
- explorers-earth/src/features/Movies/api/__tests__/usePublicMovieGenre.test.tsx

MODIFY actualsharedsource:
- tunes/shared/explorersContract.ts
- tunes/shared/explorersOwnerContentContract.ts
- tunes/shared/explorersPublicContentContract.ts
- tunes/shared/explorersSchema.ts
- tunes/shared/music-migration-contract.ts
- tunes/server/application/catalog.ts
- tunes/server/application/ownerContent.ts
- tunes/server/application/publicContent.ts
- tunes/server/application/media.ts
- tunes/server/application/accountLifecycleMaintenance.ts (onlyif actualnewref upload/terminalcleanup coordination requires; reservedexactpath, no broadrewrite)
- tunes/server/repositories/explorersRecommendationRepository.ts
- tunes/server/repositories/mediaRepository.ts
- tunes/server/services/objectStorage.ts
- tunes/server/auth/canonicalApp.ts
- tunes/server/routes/explorersRecommendationRoutes.ts
- tunes/server/routes/explorersCatalogRoutes.ts
- tunes/server/routes/explorersMediaRoutes.ts
- tunes/server/policies/musicSurfacePolicy.ts
- tunes/server/publicProfile/postgresPublicProfileGateway.ts
- tunes/server/db/music-runtime-role.ts
- tunes/server/explorers/categories/movies.ts (existing reviewedhelper reuseonly, never redeclare/alterretainedwatchorder)
- explorers-earth/src/lib/explorersApiClient.ts
- explorers-earth/src/features/Movies/api/query.ts
- explorers-earth/src/features/Movies/api/mutation.ts
- explorers-earth/src/features/Movies/types/index.ts
- explorers-earth/src/features/Movies/hooks/useTMDBSearch.ts
- explorers-earth/src/features/Movies/components/dashboard/AddMoviePage.tsx
- explorers-earth/src/features/Movies/components/dashboard/MovieListView.tsx
- explorers-earth/src/features/Movies/components/dashboard/MoviesHome.tsx
- explorers-earth/src/features/Movies/components/dashboard/TopPicksManager.tsx
- explorers-earth/src/features/Movies/components/public/PublicMovies.tsx
- explorers-earth/src/features/Movies/components/public/PublicMovieList.tsx
- explorers-earth/src/features/Movies/components/public/PublicMovieGenre.tsx
- explorers-earth/src/features/Movies/components/public/MovieDetailModal.tsx
- explorers-earth/src/features/Movies/components/public/MoviePosterCard.tsx
- explorers-earth/src/features/Movies/components/public/TopPicksHero.tsx
- explorers-earth/src/features/Movies/components/public/TopPicksMobileHero.tsx
- explorers-earth/src/features/Movies/components/public/GenreBrowse.tsx
- explorers-earth/src/features/Movies/utils/movieHelpers.ts
- explorers-earth/src/services/tmdbService.ts
- explorers-earth/src/features/PublicHome/api/publicProfileGatewayClient.ts
- explorers-earth/src/features/PublicHome/api/usePublicRecommendationCategory.ts
- explorers-earth/src/features/PublicHome/api/publicProfilePagination.ts (onlyexactMovie continuationbinding)

EXACT marker/runtime/test/generator MODIFY reservations (historical 0036/0037 cases retained):
- .env.music.example
- .env.music.test.example
- docker-compose.yml
- docker-compose.music-test.yml
- docker-compose.replatform.yml
- deploy/platform.compose.yml
- tunes/deployment/music-deploy-engine.sh
- tunes/scripts/music-docker-release-rehearsal.ts
- tunes/scripts/music-e2e-state-restore.mjs
- tunes/scripts/platform-proxy-browser-fixture.ts
- scripts/platform-runtime-plan.ts
- scripts/platform-runtime-smoke-contract.mjs
- scripts/platform-runtime-smoke.mjs
- tunes/scripts/inventory-runtime-surfaces.ts
- tunes/scripts/inventory-runtime-tables.ts
- docs/architecture/music-runtime-surface-inventory.json
- docs/architecture/music-authorization-matrix.json
- fixtures/db/music-runtime-table-manifest.json
- tunes/tsconfig.music-c0.json
- tunes/server/test/contracts/music-e2e-state-restore.test.ts
- tunes/server/test/contracts/music-environment-contract.test.ts
- tunes/server/test/contracts/music-local-database.test.ts
- tunes/server/test/contracts/runtime-surface-inventory.test.ts
- tunes/server/test/contracts/runtime-table-manifest.test.ts
- tunes/server/test/contracts/platform-runtime-plan.test.ts
- tunes/server/test/contracts/platform-runtime-smoke.test.ts
- tunes/server/test/contracts/platform-proxy-browser.test.ts
- tunes/server/test/deployment/music-deploy-executable.test.ts
- tunes/server/test/deployment/music-deployment-files.test.ts
- tunes/server/test/migrations/music-migration-contract.test.ts
- tunes/server/test/migrations/music-migration.integration.test.ts
- tunes/server/test/music-runtime-role.integration.test.ts
- tunes/server/test/music-e2e-state-restore.integration.test.ts
- tunes/server/test/explorers-lifecycle.integration.test.ts
- tunes/server/test/explorers-media.integration.test.ts
- tunes/server/test/explorers-object-storage.test.ts
- tunes/server/test/music-startup-bootstrap.test.ts
- tunes/server/test/music-surface-policy.test.ts
- tunes/server/test/fixtures/music-production-environment.ts
- explorers-earth/src/features/Movies/__tests__/useTMDBSearch.test.ts
- explorers-earth/src/features/Movies/__tests__/movieHelpers.test.ts
- explorers-earth/src/features/Movies/__tests__/movieHelpers.extra.test.ts
- explorers-earth/src/features/Movies/components/dashboard/__tests__/movieListViewPublishPrompt.test.tsx
- explorers-earth/src/features/Movies/components/dashboard/__tests__/createMovieListNavigation.test.tsx
- explorers-earth/src/services/__tests__/tmdbService.test.ts
- explorers-earth/src/services/__tests__/tmdbService.extra.test.ts
- explorers-earth/src/features/PublicHome/api/__tests__/usePublicRecommendationCategory.test.tsx
- explorers-earth/src/features/PublicHome/api/__tests__/publicProfileGatewayClient.test.ts
- explorers-earth/src/features/PublicHome/api/__tests__/usePublicProfileDetail.test.tsx
- explorers-earth/src/features/PublicHome/api/usePublicProfileDetail.ts
- tunes/server/routes/explorersPublicProfileRoutes.ts
- tunes/server/publicProfile/publicProfileService.ts
- tunes/server/publicProfile/publicProfileContract.ts
- tunes/server/publicProfile/localPublicProfileGatewayApp.ts
- explorers-earth/e2e/replatform/suite-manifest.json
- explorers-earth/e2e/replatform/platform-proxy.manifest.json
- scripts/platform-proxy-browser.mjs
- scripts/platform-proxy-browser-contract.mjs
- tunes/scripts/platform-proxy-browser-support.ts
- scripts/browser-source-inventory.mjs
- scripts/browser-source-inventory.test.mjs

The two browser-source-inventory files are closure collectors, not checked-in-output generators. The two tunes inventory scripts produce the three exact JSON outputs above. Current C0 repair ownership remains with the proxy writer; all overlapping future B edits wait for controller freeze/handoff. No allowance weakening.

Additional exact MODIFY reservations for the genre transport interface:
- tunes/server/test/publicProfile/explorersPublicProfileRoutes.test.ts
- tunes/server/test/publicProfile/publicProfileService.test.ts
- tunes/server/test/publicProfile/publicProfileContract.test.ts

The machine-readable task4.1-movies-package-b-path-manifest.json is the exact create/modify reservation list. Verified every MODIFY path exists and every CREATE path is absent; 0038 is absent. A reservation is not a claim that every path must change. Any extra path requires controller coordination before an edit. No current C0 generator, Docker or JSON repair is touched by this planning delta.

Old target-database-schema.md is durableauthoritativeuntrackedmulti-epicdoc; schema clarification hereownsnewMoviecompanion semantics, no committingunreviewedwholeplans. No0037 edits. ExistingmusicLifecycleService.ts is Music-specific andnotactualcanonicalpurgeowner; doNOTedit it by guessedname. SQLpurge function in0038 plus existing application/accountLifecycleMaintenance.ts authority is relevant. Floor38 proofrelease/OCI fixtures remainseparatecontrollerwriter ownership; Movie writer doesnot touch prior3.5 fixtures concurrently. Any newactualpathnotlisted needs controllercoordination beforeedit.

## 6. Typed public genre boundary

Proposed PublicMovieGenrePageRequest is strict: username uses existing canonical parser; genreSlug uses canonical seeded slug syntax (1..100 characters); limit uses existing finite page-size profile, and cursor is an opaque bounded string (maximum 2048 UTF-8 bytes). No category/provider/account/media URL parameters. GenrePageResult retains the existing public Movies page envelope and explicit next cursor; no caller-supplied offset is treated as proof of account, publication, genre or revision. Gateway-to-service-to-route-to-client contracts must carry the same scope. Legacy hook offsets must translate through a bounded client receipt map containing server-issued cursors, not invent cursor authority. Cache and invalidation keys include username, category and genre slug; account changes abort stale work. Public list detail continues independently through the existing detail hook. Strict cursor tamper/cross-list/cross-genre/revision/ancestor races and page 2+ are mandatory real Postgres tests. This proposed genre route/interface needs the independent delta verdict before source edits.

## 7. Full owner/public/media/browser qualification remains mandatory

Ownerclient4worker/64MiB completecategory observation plusfinalcontent/pinrevision check; typedDTO sourcevalidation and account-generationabortfence. Singlemovie recommendationidentity remainsdistinct fromMovie/TVnumericID and distinctaccountrecommendations/membership. Pins15categorywide, dragstagedupsert preservesomittedsavedpins, explicitSaveexactreplace. Listremoval removeslist/memberships only; recommendationarchive hidesallmemberships; labels/promptsmatchactualnewsharedsemantics. Provider/detailfailure preservesdraft; copiedimagefailurecanonicalfallback; uploadedimagefailureoldrefs preserved. No newwatchselectionUI.

Public gateway pages/list/genre/detail must implement Movies reads. Reserve GET /api/explorers/v1/profiles/:username/recommendations/movies/genres/:genreSlug as a distinct genre route, registered before the existing generic detail route; strict seeded slug, fixed movies category, bounded page limit and opaque cursor. Extend PublicProfileService/gateway interface and Postgres implementation with genrePage; do not overload list slugs or filter a complete category in the browser. Add a new usePublicMovieGenre hook and tests under the exact CREATE paths below, using the existing paged-resource lifecycle and invalidation machinery. Existing list detail continues through usePublicProfileDetail. These are proposed typed interfaces pending this delta verdict, not existing functionality. Cursor binds username/account/category/list/genre plus observedeligibility/contentrevision andactualscope; finalancestorcheckbeforeemit. Categorywidepinscomplete independently ofcollectionorder; nestedcollectionpreviewsconsumeallcontinuations withboundedresponses. SameIDdifferentkind andseparaterecommendations notcollapsed. AnonymousmediaHEAD/Range/ETag304 usesfresh currentancestor+sourceboundrefs, including snapshots.

TDDnegatives: completedpartial replay/newkeyretry; crashputbeforeprogress and finalcommitbeforeHTTP; sourceentityreplacement rollback/commit witholdmedia/newdifferentMovie; duplicatepersoncredit differentordinal; absentfirst10profiledoesnotpromote11th; duplicateURLsingleputaliases/refcounts; allsnapshot20independentprovider12; stage/countercrash/byteescrow/neverlateput leases; directSQL mediareverse/sourceoldparent guards; actualGETtaxonomy401/403/mappingdrift/cap28/ALLdenial; >firstpageowner/public/list/genre plusunpublish/deletionraces andtwoanonymoussubjects. Independently generatedfixtures/nativeTLSsocket production transport test separatedfrommockseam. Real protectedPG fresh0038/0037upgrade/historychecksums/runtimegrants/purge/populatedrestore. Exactcleanroot/backend/auth-runtime/FRONTENDnpmci, fullscoped/baseline/API/frontendbuild and requiredMovie/common/Booksregressions. Real actualbackend/storage/auth browser desktop+mobile, keyboard/focus/retry/loading/sanitizedrequesterrors/screenshots; no mockedAPI browser substitution. ActualliveTMDB compatibility separatelycredentialblocked ifmissing; deterministicupstream notlivequalification.

Independentdelta verdict before SQL/code. After review, freeze eachscope, meaningfulred->green, originalwriterrepairs, independentcomposedreview andexplicitcommit/controllerpush.3.5 QA/trustedproducer/fullparity/prodrelease remainopen; localB sliceisnotmilestonereleaseauthority.
