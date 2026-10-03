# Task 3.5 offline release/readiness package

2026-10-03. Implemented against c8fb27bf09d6a7a0f744b7931995f1fd52c5ba17 in the isolated codex/unified-replatform worktree. Scope is seven source/document files plus this report; no workflow, cloud, deploy, image, database or production action. Independent review and push are pending.

## Delivered

Strict version-1 release/readiness parsing, detached canonical digest, duplicate decoded JSON-key rejection, bounded safe regular-file CLI ingestion, explicit immutable API/web and architecture evidence references, inventory-derived current schema36, same-environment runtime mapping and paired environment separation. Public config rejects server fields and secret references. Auth/media/protected-database mapping is exercised against actual repository resolvers with synthetic values; no real secret resolution, S3 request or OAuth request occurs.

CLI inspect outputs STRUCTURALLY_VALID_UNQUALIFIED. Verify cannot succeed: it rejects missing selected architecture or fails TRUSTED_AUTHORITY_UNAVAILABLE because this package deliberately contains no GitHub/registry authority adapter. Caller success/trusted objects cannot grant authority. Required-check execution, signatures/attestations, index membership and smoke receipts remain subsequent adapter obligations; no tests here claim to verify those external facts. Red fullparity aggregates remain blockers, not replaced by local slice success. Production approval/QA evidence enforcement belongs to the unavailable authority adapter and deployment package; there is no deploy command.

Templates have empty origins/callbacks and fail validation intentionally (QA_HOSTNAME_MISSING / production READINESS_SCHEMA_INVALID). Synthetic complete fixtures establish local contract success without inventing a real QA hostname. Shared AWS boundary is application-shared-principal; no IAM isolation claim. Existing frontend image remains environment-dependent; compose/proxy/SEO and candidate/QA workflows are later packages.

## TDD and observed verification

Initial absent-module run failed discovery; not counted as behavioral red. Added nonimplemented stubs:32 selected,18 failed14 passed. After parser implementation31 passed1 failed: test incorrectly changed schema37 and expected digest error, corrected tamper fixture to valid source SHA mutation so digest is first cause. CLI stubs40 selected8 failed32 passed; implemented CLI and corrected Vitest each array argument wrapping.48 selected then47 passed1 failed proving public Maps-reference/application-secret collision; implemented rejection.

Final clean qualification: git archive exact c8fb27bf into C:/Users/TK/.codex/tmp/qa-contract-clean-3be49100071749f2a761cec61bc12e72 plus exactly seven owned file overlays. Portable Node24.21.0/npm11.19.0. Root locked install used npm ci --ignore-scripts --engine-strict (root has no relevant lifecycle hook). Initial tunes ignore-scripts install was not used as final readiness proof: reran normal npm ci --engine-strict, which executed actual auth-runtime postinstall locked install. Both completed. Existing npm audit output reported12 tunes dependency vulnerabilities (9 moderate3 high), no dependency changes/audit fix; auth-runtime0/root0. npm11 reported dependency install scripts not yet covered by allowScripts; no approval settings changed.

Clean actual command from tunes: node node_modules/vitest/vitest.mjs run server/test/contracts/platform-release.test.ts =>1 file48 tests PASS,0 failed/skipped,8.96s. This is an explicitly selected contract file, not full repository tests. Normal worktree preceding run48 selected, one security negative failed before fix; clean run qualifies final fix. No DB/browser/image run claimed or needed for this pure package.

Clean strict scoped TypeScript noEmit compile of both new source modules plus imported inventory using actual fresh tunes type roots passed. CLI root npm run --silent platform:release -- verify --manifest nonexistent-sentinel-file --readiness deploy/environments/qa.example.json --environment qa => expected exit1, MANIFEST_READ_FAILED only, no path/content disclosure. Successful structural inspect and missing authority verify are tested in the48 contract checks; real trusted qualification cannot pass yet.

Owned clean archive intentionally retained for reviewer. No Docker/PG/HTTP processes or resources created. No hidden copied checkout tests collected. Seven overlay file hashes are recorded below; clean source baseline provides remaining executed dependency closure. Imported inventory/auth/objectStorage/database source remained read-only. git diff --check of root package script passed.

## Source fingerprints

97e07dafefa8b0d55bd1de6ad92a30e150cfc3b0b0f2984ef10cadb3e011f285 scripts/platform-release.ts
1500c4cb93640f5c4398cac5be6c5585e34ae235be55898424d3bd4e8bbb4d1a scripts/platform-release-contract.ts
55a109c81a965304e83ce09798201444951c447728d950dd59345f664f9d8c31 tunes/server/test/contracts/platform-release.test.ts
f2ad5b4ccaefaa56cbec4f825ad65b0be2836bb984c0954568d8dbd0a23fc92e package.json
025b535b287916e34a90973d124e5b73546b0b34e7c0bfd2f94d270dabf08a99 deploy/environments/qa.example.json
69d97349f8edd5454f5ae35a18941667802670ab54ba11dad9cf18eb256372bb deploy/environments/production.example.json
cce76cb1fec28f8909693a6be48830c81b950110501c9c5327c268c37eb77027 docs/replatform/qa-runbook.md

## Remaining dependencies

Independent review first; trusted offline authority adapter cannot be fabricated. Need actual QAhostname/DNS/TLS, host architecture/access/capacity, approved Web OAuth client/callback, bucket/region/IAM verification and actual secret presence before live deployment. Template reference distinction does not prove different resolved credentials or host alias targets. Required hosted source gates pending/failed must be resolved without bypass. Ticket3.5, milestone1, fullparity and release remain incomplete.
