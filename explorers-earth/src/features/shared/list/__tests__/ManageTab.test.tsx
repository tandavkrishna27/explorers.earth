import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, d: string, o?: Record<string, string>) => d.replace(/{{(\w+)}}/g, (_m, k) => o?.[k] ?? "") }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import ManageTab from "../ManageTab";
import { adapterFixture } from "./adapterFixture";

const renderTab = (over = {}) => { const adapter = adapterFixture(over); render(<MemoryRouter><ManageTab adapter={adapter} /></MemoryRouter>); return adapter; };

describe("ManageTab", () => {
  it("saves name and description on Save details", async () => {
    const a = renderTab();
    fireEvent.change(screen.getByLabelText("List name"), { target: { value: "Cosy movies" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(a.rename).toHaveBeenCalledWith({ title: "Cosy movies", description: null }));
  });

  it("slug change warns that the old link keeps working, validates, and saves", async () => {
    const a = renderTab();
    const input = screen.getByLabelText("List URL");
    fireEvent.change(input, { target: { value: "Bad Slug" } });
    expect(screen.getByText("Use lowercase letters, numbers and dashes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save URL" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "cosy-movies" } });
    expect(screen.getByText("Old links and printed QR codes keep working.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save URL" }));
    await waitFor(() => expect(a.rename).toHaveBeenCalledWith({ slug: "cosy-movies" }));
  });

  it("has no Published toggle and no per-item publish (LP-04, LP-05)", () => {
    renderTab();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText(/Published/)).toBeNull();
  });

  it("Archive explains it frees the URL and can be restored", async () => {
    const a = renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Archive list" }));
    expect(screen.getByText("Archived lists are hidden and free their URL. Restore them from Archived on the category page.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(a.archive).toHaveBeenCalled());
  });

  it("Delete needs an in-page confirm by typing the list name", async () => {
    const a = renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    const confirm = screen.getByRole("button", { name: "Delete forever" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type "Comfort movies" to confirm'), { target: { value: "Comfort movies" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(a.purge).toHaveBeenCalled());
  });

  it("a failed delete shows the server's message and keeps the page", async () => {
    const a = renderTab();
    a.purge.mockRejectedValue(Object.assign(new Error("Stale list revision"), { status: 409 }));
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    fireEvent.change(screen.getByLabelText('Type "Comfort movies" to confirm'), { target: { value: "Comfort movies" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete forever" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Stale list revision");
    expect(screen.getByLabelText("List name")).toBeInTheDocument();
  });

  it("renders nothing without a list", () => {
    const { container } = render(<MemoryRouter><ManageTab adapter={adapterFixture({ list: null })} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});
