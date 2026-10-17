import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MusicWorkspaceShell } from "../MusicWorkspaceShell";

const panels = {
  player: <section aria-label="player-content">Player content</section>,
  search: <section aria-label="search-content"><label>Scoped search<input type="search" /></label></section>,
  queue: <section aria-label="queue-content">Queue content</section>,
  history: <section aria-label="history-content">History content</section>,
  guestControls: <section aria-label="guest-controls-content">Guest controls content</section>,
};

describe("MusicWorkspaceShell", () => {
  it("places search before the player and composes queue, guest controls, and history", () => {
    render(<MusicWorkspaceShell {...panels} />);
    expect(screen.getByLabelText("Music player region")).toContainElement(screen.getByLabelText("player-content"));
    const workspace = screen.getByRole("region", { name: "Music workspace" });
    const searchRegion = screen.getByLabelText("Music search region");
    const playerRegion = screen.getByLabelText("Music player region");
    expect(workspace.compareDocumentPosition(searchRegion) & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeTruthy();
    expect(searchRegion.compareDocumentPosition(playerRegion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("region", { name: "Up next" })).toContainElement(screen.getByLabelText("queue-content"));
    expect(screen.getByRole("region", { name: "Guest controls" })).toContainElement(screen.getByLabelText("guest-controls-content"));
    expect(screen.getByRole("region", { name: "Recently played panel" })).toContainElement(screen.getByLabelText("history-content"));
  });

  it("keeps the shell during loading, marks stale content read-only, and offers an empty queue CTA", () => {
    const { rerender } = render(<MusicWorkspaceShell {...panels} loading />);
    expect(screen.getByRole("region", { name: "Music workspace" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Refreshing Music");
    rerender(<MusicWorkspaceShell {...panels} stale empty />);
    expect(screen.getByRole("region", { name: "Music workspace" })).toHaveAttribute("aria-readonly", "true");
    expect(screen.getByRole("button", { name: "Add your first song" })).toHaveClass("min-h-11", "min-w-11");
  });

  it("uses a responsive single-column-to-two-column layout without nested navigation", () => {
    render(<MusicWorkspaceShell {...panels} />);
    expect(screen.queryByRole("tablist", { name: "Music content" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Up next" }).parentElement).toHaveClass("grid", "lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.8fr)]");
    expect(screen.getByRole("region", { name: "Up next" })).toHaveClass("min-w-0");
    expect(screen.getByRole("region", { name: "Guest controls" }).parentElement).toHaveClass("min-w-0");
    expect(screen.getByRole("region", { name: "Guest controls" })).toHaveClass("min-w-0");
    expect(screen.getByRole("region", { name: "Recently played panel" })).toHaveClass("min-w-0");
    expect(screen.queryByRole("navigation", { name: "Music workspace" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Music workspace" }).className).toContain("overflow-x-hidden");
  });

  it("focuses the always-visible unified search input from the empty CTA", () => {
    render(<MusicWorkspaceShell {...panels} empty />);
    fireEvent.click(screen.getByRole("button", { name: "Add your first song" }));
    expect(screen.getByLabelText("Scoped search")).toHaveFocus();
    expect(screen.getByLabelText("search-content").parentElement).not.toHaveClass("hidden");
  });
});
