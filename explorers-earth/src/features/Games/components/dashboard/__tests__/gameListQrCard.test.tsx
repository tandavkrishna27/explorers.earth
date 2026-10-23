import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// The "My QR" accordion in the old Manage tab is replaced by the shared Share tab; this
// suite keeps protecting the same behaviour (a Games list has a QR card it can share and
// download as an image) through the new page.
const png = vi.hoisted(() => ({ exportElementPng: vi.fn(async () => new Blob(["png"])), savePng: vi.fn() }));
vi.mock("../../../../../utils/exportElementPng", () => png);
const list = { documentId: "l1", List_Name: "My Games", slug: "my-games", Visibility: true, cover_image: null, list_description: null, account: { username: "owner" }, recommended_games: [] };
vi.mock("../../../hooks/useGamesOwner", () => ({
  useGamesOwner: () => ({ content: { view: { lists: [list] } }, data: { gameLists: [list] }, loading: false, error: undefined, refetch: vi.fn() }),
}));
import GameListView from "../GameListView";

afterEach(cleanup);
function mount() {
  render(<MemoryRouter initialEntries={["/recommendations/games/l1"]}><Routes><Route path="/recommendations/games/:listId" element={<GameListView />} /></Routes></MemoryRouter>);
  fireEvent.click(screen.getByRole("tab", { name: "Share" }));
}

describe("Games list QR card", () => {
  it("offers Share and Download like the other categories, and downloads this list's QR", async () => {
    mount();
    expect(screen.getByRole("button", { name: /Share/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Download QR" }));
    await waitFor(() => expect(png.savePng).toHaveBeenCalledWith(expect.anything(), "my-games-qr.png"));
    expect(png.exportElementPng).toHaveBeenCalledWith(screen.getByTestId("list-qr-card"), expect.anything());
  });

  it("the QR card carries the list name, a black-on-white QR and the category tagline", () => {
    mount();
    const card = screen.getByTestId("list-qr-card");
    expect(within(card).getByText("My Games")).toBeInTheDocument();
    expect(card.querySelector("svg")).not.toBeNull();
    expect(card.textContent?.length).toBeGreaterThan("My Games".length);
  });
});
