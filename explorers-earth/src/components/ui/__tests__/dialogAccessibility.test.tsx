import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import Modal from "../Modal";
import UnsavedChangesModal from "../UnsavedChangesModal";

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <button type="button">Behind</button>
      <Modal isOpen={open} onClose={() => setOpen(false)}>
        <h2>Edit place</h2>
        <input aria-label="Name" />
        <button type="button">Save</button>
      </Modal>
    </>
  );
}

describe("Modal accessibility (XC-02)", () => {
  it("is a labelled modal dialog and moves focus into it", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Edit place" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("keeps Tab and Shift+Tab cycling inside the dialog", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < 8; i++) {
      await user.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("closes on Escape and returns focus to the opener", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("only the innermost of two stacked dialogs reacts to Escape", async () => {
    const user = userEvent.setup();
    const closed: string[] = [];
    render(
      <>
        <Modal isOpen onClose={() => closed.push("outer")}><h2>Outer</h2><button type="button">a</button></Modal>
        <Modal isOpen onClose={() => closed.push("inner")}><h2>Inner</h2><button type="button">b</button></Modal>
      </>,
    );
    await user.keyboard("{Escape}");
    expect(closed).toEqual(["inner"]);
  });
});

describe("UnsavedChangesModal accessibility (XC-02)", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Leave</button>
        <UnsavedChangesModal isOpen={open} onClose={() => setOpen(false)} onSave={() => setOpen(false)} onDiscard={() => setOpen(false)} />
      </>
    );
  }
  it("is a labelled, described alert dialog that traps focus, closes on Esc and restores focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Leave" });
    await user.click(opener);
    const dialog = screen.getByRole("alertdialog", { name: "Unsaved Changes" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(/unsaved changes/i);
    for (let i = 0; i < 7; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
});

describe("global focus indicator (XC-02)", () => {
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
  it("does not suppress every outline or focus box-shadow globally", () => {
    expect(css).not.toMatch(/\*\s*\{\s*outline:\s*none\s*!important/);
    expect(css).not.toMatch(/input:focus[^{]*\{[^}]*box-shadow:\s*none\s*!important/);
  });
  it("defines a :focus-visible indicator for interactive elements", () => {
    expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*2px solid var\(--focus-ring-color\)/);
  });
});
