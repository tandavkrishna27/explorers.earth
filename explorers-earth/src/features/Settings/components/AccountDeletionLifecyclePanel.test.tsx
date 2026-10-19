import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AccountDeletionLifecyclePanel from "./AccountDeletionLifecyclePanel";

const lifecycle = (status: "active" | "pending_deletion" | "deleted") => ({
  accountId: "account-a", status, operationId: status === "active" ? null : "operation-a", revision: 2,
});

describe("AccountDeletionLifecyclePanel", () => {
  it("offers pending-deletion cancellation only through fresh Google recovery", () => {
    const onCancel = vi.fn(); const onRetry = vi.fn();
    render(<AccountDeletionLifecyclePanel status={lifecycle("pending_deletion")} onCancel={onCancel} onRetry={onRetry} />);
    expect(screen.getByRole("status")).toHaveTextContent(/access is paused/i);
    fireEvent.click(screen.getByRole("button", { name: /cancel deletion with Google/i }));
    fireEvent.click(screen.getByRole("button", { name: /check deletion status/i }));
    expect(onCancel).toHaveBeenCalledOnce(); expect(onRetry).toHaveBeenCalledOnce();
  });
  it("shows the scheduled deletion date only when the lifecycle carries a usable one", () => {
    const { rerender } = render(<AccountDeletionLifecyclePanel
      status={{ ...lifecycle("pending_deletion"), scheduledDeletionAt: "2026-11-18T00:00:00.000Z" }} onCancel={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole("status").querySelectorAll("p")).toHaveLength(2);
    rerender(<AccountDeletionLifecyclePanel status={lifecycle("pending_deletion")} onCancel={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole("status").querySelectorAll("p")).toHaveLength(1);
  });
  it("shows terminal completion without another destructive action", () => {
    render(<AccountDeletionLifecyclePanel status={lifecycle("deleted")} onCancel={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(/complete/i);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("shows no deletion workflow for an active account", () => {
    render(<AccountDeletionLifecyclePanel status={lifecycle("active")} onCancel={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
