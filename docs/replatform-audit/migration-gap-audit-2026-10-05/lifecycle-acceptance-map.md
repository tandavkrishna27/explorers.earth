# Lifecycle acceptance ledger

2026-10-05. Task 1 source baseline dc61db1cf895b687fd3d32c3b6e4e6463d0d3663, codex/unified-replatform. Application, fixture, shared auth, workflow and runtime sources unchanged by this task. Ancestor C:/Users/TK/.codex/AGENTS.md is empty; no repository AGENTS found. Read systematic-debugging, subagent-driven-development, lifecycle plan, README, identity-platform audit and fresh native capture preparation/review.

## Identity reconciliation

Native discovery with supported Node v24.21.0 gives **75 distinct hosted identities: account lifecycle18 chromium-pr-safe; Music15 in each of three projects=45; Music accessibility4 in each of three projects=12**. Neither visual project selects account-lifecycle. Historical hosted230dbe-frontend-music.log reports75, with later attempt numbers exceeding75 due to retries; attempts are not identities. The isolated lifecycle lane is36 distinct case/project identities (18 desktop plus18 mobile), not75. Recovery adds3 chromium-pr-safe identities in the qualification frontend-music-legacy lane; these are outside the old75 but inside this mapping.

### Hosted75 exact selectors

Use file:line and exact title with project below; line numbers are discovery anchors, not a substitute for exact title. All Music/accessibility rows retain their original file/project/title/assertions and owner (Music6.1–6.3, accessibility/QA3.5); lifecycle migration must not remove or relabel them. Music account-generation and logout cases retain Music credential clearing and shell behavior; canonical auth logout supplements ordinary session safety without replacing Music behavior.

```text
Listing tests:
  [chromium-pr-safe] › account-lifecycle.spec.ts:227:3 › an in-flight cancel cannot continue under replacement identity
  [chromium-pr-safe] › account-lifecycle.spec.ts:227:3 › an in-flight boundary cannot continue under replacement identity
  [chromium-pr-safe] › account-lifecycle.spec.ts:253:1 › same-identity partial cancellation retries only Music resume after token refresh
  [chromium-pr-safe] › account-lifecycle.spec.ts:272:1 › a never-provisioned Explorer identity treats exact Music absence as a safe deactivation no-op
  [chromium-pr-safe] › account-lifecycle.spec.ts:286:3 › google account deactivation suspends Music before blocking Strapi
  [chromium-pr-safe] › account-lifecycle.spec.ts:286:3 › local account deactivation suspends Music before blocking Strapi
  [chromium-pr-safe] › account-lifecycle.spec.ts:303:1 › Music suspension outage leaves Strapi and browser authority active for retry
  [chromium-pr-safe] › account-lifecycle.spec.ts:317:1 › pending Music deletion prevents Strapi deactivation and browser auth cleanup
  [chromium-pr-safe] › account-lifecycle.spec.ts:332:1 › an unconfirmed Strapi block compensates Music without reporting success
  [chromium-pr-safe] › account-lifecycle.spec.ts:359:1 › pending deletion survives reload and a second tab, then cancels only before the boundary
  [chromium-pr-safe] › account-lifecycle.spec.ts:377:1 › a lost nullable cancel response reloads the exact cancelled terminal state without another prepare
  [chromium-pr-safe] › account-lifecycle.spec.ts:394:1 › a crossed-boundary retry preserves ordering and completes at login
  [chromium-pr-safe] › account-lifecycle.spec.ts:407:1 › a crossed-boundary retry refuses any additional Account outside the durable tuple
  [chromium-pr-safe] › account-lifecycle.spec.ts:420:1 › a lost Account mutation response keeps user authority and reload resumes with only the user deletion
  [chromium-pr-safe] › account-lifecycle.spec.ts:441:1 › dead-letter escalation is typed and offers no destructive retry
  [chromium-pr-safe] › account-lifecycle.spec.ts:455:1 › finalized deletion hides every ordinary delete entry point and performs no destructive call
  [chromium-pr-safe] › account-lifecycle.spec.ts:469:3 › unresolved delayed lifecycle authority fails closed before any destructive control
  [chromium-pr-safe] › account-lifecycle.spec.ts:469:3 › unresolved error lifecycle authority fails closed before any destructive control
  [chromium-pr-safe] › music-accessibility.spec.ts:34:3 › axe and keyboard-only Music sharing are clean at 375px
  [chromium-pr-safe] › music-accessibility.spec.ts:34:3 › axe and keyboard-only Music sharing are clean at desktop
  [chromium-pr-safe] › music-accessibility.spec.ts:94:3 › approved owner workspace is responsive and complete on mobile
  [chromium-pr-safe] › music-accessibility.spec.ts:94:3 › approved owner workspace is responsive and complete on desktop
  [chromium-pr-safe] › music.spec.ts:221:3 › Music ready-empty remains responsive and accessible at 320px
  [chromium-pr-safe] › music.spec.ts:221:3 › Music ready-empty remains responsive and accessible at 375px
  [chromium-pr-safe] › music.spec.ts:221:3 › Music ready-empty remains responsive and accessible at 640px
  [chromium-pr-safe] › music.spec.ts:221:3 › Music ready-empty remains responsive and accessible at 768px
  [chromium-pr-safe] › music.spec.ts:221:3 › Music ready-empty remains responsive and accessible at 1024px
  [chromium-pr-safe] › music.spec.ts:288:1 › sharing dialog traps focus, closes with Escape, and exposes only approved modes
  [chromium-pr-safe] › music.spec.ts:317:1 › sharing save uses one canonical publication command and restores focus
  [chromium-pr-safe] › music.spec.ts:333:1 › account-generation resets Music authority across tabs without logging Explorer out
  [chromium-pr-safe] › music.spec.ts:362:1 › logout boundary clears Explorer authentication in another tab
  [chromium-pr-safe] › music.spec.ts:377:1 › playlist tabs, keyboard reorder, and polite announcement work without mutable owner data
  [chromium-pr-safe] › music.spec.ts:404:1 › a Music outage keeps the Explorer shell usable and explicit retry recovers
  [chromium-pr-safe] › music.spec.ts:415:1 › Music loading animation respects reduced-motion preference
  [chromium-pr-safe] › music.spec.ts:431:1 › public private, missing, and invalid links converge on the exact 404
  [chromium-pr-safe] › music.spec.ts:438:1 › a valid public owner with no visible playlists has the exact reachable empty state
  [chromium-pr-safe] › music.spec.ts:450:1 › public rate-limit retry waits for Retry-After and then reaches the empty state
  [firefox-music-visual] › music-accessibility.spec.ts:34:3 › axe and keyboard-only Music sharing are clean at 375px
  [firefox-music-visual] › music-accessibility.spec.ts:34:3 › axe and keyboard-only Music sharing are clean at desktop
  [firefox-music-visual] › music-accessibility.spec.ts:94:3 › approved owner workspace is responsive and complete on mobile
  [firefox-music-visual] › music-accessibility.spec.ts:94:3 › approved owner workspace is responsive and complete on desktop
  [firefox-music-visual] › music.spec.ts:221:3 › Music ready-empty remains responsive and accessible at 320px
  [firefox-music-visual] › music.spec.ts:221:3 › Music ready-empty remains responsive and accessible at 375px
  [firefox-music-visual] › music.spec.ts:221:3 › Music ready-empty remains responsive and accessible at 640px
  [firefox-music-visual] › music.spec.ts:221:3 › Music ready-empty remains responsive and accessible at 768px
  [firefox-music-visual] › music.spec.ts:221:3 › Music ready-empty remains responsive and accessible at 1024px
  [firefox-music-visual] › music.spec.ts:288:1 › sharing dialog traps focus, closes with Escape, and exposes only approved modes
  [firefox-music-visual] › music.spec.ts:317:1 › sharing save uses one canonical publication command and restores focus
  [firefox-music-visual] › music.spec.ts:333:1 › account-generation resets Music authority across tabs without logging Explorer out
  [firefox-music-visual] › music.spec.ts:362:1 › logout boundary clears Explorer authentication in another tab
  [firefox-music-visual] › music.spec.ts:377:1 › playlist tabs, keyboard reorder, and polite announcement work without mutable owner data
  [firefox-music-visual] › music.spec.ts:404:1 › a Music outage keeps the Explorer shell usable and explicit retry recovers
  [firefox-music-visual] › music.spec.ts:415:1 › Music loading animation respects reduced-motion preference
  [firefox-music-visual] › music.spec.ts:431:1 › public private, missing, and invalid links converge on the exact 404
  [firefox-music-visual] › music.spec.ts:438:1 › a valid public owner with no visible playlists has the exact reachable empty state
  [firefox-music-visual] › music.spec.ts:450:1 › public rate-limit retry waits for Retry-After and then reaches the empty state
  [webkit-music-visual] › music-accessibility.spec.ts:34:3 › axe and keyboard-only Music sharing are clean at 375px
  [webkit-music-visual] › music-accessibility.spec.ts:34:3 › axe and keyboard-only Music sharing are clean at desktop
  [webkit-music-visual] › music-accessibility.spec.ts:94:3 › approved owner workspace is responsive and complete on mobile
  [webkit-music-visual] › music-accessibility.spec.ts:94:3 › approved owner workspace is responsive and complete on desktop
  [webkit-music-visual] › music.spec.ts:221:3 › Music ready-empty remains responsive and accessible at 320px
  [webkit-music-visual] › music.spec.ts:221:3 › Music ready-empty remains responsive and accessible at 375px
  [webkit-music-visual] › music.spec.ts:221:3 › Music ready-empty remains responsive and accessible at 640px
  [webkit-music-visual] › music.spec.ts:221:3 › Music ready-empty remains responsive and accessible at 768px
  [webkit-music-visual] › music.spec.ts:221:3 › Music ready-empty remains responsive and accessible at 1024px
  [webkit-music-visual] › music.spec.ts:288:1 › sharing dialog traps focus, closes with Escape, and exposes only approved modes
  [webkit-music-visual] › music.spec.ts:317:1 › sharing save uses one canonical publication command and restores focus
  [webkit-music-visual] › music.spec.ts:333:1 › account-generation resets Music authority across tabs without logging Explorer out
  [webkit-music-visual] › music.spec.ts:362:1 › logout boundary clears Explorer authentication in another tab
  [webkit-music-visual] › music.spec.ts:377:1 › playlist tabs, keyboard reorder, and polite announcement work without mutable owner data
  [webkit-music-visual] › music.spec.ts:404:1 › a Music outage keeps the Explorer shell usable and explicit retry recovers
  [webkit-music-visual] › music.spec.ts:415:1 › Music loading animation respects reduced-motion preference
  [webkit-music-visual] › music.spec.ts:431:1 › public private, missing, and invalid links converge on the exact 404
  [webkit-music-visual] › music.spec.ts:438:1 › a valid public owner with no visible playlists has the exact reachable empty state
  [webkit-music-visual] › music.spec.ts:450:1 › public rate-limit retry waits for Retry-After and then reaches the empty state
Total: 75 tests in 3 files
```

### Additional invocation selectors

```text
Listing tests:
  [lifecycle-desktop] › account-lifecycle.spec.ts:227:3 › an in-flight cancel cannot continue under replacement identity
  [lifecycle-desktop] › account-lifecycle.spec.ts:227:3 › an in-flight boundary cannot continue under replacement identity
  [lifecycle-desktop] › account-lifecycle.spec.ts:253:1 › same-identity partial cancellation retries only Music resume after token refresh
  [lifecycle-desktop] › account-lifecycle.spec.ts:272:1 › a never-provisioned Explorer identity treats exact Music absence as a safe deactivation no-op
  [lifecycle-desktop] › account-lifecycle.spec.ts:286:3 › google account deactivation suspends Music before blocking Strapi
  [lifecycle-desktop] › account-lifecycle.spec.ts:286:3 › local account deactivation suspends Music before blocking Strapi
  [lifecycle-desktop] › account-lifecycle.spec.ts:303:1 › Music suspension outage leaves Strapi and browser authority active for retry
  [lifecycle-desktop] › account-lifecycle.spec.ts:317:1 › pending Music deletion prevents Strapi deactivation and browser auth cleanup
  [lifecycle-desktop] › account-lifecycle.spec.ts:332:1 › an unconfirmed Strapi block compensates Music without reporting success
  [lifecycle-desktop] › account-lifecycle.spec.ts:359:1 › pending deletion survives reload and a second tab, then cancels only before the boundary
  [lifecycle-desktop] › account-lifecycle.spec.ts:377:1 › a lost nullable cancel response reloads the exact cancelled terminal state without another prepare
  [lifecycle-desktop] › account-lifecycle.spec.ts:394:1 › a crossed-boundary retry preserves ordering and completes at login
  [lifecycle-desktop] › account-lifecycle.spec.ts:407:1 › a crossed-boundary retry refuses any additional Account outside the durable tuple
  [lifecycle-desktop] › account-lifecycle.spec.ts:420:1 › a lost Account mutation response keeps user authority and reload resumes with only the user deletion
  [lifecycle-desktop] › account-lifecycle.spec.ts:441:1 › dead-letter escalation is typed and offers no destructive retry
  [lifecycle-desktop] › account-lifecycle.spec.ts:455:1 › finalized deletion hides every ordinary delete entry point and performs no destructive call
  [lifecycle-desktop] › account-lifecycle.spec.ts:469:3 › unresolved delayed lifecycle authority fails closed before any destructive control
  [lifecycle-desktop] › account-lifecycle.spec.ts:469:3 › unresolved error lifecycle authority fails closed before any destructive control
  [lifecycle-mobile] › account-lifecycle.spec.ts:227:3 › an in-flight cancel cannot continue under replacement identity
  [lifecycle-mobile] › account-lifecycle.spec.ts:227:3 › an in-flight boundary cannot continue under replacement identity
  [lifecycle-mobile] › account-lifecycle.spec.ts:253:1 › same-identity partial cancellation retries only Music resume after token refresh
  [lifecycle-mobile] › account-lifecycle.spec.ts:272:1 › a never-provisioned Explorer identity treats exact Music absence as a safe deactivation no-op
  [lifecycle-mobile] › account-lifecycle.spec.ts:286:3 › google account deactivation suspends Music before blocking Strapi
  [lifecycle-mobile] › account-lifecycle.spec.ts:286:3 › local account deactivation suspends Music before blocking Strapi
  [lifecycle-mobile] › account-lifecycle.spec.ts:303:1 › Music suspension outage leaves Strapi and browser authority active for retry
  [lifecycle-mobile] › account-lifecycle.spec.ts:317:1 › pending Music deletion prevents Strapi deactivation and browser auth cleanup
  [lifecycle-mobile] › account-lifecycle.spec.ts:332:1 › an unconfirmed Strapi block compensates Music without reporting success
  [lifecycle-mobile] › account-lifecycle.spec.ts:359:1 › pending deletion survives reload and a second tab, then cancels only before the boundary
  [lifecycle-mobile] › account-lifecycle.spec.ts:377:1 › a lost nullable cancel response reloads the exact cancelled terminal state without another prepare
  [lifecycle-mobile] › account-lifecycle.spec.ts:394:1 › a crossed-boundary retry preserves ordering and completes at login
  [lifecycle-mobile] › account-lifecycle.spec.ts:407:1 › a crossed-boundary retry refuses any additional Account outside the durable tuple
  [lifecycle-mobile] › account-lifecycle.spec.ts:420:1 › a lost Account mutation response keeps user authority and reload resumes with only the user deletion
  [lifecycle-mobile] › account-lifecycle.spec.ts:441:1 › dead-letter escalation is typed and offers no destructive retry
  [lifecycle-mobile] › account-lifecycle.spec.ts:455:1 › finalized deletion hides every ordinary delete entry point and performs no destructive call
  [lifecycle-mobile] › account-lifecycle.spec.ts:469:3 › unresolved delayed lifecycle authority fails closed before any destructive control
  [lifecycle-mobile] › account-lifecycle.spec.ts:469:3 › unresolved error lifecycle authority fails closed before any destructive control
Total: 36 tests in 1 file

Listing tests:
  [chromium-pr-safe] › reactivation-lifecycle.spec.ts:3:1 › reactivation replacement conflict is rendered as retry-safe failure
  [chromium-pr-safe] › reactivation-lifecycle.spec.ts:20:1 › permanently removed Music identity remains a retry-safe reactivation failure
  [chromium-pr-safe] › reactivation-lifecycle.spec.ts:38:1 › exact current reactivation tuple reaches the completion destination
Total: 3 tests in 1 file
```

Workflow invocation owners: .github/workflows/ci.yml:421 and test.yml:170 invoke the same75 via default config; test.yml explicitly retries0, ci.yml inherits CI retries2. Qualification frontend-e2e-qualification.yml:37 invokes lifecycle36 with isolated config; :42 invokes Music/recovery and other legacy families with three selected projects and retries0 (only chromium selects recovery). Duplicate workflow runs are execution obligations, not additional case identities. No workflow selector changed.

## Canonical case registry

C0–C9 refer to exact existing LIFECYCLE_CASES entries in tunes/scripts/lifecycle-browser-guards.ts, all project lifecycle-chromium, explorers-earth/e2e/replatform/lifecycle.spec.ts. These are source coverage references and saved exact46ee lifecycle10, not freshly passed dc61 browser proof.

- C0: active Settings requires trimmed feedback and retries one durable submission
- C1: foreign feedback and stale revision cannot delete an active owner
- C2: UI deactivation revokes both tabs and the old session
- C3: UI deletion is cancelled by a real Google recovery callback
- C4: recovery proof expires and cannot grant ordinary authority
- C5: concurrent recovery completes exactly once and rejects replay
- C6: wrong provider identity cannot recover a retained account
- C7: terminal maintenance preserves tombstone and denies recovery
- C8: foreign and absent origins cannot mutate lifecycle state
- C9: delayed old lifecycle response cannot navigate a new owner

A3: auth.spec.ts, failed logout fences a receiving tab after reload and a newly opened tab. A4: real local session gates onboarding and cross-tab logout revokes both tabs. A5: purpose-bound proof recovers once against real API and requires a fresh ordinary session. Auth project chromium-pr-safe, owned profile-browser-fixture.ts:146 invocation; no shared helper authority migration authorized.

## Assertion disposition

Every numbered L row applies to its exact hosted title below and both isolated project copies. Required additions are named proposed exact canonical titles, not existing passing coverage. blocked-product-gap means unresolved coverage/product decision and prohibits retirement; it is not a reproduced application defect. Where replaced-protocol and blocked-product-gap coexist, only the named obsolete assertion is excluded from canonical protocol; all safety behavior stays required.

| Row / exact legacy title | Assertions / canonical target / retained owner | Disposition and missing behavior |
|---|---|---|
| L1: an in-flight cancel cannot continue under replacement identity | C9 holds feedback A→B, asserts no confirmation/navigation and ownerB feedback empty; Music resume/account/user-delete negative calls and persisted B identity translate to verified /me(B), no B mutation or logout. | replaced-protocol for Music suffix/JWT assertions; blocked-product-gap: proposed stale lifecycle completion cannot affect a replacement generation must hold feedback/deletion/deactivation/recovery completion A→B and A→B→A; prove B/returnedA session intact and no old confirmation/navigation. |
| L2: an in-flight boundary cannot continue under replacement identity | Same identity fence as L1; retain irreversible Music boundary in music-lifecycle-service.test.ts: refuses cancellation after the repository reports the irreversible boundary. | replaced-protocol for saga endpoint; blocked-product-gap same proposed generation case, held deletion/deactivation result in addition to C9 feedback. |
| L3: same-identity partial cancellation retries only Music resume after token refresh | C3 recovery bound to Google purpose and revision; C5 single completion/replay denial; retained Music service reactivation and exact tuple compensation owner. | replaced-protocol for bearer refresh/resume-only sequencing; blocked-product-gap proposed lost recovery completion observes committed state without replay: successful completion lost, reload observes active without ordinary /me; no second proof consumption or new destructive operation. |
| L4: a never-provisioned Explorer identity treats exact Music absence as a safe deactivation no-op | C2 retained canonical account becomes suspended, security version advances, sessions0 and old /me401. Music service exact title acknowledges exact local absence for suspend and reactivate without inventing a Music owner retains absence semantics. | replaced-protocol for suspend→Strapi ordering; retained Music service absence; canonical deactivation requires no Music provisioning. |
| L5: google account deactivation suspends Music before blocking Strapi | C2 canonical transaction revokes both tabs and backend session. Music service suspends only the exact authoritative Explorer tuple retains Music binding identity. | replaced-protocol for Strapi mutation ordering, canonical atomic transaction requirement retained; Music binding migration6.1 remains open. |
| L6: local account deactivation suspends Music before blocking Strapi | C2 transaction/revocation applies canonical Google account. | explicitly-excluded local password login/deactivation per Google-only agreed contract (identity-platform Google scope); retained canonical deactivation safety, Music exact tuple safety. No local-password feature reinstated. |
| L7: Music suspension outage leaves Strapi and browser authority active for retry | Canonical failed transaction must preserve active account, no operation/session revocation and retry-safe UI; retained Music service failure behavior. | blocked-product-gap proposed failed canonical deactivation preserves authority and permits retry: owned canonical failure before commit, /me200, unchanged revision/status/sessions, no false success, same bounded command retry; no claim canonical fixture covers Strapi outage. |
| L8: pending Music deletion prevents Strapi deactivation and browser auth cleanup | Retain Music pending denial in Music service/route ownership. Canonical pending has no ordinary Actor; C3 proves recovery rather than active browser authority. | replaced-protocol for active JWT on pending Music saga; blocked-product-gap proposed pending recovery remains purpose-only across reload and second tab: /me401 and lifecycle401, no destructive UI/request; recovery before terminal succeeds for same retained account. |
| L9: an unconfirmed Strapi block compensates Music without reporting success | Retain compensation exact tuple in Music service title reactivates only the exact authoritative Explorer tuple for compensation; retained reactivation service title reactivates the immutable Music binding before unblocking Strapi and consumes the token only after both converge. | replaced-protocol canonical has single transaction rather than Strapi compensation; blocked-product-gap canonical failure atomicity/retry case in L7. Retained service semantics are source owners, not freshly run proof or browser parity. |
| L10: pending deletion survives reload and a second tab, then cancels only before the boundary | C3 pending deletion→purpose recovery→active, fresh Google session verifies same account; C7 terminal denies recovery. Preserve no operation/proof/secret in local/session storage, readable cookies or URL. | blocked-product-gap pending recovery remains purpose-only across reload and second tab must cover reload plus independent tab, preterminal recovery, postterminal denial and no persisted operation/proof/secret. Ordinary Settings pending session must never be fabricated. |
| L11: a lost nullable cancel response reloads the exact cancelled terminal state without another prepare | Retained music-lifecycle-service.test.ts exact title recovers exact cancelled nullable status and cancel after a lost response. Canonical C3/C5 recovery state and single use translate authority. | replaced-protocol nullable Music envelope; blocked-product-gap lost recovery completion observes committed state without replay, no duplicate delete/feedback/new prepare, no automatic ordinary authority; storage secrecy required. |
| L12: a crossed-boundary retry preserves ordering and completes at login | C7 terminal maintenance deletes owned content and retains tombstone; canonical service integration terminally purges owned content and typed attachments while retaining shared catalog and tombstone. Music worker finalizes only authoritative absence and leaves present or unknown identities intact retains saga order. | replaced-protocol Music prepare/boundary/GraphQL delete ordering; retained service owner ordering; canonical deletion operation/revision and terminal no-recreation asserted C7. |
| L13: a crossed-boundary retry refuses any additional Account outside the durable tuple | C1 foreign feedback404/stale revision409 and unchanged active owner; Music service rejects a replacement Account before the irreversible boundary. | replaced-protocol additional Strapi Account tuple; blocked-product-gap proposed lost deletion response retains exact operation and owner: owned account-bound command cannot affect foreign account; inspect both owners and revision/idempotency. |
| L14: a lost Account mutation response keeps user authority and reload resumes with only the user deletion | C0 proves lost successful feedback with same key, single feedback and active status; canonical deletion revokes sessions atomically, cannot preserve ordinary authority after successful commit. | replaced-protocol sequential account/user delete and JWT preservation; blocked-product-gap lost deletion response retains exact operation and owner: lost successful delete response, observe one pending operation, no second feedback/delete/new destructive operation, /me401 old cookie, recovery requires purpose proof. Session-revoked retry behavior must be reviewed rather than assumed receipt can authenticate. |
| L15: dead-letter escalation is typed and offers no destructive retry | Retain music-lifecycle-worker.test.ts exact title dead-letters at the bounded maximum and exposes a manual repair seam. Canonical DTO has active/suspended/pending_deletion/deleted only, no deadLetter/retryable field. | blocked-product-gap explicit typed nonretryable/manual-review UI contract decision required; proposed terminal or unavailable lifecycle authority exposes no destructive action must prove no destructive controls/request. Retained worker seam alone cannot discharge UI obligation. |
| L16: finalized deletion hides every ordinary delete entry point and performs no destructive call | C7 tombstone/sessions0/bindings1/recovery denial/collections401/collections0. Preserve storage secrecy and zero deletion/deactivation requests. | blocked-product-gap terminal or unavailable lifecycle authority exposes no destructive action must visit/reload terminal routes and second tab and assert no control or destructive request, no persisted operation/proof. C7 API denial does not assert all UI controls. |
| L17: unresolved delayed lifecycle authority fails closed before any destructive control | Canonical get-session→/me→lifecycle loading must remain fail closed; no destructive control or request while canonical lifecycle GET held. | blocked-product-gap proposed unresolved canonical lifecycle read exposes no destructive action: held valid canonical read, control absence, zero deletion/deactivation requests; release to verified state, preserve bounded request interval. |
| L18: unresolved error lifecycle authority fails closed before any destructive control | Canonical lifecycle read error offers bounded explicit retry without fabricating authority; retained account/session only if verified. | blocked-product-gap unresolved canonical lifecycle read exposes no destructive action: HTTP/transport error, control absence and zero deletion/deactivation requests, retry followed by actual valid state. |

| Recovery exact legacy title (chromium-pr-safe) | Canonical mapping and obligations | Disposition |
|---|---|---|
| reactivation replacement conflict is rendered as retry-safe failure | C6 wrong subject preserves suspended account/sessions0/proofs0; C4 expiration has retry-safe alert. Must assert request-new-recovery affordance, no ordinary session, reload and second-tab denial. | replaced-protocol legacy /api/user/reactivate?token; blocked-product-gap proposed denied recovery remains retry-safe across reload and second tab. |
| permanently removed Music identity remains a retry-safe reactivation failure | C7 denies terminal recovery/new collection and preserves tombstone. Retain reactivation-music-lifecycle.test.ts retains a tombstoned Music token and never attempts a Strapi unblock. | replaced-protocol query token; retained Music tombstone service; blocked-product-gap retry-safe UI/second-tab denial as above. |
| exact current reactivation tuple reaches the completion destination | C3 Account reactivated and Sign in with Google, then /me same account; A5 purpose completion once, fresh ordinary session required. Legacy Go to login wording becomes canonical fresh-sign-in destination. | replaced-protocol URL-token authority; retained completion destination/no ordinary session. URL token alone must not authorize canonical recovery. |

Cross-cutting assertion owners: C8 preserves missing/foreign Origin denial; C1 owner/revision denial; C0 feedback same idempotency key/single row. A3/A4 preserve failed logout fencing receiving/reloaded/new tabs and backend old-session revocation. Generation A→B→A and writer identity remain required in all proposed response-loss/stale-result cases; no fixture result may grant authority directly. External egress guard, no foreign-owner reads/writes, no arbitrary credential serialization and exact runner discovery/cleanup/artifact controls remain mandatory. No blanket waiver exists for any family.

## Shared helper import classification

setup/auth.ts importers are legacy private-family owners: account-lifecycle (this mapping); music/music-accessibility/music-fullstack/music-public-contract (Music); analytics (dashboard7.2); apps/books/categories/games/guides/locations/movies/people/products (respective category/UI owners); profile-presentation-visual/profile-theme (profile/public presentation owners). Canonical replatform auth/lifecycle use fixture cookie directly. No helper modification authorized; shared authority would affect every importer.

## Baseline custody

Hash ledger captures source plus all pre-existing tracked dirty files, without modification. Untracked existing resources remain untouched; parent navigation work may change its own source after this snapshot.

```text
9d8da966a74dca53bfc4093bc6937ea7ec577bfbff0d0d210817d76cf2d9f0dd  explorers-earth/e2e/account-lifecycle.spec.ts
6b55d9d6004a35929b268f47b8ef20f2ac094b3acc416605ea8434b0a377af20  explorers-earth/e2e/reactivation-lifecycle.spec.ts
21eff9ab3e32a3a9d0843a341a30ebda1dd9fc6c9d1e7ffbdf3ce2e501f43ead  explorers-earth/e2e/replatform/auth.spec.ts
cb5d56736638e8932a7c984b0ade8e6c6d25d1d624bcd4f99fe8633564fe8d32  explorers-earth/e2e/replatform/lifecycle.spec.ts
b53078e51a2370846a0dd694520a655045d8bfb2eaa5e58f3ea37bbac296b3c4  explorers-earth/e2e/setup/auth.ts
5dd63640f3a2a452c0516ae2b8c174f9f84eec9e16508e4b224cfa4ce00dab72  explorers-earth/src/lib/authClient.ts
79c3a74a791b9160c564bd5bf6bc66cec64b67403a4bf038d61352cd3b466a75  explorers-earth/src/store/store.ts
2a71ce2ebf388eab960f4825f4f67108eefb2ba6b452a1bbf558d2ec4730cf9d  tunes/scripts/lifecycle-browser-guards.ts
0bf375915457db47420429d51761f19f2e52f0e7f86e6e8c95029da3def8aa39  tunes/scripts/lifecycle-browser-support.ts
198d258061f2702e3ed618c8b1023c6a1def67a9f07de3825d43d0a699cdd629  tunes/scripts/profile-browser-fixture.ts
1564384aa1e05655fd7bcdae851e5a249e349602caaff33ba6ed926841e94273  tunes/server/application/accountLifecycle.ts
ae09592fd59150864a0786cd31fc60491702252e7897ca17456ccf3a22661b07  .github/workflows/ci.yml
66de386f291dab3f004cebf36a0e17c6aeabda1e5555bc4c824e35bc6054bb44  .github/workflows/test.yml
a8cb75df850562883f7f456d915b4d7a0579b166ad4b476783cd92bbb63b4790  .github/workflows/frontend-e2e-qualification.yml
968c28dd211459550119d369672c5266d4cf961fc7f3d332756eb2abbcd32374  .github/workflows/tunes.yml
f86289fcd5a6c8c9f81d7a7c6c79e4b9c34ea3e15bc2d48dd3525f85cb19fc28  .superpowers/sdd/epic-01/checkpoint-fa82-frontend-unit-repair-review.md
f665ac471a3d1e97b40f70cd2dfb3b9ba8fdcc00109ed1715d76f8e7ab3195d9  .superpowers/sdd/epic-01/task-2-2-report.md
e2cd0c32ffc938ca86343e654179212885c9049de7eb184f34aec6570437d159  .superpowers/sdd/epic-01/task3.1-shared-search-report.md
f97df22c7d1e3ac0ea8d05ee79afffa6b73a401c03d29bd4708f80a6b5bdf30e  .superpowers/sdd/epic-01/task4.2-games-a1a-independent-review.md
d37bdef7b83d3a1c68eb4e5e5e22819656802636bc14f62dd9f306cb05d76d63  .superpowers/sdd/epic-01/task4.2-games-a2-independent-review.md
02867e8ed9559d6fed86b0fc6318f6a9a506904243a05fd8ca1a7292bed609e5  explorers-earth/public/sitemap.xml
ebb992abdc05ccbadc298f96ed940dbb4292c0f62d154ba6228b33831096f29a  explorers-earth/src/features/navigation/__tests__/categoryNavigationApi.test.ts
fa052d22671305b2d41cd12266b44394768ac520c65b1bb8da13706b2bcfb2bc  explorers-earth/src/features/navigation/categoryNavigationApi.ts
9675e27c0b16b739a61a60ffc5b040f573e963f63c519d45f52dd6ceca21d97c  explorers-earth/src/features/navigation/categoryNavigationPolicy.ts
b833357acb9ce9f6d68f97b13202365217c9246fa6e51bf03bc881a3d8a1dd2e  tunes/server/test/deployment/music-deploy-workflow-security.test.ts
40ca0c16680d2fa37ea7191b5b86477e14591a4df60dc1efd80ec3672231fae2  tunes/server/test/music-runtime-role.integration.test.ts
```

## Fresh first-boundary evidence

One reviewed original cancel capture executed, unchanged original body, Node v24.21.0, manifest8d91bca6cf63c8be57d08d4fe6e62418a81e7e08cb10a3c5e1de23a1488e5bd8. Before allocation, runtime-precheck independently matched every manifest/freeze hash and physical dependencies;55176 had no listener. Existing controller binds executable/PID/creation/command and cleanup;51642 was never allocated, queried for reuse or terminated. No new controller or recorder was created. Old snapshot was read before execution: account-error boundary only.

Native artifact C:/Users/TK/.codex/tmp/fresh-lifecycle-private-20261005/runtime.stdout.private.log SHA256 fb8658664d08ac9013b88d50c0ec6c9f617d719ce48c95d919feb388bc9a0c5d; startedAtMs1791194161397. Literal chronological records:

```json
{"seq":1,"kind":"request","operation":"get-session","method":"GET","localOrigin":true,"resourceType":"fetch"}
{"seq":2,"kind":"request","operation":"get-session","method":"GET","localOrigin":true,"resourceType":"fetch"}
{"seq":3,"kind":"requestfailed","operation":"get-session","method":"GET","localOrigin":true,"resourceType":"fetch","failure":"other"}
{"seq":4,"kind":"requestfailed","operation":"get-session","method":"GET","localOrigin":true,"resourceType":"fetch","failure":"other"}
{"kind":"end","requestOnly":true,"authStoreCausalProof":false,"listenersInstalledBeforeNavigation":true,"overflow":false,"consoleOther":10,"eventCount":4}
```

Observed first boundary: two get-session initiations followed by transport failures, classified **other**. No HTTP status was recorded; this is neither observed401 nor observed blockedbyclient. Source catch-all refuses unhandled data, setup supplies legacy token/localStorage and no get-session response; this is a concrete source fixture divergence consistent with the observed session request failure. Exact transport reason and store/payload cause remain unknown. No /me/profile/lifecycle record appears in this listener interval, but controller inventoryComplete=false prevents a qualified absence or broad causal assertion. Original Cancel deletion click timed out90s, native exit1, no test retries. The predecessor complete-envelope emitted diagnosticQualified=false/acceptance=false and is not fresh request authority.

Controller result SHA2561818c1f6a655f5f312882ebb9771f509240ecfe5f0283b1fea06433881009759: inventoryComplete=false; cleanup identityChecksPassed=true, ownedProcessesAbsent=true, listenerAbsent=true; interrupted=false/controllerTimedOut=false. Follow-up55176 listener read was empty. Finite cleanup succeeded for recorded identities, but complete ownership inventory was not qualified. Preserve first evidence and STOP additional allocations. No rerun/instrumentation/fix loop, no auth-store proof and no reproduced application defect claim.

Branch decision: mapping/source divergence supports a reviewed Task2 canonical-fixture migration, not application repair. Runtime first observed boundary is get-session transport failure; universal runtime cause remains unqualified. Independent review must approve ledger and explicitly account for incomplete capture inventory before any further allocation. Earliest minimal fixture task is spec-local canonical held-feedback A→B and A→B→A addition to existing C9, retaining verified cookie /me and both owners, exact discovery/zero retries/guard custody; then separately response-loss, pending/recovery, unavailable/terminal cases named above. No old test retirement until each row has passing replacement or explicit retained owner evidence and required hosted selectors reconciled.

## Resolution, 2026-10-06

The predicted cause is confirmed and repaired. `setupMockAuthentication` authenticated a fixture page only through a legacy `token` cookie and an `auth-storage` localStorage blob, while the application verifies `GET /api/auth/get-session` and `authClient.refresh()` deletes that blob before verifying. No fixture answered get-session, the deny-by-default catch-all refused it, and every protected route rendered the recoverable onboarding-check failure instead of the surface under test. The helper now sets `better-auth.session_token` and answers get-session from the cookie the request actually carries, so a fixture that clears it still represents a signed-out browser. Two further source divergences were found with it: the `/me` fixtures served `canonicalAccountFixture()`, whose `categories` is empty, so `toNavigationSnapshot` rejected the snapshot and no navigation authority was ever published; and no fixture answered `PATCH /api/explorers/v1/account`, so a Music publication could not commit `public_music` and reported itself unconfirmed.

This also qualified one application defect, now fixed rather than accommodated: `pages/Music.tsx` built its owner scope from the Strapi `selection.account.documentId` while `AuthSyncManager` reconciles provisioning with the canonical account id, so `musicIdentityCoordinator.isReadyFor()` could never match and every Music publication control rendered disabled. The server side moved with it, because `resolvePublicDescriptor` matched only `users.strapi_account_document_id`, which ADR-007 and migration 0039 leave NULL on a canonically provisioned venue.

**Music and accessibility rows are retained unchanged and all pass** across chromium-pr-safe, firefox-music-visual and webkit-music-visual. Two of them asserted `localStorage["auth-storage"].state.isAuthenticated`, which the store deliberately stops persisting (`partialize: () => ({})`); per the replaced-protocol rule only that assertion is dropped, and both safety behaviours are re-asserted canonically.

**Account lifecycle rows are migrated, not retired.** Settings no longer performs a Music-mediated deletion saga; it uses `createCanonicalAccountLifecycleService` over `GET account/lifecycle` and `POST account/{deactivation,deletion,deletion-feedback}`, with cancellation only through a fresh Google recovery proof. Each retained row and its canonical replacement in `e2e/account-lifecycle.spec.ts`:

| Retained row | Canonical replacement |
| --- | --- |
| unresolved delayed/error lifecycle authority fails closed before any destructive control | `unresolved {delayed,error} lifecycle authority fails closed before any destructive control` |
| finalized deletion hides every ordinary delete entry point and performs no destructive call | `a finalized deletion hides every ordinary delete entry point and performs no destructive call` |
| pending deletion survives reload and a second tab | `a pending deletion survives reload and a second tab` |
| cancels only before the boundary | `cancelling a pending deletion requires a fresh Google recovery and issues no lifecycle command` |
| a lost nullable cancel response reloads the exact cancelled terminal state | `checking a pending deletion re-reads the authority without mutating it` |
| crossed-boundary retry completes at login | `deactivation issues exactly one canonical command carrying the observed revision and ends at login` |
| a crossed-boundary retry refuses any additional Account outside the durable tuple | `a stale revision cannot deactivate and reports without a second command` |
| a lost Account mutation response keeps user authority and reload resumes | `a lost deletion response keeps authority and the retry reuses the same durable key` |
| retries one durable submission | `deletion records trimmed feedback once and then issues one durable deletion command` |
| an in-flight cancel/boundary cannot continue under replacement identity | `an identity change mid-flight abandons the in-flight lifecycle command` |

Rows whose protocol no longer exists are dropped rather than re-created as invented coverage, because there is no Music step in canonical deactivation or deletion and no Strapi mutation to order against: Music suspend-before-Strapi-block ordering for both providers, Music suspension outage leaving Strapi authority active, pending Music deletion gating Strapi deactivation, unconfirmed Strapi block compensation, Music resume after token refresh, exact Music absence as a safe deactivation no-op, and dead-letter escalation. Music credential teardown at a session boundary remains covered by `music.spec.ts`.

One premise in the inventory above is corrected: neither `account-lifecycle.spec.ts` nor `.github/workflows/test.yml` exists on `main`, so these identities are branch-authored and were never a shipped hosted baseline. The retirement bar was applied anyway, by replacement rather than deletion.

Verification: `account-lifecycle.spec.ts` 11/11 on chromium-pr-safe; Music and accessibility 45/45 across the three projects; explorers-earth 313 files / 4319 unit tests with exit code 0; `test:music-critical-coverage` 441 passing at 100 per file; tunes type baseline and scoped project clean; `npx tsc -b` clean; eslint 0 errors.
