import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SampleBadge } from "../SampleBadge";
import { SampleActions } from "../SampleActions";
import { readIsSample } from "../readIsSample";
import PublishPill from "../../../../components/controls/PublishPill";
import ListCard from "../../category/ListCard";
import { toItemTopPicks, toListCards, toListTopPicks } from "../../category/models";
import TopPicksHero from "../../topPicks/TopPicksHero";

const grip = { onKeyDown: vi.fn(), onDragStart: vi.fn(), onDragOver: vi.fn(), onDrop: vi.fn(), onDragEnd: vi.fn() };

describe("samples UI (SMP-01, SMP-03, SMP-04, SMP-05)", () => {
  it("shows a Sample badge", () => {
    render(<SampleBadge />);
    expect(screen.getByText("Sample")).toBeInTheDocument();
  });

  it("Make it mine calls the command once and announces Now yours", async () => {
    const onMakeMine = vi.fn().mockResolvedValue(undefined);
    render(<SampleActions onMakeMine={onMakeMine} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Make it mine" }));
    expect(onMakeMine).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent("Now yours");
  });

  it("Delete asks first, says it is permanent, then deletes", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<SampleActions onMakeMine={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete sample" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("It won't come back");
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("the publish pill is disabled for a sample with the reason (WP2 pill)", async () => {
    const onChange = vi.fn();
    render(<PublishPill kind="list" value="draft" privateComingSoon onChange={onChange} disabled disabledReason="Samples can't be published" />);
    const pill = document.querySelector<HTMLButtonElement>("[aria-haspopup=\"menu\"]")!;
    expect(pill).toHaveAttribute("data-value", "draft");
    expect(pill).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Samples can't be published")).toBeInTheDocument();
    await userEvent.click(pill);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reads isSample defensively from a DTO-shaped object", () => {
    expect(readIsSample({ isSample: true })).toBe(true);
    expect(readIsSample({ isSample: false })).toBe(false);
    expect(readIsSample({})).toBe(false);
    expect(readIsSample(null)).toBe(false);
  });

  it("carries isSample from legacy lists onto cards and top picks", () => {
    const lists = [{ documentId: "l1", List_Name: "Sample list", isSample: true, Visibility: false, items: [{ documentId: "i1", is_pinned: true, pin_order: 1 }] },
      { documentId: "l2", List_Name: "Mine", Visibility: false, items: [] }];
    const cards = toListCards(lists, { relation: "items", visibility: "Visibility", cover: () => null });
    expect(cards.map((card) => card.isSample)).toEqual([true, undefined]);
    const picks = toItemTopPicks(lists, { relation: "items", title: () => "t", image: () => null, subtitle: () => null });
    expect(picks[0].isSample).toBe(true);
    const listPicks = toListTopPicks([{ ...lists[0], is_pinned: true }], { title: () => "x", image: () => null, isPublic: () => false });
    expect(listPicks[0].isSample).toBe(true);
  });

  it("a sample list card shows the badge, the private hint and the sample menu", async () => {
    render(<ListCard category="movies" list={{ id: "l1", title: "Starter films", status: "draft", itemCount: 3, pinnedCount: 0, covers: [], isSample: true }}
      onOpen={vi.fn()} onSetStatus={vi.fn()} onMove={vi.fn()} grip={grip} />);
    expect(screen.getByText("Sample")).toBeInTheDocument();
    expect(screen.getByText("Only you can see this")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /more/i }));
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual(["Make it mine", "Open", "Delete"]);
    expect(screen.getByRole("menuitem", { name: "Delete sample" })).toHaveTextContent("Delete");
  });

  it("a normal list card has no Sample badge", () => {
    render(<ListCard category="movies" list={{ id: "l2", title: "Mine", status: "draft", itemCount: 1, pinnedCount: 0, covers: [] }}
      onOpen={vi.fn()} onSetStatus={vi.fn()} onMove={vi.fn()} grip={grip} />);
    expect(screen.queryByText("Sample")).not.toBeInTheDocument();
  });

  it("Top Picks shows a Sample badge on a pick from a sample", () => {
    render(<TopPicksHero category="movies" state="picks" onOpenPick={vi.fn()} onManage={vi.fn()}
      picks={[{ id: "p1", title: "Pick", subtitle: null, imageUrl: null, listId: "l1", listTitle: "Starter", pinned: true, pinnable: true, isSample: true }]} />);
    expect(screen.getByText("Sample")).toBeInTheDocument();
  });
});
