# Task 3.1 shared notes and mutation clients — implementation checkpoint

Status: implemented, uncommitted; independent review and coordinated runtime/image qualification remain outstanding. No push, merge or deployment. Manual resolver/title override and UI adoption remain subsequent groups.

## Result

Versioned `{version:1,format:"quill-html",html}` notes use existing recommendation.note JSONB. Author input preserves the actual Quill paragraph/header1–3/bold/italic/underline/strike/color/background/list and emoji identity/Unicode output. Strict grammar, parse5 structural validation and final server DOMPurify reject unsupported or lossy markup with422. Byte256KiB, tree10,000nodes, depth128 and command-body1MiB limits fail closed with413. Omitted create means null; omitted patch preserves; null and verified empty editor output clear. No migration required and no historical migration modified.

Private editable detail includes safe notes and observed category revision; bounded owner core pages remain separate. Public recommendation detail explicitly projects only id/title/kind/rating/sanitized note behind live public ancestor checks. Existing ownership, resource revision, receipt replay, category counters, lifecycle purge and state restore remain authoritative; independent notes never mutate shared entity catalog.

Clients issue private frozen detail observations, derive selectors/revisions from observations, expose staging copies without authority, fence auth generation and late401 completions, revoke observations after definitive completion, retain stable uncertain-retry keys, and require an exact member-set reorder from a registered joint observation. No API/server source imports into browser shared code.

Actual installed Quill2.0.3 + quill2-emoji0.1.2 HTML/Delta captured in headless Chromium reloads identically. Actual Quill applies color styles to STRONG; server and public renderer preserve those styles. Generated closed emoji-name/Unicode table includes reproducible package provenance and source hash.

## Dependencies and runtime

Production exact DOMPurify3.4.16 + jsdom30.1.1; direct parse5@8.0.1 supports loss-detecting structural validation and is already in jsdom's parser graph. @types/jsdom27 is development-only. No dev-only DOM imported by production sanitizer. Parent approved coherent Node24.21.0 because existing geoip-lite2.0.3 and maintained jsdom cannot share provisional22 qualification. Host Node24.14 is unsupported for this backend; no global runtime changed. Official portable Windows24.21 archive SHA256 verified against compatibility report. Root/backend/frontend manifests and lock metadata require ^24.21.0. Clean backend and frontend installs passed --engine-strict under24.21/npm11.19.

Protected Docker/CI/native launcher archive/npm-tree/npm-cli digest coupling is requested as a bounded runtime-writer handoff. Those files are not yet changed here; actual final Docker24 image graph and unchanged strict vulnerability-scan policy remain required. Compatibility evidence lives in shared-notes-runtime-compatibility.md in this directory. No image qualification claim yet.

## Executed final verification on portable Node24.21.0

- Full frontend:281files,4012tests pass.
- Guarded real PostgreSQL API/revision/public/lifecycle suites:5files,129tests pass, zero skips; includes real browser client through HTTP and note create/update/replay/crossowner/malformed/limits/private-public checks.
- State restore:3tests pass, zero skips; Unicode/versioned note included in nonempty restore. Owned temporary databases stopped.
- Frontend critical coverage:100% per file.
- TypeScript baseline comparator passes after fixing the sole new diagnostic; existing normalized baseline errors remain, so this is not a claim of clean whole-tree tsc.
- API build passes. Clean isolated frontend engine-strict install and full production/HTTPS bundle build pass.
- Actual root BuildKit allowlist context:2tests pass; new browser shared note module explicitly included.
- Contract/scanner/adapter selection:70tests pass; subsequently real default geoip lookup17test suite passes.
- Backend critical coverage and isolated production-only graph qualification are running; results will be appended.

## Recorded limitations and failed attempts

Production npm audit retains existing four moderate advisories in body-parser/express/qs/ip-address; no sanitizer-family advisory found. All-dependency audit12 includes existing development findings. npm11 clean install reports existing allowScripts warnings; install itself completed with no engine warnings. A default-config real-tool selection found no files, then a selected backend coverage/context attempt included a preexisting copied scratch repository, producing stale scratch failures. Corrected explicit exclusions preserve the scratch files and scope evidence to the active checkout. Earlier provisional22 results are preliminary, not final runtime qualification. No repeated full bare backend run; earlier bare runs were known stalled/contaminated and are not a completion claim.

Unrelated task2.2 report, robots/sitemap output, docs scratch and copied repository remain unstaged and preserved. No commit before root independent checkpoint review.

Final addendum: backend critical coverage passes100% (1930statements,1787branches,275functions,1680lines); clean isolated production-only npmci --omit=dev --engine-strict passes under24.21, and compiled run-production-graph-smoke exits0 using only its production node_modules. Final production audit has4moderate,0high,0critical; no newly added sanitizer advisory. gitdiff --check exits0 (line-ending normalization warnings only). Runtime/image/launcher qualification and independent review remain pending; no commit made.

Root checkpoint: independent source review PASS (21 sanitizer,13 frontend,75 PostgreSQL tests). Root authorized the precise reviewed source commit. Coordinated runtime coupling is in separate local commit e7379b68; runtime fresh review and final image scan remain parent-owned pending qualification. This source commit depends on that runtime commit; no push authorized. No source changes after review.
