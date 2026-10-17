import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MusicQueue } from "../MusicQueue";
import type { MusicSong } from "../../musicWorkspaceClient";

const songs: MusicSong[] = [
  { id: 1, youtubeId: "abcdefghijk", title: "First song", artist: "One", thumbnailUrl: "https://img/1", position: 0, status: "queued", playedAt: null },
  { id: 2, youtubeId: "lmnopqrstuv", title: "Second song", artist: "Two", thumbnailUrl: "https://img/2", position: 1, status: "queued", playedAt: null },
];
function props() { return { songs, client: { setPlaying: vi.fn().mockResolvedValue(songs[0]), removeSong: vi.fn(), removeSongs: vi.fn().mockResolvedValue(undefined), moveSong: vi.fn().mockResolvedValue(songs[0]) }, onChanged: vi.fn().mockResolvedValue(undefined) }; }

describe("MusicQueue", () => {
  it("shows only Play as the visible row button and puts bulk actions in the header menu", async () => {
    const value = props(); render(<MusicQueue {...value} />);
    expect(screen.getByRole("button", { name: "Play First song" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove First song|Move First song/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Queue actions" }));
    expect(screen.getByRole("menuitem", { name: "Select songs" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Clear queue" })).toBeInTheDocument();
  });

  it("gives the header action menu complete dismissible-menu semantics", async () => {
    const value = props(); render(<MusicQueue {...value} />);
    const trigger = screen.getByRole("button", { name: "Queue actions" });

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-controls", "music-queue-actions-menu");
    expect(screen.getByRole("menu")).toHaveAttribute("id", "music-queue-actions-menu");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("heading", { name: "Queue" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps one accessible row action menu open and restores focus after Escape", async () => {
    // Break caught: queue row actions compete with each other or trap focus after keyboard dismissal.
    const value = props(); render(<MusicQueue {...value} />);
    const first = screen.getByRole("button", { name: "Queue actions for First song" });
    await userEvent.click(first);
    expect(screen.getByRole("menuitem", { name: "Remove from queue" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Queue actions for Second song" }));
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menuitem", { name: "Remove from queue" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Queue actions for Second song" })).toHaveFocus();
  });

  it("closes a row menu when queue content outside its trigger and menu is clicked", async () => {
    const value = props(); render(<MusicQueue {...value} />);
    await userEvent.click(screen.getByRole("button", { name: "Queue actions for First song" }));
    expect(screen.getByRole("menuitem", { name: "Remove from queue" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("heading", { name: "Queue" }));
    expect(screen.queryByRole("menuitem", { name: "Remove from queue" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Queue actions for First song" }));
    await userEvent.click(screen.getByRole("button", { name: "Play Second song" }));
    expect(screen.queryByRole("menuitem", { name: "Remove from queue" })).not.toBeInTheDocument();
  });

  it("restores the stable row trigger after Play now succeeds and Remove from queue fails", async () => {
    const value = props(); render(<MusicQueue {...value} />);
    const trigger = screen.getByRole("button", { name: "Queue actions for First song" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Play now" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    value.client.removeSong.mockRejectedValueOnce(new Error("offline"));
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Remove from queue" }));
    await waitFor(() => expect(value.client.removeSong).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toHaveTextContent("Queue update failed");
    expect(trigger).toHaveFocus();
  });

  it("keeps reorder handles absent and noninteractive at the 390px semantic viewport until explicit mode", async () => {
    // Break caught: mobile rows exposed permanent draggable/focusable handles that crowded the Play and menu controls.
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const value = props(); render(<MusicQueue {...value} />);
    const handle = screen.getByLabelText("Reorder First song");
    expect(handle).toHaveClass("hidden");
    expect(handle).toHaveAttribute("tabindex", "-1");
    expect(handle).toHaveAttribute("draggable", "false");
    expect(screen.getByRole("button", { name: "Play First song" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Queue actions for First song" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Queue actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Reorder queue" }));
    expect(handle).toHaveClass("inline-flex");
    expect(handle).toHaveAttribute("tabindex", "0");
    expect(handle).toHaveAttribute("draggable", "true");
    await userEvent.click(screen.getByRole("button", { name: "Queue actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Done reordering" }));
    expect(handle).toHaveClass("hidden");
    expect(handle).toHaveAttribute("tabindex", "-1");
  });

  it("reorders with pointer drag and keyboard on the drag handle", async () => {
    const value = props(); render(<MusicQueue {...value} />);
    await userEvent.click(screen.getByRole("button", { name: "Queue actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Reorder queue" }));
    fireEvent.dragStart(screen.getByLabelText("Reorder First song"));
    fireEvent.dragOver(screen.getByRole("listitem", { name: /Second song/ }));
    fireEvent.drop(screen.getByRole("listitem", { name: /Second song/ }));
    await waitFor(() => expect(value.client.moveSong).toHaveBeenCalledWith(1, 1, expect.stringMatching(/^music-move-/)));
    await waitFor(() => expect(value.onChanged).toHaveBeenCalledTimes(1));
    screen.getByLabelText("Reorder First song").focus();
    await userEvent.keyboard("{ArrowUp}");
    await waitFor(() => expect(value.client.moveSong).toHaveBeenCalledWith(1, 0, expect.any(String)));
  });

  it("selects and removes songs through the header workflow", async () => {
    const value = props(); render(<MusicQueue {...value} />);
    await userEvent.click(screen.getByRole("button", { name: "Queue actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Select songs" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select First song" }));
    await userEvent.click(screen.getByRole("button", { name: "Queue actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Remove 1 selected" }));
    await waitFor(() => expect(value.client.removeSongs).toHaveBeenCalledWith([1], expect.stringMatching(/^music-remove-many-/)));
  });

  it("requires an explicit confirmation before clearing the queue", async () => {
    const value = props(); render(<MusicQueue {...value} />);
    await userEvent.click(screen.getByRole("button", { name: "Queue actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Clear queue" }));
    expect(value.client.removeSongs).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("menuitem", { name: "Confirm clear queue" }));
    await waitFor(() => expect(value.client.removeSongs).toHaveBeenCalledWith([1, 2], expect.stringMatching(/^music-clear-/)));
  });

  it("rolls back an optimistic keyboard move on failure", async () => {
    const value = props(); value.client.moveSong.mockRejectedValueOnce(new Error("conflict")); render(<MusicQueue {...value} />);
    await userEvent.click(screen.getByRole("button", { name: "Queue actions" })); await userEvent.click(screen.getByRole("menuitem", { name: "Reorder queue" }));
    screen.getByLabelText("Reorder Second song").focus(); await userEvent.keyboard("{ArrowUp}");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Queue update failed"));
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("First song");
    expect(screen.getByRole("button", { name: "Play First song" })).toBeEnabled();
  });

  it("keeps an acknowledged reorder when only the canonical refresh fails", async () => {
    const value = props();
    value.onChanged.mockRejectedValueOnce(new Error("refresh failed"));
    render(<MusicQueue {...value} />);
    await userEvent.click(screen.getByRole("button", { name: "Queue actions" })); await userEvent.click(screen.getByRole("menuitem", { name: "Reorder queue" }));

    screen.getByLabelText("Reorder Second song").focus();
    await userEvent.keyboard("{ArrowUp}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Queue reordered, but the latest queue could not be loaded");
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Second song");
    expect(value.client.moveSong).toHaveBeenCalledOnce();
  });

  it("emits a playback request after Play is acknowledged even when refresh fails", async () => {
    const value = props();
    const onPlaybackRequested = vi.fn().mockResolvedValue("acknowledged");
    value.onChanged.mockRejectedValueOnce(new Error("refresh failed"));
    render(<MusicQueue {...value} beginPlaybackRequest={() => 41} onPlaybackRequested={onPlaybackRequested} /> as React.ReactElement);

    await userEvent.click(screen.getByRole("button", { name: "Play First song" }));

    expect(onPlaybackRequested).toHaveBeenCalledWith(1, 41, "queue");
    expect(await screen.findByRole("alert")).toHaveTextContent("Song changed, but the latest queue could not be loaded");
    expect(value.client.setPlaying).not.toHaveBeenCalled();
  });
});
