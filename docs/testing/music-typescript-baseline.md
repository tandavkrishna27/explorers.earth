# Music TypeScript baseline — pre-change

Captured before C0 implementation on 2026-08-13 using Node v24.14.0:

```text
npm run check --prefix tunes
```

The full normalized baseline is committed in
`docs/testing/music-typescript-baseline.txt`: **245 exact diagnostics in 26
files** (compiler exit 2). It is an existing regression baseline, not an
acceptance of new diagnostics. The normalizer joins continuation lines and
normalizes path separators, then the gate fails when the current diagnostic set
contains any entry absent from the baseline. Resolved diagnostics do not block.

Run `npm run music:types:baseline` for the normalized set-difference gate and
`npm run music:types:scoped` for a zero-diagnostic check over every C0 script,
contract test, and shared server environment module. Both run on Ubuntu and
Windows in `.github/workflows/music-c0-contracts.yml`. The behavioral test
injects a deliberate synthetic diagnostic and proves the comparator rejects it;
no deliberate source defect remains in the tree.
