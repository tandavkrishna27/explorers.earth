import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import StarRating from "../StarRating";

const setup = (value: number | null = null) => {
  const onChange = vi.fn();
  render(<StarRating value={value} onChange={onChange} label="Your rating" />);
  return { onChange, slider: screen.getByRole("slider", { name: "Your rating" }) };
};

describe("StarRating", () => {
  it("exposes the stored value as stars for screen readers", () => {
    const { slider } = setup(7);
    expect(slider).toHaveAttribute("aria-valuetext", "3.5 of 5 stars");
    expect(slider).toHaveAttribute("aria-valuenow", "7");
  });

  it("left half of star 3 stores 5, right half stores 6", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "2.5 stars" }));
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.click(screen.getByRole("button", { name: "3 stars" }));
    expect(onChange).toHaveBeenLastCalledWith(6);
  });

  it("tapping the current value clears it", () => {
    const { onChange } = setup(6);
    fireEvent.click(screen.getByRole("button", { name: "3 stars" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("arrow keys step half a star, Home/End clear and max", () => {
    const { onChange, slider } = setup(4);
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(slider, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.keyDown(slider, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it("is read-only when disabled", () => {
    const onChange = vi.fn();
    render(<StarRating value={4} onChange={onChange} label="r" disabled />);
    fireEvent.click(screen.getByRole("button", { name: "1 stars" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
