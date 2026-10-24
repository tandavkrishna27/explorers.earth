import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, d: string) => d }) }));
import AddItemPage from "../AddItemPage";

const bar = { onCancel: vi.fn(), onSave: vi.fn(), onSaveAndAddAnother: vi.fn(), saving: null, canSave: true } as const;

describe("AddItemPage states", () => {
  it("search state: no tabs, no action bar until something is picked", () => {
    render(<AddItemPage title="Add movie" backLabel="Back to Comfort movies" onBack={vi.fn()} mode="search" bar={bar}><p>search body</p></AddItemPage>);
    expect(screen.getByRole("heading", { level: 1, name: "Add movie" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("manual state: Back to search and the bar", () => {
    const onBackToSearch = vi.fn();
    render(<AddItemPage title="Add movie" backLabel="b" onBack={vi.fn()} mode="manual" onBackToSearch={onBackToSearch} bar={bar}><p>form</p></AddItemPage>);
    fireEvent.click(screen.getByRole("button", { name: "‹ Back to search" }));
    expect(onBackToSearch).toHaveBeenCalled();
    expect(screen.getByRole("toolbar")).toBeInTheDocument();
  });

  it("picked state shows the bar; saving never covers the page", () => {
    render(<AddItemPage title="t" backLabel="b" onBack={vi.fn()} mode="picked" bar={{ ...bar, saving: "save" }}><p>form</p></AddItemPage>);
    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    expect(document.querySelector(".fixed.inset-0")).toBeNull();
  });

  it("is a full page main region (never an overlay)", () => {
    render(<AddItemPage title="t" backLabel="Back" onBack={vi.fn()} mode="search" bar={bar}><p /></AddItemPage>);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "‹ Back" })).toBeInTheDocument();
  });
});
