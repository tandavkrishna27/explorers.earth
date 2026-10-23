import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, d: string | { defaultValue?: string }, o?: Record<string, string>) => (typeof d === "string" ? d : d?.defaultValue ?? _k).replace(/{{(\w+)}}/g, (_m, k) => o?.[k] ?? `{{${k}}}`) }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
import RecommendationsTab from "../RecommendationsTab";
import { adapterFixture } from "./adapterFixture";

const view = (over = {}) => { const a = adapterFixture(over); render(<MemoryRouter><RecommendationsTab adapter={a} active /></MemoryRouter>); return a; };

describe("RecommendationsTab", () => {
  it("empty list shows one big centred Add CTA and no bottom button", () => {
    view({ items: [] });
    expect(screen.getByRole("button", { name: "＋ Add movie" })).toBeInTheDocument();
    expect(screen.queryByTestId("bottom-add")).toBeNull();
  });

  it("items have a grip, a pin star and a ⋯ menu; no per-item publish", () => {
    view();
    expect(screen.getAllByRole("button", { name: /Drag .* to reorder/ })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /Pin .* to Top Picks/ })).toHaveLength(3);
    expect(screen.queryByText(/Publish/)).toBeNull();
  });

  it("keyboard reorder saves immediately and toasts Order saved", async () => {
    const a = view();
    const grip = screen.getAllByRole("button", { name: /Drag .* to reorder/ })[0];
    fireEvent.keyDown(grip, { key: " " }); fireEvent.keyDown(grip, { key: "ArrowDown" }); fireEvent.keyDown(grip, { key: " " });
    await waitFor(() => expect(a.reorder).toHaveBeenCalledWith(["i2", "i1", "i3"]));
    expect(toast.success).toHaveBeenCalledWith("Order saved");
  });

  it("a failed reorder snaps back and offers retry", async () => {
    const a = view();
    a.reorder.mockRejectedValueOnce(new Error("409"));
    const grip = screen.getAllByRole("button", { name: /Drag .* to reorder/ })[0];
    fireEvent.keyDown(grip, { key: " " }); fireEvent.keyDown(grip, { key: "ArrowDown" }); fireEvent.keyDown(grip, { key: " " });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save the order", expect.objectContaining({ action: expect.anything() })));
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Item one");
  });

  it("⋯ menu offers Edit and Remove from list", () => {
    const a = view();
    fireEvent.click(screen.getAllByRole("button", { name: /More actions/ })[0]);
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from list" }));
    expect(a.removeItem).toHaveBeenCalledWith("i1");
  });

  it("shows an item's note preview under the subtitle when present (UAT BKS-X01)", () => {
    const base = adapterFixture().items;
    view({ items: [{ ...base[0], note: "Watch it on a rainy day" }, base[1]] });
    const note = screen.getByText("Watch it on a rainy day");
    expect(note).toHaveClass("line-clamp-1");
    expect(screen.getAllByRole("listitem")[1].querySelector(".line-clamp-1")).toBeNull();
  });

  it("pin toggles", () => {
    const a = view();
    fireEvent.click(screen.getAllByRole("button", { name: /Pin .* to Top Picks/ })[0]);
    expect(a.togglePin).toHaveBeenCalledWith("i1", true);
  });

  it("a failed pin or remove shows the thrown message as an error toast", async () => {
    const a = view();
    a.togglePin.mockRejectedValueOnce(new Error("You can pin up to 15"));
    fireEvent.click(screen.getAllByRole("button", { name: /Pin .* to Top Picks/ })[0]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("You can pin up to 15"));
    a.removeItem.mockRejectedValueOnce(new Error("Remove failed"));
    fireEvent.click(screen.getAllByRole("button", { name: /More actions/ })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from list" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Remove failed"));
  });
});
