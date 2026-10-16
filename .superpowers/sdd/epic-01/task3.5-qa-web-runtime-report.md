# Task3.5 Package A: canonical web runtime

2026-10-03. Isolated codex/unified-replatform worktree. Local implementation/qualification only, independent review and push pending. Ticket3.5 and Milestone1 remain incomplete.

## Frozen interface and ownership

Browser wire `/runtime-config.json`: exact version1, environment qa|production, canonical HTTPS origin, apiPath=/api, socketPath=/socket.io, optional resolved restricted mapsBrowserKey and optional analytics {enabled,identifier}. Identifier currently supports Google Analytics measurement IDs only; no implicit Clarity destination. QA external vendor analytics cannot be enabled. Canonical consented database event recording remains enabled independently; vendor configuration is not the analytics3.4 collection switch. Reference names, auth/Google/AWS credentials, general environment maps and arbitrary endpoints are rejected.

Init inputs: public-only `/run/platform/public-config.json` and immutable web index. Outputs in a **fresh per-release** `/runtime-web` directory: runtime-config.json, index.html, robots.txt, sitemap.xml, headers.conf. No overwrite is permitted; any generation failure prevents init success. Mount outputs read-only into nginx. Verified web image contains reviewed renderer/parser under `/opt/platform-runtime/scripts/render-platform-runtime.mjs` and `/opt/platform-runtime/src/lib/publicRuntimeContract.ts`, outside served directories. Package B can extract them from the verified image for an existing pinned Node24 init; no third published release image is required. Local platform-runtime-renderer target is a helper, not release authority.

Only32 frontend files changed. Backend, root scripts/packages/workflows/compose/cloud unchanged. Existing dirty public/robots.txt and public/sitemap.xml excluded from the package and clean qualification. Original untargeted Docker behavior remains legacy-default; canonical builds explicitly select platform-runner and supply same-source named build context platform-shared=./tunes/shared.

## Behavior

Canonical bootstrap fetches bounded no-store JSON with timeout, rejects malformed/unknown/secret fields/origin mismatch before dynamically importing main/App/client modules. Oversized UTF8 streams cancel early. Failure renders neutral text using textContent and no credential values. Same-origin auth/profile/Books clients retain existing API behavior; public profile and shared Music transport defaults now read canonical runtime origin/socket path. Music identity/socket capability parity is not implemented here. Explicit legacy builds and injected clients retain their old configuration/test contracts.

Delivered Google Maps provider, InteractiveMap, Profile AddressInput/FeedFields/geocoding/reverse-geocoding consume the restricted public key. Auth and canonical lifecycle/profile/media/Books mutations already use relative canonical endpoints and remain unchanged. Books sharing/getCurrentDomain/SEO use runtime origin. QA SEO cannot override noindex/nofollow with component props. External GA bootstrapping requires explicit runtime enablement and current user consent; QA and absent config never start GA/Clarity.

Platform Vite build loads no environment files and exposes **zero** ambient prefixes (envPrefix=[]), eliminating the nominally-unused-prefix loophole reproduced below. Docker context excludes .env files, credential key formats, dependencies and browser artifacts. Platform build does not run production static SEO generation or fetch production data; nginx aliases runtime metadata, headers include no-store config/index/metadata, hashed assets stay immutable. QA sends X-Robots-Tag on all response locations, robots Disallow:/ and empty sitemap. Production static sitemap contains only approved public static pages; dynamic profile indexing remains pending. Canonical static service returns503 for direct API/GraphQL/socket access; Package B routes real API via edge proxy. No legacy Strapi proxy fallback. CSP blocks external API/script authority unless explicitly enabled public Maps/GA endpoints; existing public font/image assets remain allowed.

## Meaningful failures and fixes

- Runtime stubs:14 tests,2 behavioral failures before implementation. Renderer stubs:3 failures. Bootstrap cancellation regression failed because initial text() consumed the whole stream; bounded reader now cancels before remaining chunks. Ambient Vite prefix regression reproduced an exposed synthetic process secret; envPrefix=[] closes it. The test's initial non-file import.meta URL setup error is not counted as behavioral red.
- First Docker build failed: existing frontend imports tunes/shared contracts but frontend-only context lacked them. Explicit same-source named context fixes the actual topology, without copying backend credentials/dependencies or weakening types.
- First clean full frontend run installed only frontend dependencies:4090 passed2 category-discovery failures, missing declared tunes Zod package. Added normal locked tunes install including auth-runtime postinstall, then reran once in complete declared dependency context. No assertion/source repair was needed. Failed log is retained; not labelled a full clean pass.
- Early local image smoke incorrectly aborted Google Fonts stylesheet requests, causing Vite dynamic CSS preload rejection; subsequent diagnostics identified login's existing public zupimages image requests. Final smoke allows and records existing fonts/images, rejects external API/scripts, and qualifies static bootstrap/metadata only. No fixture fulfilled analytics/auth APIs and no retries manufacture acceptance. Failure logs are retained.

## Final observed qualification

Clean source archive: `C:/Users/TK/.codex/tmp/qa-runtime-clean-y39eg5ux`, baseline ac3efc97294b483658c009ac33bf4411c4d36037 plus32 exact owned overlays. `owned-source.json` records each SHA256; live/clean32 hashes match. Synthetic ignored .env.platform-sentinel holds private-key/endpoint sentinels to verify exclusion; no real secret values were read. Portable Node24.21.0/npm11.19.0; normal locked frontend and tunes installs succeeded, including auth postinstall.

- Clean contained frontend suite: **295 files4093 tests PASS**, zero failed/skipped,27–31second range; final command node scripts/run-contained-vitest.cjs run, log full-unit-final.log.
- Clean strict frontend `tsc -b`: PASS.
- Normal runtime inventory producer run, then clean selected contract: **1 file4 tests PASS**, generated matrix unchanged. Workspace exploratory run collected2 files7 tests; final claim uses clean exact selection only. No hand-written inventory/gate change.
- Clean canonical Docker build: PASS landing checks, strict types, Vite mode platform and existing production Music-bundle guard. Locked frontend install emitted17 advisory vulnerabilities (3low8moderate6high); no dependency/security bypass or audit fix. Candidate image scan remains required and has not been claimed here.
- Final same immutable image local ID/index `sha256:321fdbc9ba1b1e17cdaf59a224e8a6421492b7ab95df6de2fd00e98f3a4d248f`, platform manifest `sha256:d9397e29a8de92a6b8f7153711662419ca79e71f700a0adb4c7ff2e38eb91848`: local HTTPS QA and production static runtime checks PASS. Self-signed disposable localhost TLS was used with explicit test-only certificate acceptance, not real DNS/TLS approval. Bootstrap renders login, same-origin configuration validates before clients, QA response/meta/robots/sitemap controls pass, production canonical/sitemap use its separate origin, direct legacy API/GraphQL return503. No hosted source/candidate trust claimed.
- Final image receipt `C:/Users/TK/AppData/Local/Temp/platform-web-smoke-3mu56f/receipt.json` records both origins, image ID, all129 served-file hashes and public asset origins (fonts.googleapis.com/fonts.gstatic.com/zupimages.net). Assets unchanged across configurations; external API/script requests0. Earlier final-source smoke `platform-web-smoke-coxEXn` scanned129 served files: secret/endpoint sentinel matches0; final-source files are checked again below.
- All owned nginx/extraction containers removed and inspected absent, browser contexts/browser/ephemeral HTTPS servers closed; no authentication traces/screenshots or real session artifacts produced. Local images and exact clean source/receipts retained for reviewer. No unrelated resource/volume deletion.

## Remaining gates

Independent source/evidence review before push. Compose/proxy/migration readiness image rehearsal, trusted candidate/attestation/required-check authority, actual QAhostname/DNS/TLS/server access and real Google/S3 acceptance still pending. This package does not satisfy API parity, real provider sign-in, deployed cookie/CSRF tests, all categories, Music handshake or milestone completion. Production remains a separate release decision.

Final129-file sentinel scan:0matches.

## Owned source fingerprints

`1db76160d171f9de94f7aecd876a0964d5a3d51abbe9d3e4e425765f7f67f3d7` explorers-earth/.dockerignore

`6e5232c3750048fbcb2644d40add7fcd95c5612f546cd672d2b8c7eb5be7f937` explorers-earth/Dockerfile

`7340fa0e1aa5b28b6561de666ad9c845f616bc7c6d2e7f9f403044b0591b3a99` explorers-earth/index.html

`15d49de4fcf7b1f32090919e9f3f8b5deb8b51d9036a293f63259c847bc194f9` explorers-earth/nginx.platform.conf

`4d44ac36a6ea4d97c2b131821af2c0d3c27858f49bf9ab3f50231632e9fd91b8` explorers-earth/scripts/platform-web-image-smoke.mjs

`672f7b71c88136b9471930bfc9d3bdd8ea4d4d3105ffeca2b96aab75fa6ceaf5` explorers-earth/scripts/render-platform-runtime.mjs

`c2f34b1e31d1794693ff519dab2dc89888ddc4bd815d20799c9a3ff7f3790ae4` explorers-earth/src/bootstrap.ts

`deea933273fec51e5276c85d59aca7e91fe397a9ba9eef9c9408b63800daaf50` explorers-earth/src/components/GoogleMapsProvider.tsx

`e770e18bcc53ba0ea5bb92747fbd8a2e295a53ed270a3432b74a469fbc3cfddf` explorers-earth/src/components/InteractiveMap.tsx

`fd2c78f53eb0440aceb0cc0e8bcdaee2221b0dae527ebb0b3dbf99fcb1fb2d46` explorers-earth/src/components/SEO.tsx

`d79cc210f81a958a0000674b19c315e3818d004d1c53d924b4617851b74e5b0e` explorers-earth/src/features/Books/components/dashboard/BookListView.tsx

`d7c93c8fc0014957c9d510e103b3abc6c1123ca8f0e51398dd8252b86161d5b9` explorers-earth/src/features/Profile/components/AddressInput.tsx

`9cea53626c95da3427299d71e7a9a6f4775f0080e2e2d285b410aa6197162dfb` explorers-earth/src/features/Profile/components/FeedFields.tsx

`b99a458d7a844471a80f64106e0a4a5c55c76e81f97272aa4b360d0530381cb8` explorers-earth/src/features/Profile/hooks/useGeocoding.ts

`627fcb4996455922858188cfe8991a2d379e1f89e0dee5040f6b26f6e6c36807` explorers-earth/src/features/Profile/hooks/useReverseGeocoding.ts

`8d9c5b11a839dcc6eec0c5bb7becaf28795cadbac7e050f91923e1b58d13dd49` explorers-earth/src/features/PublicHome/api/publicProfileGatewayClient.ts

`d86b306859812d3b3d3ed94e83947681f1f4fa533503d1fa65eec766bbabc082` explorers-earth/src/features/music/musicApi.ts

`23d9391436fbbbc67e850da87370daea1c50a13a3b32f97a43cb4e1dbe270423` explorers-earth/src/features/music/ownerMusicLiveClient.ts

`4c99a57d0e5a0eefe4c8c25d0d9afd887e0e2a1c925ffcd4da84227485035e46` explorers-earth/src/features/music/publicMusicAnalytics.ts

`9a2ec3985c78d6a8af8964842ec8c0d4902eabee79eebefaa5e65628e74dd444` explorers-earth/src/features/music/publicMusicClient.ts

`b86494f5a51ec8c84e548016dca2789988fc225f800469707d694c6288de54c7` explorers-earth/src/features/music/publicMusicLiveClient.ts

`821ed197cac54baf0ec99119449648024d9936d1a87766efad14ed4befdd35b5` explorers-earth/src/lib/__tests__/canonicalRuntimeConsumers.test.ts

`4e25b41eea54e5bf419c620a331255c5e8cc0672ed565cef8d5847ad5ae40590` explorers-earth/src/lib/__tests__/platformRuntimeRenderer.test.ts

`b9a4a1e93a8b21e4291b4a8bb15aacef3b498883d73ad3b9c8e27d81754cbacf` explorers-earth/src/lib/__tests__/publicRuntimeConfig.test.ts

`a8daf85f1288758b821a40cbcc1966ef125e9f96a628b33e923dc58cd5d5f3e7` explorers-earth/src/lib/publicRuntimeConfig.ts

`bf82f18bad72b8c76366dcf8c66780ec8c1bf90ae0dfedfeba82e64e22dfd69c` explorers-earth/src/lib/publicRuntimeContract.ts

`5c6205235d01b5b2e7f67f70552f8142ae07d78451c6640f879601cb15f841f8` explorers-earth/src/main.tsx

`08059af0b567b09d29c2ab909da85b11dc55d9088e7a72f6f446a501f4c38506` explorers-earth/src/services/explorersAnalyticsClient.ts

`29092b6e0135937f1166438ce00ddce6fdab7328c896f63d64f60edb451d2d30` explorers-earth/src/utils/analytics.ts

`a63fd211812a37173f28e38cd9201ee8c146936630e5a48909317a3b08e10577` explorers-earth/src/utils/getCurrentDomain.ts

`6763eded2d888bf74588142627762966bbd4a944806e20bd51ee7ac88ed0832f` explorers-earth/vite.platform.config.ts

`9b124e426f27747c818cf273f216d55c205e897490122edf523f695efe1a5176` explorers-earth/src/lib/__tests__/platformBuildEnvironment.test.ts
