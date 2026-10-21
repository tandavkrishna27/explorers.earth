import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import DialogPanel from "../../components/ui/DialogPanel";

function Harness({ opener = "Save & Publish" }: { opener?: string }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  return (
    <main aria-label="settings">
      <form>
        <button type="button" disabled={saving} onClick={() => { setSaving(true); setOpen(true); }}>
          {opener}
        </button>
        <button type="button" onClick={() => setSaving(false)}>Finish save</button>
      </form>
      {open && (
        <DialogPanel onClose={() => setOpen(false)}>
          <h2>Change username?</h2>
          <button type="button" onClick={() => setOpen(false)}>Confirm</button>
        </DialogPanel>
      )}
    </main>
  );
}

describe("useDialogA11y focus restoration (XC-02)", () => {
  it("never leaves focus on body while the opener is disabled, then returns to it once enabled", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: /save & publish/i });
    opener.focus();
    await act(async () => { opener.click(); });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toBeDisabled();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(opener.closest("form"));

    await act(async () => { screen.getByRole("button", { name: "Finish save" }).click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
    expect(opener).toBeEnabled();
    expect(opener).toHaveFocus();
  });

  it("does not steal focus from where the user went while the opener stayed disabled", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: /save & publish/i });
    opener.focus();
    await act(async () => { opener.click(); });
    await user.keyboard("{Escape}");
    const other = screen.getByRole("button", { name: "Finish save" });
    other.focus();
    await act(async () => { other.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
    expect(opener).toBeEnabled();
    expect(other).toHaveFocus();
  });
});
