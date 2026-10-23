import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, d: string) => d }) }));
import StickyActionBar from "../StickyActionBar";

describe("StickyActionBar", () => {
  const base = { onCancel: vi.fn(), onSave: vi.fn(), onSaveAndAddAnother: vi.fn(), saving: null as null | "save" | "another", canSave: true };

  it("renders Cancel, Save and add another, Save in a sticky bar", () => {
    render(<StickyActionBar {...base} />);
    const bar = screen.getByRole("toolbar", { name: "Item actions" });
    expect(bar.className).toContain("sticky");
    expect(bar.className).toContain("bottom-0");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Cancel", "Save and add another", "Save"]);
  });

  it("shows the spinner only inside the pressed button and blocks double submit", () => {
    render(<StickyActionBar {...base} saving="another" />);
    expect(screen.getByRole("button", { name: /Save and add another/ })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
    expect(screen.queryByRole("status")).toBeNull(); // no full-screen overlay
  });

  it("hides Save and add another when editing", () => {
    render(<StickyActionBar {...base} onSaveAndAddAnother={undefined} />);
    expect(screen.queryByRole("button", { name: "Save and add another" })).toBeNull();
  });

  it("Save disabled until the form can save", () => {
    render(<StickyActionBar {...base} canSave={false} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
