import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const download = vi.hoisted(() => vi.fn());
vi.mock("../../../../../utils/qrDownload", () => ({ downloadQrSvgAsPng: download }));
vi.mock("../../../api/query", () => ({
  useGamesCommands: () => ({ loading: false, updateList: vi.fn(), archiveList: vi.fn() }),
  useGamesCallerCustody: () => () => () => true,
}));
import { ManageTab } from "../GameListView";

afterEach(cleanup);
const list = { documentId: "l1", List_Name: "My Games", slug: "my-games", Visibility: true, account: { username: "owner" }, recommended_games: [] };

describe("Games list QR card", () => {
  it("offers Share and Download like the other categories, and downloads this list's QR", () => {
    render(
      <MemoryRouter>
        <ManageTab list={list as never} onRefetch={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /Share/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Image/ }));
    expect(download).toHaveBeenCalledWith("list-qr-games", "QR_my-games.png", 20);
  });

  it("uses a high-contrast tagline pill", () => {
    render(
      <MemoryRouter>
        <ManageTab list={list as never} onRefetch={() => {}} />
      </MemoryRouter>,
    );
    const pill = screen.getByText(/./, { selector: "p.rounded-full" });
    expect(pill.className).toContain("bg-gray-200");
    expect(pill.className).toContain("text-black");
  });
});
