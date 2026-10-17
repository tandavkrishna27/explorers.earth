import { StrictMode, createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicBlockingOverlay from "../PublicBlockingOverlay";
import { PublicCategoryThemeProvider } from "../PublicCategoryThemeContext";

const categoryStyles = {
  "--category-card": "#102030",
  "--category-text": "#f8fafc",
  "--category-muted": "#cbd5e1",
  "--category-control-border": "#64748b",
};

function overlay(
  onClose = vi.fn(),
  options: { label?: string; category?: boolean; returnFocusRef?: React.RefObject<HTMLElement> } = {},
) {
  const { label = "Place details", category = true, returnFocusRef } = options;
  return (
    <PublicCategoryThemeProvider styles={category ? categoryStyles : null}>
      <div data-testid="content-layer">
        <PublicBlockingOverlay label={label} onClose={onClose} returnFocusRef={returnFocusRef}>
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </PublicBlockingOverlay>
      </div>
    </PublicCategoryThemeProvider>
  );
}

describe("PublicBlockingOverlay", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
    document.body.removeAttribute("inert");
  });

  afterEach(() => {
    document.body.style.overflow = "";
    document.body.removeAttribute("inert");
    document.querySelectorAll(".yarl__root").forEach((node) => node.remove());
    document.querySelectorAll("[data-overlay-test-background]").forEach((node) => node.remove());
  });

  it("portals its dialog outside the public content layer with the required blocking boundary", () => {
    render(overlay());

    const dialog = screen.getByRole("dialog", { name: "Place details" });
    expect(dialog.closest('[data-testid="content-layer"]')).toBeNull();
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveAttribute("data-public-blocking-overlay");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("tabindex", "-1");
    expect(dialog).toHaveStyle({
      position: "fixed",
      inset: "0",
      zIndex: "var(--z-public-modal, 2000)",
    });
  });

  it("copies category variables and legacy place aliases onto the portal root", () => {
    render(overlay());

    const dialog = screen.getByRole("dialog", { name: "Place details" });
    expect(dialog.style.getPropertyValue("--category-text")).toBe("#f8fafc");
    expect(dialog.style.getPropertyValue("--text-primary")).toBe("var(--category-text)");
    expect(dialog.style.getPropertyValue("--text-secondary")).toBe("var(--category-muted)");
    expect(dialog.style.getPropertyValue("--border-card")).toBe("var(--category-control-border)");
    expect(dialog.style.getPropertyValue("--bg-card")).toBe("var(--category-card)");
  });

  it("keeps the null-category branch free of category and legacy alias overrides", () => {
    render(overlay(vi.fn(), { category: false }));

    const dialog = screen.getByRole("dialog", { name: "Place details" });
    expect(dialog.style.getPropertyValue("--category-text")).toBe("");
    expect(dialog.style.getPropertyValue("--text-primary")).toBe("");
    expect(dialog.style.getPropertyValue("--bg-card")).toBe("");
  });

  it("moves initial focus to the dialog and sends the first Tab to its first enabled control", async () => {
    const user = userEvent.setup();
    render(overlay());

    const dialog = screen.getByRole("dialog", { name: "Place details" });
    expect(dialog).toHaveFocus();

    await user.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: "First action" })).toHaveFocus();
  });

  it("contains forward, reverse, and programmatic focus within the active dialog", async () => {
    const user = userEvent.setup();
    const background = document.createElement("button");
    background.dataset.overlayTestBackground = "true";
    background.textContent = "Background action";
    document.body.append(background);
    render(overlay());

    const first = screen.getByRole("button", { name: "First action" });
    const last = screen.getByRole("button", { name: "Last action" });
    last.focus();
    await user.keyboard("{Tab}");
    expect(first).toHaveFocus();

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(last).toHaveFocus();

    background.focus();
    expect(screen.getByRole("dialog", { name: "Place details" })).toHaveFocus();
    background.remove();
  });

  it("closes exactly once on Escape and uses the latest callback without reordering the stack", async () => {
    const user = userEvent.setup();
    const staleClose = vi.fn();
    const latestClose = vi.fn();
    const result = render(overlay(staleClose));
    result.rerender(overlay(latestClose));

    await user.keyboard("{Escape}");
    expect(staleClose).not.toHaveBeenCalled();
    expect(latestClose).toHaveBeenCalledTimes(1);
  });

  it("restores the exact prior inline overflow and opener focus when the mounted overlay closes", () => {
    document.body.style.overflow = "clip";
    const opener = document.createElement("button");
    opener.dataset.overlayTestBackground = "true";
    opener.textContent = "Open place";
    document.body.append(opener);
    opener.focus();
    const openerRef = createRef<HTMLElement>();
    openerRef.current = opener;

    const result = render(overlay(vi.fn(), { returnFocusRef: openerRef }));
    expect(document.body.style.overflow).toBe("hidden");

    result.unmount();
    expect(document.body.style.overflow).toBe("clip");
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("does not throw when its captured opener has been disconnected", () => {
    const opener = document.createElement("button");
    opener.dataset.overlayTestBackground = "true";
    document.body.append(opener);
    opener.focus();
    const result = render(overlay());
    opener.remove();

    expect(() => result.unmount()).not.toThrow();
  });

  it("preserves existing inert attributes without taking sibling inert ownership", () => {
    const sibling = document.createElement("main");
    sibling.dataset.overlayTestBackground = "true";
    sibling.setAttribute("inert", "");
    document.body.append(sibling);
    const result = render(overlay());

    expect(sibling).toHaveAttribute("inert", "");
    result.unmount();
    expect(sibling).toHaveAttribute("inert", "");
    sibling.remove();
  });

  it("keeps one scroll lock and only lets the topmost owned overlay close", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "scroll";
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    const view = (showSecond: boolean) => (
      <PublicCategoryThemeProvider styles={categoryStyles}>
        <PublicBlockingOverlay label="First overlay" onClose={firstClose}>
          <button type="button">First overlay action</button>
        </PublicBlockingOverlay>
        {showSecond && (
          <PublicBlockingOverlay label="Second overlay" onClose={secondClose}>
            <button type="button">Second overlay action</button>
          </PublicBlockingOverlay>
        )}
      </PublicCategoryThemeProvider>
    );
    const result = render(view(true));

    expect(screen.getByRole("dialog", { name: "Second overlay" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(secondClose).toHaveBeenCalledTimes(1);
    expect(firstClose).not.toHaveBeenCalled();

    result.rerender(view(false));
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(firstClose).toHaveBeenCalledTimes(1);

    result.unmount();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("does not leak stack or scroll ownership through StrictMode effect replay", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "auto";
    const onClose = vi.fn();
    const result = render(<StrictMode>{overlay(onClose)}</StrictMode>);

    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    result.unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("suspends Escape, Tab, and focus enforcement while a YARL portal is active", () => {
    const onClose = vi.fn();
    const background = document.createElement("button");
    background.dataset.overlayTestBackground = "true";
    background.textContent = "Background";
    document.body.append(background);
    render(overlay(onClose));
    const yarl = document.createElement("div");
    yarl.className = "yarl__root";
    const viewerButton = document.createElement("button");
    viewerButton.textContent = "Close viewer";
    yarl.append(viewerButton);
    document.body.append(yarl);

    viewerButton.focus();
    expect(viewerButton).toHaveFocus();
    expect(fireEvent.keyDown(document, { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(document, { key: "Escape" })).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    yarl.remove();
    background.focus();
    expect(screen.getByRole("dialog", { name: "Place details" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    background.remove();
  });
});
