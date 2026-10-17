import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UnpublishCategoryDialog } from "../UnpublishCategoryDialog";

describe("UnpublishCategoryDialog", () => {
  it("explains the pinned-navigation consequence and restores focus after cancellation", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "Places public visibility";
    document.body.append(trigger);
    trigger.focus();
    render(<UnpublishCategoryDialog open categoryName="Places" pending={false} onCancel={onCancel} onConfirm={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Unpublish Places" });
    expect(dialog).toHaveTextContent("removed from your public navigation");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("does not close while the confirmed unpublish is pending", () => {
    const onCancel = vi.fn();
    render(<UnpublishCategoryDialog open categoryName="Places" pending onCancel={onCancel} onConfirm={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Unpublishing Places" })).toBeDisabled();
  });

  it("keeps keyboard focus inside the dialog", () => {
    render(<UnpublishCategoryDialog open categoryName="Places" pending={false} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Unpublish Places" });

    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(cancel).toHaveFocus();
  });
});
