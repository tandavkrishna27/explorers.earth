import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import UsernameChangeConfirmationModal from "../UsernameChangeConfirmationModal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function Harness({ onConfirm = () => {} }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <button type="button">Behind</button>
      <UsernameChangeConfirmationModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
        newUsername="new-handle"
        cooldownDays={30}
      />
    </>
  );
}

describe("UsernameChangeConfirmationModal accessibility (XC-02)", () => {
  it("is a labelled modal dialog with focus inside", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "modal.usernameChange.title" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByText("explorers.earth/new-handle")).toBeInTheDocument();
  });

  it("keeps Tab inside the dialog, closes on Escape and restores focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("confirms via the confirm button and uses theme tokens rather than fixed light-grey colours", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const title = screen.getByRole("heading", { name: "modal.usernameChange.title" });
    expect(title.className).toContain("text-dashboard");
    expect(document.querySelector(".bg-gray-50")).toBeNull();
    await user.click(screen.getByRole("button", { name: "modal.usernameChange.confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
