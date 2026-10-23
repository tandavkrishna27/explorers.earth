import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const api = vi.hoisted(() => ({
  getMyEditableCollection: vi.fn(),
  makeMyCollectionMine: vi.fn(),
  purgeMyCollection: vi.fn(),
}));
vi.mock("../../../../lib/explorersApiClient", () => ({ explorersApiClient: api }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ListPage from "../../list/ListPage";
import ManageTab from "../../list/ManageTab";
import { adapterFixture } from "../../list/__tests__/adapterFixture";

const sampleList = { id: "list_1", title: "Indian fiction to start with", description: null, slug: "indian-fiction", coverUrl: null,
  status: "draft" as const, itemCount: 3, publicUrl: "https://explorers.earth/u/books/indian-fiction", isSample: true };

describe("sample list page (SMP-03, SMP-04, SMP-05)", () => {
  beforeEach(() => {
    api.getMyEditableCollection.mockResolvedValue({ resourceId: "list_1", resourceRevision: 4 });
    api.makeMyCollectionMine.mockResolvedValue({ id: "list_1", revision: 5, isSample: false });
    api.purgeMyCollection.mockResolvedValue({ deleted: true });
  });

  it("shows the badge, the private hint, the sample bar and a disabled pill", () => {
    render(<MemoryRouter><ListPage adapter={adapterFixture({ list: sampleList })} /></MemoryRouter>);
    expect(screen.getByText("Sample")).toBeInTheDocument();
    expect(screen.getByText("Only you can see this · can't be published")).toBeInTheDocument();
    expect(screen.getByText(/A sample to show how a list works/)).toBeInTheDocument();
    expect(document.querySelector("[aria-haspopup=\"menu\"]")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Samples can't be published. Make it mine to edit and publish it.")).toBeInTheDocument();
  });

  it("Make it mine converts in place and refetches", async () => {
    const adapter = adapterFixture({ list: sampleList });
    render(<MemoryRouter><ListPage adapter={adapter} /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: "Make it mine" }));
    expect(api.makeMyCollectionMine).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Now yours")).toHaveAttribute("role", "status");
    expect(adapter.retry).toHaveBeenCalled();
  });

  it("Delete sample confirms, then purges through the adapter", async () => {
    const adapter = adapterFixture({ list: sampleList });
    render(<MemoryRouter><ListPage adapter={adapter} /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: "Delete sample" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    expect(adapter.purge).toHaveBeenCalledTimes(1);
  });

  it("a normal list page has no sample bar and an enabled pill", () => {
    render(<MemoryRouter><ListPage adapter={adapterFixture()} /></MemoryRouter>);
    expect(screen.queryByText("Sample")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Make it mine" })).not.toBeInTheDocument();
    expect(document.querySelector("[aria-haspopup=\"menu\"]")).not.toHaveAttribute("aria-disabled");
  });

  it("ManageTab hides the URL rename for a sample", () => {
    render(<MemoryRouter><ManageTab adapter={adapterFixture({ list: sampleList })} /></MemoryRouter>);
    expect(screen.queryByLabelText("List URL")).not.toBeInTheDocument();
    expect(screen.getByLabelText("List name")).toBeInTheDocument();
  });
});
