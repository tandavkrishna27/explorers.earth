import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicMusicAvailabilityProvider } from "../../features/music/PublicMusicAvailabilityProvider";
import { PublicColdEntryBoundary } from "../../layouts/PublicColdEntryBoundary";
import ProfileMusic from "../public/ProfileMusic";
import UsernameValidator from "../../routes/validators/UsernameValidator";
import PublicLayout from "../../layouts/PublicLayout";

const shell = vi.hoisted(() => vi.fn());
const discover = vi.hoisted(() => vi.fn());
const load = vi.hoisted(() => vi.fn());

vi.mock("../../components/SEO", () => ({ default: () => null }));
vi.mock("../../features/PublicHome/api/publicProfileGatewayClient", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  publicProfileGatewayClient: { shell },
}));
vi.mock("../../features/music/publicMusicClient", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  publicMusicClient: { discover, load },
}));
vi.mock("../../features/music/publicMusicLiveClient", () => ({
  subscribeToPublicMusic: vi.fn(() => ({ unsubscribe: vi.fn() })),
}));

const descriptor = {
  version: "music-public-descriptor/v1",
  publication: { mode: "public", publicSlug: "stable-public-slug", revision: 3 },
};

const resource = {
  version: "music-public-resource/v1",
  revision: 3,
  user: { username: "tk2727", venueName: null },
  permissions: {
    allowSongRequests: false,
    allowGuestPlayOnDevice: false,
    allowPlaylistSharing: false,
    allowRecentlyPlayedVisibility: false,
    allowQueueVisibility: false,
  },
  currentlyPlaying: null,
  queue: { items: [], total: 0, truncated: false },
  recentlyPlayed: { items: [], total: 0, truncated: false },
  playlists: { items: [], total: 0, truncated: false },
};

describe("ProfileMusic profile-gateway recovery", () => {
  beforeEach(() => {
    shell.mockReset();
    discover.mockReset();
    load.mockReset();
    shell
      .mockRejectedValueOnce(new TypeError("gateway offline"))
      .mockResolvedValue({ username: "tk2727", documentId: "account-doc", public_music: "Yes" });
    discover.mockResolvedValue(descriptor);
    load.mockResolvedValue(resource);
  });

  it("recovers an initially unavailable public Music route when Retry succeeds without remounting", async () => {
    render(<MemoryRouter initialEntries={["/tk2727/music"]}>
      <Routes>
        <Route path=":username" element={
          <PublicColdEntryBoundary>
            <PublicMusicAvailabilityProvider>
              <UsernameValidator><PublicLayout /></UsernameValidator>
            </PublicMusicAvailabilityProvider>
          </PublicColdEntryBoundary>
        }>
          <Route path="music" element={<ProfileMusic />} />
        </Route>
      </Routes>
    </MemoryRouter>);

    await screen.findByRole("heading", { name: "Music is temporarily unavailable." });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await screen.findByRole("heading", { name: "Music" });
    expect(shell).toHaveBeenCalledTimes(2);
    expect(discover).toHaveBeenCalledWith("account-doc", expect.any(AbortSignal));
    expect(load).toHaveBeenCalledWith("stable-public-slug", undefined, expect.any(AbortSignal));
  });
});
