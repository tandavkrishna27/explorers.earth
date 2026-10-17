# tunes — WebSocket Protocol

## Overview

tunes uses Socket.IO for real-time communication between the server and connected clients. WebSocket connections enable live playlist updates, player state synchronization, and guest activity tracking without polling.

## Connection Setup

**Server**: WebSocket handling is initialized in `server/routes/playlistRoutes.ts` alongside the playlist REST routes.

**Client**: The `client/src/hooks/use-websocket.tsx` hook manages the Socket.IO connection, event listeners, and reconnection logic.

### Connection Flow

1. Client authenticates via REST API (login/session)
2. Client establishes Socket.IO connection to the server
3. Server authenticates the WebSocket connection using the session
4. Client joins a "room" keyed by the user's ID
5. All events for that user are broadcast to their room
6. Guests connect to the host's room via the guest URL

## Rooms

Each authenticated user has a Socket.IO room identified by their user ID. This ensures:
- All of a host's connected devices receive updates
- Guest connections join the host's room
- Events are scoped — no cross-user leakage

## Client → Server Events

### Playlist Management

```typescript
// Update playlist state (add, remove, move, play, skip songs)
{
  type: 'PLAYLIST_UPDATE',
  payload: {
    playlistId: number,
    songId: number,
    action: 'add' | 'remove' | 'move' | 'play' | 'skip',
    position?: number       // For 'move' action
  }
}
```

### Feature Toggles

```typescript
// Toggle venue features on/off
{
  type: 'FEATURE_TOGGLE',
  payload: {
    feature: 'songRequests' | 'guestPlay' | 'playlistSharing' | 'recentlyPlayedVisibility',
    enabled: boolean
  }
}
```

### Player State

```typescript
// Sync player state across devices
{
  type: 'PLAYER_STATE',
  payload: {
    action: 'play' | 'pause' | 'seek' | 'stop',
    position?: number,       // Seek position in seconds
    youtubeId?: string       // Currently playing song
  }
}
```

### Guest Actions

```typescript
// Guest interactions (join, leave, request songs)
{
  type: 'GUEST_ACTION',
  payload: {
    action: 'request_song' | 'join' | 'leave',
    songData?: {             // For 'request_song'
      youtubeId: string,
      title: string,
      artist: string,
      thumbnailUrl: string,
      duration: number
    },
    guestInfo?: {            // For 'join'
      name: string,
      deviceInfo: string
    }
  }
}
```

## Server → Client Events

### Playlist State (Full Sync)

```typescript
// Complete playlist state broadcast
{
  type: 'PLAYLIST_STATE',
  payload: {
    playlists: Array<{
      id: number,
      name: string,
      isDefault: boolean,
      isVisibleToGuests: boolean,
      songs: Array<{
        id: number,
        youtubeId: string,
        title: string,
        artist: string,
        thumbnailUrl: string,
        duration: number,
        position: number,
        addedBy: string
      }>
    }>,
    currentlyPlaying: {
      playlistId: number,
      songId: number,
      youtubeId: string,
      title: string,
      artist: string,
      position: number,
      currentTime: number
    } | null,
    playHistory: Array<{
      youtubeId: string,
      title: string,
      artist: string,
      playedAt: string
    }>
  }
}
```

### Player Updates

```typescript
// Player state changes
{
  type: 'PLAYER_UPDATE',
  payload: {
    status: 'playing' | 'paused' | 'ended' | 'buffering' | 'error',
    currentTime: number,
    duration: number,
    youtubeId: string | null,
    playlistId: number | null,
    songId: number | null
  }
}
```

### Feature State

```typescript
// Current feature toggle states
{
  type: 'FEATURE_STATE',
  payload: {
    songRequests: boolean,
    guestPlay: boolean,
    playlistSharing: boolean,
    recentlyPlayedVisibility: boolean
  }
}
```

### Guest Activity

```typescript
// Guest presence and activity updates
{
  type: 'GUEST_ACTIVITY',
  payload: {
    guestCount: number,
    recentActivity: Array<{
      action: 'join' | 'leave' | 'request_song',
      guestName: string | null,
      timestamp: string,
      details?: string
    }>
  }
}
```

## Reconnection

Socket.IO handles reconnection automatically with exponential backoff. The client hook (`use-websocket.tsx`) manages:

- Connection status display via `connection-status.tsx` component
- Re-joining the user's room after reconnection
- Re-fetching playlist state on reconnect to ensure consistency

### Public Music operational events

Public Music live synchronization emits a separate operational stream; it is
never sent to product analytics. Backend records use `music-public-ops/v1` and
browser records use `music-public-browser-ops/v1`. Allowed dimensions are fixed
enums: lifecycle outcome, HTTP operation/status, socket role/reason,
invalidation kind, parser class, and bounded duration. Slugs, Account/User
identity, capabilities, queries, media URLs, credentials, and socket room names
are forbidden.

The socket is only an invalidation signal. `music_public_change` contains
`version`, `kind`, and `revision`; accepted events refetch canonical HTTP state.
Operational events cover admission/rejection/disconnect, reconnect,
invalidation acceptance/staleness, fallback polling, and revocation enforcement.
Browser collectors also emit identifier-free active-session lifecycle counters;
`started - stopped` is the denominator and fallback `entered - exited` is the
numerator, so repeated retries cannot inflate the rate. Listener reconnect records
carry bounded `disconnectMs`, so no instance or connection label is required.

Public admission uses either the public slug or the unlisted capability for the
same slug and rechecks current publication/lifecycle authority. After reconnect,
the browser rejoins, refetches canonical HTTP state, ignores stale revisions,
and coalesces bursts. When transport remains unavailable, foreground polling
backs off through 30/60/120/240/300 seconds and stops while hidden, offline, or
unmounted. Revocation removes cached unlisted content. Capabilities never appear
in events, URLs, logs, trace attachments, or analytics payloads.

Public socket admission is a handshake field, never a URL query string:

```json
{"auth":{"role":"guest","publicSlug":"public_slug-123","capability":"header-equivalent-secret"}}
```

Successful invalidation contains no identity or secret:

```json
{"version":"music-public-change/v1","kind":"queue","revision":8}
```

On `connect_error`, `disconnect`, a revision gap, or a newer revision, the
client announces reconnecting, rejoins the authorized slug, and performs a
canonical HTTP refetch before rendering. A revision less than or equal to the
rendered revision is ignored. Private publication or capability revocation
clears rendered and cached content and returns the same `PUBLIC_NOT_FOUND`
recovery surface; it never retries with stale content.

## Key Files

| File | Purpose |
|------|---------|
| `server/routes/playlistRoutes.ts` | Server-side Socket.IO event handlers and room management |
| `client/src/hooks/use-websocket.tsx` | Client-side Socket.IO hook with event handling |
| `client/src/components/connection-status.tsx` | WebSocket connection status UI indicator |
