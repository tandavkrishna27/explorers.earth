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
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, containerRef]);
}
