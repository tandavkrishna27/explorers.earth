import { describe, expect, it, vi } from "vitest";
import { createMusicPlaybackArbiter } from "../musicPlaybackCommand";

describe("createMusicPlaybackArbiter authority boundary", () => {
  it("does not retry when another session changed the canonical song", async () => {
    const write = vi.fn(async () => ({ revision: 3, acknowledged: false, retryable: false }));
    const arbiter = createMusicPlaybackArbiter({
      write,
      onAcknowledged: vi.fn(),
      currentRevision: () => 2,
      currentPlaybackRevision: () => 11,
    });

    await expect(arbiter.requestPlayback(12, arbiter.beginPlaybackRequest(), "queue-play"))
      .rejects.toThrow("changed in another session");
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(12, 2, "queue-play", expect.any(AbortSignal), 11);
  });

  it("does not dispatch a same-song stale-scope closure after authority changes", async () => {
    // Break caught: an old dashboard handler can use the global credential transport after account B becomes current.
    let authority = "user-a/account-a";
    const write = vi.fn(async () => ({ revision: 2 }));
    const options = {
      write,
      onAcknowledged: vi.fn(),
      currentRevision: () => 1,
      isAuthorityCurrent: () => authority === "user-a/account-a",
    };
    const arbiter = createMusicPlaybackArbiter(options);
    const requestId = arbiter.beginPlaybackRequest();

    authority = "user-b/account-b";
    await expect(arbiter.requestPlayback(42, requestId, "same-id-play"))
      .resolves.toBe("superseded");
    expect(write).not.toHaveBeenCalled();
  });
});
