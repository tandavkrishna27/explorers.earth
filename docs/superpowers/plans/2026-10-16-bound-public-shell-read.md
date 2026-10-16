# Bound the public shell read, and make Retry heal every reader

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Two defects in the public profile surface. (1) The shell read has no deadline, so a hung fetch leaves the cold-entry overlay up until the tab regains focus. (2) A Retry heals only the component that owns it, leaving the identity that drives the overlay, validator, guard and theme stuck in `terminal-error`.

**Architecture:** Two independent single-file changes. No new UI, no new dependency, no component edits.

**Tech Stack:** React, TypeScript, Vitest.

---

## REVISION 2 — what the first draft got wrong

An adversarial review refuted this plan's central premise and two of its three tasks. Recorded here so the errors are not repeated:

| Draft claim | Reality |
|---|---|
| "All 20 public surfaces already render `PublicRouteErrorState` with `onRetry`, merely unreachable — widen `allowsInlineRecovery`" | **False.** `TabVisibilityGuard.tsx:60-62` returns `<UsernameRootRedirect />` whenever `error && tabField !== "public_profile"`, and it wraps every public route (49 uses in `PublicRoutes.tsx`). `music` uses `PublicMusicVisibilityBoundary` instead. So `routeSegment === "music"` is an **exact match for the one route whose guard tolerates an identity error**, not an oversight. Widening would reach one new surface, the profile root — and the other 19 would still bounce. **Task dropped.** |
| "An invalid handle yields `PUBLIC_PROFILE_404`, so the exclusion covers it" | **False.** The username schema rejects `!`, so the route answers **400** → client throws `PUBLIC_PROFILE_400`. `PROFILE_UNAVAILABLE` is also synthesised for a non-matching account. Widening would offer a Retry that can never succeed on a malformed handle, and would break `UsernameValidator.test.tsx:183` and `:193-207`, which guarantee that missing profiles and invalid paths 404. **Task dropped.** |
| "Bound every read at 15000ms" | **Too aggressive.** It would set the client deadline equal to the harness `expect` budget (15000, `retries: 0`) across ~25 read paths in every replatform lane — the exact collision the draft declared out of scope. **Scope reduced to the shell, at 10000ms.** |
| "Use `AbortSignal.any`" | **Unsafe here.** `.any` needs Chrome 116 / Safari 17.4; there is no `browserslist` and esbuild cannot polyfill a runtime API. Today a Safari 17.0 visitor loses only People and Games; on the shell path it would hard-error **every** public profile. **Use `AbortController` + `setTimeout`.** |
| "Permanently dead page" | **Overstated.** `PublicMusicAvailabilityProvider.tsx:176` registers `refresh` on `window` `"online"` and `"focus"`, so a tab switch retries. The accurate claim is "dead until the window regains focus". |
| Test sketch calling `createPublicProfileGatewayClient({ origin, fetchImpl })` | **Unexecutable.** The real factory is positional: `createPublicProfileGatewayClient(baseUrl: string, fetchImpl = fetch)` (`:63`). The object form throws `TypeError` identically before and after the fix, so the TDD gate would have passed for the wrong reason. |

---

## Part 1 — the defect, verified link by link

`publicProfileGatewayClient.ts:71`:
```ts
const boundedSignal=gamesUsername===undefined&&!people?undefined:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(15000)]);
```
`people` is `/\/recommendations\/people(?:\/|\?|$)/` (`:70`). `shell()` calls `request("/api/explorers/v1/profiles/<username>", signal, bypassCache)` (`:115-117`) — three args, so `gamesUsername === undefined` and `people === false`. The predicate yields `undefined`; `:89` then does `boundedSignal ? await gameBounded(...) : await fetching` — **a plain await with no deadline.**

Then: a hung read keeps `identity.status === "loading"` (`PublicMusicAvailabilityProvider.tsx:103`), `validation` stays at its initial `"pending"` (`publicShellReadiness.ts:27`; note `PublicColdEntryBoundary.tsx:79` makes `reportValidation("pending")` a no-op, so the overlay persists by default rather than by report), and `shouldShowColdEntryOverlay = validation !== "terminal-invalid" && !shellRevealed` stays true.

Nothing else terminates it: no `Suspense` in `PublicRoutes.tsx`, no global fetch wrapper, no `proxy_read_timeout` in any `nginx*.conf`, and no e2e fixture exercises a hung shell read (`public-parity.spec.ts:272` uses `route.abort('failed')`, which rejects at once). **The unit test added below is the only possible proof.**

## The trap this part exists to avoid

Lines 71 and 72 share one predicate, and `:102` gates `cache.set` on it too:
```ts
const boundedSignal = gamesUsername===undefined&&!people ? undefined : AbortSignal.any([...]);
const cached        = gamesUsername===undefined&&!people ? cache.get(url) : undefined;
```
Plain reads are *unbounded AND cached*; people/games reads are *bounded AND uncached*. **Changing that predicate to bound the shell would silently disable the shell's ETag cache** — a regression on the most-requested read in the product. The deadline must become an independent, opt-in concern.

---

### Task 1: Baselines (all three, before any edit)

- [ ] **Step 1: Frontend lane**
```bash
cd explorers-earth && npm run --silent test:unit 2>&1 | tail -4
```
Record the exact `Test Files` / `Tests` lines.

- [ ] **Step 2: Root seals — record, do not assume**
```bash
node --test "scripts/*.test.mjs" "scripts/*.test.cjs" 2>&1 | tail -6
```
Record pass/fail counts. Later steps compare against *this*, not against a remembered number.

- [ ] **Step 3: Confirm the quoted source still matches**
```bash
cd explorers-earth && sed -n '63p;70,72p;115,117p' src/features/PublicHome/api/publicProfileGatewayClient.ts
cd explorers-earth && sed -n '24,31p' src/features/PublicHome/api/usePublicProfileShell.ts
```
If either differs from this plan's quotes, STOP and re-derive.

---

### Task 2: Bound the shell read only

- [ ] **Step 1: Write the failing test**

Append to `src/features/PublicHome/api/__tests__/publicProfileGatewayClient.test.ts`. Check the file's existing `afterEach`/`vi.restoreAllMocks` first and drop `mockRestore` if it is redundant.

```ts
const promptly = <T,>(work: Promise<T>) =>
  Promise.race([work, new Promise<string>(resolve => setTimeout(() => resolve("still pending"), 30))]);

it("bounds a hung shell read instead of waiting forever", async () => {
  const deadline = new AbortController();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));          // never settles
  const client = createPublicProfileGatewayClient("https://public.example", fetchImpl);
  const outcome = client.shell("someone").then(() => "accepted", (error: Error) => error.message);
  await Promise.resolve(); await Promise.resolve();
  deadline.abort();
  expect(await promptly(outcome)).toBe("PUBLIC_PROFILE_ABORTED");
  expect(timeout).toHaveBeenCalledWith(10_000);
  timeout.mockRestore();
});
```
Real-timer, spy-driven — deliberately **not** `useFakeTimers`, because jsdom routes `AbortSignal.timeout` through `globalObject.setTimeout` and no suite here combines the two. `PUBLIC_PROFILE_ABORTED` is the string `gameBounded` throws (`:9-10`).

- [ ] **Step 2: Run it — it must fail for the RIGHT reason**
```bash
cd explorers-earth && node scripts/run-contained-vitest.cjs run src/features/PublicHome/api/__tests__/publicProfileGatewayClient.test.ts
```
Expected: this test fails with received `"still pending"`, and `timeout` never called. If it fails with a `TypeError`, the factory call is wrong — fix the test, not the source.

- [ ] **Step 3: Apply the fix**

Add an opt-in parameter and an independent deadline. Do **not** use `AbortSignal.any` (see Revision 2).

`:68` signature becomes:
```ts
  const request = async (path: string, signal?: AbortSignal, bypassCache = false, gamesUsername?:string, bounded = false): Promise<unknown> => {
```
Replace `:71` with:
```ts
    // Deliberately independent of the cache predicate on the next line. Both used to be
    // the same expression, so bounding a read also made it uncached - and the shell is the
    // most requested read in the product. `bounded` is opt-in per call site instead.
    // AbortController + setTimeout rather than AbortSignal.any: `.any` needs Safari 17.4,
    // there is no browserslist, and esbuild cannot polyfill a runtime API - on the shell
    // path that would hard-error every public profile for an older Safari, where today
    // only People and Games fail.
    const deadline = gamesUsername === undefined && !people && !bounded ? undefined : new AbortController();
    const expiry = deadline ? setTimeout(() => deadline.abort(), bounded ? 10_000 : 15_000) : undefined;
    if (deadline) {
      if (signal?.aborted) deadline.abort();
      else signal?.addEventListener("abort", () => deadline.abort(), { once: true });
    }
    const boundedSignal = deadline?.signal;
```
Leave `:72` (`const cached = ...`) byte-identical. Clear `expiry` in the existing `finally`/exit path if one exists; if not, add `clearTimeout(expiry)` where the response settles, so the unit lane does not accumulate pending timers across 390 files.

`:116` becomes:
```ts
      return request(`/api/explorers/v1/profiles/${encodeURIComponent(username)}`, signal, bypassCache, undefined, true);
```

**10_000, not 15_000, and that is deliberate:** the replatform lanes set `expect: { timeout: 15000 }, retries: 0`, so a client deadline *equal* to the harness budget makes a product failure indistinguishable from a harness timeout. 10s fails first and reports as a product error.

- [ ] **Step 4: Run the gateway suite — expect exactly one unrelated failure**
```bash
cd explorers-earth && node scripts/run-contained-vitest.cjs run src/features/PublicHome/api
```
Expected: the new test passes, and **one** pre-existing test fails — `publicProfileGatewayClient.test.ts`'s "loads the public shell without an authorization header", which pins `signal: undefined` for the shell. That is the fix working. Change that assertion's `signal: undefined` to `signal: expect.any(AbortSignal)` and re-run.

**Any failure of a *cache* assertion means the decoupling was done wrong — revisit Step 3.**

---

### Task 3: Make Retry heal every reader

**The defect:** each public component calls its own `usePublicProfileShell(username)` — `PublicBooks.tsx:31`, `PublicPeople.tsx:31`, `PublicProfile.tsx:117` and 10 more route their Retry through `settlePublicRouteRetries` (`PublicRouteContentState.tsx:23`). The identity that drives the overlay, `UsernameValidator`, `TabVisibilityGuard` and the theme comes from a **different** instance inside `PublicMusicAvailabilityProvider.tsx:95`, and the context exposes only `{usernameKey, status, account?, error?}` — no refresh. So a successful Retry heals the child and leaves `identity.status === "terminal-error"`: no canonical-username redirect, no theme, music still unavailable.

**Why not the invalidation channel:** `publicProfileInvalidation` is a cross-tab **owner-mutation** bus with typed categories and actions and a 200-entry seen ledger, published by owner commands (`placesCommands.ts`, `useBooksNavigation.ts`). A public reader's Retry is not an owner mutation; reusing it would broadcast across tabs and pollute that ledger.

**The fix:** a module-scoped, local-only `EventTarget` in `usePublicProfileShell`, matching the house pattern at `useAppsOwner.ts:9`. One file; no component changes.

- [ ] **Step 1: Write the failing test**

In `src/features/PublicHome/api/__tests__/`, render two `usePublicProfileShell("same-user")` instances, fail the first fetch for both, call `refetch` on instance A only, and assert **both** instances re-request and recover. Then assert an instance for a *different* username does not re-request.

- [ ] **Step 2: Run it — expect only instance A to recover**

- [ ] **Step 3: Implement**

At module scope:
```ts
// Local-only sibling channel. Every public surface mounts its own usePublicProfileShell,
// but the identity that drives the cold-entry overlay, UsernameValidator, TabVisibilityGuard
// and the theme lives in a different instance (PublicMusicAvailabilityProvider). Without
// this, a user-triggered Retry healed the child and left that identity terminal.
// Deliberately NOT publicProfileInvalidation: that is a cross-tab owner-mutation bus.
const shellRetries = new EventTarget();
```
`refetch` dispatches a username-scoped event after bumping `attempt`; a new effect subscribes and calls the local refetch when the username matches **and the event did not originate from this instance** (guard with a ref, or compare a dispatch id) so two instances cannot ping-pong.

- [ ] **Step 4: Verify both tests pass, and no ping-pong**

Assert the fetch count per instance is exactly one additional request, not unbounded.

---

### Task 4: Verify

- [ ] **Step 1:** `cd explorers-earth && npm run --silent test:unit` — no NEW failures vs Task 1 Step 1; count rises only by tests added. **The diff to `UsernameValidator.test.tsx` must be empty** (this revision touches no validator behaviour).
- [ ] **Step 2:** `cd explorers-earth && npx eslint .` — 0 errors.
- [ ] **Step 3:** `cd explorers-earth && npx tsc --noEmit -p tsconfig.app.json` — clean. (`tsconfig.json` checks nothing here; `noUnusedLocals` is on, so remove any now-unused local.)
- [ ] **Step 4:** `node --test "scripts/*.test.mjs" "scripts/*.test.cjs"` — identical counts to Task 1 Step 2, no newly failing file.
- [ ] **Step 5:** `git ls-files --eol` the touched files; both are `i/lf w/crlf`, so insert new lines with CRLF to keep the worktree copy uniform, and stage with `git -c core.autocrlf=input add`. Then confirm the true change with `git -c core.autocrlf=input diff --cached --numstat`.
- [ ] **Step 6: Commit.** The message must record: the verified defect chain; that the overlay persists from the initial `"pending"` rather than from a report; that the hang is survivable via window focus (so "permanently dead" is wrong); that lines 71/72 shared a predicate and were decoupled to preserve the cache; why 10s not 15s; why `AbortController` not `AbortSignal.any`; why the invalidation bus was not reused; and that the `allowsInlineRecovery` widening was investigated and **rejected** because `TabVisibilityGuard` — not the validator — is what blocks the other 19 surfaces.

---

## Out of scope

- **Widening `allowsInlineRecovery`.** Rejected with evidence; see Revision 2. Making Retry reachable on the other 19 surfaces means changing `TabVisibilityGuard.tsx:60-62`'s redirect-on-error, which is a product decision about whether a category tab with a failed identity should offer recovery or bounce to the profile root.
- **Any automatic retry.** The owner chose a user-triggered Retry, so nothing in the automated path changes and the harness's zero-retry rule is untouched.
- public-parity case 10 (depends on the people read's 15s abort) and Guides case 4.

## Risks

| Risk | Mitigation |
|---|---|
| Disabling the shell cache | Step 3 changes `:71` only; Step 4 fails loudly on any cache assertion |
| 10s too tight for a real shell read | The shell returns one account document; `limit` caps payloads at 24 items and this read has none. Existing people/games reads already ship a 15s bound |
| Leaked pending timers across the 390-file lane | `clearTimeout(expiry)` on settle, asserted by the gateway suite running green |
| Retry ping-pong between instances | Step 3 guards on event origin; Step 4 asserts exactly one additional request per instance |
| New test files block the e2e lanes | `snapshotSource` refuses untracked files under `explorers-earth/src`; commit before any lane run |
