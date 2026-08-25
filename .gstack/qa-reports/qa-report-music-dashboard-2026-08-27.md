# Music Dashboard Functional UAT Report

**Date:** 2026-08-27  
**Scope:** Authenticated Music dashboard, playlist publication, player, queue, history, guest controls, and public-page reflection  
**Environment:** `codex/music-dashboard-responsive` local frontend, production Tunes proxy, current full-stack fixture lane  
**Verdict:** Not release-ready

## Executive summary

The redesigned dashboard shell is usable for navigation and read-only inspection, but the current branch cannot yet be certified functionally. The local browser is intentionally rejected by the production Tunes origin guard for mutation requests, which explains the observed failures when reordering the queue and toggling switches. Separately, code review found real product defects that remain even when the request reaches the server: queue/search Play actions do not reliably start media playback, queue writes are conflated with refresh failures, recently played has no replay action, and the public Music page implements only a small subset of the backend guest contract.

The existing component and browser-contract suites pass because they mock the API and mostly verify rendered state, not end-to-end media behavior or public reflection. The isolated full-stack Playwright lane is also stale relative to the redesigned UI and its existing fixture did not accept the current authentication flow, so it cannot currently provide release evidence.

## Health score

**52 / 100**

- Visual dashboard structure and read-only loading: good
- Core mutations from the current local test environment: blocked
- Playback command behavior: incomplete
- Public-page parity and reflection: incomplete
- Automated end-to-end confidence: insufficient

## Evidence collected

### Browser UAT

- Authenticated local dashboard loaded Playlists and Live views.
- Queue reorder reproduced the visible alert `Queue update failed. Try again.` and restored the prior order.
- Playlist and guest-control toggles produced unhandled `MusicClientError: Music is temporarily unavailable` errors.
- Sharing settings showed the workspace as **Unlisted** and the visible playlists as **Draft**.
- Queue-row Play changed application state, but code tracing showed it does not propagate an explicit autoplay command to the media element.
- The recently played list has no Play action.

Screenshots:

- `.gstack/qa-reports/screenshots/music-playlists-local.png`
- `.gstack/qa-reports/screenshots/music-live-queue-failure.png`

### Transport and origin validation

Production Tunes preflight behavior was checked directly:

- `Origin: http://127.0.0.1:5173` -> HTTP 410, without `Access-Control-Allow-Origin`
- `Origin: https://explorers.earth` -> HTTP 200, with `Access-Control-Allow-Origin: https://explorers.earth`

The Vite development transport rewrites Tunes requests to `/__localtunes`, whose proxy target is `https://localtunes.earth`. The browser's local `Origin` remains intact, so production correctly rejects state-changing local requests. Production origin protection should not be weakened to make local UAT work.

### Automated checks reviewed

- Music component suite: 81/81 passing from the implementation pass
- Music browser-contract and accessibility suite: 19/19 passing from the implementation pass
- Frontend production build: passing from the implementation pass
- Current full-stack fixture lane: not certifying this branch
  - Reusing the current 5173 server did not exercise the fixture backend.
  - Running against 55173 failed during the expected fixture login transition.
  - The test still expects the previous Queue / Guest controls / Recent tab structure.
  - Existing fixture services respond, but the compose command requires an unavailable host secret-path variable before the stack can be recreated and inspected.

## Findings

### P1 — Local mutation UAT is pointed at a production service that rejects the local origin

**Observed:** Queue reorder and switches fail from `http://127.0.0.1:5173`.  
**Root cause:** The frontend development proxy targets production Tunes, while Tunes applies an exact-origin mutation guard.  
**Impact:** Local read-only rendering works, but queue, playlist, publication, and guest-control mutations cannot be certified in this environment.  
**Required resolution:** Run the current frontend and current Tunes backend in an isolated fixture configured to allow only the fixture frontend origin.

### P1 — Play commands from Search and Queue do not reliably start the media element

**Observed:** Clicking a row Play action can change the selected/current track without starting playback.  
**Root cause:** `MusicPlayer` owns a private `playAfterChange` intent that is set by its own next/previous transitions. External actions update the server current song but do not deliver that intent to the player.  
**Impact:** A UI action labelled Play can behave like Select.  
**Required resolution:** Introduce one explicit playback-command contract shared by Search, Queue, History, and Player, then assert actual media `play()` behavior.

### P1 — Queue write success and refresh failure are reported as the same mutation failure

**Observed:** The queue helper performs a mutation and then reloads the queue inside one failure boundary.  
**Root cause:** Mutation result and subsequent synchronization result are not represented independently.  
**Impact:** A successful server write followed by a failed read can be reported as a failed write and trigger misleading rollback/error UI.  
**Required resolution:** Separate optimistic mutation state, mutation acknowledgment, and background reconciliation.

### P1 — Playlist visibility toggles have no safe pending/rollback/error interaction

**Observed:** The control can be toggled while a request is in flight and rejection is not handled inside the component.  
**Root cause:** The bespoke playlist switch calls an async callback without a pending state or contained rejection.  
**Impact:** Double submissions, stale UI, and unhandled promise errors are possible.  
**Required resolution:** Use the shared switch primitive with pending lock, optimistic state, rollback, and an accessible status message.

### P1 — Public Music page does not implement the guest-control contract

**Observed:** The public page renders static playlist/song content only.  
**Root cause:** The client casts the JSON response to a narrow shape and ignores backend fields already available for current song, played songs, and guest permissions.  
**Impact:** Dashboard controls for guest search, on-device playback, queue visibility, history visibility, and sharing cannot be verified as reflected on the public page.  
**Required resolution:** Validate the response schema and implement conditional public UI behavior for every supported flag.

### P1 — The full-stack UAT lane is stale and currently cannot certify the redesigned branch

**Observed:** The fixture test fails before the current Music scenarios and retains selectors for the old information architecture.  
**Root cause:** Fixture image/authentication state and test selectors were not advanced with the dashboard redesign.  
**Impact:** Passing mocked tests can conceal broken real transport, persistence, and public reflection.  
**Required resolution:** Rebuild the fixture from the exact branch, provide its required secret-file paths, update selectors, and make this suite a required release gate.

### P2 — Music switches do not match the Explorers design system

**Observed:** Playlist and guest controls use bespoke switch markup and dimensions.  
**Root cause:** They do not use the existing shared `Switch` / `SwitchButton` components.  
**Impact:** Visual and interaction behavior differs from other Explorers pages.  
**Required resolution:** Adopt one shared accessible primitive and its standard loading/focus/disabled states.

### P2 — Recently played is display-only

**Observed:** History rows do not expose Play.  
**Impact:** Users cannot restart a previously played item from history.  
**Required resolution:** Add a row Play action through the canonical playback-command contract.

### P2 — Playlist `PUBLIC` / `DRAFT` labels overstate effective exposure

**Observed:** The card badge reflects only the playlist visibility flag.  
**Root cause:** Effective public exposure also depends on workspace publication and `allowPlaylistSharing`.  
**Impact:** A card can say Public while the playlist is not actually available to guests.  
**Required resolution:** Represent the three-gate state explicitly, or use safer labels such as Shared / Not shared plus an effective-public status.

## Publication contract that must be tested

A playlist is guest-visible only when all applicable gates allow it:

1. Workspace publication is Public or a valid Unlisted link is used.
2. The playlist is marked visible to guests.
3. Guest playlist sharing is enabled.

Private workspace access, expired/revoked unlisted links, and disabled playlist sharing must remain fail-closed.

## Release gate

Do not deploy this UI as complete until the repaired isolated full-stack suite and authenticated browser UAT demonstrate:

- real queue add/play/reorder/remove/clear/persistence;
- actual media play/pause/next/previous behavior;
- playlist create/rename/delete/song membership/order/visibility;
- guest-control persistence and public reflection;
- public, private, unlisted, revoked, and disabled-control scenarios;
- recently played replay and ordering;
- desktop and mobile layouts;
- no relevant console errors or failed network requests.
