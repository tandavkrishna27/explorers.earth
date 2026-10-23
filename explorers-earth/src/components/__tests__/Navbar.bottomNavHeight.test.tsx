import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Navbar from "../Navbar";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

describe("--bottom-nav-height", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--bottom-nav-height");
    vi.restoreAllMocks();
  });

  it("index.css defaults it on :root to 64px plus the safe-area inset", () => {
    const css = readFileSync(resolve(__dirname, "../../index.css"), "utf8");
    expect(css).toContain("--bottom-nav-height: calc(64px + env(safe-area-inset-bottom, 0px));");
  });

  it("the mounted nav publishes its measured height (viewport bottom minus nav top) and clears it on unmount", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 740 } as DOMRect);
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 812 });
    const { unmount, getByTestId } = render(<MemoryRouter><Navbar /></MemoryRouter>);
    expect(getByTestId("phone-bottom-nav")).toBeTruthy();
    expect(document.documentElement.style.getPropertyValue("--bottom-nav-height")).toBe("72px");
    unmount();
    expect(document.documentElement.style.getPropertyValue("--bottom-nav-height")).toBe("");
  });
});
