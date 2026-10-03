# Owned browser shard executor preparation

Date: 2026-10-02. Accepted pure contract base: 75407252455a6754d1efa31a010cae89f37132fb. Working HEAD before this ticket: 4f3958c499d500f44ba019c61f7b29dbc345d03f.

## Delivered scope

Only new `scripts/browser-shard-executor.mjs`, its focused Node contract tests, and this report. Existing pure modules, historical/v2 baselines, protected runners, lifecycle wrappers, packages, workflows, and screenshot code remain untouched by this ticket. No push, browser execution, database, Docker, HTTP request, or CI rerun.

`discoverOwnedShard(request, authority, options)` accepts only `{mode:'discover', shard}` as untrusted request. A separate trusted dispatcher must supply producer-to-job mapping, plan, committed Git byte inventory, source scopes/EOL policies, actual installed dependency admission, and pinned Node/Playwright facts. The module verifies observed regular files against accepted schema2 attestation and copies only those bytes into a per-attempt workspace. It verifies Node binary, installed lock markers, Playwright CLI hash/version; these checks do not authenticate a caller or replace clean installation provenance.

Every admitted attempt allocates separate workspace/control/artifacts, keeps an ownership nonce, writes an initial red discovery-attempt ledger, derives an argument array without shell, encodes exact structured selection, and validates discovery identities against the assigned set. Source bytes are re-attested after child completion. Ambient remote URLs, database/Docker authority, NODE_OPTIONS/NODE_PATH and deployment gates are rejected; only a bounded environment allowlist reaches the child. No raw child stdout/stderr or arbitrary exception message enters the ledger.

The executor uses a TCP reservation during discovery, unique control/output directories, and checked owned cleanup. It removes only admitted dependency links and refuses recursive cleanup around unknown links, output redirects, or changed ownership. Child failure, cancellation, malformed/empty/extra discovery, dirty source, unmet prerequisites, and unproved cleanup remain red. If the allocation root is unsafe it throws before creating an attempt; if owned output is replaced it throws rather than writing outside the owner. Callers must treat exceptions and absent/final-incomplete evidence as failures. It never returns an execution receipt: kind is `discovery-only`, runtimeQualified is always false, and execute mode is blocked.

Linux process-group ownership is implemented with detached shell-free launch, bounded timeout/output, cancellation, SIGTERM/SIGKILL escalation, and negative-PID absence proof. Its tests inject child/process primitives; they are not Linux host qualification. Windows real launch fails with WINDOWS_OWNER_UNAVAILABLE; claiming the Linux owner on Windows fails. Synthetic-test-only adapters are visibly recorded and cannot qualify runtime.

## Fresh verification

Portable Node v24.21.0, installed Playwright 1.61.1. Command:

```powershell
& 'C:/Users/TK/.codex/tmp/node24-alignment/node-v24.21.0-win-x64/node.exe' --test scripts/browser-contract.test.mjs scripts/browser-executor-preparation.test.mjs scripts/browser-shard-executor.test.mjs
```

137 tests pass, zero failures/skips/cancellations. This includes the accepted 101 pure contracts and 36 owned-executor contracts. TDD observed red tests for post-child source mutation, Linux-owner/Windows mismatch, timeout with denied process ownership, and output overrun without close before implementing their rejection/termination fixes. Initial acceptance was also observed red against a stub before implementation. The failure matrix covers source/node/install/job mapping, request authority injection, ambient authority, malformed child results, symlink source/allocation/output escapes, concurrent attempt isolation, cancellation, cleanup refusal, spawn error, timeout, overflow, split UTF-8, and native/synthetic ownership distinction.

## Nine bounded authoritative selection probes: partial qualification

Probes used exactly the 1,181 portable files in `source-v2.json` from committed source 106960f2a6a9eafd5240ec7a506f3b212e2db280. Bytes came from the existing owned Git archive; frontend and Tunes used the existing explicitly installed node_modules topology through admitted junctions. Plans/selectors came from the accepted pure modules and unchanged v2 baselines. Only installed Playwright `--list --reporter=json --test-list` ran, timeout 30 seconds per probe. These are standalone Windows CLI probes, not a native owned-executor cleanup qualification.

| Lane | Shard expected counts | Exit status | Exact selected identities |
| --- | --- | --- | --- |
| Music | 19 / 19 / 19 / 18 | 1 / 1 / 1 / 1 | All four rejected |
| Publishing | 14 / 14 / 14 / 14 / 13 | 0 / 0 / 0 / 0 / 0 | All five exact |

Every Music probe has this precise loader error: `Cannot find module '.../workspace/explorers-earth/scripts/music-public-live-preflight.mjs' imported from .../explorers-earth/e2e/setup/music.ts`. The import is `e2e/setup/music.ts:13`. Current source-v2 scopes include src/e2e/configs/packages/shared but omit frontend scripts; the earlier full Git archive nine-probe evidence did include that module. This is a source inventory/bootstrap closure gap, not a Music identity change. No unattested bootstrap file was copied to turn it green, no baseline was changed, and no successful Music execution is claimed.

Local evidence: `C:/Users/TK/AppData/Local/Temp/executor-partial-proof-NKfQTj/proof.json`, plus `music-{1..4}.json` and `publishing-{1..5}.json` there. Driver: `C:/Users/TK/AppData/Local/Temp/executor-partial-proof.mjs`. Raw config output is local diagnostic evidence, not an aggregate/runtime receipt.

## Explicit prerequisites for the next ticket

1. Review a finite source-inventory revision adding at least `explorers-earth/scripts/music-public-live-preflight.mjs` (Node-only static imports), then probe the complete discovery import closure. Re-attest new portable/observed source, regenerate source-bound v2 lane baselines while proving historical structured identity equality, and rerun the nine isolated lists. Preserve existing historical snapshots. Do not simply copy unbound files or bypass source hashes. Runtime bootstrap will additionally require reviewed Vite/tsconfig/assets/index and wrapper graph closure.
2. Trusted dispatcher adapter must retrieve Git object bytes, tracked modes, actual dirty/untracked scopes and attributes independently; authenticate workflow/run/attempt/job mapping; verify actual Node24.21 and Playwright1.61.1 plus clean frontend/Tunes install provenance. Hashing node_modules/.package-lock.json and CLI alone does not attest every installed executable dependency. This module's API separation is not identity authentication.
3. Qualify the Linux process-group adapter on a real Linux runner, including lingering descendants, denied/failed kill, cancellation and timeout. Process-group absence does not prove containment of a hostile descendant that escapes into another session; admitted browser/config code and an OS supervisor remain required boundaries.
4. Implement/review a Windows Job Object adapter with assigned-before-execution child ownership, kill-on-close, descendant termination and verified empty job. Do not substitute taskkill of an exited parent or inject a synthetic adapter as production proof. Current executor deliberately has no Windows native adapter API admission.
5. Runtime executor is a separate stage: genuine provider/fixture lifecycle, unique owned fixture/Vite ports with safe handoff, project/title-aware screenshot paths, per-shard artifact paths, bounded raw reporter parsing, cleanup receipts and authoritative aggregate binding. Current reservation is held only for discovery; configs still have historical runtime fixed ports/screenshots. Exact selection cannot repair parity failures or qualify lifecycle behavior.

No workflow/aggregate changes are ready from this ticket. Publishing selection is proved; Music isolated discovery is blocked on item 1. Runtime qualification remains blocked on items 2-5.
