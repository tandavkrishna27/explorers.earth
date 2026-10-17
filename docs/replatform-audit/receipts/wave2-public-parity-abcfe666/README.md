# Public parity 32 qualification

The protected local lane passed all 32 identities on clean
`abcfe666b0a05ac474e1535143906c1e132c1c0c` (`dirty: false`), with zero errors,
zero retries, zero skips, cleanup passed, child exit 0 and no signal. Both
projects ran (`public-parity-desktop`, `public-parity-mobile`), Playwright
1.61.1, trace/video/screenshot all off, owned authority.

Source contained **no** diagnostic probes. An earlier 32/32 pass at `c0dee6ff`
was produced with a retained throwaway probe in source and is deliberately not
recorded here.

`qualification-summary.json` is an explicitly derived, sanitized summary. The
original qualification and lane receipt are hashed into it and were not copied.

## Intermittency - read before trusting this as stable

This lane is **not** deterministic at this commit. The run immediately preceding
this one, at the same commit with byte-identical source, FAILED at
`public-parity-mobile` case index 27 ("invalid handles and terminal API failures
release the cold entry overlay") after 27 completed epochs. A pass, a fail and a
pass have all been observed on this source.

Case index 10 is independently known-intermittent across commits: FAILED at
`407bb001`, PASSED at `d0194a7e` and `f1efcd1f`, then FAILED and PASSED at
`de6b7a32`.

Diagnosed shared mechanism (not yet repaired):

- `PublicColdEntryBoundary` hides the shell behind `visibility: hidden` until a
  readiness triple settles. Any single failed read flips identity to
  `terminal-error`, renders `NotFound` and clears the overlay, so an awaited
  title never appears.
- Nothing on that path retries: `usePublicProfileShell` makes one attempt and
  commits the error.
- The browser aborts reads at exactly 15000ms and the Playwright `expect` budget
  is also exactly 15000ms, so there is no slack.

`abcfe666` pre-warms case 10 specifically, which buys margin for that one case.
It does not address the shared bound, and case 27 demonstrates the fragility is
not confined to case 10.

Consequence for Wave 2: the integrated 14-lane / 214-identity run is zero-retry,
so it must clear every intermittent case in a single execution. This receipt
shows the deterministic defects are fixed; it does not predict that run.

## Deterministic defects repaired to reach this pass

- `311a0ddf` - case 12 playback assertion was unsatisfiable for a single-frame
  asset (`play()` always rejects `AbortError`; reproduced 6/6).
- `55d4b023` - apps/places generic `recommendation_media` was seeded but is not
  publicly resolvable, so the first anonymous GET 404'd.
- `f1efcd1f` - case 12's links loop expected a private parent location to hide a
  linked child's media; the product and two other lanes assert the opposite.
- `429b2322` - case 13 required all eight category links; the nav is slot-limited
  to `MAX_NAV_SLOTS` (5).
- `29659358` - the canonical gateway emitted `pinned_nav_tabs` as category names
  while the nav addresses tabs by legacy `public_*` flag id, so every manual pin
  was silently dropped.
- `27c3a465` - case 13 pinned without leaving auto-pinning, which
  `categoryNavigationPolicy` blocks with `reason: 'manual-required'`.
- `1a8b212b` - case 13's nav precondition used a viewport-dependent locator and a
  desktop-shaped exact count.
