import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Accordion from "../Accordian";

describe("Accordion", () => {
  const scrollTo = vi.fn();
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("scrollTo", scrollTo);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    scrollTo.mockReset();
    scrollIntoView.mockReset();
  });

  it("renders a flat divider row without the contained card treatment", () => {
    render(
      <Accordion heading="Profile details" variant="flat">
        <p>Editor fields</p>
      </Accordion>,
    );

    const row = screen.getByRole("button", { name: "Profile details" })
      .parentElement;
    expect(row).not.toHaveClass("border");
    expect(row).not.toHaveClass("rounded-xl");
    expect(row).toHaveClass("border-b");
  });

  it("rounds the flat hover surface and coordinates its open corners", () => {
    render(
      <Accordion heading="Bio" variant="flat">
        <p>Editor fields</p>
      </Accordion>,
    );

    const trigger = screen.getByRole("button", { name: "Bio" });
    expect(trigger).toHaveClass("rounded-lg");
    expect(trigger).not.toHaveClass("rounded-none");

    fireEvent.click(trigger);
    expect(trigger).toHaveClass("rounded-t-lg");
    expect(trigger).not.toHaveClass("rounded-lg");
  });

  it("keeps unique aria-controls IDs stable through open and closed state changes", () => {
    const { rerender } = render(
      <>
        <Accordion heading="Repeated heading">First fields</Accordion>
        <Accordion heading="Repeated heading">Second fields</Accordion>
      </>,
    );

    const buttons = screen.getAllByRole("button", { name: "Repeated heading" });
    const controls = buttons.map((button) => button.getAttribute("aria-controls"));
    expect(new Set(controls).size).toBe(2);
    expect(buttons[0]).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(controls[0]!)).toHaveAttribute("hidden");

    fireEvent.click(buttons[0]);
    expect(buttons[0]).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(controls[0]!)).not.toHaveAttribute("hidden");

    fireEvent.click(buttons[0]);
    expect(buttons[0]).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(controls[0]!)).toHaveAttribute("hidden");

    rerender(
      <>
        <Accordion heading="Repeated heading">First fields</Accordion>
        <Accordion heading="Repeated heading">Second fields</Accordion>
      </>,
    );
    expect(screen.getAllByRole("button", { name: "Repeated heading" })[0])
      .toHaveAttribute("aria-controls", controls[0]!);
  });

  it("does not force the document to scroll when a section opens", () => {
    render(
      <Accordion heading="Social links">Visible editor fields</Accordion>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Social links" }));
    act(() => vi.advanceTimersByTime(500));

    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
