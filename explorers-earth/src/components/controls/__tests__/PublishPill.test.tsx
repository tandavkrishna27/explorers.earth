import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../../test/englishI18n";
import { PublishPill, publishPillOptions } from "../PublishPill";

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }));

beforeEach(() => {
  toastSuccess.mockReset();
});

describe("PublishPill closed state (three kinds, one component)", () => {
  it("category public reads 🌐 Public and is a menu button that announces its state", () => {
    render(<PublishPill kind="category" value="public" categoryName="Movies" onChange={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Visibility: Public" });
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveTextContent("🌐Public▾");
  });

  it("category hidden reads 🔒 Hidden", () => {
    render(<PublishPill kind="category" value="hidden" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Visibility: Hidden" })).toHaveTextContent("🔒Hidden▾");
  });

  it("list draft reads ✎ Draft and guide public reads 🌐 Public", () => {
    render(
      <>
        <PublishPill kind="list" value="draft" onChange={vi.fn()} />
        <PublishPill kind="guide" value="public" onChange={vi.fn()} />
      </>,
    );
    expect(screen.getByRole("button", { name: "Visibility: Draft" })).toHaveTextContent("✎Draft▾");
    expect(screen.getByRole("button", { name: "Visibility: Public" })).toHaveTextContent("🌐Public▾");
  });

  it("renders the same pill shell for every kind, with a 44px target", () => {
    render(
      <>
        <PublishPill kind="category" value="hidden" onChange={vi.fn()} />
        <PublishPill kind="list" value="draft" onChange={vi.fn()} />
        <PublishPill kind="guide" value="draft" onChange={vi.fn()} />
      </>,
    );
    const shells = screen.getAllByRole("button").map((b) => b.className);
    expect(new Set(shells).size).toBe(1);
    expect(shells[0]).toContain("min-h-[44px]");
    expect(shells[0]).toContain("rounded-full");
  });
});

describe("PublishPill menu", () => {
  it("category menu: two options, current ticked, one-line explanation each", async () => {
    const user = userEvent.setup();
    render(<PublishPill kind="category" value="public" categoryName="Movies" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Visibility: Public" }));
    const menu = screen.getByRole("menu");
    expect(screen.getByRole("button", { name: "Visibility: Public" })).toHaveAttribute("aria-expanded", "true");
    const items = screen.getAllByRole("menuitemradio");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute("aria-checked", "true");
    expect(items[0]).toHaveTextContent("✓🌐 PublicMovies shows on your profile");
    expect(items[1]).toHaveAttribute("aria-checked", "false");
    expect(items[1]).toHaveTextContent("🔒 HiddenNot on your profile; your public lists still work by link");
    expect(menu).toContainElement(items[0]);
  });

  it("category menu without a category name uses the generic explanation", async () => {
    const user = userEvent.setup();
    render(<PublishPill kind="category" value="hidden" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Visibility: Hidden" }));
    expect(screen.getAllByRole("menuitemradio")[0]).toHaveTextContent("Shows on your profile");
  });

  it("list menu: Draft, Public and a disabled Private (coming soon)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PublishPill kind="list" value="draft" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Visibility: Draft" }));
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual([
      "✓✎ DraftOnly you can see it",
      "🌐 PublicAnyone with the link, and on your profile",
      "👥 PrivateComing soonComing soon: only people you invite by email",
    ]);
    expect(items[2]).toHaveAttribute("aria-disabled", "true");
    await user.click(items[2]);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("privateComingSoon={false} hides the Private row", async () => {
    const user = userEvent.setup();
    render(<PublishPill kind="guide" value="draft" privateComingSoon={false} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Visibility: Draft" }));
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(2);
  });

  it("choosing another option calls onChange, toasts, closes and returns focus", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<PublishPill kind="list" value="draft" onChange={onChange} />);
    const button = screen.getByRole("button", { name: "Visibility: Draft" });
    await user.click(button);
    await user.click(screen.getAllByRole("menuitemradio")[1]);
    expect(onChange).toHaveBeenCalledWith("public");
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Now public"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("toasts the category and draft wording from v5", async () => {
    const user = userEvent.setup();
    const onCategory = vi.fn();
    const { unmount } = render(<PublishPill kind="category" value="public" onChange={onCategory} />);
    await user.click(screen.getByRole("button", { name: "Visibility: Public" }));
    await user.click(screen.getAllByRole("menuitemradio")[1]);
    expect(onCategory).toHaveBeenCalledWith("hidden");
    await waitFor(() => expect(toastSuccess).toHaveBeenLastCalledWith("Hidden from your profile"));
    unmount();
    const onList = vi.fn();
    render(<PublishPill kind="list" value="public" onChange={onList} />);
    await user.click(screen.getByRole("button", { name: "Visibility: Public" }));
    await user.click(screen.getAllByRole("menuitemradio")[0]);
    expect(onList).toHaveBeenCalledWith("draft");
    await waitFor(() => expect(toastSuccess).toHaveBeenLastCalledWith("Back to draft"));
  });

  it("choosing the current option only closes the menu", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PublishPill kind="list" value="draft" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Visibility: Draft" }));
    await user.click(screen.getAllByRole("menuitemradio")[0]);
    expect(onChange).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("a failed change does not toast and leaves the pill usable", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockRejectedValue(new Error("network"));
    render(<PublishPill kind="list" value="draft" onChange={onChange} />);
    const button = screen.getByRole("button", { name: "Visibility: Draft" });
    await user.click(button);
    await user.click(screen.getAllByRole("menuitemradio")[1]);
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("is busy while the change is in flight and ignores clicks", async () => {
    const user = userEvent.setup();
    let resolve: () => void = () => {};
    const onChange = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    render(<PublishPill kind="list" value="draft" onChange={onChange} />);
    const button = screen.getByRole("button", { name: "Visibility: Draft" });
    await user.click(button);
    await user.click(screen.getAllByRole("menuitemradio")[1]);
    expect(button).toHaveAttribute("aria-busy", "true");
    await user.click(button);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    resolve();
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
  });

  it("closes on an outside click without changing anything", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <>
        <p>outside</p>
        <PublishPill kind="list" value="draft" onChange={onChange} />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Visibility: Draft" }));
    await user.click(screen.getByText("outside"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("PublishPill keyboard and screen reader", () => {
  it("Enter opens with focus on the ticked option; arrows wrap; Enter selects", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PublishPill kind="list" value="public" onChange={onChange} />);
    await user.tab();
    expect(screen.getByRole("button", { name: "Visibility: Public" })).toHaveFocus();
    await user.keyboard("{Enter}");
    const items = screen.getAllByRole("menuitemradio");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[2]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(items[2]).toHaveFocus();
    await user.keyboard("{Home}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("draft");
  });

  it("ArrowDown on the closed button opens the menu; Escape closes and restores focus", async () => {
    const user = userEvent.setup();
    render(<PublishPill kind="category" value="hidden" onChange={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Visibility: Hidden" });
    button.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitemradio")[1]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("Space on a disabled Private row does nothing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PublishPill kind="list" value="draft" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Visibility: Draft" }));
    await user.keyboard("{End}");
    expect(screen.getAllByRole("menuitemradio")[2]).toHaveFocus();
    await user.keyboard(" ");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("menu is labelled by the pill button", async () => {
    const user = userEvent.setup();
    render(<PublishPill kind="guide" value="draft" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Visibility: Draft" }));
    expect(screen.getByRole("menu", { name: "Visibility: Draft" })).toBeInTheDocument();
  });

  it("disabled pill stays focusable, explains why, and does not open", async () => {
    const user = userEvent.setup();
    render(
      <PublishPill kind="list" value="draft" disabled disabledReason="Samples can't be published" onChange={vi.fn()} />,
    );
    const button = screen.getByRole("button", { name: "Visibility: Draft" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Samples can't be published");
    await user.click(button);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("uses logical (RTL-safe) placement for the menu", async () => {
    const user = userEvent.setup();
    render(<PublishPill kind="list" value="draft" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Visibility: Draft" }));
    expect(screen.getByRole("menu").className).toContain("end-0");
    expect(screen.getByRole("menu").className).not.toMatch(/\bright-0\b/);
  });
});

describe("publishPillOptions (shared with the CAT-08 card menu)", () => {
  it("lists the options per kind", () => {
    expect(publishPillOptions("category", false).map((o) => o.value)).toEqual(["public", "hidden"]);
    expect(publishPillOptions("list", true).map((o) => o.value)).toEqual(["draft", "public", "private"]);
    expect(publishPillOptions("guide", false).map((o) => o.value)).toEqual(["draft", "public"]);
    expect(publishPillOptions("list", true)[2].comingSoon).toBe(true);
  });
});
