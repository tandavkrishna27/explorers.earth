import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { QueryClient } from "@tanstack/react-query";
import { englishI18n } from "../../../../test/englishI18n";

const api = vi.hoisted(() => ({
  getMyEditableCollection: vi.fn(),
  makeMyCollectionMine: vi.fn(),
  purgeMyCollection: vi.fn(),
}));
vi.mock("../../../../lib/explorersApiClient", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../../lib/explorersApiClient")>();
  return { ExplorersApiError: real.ExplorersApiError, explorersApiClient: api };
});
const inv = vi.hoisted(() => ({ apps: vi.fn(), places: vi.fn(), games: vi.fn(), guides: vi.fn(), movies: vi.fn(), people: vi.fn(), products: vi.fn() }));
vi.mock("../../../AppsAndTools/hooks/useAppsOwner", () => ({ invalidateApps: inv.apps }));
vi.mock("../../../Favorites/hooks/usePlacesOwner", () => ({ invalidatePlaces: inv.places }));
vi.mock("../../../Games/hooks/useGamesOwner", () => ({ invalidateGames: inv.games }));
vi.mock("../../../Guides/hooks/useGuidesOwner", () => ({ invalidateGuides: inv.guides }));
vi.mock("../../../Movies/api/explorersAdapter", () => ({ invalidateMovies: inv.movies }));
vi.mock("../../../People/hooks/usePeopleOwner", () => ({ invalidatePeople: inv.people }));
vi.mock("../../../Products/hooks/useProductsOwner", () => ({ invalidateProducts: inv.products }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { ExplorersApiError } from "../../../../lib/explorersApiClient";
import { sampleCommands, isSamplePublishRefusal } from "../useSampleCommands";
import { SampleActions } from "../SampleActions";
import CategoryPage, { type CategoryPageProps } from "../../category/CategoryPage";
import type { ListCardModel, TopPickModel } from "../../category/models";
import ListPage from "../../list/ListPage";
import { adapterFixture } from "../../list/__tests__/adapterFixture";

const sampleCard: ListCardModel = { id: "s1", title: "Starter films", status: "draft", itemCount: 3, pinnedCount: 1, covers: [], isSample: true };
const samplePick: TopPickModel = { id: "p1", title: "Lagaan", subtitle: null, imageUrl: null, listId: "s1", listTitle: "Starter films", pinned: true, pinnable: true, isSample: true };
const sampleView = { id: "list_1", title: "Indian fiction", description: null, slug: "indian-fiction", coverUrl: null,
  status: "draft" as const, itemCount: 3, publicUrl: "https://explorers.earth/u/books/indian-fiction", isSample: true };

/** A category wrapper whose owner read is replaced by `next` once the page reports a write. */
function Harness({ next, initial }: { initial: { lists: ListCardModel[]; picks: TopPickModel[] }; next: { lists: ListCardModel[]; picks: TopPickModel[] } }) {
  const [data, setData] = useState(initial);
  const props: CategoryPageProps = {
    category: "movies", status: { loading: false, error: null, refreshing: false }, lists: data.lists, topPicks: data.picks, pinCandidates: [],
    categoryVisibility: "hidden", visibilityBusy: false, onCategoryVisibility: vi.fn(), onOpenList: vi.fn(), onRetry: vi.fn(),
    onChanged: () => setData(next), newList: { kind: "dialog", username: "fixture", onCreated: vi.fn() },
  };
  return <I18nextProvider i18n={englishI18n}><CategoryPage {...props} /></I18nextProvider>;
}

/** Make it mine asks first (mocks v3); confirm the sheet with its prefilled name. */
const confirmMine = () => userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Make it mine" }));

beforeEach(() => {
  vi.clearAllMocks();
  api.getMyEditableCollection.mockResolvedValue({ resourceId: "s1", resourceRevision: 4 });
  api.makeMyCollectionMine.mockResolvedValue({ id: "s1", revision: 5, isSample: false });
  api.purgeMyCollection.mockResolvedValue({ deleted: true });
});

describe("Make it mine refreshes every owner cache (owner req 1)", () => {
  it("invalidates every category read, the React Query cache and the caller's read", async () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const onChanged = vi.fn();
    await sampleCommands("s1", onChanged, queryClient).makeMine();
    for (const fn of Object.values(inv)) expect(fn).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("after the refetch the card loses its badge and dashed style and Top Picks loses its badge", async () => {
    const mine = { ...sampleCard, isSample: undefined };
    render(<Harness initial={{ lists: [sampleCard], picks: [samplePick] }} next={{ lists: [mine], picks: [{ ...samplePick, isSample: undefined }] }} />);
    expect(screen.getAllByText("Sample")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: /More options for Starter films|more/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Make it mine" }));
    await confirmMine();
    await waitFor(() => expect(screen.queryByText("Sample")).not.toBeInTheDocument());
    expect(screen.getByTestId("list-card").className).not.toContain("border-dashed");
    expect(screen.queryByText("Only you can see this")).not.toBeInTheDocument();
  });
});

describe("double click sends one request (owner req 2)", () => {
  it("disables Make it mine while in flight", async () => {
    let finish: () => void = () => {};
    const onMakeMine = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<SampleActions onMakeMine={onMakeMine} onDelete={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Make it mine" });
    await userEvent.dblClick(button);
    expect(onMakeMine).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    finish();
    await screen.findByText("Now yours");
    await userEvent.click(button);
    expect(onMakeMine).toHaveBeenCalledTimes(1);
  });

  it("the list page sends exactly one make-it-mine request on a double click", async () => {
    render(<MemoryRouter><ListPage adapter={adapterFixture({ list: sampleView })} /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: "Make it mine" }));
    await userEvent.dblClick(within(screen.getByRole("dialog")).getByRole("button", { name: "Make it mine" }));
    await screen.findByText("Now yours");
    expect(api.makeMyCollectionMine).toHaveBeenCalledTimes(1);
  });
});

describe("stale tab (owner req 3)", () => {
  for (const status of [409, 404]) {
    it(`a ${status} on Make it mine refetches and shows the list as yours, without an error toast`, async () => {
      api.makeMyCollectionMine.mockRejectedValue(new ExplorersApiError(status, status === 409 ? "CONFLICT" : "NOT_FOUND", "stale"));
      const adapter = adapterFixture({ list: sampleView });
      render(<MemoryRouter><ListPage adapter={adapter} /></MemoryRouter>);
      await userEvent.click(screen.getByRole("button", { name: "Make it mine" }));
      await confirmMine();
      expect(await screen.findByText("Now yours")).toHaveAttribute("role", "status");
      expect(adapter.retry).toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });
  }
});

describe("deleting the last sample (owner req 4)", () => {
  it("leaves the ordinary empty state: empty hero, the new-list card and no sample hint", async () => {
    render(<Harness initial={{ lists: [sampleCard], picks: [samplePick] }} next={{ lists: [], picks: [] }} />);
    await userEvent.click(screen.getByRole("button", { name: /more/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete sample" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("It won't come back");
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Pin items to feature them here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create your first list/ })).toBeInTheDocument();
    expect(screen.queryByText("Only you can see this")).not.toBeInTheDocument();
    expect(screen.queryByText("Sample")).not.toBeInTheDocument();
    expect(api.purgeMyCollection).toHaveBeenCalledTimes(1);
  });
});

describe("publish refusal points at the fix (owner req 5)", () => {
  const guidance = "Samples can't be published. Make it mine to edit and publish it.";
  it("the disabled pill carries the guidance", () => {
    render(<MemoryRouter><ListPage adapter={adapterFixture({ list: sampleView })} /></MemoryRouter>);
    expect(screen.getByText(guidance)).toBeInTheDocument();
  });
  it("a server 422 sample refusal maps to the same text", async () => {
    const refusal = new ExplorersApiError(422, "INVALID_INPUT", "Samples can't be published");
    expect(isSamplePublishRefusal(refusal)).toBe(true);
    expect(isSamplePublishRefusal(new ExplorersApiError(422, "INVALID_INPUT", "Add an item first"))).toBe(false);
    const adapter = adapterFixture();
    adapter.setStatus.mockRejectedValue(refusal);
    render(<MemoryRouter><ListPage adapter={adapter} /></MemoryRouter>);
    await userEvent.click(document.querySelector<HTMLButtonElement>("[aria-haspopup=\"menu\"]")!);
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Public/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(guidance));
  });
});

describe("a converted list keeps its item order (owner req 6)", () => {
  it("renders the same items in the same order after Make it mine", async () => {
    const adapter = adapterFixture({ list: sampleView });
    const { rerender } = render(<MemoryRouter><ListPage adapter={adapter} /></MemoryRouter>);
    const order = () => screen.getAllByText(/^Item (one|two|three)$/).map((node) => node.textContent);
    const before = order();
    await userEvent.click(screen.getByRole("button", { name: "Make it mine" }));
    await confirmMine();
    await screen.findByText("Now yours");
    rerender(<MemoryRouter><ListPage adapter={{ ...adapter, list: { ...sampleView, isSample: undefined } }} /></MemoryRouter>);
    expect(screen.queryByText("Sample")).not.toBeInTheDocument();
    expect(order()).toEqual(before);
    expect(before).toEqual(["Item one", "Item two", "Item three"]);
  });
});
