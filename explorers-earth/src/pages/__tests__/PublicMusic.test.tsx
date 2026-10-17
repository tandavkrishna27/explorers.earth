import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicMusic, { PublicMusicContent } from "../public/PublicMusic";
import type { PublicMusicResource } from "../../features/music/publicMusicClient";

const loadPublicMusic = vi.hoisted(() => vi.fn());
const subscribeToPublicMusic = vi.hoisted(() => vi.fn(() => ({ unsubscribe: vi.fn() })));

vi.mock("../../features/music/publicMusicClient", () => ({
  publicMusicClient: { load: loadPublicMusic },
  PublicMusicError: class PublicMusicError extends Error {
    constructor(public readonly code: string, public readonly retryAfterSeconds?: number) { super(code); }
  },
}));

vi.mock("../../components/SEO", () => ({ default: () => null }));
vi.mock("react-player", () => ({
  default: (props: Record<string, unknown>) => <div data-testid="guest-media" data-playing={String(props.playing)} />,
}));
vi.mock("../../features/music/publicMusicLiveClient", () => ({ subscribeToPublicMusic }));

const playing = { id: "P".repeat(43), youtubeId: "abcdefghijk", title: "Now", artist: "Artist", thumbnailUrl: "https://images.example/now.jpg", position: 0, status: "playing" as const, playedAt: null };
const queued = { ...playing, id: "Q".repeat(43), title: "Next", status: "queued" as const, position: 1 };
const saved = { ...playing, id: "S".repeat(43), title: "North", artist: "Sky", status: "saved" as const };
const played = { ...playing, id: "H".repeat(43), title: "Past", status: "played" as const, playedAt: "2026-08-28T10:00:00.000Z" };

function resource(overrides: Partial<PublicMusicResource> = {}): PublicMusicResource {
  return {
    version: "music-public-resource/v1" as const,
    revision: 1,
    user: { username: "display", venueName: null },
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
    ...overrides,
  };
}

describe("public Music page", () => {
  it("hides only the friendly decorative Music title while retaining the focus target", () => {
    const friendly = render(<MemoryRouter><PublicMusicContent state="ready" resource={resource()} standalone={false} /></MemoryRouter>);
    const friendlyHeading = screen.getByRole("heading", { name: "Music", level: 1 });
    expect(friendlyHeading).toHaveAttribute("id", "public-music-heading");
    expect(friendlyHeading).toHaveAttribute("tabindex", "-1");
    expect(friendlyHeading).toHaveClass("sr-only");
    friendly.unmount();

    render(<MemoryRouter><PublicMusicContent state="ready" resource={resource()} standalone /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Music", level: 1 })).toHaveClass("public-music__heading");
  });
  it('reserves music geometry without fabricated data during loading', () => {
    const view = render(<MemoryRouter><PublicMusicContent state="loading" /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent(/Loading Music/i);
    expect(view.container.querySelector('[data-music-skeleton]')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
  it('leaves the first loading announcement to the Earth overlay', () => {
    render(<MemoryRouter><PublicMusicContent state="loading" initialOverlayActive /></MemoryRouter>);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('uses only the existing main on friendly rate-limited routes', () => {
    render(<MemoryRouter><main><PublicMusicContent state="rate-limited" standalone={false} retryAfterSeconds={10} /></main></MemoryRouter>);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('button', {name: 'Retry'})).toBeDisabled();
  });
  afterEach(() => {
    loadPublicMusic.mockReset();
    subscribeToPublicMusic.mockClear();
    vi.useRealTimers();
    window.history.replaceState({}, "", "/");
    window.sessionStorage.clear();
  });

  it("uses the unified public 404 for private, missing, and invalid links", () => {
    render(<MemoryRouter><PublicMusicContent state="not-found" onRetry={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Music page unavailable" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to Explorers" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
  it.each(["private", "missing", "invalid"])("renders an actual %s standalone resource failure without Retry or owner detail", async (scenario) => {
    const { PublicMusicError } = await import("../../features/music/publicMusicClient");
    loadPublicMusic.mockRejectedValue(new PublicMusicError("PUBLIC_NOT_FOUND"));
    render(<MemoryRouter initialEntries={[`/music/share/${scenario}-public-slug`]}><Routes><Route path="/music/share/:publicSlug" element={<PublicMusic />} /></Routes></MemoryRouter>);
    await screen.findByRole("heading", { name: "Music page unavailable" });
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to Explorers" })).toHaveAttribute("href", "/");
    expect(document.body.textContent).not.toMatch(/account|private|suspended|tombstone|display/i);
  });

  it("uses the approved page-level empty copy when nothing is shared", () => {
    render(<MemoryRouter><PublicMusicContent state="ready" resource={resource()} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Music" })).toBeInTheDocument();
    expect(screen.getByText("Nothing has been shared here yet")).toBeInTheDocument();
  });

  it("announces reconnecting without replacing or focusing retained Music", () => {
    const focusTarget = document.createElement("button");
    document.body.append(focusTarget);
    focusTarget.focus();
    try {
      render(<MemoryRouter><PublicMusicContent state="ready" stale resource={resource()} /></MemoryRouter>);

      expect(screen.getByRole("status", { name: "Music connection status" })).toHaveTextContent(
        "Reconnecting… Your last Music update remains visible.",
      );
      expect(screen.getByRole("status", { name: "Music connection status" })).toHaveAttribute("aria-live", "polite");
      expect(screen.getByRole("heading", { name: "Music" })).toBeInTheDocument();
      expect(screen.getByText("Nothing has been shared here yet")).toBeInTheDocument();
      expect(document.activeElement).toBe(focusTarget);
    } finally {
      focusTarget.remove();
    }
  });

  it("renders public playlist content without edit controls", () => {
    render(<MemoryRouter><PublicMusicContent state="ready" resource={resource({
      permissions: { ...resource().permissions, allowPlaylistSharing: true },
      playlists: { items: [{ id: "L".repeat(43), name: "Roads", description: null, songs: { items: [saved], total: 1, truncated: false } }], total: 1, truncated: false },
    })} /></MemoryRouter>);
    const playlists = screen.getByRole("button", { name: "Playlists", exact: true });
    if (playlists.getAttribute("aria-expanded") !== "true") fireEvent.click(playlists);
    expect(screen.getByRole("heading", { name: "Roads" })).toBeInTheDocument();
    expect(screen.getByText("North")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit|delete|request|choose .* to play/i })).not.toBeInTheDocument();
  });

  it("tracks ready navigation and unavailable acknowledgement once per visible transition", async () => {
    const onAnalytics = vi.fn();
    const view = render(<MemoryRouter><PublicMusicContent state="ready" resource={resource()} onAnalytics={onAnalytics} /></MemoryRouter>);
    await waitFor(() => expect(onAnalytics).toHaveBeenCalledWith({ name: "navigation_opened", route: "direct" }, expect.any(String)));
    view.rerender(<MemoryRouter><PublicMusicContent state="ready" resource={resource()} onAnalytics={onAnalytics} /></MemoryRouter>);
    expect(onAnalytics).toHaveBeenCalledTimes(1);
    view.rerender(<MemoryRouter><PublicMusicContent state="unavailable" onAnalytics={onAnalytics} /></MemoryRouter>);
    await waitFor(() => expect(onAnalytics).toHaveBeenCalledWith({ name: "unavailable", reason: "service_unavailable" }, expect.any(String)));
    expect(onAnalytics).toHaveBeenCalledTimes(2);
    view.rerender(<MemoryRouter><PublicMusicContent state="loading" onAnalytics={onAnalytics} /></MemoryRouter>);
    view.rerender(<MemoryRouter><PublicMusicContent state="unavailable" onAnalytics={onAnalytics} /></MemoryRouter>);
    await waitFor(() => expect(onAnalytics).toHaveBeenCalledTimes(3));
    expect(onAnalytics.mock.calls[2][1]).not.toBe(onAnalytics.mock.calls[1][1]);
  });

  it("applies the permission policy even if protected collection data is supplied", () => {
    render(<MemoryRouter><PublicMusicContent state="ready" resource={resource({
      currentlyPlaying: playing,
      recentlyPlayed: { items: [played], total: 1, truncated: false },
      playlists: { items: [{ id: "L".repeat(43), name: "Protected", description: null, songs: { items: [saved], total: 1, truncated: false } }], total: 1, truncated: false },
    }) as PublicMusicResource} /></MemoryRouter>);

    expect(screen.queryByText("Now")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Play Now" })).not.toBeInTheDocument();
    expect(screen.queryByText("Past")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Protected" })).not.toBeInTheDocument();
  });

  it("renders queue-visible current state without upgrading it to playback interactivity", () => {
    const view = render(<MemoryRouter><PublicMusicContent state="ready" resource={resource({
      permissions: { ...resource().permissions, allowQueueVisibility: true },
      currentlyPlaying: playing,
      queue: { items: [queued], total: 1, truncated: false },
    })} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Queue" })).toBeInTheDocument();
    expect(screen.getByText("Now")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Up next" })).toHaveTextContent("Next");
    expect(screen.getByRole("list", { name: "Up next" })).not.toHaveTextContent("Now");
    expect(screen.queryByRole("link", { name: "Play Now" })).not.toBeInTheDocument();

    view.rerender(<MemoryRouter><PublicMusicContent state="ready" resource={resource()} /></MemoryRouter>);
    expect(screen.queryByRole("heading", { name: "Playing now & up next" })).not.toBeInTheDocument();
  });

  it("renders local playback controls only for a playback-eligible source", () => {
    render(<MemoryRouter><PublicMusicContent state="ready" resource={resource({
      permissions: { ...resource().permissions, allowGuestPlayOnDevice: true },
      currentlyPlaying: playing,
    })} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Play on this device" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Music" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByText("Now")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Up next" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play on this device", exact: true }));
    expect(screen.getByRole("button", { name: "Play Now on this device" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("enables Retry only after the server delay and runs the supplied recovery", () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    render(<MemoryRouter><PublicMusicContent state="rate-limited" retryAfterSeconds={2} onRetry={onRetry} /></MemoryRouter>);
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toBeDisabled();
    act(() => vi.advanceTimersByTime(1_999));
    expect(retry).toBeDisabled();
    act(() => vi.advanceTimersByTime(1));
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("reacquires the fragment for each slug, aborts the old read, and scrubs it on navigation", async () => {
    const first = new Promise(() => undefined);
    loadPublicMusic.mockReturnValueOnce(first).mockResolvedValueOnce(resource());
    window.history.replaceState({}, "", `/music/share/public-slug-a#access=${"A".repeat(43)}`);

    function Switcher() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate("/music/share/public-slug-b")}>Next Music page</button>;
    }
    render(
      <MemoryRouter initialEntries={["/music/share/public-slug-a"]}>
        <Switcher />
        <Routes><Route path="/music/share/:publicSlug" element={<PublicMusic />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(loadPublicMusic).toHaveBeenCalledTimes(1));
    const firstSignal = loadPublicMusic.mock.calls[0][2] as AbortSignal;
    expect(loadPublicMusic.mock.calls[0].slice(0, 2)).toEqual(["public-slug-a", "A".repeat(43)]);
    expect(window.location.hash).toBe("");

    window.history.replaceState({}, "", `/music/share/public-slug-b#access=${"B".repeat(43)}`);
    fireEvent.click(screen.getByRole("button", { name: "Next Music page" }));
    await waitFor(() => expect(loadPublicMusic).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);
    expect(loadPublicMusic.mock.calls[1].slice(0, 2)).toEqual(["public-slug-b", "B".repeat(43)]);
    expect(loadPublicMusic.mock.calls[1][2]).toBeInstanceOf(AbortSignal);
    expect(window.location.hash).toBe("");
  });

  it("retains a scrubbed unlisted capability for a same-tab remount", async () => {
    loadPublicMusic.mockResolvedValue(resource());
    window.history.replaceState({}, "", `/music/share/public-slug#access=${"C".repeat(43)}`);
    const first = render(
      <MemoryRouter initialEntries={["/music/share/public-slug"]}>
        <Routes><Route path="/music/share/:publicSlug" element={<PublicMusic />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(loadPublicMusic).toHaveBeenCalledWith("public-slug", "C".repeat(43), expect.any(AbortSignal)));
    first.unmount();
    loadPublicMusic.mockClear();
    render(
      <MemoryRouter initialEntries={["/music/share/public-slug"]}>
        <Routes><Route path="/music/share/:publicSlug" element={<PublicMusic />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(loadPublicMusic).toHaveBeenCalledWith("public-slug", "C".repeat(43), expect.any(AbortSignal)));
  });

  it("applies canonical live refetches and removes revoked content and capability", async () => {
    // Break caught: a socket envelope mutates rendered content directly or revocation leaves
    // stale protected content/capability in the mounted page.
    loadPublicMusic.mockResolvedValueOnce(resource({ revision: 1 })).mockResolvedValueOnce(resource({ revision: 4 }));
    window.history.replaceState({}, "", `/music/share/public-slug#access=${"D".repeat(43)}`);
    render(<MemoryRouter initialEntries={["/music/share/public-slug"]}><Routes><Route path="/music/share/:publicSlug" element={<PublicMusic />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(subscribeToPublicMusic).toHaveBeenCalledOnce());
    const options = subscribeToPublicMusic.mock.calls[0][0];
    const update = await options.onInvalidate(new AbortController().signal);
    expect(update.revision).toBe(4);
    update.apply();
    expect(loadPublicMusic).toHaveBeenCalledTimes(2);
    const { PublicMusicError } = await import("../../features/music/publicMusicClient");
    loadPublicMusic.mockRejectedValue(new PublicMusicError("PUBLIC_NOT_FOUND"));
    await act(async () => options.onError(new PublicMusicError("PUBLIC_NOT_FOUND")));
    await screen.findByRole("heading", { name: "Music page unavailable" });
    expect(screen.queryByRole("heading", { name: "Music" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem("explorers.music.unlisted-capability.v1:public-slug")).toBeNull();
  });

  it("retains the standalone resource and subscription after a transient live failure", async () => {
    loadPublicMusic.mockResolvedValue(resource());
    render(<MemoryRouter initialEntries={["/music/share/public_slug-123"]}><Routes><Route path="/music/share/:publicSlug" element={<PublicMusic />} /></Routes></MemoryRouter>);
    await screen.findByRole("heading", { name: "Music" });
    const options = subscribeToPublicMusic.mock.calls[0][0];
    const { PublicMusicError } = await import("../../features/music/publicMusicClient");
    options.onError(new PublicMusicError("PUBLIC_UNAVAILABLE"));
    expect(screen.getByRole("heading", { name: "Music" })).toBeInTheDocument();
    expect(subscribeToPublicMusic).toHaveBeenCalledTimes(1);
  });

  it("shows stale only after reconnecting and clears it after the current canonical apply", async () => {
    loadPublicMusic.mockResolvedValueOnce(resource({ revision: 3 })).mockResolvedValueOnce(resource({ revision: 3 }));
    render(<MemoryRouter initialEntries={["/music/share/public_slug-123"]}><Routes><Route path="/music/share/:publicSlug" element={<PublicMusic />} /></Routes></MemoryRouter>);
    await screen.findByRole("heading", { name: "Music" });
    const options = subscribeToPublicMusic.mock.calls[0][0];

    act(() => options.onConnectionState("connecting"));
    expect(screen.queryByRole("status", { name: "Music connection status" })).not.toBeInTheDocument();
    act(() => options.onConnectionState("reconnecting"));
    expect(screen.getByRole("status", { name: "Music connection status" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Music" })).toBeInTheDocument();

    const update = await options.onInvalidate(new AbortController().signal);
    act(() => {
      update.apply();
      options.onConnectionState("connected");
    });
    expect(screen.queryByRole("status", { name: "Music connection status" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Music" })).toBeInTheDocument();
  });

  it("ignores reconnect state from a disposed slug subscription", async () => {
    loadPublicMusic.mockResolvedValue(resource());
    function Switcher() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate("/music/share/public-slug-b")}>Next Music page</button>;
    }
    render(
      <MemoryRouter initialEntries={["/music/share/public-slug-a"]}>
        <Switcher />
        <Routes><Route path="/music/share/:publicSlug" element={<PublicMusic />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(subscribeToPublicMusic).toHaveBeenCalledTimes(1));
    const first = subscribeToPublicMusic.mock.calls[0][0];
    fireEvent.click(screen.getByRole("button", { name: "Next Music page" }));
    await waitFor(() => expect(subscribeToPublicMusic).toHaveBeenCalledTimes(2));

    act(() => first.onConnectionState("reconnecting"));
    expect(screen.queryByRole("status", { name: "Music connection status" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Music" })).toBeInTheDocument();
  });
});
