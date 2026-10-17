import { expect, it, vi } from "vitest";
import { PublicMusicError, publicMusicClient } from "../publicMusicClient";
import { loadPublicMusicWithTransientRetry } from "../usePublicMusicResource";

it("retries a transient public-resource failure before surfacing it", async () => {
  const load = vi.spyOn(publicMusicClient, "load")
    .mockRejectedValueOnce(new PublicMusicError("PUBLIC_UNAVAILABLE"))
    .mockResolvedValueOnce({ version: "music-public-resource/v1", revision: 1 } as never);

  await expect(loadPublicMusicWithTransientRetry("public_slug-123", undefined, new AbortController().signal))
    .resolves.toMatchObject({ version: "music-public-resource/v1", revision: 1 });
  expect(load).toHaveBeenCalledTimes(2);
  load.mockRestore();
});
