# Responsive Music Dashboard Specification

## Goal

Restore the authenticated Music dashboard to the established Explorers management-page language while keeping the secured owner workspace introduced in PR #105 and stabilized through PR #111.

## Experience

- Keep the global dashboard header and navigation unchanged. Remove the duplicate in-page `Music` heading.
- Center a page-level master tab switcher ordered `Playlists`, then `Live`; `Playlists` is the default view.
- Treat `Playlists` as the collection-management view used elsewhere in Explorers: a left-aligned visibility/filter group, a right-aligned `New playlist` split action, playlist search, responsive collection cards, and a focused playlist-detail view for song management.
- The `New playlist` split action creates either a private or public playlist. Workspace-wide sharing remains a separate, clearly labelled action and is not conflated with a playlist's visibility.
- Treat `Live` as the playback workspace. Use one unified discovery input for text search, a supported song URL, or a supported playlist URL. The attached action menu exposes `Search`, `Play URL`, and the truthful import capability state.
- Place the audio-first player directly below discovery. Video is hidden by default and exposed through an explicit `Show video` toggle.
- Place the queue beside guest controls and recently played on desktop and in a single-column priority order on mobile.
- Guest controls describe and control the eventual public Music surface: search visibility, playlist visibility, queue visibility, recently-played visibility, song requests, and guest playback.
- Saved playlists retain create, rename, visibility, queue replacement, song addition/removal, reorder, and guarded deletion. Those actions live in playlist detail, not on every collection card.
- On mobile, preserve the Explorers bottom navigation, avoid horizontal page overflow, use 44px minimum targets, and expose a sticky compact player above global navigation while the full player is out of view.

## Functional boundaries

- No separate Tunes login.
- Do not restore retired legacy LocalTunes endpoints or clients.
- Use the existing secured `musicApi`, `musicWorkspaceClient`, queue client, search client, publication commands, and rollout boundary.
- Playlist import and guest-control mutations must remain unavailable until backed by an authenticated server contract. The UI may expose a clear unavailable state only when the backend capability is absent; it must not pretend success.
- Existing public Music pages and URLs are outside this implementation; this branch must not edit their UI.

## Required states

- Loading, stale/read-only, empty queue, empty playlist collection, empty selected playlist, zero search results.
- Master-tab selection, playlist filters, playlist search, collection-to-detail navigation, and return-to-collection navigation.
- Search, URL lookup, invalid input, import unavailable, request failure, retry.
- Audio-only player, expanded video, no current song, unavailable media, recovery/skip.
- Queue and playlist mutation pending, success, failure, confirmation, and refresh failure.
- Desktop, 768px tablet, 390px mobile, keyboard navigation, reduced motion, and screen-reader labels.

## Acceptance evidence

- Focused component tests follow red-green TDD.
- Existing Music component suite remains green.
- Production build succeeds.
- Playwright validates desktop and mobile layout, keyboard operation, no overflow, sticky player, and console/network health using local fixtures.
- Authenticated local UAT covers every available Music workflow before any deployment.
