import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicMusicSong } from "../../publicMusicClient";
import { PublicMusicPlayer } from "../PublicMusicPlayer";

type PlayerProps = Record<string, unknown>;
let mediaProps: PlayerProps = {};
const mediaCleanup = vi.fn();
const mediaPlay = vi.fn<() => Promise<void>>();
const mediaPause = vi.fn();

vi.mock("react-player", async () => {
  const React = await import("react");
  const MockPlayer = React.forwardRef((_props: PlayerProps, ref) => {
    const props = _props;
    mediaProps = props;
    React.useImperativeHandle(ref, () => ({ play: mediaPlay, pause: mediaPause }));
    React.useEffect(() => mediaCleanup, []);
    return <div data-testid="guest-media" data-playing={String(props.playing)} data-src={String(props.src)} />;
  });
  return {
    default: MockPlayer,
  };
});

const song: PublicMusicSong = {
  id: "S".repeat(43),
  youtubeId: "abcdefghijk",
  title: "Public signal",
  artist: "Guest artist",
  thumbnailUrl: "https://images.example/signal.jpg",
  position: 0,
  status: "saved",
  playedAt: null,
};

describe("PublicMusicPlayer", () => {
  beforeEach(() => {
    mediaProps = {};
    mediaCleanup.mockReset();
    mediaPlay.mockReset().mockResolvedValue(undefined);
    mediaPause.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("acknowledges playback analytics only after media playback starts", async () => {
    const onPlaybackStart = vi.fn();
    render(<PublicMusicPlayer song={song} onPlaybackStart={onPlaybackStart} />);
    await userEvent.click(screen.getByRole("button", { name: /Play Public signal/ }));
    expect(onPlaybackStart).not.toHaveBeenCalled();
    act(() => (mediaProps.onPlay as () => void)());
    expect(onPlaybackStart).toHaveBeenCalledTimes(1);
    act(() => (mediaProps.onPlay as () => void)());
    expect(onPlaybackStart).toHaveBeenCalledTimes(1);
  });

  it("acknowledges each paused-to-playing transition and collapses duplicate callbacks", () => {
    const onPlaybackStart = vi.fn();
    render(<PublicMusicPlayer song={song} onPlaybackStart={onPlaybackStart} />);
    act(() => (mediaProps.onPlay as () => void)());
    act(() => (mediaProps.onPlay as () => void)());
    expect(onPlaybackStart).toHaveBeenCalledTimes(1);
    act(() => (mediaProps.onPause as () => void)());
    act(() => (mediaProps.onPlay as () => void)());
    expect(onPlaybackStart).toHaveBeenCalledTimes(2);
    act(() => (mediaProps.onError as (cause: unknown) => void)(new TypeError("offline")));
    act(() => (mediaProps.onPlay as () => void)());
    expect(onPlaybackStart).toHaveBeenCalledTimes(3);
  });

  it("requires an explicit guest gesture and exposes keyboard-labelled play and pause controls", async () => {
    const user = userEvent.setup();
    render(<PublicMusicPlayer song={song} />);

    expect(screen.getByTestId("guest-media")).toHaveAttribute("data-playing", "false");
    const play = screen.getByRole("button", { name: "Play Public signal on this device" });
    play.focus();
    await user.keyboard("{Enter}");
    expect(mediaPlay).toHaveBeenCalledOnce();
    expect(screen.getByTestId("guest-media")).toHaveAttribute("data-playing", "true");
    expect(screen.getByRole("button", { name: "Pause Public signal" })).toHaveAttribute("aria-pressed", "true");

    await user.keyboard(" ");
    expect(screen.getByTestId("guest-media")).toHaveAttribute("data-playing", "false");
    expect(screen.getByRole("status")).toHaveTextContent("Public signal is paused");
  });

  it("uses only the public YouTube identity and never begins playing when the song changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PublicMusicPlayer song={song} />);
    await user.click(screen.getByRole("button", { name: /Play Public signal/ }));

    const selected = { ...song, id: "T".repeat(43), youtubeId: "lmnopqrstuv", title: "Selected song" };
    rerender(<PublicMusicPlayer song={selected} />);
    expect(screen.getByTestId("guest-media")).toHaveAttribute("data-src", "https://www.youtube.com/watch?v=lmnopqrstuv");
    expect(screen.getByTestId("guest-media")).toHaveAttribute("data-playing", "false");
    expect(screen.getByRole("button", { name: "Play Selected song on this device" })).toBeInTheDocument();
  });

  it("passes YouTube the current origin and a referrer policy", () => {
    render(<PublicMusicPlayer song={song} />);
    expect(mediaProps.config).toEqual({
      youtube: {
        origin: window.location.origin,
        widget_referrer: window.location.href,
        referrerpolicy: "strict-origin-when-cross-origin",
      },
    });
  });

  it("contains a real play promise NotAllowedError without hiding the explicit play control", async () => {
    const user = userEvent.setup();
    mediaPlay.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
    render(<PublicMusicPlayer song={song} />);
    await user.click(screen.getByRole("button", { name: /Play Public signal/ }));
    await waitFor(() => expect(screen.getByTestId("guest-media")).toHaveAttribute("data-playing", "false"));
    expect(screen.getByRole("status")).toHaveTextContent("Press play to start this song on your device.");
    expect(screen.getByRole("button", { name: /Play Public signal/ })).toBeInTheDocument();
  });

  it.each([
    [100, "This video is no longer available. Choose another track."],
    [101, "This video cannot be played here. Choose another track."],
    [150, "This video cannot be played here. Choose another track."],
    [2, "Playback could not connect. Check your connection and try again."],
    [4, "Playback is unavailable right now. Choose another track or try again."],
  ])("normalizes runtime media error code %s from currentTarget.error", async (code, message) => {
    const user = userEvent.setup();
    render(<PublicMusicPlayer song={song} />);
    await user.click(screen.getByRole("button", { name: /Play Public signal/ }));
    act(() => (mediaProps.onError as (event: unknown) => void)({ currentTarget: { error: { code } } }));
    expect(screen.getByTestId("guest-media")).toHaveAttribute("data-playing", "false");
    expect(screen.getByRole("alert")).toHaveTextContent(message);
  });

  it("offers the exact YouTube watch link after an embed rejection", async () => {
    const user = userEvent.setup();
    render(<PublicMusicPlayer song={song} />);
    await user.click(screen.getByRole("button", { name: /Play Public signal/ }));
    act(() => (mediaProps.onError as (event: unknown) => void)({ currentTarget: { error: { code: 153 } } }));
    expect(screen.getByRole("link", { name: "Watch Public signal on YouTube" })).toHaveAttribute("href", "https://www.youtube.com/watch?v=abcdefghijk");
  });

  it("contains a non-policy play rejection as a retryable network failure", async () => {
    mediaPlay.mockRejectedValueOnce(new TypeError("network failed"));
    render(<PublicMusicPlayer song={song} />);
    await userEvent.click(screen.getByRole("button", { name: /Play Public signal/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Playback could not connect. Check your connection and try again.");
    expect(screen.getByTestId("guest-media")).toHaveAttribute("data-playing", "false");
  });

  it("stops and destroys local media when playback permission is revoked", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PublicMusicPlayer song={song} allowed />);
    await user.click(screen.getByRole("button", { name: /Play Public signal/ }));
    rerender(<PublicMusicPlayer song={song} allowed={false} />);
    expect(screen.queryByTestId("guest-media")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Public signal/ })).not.toBeInTheDocument();
    expect(mediaCleanup).toHaveBeenCalledOnce();
  });

  it("rejects embedded playback attempts while availability is being checked", () => {
    const onPlaybackStart = vi.fn();
    render(<PublicMusicPlayer song={song} actionsEnabled={false} onPlaybackStart={onPlaybackStart} />);
    expect(screen.getByRole("button", { name: /Play Public signal/ })).toBeDisabled();
    act(() => (mediaProps.onPlay as () => void)());
    expect(mediaPause).toHaveBeenCalledOnce();
    expect(screen.getByTestId("guest-media")).toHaveAttribute("data-playing", "false");
    expect(onPlaybackStart).not.toHaveBeenCalled();
  });

  it("retains playback intent when the revalidation pause acknowledgement arrives after availability returns", async () => {
    const view = render(<PublicMusicPlayer song={song} actionsEnabled />);
    await userEvent.click(screen.getByRole("button", { name: /Play Public signal/ }));
    act(() => (mediaProps.onPlay as () => void)());
    const media = screen.getByTestId("guest-media");
    view.rerender(<PublicMusicPlayer song={song} actionsEnabled={false} />);
    expect(media).toHaveAttribute("data-playing", "false");
    view.rerender(<PublicMusicPlayer song={song} actionsEnabled />);
    act(() => (mediaProps.onPause as () => void)());
    expect(screen.getByTestId("guest-media")).toBe(media);
    expect(media).toHaveAttribute("data-playing", "true");
    act(() => (mediaProps.onPlay as () => void)());
    act(() => (mediaProps.onPause as () => void)());
    expect(media).toHaveAttribute("data-playing", "false");
  });

  it("keeps a delayed play completion paused until availability returns", async () => {
    let finish!: () => void;
    mediaPlay.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const view = render(<PublicMusicPlayer song={song} actionsEnabled />);
    await userEvent.click(screen.getByRole("button", { name: /Play Public signal/ }));
    view.rerender(<PublicMusicPlayer song={song} actionsEnabled={false} />);
    await act(async () => finish());
    expect(screen.getByTestId("guest-media")).toHaveAttribute("data-playing", "false");
    view.rerender(<PublicMusicPlayer song={song} actionsEnabled />);
    expect(screen.getByTestId("guest-media")).toHaveAttribute("data-playing", "true");
  });

  it("does not revive playback after a pending play is revoked and permission returns", async () => {
    let finish!: () => void;
    mediaPlay.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const view = render(<PublicMusicPlayer song={song} allowed />);
    await userEvent.click(screen.getByRole("button", { name: /Play Public signal/ }));
    view.rerender(<PublicMusicPlayer song={song} allowed={false} />);
    await act(async () => finish());
    expect(screen.queryByTestId("guest-media")).not.toBeInTheDocument();
    view.rerender(<PublicMusicPlayer song={song} allowed />);
    expect(screen.getByTestId("guest-media")).toHaveAttribute("data-playing", "false");
  });

  it("destroys local media on unmount", () => {
    const { unmount } = render(<PublicMusicPlayer song={song} />);
    unmount();
    expect(mediaCleanup).toHaveBeenCalledOnce();
  });

  it("has no serious or critical automated accessibility violations", async () => {
    const { container } = render(<PublicMusicPlayer song={song} />);
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
  });

  it("has a source boundary against owner queue and playback authority", () => {
    const source = readFileSync(resolve(process.cwd(), "src/features/music/components/PublicMusicPlayer.tsx"), "utf8");
    expect(source).not.toMatch(/musicQueueClient|musicApi|musicWorkspaceClient|musicPlaybackCommand/);
  });
});
