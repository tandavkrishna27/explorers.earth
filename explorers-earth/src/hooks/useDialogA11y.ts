import { RefObject, useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

// Open dialogs, innermost last. Only the top one reacts to Escape / Tab so a dialog
// opened from inside another one (crop inside upload, confirm inside editor) behaves.
const openDialogs: symbol[] = [];

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getAttribute("aria-hidden") !== "true" && !el.closest("[hidden], [inert]"),
  );
}

const RESTORE_TIMEOUT_MS = 5000;
const LANDMARK = 'main, [role="main"], form, section, [role="region"], nav, header, aside, article';

function isFocusable(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  if (el.matches(":disabled") || el.getAttribute("aria-disabled") === "true") return false;
  return !el.closest("[hidden], [inert]");
}

function focusFallback(opener: HTMLElement): HTMLElement | null {
  let node = opener.parentElement;
  while (node && node !== document.body) {
    if (node.matches(FOCUSABLE) && isFocusable(node)) {
      node.focus({ preventScroll: true });
      return node;
    }
    node = node.parentElement;
  }
  const landmark = opener.closest<HTMLElement>(LANDMARK) ?? document.querySelector<HTMLElement>("main, [role='main']");
  if (landmark) {
    if (!landmark.hasAttribute("tabindex")) landmark.setAttribute("tabindex", "-1");
    landmark.focus({ preventScroll: true });
    return landmark;
  }
  return null;
}

/**
 * Hands focus back to the element that opened a dialog. When the opener is disabled at close
 * time (e.g. a "Save" button that stays disabled while a deferred save is pending) focus is
 * parked on the nearest focusable ancestor / landmark so it never falls to <body>, and moves to
 * the opener as soon as it becomes enabled again (bounded wait), unless the user went elsewhere.
 */
export function restoreFocus(opener: HTMLElement): void {
  if (!opener.isConnected) return;
  if (isFocusable(opener)) {
    opener.focus({ preventScroll: true });
    if (document.activeElement === opener) return;
  }
  const parked = focusFallback(opener);

  const stillParked = () => {
    const active = document.activeElement;
    return !active || active === document.body || active === parked;
  };
  let done = false;
  let observer: MutationObserver | null = null;
  let frame: number | undefined;
  const finish = () => {
    done = true;
    observer?.disconnect();
    clearTimeout(timer);
    if (frame !== undefined && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
  };
  const attempt = () => {
    if (done) return;
    if (!opener.isConnected || !stillParked()) return finish();
    if (isFocusable(opener)) {
      opener.focus({ preventScroll: true });
      finish();
    }
  };
  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(attempt);
    observer.observe(opener, { attributes: true, attributeFilter: ["disabled", "aria-disabled", "hidden", "inert"] });
  }
  // Disabled state may also flip through an ancestor or via property without an attribute change.
  const poll = () => {
    attempt();
    if (!done && typeof requestAnimationFrame === "function") frame = requestAnimationFrame(poll);
  };
  if (typeof requestAnimationFrame === "function") frame = requestAnimationFrame(poll);
  const timer = setTimeout(finish, RESTORE_TIMEOUT_MS);
}

/**
 * Modal dialog behaviour shared by Modal and UnsavedChangesModal: moves focus into the
 * dialog, keeps Tab / Shift+Tab inside it, closes on Escape and hands focus back to the
 * element that opened it.
 */
export function useDialogA11y(open: boolean, containerRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const id = Symbol("dialog");
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openDialogs.push(id);

    if (container && !container.contains(document.activeElement)) {
      const preferred = container.querySelector<HTMLElement>("[data-autofocus]") ?? focusableWithin(container)[0];
      (preferred ?? container).focus({ preventScroll: true });
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== id || !container) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusableWithin(container);
      if (items.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const index = openDialogs.indexOf(id);
      if (index >= 0) openDialogs.splice(index, 1);
      if (opener) restoreFocus(opener);
    };
  }, [open, containerRef]);
}
