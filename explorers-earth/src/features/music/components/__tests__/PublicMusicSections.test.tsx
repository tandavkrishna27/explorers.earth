import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { PublicMusicError, type PublicMusicResource, type PublicMusicSong } from "../../publicMusicClient";
import { PublicMusicSections } from "../PublicMusicSections";
import { musicPermissionOracle } from "../../../../../../test-fixtures/music-permission-oracle";

const mediaRenders = vi.hoisted(() => [] as Array<{ src: string; playing: boolean }>);
let latestMediaProps: Record<string, unknown> = {};

vi.mock("react-player", async () => {
  const React = await import("react");
  return {
    default: React.forwardRef((props: Record<string, unknown>, ref) => {
      latestMediaProps = props;
      mediaRenders.push({ src: String(props.src), playing: Boolean(props.playing) });
      React.useImperativeHandle(ref, () => ({ play: async () => undefined, pause: () => undefined }));
      return <div data-testid="guest-media" data-playing={String(props.playing)} data-src={String(props.src)} />;
    }),
  };
});

const song = (
  id: string,
  title: string,
  status: PublicMusicSong["status"],
  position: number,
): PublicMusicSong => ({
  id: id.repeat(43),
  youtubeId: "abcdefghijk",
  title,
  artist: `${title} artist`,
  thumbnailUrl: `https://images.example/${id}.jpg`,
  position,
  status,
  playedAt: status === "played" ? "2026-08-28T10:00:00.000Z" : null,
});

const current = song("C", "Current signal", "playing", 0);
const queued = { ...song("Q", "Queue signal", "queued", 1), youtubeId: "lmnopqrstuv" };
const recent = song("H", "History signal", "played", 0);
const saved = song("S", "Playlist signal", "saved", 0);

function populatedResource(mask: number): PublicMusicResource {
  return {
    version: "music-public-resource/v1",
    revision: 7,
    user: { username: "listener", venueName: "Signal Room" },
    permissions: {
      allowSongRequests: Boolean(mask & 1),
      allowGuestPlayOnDevice: Boolean(mask & 2),
      allowPlaylistSharing: Boolean(mask & 4),
      allowRecentlyPlayedVisibility: Boolean(mask & 8),
      allowQueueVisibility: Boolean(mask & 16),
    },
    // Deliberately populate every protected field for every mask. The component
    // must remain fail-closed even if a compromised server returns denied data.
    currentlyPlaying: current,
    queue: { items: [queued], total: 3, truncated: true },
    recentlyPlayed: { items: [recent], total: 1, truncated: false },
    playlists: {
      items: [{
        id: "L".repeat(43),
        name: "Protected playlist signal",
        description: "Playlist description signal",
        songs: { items: [saved], total: 2, truncated: true },
      }],
      total: 2,
      truncated: true,
    },
  };
}

// Most security cases inspect expanded surfaces; opening is a real UI action.
function renderExpandedMusic(ui: Parameters<typeof render>[0]) {
  const result = render(ui);
  for (const name of ['Queue', 'Recently played', 'Playlists', 'Play on this device']) {
    const trigger = screen.queryByRole('button', {name, exact: true});
    if (trigger?.getAttribute('aria-expanded') === 'false') fireEvent.click(trigger);
  }
  return result;
}

describe("PublicMusicSections permission oracle", () => {
  it("retains the initially displayed playlist when a revision prepends another playlist", () => {
    const resource = populatedResource(4);
    const view = render(<PublicMusicSections resource={resource} />);
    const playlistsTrigger = screen.getByRole("button", { name: "Playlists", exact: true });
    if (playlistsTrigger.getAttribute("aria-expanded") === "false") fireEvent.click(playlistsTrigger);
    const next = { ...resource, revision: 8, playlists: { items: [
      { ...resource.playlists.items[0], id: "N".repeat(43), name: "New playlist" },
      ...resource.playlists.items,
    ], total: 2, truncated: false } };
    view.rerender(<PublicMusicSections resource={next} />);
    expect(screen.getByRole("button", { name: "Protected playlist signal", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "New playlist", exact: true })).toHaveAttribute("aria-pressed", "false");
  });
  it.each(["Recently played", "Playlists"])("prepares a %s row request without submitting until confirmation", async (section) => {
    const video = { id: { videoId: "abcdefghijk" }, snippet: { title: "Verified title", channelTitle: "Verified artist", thumbnails: { default: { url: "https://images.example/verified.jpg" } } } };
    const client = { search: vi.fn(), videoFromUrl: vi.fn().mockResolvedValue(video), requestSong: vi.fn().mockResolvedValue({ accepted: true }) };
    render(<PublicMusicSections resource={populatedResource(31)} publicSlug="owner" requestClient={client} />);
    fireEvent.click(screen.getByRole("button", { name: section, exact: true }));
    fireEvent.click(screen.getByRole("button", { name: section === "Playlists" ? "Prepare request for Playlist signal" : "Prepare request for History signal" }));
    const confirm = await screen.findByRole("button", { name: "Request Verified title by Verified artist" });
    expect(client.videoFromUrl).toHaveBeenCalledWith("owner", "https://www.youtube.com/watch?v=abcdefghijk", undefined, expect.any(AbortSignal));
    expect(client.requestSong).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Request a song" })).toHaveFocus();
    fireEvent.click(confirm);
    await screen.findByText("Song requested.");
    expect(client.requestSong).toHaveBeenCalledOnce();
  });

  it("does not offer row requests when requests are disabled", () => {
    renderExpandedMusic(<PublicMusicSections resource={populatedResource(30)} publicSlug="owner" />);
    expect(screen.queryByRole("button", { name: /Prepare request/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Request a song" })).not.toBeInTheDocument();
  });
  it('starts with Queue open and waits for explicit device playback interaction', async () => {
    render(<PublicMusicSections resource={populatedResource(31)} publicSlug="public-owner" />);
    expect(screen.getByRole('button', {name: 'Queue', exact: true})).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['Recently played', 'Playlists', 'Play on this device']) expect(screen.getByRole('button', {name, exact: true})).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('guest-media')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Listen on this device'}));
    expect(screen.getByRole('button', {name: 'Play Current signal on this device'})).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', {name: 'Play on this device', exact: true}));
    expect(screen.queryByTestId('guest-media')).not.toBeInTheDocument();
  });
  it.each([
    ["current", (() => { const value = populatedResource(2); value.queue.items = []; value.playlists.items = []; return value; })()],
    ["queue", (() => { const value = populatedResource(2 | 16); value.currentlyPlaying = null; return value; })()],
    ["playlist", (() => { const value = populatedResource(2 | 4); value.currentlyPlaying = null; value.queue.items = []; return value; })()],
    ["queue", (() => { const value = populatedResource(2 | 4 | 16); value.currentlyPlaying = null; return value; })()],
  ] as const)("attributes default playback to its actual %s origin", (source, resource) => {
    const onAnalytics = vi.fn();
    renderExpandedMusic(<PublicMusicSections resource={resource} onAnalytics={onAnalytics} />);
    act(() => (latestMediaProps.onPlay as () => void)());
    expect(onAnalytics).toHaveBeenCalledWith({ name: "playback_started", source });
  });

  it("preserves explicit queue and playlist origins with duplicate IDs, then falls back after removal", async () => {
    const onAnalytics = vi.fn();
    const duplicatePlaylist = { ...saved, id: queued.id };
    const initial = populatedResource(2 | 4 | 16);
    initial.playlists.items[0].songs.items = [duplicatePlaylist];
    const view = renderExpandedMusic(<PublicMusicSections resource={initial} onAnalytics={onAnalytics} />);
    await userEvent.click(screen.getByRole("button", { name: "Choose Queue signal to play on this device" }));
    act(() => (latestMediaProps.onPlay as () => void)());
    expect(onAnalytics).toHaveBeenLastCalledWith({ name: "playback_started", source: "queue" });
    await userEvent.click(screen.getByRole("button", { name: "Choose Playlist signal to play on this device" }));
    act(() => (latestMediaProps.onPlay as () => void)());
    expect(onAnalytics).toHaveBeenLastCalledWith({ name: "playback_started", source: "playlist" });

    view.rerender(<PublicMusicSections resource={{ ...initial, revision: 8, queue: { items: [], total: 0, truncated: false }, playlists: { items: [], total: 0, truncated: false } }} onAnalytics={onAnalytics} />);
    act(() => (latestMediaProps.onPlay as () => void)());
    expect(onAnalytics).toHaveBeenLastCalledWith({ name: "playback_started", source: "current" });
    view.rerender(<PublicMusicSections resource={{ ...initial, revision: 9, permissions: { ...initial.permissions, allowGuestPlayOnDevice: false } }} onAnalytics={onAnalytics} />);
    expect(screen.queryByTestId("guest-media")).not.toBeInTheDocument();
  });
  it("dedupes request engagement and counts accordion opening rather than hover", () => {
    const onAnalytics = vi.fn();
    render(<><button type="button">Outside</button><PublicMusicSections resource={populatedResource(31)} publicSlug="public-owner" onAnalytics={onAnalytics} /></>);
    const input = screen.getByLabelText("Search for a song or paste a YouTube URL");
    fireEvent.focus(input, {relatedTarget: screen.getByRole('button', {name: 'Outside'})});
    fireEvent.focus(screen.getByRole('button', {name: 'Search'}), {relatedTarget: input});
    expect(onAnalytics.mock.calls.filter(([event]) => event.section === 'request')).toHaveLength(1);
    for (const [name, section] of [['Queue','queue'], ['Recently played','history'], ['Playlists','playlists'], ['Play on this device','player']]) {
      const trigger = screen.getByRole('button', {name, exact: true});
      if (trigger.getAttribute('aria-expanded') === 'true') fireEvent.click(trigger);
      fireEvent.pointerEnter(trigger);
      expect(onAnalytics.mock.calls.filter(([event]) => event.section === section)).toHaveLength(0);
      fireEvent.click(trigger);
      expect(onAnalytics.mock.calls.filter(([event]) => event.section === section)).toHaveLength(1);
      fireEvent.click(trigger);
      expect(onAnalytics.mock.calls.filter(([event]) => event.section === section)).toHaveLength(1);
    }
  });

  it("emits only normalized product events at acknowledged interaction boundaries", async () => {
    const onAnalytics = vi.fn();
    const requestClient = {
      search: vi.fn().mockResolvedValue({ items: [{ id: { videoId: "abcdefghijk" }, snippet: { title: "Song", channelTitle: "Artist", thumbnails: { default: { url: "https://img.example/song.jpg" } } } }], nextPageToken: null }),
      videoFromUrl: vi.fn(),
      requestSong: vi.fn().mockResolvedValue(undefined),
    };
    renderExpandedMusic(<PublicMusicSections resource={populatedResource(1 | 2 | 4 | 16)} publicSlug="secret-public-slug" capability={"C".repeat(43)} requestClient={requestClient as never} onAnalytics={onAnalytics} />);
    fireEvent.click(screen.getByRole('button', {name: 'Queue', exact: true}));
    fireEvent.click(screen.getByRole('button', {name: 'Queue', exact: true}));

    await userEvent.click(screen.getByRole("button", { name: "Choose Queue signal to play on this device" }));
    await userEvent.click(screen.getByRole("button", { name: "Choose Playlist signal to play on this device" }));
    await userEvent.type(screen.getByLabelText("Search for a song or paste a YouTube URL"), "raw private query");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(await screen.findByRole("button", { name: "Request Song by Artist" }));
    await screen.findByText("Song requested.");

    expect(onAnalytics.mock.calls.map(([event]) => event)).toEqual(expect.arrayContaining([
      { name: "section_opened", section: "queue" },
      { name: "song_selected", source: "queue" },
      { name: "section_opened", section: "playlists" },
      { name: "playlist_opened" },
      { name: "song_selected", source: "playlist" },
      { name: "section_opened", section: "request" },
      { name: "request_submitted", outcome: "accepted" },
    ]));
    expect(JSON.stringify(onAnalytics.mock.calls)).not.toMatch(/secret-public-slug|CCCCCCCC|raw private query|youtube|https?:/i);
  });
  it("reconciles request revocation, unmounts stale controls, and restores contained focus", async () => {
    const onReconcile = vi.fn();
    const requestClient = { search: vi.fn().mockResolvedValue({ items: [{ id: { videoId: "abcdefghijk" }, snippet: { title: "Song", channelTitle: "Artist", thumbnails: { default: { url: "https://img.example/song.jpg" } } } }], nextPageToken: null }), videoFromUrl: vi.fn(), requestSong: vi.fn().mockRejectedValue(new PublicMusicError("PUBLIC_NOT_FOUND")) };
    renderExpandedMusic(<><h1 id="public-music-heading" tabIndex={-1}>Music</h1><button type="button">Outside</button><PublicMusicSections resource={populatedResource(1)} publicSlug="public-owner" onReconcile={onReconcile} requestClient={requestClient as never} /></>);
    await userEvent.type(screen.getByLabelText("Search for a song or paste a YouTube URL"), "song");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(await screen.findByRole("button", { name: "Request Song by Artist" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Song requests are no longer available");
    expect(screen.queryByLabelText("Search for a song or paste a YouTube URL")).not.toBeInTheDocument();
    expect(onReconcile).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Music" })).toHaveFocus());
  });
  it.each(musicPermissionOracle)(
    "renders only permitted data and interactivity for mask %i",
    (mask, requests, playback, playlists, history, queue, currentVisible) => {
      const resource = populatedResource(mask);
      renderExpandedMusic(<PublicMusicSections resource={resource} publicSlug="public-owner" />);
      expect(screen.queryByRole("region", { name: "Request a song" })).toBe(requests ? screen.getByRole("region", { name: "Request a song" }) : null);

      expect(screen.queryByTestId("public-music-player")).toBe(playback ? screen.getByTestId("public-music-player") : null);
      expect(screen.queryByRole("region", { name: "Queue" })).toBe(queue ? screen.getByRole("region", { name: "Queue" }) : null);
      expect(screen.queryByRole("region", { name: "Playlists" })).toBe(playlists ? screen.getByRole("region", { name: "Playlists" }) : null);
      expect(screen.queryByRole("region", { name: "Recently played" })).toBe(history ? screen.getByRole("region", { name: "Recently played" }) : null);

      expect(screen.queryAllByText("Queue signal").length > 0).toBe(Boolean(queue));
      expect(screen.queryAllByText("History signal").length > 0).toBe(Boolean(history));
      expect(screen.queryAllByText("Playlist signal").length > 0).toBe(Boolean(playlists));
      expect(screen.queryAllByText("Current signal").length > 0).toBe(Boolean(currentVisible));

      const expectedReadingOrder = [
        ...(requests ? ["Request a song"] : []),
        ...(queue ? ["Queue"] : []),
        ...(history ? ["Recently played"] : []),
        ...(playlists ? ["Playlists"] : []),
        ...(playback ? ["Play on this device"] : []),
      ];
      expect(screen.queryAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(expectedReadingOrder);

      expect(screen.queryByRole("button", { name: /^Play .* on this device$/ })).toBe(playback
        ? screen.getByRole("button", { name: /^Play .* on this device$/ })
        : null);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox")).toBe(requests ? screen.getByRole("textbox") : null);
    },
  );

  it("does not render a player shell when playback has no exposed source", () => {
    const resource = populatedResource(2);
    resource.currentlyPlaying = null;
    resource.queue = { items: [], total: 0, truncated: false };
    resource.playlists = { items: [], total: 0, truncated: false };
    renderExpandedMusic(<PublicMusicSections resource={resource} />);
    expect(screen.queryByTestId("public-music-player")).not.toBeInTheDocument();
    expect(screen.getByText("Nothing has been shared here yet")).toBeInTheDocument();
  });

  it.each([0, 1, 3])("renders %i shared playlists without inventing songs or hiding empty queue/history", (count) => {
    const value = populatedResource(31);
    value.currentlyPlaying = null;
    value.queue = { items: [], total: 0, truncated: false };
    value.recentlyPlayed = { items: [], total: 0, truncated: false };
    value.playlists = { items: ["First playlist", "Second playlist", "Third playlist"].slice(0, count).map((name, index) => ({
      id: String(index).repeat(43), name, description: null, songs: { items: [], total: 0, truncated: false },
    })), total: count, truncated: false };
    renderExpandedMusic(<PublicMusicSections resource={value} publicSlug="public-owner" />);
    expect(screen.queryAllByRole("article")).toHaveLength(count ? 1 : 0);
    for (const name of ["First playlist", "Second playlist", "Third playlist"].slice(0, count)) expect(screen.getByRole("button", {name, exact: true})).toBeInTheDocument();
    expect(screen.getByText("Nothing queued yet")).toBeInTheDocument();
    expect(screen.getByText("Nothing played recently")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Play on this device" })).not.toBeInTheDocument();
    if (count === 0) expect(screen.getByText("No shared playlists yet")).toBeInTheDocument();
    else expect(screen.getAllByText("No songs in this playlist yet")).toHaveLength(1);
  });

  it.each([
    ["allowSongRequests", "Request a song"],
    ["allowGuestPlayOnDevice", "Play on this device"],
    ["allowPlaylistSharing", "Playlists"],
    ["allowRecentlyPlayedVisibility", "Recently played"],
    ["allowQueueVisibility", "Queue"],
  ] as const)("updates %s On→Off→On while mounted", (flag, heading) => {
    const initial = populatedResource(31);
    const view = renderExpandedMusic(<PublicMusicSections resource={initial} publicSlug="public-owner" />);
    expect(screen.getByRole("heading", { name: heading, exact: true })).toBeInTheDocument();
    view.rerender(<PublicMusicSections resource={{ ...initial, revision: 8, permissions: { ...initial.permissions, [flag]: false } }} publicSlug="public-owner" />);
    expect(screen.queryByRole("heading", { name: heading, exact: true })).not.toBeInTheDocument();
    view.rerender(<PublicMusicSections resource={{ ...initial, revision: 9 }} publicSlug="public-owner" />);
    expect(screen.getByRole("heading", { name: heading, exact: true })).toBeInTheDocument();
  });

  it("restores requests only after a newer canonical revision following server denial", async () => {
    // Break caught: a server denial must not permanently latch requests off after the owner re-enables them.
    const initial = populatedResource(1);
    const requestClient = { search: vi.fn().mockRejectedValue(new PublicMusicError("REQUEST_FORBIDDEN")), videoFromUrl: vi.fn(), requestSong: vi.fn() };
    const view = renderExpandedMusic(<PublicMusicSections resource={initial} publicSlug="public-owner" requestClient={requestClient} />);
    await userEvent.type(screen.getByRole("textbox"), "song");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
    view.rerender(<PublicMusicSections resource={{ ...initial }} publicSlug="public-owner" requestClient={requestClient} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    view.rerender(<PublicMusicSections resource={{ ...initial, revision: 6 }} publicSlug="public-owner" requestClient={requestClient} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    view.rerender(<PublicMusicSections resource={{ ...initial, revision: 8, permissions: { ...initial.permissions, allowSongRequests: false } }} publicSlug="public-owner" requestClient={requestClient} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    view.rerender(<PublicMusicSections resource={{ ...initial, revision: 9 }} publicSlug="public-owner" requestClient={requestClient} />);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it.each(["slug", "capability"] as const)("does not carry a denied request across a new %s scope", async (dimension) => {
    const requestClient = { search: vi.fn().mockRejectedValue(new PublicMusicError("REQUEST_FORBIDDEN")), videoFromUrl: vi.fn(), requestSong: vi.fn() };
    const initial = populatedResource(1);
    const view = renderExpandedMusic(<PublicMusicSections resource={initial} publicSlug="public-owner" capability={"A".repeat(43)} requestClient={requestClient} />);
    await userEvent.type(screen.getByRole("textbox"), "song");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
    view.rerender(<PublicMusicSections resource={{ ...initial, revision: 1 }} publicSlug={dimension === "slug" ? "another-owner" : "public-owner"} capability={(dimension === "capability" ? "B" : "A").repeat(43)} requestClient={requestClient} />);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it.each([
    ["search", "revision"], ["search", "slug"], ["search", "capability"],
    ["submit", "revision"], ["submit", "slug"], ["submit", "capability"],
  ] as const)("contains an in-flight %s denial across a changed %s and recovers only with current authority", async (operation, dimension) => {
    let rejectOld!: (error: unknown) => void;
    const video = { id: { videoId: "abcdefghijk" }, snippet: { title: "Fresh song", channelTitle: "Artist", thumbnails: { default: { url: "https://img.example/song.jpg" } } } };
    const pending = () => new Promise((_, reject) => { rejectOld = reject; });
    const requestClient = { search: operation === "search" ? vi.fn().mockImplementationOnce(pending).mockResolvedValue({ items: [video], nextPageToken: null }) : vi.fn().mockResolvedValue({ items: [video], nextPageToken: null }), videoFromUrl: vi.fn(), requestSong: vi.fn().mockImplementation(pending) };
    const onReconcile = vi.fn();
    const onAnalytics = vi.fn();
    const initial = populatedResource(1);
    const view = renderExpandedMusic(<PublicMusicSections resource={initial} publicSlug="public-owner" capability={"A".repeat(43)} requestClient={requestClient} onReconcile={onReconcile} onAnalytics={onAnalytics} />);
    await userEvent.type(screen.getByRole("textbox"), "old query");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    if (operation === "submit") await userEvent.click(await screen.findByRole("button", { name: "Request Fresh song by Artist" }));
    view.rerender(<PublicMusicSections resource={{ ...initial, revision: dimension === "revision" ? 8 : 1 }} publicSlug={dimension === "slug" ? "another-owner" : "public-owner"} capability={(dimension === "capability" ? "B" : "A").repeat(43)} requestClient={requestClient} onReconcile={onReconcile} onAnalytics={onAnalytics} />);
    await act(async () => rejectOld(new PublicMusicError("REQUEST_FORBIDDEN")));
    if (dimension === "revision") {
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(onReconcile).toHaveBeenCalledTimes(1);
      view.rerender(<PublicMusicSections resource={{ ...initial, revision: 8 }} publicSlug="public-owner" capability={"A".repeat(43)} requestClient={requestClient} onReconcile={onReconcile} onAnalytics={onAnalytics} />);
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      view.rerender(<PublicMusicSections resource={{ ...initial, revision: 9 }} publicSlug="public-owner" capability={"A".repeat(43)} requestClient={requestClient} onReconcile={onReconcile} onAnalytics={onAnalytics} />);
    }
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "fresh query");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("button", { name: "Request Fresh song by Artist" })).toBeInTheDocument();
    if (dimension !== "revision") {
      expect(onReconcile).not.toHaveBeenCalled();
      expect(onAnalytics).not.toHaveBeenCalledWith({ name: "request_submitted", outcome: "forbidden" });
    }
  });

  it("selects an exposed playlist song for local playback without autoplaying it", async () => {
    const user = userEvent.setup();
    renderExpandedMusic(<PublicMusicSections resource={populatedResource(2 | 4)} />);
    await user.click(screen.getByRole("button", { name: "Choose Playlist signal to play on this device" }));
    expect(screen.getByRole("button", { name: "Play Playlist signal on this device" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose Playlist signal to play on this device" })).toHaveAttribute("aria-current", "true");
  });

  it("remounts a newly selected source paused before ReactPlayer can observe its src", async () => {
    const user = userEvent.setup();
    mediaRenders.length = 0;
    renderExpandedMusic(<PublicMusicSections resource={populatedResource(2 | 4 | 16)} />);
    await user.click(screen.getByRole("button", { name: "Play Current signal on this device" }));
    expect(screen.getByTestId("guest-media")).toHaveAttribute("data-playing", "true");

    await user.click(screen.getByRole("button", { name: "Choose Queue signal to play on this device" }));
    expect(screen.getByTestId("guest-media")).toHaveAttribute("data-src", "https://www.youtube.com/watch?v=lmnopqrstuv");
    expect(screen.getByTestId("guest-media")).toHaveAttribute("data-playing", "false");
    expect(screen.getByRole("button", { name: "Play Queue signal on this device" })).toBeInTheDocument();
    expect(mediaRenders.filter(({ src }) => src.endsWith("lmnopqrstuv"))[0]).toEqual({
      src: "https://www.youtube.com/watch?v=lmnopqrstuv",
      playing: false,
    });
  });

  it.each([false, true])("preserves the player during revalidation and honors cancellation=%s", async (cancel) => {
    const initial = populatedResource(2 | 4);
    const view = renderExpandedMusic(<PublicMusicSections resource={initial} guestActionsEnabled />);
    await userEvent.click(screen.getByRole("button", { name: /Play Current signal/ }));
    const media = screen.getByTestId("guest-media");
    view.rerender(<PublicMusicSections resource={initial} guestActionsEnabled={false} />);
    expect(screen.getByTestId("guest-media")).toBe(media);
    expect(media).toHaveAttribute("data-playing", "false");
    act(() => (latestMediaProps.onPause as () => void)());
    expect(screen.getByRole("button", { name: "Pause Current signal" })).toBeEnabled();
    if (cancel) {
      await userEvent.click(screen.getByRole("button", { name: "Pause Current signal" }));
      expect(screen.getByRole("button", { name: /Play Current signal/ })).toBeDisabled();
    }
    view.rerender(<PublicMusicSections resource={{ ...initial, revision: 8 }} guestActionsEnabled />);
    expect(screen.getByTestId("guest-media")).toBe(media);
    expect(media).toHaveAttribute("data-playing", String(!cancel));
    view.rerender(<PublicMusicSections resource={{ ...initial, revision: 9, permissions: { ...initial.permissions, allowGuestPlayOnDevice: false } }} guestActionsEnabled />);
    expect(screen.queryByTestId("guest-media")).not.toBeInTheDocument();
  });

  it("removes playback controls and the media surface on canonical permission revocation", async () => {
    const user = userEvent.setup();
    const initial = populatedResource(2 | 4);
    const { rerender } = renderExpandedMusic(<PublicMusicSections resource={initial} />);
    await user.click(screen.getByRole("button", { name: /Play Current signal/ }));

    rerender(<PublicMusicSections resource={{
      ...initial,
      revision: 8,
      permissions: { ...initial.permissions, allowGuestPlayOnDevice: false },
    }} />);
    expect(screen.queryByTestId("public-music-player")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /on this device/ })).not.toBeInTheDocument();
  });

  it("announces focused playback revocation and moves focus to the Music heading", async () => {
    const initial = populatedResource(2);
    const { rerender } = renderExpandedMusic(<><h1 id="public-music-heading" tabIndex={-1}>Music</h1><PublicMusicSections resource={initial} /></>);
    screen.getByRole("button", { name: /Play Current signal/ }).focus();

    rerender(<><h1 id="public-music-heading" tabIndex={-1}>Music</h1><PublicMusicSections resource={{
      ...initial,
      revision: 8,
      currentlyPlaying: null,
      permissions: { ...initial.permissions, allowGuestPlayOnDevice: false },
    }} /></>);

    expect(screen.getByRole("heading", { name: "Music" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Playback on this device is no longer available.");
    expect(screen.queryByTestId("guest-media")).not.toBeInTheDocument();
  });

  it("does not steal focus when playback is revoked while focus is elsewhere", () => {
    const initial = populatedResource(2 | 4);
    const { rerender } = renderExpandedMusic(<><h1 id="public-music-heading" tabIndex={-1}>Music</h1><button type="button">Outside</button><PublicMusicSections resource={initial} /></>);
    screen.getByRole("button", { name: "Outside" }).focus();

    rerender(<><h1 id="public-music-heading" tabIndex={-1}>Music</h1><button type="button">Outside</button><PublicMusicSections resource={{
      ...initial,
      revision: 8,
      permissions: { ...initial.permissions, allowGuestPlayOnDevice: false },
    }} /></>);

    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
    expect(screen.queryByText("Playback on this device is no longer available.")).not.toBeInTheDocument();
  });

  it("announces canonical request permission revocation and preserves outside focus", () => {
    const initial = populatedResource(1 | 4);
    const { rerender } = renderExpandedMusic(<><h1 id="public-music-heading" tabIndex={-1}>Music</h1><button type="button">Outside</button><PublicMusicSections resource={initial} publicSlug="public-owner" /></>);
    screen.getByRole("button", { name: "Outside" }).focus();
    rerender(<><h1 id="public-music-heading" tabIndex={-1}>Music</h1><button type="button">Outside</button><PublicMusicSections resource={{ ...initial, revision: 8, permissions: { ...initial.permissions, allowSongRequests: false } }} publicSlug="public-owner" /></>);
    expect(screen.queryByLabelText("Search for a song or paste a YouTube URL")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Song requests are no longer available.");
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
  });

  it("moves contained focus to the Music heading when canonical request permission is revoked", () => {
    const initial = populatedResource(1 | 4);
    const { rerender } = renderExpandedMusic(<><h1 id="public-music-heading" tabIndex={-1}>Music</h1><PublicMusicSections resource={initial} publicSlug="public-owner" /></>);
    screen.getByLabelText("Search for a song or paste a YouTube URL").focus();
    rerender(<><h1 id="public-music-heading" tabIndex={-1}>Music</h1><PublicMusicSections resource={{ ...initial, revision: 8, permissions: { ...initial.permissions, allowSongRequests: false } }} publicSlug="public-owner" /></>);
    expect(screen.getByRole("heading", { name: "Music" })).toHaveFocus();
  });

  it("reconciles a delayed lookup revocation without stealing focus that moved outside", async () => {
    let rejectSearch!: (error: unknown) => void;
    const onReconcile = vi.fn();
    const requestClient = { search: vi.fn(() => new Promise((_, reject) => { rejectSearch = reject; })), videoFromUrl: vi.fn(), requestSong: vi.fn() };
    renderExpandedMusic(<><h1 id="public-music-heading" tabIndex={-1}>Music</h1><button type="button">Outside</button><PublicMusicSections resource={populatedResource(1 | 4)} publicSlug="public-owner" onReconcile={onReconcile} requestClient={requestClient as never} /></>);
    await userEvent.type(screen.getByLabelText("Search for a song or paste a YouTube URL"), "song");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    screen.getByRole("button", { name: "Outside" }).focus();
    rejectSearch(new PublicMusicError("REQUEST_FORBIDDEN"));
    await waitFor(() => expect(onReconcile).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("Search for a song or paste a YouTube URL")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Song requests are no longer available.");
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
  });

  it("uses one page-level empty state instead of stacking enabled-empty messages", () => {
    const resource = populatedResource(31);
    resource.currentlyPlaying = null;
    resource.queue = { items: [], total: 0, truncated: false };
    resource.recentlyPlayed = { items: [], total: 0, truncated: false };
    resource.playlists = { items: [], total: 0, truncated: false };
    renderExpandedMusic(<PublicMusicSections resource={resource} />);
    expect(screen.getByText("Nothing has been shared here yet")).toBeInTheDocument();
    expect(screen.queryByText("Nothing queued yet")).not.toBeInTheDocument();
    expect(screen.queryByText("No shared playlists yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing played recently")).not.toBeInTheDocument();
  });

  it("shows warm empty and truthful truncation summaries alongside partial content", () => {
    const resource = populatedResource(4 | 8 | 16);
    resource.recentlyPlayed = { items: [], total: 0, truncated: false };
    renderExpandedMusic(<PublicMusicSections resource={resource} />);

    expect(within(screen.getByRole("region", { name: "Queue" })).getByText("Showing 1 of 3")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Playlists" })).getByText("Showing 1 of 2 playlists")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 2 songs")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Recently played" })).getByText("Nothing played recently")).toBeInTheDocument();
  });

  it("uses semantic headings and lists with decorative artwork", () => {
    const { container } = renderExpandedMusic(<PublicMusicSections resource={populatedResource(31)} />);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);
    expect(screen.getAllByRole("list").length).toBeGreaterThanOrEqual(3);
    for (const image of container.querySelectorAll("img")) {
      expect(image).toHaveAttribute("alt", "");
    }
  });

  it("has no serious or critical automated accessibility violations", async () => {
    const { container } = renderExpandedMusic(<PublicMusicSections resource={populatedResource(31)} />);
    const result = await axe.run(container, {
      // JSDOM has no layout or computed color model; browser UAT owns contrast.
      rules: { "color-contrast": { enabled: false } },
    });
    expect(result.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
  });

  it.each([
    [20, ["Queue", "Playlists"]], [21, ["Queue", "Playlists"]],
    [28, ["Queue", "Recently played", "Playlists"]],
    [14, ["Recently played", "Playlists", "Play on this device"]],
    [26, ["Queue", "Recently played", "Play on this device"]],
    [8, ["Recently played"]], [31, ["Queue", "Recently played", "Playlists", "Play on this device"]],
  ] as const)("keeps visible headings in the same mobile and desktop order for mask %i", (mask, expected) => {
    render(<PublicMusicSections resource={populatedResource(mask)} />);
    expect(screen.getAllByRole("heading", {level: 2}).map(heading => heading.textContent)).toEqual(expected);
  });
});
