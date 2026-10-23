import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { englishI18n } from "../../../../test/englishI18n";
import { BottomAddButton, PublishPill } from "../controls";

const wrap = (ui: React.ReactElement) => render(<I18nextProvider i18n={englishI18n}>{ui}</I18nextProvider>);

describe("controls stub (WP2 interface)", () => {
  it("category pill shows the current state, opens a menu with ticks, and reports the choice", async () => {
    const onChange = vi.fn();
    wrap(<PublishPill kind="category" value="hidden" categoryLabel="Movies & Shows" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: /🔒 Hidden/ });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await userEvent.click(trigger);
    expect(screen.getByRole("menuitemradio", { name: /🔒 Hidden/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("menuitemradio", { name: /🌐 Public/ }));
    expect(onChange).toHaveBeenCalledWith("public");
  });
  it("list pill shows Private as disabled coming soon", async () => {
    wrap(<PublishPill kind="list" value="draft" privateComingSoon onChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /✎ Draft/ }));
    expect(screen.getByRole("menuitemradio", { name: /👥 Private/ })).toHaveAttribute("aria-disabled", "true");
  });
  it("bottom button renders the label and hides when asked", () => {
    const { rerender } = wrap(<BottomAddButton label="New list" onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "＋ New list" })).toBeInTheDocument();
    rerender(<I18nextProvider i18n={englishI18n}><BottomAddButton label="New list" onClick={() => {}} hidden /></I18nextProvider>);
    expect(screen.queryByRole("button", { name: "＋ New list" })).toBeNull();
  });
});
