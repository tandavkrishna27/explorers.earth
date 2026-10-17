# Final operations grooming review

**Scope:** Individual tickets, epic contracts, master plan, tracked workflow/test source and read-only GitHub metadata. No source changes, server connections, deployment, secret-value reads or configuration mutations were performed. Review date: 2026-09-30.

**Verdict:** Local foundation work is sufficiently defined to start after plan approval, but “all external dependencies cleared” would be inaccurate. Several dependencies are now verified to be absent from repository configuration, while host/provider facts remain unverified. These can be closed in a short preflight before their owning implementation tickets; they do not require reopening the product scope.

## Newly verified GitHub facts

Read using existing authenticated `gh` access. Only settings and secret **names**, never values, were requested.

| Metadata | Observed result | What it does and does not establish |
|---|---|---|
| Repository rulesets | Empty list | No repository ruleset was returned by this endpoint. Do not invent required checks from workflow job names. |
| Main branch protection | `required_status_checks: null`, `required_pull_request_reviews: null`, `enforce_admins.enabled: false` | Current classic protection does not require CI checks or PR review. This is a concrete gap, not merely an unknown. |
| Environments | `music-reconciliation-production-report`, `tunes-production` only | No dedicated QA environment currently exists. |
| `tunes-production` protection | Required reviewer, prevent self-review, protected-branch policy | Production approval gates exist; user wishes to avoid per-ticket reviews do not remove GitHub's actual environment gate. |
| Repository/environment variable names | Empty at repository and `tunes-production` scopes | `GATE_PROD` not listed at either checked scope. Organization-inherited settings were not queried; cannot conclude every possible effective scope is closed. |
| Explorers repository secret names | Both deployment host/key families, database/session, AWS, Resend and catalog/provider names exist | Confirms name presence only—not validity, scope, SSH connectivity, host capacity or provider permissions. |
| Production environment secret names | Deploy known-host/fingerprint and state-HMAC names exist | Useful existing trust inputs; not proof the current QA destination matches them. |
| Google auth names | No explicit Google OAuth client/secret or Better Auth secret names in either inspected repository secret list | They may exist in Strapi database, host configuration or another secret authority. Must locate or configure securely; maps/books API keys are not OAuth credentials. |
| Strapi repository secret names | AWS bucket/region/access names and Resend exist | Source of prior storage configuration is identifiable; new environment separation and permissions are not verified. |

Metadata requests: `gh api repos/MeteoriteLabs/explorers.earth/rulesets`; branch `main/protection`; `environments`; `gh secret list` for Explorers, its production environment, and Strapi; `gh variable list` for Explorers and production environment. Output was reduced to settings/names. No token was printed.

## Findings and closure criteria

### P1 — Required CI gate is not configured (1.3, 8.4)

**Evidence:** Actual main branch protection reports no required status checks. The ticket currently says preserve/reconcile required names, which leaves an implementer assuming protections already enforce them.

**Fix:** Add a concrete 1.3 step to establish required merge checks after observing one real PR run. Keep stable job names, add a final aggregate check that requires intended jobs to succeed and rejects unexpected skips, and configure the main branch rule against that exact check. Record administrator bypass policy explicitly. Test source-level deployment conditions independently; a required CI check cannot itself stop an unrelated automatic deploy workflow.

**Provider:** Agent performs read-only identification and prepares exact settings; repository administrator applies/authorizes repository-setting changes through normal GitHub controls. Existing authenticated CLI access does not establish permission to mutate protections. **Closes when:** a failing/missing required check demonstrably prevents normal merge and the protection snapshot is recorded. No secret input required.

### P1 — QA authority and artifact publication path remain underspecified (1.3, 3.5)

**Evidence:** No QA GitHub environment exists. Current immutable image workflow publishes on non-PR events, but automatic pushes target main; a draft PR build does not publish an image. New QA workflow says it accepts a verified release manifest without naming its producer/trigger.

**Fix:** Pin one path: manual release-candidate workflow on the integration branch builds/scans/publishes API and web once, writes a manifest artifact with run ID/source/digests, and passes it to QA deployment. Separate build/publish permissions from SSH deployment authority. QA environment should restrict the integration branch and use QA-scoped secrets, with no per-ticket review requirement unless desired. Production workflow independently validates recorded QA evidence before promotion.

**Provider:** Agent authors workflow/manifest contract; repository administrator supplies permission to create QA environment and bind existing deployment credentials to it. **Closes when:** QA workflow can identify the producer run and reject a caller-edited manifest or arbitrary digest. This must be pinned before 3.5, not improvised on deployment day.

### P1 — Existing secret names do not settle Google login setup (2.1, 2.4, 3.5)

**Evidence:** No explicit OAuth client credentials in the checked secret-name inventories. Source currently uses Strapi's Google exchange; moving auth changes the callback destination.

**Fix:** Create a configuration manifest listing local origin/port, QA origin, production origin and exact Better Auth callback URLs after package compatibility qualification. Record OAuth application owner, authorized origins/redirects, consent-screen audience/test-user state and secure credential source. Configure separate QA/prod client or explicit allowed redirect isolation. Generate the new auth/session secret through secure tooling; do not reuse a browser-public token.

**Provider:** Agent reads existing provider/host configuration only through authorized mechanisms. Google Cloud project administrator provides access or enters redirects/secrets if unavailable. User need not paste credentials. **Closes when:** real local and QA Google callbacks succeed and invalid-origin/state tests reject; provider fixture success alone cannot close this dependency.

### P1 — QA/prod domain and infrastructure manifest not pinned (3.5, 8.4)

**Evidence:** Deploy secret names exist, but no host preflight has run. Same-host topology is agreed; QA hostname, architecture, data paths and resource capacity remain unspecified.

**Fix:** Add a nonsecret environment manifest with host aliases, SSH user/port, pinned host trust source, CPU architecture, Docker/Compose versions, disk capacity, domain, DNS authority, TLS renewal path, API/web/internal ports and data-volume names. Do not commit private key material. Identify whether the current production frontend host can run the database/API stack or requires capacity adjustment. Preserve distinct environment labels and reject pointing QA at production host/data resources.

**Provider:** Agent performs read-only preflight using existing approved access. Infrastructure/DNS administrator provides missing access or the QA hostname decision if no configured choice exists. **Closes when:** hostname resolves, TLS and same-origin routing configuration are known, host capability is measured and production/QA identities cannot collide. No need to preserve old Tunes uptime.

### P1 — Storage privacy and environment separation need an explicit contract (2.3, 3.2, 3.5)

**Evidence:** AWS/Strapi bucket secret names exist; separate QA storage and upload-object ACL policy have not been established. Profile media, private recommendation media and claim evidence are not interchangeable public objects.

**Fix:** Record region/endpoint, QA/prod bucket or enforced prefix boundaries, IAM policy, delivery origin, private evidence access mechanism, object-key ownership, size/type policy, lifecycle cleanup and CORS. Local storage adapter must preserve authorization semantics, not merely write files. Public URL output must not make private evidence globally readable. Confirm media bytes and MIME checks, including deletion permissions and inaccessible objects after required lifecycle changes.

**Provider:** Agent prepares least-privilege policy/configuration; AWS administrator provides bindings through the existing secret system. **Closes when:** QA upload/read/delete and cross-account/private evidence denial work with real storage. Existing AWS key-name presence is insufficient.

### P2 — Real-provider readiness is deferred too far (3.2, 4.1–4.2, 5.2, 6.2, 7.3)

**Fix:** Before each provider ticket starts, record provider endpoint, server/browser usage, credential-name source, allowed origin/IP restrictions, quota and one nonproduction smoke result. Inventory confirms TMDB/Books/Maps/IGDB/YouTube and Resend names; it does not validate them. IGDB browser-secret wiring is present in current frontend deploy source; replacement uses server-only credentials. Check whether deployed credentials require rotation with the provider owner rather than merely renaming variables.

**Provider:** Agent conducts permitted smoke and maps configuration; provider project administrator fixes permissions/quota if necessary. **Closes when:** actual provider calls needed by the retained flow work. Fixture tests remain useful but cannot substitute. Retired Spotify/Gemini/payment services are excluded even if secret names remain.

### P2 — Reference data is still an external acceptance input (1.1–1.2, 7.2)

**Evidence:** Schemas contain structure, not category labels, FAQ/terms text or reasons-for-leaving rows. “Reviewed seed values” does not specify their source.

**Fix:** Choose a selective read-only export of active reference content, preserving locale/order/default values, or a reviewed explicit seed file. Reuse current approved legal/help text; never invent it. Maintain fixture-only illustrative data separately from launch reference content.

**Provider:** Agent extracts accessible current content; product owner supplies only missing canonical values/approval if no authoritative content exists. **Closes when:** seed dataset is checked in, attributed, deterministic and accepted by retained forms. This does not require user/content migration.

### P2 — Recovery/performance acceptance lacks pinned policy inputs (8.5)

**Fix:** Specify backup destination authority, encryption/key custody, schedule, retention, deletion relationship, media versioning and restore command interface before recovery implementation. Define measured QA workload and initial budget before comparing performance; avoid declaring readiness from a report with no pass threshold. Product-independent starting budgets can be proposed from existing baseline/hardware, then recorded as engineering decisions. User decisions are needed only if cost/recovery expectations materially affect the design.

**Provider:** Agent proposes settings and measures host/workload; infrastructure owner supplies backup storage permission. **Closes when:** restore to disposable target succeeds and measured workload meets the documented budget. Do not claim an RPO/RTO SLA from one unrepresentative drill.

## Script-interface grooming assessment

Local wrapper verbs, authority rejection, real-API fixture contracts and release manifest fields are adequate architectural interfaces. They are not finished CLI specifications. Pin these implementation details before their owning tickets execute:

| Ticket | Missing exact contract | Recommended resolution |
|---|---|---|
| 1.2 | Local manifest location/format, default ports/project identity, process ownership and exit behavior | Save nonsecret manifest under ignored `.replatform/local/<checkout-id>/manifest.json`; record DB authority/process IDs/ports; stop/reset verify ownership; fail nonzero on partial startup; do not rely on inherited prod variables. Agent can choose exact ports after local collision check. |
| 1.2 | `platform:test:integration` selection forwarding | Define pass-through test paths and supported lane flags, route through attested authority, reject unknown flags; emit executed/skipped counts and fail unexpected skips. |
| 1.2 | `platform:seed` dataset ownership | Define manifest return schema and location consumed by Playwright, version/seed hash, and idempotent rerun behavior; seed ownership evolves through Epics 2–3. |
| 3.5 | Build/manifest producer and verifiable evidence identity | Resolve P1 QA artifact path above; manifest must reference producer run and actual source, not just user-supplied `testEvidenceRef`. |
| 3.5 / 8.1 | Browser filenames mismatch | Ticket3.5 creates `e2e/replatform-deployment.spec.ts`, while shared harness expects `e2e/replatform/deployment.spec.ts`. Ticket8.1 similarly uses `replatform-no-strapi.spec.ts` outside configured testDir. Move both planned files to the harness paths or they will not execute. |
| 3.5 | Bare Playwright invocation bypasses wrapper | Use `npm run platform:test:e2e -- --suite platform --project desktop-chromium --environment qa` plus auth/profile/books suites with named QA authority, not unqualified full config run. The first milestone suite must not require unimplemented later categories. |
| 8.5 | Backup/restore CLIs lack exact invocation | Define `platform:backup --environment qa --output-manifest <file>` and `platform:restore-drill --manifest <file> --target <disposable-authority>` with wrong-target rejection and no overwrite. Proposed commands must be created by8.5 before use. |

These are agent-resolvable grooming choices, not requests for user permission or reasons to defer the whole effort. Resolve them once in parent epic contracts and regenerate individual tickets to avoid drift.

## Completion boundary

No ordinary user needs to provide secrets in chat. Existing authenticated GitHub access was sufficient to reduce several uncertainties. The next closure work is a configuration/preflight record, provider capability qualification and exact harness/release contracts. Main protection, QA environment and cloud-console changes are consequential configuration actions to carry out only within their authorized implementation scope; this review did not make them.

A truthful readiness statement is: **the product scope is settled; the backlog is implementable after the listed foundation/configuration gates, and later tickets have named prerequisites.** “There are no dependencies” is neither attainable nor necessary; the goal is no hidden prerequisite or false verification claim.
