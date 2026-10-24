import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const api = vi.hoisted(() => ({ getMyEditableCollection: vi.fn(), makeMyCollectionMine: vi.fn(), purgeMyCollection: vi.fn(), updateMyCollection: vi.fn() }));
vi.mock("../../../../lib/explorersApiClient", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../../lib/explorersApiClient")>();
  return { ExplorersApiError: real.ExplorersApiError, explorersApiClient: api };
});
vi.mock("react-i18next", async (importOriginal) => {
  const real = await importOriginal<typeof import("react-i18next")>();
  const { englishTranslation } = await import("./englishTranslationMock");
  return { ...real, useTranslation: englishTranslation };
});
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { sampleCommands } from "../useSampleCommands";
import ListPage from "../../list/ListPage";
import { adapterFixture } from "../../list/__tests__/adapterFixture";
import TopPicksHero from "../../topPicks/TopPicksHero";
import { withSampleFallbackListPick, withSampleFallbackPick } from "../../category/models";

const sampleView = { id: "list_1", title: "Indian fiction", description: null, slug: "indian-fiction", coverUrl: null,
  status: "draft" as const, itemCount: 3, publicUrl: "https://explorers.earth/u/books/indian-fiction", isSample: true };

beforeEach(() => {
  vi.clearAllMocks();
  api.getMyEditableCollection.mockResolvedValue({ resourceId: "list_1", resourceRevision: 4 });
  api.makeMyCollectionMine.mockResolvedValue({ id: "list_1", revision: 5, isSample: false });
  api.updateMyCollection.mockResolvedValue({ id: "list_1", revision: 6 });
});

describe("Make it mine sheet (mocks v3)", () => {
  it("renames through the ordinary update only when the name changed", async () => {
    await sampleCommands("list_1").makeMine("Indian fiction", "Indian fiction");
    expect(api.updateMyCollection).not.toHaveBeenCalled();
    await sampleCommands("list_1").makeMine("My Indian fiction", "Indian fiction");
    expect(api.makeMyCollectionMine).toHaveBeenCalledTimes(2);
    expect(api.updateMyCollection).toHaveBeenCalledWith(expect.anything(), { title: "My Indian fiction" }, expect.any(String));
  });

  it("the list page sheet converts with the edited name and shows the new toast", async () => {
    const adapter = adapterFixture({ list: sampleView });
    render(<MemoryRouter><ListPage adapter={adapter} /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: "Make it mine" }));
    const sheet = screen.getByRole("dialog");
    const name = within(sheet).getByLabelText("List name");
    await userEvent.clear(name);
    await userEvent.type(name, "Fiction I love");
    await userEvent.click(within(sheet).getByRole("button", { name: "Make it mine" }));
    expect(await screen.findByText("Now yours")).toBeInTheDocument();
    expect(api.updateMyCollection).toHaveBeenCalledWith(expect.anything(), { title: "Fiction I love" }, expect.any(String));
    expect(toast.success).toHaveBeenCalledWith("It's yours now: a draft you can edit and publish");
  });

  it("Cancel closes the sheet without converting", async () => {
    render(<MemoryRouter><ListPage adapter={adapterFixture({ list: sampleView })} /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: "Make it mine" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.makeMyCollectionMine).not.toHaveBeenCalled();
  });
});

describe("sample list page layout (mocks v3)", () => {
  it("hides pins, item menus and every Add button; reorder stays", () => {
    render(<MemoryRouter><ListPage adapter={adapterFixture({ list: sampleView })} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: /Pin .* to Top Picks/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /More actions for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add/ })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Items" }) ?? screen.getByLabelText("Items")).toBeInTheDocument();
  });

  it("a normal list still has pins, menus and Add", () => {
    render(<MemoryRouter><ListPage adapter={adapterFixture()} /></MemoryRouter>);
    expect(screen.getAllByRole("button", { name: /Pin .* to Top Picks/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /More actions for/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Add/ }).length).toBeGreaterThan(0);
  });

  it("puts the badge row above the title and keeps the bar border solid", () => {
    render(<MemoryRouter><ListPage adapter={adapterFixture({ list: sampleView })} /></MemoryRouter>);
    const badge = screen.getByText("Sample");
    const title = screen.getByRole("heading", { level: 1 });
    expect(badge.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const bar = screen.getByText(/A sample to show how a list works/).parentElement!;
    expect(bar.className).not.toContain("border-dashed");
    expect(screen.getByRole("button", { name: "Delete sample" })).toHaveTextContent(/^Delete$/);
  });
});

describe("Top Picks for samples (mocks v3)", () => {
  it("reads From the sample list", () => {
    render(<TopPicksHero category="movies" state="picks" onOpenPick={vi.fn()} onManage={vi.fn()}
      picks={[{ id: "p1", title: "Lagaan", subtitle: null, imageUrl: null, listId: "l1", listTitle: "Starter films", pinned: true, pinnable: true, isSample: true }]} />);
    expect(screen.getByText('From the sample list "Starter films"')).toBeInTheDocument();
  });

  it("Places previews the first sample list's first place when nothing is pinned", () => {
    const spec = { relation: "recommended_places", title: (p: Record<string, any>) => p.Place_Details.Title, image: () => null }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const lists = [
      { documentId: "mine", List_Name: "Mine", recommended_places: [{ documentId: "x", Place_Details: { Title: "Not this" } }] },
      { documentId: "s1", List_Name: "Delhi heritage walk", isSample: true, recommended_places: [{ documentId: "p1", Place_Details: { Title: "Qutub Minar" } }, { documentId: "p2", Place_Details: { Title: "Red Fort" } }] },
    ];
    expect(withSampleFallbackPick([], lists, spec)).toEqual([{ id: "p1", title: "Qutub Minar", subtitle: null, imageUrl: null, listId: "s1",
      listTitle: "Delhi heritage walk", pinned: false, pinnable: false, isSample: true }]);
    const pinned = [{ id: "l9", title: "Pinned", subtitle: null, imageUrl: null, listId: "l9", listTitle: "Pinned", pinned: true, pinnable: true }];
    expect(withSampleFallbackPick(pinned, lists, spec)).toBe(pinned);
    expect(withSampleFallbackPick([], [lists[0]], spec)).toEqual([]);
  });

  it("Guides previews the first sample guide itself when nothing is pinned", () => {
    const spec = { title: (g: Record<string, any>) => g.Title, image: () => null }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const guides = [{ documentId: "g0", Title: "Mine" }, { documentId: "g1", Title: "3 days in Goa", isSample: true }];
    expect(withSampleFallbackListPick([], guides, spec)).toEqual([{ id: "g1", title: "3 days in Goa", subtitle: null, imageUrl: null, listId: "g1",
      listTitle: "3 days in Goa", pinned: false, pinnable: false, isSample: true }]);
    const pinned = [{ id: "g9", title: "P", subtitle: null, imageUrl: null, listId: "g9", listTitle: "P", pinned: true, pinnable: true }];
    expect(withSampleFallbackListPick(pinned, guides, spec)).toBe(pinned);
    expect(withSampleFallbackListPick([], [guides[0]], spec)).toEqual([]);
  });
});
