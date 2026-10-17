# Explorers Music production UAT — 2026-08-27

## Environment

- Frontend: `https://explorers.earth/recommendations/music`
- Tunes API: `https://localtunes.earth`
- Deployed commit at baseline: `1f8d571214d2a18e7e8cc6714e6bd8306af15fce`
- Authenticated account: existing owner account (credentials excluded)
- Rollout contract: owner workspace enabled; guest workspace and playlist imports disabled

## UAT matrix

| Area | Baseline result | Evidence / follow-up |
| --- | --- | --- |
| Identity and workspace bootstrap | Pass | Owner workspace loads after identity establishment. |
| Search | Partial | `Daft Punk Get Lucky`, `Coldplay Yellow`, `Beatles Hey Jude`, and `Radiohead Creep` returned results. Pagination/empty/no-result still pending after ISSUE-001. |
| Player | Partial | Play-now started `Radiohead - Creep`; play/pause and the embedded player responded correctly. Sustained testing remains blocked by ISSUE-001. |
| Queue | Partial | Added one and two selected results, persisted across reload, and moved `Hey Jude (Remastered 2015)` upward with the correct live-region update. Remove/clear still pending. |
| Recently played | Partial | Empty-state loads correctly; completion/history lifecycle still pending. |
| Playlist creation | Pass | Created `Codex UAT 2026-08-27` with a description and confirmed persistence. |
| Playlist editing and membership | Fail | Rename/privacy controls render, but the Explorers UI has no action for adding a discovered song to a saved playlist. ISSUE-002. |
| URL import/discovery | Pending | Must remain available for individual media URLs. Playlist imports must remain disabled by rollout. |
| Responsive UI | Pending | Desktop and mobile visual/interaction review after functional stability. |
| Console/network health | Partial | No app-origin exception during ISSUE-001; an unrelated browser-extension `share-modal.js` error was excluded. |

## ISSUE-001 — Music workspace disappears at rollout renewal

**Severity:** P1  
**Status:** Reproduced; fix under verification

### Reproduction

1. Open the authenticated Music route.
2. Wait for the owner workspace to load.
3. Search for a song such as `Coldplay Yellow`.
4. Observe results remain visible initially.
5. At the cached exposure boundary, the workspace, search results, player and queue disappear and the page returns to `Checking what's included…`.

Measured reproduction: results remained visible for 13 seconds and disappeared at second 14, aligned with the original server-issued exposure expiry.

The failure was reconfirmed after the successful PR #110 deployment at exact main commit `1f8d571214d2a18e7e8cc6714e6bd8306af15fce`: explicit retry restored the complete workspace, `Radiohead Creep` search and playback worked, and the workspace disappeared again while exercising URL discovery at the next decision boundary. This confirms the deployment configuration is healthy and the still-undeployed PR #111 renewal repair is the required next gate.

### Root cause

The browser refreshes at the exposure's absolute `expiresAt`. A small client/server clock difference can make the Tunes service regard its cached decision as still valid and return the same exposure. The client correctly rejects that already-expired decision and fails closed. It then waits for the next retry, temporarily hiding all owner-workspace controls.

### Repair

Renew cached decisions inside a bounded five-second server-side clock-skew window. This preserves fail-closed behavior and keeps the maximum cache TTL at sixty seconds.

Regression coverage: `tunes/server/test/music-feature-decision-service.regression-1.test.ts`.

## ISSUE-002 — Songs cannot be added to saved playlists in Explorers

**Severity:** P1  
**Status:** Confirmed by production UI and source trace; repair pending after ISSUE-001 deployment

### Evidence

1. Create or select a saved playlist.
2. Search successfully and select one or more results.
3. The only available bulk action is `Add N selected to queue`; there is no saved-playlist target or add-to-playlist action.
4. Empty saved playlists consequently cannot exercise song reorder, removal, or queue replacement.

The Tunes backend already exposes `POST /api/playlists/:playlistId/songs`, but `explorers-earth/src/features/music/musicWorkspaceClient.ts` has no corresponding client method and `MusicSearch`/`MusicDashboard` expose no owner UI for it. This is a missing frontend workflow rather than an API outage.

## Notes

- The production UAT playlist is deliberately retained until the remaining playlist lifecycle tests are complete.
- This report is incremental. Final production verdict requires every pending row to pass on the exact deployed repair commit.

## Isolated fixture re-verification — 2026-08-27

**Target:** `http://localhost:55173` (branch-local Explorers + Tunes + Strapi + disposable PostgreSQL fixture)

### Defect found and repaired

Adding a song to an owner playlist produced a successful `GET /api/playlists` response whose nested `addedAt` value had no UTC offset, for example `2026-08-27T14:43:19.866509`. Explorer intentionally rejects that malformed DTO, which made the owner dashboard render an empty playlist collection after a reload. The same unsafe timestamp representation existed in the public resource payload.

The repository now serializes both owner and public playlist-song timestamps as RFC3339 UTC strings. The fix was made test-first:

- Red: the real PostgreSQL repository regression asserted an offset-bearing `addedAt` and failed on the previous value.
- Green: `tunes/server/test/music-domain-repository.integration.test.ts` passed **15/15** after the serialization correction.
- Browser: the rebuilt fixture passed **3/3** real Playwright journeys:
  - owner search and add-to-queue mutation through the browser UI;
  - mobile workspace and persisted guest-control switch;
  - public/private/unlisted access plus playlist visibility and sharing-gate matrix.

### Visible UI check

Desktop and 390px mobile UI were opened against the rebuilt fixture. The live workspace displayed the search bar, media-player controls, queue rows, guest-control switches, and recently-played cards. The mobile page had no horizontal overflow.

### Remaining observation

The fully usable fixture workspace still displays `Checking what’s included…` above the tabs because fixture entitlement is intentionally unresolved while the local owner-workspace preview is enabled. It does not block functionality, but it is misleading copy and should be resolved before treating the visual state as finished.
