import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MusicHistory } from "../MusicHistory";
import type { MusicSong } from "../../musicWorkspaceClient";

const song: MusicSong = { id: 3, youtubeId: "zyxwvutsrqp", title: "Previous song", artist: "Artist", thumbnailUrl: "https://img/3", position: 0, status: "played", playedAt: "2026-08-25T10:00:00.000Z" };

describe("MusicHistory", () => {
  it("announces loading without exposing stale actions", () => {
    render(<MusicHistory songs={[song]} loading queueClient={{ clearHistory: vi.fn() }} onChanged={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading listening history");
    expect(screen.queryByRole("button", { name: "History actions" })).not.toBeInTheDocument();
  });

  it("renders an accessible empty state", () => {
    render(<MusicHistory songs={[]} queueClient={{ clearHistory: vi.fn() }} onChanged={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Recently played" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Songs you finish will appear here.");
  });

  it("renders history and clears it through the canonical client", async () => {
    const user = userEvent.setup(); const clearHistory = vi.fn().mockResolvedValue(undefined); const onChanged = vi.fn().mockResolvedValue(undefined);
    render(<MusicHistory songs={[song]} queueClient={{ clearHistory }} onChanged={onChanged} />);
    expect(screen.getByRole("list", { name: "Recently played songs" })).toHaveTextContent("Previous song");
    const button = screen.getByRole("button", { name: "History actions" });
    expect(button).toHaveStyle({ minWidth: "44px", minHeight: "44px" });
    await user.click(button);
    await user.click(screen.getByRole("menuitem", { name: "Clear history" }));
    expect(screen.getByRole("dialog", { name: "Clear history" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear history" }));
    expect(clearHistory).toHaveBeenCalledWith(expect.stringMatching(/^music-history-clear-/));
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("focuses the stable empty history state when a successful clear rerenders the parent empty", async () => {
    // Break caught: the confirmed-clear focus restoration targets a header button that the parent removes, leaving focus on body.
    const user = userEvent.setup();
    const clearHistory = vi.fn().mockResolvedValue(undefined);
    const onChanged = vi.fn();
    const view = render(<MusicHistory songs={[song]} queueClient={{ clearHistory }} onChanged={onChanged} />);
    onChanged.mockImplementation(() => {
      view.rerender(<MusicHistory songs={[]} queueClient={{ clearHistory }} onChanged={onChanged} />);
    });

    await user.click(screen.getByRole("button", { name: "History actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Clear history" }));
    await user.click(within(screen.getByRole("dialog", { name: "Clear history" })).getByRole("button", { name: "Clear history" }));

    const empty = await screen.findByText("Songs you finish will appear here.");
    await waitFor(() => expect(empty).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });

  it("retains clear focus intent until a delayed parent rerender exposes the empty history state", async () => {
    // Break caught: an acknowledged refresh can resolve before the parent applies its new empty history props.
    let resolveChanged!: () => void;
    const changed = new Promise<void>((resolve) => { resolveChanged = resolve; });
    const user = userEvent.setup();
    const clearHistory = vi.fn().mockResolvedValue(undefined);
    const onChanged = vi.fn(() => changed);
    const view = render(<MusicHistory songs={[song]} queueClient={{ clearHistory }} onChanged={onChanged} />);

    await user.click(screen.getByRole("button", { name: "History actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Clear history" }));
    await user.click(within(screen.getByRole("dialog", { name: "Clear history" })).getByRole("button", { name: "Clear history" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    resolveChanged();
    await waitFor(() => expect(screen.queryByText("Clearing history…")).not.toBeInTheDocument());

    view.rerender(<MusicHistory songs={[]} queueClient={{ clearHistory }} onChanged={onChanged} />);
    const empty = await screen.findByText("Songs you finish will appear here.");
    await waitFor(() => expect(empty).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });

  it("contains a failed clear and supports retry without an unhandled promise", async () => {
    const user = userEvent.setup(); const clearHistory = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    render(<MusicHistory songs={[song]} queueClient={{ clearHistory }} onChanged={vi.fn()} />);
    const headerTrigger = screen.getByRole("button", { name: "History actions" });
    await user.click(headerTrigger);
    await user.click(screen.getByRole("menuitem", { name: "Clear history" }));
    await user.click(within(screen.getByRole("dialog", { name: "Clear history" })).getByRole("button", { name: "Clear history" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not clear history. Try again.");
    await waitFor(() => expect(headerTrigger).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "History actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Clear history" }));
    await user.click(within(screen.getByRole("dialog", { name: "Clear history" })).getByRole("button", { name: "Clear history" }));
    await waitFor(() => expect(clearHistory).toHaveBeenCalledTimes(2));
  });

  it("keeps a confirmed clear distinct from a failed refresh", async () => {
    const user = userEvent.setup(); const clearHistory = vi.fn().mockResolvedValue(undefined);
    render(<MusicHistory songs={[song]} queueClient={{ clearHistory }} onChanged={vi.fn().mockRejectedValue(new Error("refresh"))} />);
    const headerTrigger = screen.getByRole("button", { name: "History actions" });
    await user.click(headerTrigger);
    await user.click(screen.getByRole("menuitem", { name: "Clear history" }));
    await user.click(within(screen.getByRole("dialog", { name: "Clear history" })).getByRole("button", { name: "Clear history" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("History cleared, but the latest history could not be loaded.");
    expect(clearHistory).toHaveBeenCalledOnce();
    await waitFor(() => expect(headerTrigger).toHaveFocus());
  });

  it("uses an accessible single-row menu to remove an acknowledged history row", async () => {
    // Break caught: a history row uses generic queue deletion or removes again when its write response is retried.
    const user = userEvent.setup();
    const removeHistorySong = vi.fn().mockResolvedValue(undefined);
    const second = { ...song, id: 4, title: "Next history song" };
    render(<MusicHistory songs={[song, second]} queueClient={{ clearHistory: vi.fn(), removeHistorySong }} onChanged={vi.fn().mockResolvedValue(undefined)} />);

    const firstMenu = screen.getByRole("button", { name: "More actions for Previous song" });
    await user.click(firstMenu);
    expect(firstMenu).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Play again" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Remove from history" }));

    expect(removeHistorySong).toHaveBeenCalledWith(song.id, expect.stringMatching(/^music-history-remove-/));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "More actions for Next history song" })).toHaveFocus());
  });

  it("reuses a history removal key when the response outcome is uncertain", async () => {
    const user = userEvent.setup();
    const removeHistorySong = vi.fn().mockRejectedValueOnce(new TypeError("response lost")).mockResolvedValueOnce(undefined);
    render(<MusicHistory songs={[song]} queueClient={{ clearHistory: vi.fn(), removeHistorySong }} onChanged={vi.fn().mockResolvedValue(undefined)} />);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await user.click(screen.getByRole("button", { name: "More actions for Previous song" }));
      await user.click(screen.getByRole("menuitem", { name: "Remove from history" }));
      await waitFor(() => expect(removeHistorySong).toHaveBeenCalledTimes(attempt + 1));
    }
    expect(removeHistorySong.mock.calls[1][1]).toBe(removeHistorySong.mock.calls[0][1]);
  });

  it("focuses the stable empty history state when removing the last row rerenders the parent empty", async () => {
    // Break caught: a last-row removal restores a trigger that no longer exists after the parent refreshes, leaving focus on body.
    const user = userEvent.setup();
    const removeHistorySong = vi.fn().mockResolvedValue(undefined);
    const onChanged = vi.fn();
    const view = render(<MusicHistory songs={[song]} queueClient={{ clearHistory: vi.fn(), removeHistorySong }} onChanged={onChanged} />);
    onChanged.mockImplementation(() => {
      view.rerender(<MusicHistory songs={[]} queueClient={{ clearHistory: vi.fn(), removeHistorySong }} onChanged={onChanged} />);
    });

    await user.click(screen.getByRole("button", { name: "More actions for Previous song" }));
    await user.click(screen.getByRole("menuitem", { name: "Remove from history" }));

    const empty = await screen.findByText("Songs you finish will appear here.");
    await waitFor(() => expect(empty).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });

  it("retains last-row removal focus intent until a delayed parent rerender exposes the empty history state", async () => {
    // Break caught: an acknowledged removal consumes its fallback before the parent removes the last stale row.
    let resolveChanged!: () => void;
    const changed = new Promise<void>((resolve) => { resolveChanged = resolve; });
    const user = userEvent.setup();
    const removeHistorySong = vi.fn().mockResolvedValue(undefined);
    const onChanged = vi.fn(() => changed);
    const view = render(<MusicHistory songs={[song]} queueClient={{ clearHistory: vi.fn(), removeHistorySong }} onChanged={onChanged} />);

    await user.click(screen.getByRole("button", { name: "More actions for Previous song" }));
    await user.click(screen.getByRole("menuitem", { name: "Remove from history" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    resolveChanged();
    await waitFor(() => expect(screen.queryByText("Removing from history…")).not.toBeInTheDocument());

    view.rerender(<MusicHistory songs={[]} queueClient={{ clearHistory: vi.fn(), removeHistorySong }} onChanged={onChanged} />);
    const empty = await screen.findByText("Songs you finish will appear here.");
    await waitFor(() => expect(empty).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });

  it("keeps a successful removal visible when its refresh fails", async () => {
    // Break caught: a post-write refresh failure presents removal as failed and invites a duplicate mutation.
    const user = userEvent.setup();
    render(<MusicHistory songs={[song]} queueClient={{ clearHistory: vi.fn(), removeHistorySong: vi.fn().mockResolvedValue(undefined) }} onChanged={vi.fn().mockRejectedValue(new Error("offline"))} />);
    await user.click(screen.getByRole("button", { name: "More actions for Previous song" }));
    await user.click(screen.getByRole("menuitem", { name: "Remove from history" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Previous song was removed from history, but the latest history could not be loaded.");
  });

  it("returns focus to the header after a last-row removal succeeds but its refresh fails", async () => {
    // Break caught: a committed removal with stale parent props keeps waiting for a row that will not disappear after a refresh error.
    const user = userEvent.setup();
    render(<MusicHistory songs={[song]} queueClient={{ clearHistory: vi.fn(), removeHistorySong: vi.fn().mockResolvedValue(undefined) }} onChanged={vi.fn().mockRejectedValue(new Error("offline"))} />);
    const headerTrigger = screen.getByRole("button", { name: "History actions" });
    await user.click(screen.getByRole("button", { name: "More actions for Previous song" }));
    await user.click(screen.getByRole("menuitem", { name: "Remove from history" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Previous song was removed from history, but the latest history could not be loaded.");
    await waitFor(() => expect(headerTrigger).toHaveFocus());
  });

  it("closes row and header menus with Escape or outside click and restores focus", async () => {
    // Break caught: transient menus trap focus, leave multiple menus open, or remain after dismissal.
    const user = userEvent.setup();
    render(<MusicHistory songs={[song]} queueClient={{ clearHistory: vi.fn(), removeHistorySong: vi.fn() }} onChanged={vi.fn()} />);
    const rowMenu = screen.getByRole("button", { name: "More actions for Previous song" });
    await user.click(rowMenu);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(rowMenu).toHaveFocus();
    await user.click(rowMenu);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(rowMenu).toHaveFocus();

    const headerMenu = screen.getByRole("button", { name: "History actions" });
    await user.click(headerMenu);
    await user.click(screen.getByRole("menuitem", { name: "Clear history" }));
    const dialog = screen.getByRole("dialog", { name: "Clear history" });
    await user.keyboard("{Escape}");
    expect(dialog).not.toBeInTheDocument();
    await waitFor(() => expect(headerMenu).toHaveFocus());
    await user.click(headerMenu);
    await user.click(screen.getByRole("menuitem", { name: "Clear history" }));
    fireEvent.mouseDown(screen.getByRole("dialog", { name: "Clear history" }).parentElement!);
    expect(screen.queryByRole("dialog", { name: "Clear history" })).not.toBeInTheDocument();
    await waitFor(() => expect(headerMenu).toHaveFocus());
  });

  it("closes a row menu from same-section content and a clear dialog from its actual backdrop", async () => {
    // Break caught: containment against the whole section treats its own backdrop and heading as inside a transient panel.
    const user = userEvent.setup();
    render(<MusicHistory songs={[song]} queueClient={{ clearHistory: vi.fn(), removeHistorySong: vi.fn() }} onChanged={vi.fn()} />);
    const rowTrigger = screen.getByRole("button", { name: "More actions for Previous song" });
    await user.click(rowTrigger);
    fireEvent.pointerDown(screen.getByRole("heading", { name: "Recently played" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(rowTrigger).toHaveFocus();

    const headerTrigger = screen.getByRole("button", { name: "History actions" });
    await user.click(headerTrigger);
    await user.click(screen.getByRole("menuitem", { name: "Clear history" }));
    const backdrop = screen.getByRole("dialog", { name: "Clear history" }).parentElement!;
    fireEvent.mouseDown(backdrop);
    expect(screen.queryByRole("dialog", { name: "Clear history" })).not.toBeInTheDocument();
    expect(headerTrigger).toHaveFocus();
  });

  it("focuses and traps focus in the clear-history dialog before restoring its opener after cancel", async () => {
    // Break caught: a modal opens with focus behind it or permits Tab to escape the confirmation controls.
    const user = userEvent.setup();
    render(<MusicHistory songs={[song]} queueClient={{ clearHistory: vi.fn() }} onChanged={vi.fn()} />);
    const headerTrigger = screen.getByRole("button", { name: "History actions" });
    await user.click(headerTrigger);
    await user.click(screen.getByRole("menuitem", { name: "Clear history" }));
    const dialog = screen.getByRole("dialog", { name: "Clear history" });
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const confirm = within(dialog).getByRole("button", { name: "Clear history" });
    await waitFor(() => expect(cancel).toHaveFocus());
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await user.click(cancel);
    expect(headerTrigger).toHaveFocus();
  });

  it("restores focus to the failed last-row removal trigger", async () => {
    // Break caught: a rejected history mutation leaves keyboard focus on a removed menu item or document body.
    const user = userEvent.setup();
    render(<MusicHistory songs={[song]} queueClient={{ clearHistory: vi.fn(), removeHistorySong: vi.fn().mockRejectedValue(new Error("offline")) }} onChanged={vi.fn()} />);
    const rowTrigger = screen.getByRole("button", { name: "More actions for Previous song" });
    await user.click(rowTrigger);
    await user.click(screen.getByRole("menuitem", { name: "Remove from history" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not remove Previous song from history. Try again.");
    await waitFor(() => expect(rowTrigger).toHaveFocus());
  });

  it("locks competing actions while a row removal is pending", async () => {
    // Break caught: a second click starts a competing history mutation while the first durable operation is unresolved.
    let resolveRemoval!: () => void;
    const pendingRemoval = new Promise<void>((resolve) => { resolveRemoval = resolve; });
    const user = userEvent.setup();
    const second = { ...song, id: 4, title: "Next history song" };
    render(<MusicHistory songs={[song, second]} queueClient={{ clearHistory: vi.fn(), removeHistorySong: vi.fn().mockReturnValue(pendingRemoval) }} onChanged={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "More actions for Previous song" }));
    await user.click(screen.getByRole("menuitem", { name: "Remove from history" }));
    expect(screen.getByRole("button", { name: "History actions" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "More actions for Next history song" })).toBeDisabled();
    resolveRemoval();
  });

  it("offers one Play action and requests playback after the canonical write", async () => {
    const setPlaying = vi.fn().mockResolvedValue(song);
    const onPlaybackRequested = vi.fn().mockResolvedValue("acknowledged");
    render(<MusicHistory songs={[song]} queueClient={{ clearHistory: vi.fn(), setPlaying }} onChanged={vi.fn().mockResolvedValue(undefined)} beginPlaybackRequest={() => 42} onPlaybackRequested={onPlaybackRequested} /> as React.ReactElement);

    await userEvent.click(screen.getByRole("button", { name: "More actions for Previous song" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Play again" }));

    expect(setPlaying).not.toHaveBeenCalled();
    expect(onPlaybackRequested).toHaveBeenCalledWith(song.id, 42, "history");
    expect(screen.getAllByRole("button", { name: /More actions for Previous song/ })).toHaveLength(1);
  });
});
