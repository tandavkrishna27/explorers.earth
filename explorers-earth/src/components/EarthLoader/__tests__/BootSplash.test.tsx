import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "../../../i18n";
import { BootSplash } from "..";

vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
  matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
  addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
}));

describe("BootSplash", () => {
  it("shows one Earth status with the boot message and marks itself as the boot owner", () => {
    const { container } = render(<BootSplash />);
    expect(screen.getAllByRole("status", { name: "Earth loading" })).toHaveLength(1);
    expect(screen.getByText("Getting your recommendations ready…")).toBeInTheDocument();
    expect(container.querySelector('[data-loader-owner="boot"]')).not.toBeNull();
  });
});
