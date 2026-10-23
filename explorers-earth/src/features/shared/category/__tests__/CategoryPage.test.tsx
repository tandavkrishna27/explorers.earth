import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { englishI18n } from "../../../../test/englishI18n";

vi.mock("../../topPicks/TopPicksHero", () => ({ default: (p: { state: string; onManage: () => void }) => <div data-testid="hero" data-state={p.state}><button onClick={p.onManage}>Manage Top Picks</button></div> }));
vi.mock("../../topPicks/TopPicksManager", () => ({ default: (p: { onClose: () => void }) => <div data-testid="manager"><button onClick={p.onClose}>Close</button></div> }));
vi.mock("../../lists/NewListDialog", () => ({ default: (p: { open: boolean }) => (p.open ? <div role="dialog" aria-label="New list" /> : null) }));
const writes = vi.hoisted(() => ({ orderLists: vi.fn().mockResolvedValue(undefined), setListStatus: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../listWrites", () => writes);
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import CategoryPage, { type CategoryPageProps } from "../CategoryPage";

const lists = [
  { id: "a", title: "Comfort movies", status: "public" as const, itemCount: 3, pinnedCount: 1, covers: [] },
  { id: "b", title: "Slow-burn thrillers", status: "draft" as const, itemCount: 2, pinnedCount: 0, covers: [] },
];
const base = (over: Partial<CategoryPageProps> = {}): CategoryPageProps => ({
  category: "movies", status: { loading: false, error: null, refreshing: false }, lists, topPicks: [], pinCandidates: [],
  categoryVisibility: "hidden", visibilityBusy: false, onCategoryVisibility: vi.fn(), onOpenList: vi.fn(), onRetry: vi.fn(), onChanged: vi.fn(),
  newList: { kind: "dialog", username: "fixture", onCreated: vi.fn() }, ...over,
});
const wrap = (props: CategoryPageProps) => render(<I18nextProvider i18n={englishI18n}><CategoryPage {...props} /></I18nextProvider>);

describe("CategoryPage", () => {
  it("success: header, pill, New list, hero, dashed first card then cards", async () => {
    wrap(base());
    expect(screen.getByRole("heading", { level: 2, name: "Movies & Shows" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Visibility: Hidden/ })).toBeInTheDocument();
    const grid = screen.getByTestId("list-grid");
    expect(within(grid).getAllByRole("button")[0]).toHaveTextContent("New list");
    expect(within(grid).getAllByTestId("list-card")).toHaveLength(2);
    expect(screen.getByTestId("hero")).toHaveAttribute("data-state", "empty");
    await userEvent.click(within(grid).getAllByRole("button")[0]);
    expect(screen.getByRole("dialog", { name: "New list" })).toBeInTheDocument();
  });
  it("loading: card and Top Picks skeletons, no cards", () => {
    wrap(base({ lists: [], status: { loading: true, error: null, refreshing: false } }));
    expect(screen.getByRole("status", { name: "Loading your lists" })).toBeInTheDocument();
    expect(screen.queryAllByTestId("list-card")).toHaveLength(0);
  });
  it("empty: first-visit hero and Create your first list CTA", () => {
    wrap(base({ lists: [] }));
    expect(screen.getByTestId("hero")).toHaveAttribute("data-state", "firstVisit");
    expect(screen.getByRole("button", { name: /Create your first list/ })).toBeInTheDocument();
  });
  it("error with no data: inline retry row", async () => {
    const onRetry = vi.fn();
    wrap(base({ lists: [], status: { loading: false, error: new Error("x"), refreshing: false }, onRetry }));
    expect(screen.getByRole("alert")).toHaveTextContent("Your lists couldn't be loaded.");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });
  it("partial: cached cards stay with Refreshing…", () => {
    wrap(base({ status: { loading: true, error: null, refreshing: true } }));
    expect(screen.getAllByTestId("list-card")).toHaveLength(2);
    expect(screen.getByText("Refreshing…")).toBeInTheDocument();
  });
  it("reorder from the menu saves and toasts Order saved", async () => {
    wrap(base());
    await userEvent.click(screen.getByRole("button", { name: "More actions for Slow-burn thrillers" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Move earlier" }));
    expect(writes.orderLists).toHaveBeenCalledWith("movies", ["b", "a"]);
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("Order saved"));
  });
  it("Manage Top Picks is always reachable (OWN-16)", async () => {
    wrap(base({ lists: [] }));
    await userEvent.click(screen.getByRole("button", { name: "Manage Top Picks" }));
    expect(screen.getByTestId("manager")).toBeInTheDocument();
  });
  it("closing the manager returns focus to the Manage button", async () => {
    wrap(base());
    const manage = screen.getByRole("button", { name: "Manage Top Picks" });
    await userEvent.click(manage);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("manager")).toBeNull();
    await vi.waitFor(() => expect(manage).toHaveFocus());
  });
  it("navigate-mode New (Guides) calls onNew instead of opening the dialog", async () => {
    const onNew = vi.fn();
    wrap(base({ category: "guides", newList: { kind: "navigate", onNew } }));
    await userEvent.click(screen.getAllByRole("button", { name: /New guide/ })[0]);
    expect(onNew).toHaveBeenCalled();
  });
});
