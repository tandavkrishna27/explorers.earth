import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttachListPicker } from "../AttachListPicker";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string, d: string) => (k.startsWith("dashboard.wp1.back.categories.") ? d.charAt(0).toUpperCase() + d.slice(1) : d) }) }));

const self = { id: "11111111-1111-4111-8111-111111111111", category: "places", title: "Paris" };
const lists = [self,
  { id: "22222222-2222-4222-8222-222222222222", category: "books", title: "Reads" },
  { id: "33333333-3333-4333-8333-333333333333", category: "people", title: "Guides in Paris" }];

describe("AttachListPicker (LNK-02, LNK-06)", () => {
  it("never offers a sample list (WP11)", () => {
    render(<AttachListPicker open lists={[...lists, { id: "44444444-4444-4444-8444-444444444444", category: "books", title: "Sample reads", isSample: true }]}
      isAttachable={(l) => l.id !== self.id} onPick={vi.fn()} onCreateNew={vi.fn()} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: /^Reads$/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Sample reads/ })).toBeNull();
  });

  it("lists only own attachable lists, grouped by category, never itself", () => {
    render(<AttachListPicker open lists={lists} isAttachable={(l) => l.id !== self.id && l.id !== lists[2].id} onPick={vi.fn()} onCreateNew={vi.fn()} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("option", { name: /^Paris$/ })).toBeNull();
    expect(screen.getByRole("option", { name: /Reads/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Guides in Paris/ })).toBeNull();
    expect(screen.getByRole("group", { name: "Books" })).toBeInTheDocument();
  });

  it("filters by typed text and picks", () => {
    const onPick = vi.fn();
    render(<AttachListPicker open lists={lists} isAttachable={() => true} onPick={onPick} onCreateNew={vi.fn()} onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a list" }), { target: { value: "rea" } });
    expect(screen.queryByRole("option", { name: /Paris/ })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /Reads/ }));
    expect(onPick).toHaveBeenCalledWith(lists[1]);
  });

  it("offers Create a new list in a chosen category", () => {
    const onCreateNew = vi.fn();
    render(<AttachListPicker open lists={[]} isAttachable={() => true} onPick={vi.fn()} onCreateNew={onCreateNew} onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Category for the new list" }), { target: { value: "products" } });
    fireEvent.click(screen.getByRole("button", { name: "Create a new list" }));
    expect(onCreateNew).toHaveBeenCalledWith("products");
  });

  it("renders nothing when closed", () => {
    const { container } = render(<AttachListPicker open={false} lists={lists} isAttachable={() => true} onPick={vi.fn()} onCreateNew={vi.fn()} onOpenChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  // index.css sets `.grid { max-width: 100% }` after the utilities, which overrode max-w-lg
  // and stretched the dialog across a 1440px viewport. The dialog must not be a .grid box.
  it("keeps its max width: the dialog is not a .grid box", () => {
    render(<AttachListPicker open lists={lists} isAttachable={() => true} onPick={vi.fn()} onCreateNew={vi.fn()} onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Attach a list" });
    expect(dialog).toHaveClass("max-w-lg");
    expect(dialog).not.toHaveClass("grid");
  });
});
