# Wave 2: close the oracle's blind spot and the people/games deadline collision

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Two surgical changes that make the remaining Wave 2 instability diagnosable and deterministic. **Task A** closes the one fact the Guides read-oracle cannot currently record. **Task B** removes a deadline collision that affects three lanes through a single literal.

**Tech Stack:** TypeScript, Vitest, Node's test runner, Playwright (not executed here).

---

## Three premise corrections, from investigation — read before planning further work

My earlier framing was wrong on all three. Recorded so the errors are not repeated.

| I claimed | Code says |
|---|---|
| "Guides case-4 evidence evaporates; build a persistence path" | **The pipeline already exists and already carries case 4.** `guides-harness-client.ts:334` attaches `readOracle` when `clientBoundary==='producer'` and `caseId===GUIDES_CASES[4]`; case 4's whole body is inside `harness.trackProducer` (`guides.spec.ts:373`) which passes `()=>'producer'` (`:646`), and the attaching path is `bounded()`'s catch (`:372-373`), **not** `captureFailure`. It reaches disk at `scripts/replatform-e2e.mjs:844`/`:847` inside `qualification.json`'s `children`. End-to-end proof already exists: `tunes/server/test/contracts/guides-fixture-host.test.ts:313-330` drives the real client → host → parent → formatter → decoder and asserts `readOracle:{scope,check:'read-body',attemptIndex,counts,guard}`. |
| "The `GuidesPageCapsule` path needs extending to case 4" | **Irrelevant.** `guides-page-diagnostic.ts:8` admits only `caseIndex 3 + initial-detail` or `1 + transport-detail`, and case 4 never calls `attachGuidesPageDiagnostic`. Extending it would be new scope, not a fix. |
| "Raise the public-parity `expect.timeout` above the 15s read bound" | **Wrong direction, and the 15000 is in product code, not the harness.** `publicProfileGatewayClient.ts:78` gives people/games 15_000. The precedent set earlier today (`4ff5cca9`) is to keep the client bound *below* the harness budget — its own test says so at `publicProfileGatewayClient.test.ts:121-127`. So **lower the client bound**, and one literal fixes three lanes. |

**What actually remains unrecorded** is a single fact: whether the fetch signal was aborted **at the moment of failure**. `guides-owner-read-oracle.ts:46` samples `aborted.call(record.signal)` inside `observer.read(queries)`, which runs only from `reads()` (`:88`). At latch time (`:78`, inside `attempt.work`'s catch) no attempt has a `proof`, so `latch` (`:69`) necessarily computes `groups:0, unqualified:0`. `guides-fixture-host.test.ts:325` pins exactly that asymmetry — first latch `groups:0`, guard latch `groups:1`. That is the discriminator between "the app abandoned the fetch" and "the signal aborted later", and it is the whole reason case 4's cause is still unknown after ~14 runs.

## What is NOT in scope, and why

- **`guides.spec.ts` is not edited.** Its bytes are sealed by `guides-native-diagnostic.test.ts`: the `fingerprint()` census at `:1` requires `passive.size===6`, `primaries.size===1`, `producerStages.size===18`, `guards.size===8` and every guard's catch to read exactly `harness.captureFailure(error);throw error;`; `:6-7` pin four per-function SHA-256s; **`:204` and `:238` pin whole-file digests**; `:27-31` requires exactly 14 `*OwnerListOperation` calls; `:32-38` exactly 22 `*TraversalOperation` calls. Adding even one marked phase breaks several at once. Nothing in this plan needs it.
- **Running the guides lane.** It is `--lane`-selectable (`replatform-e2e.mjs:88`) but has **no npm script** (`:814` pins the ten that exist; guides is absent) and is **win32-only** (`guides-browser-fixture.ts:33`, `guides-fixture-host.ts:49`, `guides-launcher.ts:9`). It also requires Node **exactly** `24.21.0` (`:805`) — **this host runs 24.14.0, so the lane cannot be executed here.** See Task C.
- **Committing the first guides receipt.** Blocked on the same environment. Task C records it as a handoff, not work.

---

### Task 1: Baselines

- [ ] **Step 1** `cd explorers-earth && npm run --silent test:unit 2>&1 | tail -4` — record `Test Files` / `Tests`.
- [ ] **Step 2** `node --test "scripts/*.test.mjs" "scripts/*.test.cjs" 2>&1 | tail -6` — record pass/fail. Compare later against *this*, not a remembered number.
- [ ] **Step 3** `cd tunes && npx vitest run server/test/contracts/guides-fixture-host.test.ts server/test/contracts/guides-failure-diagnostic.test.ts 2>&1 | grep -E "^ *Tests "` — record.
- [ ] **Step 4** Confirm the investigation's anchors still match:
```bash
sed -n '16,20p;46,47p;69p;78p;88p' explorers-earth/e2e/replatform/guides-owner-read-oracle.ts
sed -n '736,737p;745p' scripts/replatform-e2e.mjs
sed -n '78p' explorers-earth/src/features/PublicHome/api/publicProfileGatewayClient.ts
```
If any differs materially, STOP and re-derive.

---

### Task A: record whether the signal was aborted at failure time

**Files:** `explorers-earth/e2e/replatform/guides-owner-read-oracle.ts`, `scripts/replatform-e2e.mjs`, `scripts/guides-root-diagnostic.test.mjs`

**Byte budget is fine:** a realistic case-4 capsule with a `guard` measures 604 B against the 1024 B marker cap (`guides-browser-fixture.ts:28`, `replatform-e2e.mjs:741`) and 701 B against the 4096 B command cap (`guides-harness-client.ts:390`) — ~420 B headroom. One boolean-or-null field is comfortably inside it. **Verify this in Step 5 rather than trusting it.**

- [ ] **Step 1: Write the failing test first, in the decoder's own suite**

`scripts/guides-root-diagnostic.test.mjs:194-208` holds literal `readOracle` fixtures and — importantly — a negative case at `:197` asserting `{...readOracle, private:true}` decodes to `undefined`, i.e. **extra keys are rejected**. Add a case asserting a capsule carrying `abortedAtFailure` decodes successfully, and keep `:197`'s rejection intact.

- [ ] **Step 2: Run it; it must fail because the key is rejected**
```bash
node --test scripts/guides-root-diagnostic.test.mjs
```
Expected: the new case fails. If it passes, the key set is not what this plan assumes — STOP.

- [ ] **Step 3: Sample the signal at failure time**

In `guides-owner-read-oracle.ts`:
- The in-page observer already retains the signal in `records` (`:56`), and `:44-47` already reads it. Add a sampler that returns a bounded value for one `{url, ordinal}` — `true | false | null`, never a signal object.
- In `started()`'s `attempt.work` catch (`:78`), **before** `latch(...)`, sample that attempt's signal and carry the result into the latch. Wrap the sampling so an instrumentation failure cannot replace the business error — the file's existing convention (`:94`'s `catch{/* Passive classification preserves the original failure. */}`) is the pattern to copy.
- Extend the `GuidesReadOracle` type (`:16`) and `validateGuidesReadOracle` (`:19`) with **one additive optional field**, `abortedAtFailure`, legal only when `check.startsWith('read-')`.

**Do not** change the existing `counts` semantics. `guides-fixture-host.test.ts:325` pins `groups:0` on the first latch and `groups:1` on the guard latch; that asymmetry is the current contract and this field explains it rather than replacing it.

- [ ] **Step 4: Mirror the decoder, preserving field ORDER**

`scripts/replatform-e2e.mjs:736-737` duplicates the key-set strings independently, and `:745` round-trips via `JSON.stringify(capsule)===match[1]`. **Field insertion order therefore matters** — a correct key set in the wrong order still fails the round-trip. Update `:736-737` and whatever constructs the capsule at `:745` so the serialised order matches the producer exactly.

- [ ] **Step 5: Verify, including the byte budget**
```bash
node --test scripts/guides-root-diagnostic.test.mjs
cd tunes && npx vitest run server/test/contracts/guides-fixture-host.test.ts server/test/contracts/guides-failure-diagnostic.test.ts
```
Expected: all pass. `guides-fixture-host.test.ts:325` uses `toMatchObject`, so an additive field passes unchanged — if it *fails*, the field was not additive.

Then measure the real marker length for a capsule including `abortedAtFailure` and assert it is under 1024 B. Do not assert "~604 B" from this document; compute it.

- [ ] **Step 6: Commit** — message must state that the pipeline already existed, that only the failure-time signal state was missing, why `guides.spec.ts` was not touched, and the measured marker size.

---

### Task B: lower the people/games client bound below the harness budget

**File:** `explorers-earth/src/features/PublicHome/api/publicProfileGatewayClient.ts`, plus one test tripwire.

**The collision:** `:78` is `setTimeout(() => deadline.abort(), bounded ? 12_000 : 15_000)`. The `15_000` branch serves `people` (regex at `:70`) and `games` (`gamesUsername !== undefined`), and **every** lane driving those reads sets `expect: { timeout: 15000 }, retries: 0` — so a genuinely abandoned read and a harness timeout are indistinguishable. This is the recorded cause of public-parity case 10's intermittency.

**One literal fixes three lanes:** public-parity (32 identities), people (12), games (20).

- [ ] **Step 1: Update the tripwire deliberately, and say so**

`explorers-earth/src/features/PublicHome/api/__tests__/publicPeopleTransport.test.ts:41` asserts `timers.mock.calls.find(([,delay]) => delay === 15_000)`, with a comment at `:36` reading *"keep asserting 15000 so people/games are not silently retimed."*

That tripwire was added earlier today, in `4ff5cca9`, precisely to catch this edit. Changing it is correct **only** as a deliberate, explained retiming — update the literal to `12_000` and rewrite the comment to say the bound now sits below the 15000 harness budget for the same reason the shell's does.

- [ ] **Step 2: Change the bound**
```ts
const expiry = deadline ? setTimeout(() => deadline.abort(), 12_000) : undefined;
```
Both branches are now 12_000, so the ternary collapses. Replace the `bounded ? 12_000 : 15_000` comment block with one sentence recording that every bounded read sits below the lanes' 15000 expect budget.

- [ ] **Step 3: Verify the unit suites, including the case-11 abort path**
```bash
cd explorers-earth && node scripts/run-contained-vitest.cjs run src/features/PublicHome/api
```
Expected: all pass. Specifically check nothing regressed in the `route.abort('failed')`-style paths — `public-parity.spec.ts:272-275` deliberately aborts a category read and asserts the overlay clears; a *shorter* deadline should be harmless, but the interaction is untested, so read `readPeopleResponse`/`gameBounded`'s error mapping before concluding.

- [ ] **Step 4: Confirm no other pin asserts 15000 for these reads**
```bash
grep -rn "15_000\|15000" explorers-earth/src/features/PublicHome/api explorers-earth/src/__tests__ | grep -v node_modules
```
Known literal pins on **guides** config text (`PublicGuideDetailPage.native-traversal.test.tsx:114`, `guides-native-diagnostic.test.ts:247`) are **out of scope** — they pin `guides.playwright.config.ts` and `nativeGuideContinuation`, not this client. Confirm nothing else in the client's own suites pins 15000.

- [ ] **Step 5: Commit** separately from Task A — different file, different risk, and the retiming deserves its own reviewable commit.

---

### Task C: handoff — the first guides receipt cannot be produced here

Not work; a recorded blocker.

`docs/replatform-audit/receipts/` holds **80 committed receipt directories** (public-parity, people, apps, books, places, place-links, movies, games, music, lifecycle) and **zero for guides**. The cause is operational: `replatform-e2e.mjs:90` requires `--receipt` to be a **fresh, non-existent** directory directly under the real `tmpdir()`, so every run lands in a throwaway dir and nobody has copied one in.

To produce one, on a machine satisfying **all** of: Windows, Node **exactly 24.21.0**, Docker for the disposable PG15, PowerShell via `GUIDES_POWERSHELL_EXECUTABLE`, a clean tree (`guides-browser-fixture.ts:111` refuses `provenance.dirty`), and **no** `GUIDES_*_E2E_*` variables set (`:84`):

```
npm run platform:test:e2e -- --milestone delivered-auth-profile-books \
  --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15 \
  --receipt "$env:TEMP\replatform-e2e-<token>" --lane guides
```

Then copy the resulting `qualification.json` into `docs/replatform-audit/receipts/<guides-…>/`, **after** checking redaction: `replatform-e2e.mjs:834` redacts for non-guides lanes, and `guides-fixture-host.test.ts:327` asserts the formatter emits no `PRIVATE|53001|53003` — but confirm the committed artifact carries no local origins before adding it.

**Also worth recording:** neither `guides` nor `public-parity` has any CI job. The only `--lane` invocation in any workflow is `frontend-e2e-qualification.yml:219` (`--lane apps`, ubuntu), and the repo's only `windows-latest` runner (`music-c0-contracts.yml:53`) runs unit contracts only. So guides cannot run in CI at all until a Windows lane job exists — a separate decision, since Windows minutes bill at 2×.

---

### Task 2: Whole-plan verification

- [ ] `cd explorers-earth && npm run --silent test:unit` — no new failures vs Task 1 Step 1; count rises only by tests added.
- [ ] `cd explorers-earth && npx eslint .` — 0 errors.
- [ ] `cd explorers-earth && npx tsc --noEmit -p tsconfig.app.json` — clean (`tsconfig.json` checks nothing here).
- [ ] `node --test "scripts/*.test.mjs" "scripts/*.test.cjs"` — identical counts to Task 1 Step 2.
- [ ] `cd tunes && npx vitest run server/test/contracts` — no new failures; the known baseline on this host is 2 packaged-desktop-app ancestry failures in `music-local-state.test.ts`.
- [ ] `git ls-files --eol` each touched file and preserve its own convention; stage with `git -c core.autocrlf=input add`, then confirm with `git -c core.autocrlf=input diff --cached --numstat`.

## Risks

| Risk | Mitigation |
|---|---|
| The `JSON.stringify` round-trip at `replatform-e2e.mjs:745` fails on field order | Step 4 names it explicitly; Step 5's decoder test is the gate |
| The new field breaks the extra-key rejection at `guides-root-diagnostic.test.mjs:197` | Step 1 keeps that negative case; it must still pass |
| Instrumentation throws and replaces the business error | Sampling is wrapped, copying the convention at `guides-owner-read-oracle.ts:94` |
| Lowering people/games to 12s breaks an untested abort path | Step 3 reads the error mapping first and runs the full api suite |
| Retiming looks like laundering a flake | It is the opposite: the bound moves *below* the assertion budget so a product failure becomes attributable. Task B's commit must say this, and the tripwire update must be explicit |
| Task A cannot be validated end to end here | True — the lane needs Node 24.21.0 on Windows. The decoder, oracle and host-contract suites all run here and cover the shape; the lane run is Task C's handoff |
