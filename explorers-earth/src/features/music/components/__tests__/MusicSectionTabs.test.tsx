import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { MusicSectionTabs, type MusicSection } from "../MusicSectionTabs";

function Harness() {
  const [value, setValue] = useState<MusicSection>("playlists");
  return <MusicSectionTabs value={value} onChange={setValue} />;
}

describe("MusicSectionTabs", () => {
  it("orders Playlists before Live and supports keyboard selection", () => {
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Playlists", "Live"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[1], { key: "Home" });
    expect(tabs[0]).toHaveFocus();
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });
});
