import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MusicPlayer } from "../MusicPlayer";
import type { MusicSong } from "../../musicWorkspaceClient";

type PlayerProps = Record<string, unknown>;
let playerProps: PlayerProps;
const seekTo = vi.fn();

vi.mock("react-player", async () => {
  const React = await import("react");
  return { default: React.forwardRef((_props: PlayerProps, ref) => {
    playerProps = _props;
    React.useImperativeHandle(ref, () => ({ set currentTime(value: number) { seekTo(value); } }));
    return <div data-testid="media" data-playing={String(_props.playing)} data-volume={String(_props.volume)} data-muted={String(_props.muted)} />;
  }) };
});

const current: MusicSong = { id: 1, youtubeId: "abcdefghijk", title: "First song", artist: "Artist one", thumbnailUrl: "https://img/1", position: 0, status: "playing", playedAt: null };
const next: MusicSong = { id: 2, youtubeId: "lmnopqrstuv", title: "Next song", artist: "Artist two", thumbnailUrl: "https://img/2", position: 1, status: "queued", playedAt: null };
const previous: MusicSong = { id: 3, youtubeId: "zyxwvutsrqp", title: "Previous song", artist: "Artist three", thumbnailUrl: "https://img/3", position: 0, status: "played", playedAt: "2026-08-25T10:00:00.000Z" };
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function setup(overrides: Partial<React.ComponentProps<typeof MusicPlayer>> = {}) {
  const props: React.ComponentProps<typeof MusicPlayer> = {
    currentSong: current,
    queuedSongs: [next],
    playedSongs: [previous],
    queueClient: { setPlaying: vi.fn().mockResolvedValue(undefined) },
    onChanged: vi.fn().mockResolvedValue(undefined),
    authorityGeneration: "test-authority",
    ...overrides,
  };
  return { ...render(<MusicPlayer {...props} />), props };
}

describe("MusicPlayer", () => {
  beforeEach(() => { playerProps = {}; seekTo.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it("renders an artwork-first media-player surface", () => {
    setup();
    expect(screen.getByRole("img", { name: "Now playing: First song" })).toHaveAttribute("src", "https://img/1");
    expect(screen.getByTestId("primary-media-controls")).toContainElement(screen.getByRole("button", { name: "Play" }));
  });

  it("passes YouTube the current origin and a referrer policy", () => {
    setup();
    expect(playerProps.config).toEqual({
      youtube: {
        origin: window.location.origin,
        widget_referrer: window.location.href,
        referrerpolicy: "strict-origin-when-cross-origin",
      },
    });
  });

  it("starts audio-first and reveals video only on request", async () => {
    setup();
    expect(screen.getByTestId("video-surface")).toHaveAttribute("aria-hidden", "true");
    const toggle = screen.getByRole("button", { name: "Show video" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(screen.getByTestId("video-surface")).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByRole("button", { name: "Hide video" })).toHaveAttribute("aria-pressed", "true");
  });

  it("plays, pauses, changes volume, mutes, and exposes accessible values", async () => {
    const user = userEvent.setup(); setup();
    const toggle = screen.getByRole("button", { name: "Play" });
    expect(toggle).toHaveStyle({ minWidth: "44px", minHeight: "44px" });
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "true");
    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), { target: { value: "35" } });
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveAttribute("aria-valuetext", "35 percent");
    expect(screen.getByTestId("media")).toHaveAttribute("data-volume", "0.35");
    await user.click(screen.getByRole("button", { name: "Mute" }));
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
  });

  it("seeks through the ReactPlayer v3 media ref and reports elapsed time", () => {
    setup();
    act(() => (playerProps.onDurationChange as (event: { currentTarget: { duration: number } }) => void)({ currentTarget: { duration: 200 } }));
    act(() => (playerProps.onTimeUpdate as (event: { currentTarget: { currentTime: number } }) => void)({ currentTarget: { currentTime: 50 } }));
    const slider = screen.getByRole("slider", { name: "Playback position" });
    expect(slider).toHaveAttribute("aria-valuetext", "0:50 of 3:20");
    fireEvent.change(slider, { target: { value: "100" } });
    expect(slider).toHaveValue("100");
    expect(seekTo).toHaveBeenCalledWith(100);
  });

  it("persists next and previous-from-history transitions before refreshing", async () => {
    const latestPrevious = { ...previous, id: 4, title: "Latest previous", playedAt: "2026-08-25T11:00:00.000Z" };
    const user = userEvent.setup(); const { props } = setup({ playedSongs: [previous, latestPrevious] });
    await user.click(screen.getByRole("button", { name: "Next song" }));
    expect(props.queueClient.setPlaying).toHaveBeenCalledWith(2, expect.stringMatching(/^music-player-next-/));
    await user.click(screen.getByRole("button", { name: "Previous song" }));
    expect(props.queueClient.setPlaying).toHaveBeenCalledWith(4, expect.stringMatching(/^music-player-previous-/));
    expect(props.onChanged).toHaveBeenCalledTimes(2);
  });

  it("keeps local playback controls available while stale but disables canonical transitions", async () => {
    const user = userEvent.setup(); const { props } = setup({ readOnly: true });
    expect(screen.getByRole("button", { name: "Previous song" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next song" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    act(() => (playerProps.onEnded as () => void)());
    expect(props.queueClient.setPlaying).not.toHaveBeenCalled();
  });

  it("requests autoplay for the confirmed next song but broadcasts true only after media plays", async () => {
    const user = userEvent.setup(); const broadcastPlayerState = vi.fn(); const { props, rerender } = setup({ broadcastPlayerState });
    await user.click(screen.getByRole("button", { name: "Next song" }));
    await waitFor(() => expect(props.queueClient.setPlaying).toHaveBeenCalledWith(2, expect.any(String)));
    expect(broadcastPlayerState).not.toHaveBeenCalledWith(expect.objectContaining({ playing: true }));
    rerender(<MusicPlayer {...props} currentSong={next} queuedSongs={[]} />);
    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "true");
    act(() => (playerProps.onPlay as () => void)());
    expect(broadcastPlayerState).toHaveBeenCalledWith({ songId: 2, playing: true });
  });

  it("requests autoplay after an ended transition but waits for onPlay to broadcast", async () => {
    const broadcastPlayerState = vi.fn(); const { props, rerender } = setup({ broadcastPlayerState });
    act(() => (playerProps.onEnded as () => void)());
    await waitFor(() => expect(props.queueClient.setPlaying).toHaveBeenCalledWith(2, expect.any(String)));
    expect(broadcastPlayerState).not.toHaveBeenCalledWith(expect.objectContaining({ playing: true }));
    rerender(<MusicPlayer {...props} currentSong={next} queuedSongs={[]} />);
    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "true");
    act(() => (playerProps.onPlay as () => void)());
    expect(broadcastPlayerState).toHaveBeenCalledWith({ songId: 2, playing: true });
  });

  it("honors an external playback request only after its song becomes canonical", () => {
    const { props, rerender } = setup();
    rerender(<MusicPlayer {...props} playbackRequest={{ songId: next.id, requestId: 1, authorityGeneration: "test-authority" }} /> as React.ReactElement);
    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "false");

    rerender(<MusicPlayer {...props} currentSong={next} queuedSongs={[]} playbackRequest={{ songId: next.id, requestId: 1, authorityGeneration: "test-authority" }} /> as React.ReactElement);
    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "true");
  });

  it("does not honor an old authority playback request when the new account reuses the same song id", () => {
    // Break caught: account B can autoplay from account A's late request when both database rows use the same numeric ID.
    const { props, rerender } = setup({ authorityGeneration: "user-a:account-a" });
    rerender(<MusicPlayer {...props} authorityGeneration="user-b:account-b" playbackRequest={{
      songId: current.id, requestId: 4, authorityGeneration: "user-a:account-a",
    }} /> as React.ReactElement);

    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "false");
  });

  it("honors the new authority when its request and song ids match the previous account", () => {
    const { props, rerender } = setup({ authorityGeneration: "user-a:account-a" });
    rerender(<MusicPlayer {...props} authorityGeneration="user-a:account-a" playbackRequest={{
      songId: current.id, requestId: 4, authorityGeneration: "user-a:account-a",
    }} /> as React.ReactElement);
    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "true");

    rerender(<MusicPlayer {...props} authorityGeneration="user-b:account-b" playbackRequest={{
      songId: current.id, requestId: 4, authorityGeneration: "user-b:account-b",
    }} /> as React.ReactElement);
    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "true");
  });

  it("does not pause the current song while a request waits for another canonical song", async () => {
    const { props, rerender } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "true");

    rerender(<MusicPlayer {...props} playbackRequest={{ songId: next.id, requestId: 2, authorityGeneration: "test-authority" }} /> as React.ReactElement);

    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "true");
  });

  it("completes the current song when the queue ends", async () => {
    const broadcastPlayerState = vi.fn(); const { props } = setup({ queuedSongs: [], broadcastPlayerState });
    act(() => (playerProps.onEnded as () => void)());
    await waitFor(() => expect(props.queueClient.setPlaying).toHaveBeenCalledWith(null, expect.stringMatching(/^music-player-ended-/)));
    expect(broadcastPlayerState).toHaveBeenCalledWith({ songId: 1, playing: false });
    expect(props.onChanged).toHaveBeenCalledOnce();
  });

  it("contains autoplay rejection and offers an explicit retry", async () => {
    const user = userEvent.setup(); setup();
    act(() => (playerProps.onError as (error: Error) => void)(new DOMException("blocked", "NotAllowedError")));
    expect(await screen.findByRole("status")).toHaveTextContent("Press play to start this song.");
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "true");
  });

  it("keeps the canonical queue intact and offers a direct link after YouTube rejects embedding", () => {
    const { props } = setup();
    act(() => (playerProps.onError as (event: unknown) => void)({ currentTarget: { error: { code: 153 } } }));
    expect(props.queueClient.setPlaying).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Watch First song on YouTube" })).toHaveAttribute("href", "https://www.youtube.com/watch?v=abcdefghijk");
  });

  it("makes exactly two bounded recovery attempts, then skips an unavailable song once", async () => {
    vi.useFakeTimers(); const { props } = setup();
    act(() => (playerProps.onError as (error: Error) => void)(new Error("media unavailable")));
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "true");
    act(() => (playerProps.onError as (error: Error) => void)(new Error("media unavailable")));
    await act(async () => { await vi.runAllTimersAsync(); });
    act(() => (playerProps.onError as (error: Error) => void)(new Error("media unavailable")));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(props.queueClient.setPlaying).toHaveBeenCalledTimes(1);
    act(() => (playerProps.onError as (error: Error) => void)(new Error("media unavailable")));
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(props.queueClient.setPlaying).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("First song is unavailable. Skipping once.");
    vi.useRealTimers();
  });

  it("finishes an unavailable song after recovery is exhausted when the queue is empty", async () => {
    vi.useFakeTimers(); const { props } = setup({ queuedSongs: [] });
    act(() => (playerProps.onError as (error: Error) => void)(new Error("one")));
    await act(async () => { await vi.runAllTimersAsync(); });
    act(() => (playerProps.onError as (error: Error) => void)(new Error("two")));
    await act(async () => { await vi.runAllTimersAsync(); });
    act(() => (playerProps.onError as (error: Error) => void)(new Error("three")));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(props.queueClient.setPlaying).toHaveBeenCalledWith(null, expect.stringMatching(/^music-player-ended-/));
    vi.useRealTimers();
  });

  it("retries finishing an unavailable last song after a transient finish failure", async () => {
    vi.useFakeTimers();
    const queueClient = { setPlaying: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined) };
    setup({ queuedSongs: [], queueClient });
    act(() => (playerProps.onError as (error: Error) => void)(new Error("one")));
    await act(async () => { await vi.runAllTimersAsync(); });
    act(() => (playerProps.onError as (error: Error) => void)(new Error("two")));
    await act(async () => { await vi.runAllTimersAsync(); });
    act(() => (playerProps.onError as (error: Error) => void)(new Error("three")));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not finish this song. Try again.");

    act(() => (playerProps.onError as (error: Error) => void)(new Error("retry")));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(queueClient.setPlaying).toHaveBeenCalledTimes(2);
    expect(queueClient.setPlaying).toHaveBeenLastCalledWith(null, expect.stringMatching(/^music-player-ended-/));
    vi.useRealTimers();
  });

  it("cancels recovery timers on song change and unmount", async () => {
    vi.useFakeTimers(); const { props, rerender, unmount } = setup();
    act(() => (playerProps.onError as (error: Error) => void)(new Error("media unavailable")));
    expect(vi.getTimerCount()).toBe(1);
    rerender(<MusicPlayer {...props} currentSong={next} queuedSongs={[]} />);
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "false");
    act(() => (playerProps.onError as (error: Error) => void)(new Error("media unavailable")));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("clears earlier recovery timers when skip starts so they cannot restart playback", async () => {
    vi.useFakeTimers(); const { props } = setup();
    act(() => {
      (playerProps.onError as (error: Error) => void)(new Error("one"));
      (playerProps.onError as (error: Error) => void)(new Error("two"));
      (playerProps.onError as (error: Error) => void)(new Error("three"));
    });
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { await vi.runAllTimersAsync(); await Promise.resolve(); });
    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "false");
    expect(props.queueClient.setPlaying).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("resets media state and recovery budget when the current song changes", () => {
    const { rerender, props } = setup();
    act(() => (playerProps.onDurationChange as (event: { currentTarget: { duration: number } }) => void)({ currentTarget: { duration: 200 } }));
    act(() => (playerProps.onTimeUpdate as (event: { currentTarget: { currentTime: number } }) => void)({ currentTarget: { currentTime: 50 } }));
    rerender(<MusicPlayer {...props} currentSong={next} queuedSongs={[]} />);
    expect(screen.getByRole("slider", { name: "Playback position" })).toHaveValue("0");
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("contains rejected queue and refresh promises", async () => {
    const user = userEvent.setup();
    setup({ queueClient: { setPlaying: vi.fn().mockRejectedValue(new Error("offline")) }, onChanged: vi.fn().mockRejectedValue(new Error("refresh")) });
    await user.click(screen.getByRole("button", { name: "Next song" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not change songs. Try again.");
  });

  it("does not report a confirmed transition as failed when only refresh rejects", async () => {
    const user = userEvent.setup(); const broadcastPlayerState = vi.fn();
    const { props } = setup({ onChanged: vi.fn().mockRejectedValue(new Error("refresh")), broadcastPlayerState });
    await user.click(screen.getByRole("button", { name: "Next song" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Song changed, but the latest queue could not be loaded.");
    expect(props.queueClient.setPlaying).toHaveBeenCalledOnce();
    expect(broadcastPlayerState).not.toHaveBeenCalledWith(expect.objectContaining({ playing: true }));
  });

  it("serializes rapid navigation and disables navigation while pending", async () => {
    const command = deferred<void>(); const user = userEvent.setup();
    const { props } = setup({ queueClient: { setPlaying: vi.fn().mockReturnValue(command.promise) } });
    await user.click(screen.getByRole("button", { name: "Next song" }));
    expect(screen.getByRole("button", { name: "Next song" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous song" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Previous song" }));
    act(() => { (playerProps.onEnded as () => void)(); (playerProps.onEnded as () => void)(); });
    expect(props.queueClient.setPlaying).toHaveBeenCalledTimes(1);
    await act(async () => command.resolve());
  });

  it("serializes unavailable skip against an ended event", async () => {
    const command = deferred<void>(); const { props } = setup({ queueClient: { setPlaying: vi.fn().mockReturnValue(command.promise) } });
    act(() => {
      (playerProps.onError as (error: Error) => void)(new Error("one"));
      (playerProps.onError as (error: Error) => void)(new Error("two"));
      (playerProps.onError as (error: Error) => void)(new Error("three"));
      (playerProps.onEnded as () => void)();
    });
    expect(props.queueClient.setPlaying).toHaveBeenCalledTimes(1);
    await act(async () => command.resolve());
  });

  it("ignores stale refresh failure after the current song changes", async () => {
    const refresh = deferred<void>(); const user = userEvent.setup(); const { props, rerender } = setup({ onChanged: vi.fn().mockReturnValue(refresh.promise) });
    await user.click(screen.getByRole("button", { name: "Next song" }));
    rerender(<MusicPlayer {...props} currentSong={next} queuedSongs={[]} />);
    await act(async () => refresh.reject(new Error("stale")));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("holds the transition lock through refresh after the target song renders", async () => {
    const refresh = deferred<void>(); const user = userEvent.setup(); const { props, rerender } = setup({ onChanged: vi.fn().mockReturnValue(refresh.promise) });
    await user.click(screen.getByRole("button", { name: "Next song" }));
    rerender(<MusicPlayer {...props} currentSong={next} queuedSongs={[current]} />);
    expect(screen.getByRole("button", { name: "Next song" })).toBeDisabled();
    act(() => (playerProps.onEnded as () => void)());
    expect(props.queueClient.setPlaying).toHaveBeenCalledTimes(1);
    await act(async () => refresh.resolve());
    expect(screen.getByRole("button", { name: "Next song" })).toBeEnabled();
  });

  it("routes canonical next-song writes through the shared playback arbiter", async () => {
    const onPlaybackRequested = vi.fn().mockResolvedValue("acknowledged");
    const beginPlaybackRequest = vi.fn(() => 71);
    const { props } = setup({ beginPlaybackRequest, onPlaybackRequested } as unknown as Partial<React.ComponentProps<typeof MusicPlayer>>);

    await userEvent.click(screen.getByRole("button", { name: "Next song" }));

    expect(beginPlaybackRequest).toHaveBeenCalledOnce();
    expect(onPlaybackRequested).toHaveBeenCalledWith(next.id, 71, "player-next");
    expect(props.queueClient.setPlaying).not.toHaveBeenCalled();
  });

  it("does not mutate canonical playback when stale media recovery is exhausted", async () => {
    vi.useFakeTimers();
    const { props } = setup({ readOnly: true });
    act(() => (playerProps.onError as (error: Error) => void)(new Error("one")));
    await act(async () => { await vi.runAllTimersAsync(); });
    act(() => (playerProps.onError as (error: Error) => void)(new Error("two")));
    await act(async () => { await vi.runAllTimersAsync(); });
    act(() => (playerProps.onError as (error: Error) => void)(new Error("three")));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(props.queueClient.setPlaying).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Playback changed elsewhere. Refresh to reconnect.");
  });

  it("routes an ended last-song write through the shared playback arbiter", async () => {
    const onPlaybackRequested = vi.fn().mockResolvedValue("acknowledged");
    const beginPlaybackRequest = vi.fn(() => 72);
    const { props } = setup({ queuedSongs: [], beginPlaybackRequest, onPlaybackRequested } as unknown as Partial<React.ComponentProps<typeof MusicPlayer>>);

    act(() => (playerProps.onEnded as () => void)());

    await waitFor(() => expect(onPlaybackRequested).toHaveBeenCalledWith(null, 72, "player-ended"));
    expect(beginPlaybackRequest).toHaveBeenCalledOnce();
    expect(props.queueClient.setPlaying).not.toHaveBeenCalled();
  });

  it("routes exhausted media recovery for the last song through the shared playback arbiter", async () => {
    vi.useFakeTimers();
    const onPlaybackRequested = vi.fn().mockResolvedValue("acknowledged");
    const beginPlaybackRequest = vi.fn(() => 73);
    const { props } = setup({ queuedSongs: [], beginPlaybackRequest, onPlaybackRequested } as unknown as Partial<React.ComponentProps<typeof MusicPlayer>>);

    act(() => (playerProps.onError as (error: Error) => void)(new Error("one")));
    await act(async () => vi.runAllTimersAsync());
    act(() => (playerProps.onError as (error: Error) => void)(new Error("two")));
    await act(async () => vi.runAllTimersAsync());
    act(() => (playerProps.onError as (error: Error) => void)(new Error("three")));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(onPlaybackRequested).toHaveBeenCalledWith(null, 73, "player-ended");
    expect(beginPlaybackRequest).toHaveBeenCalledOnce();
    expect(props.queueClient.setPlaying).not.toHaveBeenCalled();
  });

  it("reconciles a completed-song command after its song becomes stale without stale local effects", async () => {
    const command = deferred<void>(); const broadcastPlayerState = vi.fn(); const onChanged = vi.fn();
    const { props, rerender } = setup({ queuedSongs: [], queueClient: { setPlaying: vi.fn().mockReturnValue(command.promise) }, broadcastPlayerState, onChanged });
    act(() => (playerProps.onEnded as () => void)());
    rerender(<MusicPlayer {...props} currentSong={next} queuedSongs={[]} />);
    await act(async () => command.resolve());
    expect(broadcastPlayerState).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledOnce();
    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reconciles a stale target command without autoplay, broadcast, or stale error", async () => {
    const command = deferred<void>(); const broadcastPlayerState = vi.fn(); const onChanged = vi.fn().mockResolvedValue(undefined);
    const { props, rerender } = setup({ queueClient: { setPlaying: vi.fn().mockReturnValue(command.promise) }, broadcastPlayerState, onChanged });
    fireEvent.click(screen.getByRole("button", { name: "Next song" }));
    rerender(<MusicPlayer {...props} currentSong={previous} queuedSongs={[next]} />);
    await act(async () => command.resolve());
    expect(onChanged).toHaveBeenCalledOnce();
    expect(broadcastPlayerState).not.toHaveBeenCalled();
    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the per-song recovery budget across transient onPlay callbacks", async () => {
    vi.useFakeTimers(); const { props } = setup();
    act(() => (playerProps.onError as (error: Error) => void)(new Error("one")));
    await act(async () => vi.runAllTimersAsync());
    act(() => (playerProps.onPlay as () => void)());
    act(() => (playerProps.onError as (error: Error) => void)(new Error("two")));
    await act(async () => vi.runAllTimersAsync());
    act(() => (playerProps.onPlay as () => void)());
    act(() => (playerProps.onError as (error: Error) => void)(new Error("three")));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(props.queueClient.setPlaying).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.getByRole("status")).toHaveTextContent("First song is unavailable. Skipping once.");
  });

  it("discards autoplay intent when a different canonical song wins", async () => {
    const user = userEvent.setup(); const { props, rerender } = setup();
    await user.click(screen.getByRole("button", { name: "Next song" }));
    rerender(<MusicPlayer {...props} currentSong={previous} queuedSongs={[next]} />);
    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "false");
    rerender(<MusicPlayer {...props} currentSong={next} queuedSongs={[]} />);
    expect(screen.getByTestId("media")).toHaveAttribute("data-playing", "false");
  });

  it("renders a stable empty state", () => {
    setup({ currentSong: null, queuedSongs: [], playedSongs: [] });
    expect(screen.getByRole("status")).toHaveTextContent("Choose a song to start listening.");
  });
});
