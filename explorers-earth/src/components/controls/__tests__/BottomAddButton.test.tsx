import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BottomAddButton } from "../BottomAddButton";

const device = vi.hoisted(() => ({ isDesktop: false }));
vi.mock("../../../hooks/useDeviceDetection", () => ({ default: () => ({ isDesktop: device.isDesktop }) }));

function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  act(() => {
    fireEvent.scroll(window);
  });
}

beforeEach(() => {
  device.isDesktop = false;
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

afterEach(() => {
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

describe("BottomAddButton", () => {
  it("renders a full-width 56px button on phones and calls onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<BottomAddButton label="New list" onClick={onClick} />);
    const button = screen.getByRole("button", { name: "New list" });
    expect(button).toHaveTextContent("＋ New list");
    expect(button.className).toContain("h-14");
    expect(button.className).toContain("w-full");
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders nothing on desktop", () => {
    device.isDesktop = true;
    const { container } = render(<BottomAddButton label="Add item" onClick={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when hidden (Share/Manage tabs, empty list)", () => {
    const { container } = render(<BottomAddButton label="Add item" onClick={vi.fn()} hidden />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shrinks to 44px on scroll down and restores on scroll up", () => {
    render(<BottomAddButton label="Add item" onClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Add item" });
    scrollTo(200);
    expect(button).toHaveAttribute("data-compact", "true");
    expect(button.className).toContain("h-11");
    scrollTo(120);
    expect(button).toHaveAttribute("data-compact", "false");
    expect(button.className).toContain("h-14");
  });

  it("does not shrink for a tiny scroll near the top", () => {
    render(<BottomAddButton label="Add item" onClick={vi.fn()} />);
    scrollTo(8);
    expect(screen.getByRole("button", { name: "Add item" })).toHaveAttribute("data-compact", "false");
  });

  it("stops listening when unmounted", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<BottomAddButton label="Add item" onClick={vi.fn()} />);
    unmount();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    remove.mockRestore();
  });

  it("is fixed above the bottom nav and the safe area, with RTL-safe padding", () => {
    render(<BottomAddButton label="Add to Day 2" onClick={vi.fn()} />);
    const bar = screen.getByTestId("bottom-add-bar");
    expect(bar.className).toContain("fixed");
    expect(bar.className).toContain("inset-x-0");
    // --bottom-nav-height is set by WP1 (ruling R2) and already includes env(safe-area-inset-bottom).
    expect(bar.style.bottom).toBe("var(--bottom-nav-height, 64px)");
    expect(bar.className).not.toContain("bottom-[");
    expect(bar.className).toContain("ps-[max(12px,env(safe-area-inset-left,0px))]");
    expect(bar.className).toContain("pe-[max(12px,env(safe-area-inset-right,0px))]");
    expect(bar.className).not.toContain("fixed inset-0");
  });
});
