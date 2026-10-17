// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SearchSongs from "./search-songs";
import GuestCapabilityImport from "./guest-capability-import";
import PlaylistPage from "../pages/playlist-page";
import { getGuestMusicCapability, guestCapabilityHandoff, setGuestMusicCapability } from "../lib/musicCredential";

const subscriptionSpy = vi.fn((username?: unknown) => { void username; return { songRequests: 0, songsQuota: 0, isLoading: false, isActivePlan: true }; });
vi.mock("../hooks/use-auth", () => ({ useAuth: () => ({ user: undefined }) }));
vi.mock("../hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("../lib/strapi-queries", () => ({ useUserSubscriptionPlanInfo: (username: unknown) => subscriptionSpy(username) }));
vi.mock("wouter", () => ({ useParams: () => ({ guestUrl: "owner-a" }) }));
vi.mock("../components/SEO", () => ({ default: () => null }));
vi.mock("../hooks/use-websocket", () => ({ useWebSocket: () => ({ sendMessage: vi.fn() }) }));
vi.mock("../components/theme-provider", () => ({ useTheme: () => ({ updateTheme: vi.fn() }) }));

function mounted(element: React.ReactElement) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{element}</QueryClientProvider>);
}

describe("rendered public guest request journey", () => {
  beforeEach(() => { sessionStorage.clear(); subscriptionSpy.mockClear(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("renders import on a successful public page, replaces only this slug, and rejects an A handoff on B", async () => {
    const user = userEvent.setup();
    setGuestMusicCapability("A".repeat(43), "owner-a");
    mounted(<GuestCapabilityImport guestUrl="owner-a" onImported={() => undefined} />);
    const handoffInput = screen.getByLabelText("Guest access handoff");
    await user.click(handoffInput);
    await user.paste(guestCapabilityHandoff("N".repeat(43), "owner-a", "https://music.example"));
    await user.click(screen.getByRole("button", { name: "Import guest access" }));
    expect(getGuestMusicCapability("owner-a")).toBe("N".repeat(43));
    cleanup();
    mounted(<GuestCapabilityImport guestUrl="owner-b" onImported={() => undefined} />);
    const wrongSlugHandoffInput = screen.getByLabelText("Guest access handoff");
    await user.click(wrongSlugHandoffInput);
    await user.paste(guestCapabilityHandoff("A".repeat(43), "owner-a", "https://music.example"));
    await user.click(screen.getByRole("button", { name: "Import guest access" }));
    expect((await screen.findByRole("alert")).textContent).toContain("invalid for this playlist");
    expect(getGuestMusicCapability("owner-b")).toBeUndefined();
  });

  it("keeps explicit handoff import visible after a successful public or unlisted page read", async () => {
    const playlist = {
      songs: [], currentlyPlaying: null, playedSongs: [], allowGuestPlayOnDevice: false,
      allowRecentlyPlayedVisibility: true, playlists: [],
      user: { id: 1, username: "venue", guestUrl: "owner-a", venueName: "Venue", theme: null, allowSongRequests: true, allowGuestPlayOnDevice: false, allowPlaylistSharing: false, allowRecentlyPlayedVisibility: true },
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => playlist } } });
    client.setQueryData(["/api/playlist/owner-a"], playlist);
    render(<QueryClientProvider client={client}><PlaylistPage /></QueryClientProvider>);
    expect(screen.getByText("Paste guest access handoff")).toBeDefined();
    expect(screen.getByRole("button", { name: "Import guest access" })).toBeDefined();
  });

  it("searches, selects, and requests through capability-only guest endpoints without leaking the secret", async () => {
    const user = userEvent.setup();
    const capability = "G".repeat(43);
    setGuestMusicCapability(capability, "owner-a");
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => { void init; return url.endsWith("/youtube/search")
      ? new Response(JSON.stringify({ items: [{ id: { videoId: "video" }, snippet: { title: "Found song", channelTitle: "Artist", thumbnails: { default: { url: "https://img/song" } } } }], nextPageToken: null }), { status: 200, headers: { "Content-Type": "application/json" } })
      : new Response(JSON.stringify({ id: 1 }), { status: 201, headers: { "Content-Type": "application/json" } }); });
    vi.stubGlobal("fetch", fetchSpy);
    mounted(<SearchSongs guestUrl="owner-a" ownerUsername="browser-target-must-not-run" />);
    await user.type(screen.getByPlaceholderText(/Search for songs/), "music");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByText("Found song"));
    await user.click(screen.getByRole("button", { name: "Add 1 song to queue" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      "/api/playlist/owner-a/youtube/search", "/api/playlist/owner-a/requests",
    ]);
    expect(subscriptionSpy).toHaveBeenCalledWith(undefined);
    for (const [url, init] of fetchSpy.mock.calls) {
      expect(url).not.toContain(capability);
      expect(JSON.stringify(init?.body)).not.toContain(capability);
      expect(init?.headers).toEqual(expect.objectContaining({ "X-Music-Guest-Capability": capability }));
      expect(init?.headers).not.toHaveProperty("Authorization");
    }
    expect(window.location.href).not.toContain(capability);
  });

  it("clears only a rotated or revoked slug and exposes explicit reacquisition", async () => {
    const user = userEvent.setup();
    setGuestMusicCapability("A".repeat(43), "owner-a");
    setGuestMusicCapability("B".repeat(43), "owner-b");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/youtube/search")
      ? new Response(JSON.stringify({ items: [{ id: { videoId: "video" }, snippet: { title: "Stale song", channelTitle: "Artist", thumbnails: { default: { url: "https://img/song" } } } }] }), { status: 200, headers: { "Content-Type": "application/json" } })
      : new Response(JSON.stringify({ error: { message: "revoked" } }), { status: 403, headers: { "Content-Type": "application/json" } })));
    mounted(<SearchSongs guestUrl="owner-a" ownerUsername="must-not-run" />);
    await user.type(screen.getByPlaceholderText(/Search for songs/), "music");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByText("Stale song"));
    await user.click(screen.getByRole("button", { name: "Add 1 song to queue" }));
    expect(await screen.findByText("Guest access expired. Paste the owner's latest handoff to request songs again.")).toBeDefined();
    expect(screen.getByText("Paste guest access handoff")).toBeDefined();
    expect(getGuestMusicCapability("owner-a")).toBeUndefined();
    expect(getGuestMusicCapability("owner-b")).toBe("B".repeat(43));
  });
});
