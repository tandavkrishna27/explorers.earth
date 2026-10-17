import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MusicNavLimitNotice from "../MusicNavLimitNotice";

describe("MusicNavLimitNotice", () => {
  it("names the omitted destination and links to pin reordering", () => {
    render(<MusicNavLimitNotice maxSlots={5} />);
    expect(screen.getByRole("status")).toHaveTextContent("Music is enabled but excluded from your 5-item public navigation limit.");
    expect(screen.getByRole("link", { name: "Reorder pinned navigation" })).toHaveAttribute("href", "/settings#public-navigation");
  });
});
