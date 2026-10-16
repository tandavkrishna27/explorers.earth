import { describe, expect, it } from "vitest";
import { hashGuestCapability } from "../policies/musicSurfacePolicy";
import { MusicDomainRepository } from "../repositories/musicDomainRepository";

function recordingPool(rows: unknown[] = []) {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  let publicRevision = 0;
  const query = async (text: string, values: unknown[] = []) => {
    calls.push({ text: text.replace(/\s+/g, " ").trim(), values });
    if (/UPDATE users SET music_queue_revision/.test(text)) return { rows: [{ music_queue_revision: 1 }], rowCount: 1 };
    if (/UPDATE users SET public_snapshot_revision/.test(text)) return { rows: [{ public_snapshot_revision: ++publicRevision }], rowCount: 1 };
    return { rows, rowCount: rows.length };
  };
  return {
    calls,
    pool: {
      query,
      async connect() {
        return {
          async query(text: string, values: unknown[] = []) {
            if (/^(?:BEGIN|COMMIT|ROLLBACK|SELECT pg_advisory_xact_lock)/.test(text)) return { rows: [], rowCount: 0 };
            return query(text, values);
          },
          release() {},
        };
      },
    },
  };
}

function dashboardPool(rows: Array<{ status: string; playedAt?: string; id: number; [key: string]: unknown }>) {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const query = async (text: string, values: unknown[] = []) => {
    const normalized = text.replace(/\s+/g, " ").trim();
    calls.push({ text: normalized, values });
    if (/status IN \('queued','playing'\)/.test(normalized)) {
      let active = rows.filter((row) => row.status === "queued" || row.status === "playing");
      if (/ORDER BY \(status='playing'\) DESC,position,id/.test(normalized)) {
        active = active.sort((left, right) => Number(right.status === "playing") - Number(left.status === "playing")
          || Number(left.position) - Number(right.position) || left.id - right.id);
      }
      active = active.slice(0, /LIMIT 500/.test(normalized) ? 500 : undefined)
        .sort((left, right) => Number(left.position) - Number(right.position) || left.id - right.id);
      return { rows: active, rowCount: active.length };
    }
    if (/status='played'/.test(normalized)) {
      const played = rows.filter((row) => row.status === "played")
        .sort((left, right) => Date.parse(right.playedAt ?? "") - Date.parse(left.playedAt ?? "") || right.id - left.id)
        .slice(0, 500);
      return { rows: played, rowCount: played.length };
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, pool: { query, connect: async () => ({ query, release() {} }) } };
}

describe("MusicDomainRepository owner predicates", () => {
  it("accepts a retained unlisted capability after the same publication becomes public", async () => {
    // Break caught: promotion from unlisted to public strands the mounted client because its
    // session-retained capability makes otherwise-public read-only socket admission fail.
    const capability = "R".repeat(43);
    const repository = new MusicDomainRepository({ query: async () => ({ rows: [{
      id: 17, identity_status: "active", guest_discoverable: true,
      guest_capability_hash: hashGuestCapability(capability), guest_capability_revoked_at: null,
    }], rowCount: 1 }) } as never);
    await expect(repository.resolvePublicMusicSocketAuthority("public-slug", capability))
      .resolves.toEqual({ musicUserId: 17, active: true });
  });

  it("atomically stores and replays one guest request without another queue revision or notification", async () => {
    let receipt: { request_hash: string; response_body: { accepted: true } } | undefined;
    let queueInserts = 0;
    let queueRevisions = 0;
    let publicRevisions = 0;
    let notifications = 0;
    const calls: string[] = [];
    const client = { async query(text: string, values: unknown[] = []) {
      const normalized = text.replace(/\s+/g, " ").trim(); calls.push(normalized);
      if (/^(?:BEGIN|COMMIT|ROLLBACK)|pg_advisory_xact_lock/.test(normalized)) return { rows: [], rowCount: 0 };
      if (/SELECT id FROM users u WHERE guest_url/.test(normalized)) return { rows: [{ id: 7 }], rowCount: 1 };
      if (/SELECT id,allow_song_requests/.test(normalized)) return { rows: [{ id: 7, allow_song_requests: true, guest_discoverable: true, guest_capability_hash: null }], rowCount: 1 };
      if (/SELECT request_hash,response_body FROM music_owner_operations/.test(normalized)) return { rows: receipt ? [receipt] : [], rowCount: receipt ? 1 : 0 };
      if (/WITH ordered AS/.test(normalized)) return { rows: [], rowCount: 0 };
      if (/SELECT count\(\*\)::integer AS count FROM songs/.test(normalized)) return { rows: [{ count: queueInserts }], rowCount: 1 };
      if (/INSERT INTO songs/.test(normalized)) { queueInserts += 1; return { rows: [], rowCount: 1 }; }
      if (/music_queue_revision=music_queue_revision\+1/.test(normalized)) { queueRevisions += 1; return { rows: [], rowCount: 1 }; }
      if (/public_snapshot_revision=public_snapshot_revision\+1/.test(normalized)) { publicRevisions += 1; return { rows: [{ public_snapshot_revision: publicRevisions }], rowCount: 1 }; }
      if (/pg_notify\('music_public_change'/.test(normalized)) { notifications += 1; return { rows: [], rowCount: 1 }; }
      if (/INSERT INTO music_owner_operations/.test(normalized)) { receipt = { request_hash: String(values[3]), response_body: JSON.parse(String(values[4])) }; return { rows: [], rowCount: 1 }; }
      return { rows: [], rowCount: 0 };
    }, release() {} };
    const repository = new MusicDomainRepository({ query: async () => ({ rows: [] }), connect: async () => client } as never);
    const song = { youtubeId: "abcdefghijk", title: "Song", artist: "Artist", thumbnailUrl: "https://img.example/song.jpg" };
    await expect(repository.addGuestSongIdempotent("public-owner", undefined, "198.51.100.1", "request-key-1", song))
      .resolves.toEqual({ status: "completed", replayed: false, response: { accepted: true } });
    await expect(repository.addGuestSongIdempotent("public-owner", undefined, "198.51.100.1", "request-key-1", song))
      .resolves.toEqual({ status: "completed", replayed: true, response: { accepted: true } });
    await expect(repository.addGuestSongIdempotent("public-owner", undefined, "198.51.100.2", "request-key-1", { ...song, title: "Different" }))
      .resolves.toEqual({ status: "conflict" });
    expect({ queueInserts, queueRevisions, publicRevisions, notifications }).toEqual({ queueInserts: 1, queueRevisions: 1, publicRevisions: 1, notifications: 1 });
    expect(calls.filter((text) => text === "COMMIT")).toHaveLength(3);
    const authorityReads = calls.filter(text => /SELECT id(?:,allow_song_requests,guest_discoverable,guest_capability_hash)? FROM users u WHERE guest_url/.test(text));
    expect(authorityReads).toHaveLength(6);
    for (const text of authorityReads) expect(text).toContain("WHERE ami.music_user_id=u.id AND ca.status IS DISTINCT FROM 'active'");
    expect(calls.findIndex((text) => text.includes("SELECT id FROM users u WHERE guest_url")))
      .toBeLessThan(calls.findIndex((text) => text.includes("pg_advisory_xact_lock")));
    expect(calls.findIndex((text) => text.includes("pg_advisory_xact_lock")))
      .toBeLessThan(calls.findIndex((text) => text.includes("SELECT id,allow_song_requests") && text.includes("FOR UPDATE")));
  });
  it("replays one owner playlist create after its response is lost", async () => {
    // Break caught: retrying an acknowledged-but-lost create response inserts a duplicate playlist.
    const playlist = {
      id: 91, user_id: 7, name: "One create", description: null, is_visible_to_guests: false,
      created_at: "2026-08-27T10:00:00.000Z", updated_at: "2026-08-27T10:00:00.000Z",
    };
    let stored: { request_hash: string; status_code: number; response_body: unknown } | undefined;
    let inserts = 0;
    let publicRevisionAdvances = 0;
    const client = { async query(text: string, values: unknown[] = []) {
      const normalized = text.replace(/\s+/g, " ").trim();
      if (/^(?:BEGIN|COMMIT|ROLLBACK)|pg_advisory_xact_lock/.test(normalized)) return { rows: [], rowCount: 0 };
      if (/SELECT request_hash,status_code,response_body/.test(normalized)) return { rows: stored ? [stored] : [], rowCount: stored ? 1 : 0 };
      if (/SELECT count\(\*\)::integer AS count FROM playlists/.test(normalized)) return { rows: [{ count: inserts }], rowCount: 1 };
      if (/INSERT INTO playlists/.test(normalized)) { inserts += 1; return { rows: [playlist], rowCount: 1 }; }
      if (/UPDATE users SET public_snapshot_revision/.test(normalized)) {
        publicRevisionAdvances += 1;
        return { rows: [{ public_snapshot_revision: publicRevisionAdvances }], rowCount: 1 };
      }
      if (/INSERT INTO music_owner_operations/.test(normalized)) {
        stored = { request_hash: String(values[3]), status_code: 201, response_body: JSON.parse(String(values[4])) };
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }, release() {} };
    const repository = new MusicDomainRepository({ query: async () => ({ rows: [] }), connect: async () => client } as never);
    const input = { name: "One create", description: null };

    await expect(repository.createPlaylistIdempotent(7, "lost-response-key", input))
      .resolves.toEqual({ status: "completed", replayed: false, response: playlist });
    await expect(repository.createPlaylistIdempotent(7, "lost-response-key", input))
      .resolves.toEqual({ status: "completed", replayed: true, response: playlist });
    expect(inserts).toBe(1);
    expect(publicRevisionAdvances).toBe(1);
  });

  it("replaces an owner queue in one locked transaction and returns canonical ordered state", async () => {
    // Break caught: queue replacement becomes a delete/add sequence outside one owner lock.
    const calls: Array<{ text: string; values: unknown[] }> = [];
    let select = 0;
    const client = {
      publicRevision: 0,
      async query(text: string, values: unknown[] = []) {
        calls.push({ text: text.replace(/\s+/g, " ").trim(), values });
        if (/SELECT request_hash,status_code,response_body/.test(text)) return { rows: [], rowCount: 0 };
        if (/SELECT u\.music_queue_revision/.test(text)) return { rows: [{ music_queue_revision: 4 }], rowCount: 1 };
        if (/SELECT ps\.id/.test(text)) return { rows: [
          { id: 31, youtube_id: "b", title: "B", artist: "Artist B", thumbnail_url: "https://img/b" },
          { id: 30, youtube_id: "a", title: "A", artist: "Artist A", thumbnail_url: "https://img/a" },
        ], rowCount: 2 };
        if (/INSERT INTO songs/.test(text)) return { rows: [
          { id: 101, user_id: 7, youtube_id: "b", title: "B", artist: "Artist B", thumbnail_url: "https://img/b", position: 0, status: "queued", played_at: null },
          { id: 102, user_id: 7, youtube_id: "a", title: "A", artist: "Artist A", thumbnail_url: "https://img/a", position: 1, status: "queued", played_at: null },
        ], rowCount: 2 };
        if (/UPDATE users SET music_queue_revision/.test(text)) return { rows: [{ music_queue_revision: 5 }], rowCount: 1 };
        if (/UPDATE users SET public_snapshot_revision/.test(text)) return { rows: [{ public_snapshot_revision: ++this.publicRevision }], rowCount: 1 };
        if (/SELECT id,user_id/.test(text)) { select += 1; return { rows: [], rowCount: 0 }; }
        return { rows: [], rowCount: 1 };
      },
      release() {},
    };
    const repository = new MusicDomainRepository({ query: async () => { throw new Error("outside transaction"); }, connect: async () => client } as never);
    await expect(repository.replaceQueue(7, "replace-key", 4, [
      { playlistId: 9, songId: 31 }, { playlistId: 9, songId: 30 },
    ])).resolves.toEqual({
      status: "completed", replayed: false,
      response: { version: "music-queue/v1", revision: 5, songs: [
        { id: 101, userId: 7, youtubeId: "b", title: "B", artist: "Artist B", thumbnailUrl: "https://img/b", position: 0, status: "queued", playedAt: null },
        { id: 102, userId: 7, youtubeId: "a", title: "A", artist: "Artist A", thumbnailUrl: "https://img/a", position: 1, status: "queued", playedAt: null },
      ] },
    });
    expect(calls[0].text).toBe("BEGIN");
    expect(calls.some(({ text }) => /pg_advisory_xact_lock/.test(text))).toBe(true);
    expect(calls.find(({ text }) => /SELECT request_hash,status_code,response_body/.test(text))?.text).not.toMatch(/FOR UPDATE/);
    expect(calls.some(({ text }) => /JOIN playlists p/.test(text) && /p.user_id=\$1/.test(text))).toBe(true);
    expect(calls.some(({ text }) => /DELETE FROM songs/.test(text) && /status IN \('queued','playing'\)/.test(text))).toBe(true);
    expect(calls.filter(({ text }) => /UPDATE users SET public_snapshot_revision/.test(text))).toHaveLength(1);
    expect(calls.at(-1)?.text).toBe("COMMIT");
    expect(select).toBe(0);
  });

  it("rejects stale revisions and foreign playlist songs before deleting the active queue", async () => {
    const results = [
      { rows: [], rowCount: 0 }, { rows: [{ music_queue_revision: 8 }], rowCount: 1 },
    ];
    const statements: string[] = [];
    const client = { async query(text: string) {
      statements.push(text.replace(/\s+/g, " ").trim());
      if (/^(BEGIN|COMMIT|ROLLBACK)|pg_advisory_xact_lock/.test(text)) return { rows: [], rowCount: 0 };
      if (/DELETE FROM music_owner_operations/.test(text)) return { rows: [], rowCount: 0 };
      return results.shift() ?? { rows: [], rowCount: 0 };
    }, release() {} };
    const repository = new MusicDomainRepository({ query: async () => ({ rows: [] }), connect: async () => client } as never);
    await expect(repository.replaceQueue(7, "stale", 7, [{ playlistId: 9, songId: 31 }]))
      .resolves.toEqual({ status: "stale", revision: 8 });
    expect(statements.some((text) => /DELETE FROM songs/.test(text))).toBe(false);
    expect(statements.some((text) => /UPDATE users SET public_snapshot_revision/.test(text))).toBe(false);

    const foreignStatements: string[] = [];
    const foreignClient = { async query(text: string) {
      foreignStatements.push(text.replace(/\s+/g, " ").trim());
      if (/SELECT request_hash/.test(text)) return { rows: [], rowCount: 0 };
      if (/SELECT u\.music_queue_revision/.test(text)) return { rows: [{ music_queue_revision: 0 }], rowCount: 1 };
      if (/SELECT ps\.id/.test(text)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    }, release() {} };
    const foreign = new MusicDomainRepository({ query: async () => ({ rows: [] }), connect: async () => foreignClient } as never);
    await expect(foreign.replaceQueue(7, "foreign", 0, [{ playlistId: 99, songId: 31 }]))
      .resolves.toEqual({ status: "not_found" });
    expect(foreignStatements.some((text) => /DELETE FROM songs/.test(text))).toBe(false);
    expect(foreignStatements.some((text) => /UPDATE users SET public_snapshot_revision/.test(text))).toBe(false);
  });

  it("rolls back an injected queue replacement failure", async () => {
    const statements: string[] = [];
    const client = { async query(text: string) {
      statements.push(text.replace(/\s+/g, " ").trim());
      if (/SELECT request_hash/.test(text)) return { rows: [], rowCount: 0 };
      if (/SELECT u\.music_queue_revision/.test(text)) return { rows: [{ music_queue_revision: 0 }], rowCount: 1 };
      if (/SELECT ps\.id/.test(text)) return { rows: [{ id: 1, youtube_id: "a", title: "A", artist: "A", thumbnail_url: "https://img" }], rowCount: 1 };
      if (/INSERT INTO songs/.test(text)) throw new Error("injected queue failure");
      return { rows: [], rowCount: 1 };
    }, release() {} };
    const repository = new MusicDomainRepository({ query: async () => ({ rows: [] }), connect: async () => client } as never);
    await expect(repository.replaceQueue(7, "failure", 0, [{ playlistId: 9, songId: 1 }])).rejects.toThrow("injected queue failure");
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
  });

  it("uses the database clock to expire replay keys and performs only bounded owner cleanup", async () => {
    // Break caught: expired responses replay forever, block safe reuse, or trigger an unbounded global delete.
    const statements: Array<{ text: string; values: unknown[] }> = [];
    const client = { async query(text: string, values: unknown[] = []) {
      statements.push({ text: text.replace(/\s+/g, " ").trim(), values });
      if (/SELECT request_hash,status_code,response_body/.test(text)) return { rows: [], rowCount: 0 };
      if (/SELECT u\.music_queue_revision/.test(text)) return { rows: [{ music_queue_revision: 2 }], rowCount: 1 };
      if (/UPDATE users SET music_queue_revision/.test(text)) return { rows: [{ music_queue_revision: 3 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }, release() {} };
    const repository = new MusicDomainRepository({ query: async () => ({ rows: [] }), connect: async () => client } as never);
    await expect(repository.replaceQueue(7, "expired-key", 2, [])).resolves.toMatchObject({ status: "completed", replayed: false });
    const targeted = statements.find(({ text }) => /DELETE FROM music_owner_operations\s+WHERE music_user_id=\$1 AND operation=\$2 AND idempotency_key_hash=\$3/.test(text));
    expect(targeted?.text).toMatch(/expires_at<=transaction_timestamp\(\)/);
    expect(targeted?.values).toHaveLength(3);
    const cleanup = statements.find(({ text }) => /WITH expired AS/.test(text));
    expect(cleanup?.text).toMatch(/music_user_id=\$1[\s\S]*expires_at<=transaction_timestamp\(\)[\s\S]*LIMIT 100/i);
    expect(cleanup?.values).toEqual([7]);
    expect(statements.find(({ text }) => /SELECT request_hash/.test(text))?.text)
      .toMatch(/expires_at>transaction_timestamp\(\)/i);
    expect(statements.some(({ text }) => /UPDATE users SET public_snapshot_revision/.test(text))).toBe(false);
  });
  it("owner-predicates every playlist read/update/delete family", async () => {
    // Break caught: a resource ID alone can observe or mutate another owner's playlist.
    const harness = recordingPool();
    const repository = new MusicDomainRepository(harness.pool);
    await repository.listPlaylists(17);
    await repository.getPlaylist(17, 44);
    await repository.updatePlaylist(17, 44, { name: "safe", description: null });
    await repository.deletePlaylist(17, 44);
    for (const call of harness.calls) {
      expect(call.text.toLowerCase()).toMatch(/(?:user_id|id)\s*=\s*\$1/);
      expect(call.values[0]).toBe(17);
    }
    expect(harness.calls.slice(1).every((call) => call.text.toLowerCase().includes("id=$2") || call.text.toLowerCase().includes("id = $2"))).toBe(true);
    expect(harness.calls[0].text.toLowerCase()).toContain("jsonb_agg");
    expect(harness.calls[0].text.toLowerCase()).toContain("left join lateral");
    expect(harness.calls[0].text).toMatch(/FROM playlists[\s\S]*WHERE user_id=\$1[\s\S]*LIMIT 200/i);
    expect(harness.calls[0].text).toMatch(/FROM playlist_songs[\s\S]*WHERE playlist_id=p\.id[\s\S]*LIMIT 500/i);
  });

  it("owner-predicates every queue read/update/delete family", async () => {
    // Break caught: a song ID alone can update/delete user B's queue row.
    const harness = recordingPool();
    const repository = new MusicDomainRepository(harness.pool);
    await repository.listQueue(23);
    await repository.addSong(23, { youtubeId: "abcdefghijk", title: "title", artist: "artist", thumbnailUrl: "https://img" });
    await repository.setPlaying(23, 71);
    await repository.updateSongPosition(23, 71, 2);
    await repository.removeSong(23, 71);
    await repository.removeSongs(23, [71, 72]);
    await repository.clearHistory(23);
    for (const call of harness.calls) {
      if (call.text.includes("pg_notify('music_public_change'")) continue;
      if (call.text.toLowerCase().includes("insert into songs")) {
        expect(call.text.toLowerCase()).toContain("insert into songs(user_id");
        expect(call.values[0]).toBe(23);
        continue;
      }
      expect(call.text.toLowerCase()).toMatch(/(?:user_id|id)\s*=\s*\$1/);
      expect(call.values[0]).toBe(23);
    }
    expect(harness.calls.some((call) => /id\s*=\s*\$2/.test(call.text.toLowerCase()))).toBe(true);
    expect(harness.calls.some((call) => call.text.toLowerCase().includes("status in ('queued','playing')"))).toBe(true);
  });

  it("builds the private owner dashboard from only owner-predicated rows", async () => {
    const harness = dashboardPool([
      { id: 1, userId: 23, youtubeId: "q", status: "queued" },
      { id: 2, userId: 23, youtubeId: "p", status: "playing" },
      { id: 3, userId: 23, youtubeId: "h", status: "played" },
    ]);
    const result = await new MusicDomainRepository(harness.pool).ownerDashboard(23);
    const songReads = harness.calls.filter((call) => /FROM songs/.test(call.text));
    expect(songReads).toHaveLength(2);
    expect(songReads.every((call) => /user_id\s*=\s*\$1/i.test(call.text))).toBe(true);
    expect(songReads.every((call) => call.values[0] === 23)).toBe(true);
    expect(result).toEqual({
      playbackRevision: 0,
      songs: [expect.objectContaining({ id: 1 }), expect.objectContaining({ id: 2 })],
      currentlyPlaying: expect.objectContaining({ id: 2 }),
      playedSongs: [expect.objectContaining({ id: 3 })],
      queueRevision: 0,
      publication: { mode: "private", publicSlug: "" },
      guestControls: { allowSongRequests: false, allowGuestPlayOnDevice: false, allowPlaylistSharing: false, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false },
    });
  });

  it("treats an empty queue append as a no-op before opening a transaction", async () => {
    // Break caught: empty append commands spend a revision and persist a large replay response.
    const harness = recordingPool();
    const repository = new MusicDomainRepository(harness.pool);

    await expect(repository.appendQueue(7, "empty-append", 4, []))
      .resolves.toEqual({ status: "empty" });
    expect(harness.calls).toEqual([]);
  });

  it("performs bounded owner expiry cleanup before a non-empty queue append", async () => {
    // Break caught: append-only users accumulate expired owner operations forever.
    const statements: Array<{ text: string; values: unknown[] }> = [];
    const client = { async query(text: string, values: unknown[] = []) {
      const normalized = text.replace(/\s+/g, " ").trim();
      statements.push({ text: normalized, values });
      if (/^(?:BEGIN|COMMIT|ROLLBACK)|pg_advisory_xact_lock/.test(normalized)) return { rows: [], rowCount: 0 };
      if (/SELECT request_hash,response_body/.test(normalized)) return { rows: [], rowCount: 0 };
      if (/SELECT music_queue_revision FROM users/.test(normalized)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    }, release() {} };
    const repository = new MusicDomainRepository({ query: async () => ({ rows: [] }), connect: async () => client } as never);

    await expect(repository.appendQueue(7, "append-cleanup", 4, [{ playlistId: 9, songId: 31 }]))
      .resolves.toEqual({ status: "not_found" });
    const cleanup = statements.find(({ text }) => /WITH expired AS/.test(text));
    expect(cleanup?.text).toMatch(/music_user_id=\$1[\s\S]*expires_at<=transaction_timestamp\(\)[\s\S]*LIMIT 100/i);
    expect(cleanup?.values).toEqual([7]);
  });

  it("durably replays one saved-playlist song insertion and conflicts on a changed payload", async () => {
    // Break caught: a lost 201 response inserts the same saved song twice on retry.
    const song = {
      id: 41, playlist_id: 9, youtube_id: "abcdefghijk", title: "Saved", artist: "Artist",
      thumbnail_url: "https://img", position: 0, added_at: "2026-08-27T10:00:00.000Z",
    };
    let stored: { request_hash: string; response_body: unknown } | undefined;
    let inserts = 0;
    const client = { async query(text: string, values: unknown[] = []) {
      const normalized = text.replace(/\s+/g, " ").trim();
      if (/^(?:BEGIN|COMMIT|ROLLBACK)|pg_advisory_xact_lock/.test(normalized)) return { rows: [], rowCount: 0 };
      if (/SELECT request_hash,response_body/.test(normalized)) return { rows: stored ? [stored] : [], rowCount: stored ? 1 : 0 };
      if (/SELECT p\.id,count/.test(normalized)) return { rows: [{ id: 9, count: inserts }], rowCount: 1 };
      if (/INSERT INTO playlist_songs/.test(normalized)) { inserts += 1; return { rows: [song], rowCount: 1 }; }
      if (/UPDATE users SET public_snapshot_revision/.test(normalized)) return { rows: [{ public_snapshot_revision: 1 }], rowCount: 1 };
      if (/INSERT INTO music_owner_operations/.test(normalized)) {
        stored = { request_hash: String(values[3]), response_body: JSON.parse(String(values[4])) };
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }, release() {} };
    const repository = new MusicDomainRepository({ query: async () => ({ rows: [] }), connect: async () => client } as never);
    const input = { youtubeId: "abcdefghijk", title: "Saved", artist: "Artist", thumbnailUrl: "https://img" };

    await expect(repository.addPlaylistSongIdempotent(7, "saved-song-key", 9, input))
      .resolves.toEqual({ status: "completed", replayed: false, response: song });
    await expect(repository.addPlaylistSongIdempotent(7, "saved-song-key", 9, input))
      .resolves.toEqual({ status: "completed", replayed: true, response: song });
    await expect(repository.addPlaylistSongIdempotent(7, "saved-song-key", 9, { ...input, title: "Changed" }))
      .resolves.toEqual({ status: "conflict" });
    expect(inserts).toBe(1);
  });

  it("updates guest controls with one active-owner predicate", async () => {
    const controls = { allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false };
    const harness = recordingPool([{ allow_song_requests: true, allow_guest_play_on_device: false, allow_playlist_sharing: true, allow_recently_played_visibility: false, allow_queue_visibility: false }]);
    await expect(new MusicDomainRepository(harness.pool).updateGuestControls(23, controls)).resolves.toEqual(controls);
    expect(harness.calls[0].text).toMatch(/UPDATE users SET allow_song_requests=\$2/);
    expect(harness.calls[0].text).toMatch(/allow_queue_visibility=COALESCE\(\$6,allow_queue_visibility\)/);
    expect(harness.calls[0].text).toMatch(/WHERE id=\$1 AND identity_status='active'/);
    expect(harness.calls[0].values).toEqual([23, true, false, true, false, false]);
  });

  it("preserves the persisted queue visibility when a legacy four-field update arrives", async () => {
    const legacyControls = { allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: false };
    const harness = recordingPool([{ allow_song_requests: true, allow_guest_play_on_device: false, allow_playlist_sharing: true, allow_recently_played_visibility: false, allow_queue_visibility: true }]);

    await expect(new MusicDomainRepository(harness.pool).updateGuestControls(23, legacyControls)).resolves.toEqual({ ...legacyControls, allowQueueVisibility: true });
    expect(harness.calls[0].values).toEqual([23, true, false, true, false, undefined]);
  });

  it("orders owner played history by most recent play time", async () => {
    const harness = dashboardPool([
      { id: 3, userId: 23, status: "played", playedAt: "2026-08-25T10:00:00.000Z" },
      { id: 4, userId: 23, status: "played", playedAt: "2026-08-25T11:00:00.000Z" },
    ]);
    const result = await new MusicDomainRepository(harness.pool).ownerDashboard(23);
    expect(result.playedSongs.map((song) => song.id)).toEqual([4, 3]);
  });

  it("refuses to insert a 501st active queue song under the owner mutation lock", async () => {
    const statements: string[] = [];
    const client = { async query(text: string) {
      statements.push(text.replace(/\s+/g, " ").trim());
      if (/count\(\*\)/i.test(text)) return { rows: [{ count: 500 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }, release() {} };
    const repository = new MusicDomainRepository({ query: async () => ({ rows: [] }), connect: async () => client } as never);
    await expect(repository.addSong(23, { youtubeId: "abcdefghijk", title: "t", artist: "a", thumbnailUrl: "https://img" }))
      .resolves.toBeUndefined();
    expect(statements.some((text) => /INSERT INTO songs/i.test(text))).toBe(false);
    expect(statements.some((text) => /music_queue_revision=music_queue_revision\+1/i.test(text))).toBe(false);
  });

  it("refuses to create a 201st saved playlist under an owner collection lock", async () => {
    const statements: string[] = [];
    const client = { async query(text: string) {
      statements.push(text.replace(/\s+/g, " ").trim());
      if (/count\(\*\)/i.test(text)) return { rows: [{ count: 200 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }, release() {} };
    const repository = new MusicDomainRepository({ query: async () => ({ rows: [] }), connect: async () => client } as never);
    await expect(repository.createPlaylist(23, { name: "Too many", description: null })).resolves.toBeUndefined();
    expect(statements.some((text) => /INSERT INTO playlists/i.test(text))).toBe(false);
  });

  it("distinguishes a full saved playlist from an unowned playlist without inserting", async () => {
    for (const owned of [true, false]) {
      const statements: string[] = [];
      const client = { async query(text: string) {
        statements.push(text.replace(/\s+/g, " ").trim());
        if (/SELECT p\.id,count/i.test(text)) return { rows: owned ? [{ id: 7, count: 500 }] : [], rowCount: owned ? 1 : 0 };
        return { rows: [], rowCount: 0 };
      }, release() {} };
      const repository = new MusicDomainRepository({ query: async () => ({ rows: [] }), connect: async () => client } as never);
      await expect(repository.addPlaylistSong(23, 7, { youtubeId: "abcdefghijk", title: "t", artist: "a", thumbnailUrl: "https://img" }))
        .resolves.toBe(owned ? null : undefined);
      expect(statements.some((text) => /INSERT INTO playlist_songs/i.test(text))).toBe(false);
    }
  });

  it("caps owner played history at the client contract after ordering newest first", async () => {
    const rows = Array.from({ length: 501 }, (_, index) => ({
      id: index + 1,
      userId: 23,
      status: "played",
      playedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    }));
    const result = await new MusicDomainRepository(dashboardPool(rows).pool).ownerDashboard(23);
    expect(result.playedSongs).toHaveLength(500);
    expect(result.playedSongs[0].id).toBe(501);
    expect(result.playedSongs.at(-1)?.id).toBe(2);
  });

  it("caps a legacy oversized active queue so the owner dashboard remains usable for recovery", async () => {
    const harness = dashboardPool(Array.from({ length: 501 }, (_, index) => ({
      id: index + 1,
      userId: 23,
      status: index === 500 ? "playing" : "queued",
      position: index,
    })));
    const result = await new MusicDomainRepository(harness.pool).ownerDashboard(23);
    const activeRead = harness.calls.find((call) => /status IN \('queued','playing'\)/.test(call.text));
    expect(activeRead?.text).toMatch(/ORDER BY \(status='playing'\) DESC,position,id LIMIT 500/);
    expect(activeRead?.text).toMatch(/ORDER BY position,id$/);
    expect(result.songs).toHaveLength(500);
    expect(result.currentlyPlaying).toMatchObject({ id: 501 });
  });

  it.each(["abcdefghij", "abcdefghijkl", "A".repeat(65)])("rejects noncanonical repository YouTube ID %s before a query", async (youtubeId) => {
    const harness = recordingPool();
    const repository = new MusicDomainRepository(harness.pool);
    await expect(repository.addSong(23, { youtubeId, title: "title", artist: "artist", thumbnailUrl: "https://img" })).rejects.toThrow("canonical YouTube video ID");
    await expect(repository.addPlaylistSong(23, 7, { youtubeId, title: "title", artist: "artist", thumbnailUrl: "https://img" })).rejects.toThrow("canonical YouTube video ID");
    expect(harness.calls).toEqual([]);
  });

  it("advances the owner queue revision inside each canonical active-queue mutation transaction", async () => {
    // Break caught: a stale tab can replace over an add/play/reorder/remove because its expected revision stayed current.
    for (const execute of [
      (repository: MusicDomainRepository) => repository.addSong(7, { youtubeId: "abcdefghijk", title: "A", artist: "A", thumbnailUrl: "https://img" }),
      (repository: MusicDomainRepository) => repository.setPlaying(7, 1),
      (repository: MusicDomainRepository) => repository.updateSongPosition(7, 1, 0),
      (repository: MusicDomainRepository) => repository.removeSong(7, 1),
      (repository: MusicDomainRepository) => repository.removeSongs(7, [1, 2]),
    ]) {
      const statements: string[] = [];
      const client = { async query(text: string) {
        statements.push(text.replace(/\s+/g, " ").trim());
        if (/SELECT id,status FROM songs/.test(text)) return { rows: [{ id: 1, status: "queued" }], rowCount: 1 };
        if (/DELETE FROM songs/.test(text)) return { rows: [{ status: "queued" }], rowCount: 1 };
        if (/RETURNING id,user_id/.test(text)) return { rows: [{ id: 1, user_id: 7, position: 0, status: "queued" }], rowCount: 1 };
        if (/UPDATE users SET music_queue_revision/.test(text)) return { rows: [{ music_queue_revision: 1 }], rowCount: 1 };
        if (/UPDATE users SET public_snapshot_revision/.test(text)) return { rows: [{ public_snapshot_revision: 1 }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      }, release() {} };
      await execute(new MusicDomainRepository({ query: async () => { throw new Error("outside transaction"); }, connect: async () => client } as never));
      expect(statements.some((text) => /UPDATE users SET music_queue_revision=music_queue_revision\+1 WHERE id=\$1/.test(text))).toBe(true);
      expect(statements.at(-1)).toBe("COMMIT");
    }
  });

  it.each([
    [{ guest_url: "random-public-slug", guest_discoverable: false, has_guest_capability: false }, "private"],
    [{ guest_url: "random-public-slug", guest_discoverable: false, has_guest_capability: true }, "unlisted"],
    [{ guest_url: "random-public-slug", guest_discoverable: true, has_guest_capability: true }, "public"],
  ] as const)("returns owner-readable publication link state without capability material", async (publicationRow, mode) => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    let index = 0;
    const query = async (text: string, values: unknown[] = []) => {
      calls.push({ text, values });
      index += 1;
      return { rows: index < 3 ? [] : [publicationRow], rowCount: index < 3 ? 0 : 1 };
    };
    const pool = {
      query,
      connect: async () => ({
        query: async (text: string, values: unknown[] = []) => /^(?:BEGIN|COMMIT|ROLLBACK)/.test(text)
          ? { rows: [], rowCount: 0 }
          : query(text, values),
        release() {},
      }),
    };
    const result = await new MusicDomainRepository(pool).ownerDashboard(41);
    expect(result.publication).toEqual({ mode, publicSlug: "random-public-slug" });
    expect(JSON.stringify(result)).not.toMatch(/capability|hash/i);
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.values[0] === 41)).toBe(true);
    expect(calls[2].text.toLowerCase()).not.toMatch(/guest_capability_hash\s+as/);
  });

  it("reads dashboard songs and revision from one repeatable-read snapshot", async () => {
    const statements: string[] = [];
    let read = 0;
    const client = { async query(text: string) {
      statements.push(text.replace(/\s+/g, " ").trim());
      if (/^(?:BEGIN|COMMIT|ROLLBACK)/.test(text)) return { rows: [], rowCount: 0 };
      read += 1;
      if (read === 1) return { rows: [{ id: 1, userId: 41, status: "queued" }], rowCount: 1 };
      if (read === 2) return { rows: [{ id: 2, userId: 41, status: "played", playedAt: "2026-08-25T10:00:00.000Z" }], rowCount: 1 };
      return { rows: [{ music_queue_revision: 3, guest_url: "snapshot-slug", guest_discoverable: false, has_guest_capability: false }], rowCount: 1 };
    }, release() {} };
    const repository = new MusicDomainRepository({ query: async () => { throw new Error("outside snapshot"); }, connect: async () => client } as never);
    await expect(repository.ownerDashboard(41)).resolves.toMatchObject({ queueRevision: 3, songs: [{ id: 1 }] });
    expect(statements[0]).toBe("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(statements.find((text) => /status='played'/.test(text))).toMatch(/ORDER BY played_at DESC NULLS LAST,id DESC LIMIT 500/);
    expect(statements.at(-1)).toBe("COMMIT");
  });

  it("owner-predicates every saved-playlist song and visibility mutation", async () => {
    // Break caught: the child song ID is ownerless even though the parent playlist was checked elsewhere.
    const harness = recordingPool();
    const repository = new MusicDomainRepository(harness.pool);
    await repository.addPlaylistSong(29, 80, { youtubeId: "abcdefghijk", title: "t", artist: "a", thumbnailUrl: "https://img" });
    await repository.removePlaylistSong(29, 80, 91);
    await repository.reorderPlaylistSong(29, 80, 91, 3);
    await repository.setPlaylistVisibility(29, 80, true);
    expect(harness.calls.every((call) => call.values[0] === 29)).toBe(true);
    expect(harness.calls.every((call) => /user_id\s*=\s*\$1/.test(call.text.toLowerCase()))).toBe(true);
    expect(harness.calls[1].text.toLowerCase()).toMatch(/playlist_id\s*=\s*\$2/);
    expect(harness.calls[2].text.toLowerCase()).toContain("join playlists p on p.id=ps.playlist_id");
    expect(harness.calls[2].text.toLowerCase()).toContain("p.id=$2");
  });

  it("rotates and revokes a guest capability only for the resolved owner", async () => {
    // Break caught: capability rotation targets a caller-selected user or leaves prior authority active.
    const harness = recordingPool([{ guest_capability_hash: "f".repeat(64) }]);
    const repository = new MusicDomainRepository(harness.pool);
    await repository.rotateGuestCapability(31, "f".repeat(64));
    await repository.revokeGuestCapability(31);
    expect(harness.calls[0].text.toLowerCase()).toContain("where id=$1");
    expect(harness.calls[0].values).toEqual([31, "f".repeat(64)]);
    expect(harness.calls[1].text.toLowerCase()).toContain("where id=$1");
    expect(harness.calls[1].values).toEqual([31]);
  });

  it.each([
    ["private", undefined],
    ["public", undefined],
    ["unlisted", "f".repeat(64)],
  ] as const)("changes publication to %s and advances the public snapshot in one transaction", async (mode, capabilityHash) => {
    const harness = recordingPool([{ guest_url: "public-slug" }]);
    const repository = new MusicDomainRepository(harness.pool);
    await repository.setPublicationMode(31, mode, capabilityHash);
    const writes = harness.calls.filter((call) => /update users/i.test(call.text));
    expect(writes).toHaveLength(2);
    expect(writes[0].text.toLowerCase()).toContain("where id=$1");
    expect(writes[0].values[0]).toBe(31);
    expect(writes[0].values[1]).toBe(mode);
    expect(writes[1].text).toMatch(/public_snapshot_revision=public_snapshot_revision\+1/);
    expect(writes[1].values).toEqual([31]);
    expect(JSON.stringify(harness.calls)).not.toContain("capability\":");
  });

  it("rolls back an injected publication write failure without a second partial write or commit", async () => {
    const statements: string[] = [];
    const pool = {
      query: async () => { throw new Error("pool query must not be used"); },
      async connect() {
        return {
          async query(text: string) {
            statements.push(text.replace(/\s+/g, " ").trim());
            if (/UPDATE users/i.test(text)) throw new Error("injected publication failure");
            return { rows: [], rowCount: 0 };
          },
          release() {},
        };
      },
    };
    const repository = new MusicDomainRepository(pool as never);
    await expect(repository.setPublicationMode(31, "unlisted", "f".repeat(64))).rejects.toThrow("injected publication failure");
    expect(statements.filter((text) => /UPDATE users/i.test(text))).toHaveLength(1);
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
  });

  it("resolves socket guest authority by hash with lifecycle and revocation in SQL", async () => {
    // Break caught: socket handshake reads a plaintext URL or skips local revocation/lifecycle truth.
    const capability = "A".repeat(43);
    const harness = recordingPool([{
      id: 31,
      allow_song_requests: true,
      guest_capability_hash: hashGuestCapability(capability),
    }]);
    const repository = new MusicDomainRepository(harness.pool);
    await expect(repository.resolveGuestSocketAuthority(capability)).resolves.toEqual({
      musicUserId: 31,
      active: true,
      allowSongRequests: true,
    });
    expect(harness.calls[0].text.toLowerCase()).toContain("guest_capability_hash=$1");
    expect(harness.calls[0].text.toLowerCase()).toContain("guest_capability_revoked_at is null");
    expect(harness.calls[0].text.toLowerCase()).toContain("identity_status='active'");
    expect(harness.calls[0].values[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(harness.calls[0].values[0]).not.toBe(capability);
  });

  it("independently verifies returned REST and socket capability hashes", async () => {
    // Break caught: database equality alone becomes the capability verifier and no constant-time check runs in process.
    const capability = "B".repeat(43);
    const mismatch = "0".repeat(64);
    const socketHarness = recordingPool([{
      id: 31,
      allow_song_requests: true,
      guest_capability_hash: mismatch,
    }]);
    await expect(new MusicDomainRepository(socketHarness.pool).resolveGuestSocketAuthority(capability)).resolves.toBeUndefined();

    const resourceHarness = recordingPool([{
      id: 31,
      identity_status: "active",
      guest_capability_hash: mismatch,
      guest_capability_revoked_at: null,
      guest_discoverable: false,
      guest_url: "public-slug",
      playlist_id: 7,
      name: "private",
      description: null,
    }]);
    await expect(new MusicDomainRepository(resourceHarness.pool).resolveGuestResource("public-slug", capability)).resolves.toMatchObject({
      state: "private",
    });
    expect(resourceHarness.calls[0].text).toContain("u.guest_url=$2");
    expect(resourceHarness.calls[0].text).toMatch(/AND \(u\.guest_discoverable=true OR \(\$3::boolean AND u\.guest_capability_hash=\$1\)\)/);
    expect(resourceHarness.calls[0].text).toContain("WHERE ami.music_user_id=u.id AND ca.status IS DISTINCT FROM 'active'");
    expect(socketHarness.calls[0].text).toContain("WHERE ami.music_user_id=u.id AND ca.status IS DISTINCT FROM 'active'");
  });

  it("returns the complete safe public playlist product shape", async () => {
    // Break caught: the live guest page dereferences user/settings/songs while the canonical repository returned only a playlist name.
    const harness = recordingPool([{
      id: 31,
      identity_status: "active",
      guest_capability_hash: "f".repeat(64),
      guest_capability_revoked_at: null,
      guest_discoverable: true,
      guest_url: "public-slug",
      username: "display",
      venue_name: "Venue",
      theme: { primary: "#123456" },
      allow_song_requests: true,
      allow_guest_play_on_device: false,
      allow_playlist_sharing: true,
      allow_recently_played_visibility: true,
      allow_queue_visibility: true,
      songs: [{ id: 1, youtubeId: "queue" }],
      currently_playing: { id: 2, youtubeId: "playing" },
      played_songs: [{ id: 3, youtubeId: "played" }],
      visible_playlists: [{ id: 7, songs: [{ id: 8, youtubeId: "saved" }] }],
      playlist_id: 7,
      name: "public",
      description: null,
    }]);
    const result = await new MusicDomainRepository(harness.pool).resolveGuestResource("public-slug");
    expect(result).toMatchObject({
      state: "public",
      playlist: {
        songs: [{ id: 1, youtubeId: "queue" }],
        user: { username: "display", venueName: "Venue", allowPlaylistSharing: true, allowQueueVisibility: true },
        currentlyPlaying: { id: 2, youtubeId: "playing" },
        playedSongs: [{ id: 3, youtubeId: "played" }],
        allowGuestPlayOnDevice: false,
        allowQueueVisibility: true,
        playlists: [{ id: 7, songs: [{ id: 8, youtubeId: "saved" }] }],
      },
    });
    expect(harness.calls[0].text.toLowerCase()).toContain("visible_playlists");
  });

  it("authorizes song requests for an active public publication without a capability", async () => {
    const harness = recordingPool([{
      id: 44,
      allow_song_requests: true,
      guest_discoverable: true,
      guest_capability_hash: null,
    }]);

    await expect(
      new MusicDomainRepository(harness.pool).resolveGuestRequestAuthority("public-owner"),
    ).resolves.toEqual({ musicUserId: 44, active: true, allowSongRequests: true });
    expect(harness.calls[0].values).toEqual(["public-owner", null, false]);
  });

  it("validates and locks the owner playback target before retiring the current song", async () => {
    const harness = recordingPool();
    await new MusicDomainRepository(harness.pool).setPlaying(23, 71);
    const transition = harness.calls[0].text.toLowerCase();
    expect(transition).toMatch(/target as \( select id from songs where user_id=\$1 and id=\$2 for update \)/);
    expect(transition).toMatch(/status='playing'.*exists \(select 1 from target\)/);
  });

  it("rejects an owner playback revision that is no longer newer before changing songs", async () => {
    // Break caught: a delayed timed-out request can retire the latest canonical song after a newer command commits.
    const statements: string[] = [];
    const client = { async query(text: string) {
      const normalized = text.replace(/\s+/g, " ").trim();
      statements.push(normalized);
      if (/^(?:BEGIN|COMMIT|ROLLBACK)|pg_advisory_xact_lock/.test(normalized)) return { rows: [], rowCount: 0 };
      if (/music_queue_revision/.test(normalized)) return { rows: [{ music_queue_revision: 2, music_playback_revision: 0 }], rowCount: 1 };
      if (/UPDATE songs SET status='playing'/.test(normalized)) return { rows: [{ id: 71 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }, release() {} };
    const repository = new MusicDomainRepository({ query: async () => ({ rows: [] }), connect: async () => client } as never);

    await expect(repository.setPlaying(23, 71, 1, 0)).resolves.toEqual({ status: "stale", revision: 2, playbackRevision: 0, queueOnly: true });
    expect(statements.some((text) => /UPDATE songs SET status='playing'/.test(text))).toBe(false);
  });

  it("does not let a forged maximum revision poison playback and accepts the real expected revision afterward", async () => {
    // Break caught: an authenticated browser can set the owner's revision to MAX_SAFE_INTEGER and permanently block normal playback.
    let revision = 7;
    const client = { async query(text: string, values: unknown[] = []) {
      const normalized = text.replace(/\s+/g, " ").trim();
      if (/^(?:BEGIN|COMMIT|ROLLBACK)|pg_advisory_xact_lock/.test(normalized)) return { rows: [], rowCount: 0 };
      if (/^SELECT music_queue_revision/.test(normalized)) return { rows: [{ music_queue_revision: revision, music_playback_revision: 0 }], rowCount: 1 };
      if (/WITH target AS/.test(normalized)) return { rows: [{ id: 71, user_id: 23, youtube_id: "abcdefghijk", title: "Safe", artist: "Artist", thumbnail_url: "https://img", position: 0, status: "playing", played_at: null }], rowCount: 1 };
      if (/UPDATE users SET music_queue_revision/.test(normalized)) {
        revision += 1;
        return { rows: [{ music_queue_revision: revision }], rowCount: 1 };
      }
      if (/UPDATE users SET public_snapshot_revision/.test(normalized)) return { rows: [{ public_snapshot_revision: 1 }], rowCount: 1 };
      if (/^SELECT id,user_id/.test(normalized)) return { rows: [{ id: 71, user_id: 23, youtube_id: "abcdefghijk", title: "Safe", artist: "Artist", thumbnail_url: "https://img", position: 0, status: "playing", played_at: null }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }, release() {} };
    const repository = new MusicDomainRepository({ query: async () => ({ rows: [] }), connect: async () => client } as never);

    await expect(repository.setPlaying(23, 71, Number.MAX_SAFE_INTEGER))
      .resolves.toEqual({ status: "stale", revision: 7, playbackRevision: 0, queueOnly: false });
    await expect(repository.setPlaying(23, 71, 7)).resolves.toMatchObject({
      status: "completed", revision: 8, song: { id: 71 },
    });
    expect(revision).toBe(8);
  });

  it("keeps a public resource reachable when a supplied stale capability was revoked", async () => {
    const capability = "B".repeat(43);
    const harness = recordingPool([{
      id: 31,
      identity_status: "active",
      guest_capability_hash: hashGuestCapability(capability),
      guest_capability_revoked_at: new Date("2026-08-24T00:00:00Z"),
      guest_discoverable: true,
      guest_url: "public-after-unlisted",
      playlist_id: 7,
      name: "public",
      description: null,
    }]);

    await expect(
      new MusicDomainRepository(harness.pool).resolveGuestResource("public-after-unlisted", capability),
    ).resolves.toMatchObject({ state: "public" });
  });

  it("keeps an active discoverable owner reachable with the exact empty public playlist shape", async () => {
    const queuedSong = { id: 8, userId: 31, youtubeId: "abcdefghijk", title: "Private queue", artist: "Artist", thumbnailUrl: "https://img", position: 0, status: "playing", playedAt: null };
    const harness = recordingPool([{
      id: 31,
      identity_status: "active",
      guest_capability_hash: null,
      guest_capability_revoked_at: null,
      guest_discoverable: true,
      guest_url: "public-empty",
      username: "display",
      venue_name: null,
      theme: null,
      allow_song_requests: false,
      allow_guest_play_on_device: false,
      allow_playlist_sharing: true,
      allow_recently_played_visibility: false,
      allow_queue_visibility: false,
      has_visible_playlist: false,
      songs: [queuedSong],
      currently_playing: queuedSong,
      played_songs: [],
      visible_playlists: [],
    }]);
    const result = await new MusicDomainRepository(harness.pool).resolveGuestResource("public-empty");
    expect(result).toMatchObject({ state: "public", playlist: { songs: [], currentlyPlaying: null, playlists: [] } });
  });

  it("exposes the live queue to a public resource only after queue visibility is enabled", async () => {
    const queuedSong = { id: 8, userId: 31, youtubeId: "abcdefghijk", title: "Visible queue", artist: "Artist", thumbnailUrl: "https://img", position: 0, status: "playing", playedAt: null };
    const harness = recordingPool([{
      id: 31, identity_status: "active", guest_capability_hash: null, guest_capability_revoked_at: null,
      guest_discoverable: true, guest_url: "public-queue", username: "display", venue_name: null, theme: null,
      allow_song_requests: false, allow_guest_play_on_device: false, allow_playlist_sharing: true,
      allow_recently_played_visibility: false, allow_queue_visibility: true, has_visible_playlist: false,
      songs: [queuedSong], currently_playing: queuedSong, played_songs: [], visible_playlists: [],
    }]);

    await expect(new MusicDomainRepository(harness.pool).resolveGuestResource("public-queue")).resolves.toMatchObject({
      state: "public",
      playlist: { songs: [queuedSong], currentlyPlaying: queuedSong, allowQueueVisibility: true },
    });
  });

  it("preserves existing playback state fields when recording the concurrency token", async () => {
    const harness = recordingPool([{ music_queue_revision: 4 }, { id: 8 }, { music_queue_revision: 5 }, { id: 8 }]);
    await new MusicDomainRepository(harness.pool).setPlaying(31, 8);
    const tokenWrite = harness.calls.find((call) => /INSERT INTO playback_states/.test(call.text));
    expect(tokenWrite?.text).toContain("WHEN jsonb_typeof(playback_states.state)='object' THEN playback_states.state");
    expect(tokenWrite?.text).toContain("ELSE jsonb_build_object('legacyState',playback_states.state)");
    expect(tokenWrite?.text).toContain("END) || EXCLUDED.state");
  });

  it("serves an empty unlisted publication to its valid capability", async () => {
    const capability = "C".repeat(43);
    const harness = recordingPool([{
      id: 31,
      identity_status: "active",
      guest_capability_hash: hashGuestCapability(capability),
      guest_capability_revoked_at: null,
      guest_discoverable: false,
      guest_url: "unlisted-empty",
      username: "display",
      venue_name: null,
      theme: null,
      allow_song_requests: false,
      allow_guest_play_on_device: false,
      allow_playlist_sharing: true,
      allow_recently_played_visibility: false,
      has_visible_playlist: false,
      songs: [],
      currently_playing: null,
      played_songs: [],
      visible_playlists: [],
    }]);

    await expect(new MusicDomainRepository(harness.pool).resolveGuestResource("unlisted-empty", capability)).resolves.toMatchObject({
      state: "unlisted",
      noindex: true,
      playlist: { songs: [], playlists: [] },
    });
  });

  it("resolves one active discoverable public descriptor by stable Account document ID without projecting internal identity", async () => {
    // Break caught: username, User document ID, or an internal numeric ID becomes descriptor discovery authority.
    const harness = recordingPool([{
      publicSlug: "stable-public-slug",
      revision: "7",
    }]);

    await expect(new MusicDomainRepository(harness.pool).resolvePublicDescriptor("account-document-stable"))
      .resolves.toEqual({ mode: "public", publicSlug: "stable-public-slug", revision: 7 });

    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0].values).toEqual(["account-document-stable"]);
    expect(harness.calls[0].text).toMatch(/strapi_account_document_id=\$1/);
    expect(harness.calls[0].text).toMatch(/identity_status='active'/);
    expect(harness.calls[0].text).toMatch(/guest_discoverable=true/);
    expect(harness.calls[0].text).toMatch(/guest_url IS NOT NULL/);
    expect(harness.calls[0].text).toMatch(/guest_url ~ '\^\[A-Za-z0-9_-/);
    expect(harness.calls[0].text).toMatch(/public_snapshot_revision/);
    const normalizedSql = harness.calls[0].text.replace(/\s+/g, " ");
    expect(normalizedSql).toContain("AND NOT EXISTS ( SELECT 1 FROM users collision WHERE collision.strapi_user_document_id=$1 )");
    expect(normalizedSql).toContain("AND NOT EXISTS ( SELECT 1 FROM music_identity_tombstones tombstone WHERE tombstone.strapi_user_document_id=$1 OR tombstone.strapi_account_document_id=$1 )");
    expect(harness.calls[0].text).not.toMatch(/SELECT\s+u\.id\b/i);
  });

  it("resolves a canonically provisioned owner through account_music_identity without coercing the id to uuid", async () => {
    // Break caught: ADR-007 leaves strapi_account_document_id NULL for a canonically
    // provisioned venue, so a Strapi-only lookup can never resolve one and its public
    // Music page stays permanently unreachable.
    // Break caught: comparing the uuid column straight to $1 makes Postgres coerce a
    // legacy Strapi document id to uuid and raise 22P02, which would fail every
    // pre-0039 lookup instead.
    const harness = recordingPool([{ publicSlug: "canonical-public-slug", revision: "4" }]);
    const accountId = "11111111-2222-4333-8444-555555555555";

    await expect(new MusicDomainRepository(harness.pool).resolvePublicDescriptor(accountId))
      .resolves.toEqual({ mode: "public", publicSlug: "canonical-public-slug", revision: 4 });

    expect(harness.calls[0].values).toEqual([accountId]);
    const canonicalSql = harness.calls[0].text.replace(/\s+/g, " ");
    expect(canonicalSql).toContain("WHERE (u.strapi_account_document_id=$1 OR EXISTS ( SELECT 1 FROM account_music_identity owner WHERE owner.music_user_id=u.id AND owner.account_id::text=$1 ))");
    expect(canonicalSql).not.toContain("owner.account_id=$1");
    // The canonical arm must not relax a single guard the legacy arm carries.
    expect(canonicalSql).toContain("AND u.identity_status='active'");
    expect(canonicalSql).toContain("AND u.guest_discoverable=true");
    expect(canonicalSql).toContain("AND NOT EXISTS ( SELECT 1 FROM music_identity_tombstones tombstone WHERE tombstone.strapi_user_document_id=$1 OR tombstone.strapi_account_document_id=$1 )");
  });

  it("fails closed when stable Account descriptor lookup is absent, colliding, or malformed", async () => {
    // Break caught: a corrupt or ambiguous repository result publishes one arbitrary account.
    const absent = recordingPool();
    const collision = recordingPool([
      { publicSlug: "collision-one", revision: "1" },
      { publicSlug: "collision-two", revision: "2" },
    ]);
    const malformed = recordingPool([{ publicSlug: "not canonical!", revision: "3" }]);

    await expect(new MusicDomainRepository(absent.pool).resolvePublicDescriptor("missing-account"))
      .resolves.toBeUndefined();
    await expect(new MusicDomainRepository(collision.pool).resolvePublicDescriptor("colliding-account"))
      .resolves.toBeUndefined();
    await expect(new MusicDomainRepository(malformed.pool).resolvePublicDescriptor("malformed-account"))
      .resolves.toBeUndefined();
  });

  it("lists discoverable public playlists independently of revoked guest capabilities", async () => {
    // Break caught: publishing publicly revokes an unlisted capability, but that must not remove the public URL from discovery.
    const harness = recordingPool([{
      guestUrl: "public-slug",
      updatedAt: new Date("2026-08-23T00:00:00.000Z"),
    }]);

    await expect(new MusicDomainRepository(harness.pool).listPublishedMusicPlaylists()).resolves.toEqual([{
      guestUrl: "public-slug",
      updatedAt: new Date("2026-08-23T00:00:00.000Z"),
    }]);
    expect(harness.calls[0].text.toLowerCase()).toContain("u.guest_discoverable=true");
    expect(harness.calls[0].text.toLowerCase()).toContain("u.identity_status='active'");
    expect(harness.calls[0].text.toLowerCase()).not.toContain("guest_capability_revoked_at");
  });

  const permissionKeys = [
    "allowSongRequests",
    "allowGuestPlayOnDevice",
    "allowPlaylistSharing",
    "allowRecentlyPlayedVisibility",
    "allowQueueVisibility",
  ] as const;
  const publicIdKey = Buffer.alloc(32, 0x54);
  const alternatePublicIdKey = Buffer.alloc(32, 0x55);

  function publicResourceHarness(mask: number, options: {
    oversized?: boolean;
    playlistDescription?: string | null;
    thumbnailUrl?: string;
    duplicateQueue?: boolean;
    queueIds?: number[];
    currentId?: number;
    metadataSuffix?: string;
    positionOffset?: number;
    playlistNameSuffix?: string;
    playlistSongBaseId?: number;
  } = {}) {
    const {
      oversized = false,
      playlistDescription = null,
      thumbnailUrl,
      duplicateQueue = false,
      queueIds,
      currentId = 9,
      metadataSuffix = "",
      positionOffset = 0,
      playlistNameSuffix = "",
      playlistSongBaseId = 1_000,
    } = options;
    const permissions = Object.fromEntries(permissionKeys.map((key, index) => [key, (mask & (1 << index)) !== 0])) as Record<typeof permissionKeys[number], boolean>;
    const song = (contentId: number, status: "queued" | "playing" | "played" | "saved", position = 0) => ({
      id: contentId,
      youtube_id: `song${contentId}`.padEnd(11, "0").slice(0, 11),
      title: oversized ? "T".repeat(1_024) : `${status} ${contentId}${metadataSuffix}`,
      artist: oversized ? "A".repeat(1_024) : `Artist${metadataSuffix}`,
      thumbnail_url: thumbnailUrl ?? (oversized ? `https://img.example/${"x".repeat(1_900)}${contentId}` : `https://img.example/${contentId}`),
      position: position + positionOffset,
      status,
      played_at: status === "played" ? new Date("2026-08-28T12:00:00.000Z") : null,
    });
    const queue = queueIds
      ? queueIds.map((id, index) => song(id, "queued", index))
      : duplicateQueue
      ? [song(10, "queued", 0), { ...song(10, "queued", 0), id: 11 }]
      : Array.from({ length: oversized ? 101 : 1 }, (_, index) => song(index + 10, "queued", index));
    const history = Array.from({ length: oversized ? 51 : 1 }, (_, index) => song(index + 200, "played", index));
    const playlists = Array.from({ length: oversized ? 21 : 2 }, (_, playlistIndex) => {
      const privatePlaylist = !oversized && playlistIndex === 1;
      const songCount = oversized ? 51 : 1;
      return Array.from({ length: songCount }, (_, songIndex) => ({
        playlist_internal_id: playlistIndex + 500,
        playlist_name: privatePlaylist ? "Private playlist" : `Public playlist ${playlistIndex}${playlistNameSuffix}`,
        playlist_description: playlistDescription,
        playlist_visible: !privatePlaylist,
        playlist_total: oversized ? 21 : 1,
        playlist_song_total: songCount,
        ...song(playlistIndex * 100 + songIndex + playlistSongBaseId, "saved", songIndex),
      }));
    }).flat();
    const calls: string[] = [];
    const query = async (text: string) => {
      const normalized = text.replace(/\s+/g, " ").trim();
      calls.push(normalized);
      if (/^(?:BEGIN|COMMIT|ROLLBACK)/.test(normalized)) return { rows: [], rowCount: 0 };
      if (/public_snapshot_revision/.test(normalized) && /FROM users u/.test(normalized)) return { rows: [{
        identity_status: "active",
        guest_capability_hash: null,
        guest_capability_revoked_at: null,
        guest_discoverable: true,
        guest_url: "public-slug",
        username: "display",
        venue_name: "Venue",
        public_snapshot_revision: 17,
        allow_song_requests: permissions.allowSongRequests,
        allow_guest_play_on_device: permissions.allowGuestPlayOnDevice,
        allow_playlist_sharing: permissions.allowPlaylistSharing,
        allow_recently_played_visibility: permissions.allowRecentlyPlayedVisibility,
        allow_queue_visibility: permissions.allowQueueVisibility,
        queue_total: queue.length,
        history_total: history.length,
        playlist_total: oversized ? 21 : 1,
      }], rowCount: 1 };
      if (/status='playing'/.test(normalized)) return { rows: [song(currentId, "playing")], rowCount: 1 };
      if (/status='queued'/.test(normalized)) return { rows: queue, rowCount: queue.length };
      if (/status='played'/.test(normalized)) return { rows: history, rowCount: history.length };
      if (/bounded_playlists/.test(normalized)) return { rows: playlists, rowCount: playlists.length };
      throw new Error(`Unexpected public resource query: ${normalized}`);
    };
    return { calls, permissions, pool: { query, connect: async () => ({ query, release() {} }) } };
  }

  function publicResourceRepository(
    harness: ReturnType<typeof publicResourceHarness>,
    key: Buffer = publicIdKey,
  ): MusicDomainRepository {
    return new MusicDomainRepository(harness.pool as never, undefined, key);
  }

  it.each(musicPermissionOracle)(
    "enforces public resource field exposure and interactivity for permission mask %i",
    async (mask, requests, playback, playlists, history, queue, currentVisible) => {
      // Break caught: any permission combination leaks a protected collection or upgrades queue visibility into playback authority.
      const harness = publicResourceHarness(mask);
      const result = await (publicResourceRepository(harness) as any).resolvePublicMusicResource("public-slug");
      const resource = result?.resource;
      expect(result?.state).toBe("public");
      expect(resource?.version).toBe("music-public-resource/v1");
      expect(resource?.revision).toBe(17);
      expect(resource?.permissions).toEqual({
        allowSongRequests: Boolean(requests), allowGuestPlayOnDevice: Boolean(playback),
        allowPlaylistSharing: Boolean(playlists), allowRecentlyPlayedVisibility: Boolean(history),
        allowQueueVisibility: Boolean(queue),
      });
      expect(resource?.currentlyPlaying !== null).toBe(Boolean(currentVisible));
      expect(resource?.queue.items.length).toBe(queue);
      expect(resource?.recentlyPlayed.items.length).toBe(history);
      expect(resource?.playlists.items.map((playlist: { name: string }) => playlist.name)).toEqual(
        playlists ? ["Public playlist 0"] : [],
      );
      expect(resource?.permissions.allowGuestPlayOnDevice).toBe(Boolean(playback));
      if (!playback && queue) {
        expect(resource?.currentlyPlaying).not.toBeNull();
        expect(resource?.permissions.allowGuestPlayOnDevice).toBe(false);
      }
    },
  );

  it("bounds every public collection before aggregation, hides nested authority, and caps encoded JSON", async () => {
    // Break caught: legacy oversized rows or an internal nested identifier can create an unbounded/authority-bearing public response.
    const harness = publicResourceHarness(31, { oversized: true });
    const result = await (publicResourceRepository(harness) as any).resolvePublicMusicResource("public-slug");
    const resource = result.resource;
    expect(resource.queue).toMatchObject({ total: 101, truncated: true });
    expect(resource.queue.items.length).toBeLessThanOrEqual(100);
    expect(resource.recentlyPlayed).toMatchObject({ total: 51, truncated: true });
    expect(resource.recentlyPlayed.items.length).toBeLessThanOrEqual(50);
    expect(resource.playlists).toMatchObject({ total: 21, truncated: true });
    expect(resource.playlists.items.length).toBeLessThanOrEqual(20);
    expect(resource.playlists.items.every((playlist: { songs: { items: unknown[] } }) => playlist.songs.items.length <= 50)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(resource), "utf8")).toBeLessThanOrEqual(512 * 1_024);
    expect(harness.calls.find((sql) => /status='queued'/.test(sql))).toMatch(/LIMIT 100/);
    expect(harness.calls.find((sql) => /status='played'/.test(sql))).toMatch(/LIMIT 50/);
    expect(harness.calls.find((sql) => /bounded_playlists/.test(sql))).toMatch(/LIMIT 20/);
    expect(harness.calls.find((sql) => /bounded_playlists/.test(sql))).toMatch(/LIMIT 50/);

    const inspect = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(inspect);
      if (!value || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(value)) {
        expect(key).not.toMatch(/^(?:userId|playlistId|accountId|documentId|strapi|capability|credential)/i);
        if (key === "id") expect(nested).toEqual(expect.stringMatching(/^[A-Za-z0-9_-]{43}$/));
        inspect(nested);
      }
    };
    inspect(resource);
  });

  it("preserves empty descriptions and normalizes legacy non-URL thumbnails to null", async () => {
    // Break caught: valid empty owner text or legacy thumbnail values turn a public resource into a 500/parser mismatch.
    const harness = publicResourceHarness(31, { playlistDescription: "", thumbnailUrl: "legacy-thumbnail" });
    const result = await (publicResourceRepository(harness) as any).resolvePublicMusicResource("public-slug");

    expect(result.resource.playlists.items[0].description).toBe("");
    expect(result.resource.currentlyPlaying.thumbnailUrl).toBeNull();
    expect(result.resource.queue.items[0].thumbnailUrl).toBeNull();
    expect(result.resource.recentlyPlayed.items[0].thumbnailUrl).toBeNull();
    expect(result.resource.playlists.items[0].songs.items[0].thumbnailUrl).toBeNull();

    const canonicalHarness = publicResourceHarness(31, { thumbnailUrl: "HTTP://IMG.EXAMPLE/legacy cover" });
    const canonical = await (publicResourceRepository(canonicalHarness) as any).resolvePublicMusicResource("public-slug");
    expect(canonical.resource.currentlyPlaying.thumbnailUrl).toBe("http://img.example/legacy%20cover");

    const credentialHarness = publicResourceHarness(31, { thumbnailUrl: "https://user:secret@img.example/cover" });
    const credentialSafe = await (publicResourceRepository(credentialHarness) as any).resolvePublicMusicResource("public-slug");
    expect(credentialSafe.resource.currentlyPlaying.thumbnailUrl).toBeNull();
  });

  it("keeps entity public IDs stable across metadata, position, status, and ordering changes", async () => {
    // Break caught: public React keys rotate when owner metadata or ordering changes.
    const firstHarness = publicResourceHarness(31, { currentId: 9, queueIds: [10, 11] });
    const changedHarness = publicResourceHarness(31, {
      currentId: 20,
      queueIds: [11, 9, 10],
      metadataSuffix: " edited",
      positionOffset: 37,
      playlistNameSuffix: " renamed",
    });
    const first = (await (publicResourceRepository(firstHarness) as any).resolvePublicMusicResource("public-slug")).resource;
    const changed = (await (publicResourceRepository(changedHarness) as any).resolvePublicMusicResource("public-slug")).resource;

    expect(changed.queue.items[1].id).toBe(first.currentlyPlaying.id);
    expect(changed.queue.items[2].id).toBe(first.queue.items[0].id);
    expect(changed.queue.items[0].id).toBe(first.queue.items[1].id);
    expect(changed.playlists.items[0].id).toBe(first.playlists.items[0].id);
  });

  it("uses opaque keyed identities that distinguish duplicates and never transfer on delete/insert", async () => {
    // Break caught: ordinal identities let a replacement row inherit a deleted row's public key.
    const beforeHarness = publicResourceHarness(31, { duplicateQueue: true });
    const afterHarness = publicResourceHarness(31, { queueIds: [11, 12] });
    const before = (await (publicResourceRepository(beforeHarness) as any).resolvePublicMusicResource("public-slug")).resource;
    const after = (await (publicResourceRepository(afterHarness) as any).resolvePublicMusicResource("public-slug")).resource;

    expect(new Set(before.queue.items.map((song: any) => song.id)).size).toBe(2);
    expect(after.queue.items[0].id).toBe(before.queue.items[1].id);
    expect(after.queue.items[1].id).not.toBe(before.queue.items[0].id);
    for (const publicId of [...before.queue.items, ...after.queue.items].map((song: any) => song.id)) {
      expect(publicId).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(publicId).not.toContain("10");
      expect(publicId).not.toContain("11");
      expect(publicId).not.toContain("12");
    }
  });

  it("is deterministic only within the same public-ID key and separates entity types", async () => {
    const harnessA = publicResourceHarness(31, { currentId: 1_001, queueIds: [1_001], playlistSongBaseId: 1_001 });
    const harnessB = publicResourceHarness(31, { currentId: 1_001, queueIds: [1_001], playlistSongBaseId: 1_001 });
    const sameKeyA = (await (publicResourceRepository(harnessA) as any).resolvePublicMusicResource("public-slug")).resource;
    const sameKeyB = (await (publicResourceRepository(harnessB) as any).resolvePublicMusicResource("public-slug")).resource;
    const differentKey = (await (publicResourceRepository(publicResourceHarness(31, { currentId: 1_001, queueIds: [1_001], playlistSongBaseId: 1_001 }), alternatePublicIdKey) as any)
      .resolvePublicMusicResource("public-slug")).resource;

    expect(sameKeyA.currentlyPlaying.id).toBe(sameKeyA.queue.items[0].id);
    expect(sameKeyB.currentlyPlaying.id).toBe(sameKeyA.currentlyPlaying.id);
    expect(differentKey.currentlyPlaying.id).not.toBe(sameKeyA.currentlyPlaying.id);
    expect(sameKeyA.currentlyPlaying.id).not.toBe(sameKeyA.playlists.items[0].songs.items[0].id);
    for (const publicId of [
      sameKeyA.currentlyPlaying.id,
      sameKeyA.queue.items[0].id,
      sameKeyA.playlists.items[0].songs.items[0].id,
    ]) expect(publicId).not.toContain("1001");
  });
});
import { musicPermissionOracle } from "../../../test-fixtures/music-permission-oracle";
