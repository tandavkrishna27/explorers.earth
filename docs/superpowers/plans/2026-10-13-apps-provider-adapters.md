# Apps Provider Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (the preserved execution method) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement website metadata and Apple App Store adapters as two curated choices within the existing single-source Apps binding, then verify the real owner/provider/scheduled-job flow locally before future hosted cutover.

**Architecture:** Pure versioned identity and decoder modules produce only validated suggestion fields, executed in an owned cancellable worker thread in production. The existing pinned HTTPS transport gains a closed content profile; the existing durable worker retains ownership, leases, atomic entitlement completion and provenance. A curated registry connects the same exact approved tuples to worker configuration and owner binding without automatic source association.

**Tech Stack:** TypeScript, Node 24, existing parse5 8.0.1, Zod, Vitest; existing PostgreSQL worker functions unchanged.

**Spec:** `.superpowers/sdd/2026-10-09-replatform-waves/wave2-included-features-spec-normalized.md`; reviewed provider card `C:/Users/TK/AppData/Local/Temp/codex-apps-a3-provider-specialization-c6bd8d17.md`, amended by root review: closed Accept plus response MIME/charset; supplied invalid Apple fields refused; both adapters are choices, never dual-source aggregation.

## Global Constraints

- Current protected source freeze permits this TEMP plan only. Root saves it to `docs/superpowers/plans/2026-10-13-apps-provider-adapters.md` and releases explicit implementation ownership after qualification.
- User controlling override: LOCAL FIRST. No server/custody questions now, hosted nightly deployment and Strapi removal are later cutover; no Strapi writes. Offline source tasks precede root-reviewed bounded actual LOCAL provider and local scheduler qualification. No provider/resource action occurs merely by preparing this plan; root controls existing guarded allocation. No invented operating values/secrets/retention policy.
- New detached draft source workspace is `C:/Users/TK/AppData/Local/Temp/codex-wave2-local-source-c6bd8d17`; root copies reviewed plan there and allocates implementation after dependency copying. Original worktree and dependencies remain frozen during Music166. Do not edit original or author code before allocation.
- One active source/generation per recommendation. No merge, name-search auto-association, retired scraper endpoint, Puppeteer, assets or automatic owner acceptance.
- Missing data remains omitted; valid all-metadata absence is unavailable; malformed or supplied-but-invalid metadata is invalid/refused.
- Website fields are title and description only. Apple may additionally supply priceTier and platforms. Every supplied field retains the configured canonical source URL and trusted observation time.
- Existing JS/schema/database length, allow-field and provenance validation remains authoritative; test policy values are explicit synthetic fixtures.
- Root owns shared wiring, source freezes, qualification manifests and commits. Implementers do not independently commit shared files or run protected PG lanes.

## Review Focus

1. Malformed UTF-8, charset disagreement or mislabeled HTML/JSON must refuse without rendering/fetching embedded content (Tasks 1–3).
2. Hostile nesting and many short nodes must not block the parent worker: byte admission, isolated heap/stack limits and owned cancellation bound production parsing; postparse node/depth limits validate results without claiming preallocation bounds (Tasks 2–4).
3. A mismatched Apple ID/kind, ambiguous Product object or invalid supplied value must never become unavailable or another app's suggestion (Tasks 2–3).
4. Late abort/lease loss during decode must prevent completion; sanitized diagnostics must omit bodies, URL queries and parser errors (Task 4).
5. Curated owner-source choice must use the same exact tuple as worker approval and refuse absent configuration with zero I/O (Task 5).

## File Map and Shared Interfaces

- Modify `tunes/server/services/appEnrichmentFetch.ts`: closed content profiles and response admission.
- Modify `tunes/server/application/appEnrichmentWorkerValidation.ts`: required fingerprinted fetch.contentProfile.
- Modify `tunes/server/application/appEnrichmentWorker.ts`: strict successful/empty decoder outcome and post-decode cancellation check.
- Create `tunes/server/application/appEnrichmentProviderIdentity.ts`: canonical identity helpers.
- Create `tunes/server/application/appEnrichmentProviderParsing.ts`: strict UTF-8 and bounded JSON preflight shared by both adapters.
- Create `tunes/server/application/appEnrichmentWebsiteAdapter.ts` and `appEnrichmentAppleAdapter.ts`: pure adapters.
- Create `tunes/server/application/appEnrichmentProviderRegistry.ts`: curated configuration composition only.
- Create `tunes/server/services/appEnrichmentOwnedDecoder.ts` and `appEnrichmentDecoderThread.ts`: parent-owned async decoding/cancellation and closed worker-thread dispatcher. Create `tunes/server/test/contracts/app-enrichment-owned-decoder.test.ts` for actual isolated cancellation/settlement tests.
- Modify `tunes/server/auth/canonicalApp.ts` and its existing caller/config bridge only in root's shared integration allocation.
- Tests: existing `contracts/app-enrichment-fetch.test.ts`, `app-enrichment-worker.test.ts`, `app-enrichment-worker-contract.test.ts`, `app-enrichment-api.test.ts`; create `contracts/app-enrichment-provider-identity.test.ts`, `app-enrichment-provider-parsing.test.ts`, `app-enrichment-website.test.ts`, `app-enrichment-apple.test.ts`, `app-enrichment-provider-registry.test.ts`.
- Modify shared `tunes/shared/explorersAppEnrichmentContract.ts` for the source-choice DTO; backend `tunes/server/application/appEnrichment.ts` and `tunes/server/routes/explorersAppEnrichmentRoutes.ts` for owner-authorized choices.
- Frontend ownership: `explorers-earth/src/features/AppsAndTools/api/appEnrichmentClient.ts`, `hooks/useAppEnrichment.ts`, `components/dashboard/AppEnrichmentPanel.tsx` and existing `api/__tests__/appEnrichmentClient.test.ts`, `components/dashboard/__tests__/AppEnrichmentPanel.test.tsx`.

Interfaces agreed before parallel implementation:

```ts
type AppContentProfile = 'html-utf8' | 'json-utf8' | 'apple-json-utf8';
type AppSourceIdentity = z.infer<typeof appSourceIdentitySchema>;
type AppSourceChoice = Readonly<{identity:AppSourceIdentity;label:string;sourceUrl:string}>;
type AppProviderConfiguration = Readonly<{
 sources:readonly unknown[];
 choiceLabels:readonly Readonly<{identity:AppSourceIdentity;label:string}>[];
}>;
// Required fetch configuration field; no implicit JSON profile/default.
type AppDecodedOutcome = {kind:'fields';fields:AppSnapshot['fields']} | {kind:'unavailable'};
type AppProviderParsingPolicy = Readonly<{
 maxInputBytes:number;maxHtmlNodes:number;maxHtmlDepth:number;
 maxJsonLdBlocks:number;maxJsonBytes:number;maxJsonDepth:number;maxJsonTokens:number;
}>;
type AppDecoderIsolationPolicy = Readonly<{maxOldGenerationSizeMb:number;maxYoungGenerationSizeMb:number;stackSizeMb:number;maxConcurrentDecoders:number;cleanupTimeoutMs:number}>;
type AppDecodeRequest = Readonly<{bytes:Buffer;identity:AppSourceIdentity;observedAt:string;signal:AbortSignal;deadlineMs:number}>;
type OwnedAppDecoder = (input:AppDecodeRequest)=>Promise<AppDecodedOutcome>;
type AppDecoderCustody = Readonly<{
 withAdmission:<T>(signal:AbortSignal,work:()=>Promise<T>)=>Promise<T>;
 fatal:(code:'decoder-unsettled')=>never;
}>;
function createOwnedAppDecoder(adapterKind:'website'|'apple',policy:AppProviderParsingPolicy,isolation:AppDecoderIsolationPolicy,custody:AppDecoderCustody):OwnedAppDecoder;
type AppleLookupIdentityInput = {trackId:string;storefront:string;kind:'software'|'mac-software'};
function websiteProviderIdentity(canonicalUrl:string): ApprovedAppWorkerSource['identity'];
function appleProviderIdentity(input:AppleLookupIdentityInput): ApprovedAppWorkerSource['identity'];
function appleLookupUrl(input:AppleLookupIdentityInput): string;
function decodeProviderUtf8(bytes:Buffer,maxBytes:number):string;
function parseBoundedProviderJson(text:string,policy:Pick<AppProviderParsingPolicy,'maxJsonBytes'|'maxJsonDepth'|'maxJsonTokens'>):unknown;
function createWebsiteMetadataAdapter(policy:AppProviderParsingPolicy,isolation:AppDecoderIsolationPolicy,custody:AppDecoderCustody):ReviewedAppWorkerAdapter;
function createAppleMetadataAdapter(policy:AppProviderParsingPolicy,isolation:AppDecoderIsolationPolicy,custody:AppDecoderCustody):ReviewedAppWorkerAdapter;
function createAppProviderRegistry(input:unknown,policy:AppProviderParsingPolicy,isolation:AppDecoderIsolationPolicy,custody:AppDecoderCustody):Readonly<{
 workerSources:readonly ApprovedAppWorkerSource[];
 adapters:readonly ReviewedAppWorkerAdapter[];
 ownerSources:readonly AppSourceIdentity[];
 choices:readonly AppSourceChoice[];
}>;
```

Registry consumes the explicit isolation policy when binding production adapters. ReviewedAppWorkerAdapter.decode changes coherently to `(input:AppDecodeRequest)=>Promise<unknown>`; keep pure `decodeWebsiteMetadata(bytes,identity,observedAt,policy):AppDecodedOutcome` and `decodeAppleMetadata(bytes,identity,observedAt,policy):AppDecodedOutcome` exports for fast offline tests. Production registry always binds createOwnedAppDecoder; request-provided executable decoder/path/message types are forbidden. Root reviews this async interface and hard-failure policy before implementation. Adapter version hashes BOTH parser and isolation policies so changed concurrency/cleanup/resource bounds require new fingerprinted approval. Factories' production wrapping is completed in Task 4 after pure decoders in Tasks 2/3. Owned decoder dependencies additionally require a run-shared concurrency admission and root-owned `fatal:(code:'decoder-unsettled')=>never` supervisor callback; factories/registry receive these through a closed internal dependency object, never source/request configuration. No process.exit in library code.

Infer AppSourceIdentity from the existing shared appSourceIdentitySchema; do not duplicate its shape. Registry validates complete existing source objects, checks derived identity and URL exactly, and returns only identity tuples to the owner API. Parsing policy is explicit and frozen. Adapter version includes a SHA256 of canonical policy serialization after semantic version, so changing any parser bound changes the fingerprinted adapterVersion; no mutable registry policy may retain a version. All counts are positive safe integers with native arithmetic bounds, and maxInputBytes/maxJsonBytes must not exceed existing transport's 10485760 structural ceiling. Configured source fetch.maxBytes must not exceed adapter maxInputBytes. No migration change: SQL approval persists the source configuration fingerprint and limits, not a duplicate fetch-policy schema.

### Task 1: Closed transport content profiles

**Files:** transport, source validation and their existing contract tests.
**Consumes:** AppContentProfile above. **Produces:** required AppFetchConfig.contentProfile and AppFetchTarget.contentProfile.

- [ ] Write failing table-driven tests: html-utf8 emits only `Accept: text/html`; json-utf8 and apple-json-utf8 emit only `Accept: application/json`; all retain identity encoding and pinned address/TLS. Arbitrary header/profile keys fail validation before DNS.
- [ ] Test successful 200 requires single valid Content-Type: html-utf8 accepts only `text/html`; json-utf8 accepts only `application/json`; apple-json-utf8 accepts only `application/json` or `text/javascript`. Parameters accept only absent charset or UTF-8 (case-insensitive), reject conflicting/duplicate charset, unsupported charset, malformed MIME and missing type. Inspect content-type from native response; never expose it as a logging payload. Apple profile decodes STRICT JSON ONLY, rejecting JSONP/functions/javascript, and never executes supplied bytes. Profiles remain required canonical fingerprinted configuration, with no arbitrary MIME/header fallback.
- [ ] Run focused tests and retain expected RED output.
- [ ] Implement profile mapping and admission before body consumption, preserving redirect, budget, DNS, TLS and cancellation guards. Add profile to strict validation/fingerprint; update every existing synthetic source/fetch fixture explicitly to json-utf8, never add a compatibility default.
- [ ] Run transport/config contracts and scoped types: PASS; review profile bypasses via injected connector and redirects. Root reviews shared diff before task consumers integrate.

### Task 2: Exact identities and bounded website decoder

**Files:** identity/parsing/website modules and three new contract tests.
**Consumes:** Task 1 profile and AppDecodedOutcome. **Produces:** websiteProviderIdentity, decodeProviderUtf8, parseBoundedProviderJson, createWebsiteMetadataAdapter.

- [ ] Identity RED tests: exact serialized canonical HTTPS URL accepted; credentials/hash/backslashes/control chars/noncanonical URL refused; www/path/query remain distinct; hash is SHA256 exact UTF-8 identity. Use sourceId `website-metadata` and canonicalizationVersion `website-url-v1`.
- [ ] Parsing RED tests: fatal UTF-8, input one byte over policy, excessive JSON depth/tokens, unterminated quoted strings, escaped braces, malformed JSON, HTML depth/node cap and JSON-LD block cap. Use explicit small synthetic policies to test boundaries cheaply.
- [ ] Website RED fixtures pin Product name → OG → Twitter → title and analogous description precedence; decode entities to plain text, collapse whitespace deterministically. Multiple Product candidates refused; no matching Product falls through. Invalid selected metadata refuses; valid absent/blank title+description returns unavailable. Price/platform/logo/developer ignored; no embedded URL or script execution.
- [ ] Implement pure parse5 decoding with iterative counted nodes/depth traversal, explicit byte/block admission and bounded JSON validation. These are semantic/resource filters, not proof that parse5 parsing or preallocation is linear/bounded by postparse counts. Production parsing MUST use Task 4 owned isolation; no formal HTML preparser or recursive untrusted traversal. Parser never executes HTML/scripts, follows links, reads files or fetches assets.
- [ ] Resolver decodes exact identity and returns its canonical URL, refuses mismatched sourceId/version/hash. Adapter version binds frozen parser policy. Return fields only after existing snapshot-field validation (including DB-compatible text limits); do not truncate invalid values.
- [ ] Run focused new tests and scoped types: PASS. Independent review checks chosen finite caps and semantic precedence against legacy/card, not just test mirroring.

### Task 3: Exact Apple lookup decoder

**Files:** identity helper Apple exports, Apple adapter and new Apple test.
**Consumes:** Task 2 strict UTF-8/bounded JSON. **Produces:** appleProviderIdentity, appleLookupUrl, createAppleMetadataAdapter.

- [ ] RED tests use decimal trackId `123` and lowercase two-letter storefront `us` as SYNTHETIC input only. Reject zero/leading zeros/unsafe integer/nondecimal IDs, invalid storefront/kind, unexpected input keys. Canonical identity is compact JSON with exact property order trackId,storefront,kind; SHA256 binds its UTF-8 bytes; sourceId `apple-app-store`, canonicalizationVersion `apple-lookup-v1`.
- [ ] URL fixtures pin expected result kind software to `https://itunes.apple.com/lookup?id=123&country=us&entity=software`, and expected kind mac-software to `https://itunes.apple.com/lookup?id=123&country=us&entity=desktopSoftware`. Expected kind remains identity data; it is NOT inserted directly into query entity. Root verified primary lookup-by-ID documentation on 2026-10-13: [Apple Lookup Examples](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/LookupExamples.html) and [Apple Search API](https://performance-partners.apple.com/search-api) specify software/iPadSoftware/desktopSoftware entities, ISO2 country and JSON UTF-8. They recommend lookup/caching and describe an approximate 20 calls/minute limit subject to change; operator must approve a concrete bounded request budget, never derive an operating default from that note. Exact response MIME and specific resolver query acceptance still need bounded technical evidence before actual provider qualification. No lookup body request has been performed.
- [ ] RED tests strict envelope resultCount/results agreement; zero results unavailable; >1/mismatched trackId/kind malformed/refused; single exact software identity accepted. Tests include absent vs supplied null/illtyped/oversized title/description, negative/nonfinite/string/null price, illtyped supportedDevices and unknown devices.
- [ ] Implement strict fields: trackName→title, description; finite numeric zero→Free, positive→Paid. Absent optional fields omitted; supplied malformed values refuse entire response. Known iPhone/iPad/Mac device evidence maps iOS/iPadOS/macOS with deterministic dedup/order; mac-software supplies macOS; unknown strings alone omit platforms, never guess iOS or emit destructive empty list. Valid all-metadata absence returns unavailable; assets/remote URLs never enter fields or provenance.
- [ ] Run Apple/identity/parsing tests and types: PASS. Independent review covers envelope ambiguity and supplied-invalid semantics; no Apple lookup/search/network used.

### Task 4: Owned cancellable decoder and safe durable outcomes

**Files:** worker, two new decoder service files, owned-decoder tests and existing worker contract tests; update explicit decode fixtures in existing portable/guarded harness sources only after root allocation.
**Consumes:** AppDecodedOutcome/AppDecodeRequest and explicit isolation policy. **Produces:** async ReviewedAppWorkerAdapter.decode plus createOwnedAppDecoder.

- [ ] RED runner tests: fields succeeds with immutable configured provenance; unavailable calls finishOutcome(code unavailable), creates no snapshot/entitlement and increments correct receipt counts. Empty fields, extra keys, errors, malformed unavailable objects remain invalid/exhausted.
- [ ] RED tests actual thread handles malicious byte-small many malformed formatting tokens and excessive/deep JSON while parent event loop remains responsive; abort and deadline terminate the exact owned thread and await its exit before returning. Repeat cancellation shows no leaked active threads/listeners/unhandled rejections. Wrong control ID/extra result keys/oversized result, thread error and exit-without-result refuse with sanitized code only. Pure parser fixtures remain fast tests, not production isolation proof.
- [ ] RED runner tests decoder returns after trusted clock reaches the frozen whole-run deadline while timer callback has not fired: no completion. Abort, lease loss and approval revocation likewise prevent publication; raw private body/URL/parser stack never surfaces.
- [ ] Implement one exact owned thread per decode, capped by min(explicit maxConcurrentDecoders, existing approved jobConcurrency); reject before spawn when bytes exceed configured bound. Thread dispatcher accepts only a strict versioned request with unpredictable control ID, exact source identity, observedAt, bytes and frozen parser policy, and dispatches only compiled website/Apple pure modules. Fixed thread entrypoint; no supplied import/path/function, filesystem/network/assets or executable HTML. Parent validates strict control ID/schema/result size and copies bounded fields.
- [ ] Parent owns deadline timer and abort listener, calls terminate on timeout/abort/error, and awaits the same worker exit/termination settlement; no detached Promise.race. Configure explicit Node resourceLimits for heap/stack, `env:{}` with NO inherited environment/secrets, and closed known execArgv (only exact trusted runtime loader if required). Entry is a fixed trusted compiled module, never eval/data URI/user paths/imports. Account for bounded structured-clone input/result allocations; exact task ID/outcome/known keys/bounded serialized result admit once only, malformed/duplicate messages refuse, messages after abort never publish. Unknown exceptions and OOM/exit errors remain sanitized.
- [ ] Enforce ONE shared per-run decoder admission limit no greater than approved jobConcurrency and explicit maxConcurrentDecoders, not an independent cap per adapter. If termination fails to settle within cleanupTimeoutMs, mark run FAILED and invoke root-owned fatal supervisor callback/shutdown custody, never return ordinary settled completion or process.exit inside the library. A cleanup timeout alone is not proof the thread stopped. Success also awaits worker exit before returning. Root supplies/reviews fatal boundary before production wiring.
- [ ] Implement strict discriminated outcome parsing and branch; await adapter.decode with owned signal/deadline. Immediately after decode and before commit, require trusted now() < frozen start+budgets.runtime AND no abort/lease loss. Preserve existing final token/owner/approval DB fences and settlement, no new database authority.
- [ ] Run focused worker/repository/contracts and scoped types: PASS. Independent reviewer checks unavailable cannot mask malformed payload or bypass field allowlist.

### Task 5: Curated registry and owner binding integration

**Files:** provider registry and test; root-owned canonicalApp/config caller bridge and existing API tests.
**Consumes:** Tasks 1–4. **Produces:** createAppProviderRegistry exact result above; canonical construction accepts an explicit reviewed source registry through existing server composition config, never request data.

- [ ] RED registry tests: null/undefined produces four frozen empty arrays with zero decoder/DNS/repository calls; malformed configured objects fail before I/O. Configuration is a strict wrapper `{sources,choiceLabels}`; labels keyed by ALL FOUR exact identity members cover every source exactly once, no missing/extra/duplicate tuple. Plain display labels 1..120 codepoints, no controls/markup; provider URL remains exact canonical HTTPS. Exact website and Apple tuples coexist as choices; identity/URL/profile/version/policy mismatch, duplicate tuple, unknown adapter, unapproved fields and byte-policy mismatch refuse.
- [ ] Implement strict composition using validateAppWorkerSources, derive expected tuple/resolver/profile from each reviewed adapter. Do not seed synthetic or historic examples as real approved sources. OwnerSources contain no limits, secret values or fetch customization; derive them from the same approved tuple.
- [ ] Define strict shared appSourceChoiceSchema/AppSourceChoice DTO `{identity:appSourceIdentitySchema,label:plain1..120,sourceUrl:canonicalHTTPS}` and source-list envelope `{sources:AppSourceChoice[]}`. Label is presentation only, outside unchanged WorkerSource fingerprint; source URL derives from approved canonical URL. Real configured labels come from retained Strapi source evidence with operator review; no synthetic production seed or app-name/hostname autoassociation.
- [ ] Root writes RED API tests for authenticated GET `/recommendations/:id/app-enrichment/sources`: same AppEnrichmentService.owned authority as readBinding must establish active current manual app recommendation/account before returning curated choices. Other owner/deleted/archived/nonmanual refuse; unconfigured returns empty list; every non-GET method returns405 via existing ALL gate. Add `readSources(actor:Actor,id:string):Promise<{sources:readonly AppSourceChoice[]}>`, passing trusted configured choices through service construction. Listing cannot bypass recommendation authority just because it is static data.
- [ ] Root wires canonical config/mount/callback inventories, replaces fixed empty ownerSources only with the same registry, and demonstrates configure accepts curated tuple while unlisted tuple refuses. Preserve single-source rebind and explicit opt-in, no user URLs/fetch customization.
- [ ] Run registry/API/contracts and scoped types: PASS. Fresh reviewer checks registry/DB approval parity and no source selection by app name/hostname substring.

### Task 6: Explicit owner source choice and enable/rebind/re-enable UI

**Files:** frontend client/hook/panel and their existing tests listed above; frontend worker does not edit root-owned API/shared wiring.
**Consumes:** AppSourceChoice DTO and authorized `{sources}` endpoint. **Produces:** client source reads and frozen PUT configure/rebind intents integrated into existing hook replay lock.

- [ ] Write RED client tests for `prepareConfigure(observed:RecommendationObservation,binding:AppBinding|null,choice:AppSourceChoice):AppEnrichmentIntent` and `prepareRebind(observed:RecommendationObservation,binding:AppBinding,choice:AppSourceChoice):AppEnrichmentIntent`. Configure captures expected binding revision null/actual as existing shared command requires; rebind requires current binding. Both capture entity/recommendation revisions, exact source tuple and explicit optIn true. Extend intent operation union with configureAppEnrichment/rebindAppEnrichment; execute uses PUT on existing binding route, keeps DELETE disable and POST accept.
- [ ] Test read() includes owner-scoped choices; source choice DTO strict validation. Prepared intents remain private WeakMap-authorized frozen body/key/owner/session generation/route/entity/recommendation/binding observations; no arbitrary handcrafted intent. Response loss retries EXACT same body/key, session/route/entity changes abort, stale recommendation/binding revisions conflict. Null initial binding uses explicit null observation, never fabricated binding.
- [ ] Extend existing hook while preserving hooks-before-early-return order and unresolved-command history across refreshed observations. Configure/rebind successful response refreshes binding/suggestions; acceptance callback remains acceptance-only. Conflicted or uncertain commands lock new source commands until existing recovery resolves; no mutation or body regeneration during retry.
- [ ] Write RED panel tests: empty choices retains current no-approved-source message; nonempty curated choices render plain human label dropdown plus approved source URL. No JSON controls, raw hashes or machine-ID display. Unbound owner explicitly selects and presses "Enable nightly refresh"; bound owner can "Change source" (rebind) or "Re-enable nightly refresh" (configure same tuple optIn true) after disable. Do not preselect/associate a provider from app name, arbitrary URL or duplicate source records.
- [ ] Tests cover opt-out and re-enable, rebind invalidates old suggestions/generation, dirty manual-edit guards disable source/accept actions, loading/busy/uncertain replay guards, stale snapshot acceptance and session change. No command autoaccepts suggestions or changes manual values. Existing refresh/reload UX stays scoped to current owner.
- [ ] Implement minimal DTO-driven UI and client methods using current owner observation guards. Run targeted frontend client/panel suites plus scoped frontend types: PASS; independent review tests manual entry/editor state and command replay, not just rendered dropdown.

### Task 7: Local actual flow, scheduler lifecycle evidence and handoff

- [ ] Root reviews all six implementation tasks together, runs existing relevant portable contracts and frontend tests once, and updates exact source/identity manifests for changed guarded qualifications. Protected qualification requires a fresh reviewed source freeze; old 29/29 and Places receipts stay historical.
- [ ] Root commits only after relevant checks/review. Adapter implementations require no new PG scenarios unless durable SQL/fences change; rerun affected protected acceptance lanes through existing guarded allocation, never direct test-file invocation against shared PostgreSQL.
- [ ] Record offline adapters separately from actual LOCAL flow acceptance. Wave2 local completion requires retained actual bounded website and Apple metadata responses through secure transport/owned decoders, current owner curated choice/opt-in, generated suggestion/provenance, explicit owner acceptance into the manual recommendation, and owner opt-out/rebind stale-suggestion guards. No "Wave2 complete" from offline adapter tests alone.
- [ ] Root qualifies the local scheduled-job lifecycle using existing configured worker and retention authorities: start a bounded local scheduled invocation, observe exact DB-clock run identity/deduplication, durable queue/lease/heartbeat/completion and receipt, interruption/restart recovery, opt-out invalidation and a second invocation proving no duplicate same-day job; stop scheduler and await owned work/resource cleanup. Reuse existing reviewed deterministic clock/test seams where day transition is required; no live invented midnight waits or silent accelerated operational schedule. Local scheduler configuration is explicit, no defaults and no hosted dependency. Evidence records schedule/process ownership, start/stop/recovery and actual source/owner outcome rather than just a successful fetch.
- [ ] Preserve actual local source/account/resource custody through root's guarded disposable fixture; source choice inputs already retained from user-authorized Strapi read. Do not request server/hosting choices, mutate Strapi, or interpret local qualification as permission to deploy. Root owns bounded local resource/provider admission after code/security review, no authorization reask for routine task decisions.
- [ ] Use root-retained user-authorized Strapi identity evidence `TEMP/wave2-strapi-app-source-identities-20261013.json` (17 RecommendedApp rows, id/url/title only). Actual Figma Apple legacy id5 has `https://apps.apple.com/us/app/figma/id1152747299?uo=4`, Apple ID1152747299/storefront us; actual website id21 is `https://figma.com`, ids18/16 use `https://www.figma.com`. Other website sources include Cursor/Canva/GoogleMaps/Notion; nine Apple records exist. These are actual retained source identities, not synthetic test examples. Do not ask the user to repeat provider/URL choices; preserve distinct source URLs and explicitly review canonical serialization, never infer duplicate association or merge. Root supplies reviewed explicit local parser/worker/maintenance/source policies, owned local recommendation/account fixture and local schedule/DB capability custody for bounded real provider qualification. Hosted provisioning, hosted nightly deployment and Strapi removal remain a separate later cutover; no server questions or deployment action gate this local task.

## Verification Commands and Execution Allocation

Concrete read-only HEADER evidence, supplied by root: `TEMP/wave2-apps-provider-header-preflight-20261013.json`, 2026-10-13. Authorized HEAD at exact Apple ID1152747299/us/software returned200 `text/javascript; charset=utf-8`; HEAD `https://www.figma.com/` (retained legacy18/16 URL canonical serialization adds slash) returned200 `text/html; charset=utf-8`. HEAD `https://figma.com/` returned301 with empty content type and was NOT followed. All probes used HTTPS/TLS, timeout10s, maxredirect0 and no provider body read. Use exact www recorded source for candidate website qualification; never infer a redirect/domain approval, associate duplicates automatically, or claim source permission/body/host qualification from headers. Actual full provider responses still require root-approved bounded execution after implementation/security review.

Run from `tunes` after root releases source freeze, using the pinned Node executable `C:/Users/TK/AppData/Local/Temp/explorers-wave1-tools/node-v24.21.0-win-x64/node.exe` with `node_modules/vitest/vitest.mjs run --config vitest.config.ts <explicit contract paths>`. Never use an integration-global-setup PG config for offline contracts. Scoped type check uses `node_modules/typescript/bin/tsc --noEmit -p ../.superpowers/sdd/2026-10-09-replatform-waves/codex-apps-a2-durable-types.json`, extended by root to include new modules/tests after freeze release. Each RED/GREEN step selects only its listed contracts; broader runs occur only at Task 6.

Root serializes Task 1 and Task 4 shared interfaces. Task 2 owns website and shared parsing/identity; Task 3 may proceed after identity/parsing exports freeze, owns Apple-only files plus preallocated Apple exports. Root owns Task 5 DTO/API/canonical caller wiring; a separate frontend allocation owns Task 6 after DTO/interface freeze. A fresh spec/implementation reviewer checks each task before the next integrates. Execution method is already authorized; do not ask for it again.

Self-review: all five Review Focus items have task-specific tests; exact output/property names match between tasks; single-source binding is preserved; provider/host completion is explicitly deferred to actual operator-qualified execution, not omitted from Wave2 acceptance.
