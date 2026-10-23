import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LinkedListsPanel } from "../LinkedListsPanel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, d: string, o?: Record<string, string>) => d.replace(/{{(\w+)}}/g, (_m, k) => o?.[k] ?? "") }) }));

const card = { linkId: "a2222222-2222-4222-8222-222222222222", direction: "outgoing", role: null, displayOrder: 0,
  collection: { id: "22222222-2222-4222-8222-222222222222", category: "products", title: "Packing", slug: "packing", visibility: "private", publicationState: "draft", archived: false, coverMediaId: null } } as const;

function links(overrides = {}) {
  return { attach: vi.fn(), detach: vi.fn(async () => vi.fn(async () => undefined)), setRole: vi.fn(async () => undefined), isAttachable: () => true, busy: false, ...overrides };
}

describe("LinkedListsPanel", () => {
  it("detaches and offers Undo in the toast (OWN-13)", async () => {
    const l = links(); const toast = vi.fn();
    render(<LinkedListsPanel linkedLists={[card]} links={l as never} onToast={toast} onAttach={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Detach Packing" }));
    await waitFor(() => expect(l.detach).toHaveBeenCalledWith(card));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Packing"), actionLabel: "Undo", onAction: expect.any(Function) })));
  });

  it("reports a failed detach instead of offering Undo", async () => {
    const l = links({ detach: vi.fn(async () => { throw new Error("This changed in another tab"); }) }); const toast = vi.fn();
    render(<LinkedListsPanel linkedLists={[card]} links={l as never} onToast={toast} onAttach={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Detach Packing" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: "This changed in another tab", error: true })));
  });

  it("marks an archived linked list instead of hiding it", () => {
    render(<LinkedListsPanel linkedLists={[{ ...card, collection: { ...card.collection, archived: true } }]} links={links() as never} onToast={vi.fn()} onAttach={() => undefined} />);
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("opens the picker from Attach and explains the empty state", () => {
    const onAttach = vi.fn();
    render(<LinkedListsPanel linkedLists={[]} links={links() as never} onToast={vi.fn()} onAttach={onAttach} />);
    expect(screen.getByText(/Link another of your lists/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    expect(onAttach).toHaveBeenCalled();
  });

  it("shows role controls only when roles are enabled (guides, LNK-08)", () => {
    const { rerender } = render(<LinkedListsPanel linkedLists={[card]} links={links() as never} onToast={vi.fn()} onAttach={() => undefined} />);
    expect(screen.queryByRole("combobox", { name: "Role for Packing" })).toBeNull();
    rerender(<LinkedListsPanel linkedLists={[card]} links={links() as never} onToast={vi.fn()} onAttach={() => undefined} rolesEnabled />);
    expect(screen.getByRole("combobox", { name: "Role for Packing" })).toBeInTheDocument();
  });

  it("saves a suggested and a free role", async () => {
    const l = links();
    render(<LinkedListsPanel linkedLists={[card]} links={l as never} onToast={vi.fn()} onAttach={() => undefined} rolesEnabled />);
    fireEvent.change(screen.getByRole("combobox", { name: "Role for Packing" }), { target: { value: "Packing list" } });
    await waitFor(() => expect(l.setRole).toHaveBeenCalledWith(card, "Packing list"));
    fireEvent.change(screen.getByRole("combobox", { name: "Role for Packing" }), { target: { value: "__custom" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Custom role for Packing" }), { target: { value: "Day 2 gear" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Custom role for Packing" }));
    await waitFor(() => expect(l.setRole).toHaveBeenCalledWith(card, "Day 2 gear"));
  });
});
