# Games actual browser pacing — finite plan, measurements incomplete

Source: reviewed dirty96 `73e86a7def64c416b538dd1db5cdfe5192dbb759a512c72977af1ee393a910ec`, base2f. No scheduling source edits authorized by this document. Original canonical19/1 remains failed; diagnostic outcomes are not acceptance.

## Demonstrated cause and measurement limits

Original complete-order diagnostic18/2 reproduced mobile case9 first A→B missing title with native shell/category429, `PUBLIC_PROFILE_429`, routeBtrue, title/list counts0, unavailable1, native budget0/0/0. The real production public limiter remains120 requests/minute per native IP. Both projects, anonymous contexts, browser previews and direct API clients share that IP/window. Response200/304/404, denied429 and aborted requests all consume ingress budget; no assertion may omit them.

Current retained measurement: case9 across desktop+mobile emitted71 native profile finish events,61 browser profile response events,2 fixed query errors and2 DOM captures. This is **not** the full-suite ingress count and is not per-case exact accounting: aborted requests may lack finish, direct API requests lack browser events. Single desktopcase3 owner diagnostic passed3.3s with125 owner HTTP200 events and4 owner read phase events, no reader/hook errors; these owner endpoints do not consume the public-profile limiter. It performed one additional readonly public-shell header probe,200 with real draft7 `limit=120, remaining=119, reset=60`. Case3 also contains one direct public detail read in its full flow; its browser-response counter cannot observe that APIRequestContext request.

Required native measurement table, before numerical pacing is implementation-qualified:

| Cases, separately per project | Native profile ingress | Finish/abort/direct counts | Header/reset observations | Status |
|---|---:|---:|---|---|
|1–2|unmeasured|unmeasured|unmeasured|must measure, not assume0|
|3|one source-explicit direct public detail; exact native count pending|APIRequestContext must count|separate diagnostic probe120/119/60|partial only|
|4–8|unmeasured|unmeasured|unmeasured|must measure all preview fanout|
|9|71 finish events combined two projects, not ingress/per-project totals|61 browser responses combined; direct/abort delta not yet classified|actual429 captured|insufficient numerical table|
|10|unmeasured|unmeasured|unmeasured|must measure, not assume0|

No invented per-case counts. A single separately bound count-only original20-order measurement execution may fill this table; it is not a canonical retry or product change. It must retain every original assertion and failure, use existing owned fixture/cleanup, and cap emitted aggregate records at20 case records plus one final summary. No raw path/handle/body/cookie/session or URL capture.

## Exact proposed implementation ownership

Only existing `tunes/scripts/games-browser-fixture.ts` and `explorers-earth/e2e/replatform/games.spec.ts`. Existing exact20 discovery/project/case order, fixture authority,82 manifest, runner guards and cleanup unchanged. No limiter/service/client/UI/schema/helper/grant/CI changes.

Fixture-local native server instrumentation counts every GET entering `/api/explorers/v1/profiles/` once, before application handling; it never changes IP, headers or application responses. Assign an internal current-case index/project via the existing capability-authenticated exact-loopback control seam, with strict finite action/input allowlist. Same single fixture API server/IP for both projects. Count request-aborted/premature-close separately while preserving the ingress charge. Capture only numeric draft7 limit/remaining/reset and status at finish; no raw header logging. Unknown/malformed/conflicting policy, limit other than120, reset outside0..60 or increasing remaining within a window fails closed.

Control case-admission is **before each test's user flow**, including the first case of the second project. It cannot run after a failed request or retry a user action. It uses last genuine response-header remaining/reset, with outstanding native profile requests settled before deciding; no direct private limiter-store access or reset. If no observation exists, one counted public-shell probe to the already-public fixture owner establishes the header. Probe cost is included in ingress and budget. That probe receives no assertion credit for the case's privacy/data duties.

Candidate technical default is a90-profile-ingress reservation per case, including one possible admission probe; this is **provisional**, not justified for all20 by case9's71 combined finish events. Final reservation must equal measured largest per-case ingress plus a stated conservative allowance for source-grounded concurrent preview/abort variation, and be≤119 after a counted probe. If source flow or measurement requires more than119, stop and diagnose excessive fixture fanout; do not increase production quota or silently split a user flow.

Admission returns immediately only when actual remaining≥reservation and no unsettled previous-case profile request can spend it. Otherwise wait until the genuine observed reset deadline plus conservative1s rounding margin. Deadline is derived from observation receipt time + numeric resetSeconds, preserving real wallclock. At most one counted post-reset recheck probe is permitted, and its cost remains in budget. If still insufficient/invalid or reset fails to advance, fail the fixture rather than polling/retrying. Max admission walltime75s (≤60s observed window +1s rounding +bounded prior native settlement); absolute bound required across phases, not fresh timeout per phase. Test-hook timeout must honestly include this added time; no user-flow locator timeout or assertion gets weakened.

During a case: no waits keyed to429, no reissue, no reset, no IP/identity rotation, no automatic retry. Any429, ingress exceeding its declared reservation, unknown case ownership or outstanding request crossing teardown is an explicit qualification failure. Later cases may still execute to preserve complete diagnostic results. Before-case pacing affects scheduling only; all publication/privacy/late-response assertions remain unchanged. Report total actual duration including waits and measured ingress, separate browser pass counts from pacing/accounting evidence.

## Required red/green and qualification

Before implementation: independently review measured table, reservation and exact control contract. Reproduce original ordered429 without changing quota. Deterministic fixture contracts must prove same-IP shared budget across projects, counts for304/404/aborted/direct API/preview, unknown-header deny, reset rounding/absolute deadline, one recheck maximum, concurrent previous-case settlement and no within-case429 recovery. Source inspection must prove no limiter options/store/key changes. Exact20 identities and original82 runner contract remain mandatory.

After finite source review/refreeze: current source/artifact binding then one canonical20; only20PASS/owned cleanup/source guard permits82. Desktop owner-load failure remains an independent prerequisite, not inferred to be429 and not solved by this pacing plan. Live IGDB parity/fullQA/release remain open.

## Measured original-order delta — ready for independent numerical review

The one authorized diagnostic completed19PASS/1FAIL,0retries/0skips, acceptancefalse. Receipt: C:/Users/TK/.codex/tmp/games-a3m-clean-67b41062-bb64-4b4d-8182-dddc5cad3562/games-request-measurement-receipt.json; original log and separately hashed overlay are siblings. Canonical96 restored mismatch0; fresh UAT resource cleanup left only retained51642.

|Case index (original zero-based)|Desktop ingress|Mobile ingress|Direct per project|Browser per project|Probe|
|---|---:|---:|---:|---:|---:|
|0|1|0|0|0|desktop1|
|1|0|0|0|0|0|
|2|1|1|1|0|0|
|3|3|3|3|0|0|
|4|0|0|0|0|0|
|5|0|0|0|0|0|
|6|22|22|6|16|0|
|7|0|0|0|0|0|
|8|49|49|5|44|0|
|9|0|0|0|0|0|

151 total ingress equals151 finishes. Aborted0, outstanding-at-case-end0, late ingress0, late settlements0 in every case. Case6 per project:20x200,1x304,1x400; case8:38x200,8x304,3x404. Maximum simultaneous ingress4 is HTTP overlap, not four active native workers. All recorded headers numerically reportlimit120. Initial counted probe remaining119/reset60; desktopcase8 endsremaining44/reset20; mobilecase3 remaining40/reset3; mobilecase6 crosses the actual reset and endsremaining101/reset55; mobilecase8 endsremaining52/reset36. No429 occurred: the retained desktop failure added15seconds before later cases, so this timing-dependent pass does not invalidate earlier ordered429 evidence. Raw numeric observations remain in receipt.

Measured largest49. Replace provisional90 with proposed **94** reservation:49 observed +44 allowance equal to the busiest case's entire browser fanout +1 counted admission probe. The44 allowance is conservative scheduling/cache/abort variation headroom, not a claim that44 extra requests were observed or a permission to retry. Enforce actual94 maximum; larger source fanout fails. Reservation94 remains below119 after one probe. The two anonymous contexts share the same native IP/window; no per-project reset.

Absolute before-case admission bound75seconds is a fail-closed ceiling across settlement and reset/recheck phases, not a guarantee that separate15+60+1 maxima fit. If pending settlement consumes too much of that ceiling, deny admission instead of refreshing deadlines. At most one initial observation probe when unknown and one post-reset recheck, both counted; reserve costs honestly and use actual remaining after each. No user-flow retry or within-case429 recovery.

Both complete-owner cases passed; previous missing final owner row remains unclassified/nonreproduced. This run's independent desktop case1 failure occurred on edit navigation: Game title expected Manual edit, observed empty for15seconds, while initial saved projection assertions passed. It is not public-rate related (case1 public ingress0) and must be diagnosed separately before canonical qualification. Failed-case zero ingress is measured executed-path evidence, not proof of every unexecuted downstream branch; source public fanout elsewhere is covered by reservation and enforced accounting. No scheduling source edit or canonical rerun is authorized by this report alone.

### Independent numerical-review clarifications

Saved measurement observations are first-three-plus-last samples, not proof of all151 header parses. The scheduling implementation must validate every observed native header. Concurrent response finish order can legitimately increase reported remaining: preserve a conservative minimum for the current observed window instead of treating arrival-order increase as corruption or renewed capacity. Renew capacity only through the bounded counted post-expiry probe after the observed reset deadline plus rounding. If both initial-observation and post-reset probes occur, both consume the same enforced94 ceiling; no extra allowance or silent overrun.94 is an accepted scheduling ceiling subject to actual accounting, not a guarantee of future source fanout.
