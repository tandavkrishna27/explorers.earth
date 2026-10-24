import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { englishI18n } from "../../../../test/englishI18n";
const writes = vi.hoisted(() => ({ saveItemPins: vi.fn().mockResolvedValue(undefined), saveListPins: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../topPicksWrites", () => writes);
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
import TopPicksManager from "../TopPicksManager";

const pick = (id: string, over = {}) => ({ id, title: `Item ${id}`, subtitle: null, imageUrl: null, listId: "l", listTitle: "L", pinned: false, pinnable: true, ...over });
const wrap = (ui: React.ReactElement) => render(<I18nextProvider i18n={englishI18n}>{ui}</I18nextProvider>);
beforeEach(() => vi.clearAllMocks());

describe("TopPicksManager", () => {
  it("pins, unpins, reorders and saves the exact order (items mode)", async () => {
    const onSaved = vi.fn();
    wrap(<TopPicksManager category="movies" mode="items" limit={15} pinned={[pick("a", { pinned: true }), pick("b", { pinned: true })]}
      candidates={[pick("a"), pick("b"), pick("c")]} onClose={() => {}} onSaved={onSaved} />);
    await userEvent.click(screen.getByRole("button", { name: "Pin Item c" }));
    await userEvent.click(screen.getByRole("button", { name: "Unpin Item a" }));
    await userEvent.click(screen.getByRole("button", { name: "Move Item c up" }));
    await userEvent.click(screen.getByRole("button", { name: "Save Top Picks" }));
    expect(writes.saveItemPins).toHaveBeenCalledWith("movies", ["c", "b"]);
    expect(onSaved).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Top Picks updated");
  });
  it("stops at the limit", async () => {
    wrap(<TopPicksManager category="movies" mode="items" limit={1} pinned={[pick("a", { pinned: true })]} candidates={[pick("a"), pick("b")]} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByRole("button", { name: "Pin Item b" })).toBeDisabled();
    expect(screen.getByText("Top Picks are full (1). Unpin one to pin another.")).toBeInTheDocument();
  });
  it("lists mode: draft lists cannot be pinned; save sends previous and next ids", async () => {
    wrap(<TopPicksManager category="places" mode="lists" limit={5} pinned={[pick("x", { pinned: true })]}
      candidates={[pick("x"), pick("y", { pinnable: false }), pick("z")]} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByRole("button", { name: "Pin Item y" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Pin Item z" }));
    await userEvent.click(screen.getByRole("button", { name: "Save Top Picks" }));
    expect(writes.saveListPins).toHaveBeenCalledWith("places", ["x"], ["x", "z"]);
  });
  it("keeps the staged selection when saving fails", async () => {
    writes.saveItemPins.mockRejectedValueOnce(new Error("409"));
    const onSaved = vi.fn();
    wrap(<TopPicksManager category="books" mode="items" limit={15} pinned={[]} candidates={[pick("a")]} onClose={() => {}} onSaved={onSaved} />);
    await userEvent.click(screen.getByRole("button", { name: "Pin Item a" }));
    await userEvent.click(screen.getByRole("button", { name: "Save Top Picks" }));
    expect(onSaved).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Couldn't save Top Picks. Your selection is kept.");
    expect(within(screen.getByRole("list", { name: "Pinned (shown in Top Picks)" })).getByText("Item a")).toBeInTheDocument();
  });
  it("shows the nothing-to-pin message on a fresh account", () => {
    wrap(<TopPicksManager category="games" mode="items" limit={15} pinned={[]} candidates={[]} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText("Nothing to pin yet. Add items to a list first.")).toBeInTheDocument();
  });
});
