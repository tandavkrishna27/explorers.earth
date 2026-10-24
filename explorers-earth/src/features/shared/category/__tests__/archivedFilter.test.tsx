import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { englishI18n } from "../../../../test/englishI18n";

vi.mock("../../topPicks/TopPicksHero", () => ({ default: () => <div data-testid="hero" /> }));
vi.mock("../../topPicks/TopPicksManager", () => ({ default: () => null }));
vi.mock("../../lists/NewListDialog", () => ({ default: () => null }));
vi.mock("../restoreButton", () => ({
  RestoreListButton: (p: { listId: string; category: string; onRestored: () => void }) => <button onClick={p.onRestored}>Restore {p.listId}</button>,
}));

import CategoryPage, { type CategoryPageProps } from "../CategoryPage";

const props = (over: Partial<CategoryPageProps> = {}): CategoryPageProps => ({
  category: "movies", status: { loading: false, error: null, refreshing: false },
  lists: [{ id: "a", title: "Comfort movies", status: "public", itemCount: 3, pinnedCount: 0, covers: [] }],
  archivedLists: [{ id: "z", title: "Old list", status: "draft", itemCount: 1, pinnedCount: 0, covers: [] }],
  topPicks: [], pinCandidates: [], categoryVisibility: "hidden", visibilityBusy: false,
  onCategoryVisibility: vi.fn(), onOpenList: vi.fn(), onRetry: vi.fn(), onChanged: vi.fn(),
  newList: { kind: "dialog", username: "fixture", onCreated: vi.fn() }, ...over,
});
const wrap = (p: CategoryPageProps) => render(<I18nextProvider i18n={englishI18n}><CategoryPage {...p} /></I18nextProvider>);

describe("Archived filter", () => {
  it("Active is the default and hides archived lists", () => {
    wrap(props());
    expect(screen.getByRole("radio", { name: "Active" })).toBeChecked();
    expect(screen.queryByText("Old list")).not.toBeInTheDocument();
  });
  it("Archived shows archived lists, each with Restore, and Restore refreshes", async () => {
    const onChanged = vi.fn();
    wrap(props({ onChanged }));
    await userEvent.click(screen.getByRole("radio", { name: "Archived" }));
    expect(screen.getByText("Old list")).toBeInTheDocument();
    expect(screen.queryByText("Comfort movies")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Restore z" }));
    expect(onChanged).toHaveBeenCalled();
  });
  it("no filter when the category has no archived lists", () => {
    wrap(props({ archivedLists: [] }));
    expect(screen.queryByRole("radio", { name: "Archived" })).not.toBeInTheDocument();
  });
});
