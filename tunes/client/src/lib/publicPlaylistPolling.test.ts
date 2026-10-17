import { describe, expect, it } from "vitest";
import { PUBLIC_PLAYLIST_POLLING_INTERVAL_MS } from "./publicPlaylistPolling";

describe("public playlist fallback polling", () => {
  it("leaves limiter headroom because WebSocket events provide immediate updates", () => {
    expect(PUBLIC_PLAYLIST_POLLING_INTERVAL_MS).toBeGreaterThanOrEqual(15_000);
    expect(Math.ceil(60_000 / PUBLIC_PLAYLIST_POLLING_INTERVAL_MS)).toBeLessThanOrEqual(4);
  });
});
