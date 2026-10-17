import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MusicSearch } from "../MusicSearch";

const first = { id: { videoId: "abcdefghijk" }, snippet: { title: "First song", channelTitle: "Artist one", thumbnails: { default: { url: "https://img/1" } } } };
const second = { id: { videoId: "lmnopqrstuv" }, snippet: { title: "Second song", channelTitle: "Artist two", thumbnails: { default: { url: "https://img/2" } } } };

function clients() {
  const queueClient = {
    addSong: vi.fn().mockResolvedValue({ id: 7, youtubeId: "abcdefghijk" }),
    setPlaying: vi.fn().mockResolvedValue({ id: 7 }),
  };
  return {
    searchClient: {
      searchYouTube: vi.fn().mockResolvedValue({ items: [first, second], nextPageToken: "next" }),
      videoFromUrl: vi.fn().mockResolvedValue(first),
    },
    queueClient,
    onChanged: vi.fn().mockResolvedValue(undefined),
    beginPlaybackRequest: vi.fn(() => 43),
    onPlaybackRequested: vi.fn(async (songId: number | null) => {
      await queueClient.setPlaying(songId, `test-play-${crypto.randomUUID()}`);
      return "acknowledged" as const;
    }),
  };
}

describe("MusicSearch", () => {
  it.each([
    ["  HTTPS://YOUTU.BE/abcdefghijk?si=tracking  "],
    ["https://www.youtube.com/watch?v=abcdefghijk&t=90s"],
    ["https://www.youtube.com/shorts/abcdefghijk?feature=share"],
    ["https://music.youtube.com/watch?v=abcdefghijk"],
    ["https://www.youtube.com:443/watch?v=abcdefghijk"],
    ["http://www.youtube.com:80/watch?v=abcdefghijk"],
  ])("submits a supported single-video URL as a canonical lookup: %s", async (inputValue) => {
    const props = clients();
    render(<MusicSearch {...props} />);

    await userEvent.type(screen.getByRole("searchbox", { name: "Search music or paste a URL" }), inputValue);
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(props.searchClient.videoFromUrl).toHaveBeenCalledWith("https://www.youtube.com/watch?v=abcdefghijk"));
    expect(props.searchClient.searchYouTube).not.toHaveBeenCalled();
  });

  it.each([
    "https://www.youtube.com/playlist?list=PL123",
    "https://www.youtube.com/watch?v=abcdefghijk&list=PL123",
    "https://music.youtube.com/playlist?list=PL123",
    "https://www.youtube.com/watch?v=abcdefghijk&list=&list=PL123",
    "https://www.youtube.com/watch?v=abcdefghijk&list=PL123&list=%20%20",
    "https://www.youtube.com/watch?v=abcdefghijk&list=%20%20&list=PL123",
  ])("keeps focus and reports playlist import unavailable without a request: %s", async (inputValue) => {
    const props = clients();
    render(<MusicSearch {...props} />);
    const input = screen.getByRole("searchbox", { name: "Search music or paste a URL" });

    await userEvent.type(input, inputValue);
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByRole("status", { name: "Playlist import unavailable" })).toHaveTextContent("Playlist import is not currently supported");
    expect(input).toHaveFocus();
    expect(props.searchClient.videoFromUrl).not.toHaveBeenCalled();
    expect(props.searchClient.searchYouTube).not.toHaveBeenCalled();
  });

  it.each([
    ["road trip", "road trip"],
    ["  malformed https://youtube.com/%zz  ", "malformed https://youtube.com/%zz"],
    ["https://youtube.com.evil.example/watch?v=abcdefghijk", "https://youtube.com.evil.example/watch?v=abcdefghijk"],
    ["https://www.youtube.com/watch", "https://www.youtube.com/watch"],
    ["https://viewer:secret@www.youtube.com/watch?v=abcdefghijk", "https://viewer:secret@www.youtube.com/watch?v=abcdefghijk"],
    ["https://www.youtube.com:8443/watch?v=abcdefghijk", "https://www.youtube.com:8443/watch?v=abcdefghijk"],
  ])("treats ordinary, malformed, and unsupported input as text search: %s", async (inputValue, expectedQuery) => {
    const props = clients();
    render(<MusicSearch {...props} />);

    await userEvent.type(screen.getByRole("searchbox", { name: "Search music or paste a URL" }), inputValue);
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(props.searchClient.searchYouTube).toHaveBeenCalledWith(expectedQuery, undefined));
    expect(props.searchClient.videoFromUrl).not.toHaveBeenCalled();
  });

  it("uses one discovery input with attached URL and retired import actions", async () => {
    const props = clients();
    render(<MusicSearch {...props} />);
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    const input = screen.getByRole("searchbox", { name: "Search music or paste a URL" });
    await userEvent.type(input, "https://youtu.be/abcdefghijk");
    await userEvent.click(screen.getByRole("button", { name: "Open discovery actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Add from URL" }));
    expect(props.searchClient.videoFromUrl).toHaveBeenCalledWith("https://www.youtube.com/watch?v=abcdefghijk");
    await userEvent.click(screen.getByRole("button", { name: "Open discovery actions" }));
    const importAction = screen.getByRole("menuitem", { name: "Import playlist unavailable" });
    expect(importAction).toBeDisabled();
    expect(screen.getByText(/playlist import is not currently supported/i)).toBeInTheDocument();
  });

  it("keeps playlist URLs unavailable when submitted from the explicit URL action", async () => {
    const props = clients();
    render(<MusicSearch {...props} />);
    const input = screen.getByRole("searchbox", { name: "Search music or paste a URL" });

    await userEvent.type(input, "https://www.youtube.com/watch?v=abcdefghijk&list=PL123");
    await userEvent.click(screen.getByRole("button", { name: "Open discovery actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Add from URL" }));

    expect(await screen.findByRole("status", { name: "Playlist import unavailable" })).toBeVisible();
    expect(props.searchClient.videoFromUrl).not.toHaveBeenCalled();
    expect(props.searchClient.searchYouTube).not.toHaveBeenCalled();
  });

  it("treats malformed URL text as search text from the explicit URL action", async () => {
    const props = clients();
    render(<MusicSearch {...props} />);

    await userEvent.type(screen.getByRole("searchbox", { name: "Search music or paste a URL" }), "https://www.youtube.com/watch");
    await userEvent.click(screen.getByRole("button", { name: "Open discovery actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Add from URL" }));

    await waitFor(() => expect(props.searchClient.searchYouTube).toHaveBeenCalledWith("https://www.youtube.com/watch", undefined));
    expect(props.searchClient.videoFromUrl).not.toHaveBeenCalled();
  });

  it("adds selected discoveries to a chosen saved playlist", async () => {
    const props = clients();
    const playlistClient = { addPlaylistSong: vi.fn().mockResolvedValue({ id: 33 }) };
    render(<MusicSearch {...props} playlists={[{ id: 9, name: "Roads" }]} playlistClient={playlistClient} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search music or paste a URL" }), "roads");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select First song" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Add selected to" }), "9");
    await userEvent.click(screen.getByRole("button", { name: "Add 1 selected to Roads" }));
    expect(playlistClient.addPlaylistSong).toHaveBeenCalledWith(9, expect.objectContaining({ youtubeId: "abcdefghijk" }), expect.stringMatching(/^music-playlist-add-/));
  });
  it("searches, selects multiple results, adds them, and paginates", async () => {
    const props = clients();
    render(<MusicSearch {...props} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search music or paste a URL" }), "roads");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("First song")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select First song" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Second song" }));
    await userEvent.click(screen.getByRole("button", { name: "Add 2 selected to queue" }));
    await waitFor(() => expect(props.queueClient.addSong).toHaveBeenCalledTimes(2));
    expect(props.onChanged).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(props.searchClient.searchYouTube).toHaveBeenLastCalledWith("roads", "next");
  });

  it("selects a result when its row is clicked and does not render a play-now action", async () => {
    const props = clients();
    render(<MusicSearch {...props} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search music or paste a URL" }), "roads");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    await userEvent.click(await screen.findByText("First song"));
    expect(screen.getByRole("checkbox", { name: "Select First song" })).toBeChecked();
    expect(screen.queryByRole("button", { name: /Play First song now/i })).not.toBeInTheDocument();
  });

  it("looks up a URL and adds the selected result to queue", async () => {
    const props = clients();
    render(<MusicSearch {...props} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search music or paste a URL" }), "https://youtu.be/abcdefghijk");
    await userEvent.click(screen.getByRole("button", { name: "Open discovery actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Add from URL" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select First song" }));
    await userEvent.click(screen.getByRole("button", { name: "Add 1 selected to queue" }));
    await waitFor(() => expect(props.queueClient.addSong).toHaveBeenCalledTimes(1));
    expect(props.onChanged).toHaveBeenCalledTimes(1);
    expect(props.queueClient.setPlaying).not.toHaveBeenCalled();
  });

  it("contains retryable failures, announces them, and can retry", async () => {
    const props = clients();
    props.searchClient.searchYouTube.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ items: [], nextPageToken: null });
    render(<MusicSearch {...props} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search music or paste a URL" }), "roads");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Music search is temporarily unavailable");
    await userEvent.click(screen.getByRole("button", { name: "Try search again" }));
    expect(await screen.findByText("No music found.")).toBeInTheDocument();
  });

  it("reconciles the queue when a multi-add only partly succeeds", async () => {
    const props = clients();
    props.queueClient.addSong.mockResolvedValueOnce({ id: 7, youtubeId: "abcdefghijk" }).mockRejectedValueOnce(new Error("offline"));
    render(<MusicSearch {...props} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search music or paste a URL" }), "roads");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select First song" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Second song" }));
    await userEvent.click(screen.getByRole("button", { name: "Add 2 selected to queue" }));
    await waitFor(() => expect(props.onChanged).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alert")).toHaveTextContent("Queue update failed");
    expect(screen.getByRole("checkbox", { name: "Select First song" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Second song" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Add 1 selected to queue" }));
    await waitFor(() => expect(props.queueClient.addSong).toHaveBeenCalledTimes(3));
    expect(props.queueClient.addSong.mock.calls[2][0]).toMatchObject({ youtubeId: "lmnopqrstuv" });
  });

  it("invalidates pagination when the query changes and ignores stale results", async () => {
    const props = clients();
    let resolveOld!: (value: { items: Array<typeof first>; nextPageToken: string | null }) => void;
    props.searchClient.searchYouTube.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce({ items: [second], nextPageToken: null });
    render(<MusicSearch {...props} />);
    const input = screen.getByRole("searchbox", { name: "Search music or paste a URL" });
    await userEvent.type(input, "old");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.clear(input);
    await userEvent.type(input, "new");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    resolveOld({ items: [first], nextPageToken: "stale-next" });
    expect(await screen.findByText("Second song")).toBeInTheDocument();
    expect(screen.queryByText("First song")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
  });

  it("keeps discovery actions attached to the single input", async () => {
    const props = clients();
    render(<MusicSearch {...props} />);
    const toggle = screen.getByRole("button", { name: "Open discovery actions" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toContainElement(screen.getByRole("menuitem", { name: "Add from URL" }));
  });

  it("keeps acknowledged queue adds committed when refresh and retry both fail", async () => {
    const props = clients();
    props.onChanged.mockRejectedValueOnce(new Error("refresh failed")).mockRejectedValueOnce(new Error("retry failed"));
    render(<MusicSearch {...props} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search music or paste a URL" }), "roads");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select First song" }));
    await userEvent.click(screen.getByRole("button", { name: "Add 1 selected to queue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Song was added, but the latest queue could not be loaded");
    expect(screen.getByRole("button", { name: "Retry refreshing queue" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry refreshing queue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Song was added, but the latest queue could not be loaded");
    expect(screen.queryByText(/was reloaded/i)).not.toBeInTheDocument();
    expect(props.queueClient.addSong).toHaveBeenCalledOnce();
  });

  it("keeps acknowledged playlist adds committed when refresh fails", async () => {
    const props = clients();
    const playlistClient = { addPlaylistSong: vi.fn().mockResolvedValue({ id: 33 }) };
    props.onChanged.mockRejectedValueOnce(new Error("refresh failed"));
    render(<MusicSearch {...props} playlists={[{ id: 9, name: "Roads" }]} playlistClient={playlistClient} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search music or paste a URL" }), "roads");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select First song" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Add selected to" }), "9");
    await userEvent.click(screen.getByRole("button", { name: "Add 1 selected to Roads" }));

    expect(await screen.findByRole("alert", { name: "Playlist update error" })).toHaveTextContent("Song was added to Roads, but the latest playlists could not be loaded");
    expect(screen.queryByRole("alert", { name: "Queue update error" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry refreshing playlists" }));
    await waitFor(() => expect(screen.queryByRole("alert", { name: "Playlist update error" })).not.toBeInTheDocument());
    expect(playlistClient.addPlaylistSong).toHaveBeenCalledOnce();
    expect(props.queueClient.addSong).not.toHaveBeenCalled();
  });

  it("retries only the ambiguous playlist item with its original key and payload", async () => {
    // Break caught: a lost response retries the saved-song insert under a fresh key and creates a duplicate.
    const props = clients();
    const playlistClient = { addPlaylistSong: vi.fn()
      .mockResolvedValueOnce({ id: 31 })
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce({ id: 32 }) };
    render(<MusicSearch {...props} playlists={[{ id: 9, name: "Roads" }]} playlistClient={playlistClient} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search music or paste a URL" }), "roads");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select First song" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Second song" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Add selected to" }), "9");
    await userEvent.click(screen.getByRole("button", { name: "Add 2 selected to Roads" }));
    expect(await screen.findByRole("alert", { name: "Playlist update error" })).toBeVisible();

    const ambiguous = playlistClient.addPlaylistSong.mock.calls[1];
    await userEvent.click(screen.getByRole("button", { name: "Add 1 selected to Roads" }));
    await waitFor(() => expect(playlistClient.addPlaylistSong).toHaveBeenCalledTimes(3));
    expect(playlistClient.addPlaylistSong.mock.calls[2]).toEqual(ambiguous);
    expect(playlistClient.addPlaylistSong.mock.calls.filter(([, song]) => song.youtubeId === "abcdefghijk")).toHaveLength(1);
  });

  it("treats refresh failure after a selected queue add as committed and retries refresh only", async () => {
    const props = clients();
    props.onChanged.mockRejectedValueOnce(new Error("refresh failed")).mockResolvedValueOnce(undefined);
    render(<MusicSearch {...props} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search music or paste a URL" }), "roads");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select First song" }));
    await userEvent.click(screen.getByRole("button", { name: "Add 1 selected to queue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Song was added, but the latest queue could not be loaded");
    await userEvent.click(screen.getByRole("button", { name: "Retry refreshing queue" }));
    await waitFor(() => expect(props.onChanged).toHaveBeenCalledTimes(2));
    expect(props.queueClient.addSong).toHaveBeenCalledTimes(1);
    expect(props.queueClient.setPlaying).not.toHaveBeenCalled();
  });

  it("does not start playback as part of a selected queue add", async () => {
    const props = clients();
    render(<MusicSearch {...props} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search music or paste a URL" }), "roads");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select First song" }));
    await userEvent.click(screen.getByRole("button", { name: "Add 1 selected to queue" }));
    expect(props.queueClient.addSong).toHaveBeenCalledTimes(1);
    expect(props.queueClient.setPlaying).not.toHaveBeenCalled();
  });

  it("synchronously locks duplicate search submits", async () => {
    const props = clients();
    props.searchClient.searchYouTube.mockReturnValue(new Promise(() => undefined));
    render(<MusicSearch {...props} />);
    const input = screen.getByRole("searchbox", { name: "Search music or paste a URL" });
    await userEvent.type(input, "roads");
    fireEvent.submit(input.closest("form")!);
    fireEvent.submit(input.closest("form")!);
    expect(props.searchClient.searchYouTube).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  });

  it("synchronously locks duplicate URL submits", async () => {
    const props = clients();
    props.searchClient.videoFromUrl.mockReturnValue(new Promise(() => undefined));
    render(<MusicSearch {...props} />);
    const input = screen.getByRole("searchbox", { name: "Search music or paste a URL" });
    await userEvent.type(input, "https://youtu.be/abcdefghijk");
    await userEvent.click(screen.getByRole("button", { name: "Open discovery actions" }));
    const action = screen.getByRole("menuitem", { name: "Add from URL" });
    fireEvent.click(action);
    fireEvent.click(action);
    expect(props.searchClient.videoFromUrl).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Music discovery status")).toHaveTextContent("Searching");
  });

  it("preserves queue refresh recovery across mode, input, and discovery changes", async () => {
    const props = clients();
    props.onChanged.mockRejectedValueOnce(new Error("refresh failed")).mockResolvedValueOnce(undefined);
    render(<MusicSearch {...props} />);
    const input = screen.getByRole("searchbox", { name: "Search music or paste a URL" });
    await userEvent.type(input, "roads");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select First song" }));
    await userEvent.click(screen.getByRole("button", { name: "Add 1 selected to queue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Song was added, but the latest queue could not be loaded");

    await userEvent.clear(input);
    await userEvent.type(input, "https://youtu.be/abcdefghijk");
    await userEvent.click(screen.getByRole("button", { name: "Open discovery actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Add from URL" }));
    expect(await screen.findByRole("button", { name: "Retry refreshing queue" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry refreshing queue" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Retry refreshing queue" })).not.toBeInTheDocument());
    expect(props.queueClient.addSong).toHaveBeenCalledTimes(1);
    expect(props.queueClient.setPlaying).not.toHaveBeenCalled();
  });
});
