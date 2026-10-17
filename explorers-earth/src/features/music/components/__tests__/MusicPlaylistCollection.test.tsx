import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MusicPlaylistCollection } from "../MusicPlaylistCollection";

const playlist = {
  id: 1, name: "Road songs", description: "For the drive", isVisibleToGuests: false,
  songs: [{ id: 2, playlistId: 1, youtubeId: "abcdefghijk", title: "North", artist: "Sky", thumbnailUrl: "https://img/2", position: 0, addedAt: "2026-08-27T00:00:00.000Z" }],
};

describe("MusicPlaylistCollection", () => {
  it("uses the Explorers list-card action row without visibility filter tabs", async () => {
    const onSelect = vi.fn(); const onVisibilityChange = vi.fn();
    render(<MusicPlaylistCollection playlists={[playlist]} onSelect={onSelect} onVisibilityChange={onVisibilityChange} onCreate={vi.fn()} emptyAction={<button>New playlist</button>} />);
    expect(screen.queryByRole("group", { name: "Playlist visibility" })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search playlists" }).parentElement?.parentElement).toContainElement(screen.getByRole("button", { name: "New playlist" }));
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
    expect(screen.queryByText("Make Road songs public")).not.toBeInTheDocument();
    expect(document.querySelector('img[src="https://img/2"]')).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Make Road songs public" }));
    expect(onVisibilityChange).toHaveBeenCalledWith(playlist, true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("searches cards and offers an add-new card", async () => {
    render(<MusicPlaylistCollection playlists={[playlist]} onSelect={vi.fn()} onVisibilityChange={vi.fn()} onCreate={vi.fn()} emptyAction={<button>New playlist</button>} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search playlists" }), "missing");
    expect(screen.getByRole("status")).toHaveTextContent("No playlists match");
    expect(screen.getByRole("button", { name: "Add new playlist" })).toBeInTheDocument();
  });

  it("allows long playlist titles to shrink inside a mobile card", () => {
    render(<MusicPlaylistCollection playlists={[{ ...playlist, name: "A very long playlist title that must not widen the mobile viewport" }]} onSelect={vi.fn()} onVisibilityChange={vi.fn()} onCreate={vi.fn()} emptyAction={<button>New playlist</button>} />);
    expect(screen.getByRole("article")).toHaveClass("min-w-0", "w-full");
    expect(screen.getByText("A very long playlist title that must not widen the mobile viewport").parentElement).toHaveClass("min-w-0");
  });

  it("uses the shared switch with pending state and rolls back a rejected visibility change", async () => {
    let reject!: (reason?: unknown) => void;
    const pending = new Promise<void>((_resolve, no) => { reject = no; });
    const onVisibilityChange = vi.fn().mockReturnValue(pending);
    render(<MusicPlaylistCollection playlists={[playlist]} onSelect={vi.fn()} onVisibilityChange={onVisibilityChange} onCreate={vi.fn()} emptyAction={<button>New playlist</button>} />);
    const control = screen.getByRole("switch", { name: "Make Road songs public" });

    await userEvent.click(control);
    expect(control).toHaveAttribute("aria-checked", "true");
    expect(control).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Updating Road songs visibility");

    await act(async () => reject(new Error("offline")));
    expect(control).toHaveAttribute("aria-checked", "false");
    expect(control).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Road songs visibility could not be saved");
    expect(control).toHaveAttribute("aria-describedby", expect.stringMatching(/playlist-visibility-error/));
  });

  it("reconciles optimistic visibility from the next canonical playlist snapshot", async () => {
    const view = render(<MusicPlaylistCollection playlists={[playlist]} onSelect={vi.fn()} onVisibilityChange={vi.fn().mockResolvedValue(undefined)} onCreate={vi.fn()} emptyAction={<button>New playlist</button>} />);
    const control = screen.getByRole("switch", { name: "Make Road songs public" });
    await userEvent.click(control);
    expect(control).toHaveAttribute("aria-checked", "true");

    view.rerender(<MusicPlaylistCollection playlists={[{ ...playlist, isVisibleToGuests: false }]} onSelect={vi.fn()} onVisibilityChange={vi.fn()} onCreate={vi.fn()} emptyAction={<button>New playlist</button>} />);
    expect(control).toHaveAttribute("aria-checked", "false");
  });

  it("keeps a pending optimistic card switch through an unrelated parent rerender and sends one write", async () => {
    // Break caught: a parent render clears local visibility while the write is pending and permits duplicate mutations.
    const command = (() => { let resolve!: () => void; const promise = new Promise<void>((yes) => { resolve = yes; }); return { promise, resolve }; })();
    const onVisibilityChange = vi.fn().mockReturnValue(command.promise);
    const view = render(<MusicPlaylistCollection playlists={[playlist]} onSelect={vi.fn()} onVisibilityChange={onVisibilityChange} onCreate={vi.fn()} emptyAction={<button>New playlist</button>} />);

    const control = screen.getByRole("switch", { name: "Make Road songs public" });
    await userEvent.click(control);
    view.rerender(<MusicPlaylistCollection playlists={[[playlist][0]]} onSelect={vi.fn()} onVisibilityChange={onVisibilityChange} onCreate={vi.fn()} emptyAction={<button>New playlist</button>} />);

    expect(control).toHaveAttribute("aria-checked", "true");
    expect(control).toBeDisabled();
    await userEvent.click(control);
    expect(onVisibilityChange).toHaveBeenCalledOnce();
    await act(async () => command.resolve());
  });

  it("keeps an acknowledged optimistic card switch across a stale array update after reconciliation fails", async () => {
    // Break caught: a cached array identity update reverts a confirmed visibility write after refetch failure.
    const onVisibilityChange = vi.fn().mockResolvedValue({ reconciliationFailed: true });
    const view = render(<MusicPlaylistCollection playlists={[playlist]} onSelect={vi.fn()} onVisibilityChange={onVisibilityChange} onCreate={vi.fn()} emptyAction={<button>New playlist</button>} />);
    const control = screen.getByRole("switch", { name: "Make Road songs public" });

    await userEvent.click(control);
    expect(control).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByRole("alert")).toHaveTextContent("visibility was saved");

    view.rerender(<MusicPlaylistCollection playlists={[{ ...playlist, isVisibleToGuests: false }]} onSelect={vi.fn()} onVisibilityChange={onVisibilityChange} onCreate={vi.fn()} emptyAction={<button>New playlist</button>} />);
    expect(control).toHaveAttribute("aria-checked", "true");
  });

  it("rolls a rejected card write forward to canonical visibility received while pending", async () => {
    // Break caught: rejection restores the click-time prop even after a newer canonical snapshot arrived.
    let reject!: (reason?: unknown) => void;
    const command = new Promise<void>((_resolve, no) => { reject = no; });
    const onVisibilityChange = vi.fn().mockReturnValue(command);
    const view = render(<MusicPlaylistCollection playlists={[playlist]} onSelect={vi.fn()} onVisibilityChange={onVisibilityChange} onCreate={vi.fn()} emptyAction={<button>New playlist</button>} />);
    const control = screen.getByRole("switch", { name: "Make Road songs public" });

    await userEvent.click(control);
    view.rerender(<MusicPlaylistCollection playlists={[{ ...playlist, isVisibleToGuests: true }]} onSelect={vi.fn()} onVisibilityChange={onVisibilityChange} onCreate={vi.fn()} emptyAction={<button>New playlist</button>} />);
    await act(async () => reject(new Error("write rejected")));

    expect(control).toHaveAttribute("aria-checked", "true");
  });
});
