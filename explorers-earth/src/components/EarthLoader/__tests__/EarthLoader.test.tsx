import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import EarthLoader from "../EarthLoader";

const setReducedMotion = (matches: boolean) => {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" && matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

describe("EarthLoader", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("exposes exactly one stable named status and hides all decoration", () => {
    setReducedMotion(false);

    const { container } = render(
      <EarthLoader statusMessage="Preparing explorer profile" />,
    );

    expect(screen.getAllByRole("status", { name: /earth/i })).toHaveLength(1);
    expect(screen.getByRole("status", { name: /earth/i })).toHaveTextContent(
      "Preparing explorer profile",
    );
    expect(container.querySelector(".earth-loader")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(container.querySelector(".earth-loader__plane-img")).toHaveAttribute(
      "alt",
      "",
    );
  });

  it("does not start a text carousel or animation frames under reduced motion", () => {
    vi.useFakeTimers();
    setReducedMotion(true);
    const intervalSpy = vi.spyOn(globalThis, "setInterval");
    const frameSpy = vi.spyOn(globalThis, "requestAnimationFrame");

    const { container } = render(<EarthLoader context="profile" />);

    const status = screen.getByRole("status", { name: /earth/i });
    const initialText = status.textContent;
    vi.advanceTimersByTime(10_000);

    expect(intervalSpy).not.toHaveBeenCalled();
    expect(frameSpy).not.toHaveBeenCalled();
    expect(status).toHaveTextContent(initialText ?? "");
    expect(container.querySelector(".earth-loader__plane-img")).not.toBeInTheDocument();
    expect(container.querySelector(".earth-loader__plane-static")).toBeInTheDocument();
    expect(container.querySelector(".earth-loader__earth-static")).toBeInTheDocument();
  });

  it("disables globe, plane, and text motion in reduced-motion CSS", () => {
    const cssPath = resolve(
      process.cwd(),
      "src/components/EarthLoader/EarthLoader.css",
    );
    const css = readFileSync(cssPath, "utf8");
    const reducedMotionBlock = css.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}\s*$/,
    )?.[1];

    expect(reducedMotionBlock).toBeDefined();
    expect(reducedMotionBlock).toMatch(/\.earth-loader__plane-img/);
    expect(reducedMotionBlock).toMatch(/\.earth-loader__earth/);
    expect(reducedMotionBlock).toMatch(/\.earth-loader__text/);
    expect(reducedMotionBlock).toMatch(/animation:\s*none\s*!important/);
    expect(reducedMotionBlock).toMatch(/transition:\s*none\s*!important/);
  });
});
