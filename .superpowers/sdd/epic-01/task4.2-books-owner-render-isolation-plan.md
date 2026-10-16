# Books owner render isolation implementation plan

> For agentic workers: use superpowers:executing-plans for this single scoped task. Implementation must wait for controller plan review.

**Goal:** Never expose settled account A private Books content, data or stale status in an account B/sign-out render, including the layout-effect boundary before passive cleanup.

**Architecture:** Tag complete account content and loading/error status with the captured generation/account authority; synchronously filter returned state against current rendered auth authority. Preserve full account acquisition, current list filtering and the existing sequence/controller guards; additionally compare actual store authority before starting or completing an old refetch callback.

**Tech stack:** React hooks, Zustand auth store, TypeScript, Vitest/Testing Library, supported Node24.21 and protected contained runner.

**Spec:** task4.2-owner-acquisition-fresh-independent-review.md, P2 Books prior-owner render exposure. Separate historical browser failures remain unproved.

## Exact ownership

- Modify only explorers-earth/src/features/Books/api/useBooksOwnerContent.ts.
- Add explorers-earth/src/features/Books/api/__tests__/useBooksOwnerContent.test.tsx.
- Owned plan/report evidence only; no Books adapter/client/view-model/consumer/public UI, Games/Movie source, gates, quotas, workflows, fixtures or runtime resources.

## Minimal authority boundary

BooksOwnerContent is a complete account observation, independent of selected list. Bind its authority to JSON tuple [generation, accountId], never to an ID inferred from response. Current listId filters the current account's data.bookLists synchronously; same-account list changes may reuse already complete content and should not trigger unnecessary acquisition. Test this explicit contract rather than introducing list-specific owner authority. If review requires list-bound full content, stop and resolve that contract before implementation.

Store settled content as {scope, content}; request status likewise captures scope/loading/error so prior-owner error or false loading cannot leak into a new owner's pre-effect frame. Return content/data only when settled scope matches current auth scope. For pending mismatched status, expose no old error and truthful loading according to the current acquisition lifecycle. Preserve current same-account refetch retention semantics, current failure presentation and no partial-content publication. No response-derived authority, auto retry, silent rebase or acquisition changes.

A refetch captures generation/account scope, increments sequence and owns a new AbortController. Before starting, deny an obsolete captured callback if actual store generation/account no longer matches. Success, error and finally must require original sequence, non-aborted controller and actual current store authority. Preserve cleanup increment/abort, including unmount; late non-cooperative promise settlement cannot publish or return old content. No extra shared infrastructure required.

## TDD and verification steps

- [ ] Build a deterministic mock of readBooksOwnerContent only. Fixtures use distinct complete A/B content, list IDs/titles and detail observations; deferred success/rejection promises have explicit settlement.
- [ ] Probe in a component recording current auth authority plus returned content/data/loading/error in useLayoutEffect. Settle A, switch B while B read stays pending, assert EVERY B layout sample contains no A content/data. This must fail before the repair; final renderHook result alone is insufficient.
- [ ] Add sign-out and A generation1 -> B generation2 -> A generation3 pending samples; A generation3 must not reuse generation1 content even with same accountId.
- [ ] Test late obsolete A success, rejection and finally while B pending: no A publish, no stale error, no old finally clearing B loading; fresh B success returns only B.
- [ ] Test an obsolete saved refetch function invoked after account switch cannot start/abort B acquisition or return A; preserve same-authority explicit refetch behavior and retained current-account content during refresh.
- [ ] Test unmount late settlement remains ignored. Test same-account selected list change filters bookLists to the new list immediately while complete current-account content is retained.
- [ ] Execute contained hook suite, retain exact meaningful red assertion(s) on unmodified source and hash bindings. Implement only the described hook boundary after reviewed plan; retain all preexisting async guards.
- [ ] Run hook suite, existing Books client/navigation/list-command tests and affected owner consumer tests. Include supported frontend types, exact affected lint and fresh locked frontend build in owned clean source. Broader full frontend only if source/import/state changes justify it; preserve test counts/skips and original failures.
- [ ] Freeze two raw source hashes, verify exact scoped diff and independent review. No commit/push or browser/runtime acceptance without controller allocation.

## Review focus

- Layout sample, not post-passive-final state, proves confidentiality isolation.
- Auth generation differentiates account A re-verification from earlier A authority.
- Late old error/finally cannot overwrite B state; obsolete callback cannot cancel B work.
- List filtering follows current listId without changing complete-account acquisition contract.
- Same-account refresh/real errors retain existing semantics; no product assertion weakening.

## Separate read-only Books Load more diagnosis

Retained books-original20-diagnostic-result.json records18PASS/2FAIL, desktop and mobile anonymous list ordinary Load more books click120s, native aria-busy loading element intercepted followed by target disabled/detached; retries0, restored source96 mismatch0 and cleanup complete. It explicitly does not prove automatic completion. The earlier cover failure was not reproduced and has no classified cause.

Current books.spec.ts goes to seed-list-0 then calls the continuation button once before expecting later0-29. Shared PublicScrollContinuation has an IntersectionObserver rootMargin200px that may start work on scroll; loadingMore disables its button, and !hasMore removes it. Therefore click-scroll observer competition is a source-supported mechanism to investigate, not an established firstcause or permission to weaken the row/modal obligations. Absence/detachment can also follow navigation, terminal/error state or different rendered scope.

Required finite evidence before any test/UI repair: bind current route/scope, before/after row count and later0-29 presence, manual/observer trigger phase, actual cursor requests/status/error, loadingMore/hasMore transitions, and exact target DOM life. If final row appears with successful continuation before the manual click resolves, synchronization may follow actual progression while retaining later row/modal checks. If row is missing or a request failed, diagnose that first cause instead; never force click, increase timeout, remove continuation or assume success from detachment. No source edits, UAT or resource access allocated for this separate section.
