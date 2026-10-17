# Books owner render isolation repair

Status: exact two-file scoped repair ready for independent review. No commit/push, runtime/PG/browser access or historical UAT cause claim. Controller composes with original adapter writer separately.

## Diagnosis and reviewed boundary

Prior useBooksOwnerContent stored untagged complete account content and cleared it only in passive effect. Generation/account replacement renders before that cleanup, exposing previous private content/data to the new account layout frame. An obsolete saved refetch could also increment sequence, abort current B work and start an A-closure request. Independent review and plan PASS are task4.2-owner-acquisition-fresh-independent-review.md and task4.2-owner-repair-plans-independent-review.md; owned plan task4.2-books-owner-render-isolation-plan.md.

## Exact change

Only explorers-earth/src/features/Books/api/useBooksOwnerContent.ts and new api/__tests__/useBooksOwnerContent.test.tsx changed. Complete received content and request loading/error status carry captured [generation,accountId] scope. Render synchronously filters mismatched content/data/status, so pending B cannot expose A content, stale error or completed loading. Signed-out scope presents no content/error and loadingfalse, starts no unauthorized owner acquisition.

The callback checks actual auth store authority and mounted custody before sequence increment or abort; saved obsolete refetch cannot cancel B. Success/error/finally require original sequence, nonaborted controller, mounted state and actual generation/account. Cleanup preserves sequence increment and abort; noncooperative settlement remains ignored, not considered native settlement. Current-account explicit refresh keeps complete content while pending and preserves real current failure. listId remains a current selector over complete account lists, not fabricated response authority or a new acquisition scope. No adapter/shared/public UI changes or automatic retry.

## Meaningful evidence

Supported Node24.21 and protected contained Vitest runner in physically owned clean UI source C:/Users/TK/AppData/Local/Temp/games-ui-536981fced1b46958c5a6992a139ad8a/source; fresh frontend npm ci installation/provenance retained from prior finite UI facility. New scope copied as exact two raw overlays, no unfrozen disjoint adapter source copied. Evidence root is parent directory. This is scoped hook/consumer qualification, not combined final source/C0/build/UAT acceptance.

- books-render-red.json:1file6PASS/3FAIL on original hook before minimal implementation. Actual layout-effect sample catches A content in B pre-passive frame; signed-out exposure and stale saved-callback cancellation also fail. No post-act-only security assertion.
- books-render-green.json:1file9PASS/0FAIL/0SKIP. Cases cover layout A-to-B, sign-out, A-to-B-to-A generations, late success, late error/finally, saved callback, same-account refresh/error, current list selection and unmount late settlement.
- books-render-scoped.json:7files35PASS/0FAIL/0SKIP including hook, Books navigation/list commands and existing dashboard owner tests. Existing adapter suites are outside this writer's concurrent ownership, not claimed as final composition.
- books-render-types.log: supported tsc -b exit0. books-render-lint.log: exact2 ESLint exit0,0errors/1 existing cleanup-ref warning; no suppression. Scoped diffcheck and new test trailing-whitespace/strictUTF8 checks pass.

No whole frontend or fresh build launched under controller's scoped-tests/types-only restriction. Independent review and composed broad validation after adapter freeze remain required.

## Frozen source

Manifest task4.2-books-owner-render-isolation-hashes.json raw SHA256 **69b74875cf5f2e076fff50d0d51dfb8d3d1c2cfa29152dc8a99d0714ddbd81a6**. Exact primary/private raw pairs:

- hook d7035704a828055bc4438d489d3eccedc7b7eb0b5d804eb03f7fea481b5051b1
- newtest e4cec9c08ea564f7fc4e56644774424c1eba9bc146f78cf68de19b87990edec0

## Separate historical unknowns

Books original20 diagnostic18PASS/2FAIL retains desktop/mobile Load more120s pointer interception/disabled/detached outcome, unresolved original cover cause and source restore/cleanup. The shared observer click-scroll competition is plausible but successful continuation was not proved. This repair establishes hook render isolation only; no absent-row, cover, continuation, Games publication or transport/rate-limit cause inferred. No quotas/assertions/security gates changed.
