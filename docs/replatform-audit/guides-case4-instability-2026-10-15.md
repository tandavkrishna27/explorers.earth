# Guides case 4: an unstable case, not a single defect

Closed 2026-10-15 at `3b046d6b`. Roughly 14 protected Guides runs were spent on this.
The conclusion is that case 4 relocates its failure nearly every run, so it should be
treated as known-unstable and split, not chased further one failure at a time.

`GUIDES_CASES[4]` runs five phases in one zero-retry case: owner list, owner detail,
owner reload, public detail, public category, public filters. Any phase's timing
sensitivity fails the whole case.

## Failure points observed, all at effectively identical source

| Phase | Signature |
|---|---|
| `owner-list` / `category-reads` | read-body, `attempts 11, responses 9, finished 8, nativeFailed 2`, guard `supersession-signal` |
| `owner-detail` | read-body, `attempts 3, responses 3, finished 2, nativeFailed 1` |
| `owner-list` / `section-reads` | `toHaveLength(3)` saw 2 pages, afters `[null,"19"]` |
| `public-category-ui` | `toHaveLength(5)` saw 6 pages, cursors `[null,null,o12,o24,o36,o48]` — **deterministic, fixed at `4f7c653b`** |
| `public-filters` | `kind: unknown`, no coordinates, no readOracle capsule |

Also observed: `section-reads` failed, then passed (3 pages, correct cursors, three
times), then failed again.

## Eliminated by measurement or constant — do not revisit

- **Transport / fixture gateway.** Failing reads carry `net::ERR_ABORTED`; the gateway
  stamps `firstBoundary='gateway-forward'` on any upstream error, RST or destroy, and
  capsules always said `harness-command`. Port exhaustion is excluded for the same
  reason. The parity proxy's hop-by-hop/`agent:false` defects are real but unrelated.
- **Server pagination.** `readGuideSectionPage` selects `LIMIT limit+1` and returns
  `nextCursor = rows.length>limit ? lastDisplayOrder : null`. For 53 sections at limit
  20 that is deterministically 19, 39, null.
- **Fixture seeding.** All 53 sections are inserted in one transaction with an explicit
  `COMMIT`, so a reader sees 0 or 53, never a partial count.
- **Client caching.** Zero `useQuery` / `QueryClient` / `persist(` in
  `src/features/Guides/**`; `useGuidesOwner` clears prior state each effect run and its
  scope key includes `location.pathname`.
- **Document teardown / navigation.** At abort: `frameDetached: false`, frame is main,
  and the main-frame nav counter is IDENTICAL at request start and at abort, with the
  last navigation same-document. The read is issued and abandoned inside a live document
  ~4-28ms after starting.
- **Byte budgets.** `JOINT_PAGE_BYTES` 4MB, `JOINT_TOTAL_BYTES` 64MB, `JOINT_REQUESTS`
  1000, against a fan-out of a few hundred KB over ~18 requests.
- **Snapshot expiry.** `expires: now+600000` (10 minutes); the case runs in seconds.
- **`completeCategory` abandonment — NOT eliminated in general.** One run with the
  fail-code probe recorded `error: null, consoleLines: []` for the owner-list phase, so
  neither the 401 branch nor the validation path fired IN THAT RUN. But that run passed
  the owner-list phase, so it did not reproduce the category-reads failure. The 2-native-
  failure signature at `category-reads` therefore remains UNEXPLAINED; the probe simply
  did not catch it.

## The oracle semantics that matter here

`reads()` buckets attempts by AbortSignal identity, and `ownerRead` creates one
controller per call, so **every group is a singleton**. When a group has a failed member
and the supersession conditions hold, the code marks the whole group `native-aborted`
and `continue`s **without throwing** - so the read silently vanishes from the count.

This is why `69b78c65` (abort the owning controller on every exit) was reverted at
`3b046d6b`: by making the signal always aborted it made that precondition universally
satisfiable, converting loud refusals into silent count shortfalls.

Narrowing the oracle to require a group size above one is NOT available:
`guidesOwnerReadOracle.test.tsx:56` legitimately expects a singleton `native-aborted`
group from a real StrictMode supersession (4 attempts, 1 native-aborted, qualified
`[20,20,13]`). The correct discriminator would be temporal - whether the signal was
aborted at the moment of failure rather than after it - which the witness shape
(`aborted,found,group`) does not record and cannot without extending it across its two
validators, two runner decoders and four contract tests.

## Recommendation

Split case 4 so each phase fails independently, or accept it as known-unstable and
exclude it from the zero-retry integrated run until split. One underlying app issue is
filed separately: reads abandoned natively while their controller stays un-aborted,
which makes the cancellation unattributable to every consumer of controller state.
