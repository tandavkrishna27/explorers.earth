# Music Interaction Completeness Design

## Goal

Complete the owner Music dashboard so playlist, queue, history, discovery, and playback interactions are predictable on desktop and mobile, while keeping the public page UI outside this change.

## Scope

- Queue rows use an accessible kebab menu for **Play now** and **Remove from queue**; existing drag reordering remains the primary ordering interaction.
- History rows use an accessible kebab menu for **Play again** and **Remove from history**. The header retains a confirmed **Clear history** bulk action.
- A submitted valid YouTube video URL is resolved automatically in the shared discovery input. Plain text remains a search. The explicit action menu remains available. Playlist import continues to be visibly unavailable until its independently designed API exists.
- Saved playlist actions preserve parity with the useful previous dashboard behavior: add playlist to queue, replace queue, and shuffle-and-start, each with explicit confirmation where it replaces active queue state.
- Entitlement-loading state uses the existing skeleton without misleading visible copy.
- Playback behavior is qualified with real fixture browser scenarios: next, previous, ended-to-next, failed-media skip once, and queue changes during a transition.

## Constraints

- Owner-only mutations must remain credential-derived, account-scoped, idempotent, and safe across retries.
- Do not restore historical automatic playback of the first queued song.
- Public page UI is owned by another workstream. This work may only verify its data contract.
- Reuse existing dashboard controls, menu semantics, confirmation patterns, shared switch component, responsive layout, and real PostgreSQL fixture.

## API and Data Flow

Reuse the canonical owner-scoped single-song deletion operation for one history row, but make it a durable owner operation: same idempotency key and target replays 204; the same key with a different target conflicts. The Explorer queue client exposes the intent as `removeHistorySong`; `MusicHistory` treats acknowledgement and subsequent refresh as separate outcomes.

Playlist actions use server-owned revisioned commands. Append is an atomic server command that preserves the current queue and appends validated saved-playlist entries. Replace and shuffle are confirmation-gated and submit an exact selected order through canonical replacement. Only after replacement acknowledgement may the dashboard request playback of the first resulting entry through the playback arbiter. If that second write fails, the new queue remains intact and the UI offers playback-only retry.

Discovery classifies submitted text locally: a canonical supported YouTube video URL uses `videoFromUrl`; plain text uses `searchYouTube`; playlist URLs are a third explicit outcome that performs neither request and shows the visible import-unavailable explanation. It covers whitespace, `youtu.be`, watch, shorts, malformed URLs, and unsupported lookalike hosts.

## UI States

- One row menu is open at a time; menus use real buttons, `aria-haspopup`, `aria-expanded`, controlled menu IDs, Escape/outside close, and focus restoration. They close after an action begins, disable competing actions during mutation, and expose success/failure through existing accessible status and alert patterns.
- Individual destructive removals do not need a confirmation; bulk clear and queue replacement do.
- Skeleton-only loading hides the entitlement wording; retryable, failed, and read-only states retain actionable copy.
- Mobile retains a single column and menu targets at least 44px. At 390px, the title truncates, Play and menu remain visible, and the drag handle moves into an explicit reorder mode rather than forcing row overflow.

## Verification

TDD each client/server/UI behavior. Use deterministic controlled player ended/error events for sequencing semantics; browser UAT proves rendered controls but does not claim cross-origin YouTube completion. Run targeted unit/component tests, Tunes PostgreSQL integration tests, Explorer type/build checks, local fixture smoke, and browser UAT at desktop and 390px. Review the final diff, console/network failures, and public contract matrix before declaring PR readiness.
