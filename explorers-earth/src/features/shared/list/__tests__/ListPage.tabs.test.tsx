import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, d: string | { defaultValue?: string }) => (typeof d === "string" ? d : d?.defaultValue ?? _k) }) }));
import ListPage from "../ListPage";
import { adapterFixture } from "./adapterFixture";

describe("ListPage tabs", () => {
  it("mounts each tab once and never remounts on switch", () => {
    const mounts = { recs: 0, share: 0, manage: 0 };
    render(<MemoryRouter><ListPage adapter={adapterFixture()} onMount={(tab) => { mounts[tab]++; }} /></MemoryRouter>);
    for (const name of ["Share", "Manage", "Recommendations", "Share"]) fireEvent.click(screen.getByRole("tab", { name }));
    expect(mounts).toEqual({ recs: 1, share: 1, manage: 1 });
  });

  it("hidden panels stay in the DOM but are hidden from assistive tech", () => {
    render(<MemoryRouter><ListPage adapter={adapterFixture()} /></MemoryRouter>);
    expect(screen.getByRole("tabpanel", { name: "Recommendations" })).toBeVisible();
    expect(document.getElementById("list-tab-share")).toHaveAttribute("hidden");
  });

  it("arrow keys move between tabs (roving tabindex)", () => {
    render(<MemoryRouter><ListPage adapter={adapterFixture()} /></MemoryRouter>);
    const recs = screen.getByRole("tab", { name: "Recommendations" });
    fireEvent.keyDown(recs, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Share" })).toHaveAttribute("aria-selected", "true");
  });

  it("header shows back, the list name and the publish pill top right", () => {
    render(<MemoryRouter><ListPage adapter={adapterFixture()} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: /Back to Movies & Shows/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Comfort movies" })).toBeInTheDocument();
    expect(document.querySelector("[aria-haspopup=\"menu\"]")).toBeInTheDocument(); // WP2 PublishPill
  });

  it("an error shows a retry row instead of an empty page (OWN-19 rule)", () => {
    const retry = vi.fn();
    render(<MemoryRouter><ListPage adapter={adapterFixture({ list: null, error: new Error("x"), retry })} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
  });
});
