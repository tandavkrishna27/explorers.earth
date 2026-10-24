import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, d: string) => d }) }));
import TaxonomyCombobox from "../TaxonomyCombobox";
import type { TaxonomyTerm } from "../taxonomyFilter";

const terms: TaxonomyTerm[] = [
  { id: "r1", parentId: null, position: 0, label: "Food & Drink" },
  { id: "r2", parentId: null, position: 1, label: "Nature" },
  { id: "c1", parentId: "r1", position: 0, label: "Café" },
  { id: "c3", parentId: "r2", position: 0, label: "Beach" },
];

describe("TaxonomyCombobox", () => {
  it("types to filter and picks with the keyboard", () => {
    const onChange = vi.fn();
    render(<TaxonomyCombobox terms={terms} levels={2} value={{ categoryId: null, subcategoryId: null }} onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Category" });
    fireEvent.change(input, { target: { value: "nat" } });
    const list = screen.getByRole("listbox");
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["Nature"]);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ categoryId: "r2", subcategoryId: null });
  });

  it("subcategory is disabled until a category, and lists only its children", () => {
    const { rerender } = render(<TaxonomyCombobox terms={terms} levels={2} value={{ categoryId: null, subcategoryId: null }} onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Subcategory" })).toBeDisabled();
    rerender(<TaxonomyCombobox terms={terms} levels={2} value={{ categoryId: "r1", subcategoryId: null }} onChange={vi.fn()} />);
    const sub = screen.getByRole("combobox", { name: "Subcategory" });
    fireEvent.focus(sub);
    expect(within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Café"]);
  });

  it("changing category clears the subcategory", () => {
    const onChange = vi.fn();
    render(<TaxonomyCombobox terms={terms} levels={2} value={{ categoryId: "r1", subcategoryId: "c1" }} onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Category" });
    fireEvent.change(input, { target: { value: "Nature" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: "Nature" }));
    expect(onChange).toHaveBeenCalledWith({ categoryId: "r2", subcategoryId: null });
  });

  it("keeps a stored term that is no longer in the catalog", () => {
    render(<TaxonomyCombobox terms={terms} levels={1} value={{ categoryId: "gone", subcategoryId: null }} storedLabels={{ gone: "Old term" }} onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue("Old term (no longer available)");
  });

  it("Escape closes and restores the selected label", () => {
    render(<TaxonomyCombobox terms={terms} levels={1} value={{ categoryId: "r1", subcategoryId: null }} onChange={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Category" });
    fireEvent.change(input, { target: { value: "zz" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("Food & Drink");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
