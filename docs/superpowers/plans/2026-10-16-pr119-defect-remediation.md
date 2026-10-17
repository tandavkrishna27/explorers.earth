# PR 119 Defect Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five defects an adversarial review found in the ten commits pushed to `codex/unified-replatform` today, and establish the one missing fact needed to decide the Windows owner-check question — without weakening any probe.

**Architecture:** Six independent remediation tasks (A1-A6) touching one file each, plus one read-only CI diagnostic (C1). Task B (the guides seal re-record) is specified but **BLOCKED** pending the repository owner's explicit approval, because it rewrites a probe's pins.

**Tech Stack:** TypeScript, Vitest, Playwright, PowerShell, GitHub Actions.

---

## Context: what the review established

Three read-only agents audited (1) the guides seal, (2) the Windows root-owner refusal, (3) all ten commits adversarially.

Verdict on the commits: **no commit fakes a green; no probe, assertion, skip or retry was weakened; no receipt was rewritten.** Every raised bound is a latency guard, not load-bearing for a correctness property. Five defects were found, all mine, listed below as A1-A6.

Two of my own claims were proven false and must be corrected in the record:
- I wrote "root scripts/ seals 570/570, which covers the browser baselines that list this spec." **False.** `scripts/browser-source-inventory.test.mjs` checks the baseline JSON for *internal* consistency only; nothing in that lane hashes the working tree. Proof: `source-v3.json` pins `public-shell-continuity.spec.ts` at a byteHash that already diverged from disk before I touched it.
- I wrote that the e2e flake occurred "under 69 specs of parallel load." **False.** `playwright.category-navigation.config.ts:6` sets `workers: 1, retries: 0`. The lane is single-worker; the 69 figure is the test count, run serially. There is no parallel contention, so the mechanism I named does not exist.

## File Structure

| File | Task | Responsibility of the change |
|---|---|---|
| `tunes/scripts/music-local-state.ts` | A1, A6 | correct the stderr cap arithmetic; disclose the child bound's true call-site scope |
| `.github/workflows/music-c0-contracts.yml` | A2, C1 | retire the spent diagnostic flag; add the read-only owner-SID probe |
| `explorers-earth/e2e/music-publish-controls.spec.ts` | A3 | re-derive the wait window against the real config, correct the false mechanism |
| 4 source/test files | A4 | restore LF endings this session's tooling flipped |
| `docs/replatform-audit/reconciliation-2026-10-15.md` | A5 | reconcile contradictory census figures; record the false seal-coverage claim |
| `tunes/server/test/contracts/guides-native-diagnostic.test.ts` | B (BLOCKED) | re-record 4 hashes + 7 fingerprints, add a projection guard |

---

### Task A1: Correct the stderr capture cap

**Why:** The guard tests `stderr.length` *before* appending and ignores `data.length`, so one large pipe chunk arriving at 4095 bytes yields ~68 KiB — appended verbatim into the thrown message and the CI log. This is the one buffer where the "stderr may contain credentials, never retain it" invariant is deliberately suspended, so the cap must actually hold. The correct pattern already exists ten lines above for stdout.

**Files:**
- Modify: `tunes/scripts/music-local-state.ts:44`

- [ ] **Step 1: Read the current line and the stdout pattern it should match**

Run: `grep -n "stderr.length < 4096\|stdout.length + data.length" tunes/scripts/music-local-state.ts`
Expected: line 34 shows `stdout.length + data.length > 1024 * 1024`; line 44 shows `stderr.length < 4096`.

- [ ] **Step 2: Apply the fix**

Replace on line 44:
```ts
if (stderr.length < 4096) stderr += data.toString('utf8');
```
with:
```ts
if (stderr.length + data.length <= 4096) stderr += data.toString('utf8');
```

- [ ] **Step 3: Prove the cap now holds, and did not before**

Create a throwaway probe (scratchpad, not committed) that calls the real `runLocalProcess` against a child emitting 4095 bytes then 64 KiB, with `MUSIC_LOCAL_STATE_STDERR=1`, and prints `stderr.length`.
Expected: `<= 4096` after the fix. Record the pre-fix number too.

- [ ] **Step 4: Verify no behaviour change when the flag is unset**

Run: `cd tunes && npx vitest run server/test/contracts/music-local-state.test.ts`
Expected: 28 passed, 2 failed — the two packaged-desktop-app ancestry cases that fail on this machine only. No new failures.

- [ ] **Step 5: Commit**

```bash
git add tunes/scripts/music-local-state.ts
git commit
```
Message must state the measured pre-fix overflow size and that the cap is the credential boundary.

---

### Task A2: Retire the spent `MUSIC_LOCAL_STATE_STDERR` flag

**Why:** The flag was added to learn why the Windows lane failed. It has done that: the lane now reports `identity: root owner mismatch`. Leaving a whitelist-bypass permanently enabled in CI, with no removal plan, is a standing exposure that no longer buys anything. The opt-in capability stays in the code for the next diagnosis; only the CI activation is removed.

**Files:**
- Modify: `.github/workflows/music-c0-contracts.yml` (remove line 124 and its 5 comment lines)

- [ ] **Step 1: Confirm the flag is only set in this one place**

Run: `grep -rn "MUSIC_LOCAL_STATE_STDERR" --include=*.yml --include=*.yaml --include=*.ts --include=*.json . | grep -v node_modules`
Expected: the workflow line, the implementation in `music-local-state.ts`, and nothing else.

- [ ] **Step 2: Remove the env entry and its explanatory comment block**

Delete the `MUSIC_LOCAL_STATE_STDERR: "1"` line and the five `#` comment lines immediately above it. Leave `APPS_PRIVATE_CUSTODY_GATE_REQUIRED: "1"` and every other env entry untouched.

- [ ] **Step 3: Verify the YAML still parses and the step is intact**

Run: `node -e "const t=require('fs').readFileSync('.github/workflows/music-c0-contracts.yml','utf8'); console.log(/MUSIC_LOCAL_STATE_STDERR/.test(t)); console.log(/APPS_PRIVATE_CUSTODY_GATE_REQUIRED: \"1\"/.test(t));"`
Expected: `false` then `true`.

- [ ] **Step 4: Commit** (may be combined with A1, since both concern the same exposure)

---

### Task A3: Re-derive the e2e wait window against the real config

**Why:** Two false premises in one comment. (a) It cites `playwright.config.ts:17`'s 90s test budget, but this spec runs only under `playwright.music-publishing.config.ts`, which spreads `playwright.category-navigation.config.ts:6`: `timeout: 60_000`. (b) It attributes the failure to "69 specs of parallel load", but that same line sets `workers: 1` — the lane is serial, so the named mechanism does not exist. The 12s expect default cited was correct.

A 30s window inside a 60s test, after a `page.reload()`, a `Retry` visibility wait and several gateway reads, can be truncated by the test timeout — producing exactly the opaque failure the comment claims to prevent.

**Files:**
- Modify: `explorers-earth/e2e/music-publish-controls.spec.ts` (the comment block and the `{ timeout: 30000 }` added earlier)

- [ ] **Step 1: Establish the prologue's real cost before choosing a number**

From the CI log for the passing twin run of this lane, read the reported duration of the test `preserves the saved pin...` / the guest-recovery case. Record it.
Do **not** guess the margin: if the prologue cost cannot be established, set the window to 20000 (12s default + 8s, still inside 60s with >35s of slack) and say so.

- [ ] **Step 2: Replace the window and the comment**

Change `toBeVisible({ timeout: 30000 })` to `toBeVisible({ timeout: 20000 })`.

Replace the six comment lines with text that states only what is measured:
- this lane is `workers: 1, retries: 0`, test budget 60s, expect default 12s (`playwright.category-navigation.config.ts:6`);
- the same commit's two runs differed, one passing and one failing at this assertion, so the read's latency is variable on CI;
- the mechanism is **not** parallel contention — the lane is serial; the earlier claim of "69 specs of parallel load" was wrong, 69 is the serial test count;
- 20s leaves >35s of the 60s budget for the prologue, so a genuinely slow read still fails as this assertion rather than as a test timeout;
- the assertion, the read-count check and the no-writes check are unchanged.

- [ ] **Step 3: Verify lint and that the file's endings stay LF**

Run: `cd explorers-earth && npx eslint e2e/music-publish-controls.spec.ts`
Expected: 0 errors.
Run the CRLF counter from Task A4 Step 1 against this file; expected 0 CRLF.

- [ ] **Step 4: Commit**

---

### Task A4: Restore LF line endings flipped by this session's tooling

**Why:** Python edits written with `newline=''` re-emitted three files wholly as CRLF and left one production source file mixed (a single CRLF on its final `}`). No `.gitattributes` rule covers them. This is the recorded trap for this repo — line-indexed tooling and `splitlines` break on mixed endings — and it buried 14 real comment lines inside ~2,300 lines of diff churn.

**Files:**
- Modify (endings only, no content change):
  - `explorers-earth/e2e/public-shell-continuity.spec.ts` (961 CRLF -> 0)
  - `explorers-earth/src/features/PublicHome/components/__tests__/PublicCategorySharedIsolation.test.tsx` (531 CRLF -> 0)
  - `tunes/server/test/contracts/places-writer-race-controller.test.ts` (206 CRLF -> 0)
  - `explorers-earth/src/features/PublicHome/utils/publicGuidePhotoViewModel.ts` (1 CRLF -> 0)

- [ ] **Step 1: Record the before state**

```bash
python -I -c "
import io
for p in ['explorers-earth/e2e/public-shell-continuity.spec.ts','explorers-earth/src/features/PublicHome/components/__tests__/PublicCategorySharedIsolation.test.tsx','tunes/server/test/contracts/places-writer-race-controller.test.ts','explorers-earth/src/features/PublicHome/utils/publicGuidePhotoViewModel.ts']:
    r=io.open(p,'rb').read(); print(r.count(b'\r\n'), r.count(b'\n'), p)"
```
Expected: 961/961, 531/531, 206/206, 1/133.

- [ ] **Step 2: Confirm each file's pre-session ending convention from git**

For each file run: `git show <pre-session-sha>:<path> | python -I -c "import sys;r=sys.stdin.buffer.read();print(r.count(b'\r\n'),r.count(b'\n'))"`
Use `7333dc41` (the session's starting commit) for the three that existed unchanged, to confirm the original was 0 CRLF. **If any file was originally CRLF, leave it CRLF** — the goal is to restore each file's own convention, not to impose LF.

- [ ] **Step 3: Convert CRLF -> LF, content untouched**

```bash
python -I -c "
import io
for p in ['<the four paths>']:
    r=io.open(p,'rb').read()
    io.open(p,'wb').write(r.replace(b'\r\n',b'\n'))
    print('normalised', p)"
```

- [ ] **Step 4: Prove only endings changed**

Run: `git diff --ignore-cr-at-eol --stat -- <the four paths>`
Expected: **empty output** — no content difference once CR is ignored.

- [ ] **Step 5: Verify the affected suites still pass**

```bash
cd tunes && npx vitest run server/test/contracts/places-writer-race-controller.test.ts
cd explorers-earth && node scripts/run-contained-vitest.cjs run src/features/PublicHome
```
Expected: places 63 passed; PublicHome suites all pass.

- [ ] **Step 6: Verify the root seals are unaffected**

Run: `node --test "scripts/*.test.mjs" "scripts/*.test.cjs"`
Expected: 570 pass, 0 fail.

- [ ] **Step 7: Commit**

---

### Task A5: Correct the record in the reconciliation document

**Why:** Two accuracy defects in a document whose purpose is auditability. (a) It records the census collapse as "traversal 20 -> 0, section 14 -> 0, ownerList 14 -> 0, tip 16 -> 0" and then states the base as "18 / 19 / 6 / 2 / 13" — the pre-collapse figures match neither and are unsourced. (b) The false seal-coverage claim I made in a commit message needs correcting somewhere durable, since commit messages cannot be rewritten on a pushed branch.

**Files:**
- Modify: `docs/replatform-audit/reconciliation-2026-10-15.md`

- [ ] **Step 1: Re-measure the five detector counts at the restored base**

```bash
git show 5f98ed0c:explorers-earth/e2e/replatform/guides.spec.ts > /tmp/base.ts
for p in markProducerStage markTraversalOperation markSectionOperation markOwnerListOperation markTipOperation; do
  printf "%-28s %s\n" "$p" "$(grep -o "$p" /tmp/base.ts | wc -l)"
done
```
Record the actual numbers. Use the seal's own census definition where it differs from a raw grep (the seal counts full-line regex matches, not substring occurrences) and state which method each figure uses.

- [ ] **Step 2: Replace the unsourced pre-collapse figures**

Either cite how 20/14/14/16 were obtained, or replace them with re-measured values and label the measurement method. Do not leave two contradictory sets in the document.

- [ ] **Step 3: Append the correction about seal coverage**

State plainly: the claim "root scripts/ seals cover the browser baselines that list this spec" was wrong; `scripts/browser-source-inventory.test.mjs` verifies the baseline JSON's internal consistency only and does not hash the working tree; `source-v3.json`'s pin for `public-shell-continuity.spec.ts` already diverged from disk before this session. Also record that the e2e "parallel load" mechanism was wrong, since that lane is `workers: 1`.

- [ ] **Step 4: Commit**

---

### Task A6: Disclose the child bound's real call-site scope

**Why:** The 30s -> 120s raise was justified entirely with PowerShell-helper latency evidence, but `runLocalProcess` has three other callers: `music-local.ts:76` (`runDocker`), `:227` (`git rev-parse`), `:228` (`git status`). A hung docker or git invocation now blocks 120s instead of 30s. Latency only, no correctness effect — but the change's scope exceeded its justification, and the next reader deserves to know.

**Files:**
- Modify: `tunes/scripts/music-local-state.ts` (the comment block above line 33)

- [ ] **Step 1: Confirm the caller list**

Run: `grep -rn "runLocalProcess(" --include=*.ts tunes | grep -v node_modules | grep -v "\.music-cli-contract-isolated"`
Expected: the definition, the `privateHelper` call, `runDocker`, and two git calls.

- [ ] **Step 2: Add two sentences to the existing comment**

Name the three non-helper callers and state that a hung docker or git child now also waits 120s, that this is latency only, and that no caller asserts a completion deadline.

- [ ] **Step 3: Verify**

Run: `cd tunes && npx tsc --noEmit -p tsconfig.json` and filter to `^scripts/`.
Expected: no errors from `scripts/`.

- [ ] **Step 4: Commit** (may be combined with A1)

---

### Task C1: Measure the Windows runner's root owner (read-only)

**Why:** Both audit agents refused to choose between the Windows options without this fact, and nobody has measured it. The helper's `identity-probe` output is deliberately redacted, so neither the test nor the log can currently see which principal owns the runner's `LocalAppData`. Everything said so far about `Administrators` owning it is inference from documented Windows behaviour, not observation.

This task changes **no** product or test code. It adds one read-only diagnostic step, following the precedent of the lane's existing temp-root probe at `music-c0-contracts.yml:99-105`.

**Files:**
- Modify: `.github/workflows/music-c0-contracts.yml` (new step, Windows leg only)

- [ ] **Step 1: Read the existing probe step to copy its shape and redaction discipline**

Run: `sed -n '95,110p' .github/workflows/music-c0-contracts.yml`

- [ ] **Step 2: Add the probe step, gated to Windows, before the contract test step**

```yaml
      - if: runner.os == 'Windows'
        name: Report the runner LocalAppData owner shape
        shell: pwsh
        run: |
          $local = [Environment]::GetFolderPath('LocalApplicationData')
          $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
          $principal = New-Object System.Security.Principal.WindowsPrincipal($id)
          [pscustomobject]@{
            rootOwner      = (Get-Acl $local).GetOwner([System.Security.Principal.SecurityIdentifier]).Value
            tokenUser      = $id.User.Value
            tokenOwner     = $id.Owner.Value
            isAdmin        = $principal.IsInRole([System.Security.Principal.WindowsBuiltinRole]::Administrator)
            ownerMatchesUser  = ((Get-Acl $local).GetOwner([System.Security.Principal.SecurityIdentifier]).Value -eq $id.User.Value)
            ownerMatchesOwner = ((Get-Acl $local).GetOwner([System.Security.Principal.SecurityIdentifier]).Value -eq $id.Owner.Value)
          } | ConvertTo-Json -Compress
```

Note: SIDs are machine-scoped identifiers, not secrets, and the lane already prints canonical paths. No path contents, no secret material, no file bytes are emitted.

- [ ] **Step 3: Verify the step is syntactically valid and Windows-gated**

Run: `node -e "const t=require('fs').readFileSync('.github/workflows/music-c0-contracts.yml','utf8'); const i=t.indexOf('rootOwner'); console.log(i>0, /runner.os == 'Windows'/.test(t.slice(i-400,i)));"`
Expected: `true true`.

- [ ] **Step 4: Commit and push; read the probe output before proposing any `ValidateRoot` change**

The decision between (d) "the test asserts the expected refusal" and (e1) "`ValidateRoot` compares against the token's `.Owner` rather than `.User`" depends on `ownerMatchesOwner`. **Do not change `ValidateRoot` in this plan.** That file's bytes are hash-sealed into the replatform e2e provenance and the change is a trust-boundary policy decision for the repository owner.

---

### Task B: Re-record the guides seal — **BLOCKED, DO NOT EXECUTE WITHOUT OWNER APPROVAL**

**Why blocked:** This rewrites a probe's pins. It is specified here so the diff is reviewable in advance, not so it can be run.

**Established by audit:**
- The two visible failures are a symptom. Because the projection's SHA gate fails, `fingerprint()` returns `undefined` for every call, so the ~65 `.not.toBe(frozen)` mutation checks have not executed since `8460e645`. The seal has been vacuous for ten commits.
- **7 fingerprint pins are stale, not 2.** Re-recording only the two that fail leaves the test red at the next.
- The independent AST-shape gate — the actual semantic guarantee — **passes at HEAD**, and a line-by-line comparison shows all 19 assertions in `assertOwnerCategoryReads` and every assertion in `trackGuideReads` survive 1:1. The added `catch` blocks wrap only the diagnostic recorder and rethrow unconditionally.
- `trackGuideReads` is **not** dead and must **not** be deleted: `guides-paging-spec.test.ts:31-38` and the seal's own `read-*` matrix extract and execute its source, and the projection requires its declaration.
- The drift window is five business commits, each with a stated rationale, plus one comment-header block; `git diff 4f7c653b HEAD` over the spec shows no non-comment change.

**Specified steps, for review only:**

- [ ] Refresh the 4 function hashes (`trackGuideReads`, `assertOwnerCategoryReads`; the other two already match).
- [ ] Refresh all 7 fingerprint pins.
- [ ] Add `expect(categoryReadBusinessProjection(<source>)).toBeDefined()` before the first `fingerprint()` assertion in each affected test, so a future helper edit fails legibly instead of silently voiding the mutation apparatus. **Adds a probe; removes none.**
- [ ] Re-run both mutant loops and confirm each mutant differs from the **new** frozen value rather than merely returning `undefined`. Several mutants currently "pass" by tripping the hash gate — weak detection that must be recognised and recorded.
- [ ] Verify: `cd tunes && npx vitest run server/test/contracts/guides-native-diagnostic.test.ts` -> 49/49; `node --test "scripts/*.test.mjs" "scripts/*.test.cjs"` -> 570/570.

---

## Verification (whole plan)

- [ ] `cd explorers-earth && npx eslint .` -> 0 errors
- [ ] `cd explorers-earth && npm run --silent test:unit` -> 390 files / 5322 tests (serially; this lane is the only cross-ticket gate)
- [ ] `cd tunes && npx vitest run server/test/contracts` -> no new failures vs. the recorded baseline of 4
- [ ] `node --test "scripts/*.test.mjs" "scripts/*.test.cjs"` -> 570 pass / 0 fail
- [ ] `git diff --ignore-cr-at-eol --stat` over the A4 files -> empty
- [ ] `cd tunes && npx tsc --noEmit -p tsconfig.json` -> only the pre-existing `youtube-playlist-import.ts` error

## Out of scope

- Any change to `ValidateRoot` in `music-local-private-files.ps1` (owner decision; hash-sealed into e2e provenance).
- Hash-pinning the oracle's internal assertion bodies — a real gap, since the spec's helpers are pinned far more tightly than the code that replaced them. Worth its own ticket.
- The `public-guides` media-gate widening (`products`/`people` owner uploads publicly unserveable) — owner decision, recorded in `reconciliation-2026-10-15.md`.


---

# REVISION 2 (2026-10-16) — after two independent plan reviews

Two read-only agents reviewed revision 1: one adversarial on the plan, one re-deriving its factual
claims empirically. They found defects in the plan itself, including two that would have made the
code WORSE. Revision 1's task bodies above are superseded where this section contradicts them.

## Changes forced by the reviews

| # | Revision 1 said | Why it was wrong | What was done |
|---|---|---|---|
| A1 | fix with `stderr.length + data.length <= 4096` | **Drops a whole oversized chunk**, so a child writing all its stderr in one >4 KiB write retains NOTHING — the exact blindness this capture cures. Also mixed units: `data.length` is bytes, string length is UTF-16 units | truncating + byte-counted: `if (Buffer.byteLength(stderr,'utf8') < 4096) stderr = Buffer.from(stderr + data.toString('utf8'),'utf8').subarray(0,4096).toString('utf8')` |
| A1 Step 4 | expect "28 passed, 2 failed" | The reviewer measured **30 passed, 0 failed** on its host. The 2 failures are an artifact of THIS session's process ancestry (packaged desktop app), not a repo baseline | expectation removed; this baseline is environment-dependent and must not be encoded |
| A3 | shrink 30s -> 20s because 30s "can be truncated" | **Measurement refutes it.** Failing run 19.65s (12.0s = the expect timeout, prologue ~7.6s); passing twin 7.94s. 30s was never at risk, and nothing supports 20000 over 30000 | window left at 30s; only the false reasoning replaced. Recorded as a MITIGATION — the cause of the variance is unknown |
| A4 Step 2 | anchor at `7333dc41` | **Not an ancestor of this branch** and contains none of the four files; `git show` would pipe an empty stream and "confirm LF" from a nonexistent file | real parents used: `afcd9600^`, `0310736a^`. All four confirmed originally LF |
| A4 Step 4 | `git diff --ignore-cr-at-eol --stat` empty proves success | **False gate** — empty whether or not the normalisation ran | gate is now three-part: plain `git diff --stat` must show the churn (measured 1981/1981), CR-insensitive diff must be empty, and CR byte count must be 0 |
| A4 scope | four files | The same window left **two more files mixed**, including A1/A6's own target | extended to six: `music-local-state.ts` (128 CRLF) and `music-local-private-files.ps1` (154 CRLF) normalised too |
| A5 Step 1 | re-measure the census by `grep -c` | Would have added a **third** contradictory set. The seal counts AST nodes, not substrings | the unsourced set is withdrawn, the method is stated, and the grep figures are recorded as non-comparable |
| A6 Step 3 | `tsc --noEmit -p tsconfig.json` | **Vacuous**: `scripts/` is not in that tsconfig's `include`, so it never sees the file | `npm run music:types:scoped` (exit 0) and `music:types:baseline` (exit 0) |
| C1 | plain probe, prints SIDs | No `continue-on-error` (a pwsh step runs with `$ErrorActionPreference = stop`, so a diagnostic could kill the lane); **the repo is PUBLIC**, so CI logs are world-readable; measured the wrong path (`GetFolderPath` is not what `ValidateRoot` receives); `Get-Acl` called three times | `continue-on-error: true`; **booleans only, no SID emitted**; both roots reported; single ACL read per root |
| A2 | remove the flag now | Removes the only stderr channel while C1 is unanswered and B is blocked | **deferred** until C1's output is read |
| Verification | contracts baseline "4"; `tsc` "only youtube-playlist-import" | Baseline is environment-dependent (reviewer saw 3 incl. `music-cli-contract`, this host sees 4 incl. 2 ancestry cases); `tsc -p tsconfig.json` reports 138 errors, 137 of them in the duplicate `client/` tree | baselines restated per host; typecheck scoped properly |
| Out of scope | "`ValidateRoot` … hash-sealed into e2e provenance" | **Overstated.** `replatform-e2e.test.mjs:1130` only asserts the hash is TRUTHY, computed from the working tree. This session already changed that file twice with 570/570 green | withdrawn and corrected in `reconciliation-2026-10-15.md`; the owner-decision reason stands alone |

## Task B — amended, and still BLOCKED

The adversarial review found revision 1's proposed guard **insufficient for the vacuity it names**.
A single `expect(categoryReadBusinessProjection(source)).toBeDefined()` covers only the projection's
hash gate. `fingerprint()` has four further silent `return;` paths: the size census
(`passive.size!==6 || primaries.size!==1 || !transport || !tip || !traversal || !ownerList ||
producerStages.size!==18 || !section`), the catch-clause text equality check, and `guards.size!==8`.

So re-recording 7 pins plus that one probe would produce a GREEN test while leaving an unknown
fraction of the ~65 mutation checks trivially satisfied — "greener without more correct", which is
exactly what the constraints forbid. Revision 1 even noted that several mutants currently pass by
tripping the hash gate, then prescribed only to "recognise and record" it. That is not sufficient.

**Amended requirement, to be satisfied BEFORE approval is sought:** guard per call site —
`const f = fingerprint(mutant); expect(f).toBeDefined(); expect(f).not.toBe(frozen);` — or change
`fingerprint()` to throw rather than return `undefined`. Only then is a re-record meaningful.

## State after revision 2

Executed and verified: A1, A3 (comment only), A4 (six files), A5, A6, C1.
Deferred: A2 (after C1's output). Blocked: B (amended spec above, owner approval required).

Verified on this host after the changes: eslint 0 errors (1863 warnings); explorers-earth unit lane
390 files / 5322 tests all passing; root `scripts/` seals 570 pass / 0 fail; `music:types:scoped`
and `music:types:baseline` exit 0; workflow diff insert-only (29/0) and the workflow-shape contract
test's step finder still resolves with its `*_GATE_REQUIRED` flags intact; `tunes` contracts 4182
passed with 4 failures, all pre-existing (2 blocked seal assertions, 2 ancestry cases specific to
this session's packaged-app process chain).
