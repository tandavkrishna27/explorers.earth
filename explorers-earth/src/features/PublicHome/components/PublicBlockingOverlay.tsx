import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { usePublicCategoryThemeStyles } from "./PublicCategoryThemeContext";

export type PublicBlockingOverlayProps = {
  children: ReactNode;
  label: string;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement>;
};

const overlayStack: symbol[] = [];
let ownedScrollLocks = 0;
let priorBodyOverflow = "";

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const isTopmostOverlay = (token: symbol) => overlayStack[overlayStack.length - 1] === token;

const isYarlActive = () => {
  const root = document.querySelector<HTMLElement>(".yarl__root");
  if (!root || root.hidden || root.getAttribute("aria-hidden") === "true") return false;
  const styles = window.getComputedStyle(root);
  return styles.display !== "none" && styles.visibility !== "hidden";
};

const enabledFocusTargets = (root: HTMLElement) => (
  Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    const styles = window.getComputedStyle(element);
    return !element.hidden
      && element.getAttribute("aria-hidden") !== "true"
      && styles.display !== "none"
      && styles.visibility !== "hidden";
  })
);

const acquireScrollLock = () => {
  if (ownedScrollLocks === 0) {
    priorBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  ownedScrollLocks += 1;
};

const releaseScrollLock = () => {
  ownedScrollLocks = Math.max(0, ownedScrollLocks - 1);
  if (ownedScrollLocks === 0) {
    document.body.style.overflow = priorBodyOverflow;
  }
};

const PublicBlockingOverlay = ({
  children,
  label,
  onClose,
  returnFocusRef,
}: PublicBlockingOverlayProps) => {
  const categoryStyles = usePublicCategoryThemeStyles();
  const rootRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef(Symbol("public-blocking-overlay"));
  const onCloseRef = useRef(onClose);
  const initialReturnFocusRef = useRef(returnFocusRef);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const token = tokenRef.current;
    const root = rootRef.current;
    if (!root) return;

    const activeElement = document.activeElement;
    const opener = initialReturnFocusRef.current?.current
      ?? (activeElement instanceof HTMLElement ? activeElement : null);
    overlayStack.push(token);
    acquireScrollLock();
    root.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmostOverlay(token) || isYarlActive()) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const targets = enabledFocusTargets(root);
      if (targets.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }

      const first = targets[0];
      const last = targets[targets.length - 1];
      const focused = document.activeElement;
      if (!root.contains(focused) || focused === root) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && focused === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && focused === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isTopmostOverlay(token) || isYarlActive()) return;
      if (!root.contains(event.target as Node)) root.focus();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      const wasTopmost = isTopmostOverlay(token);
      const tokenIndex = overlayStack.lastIndexOf(token);
      if (tokenIndex >= 0) overlayStack.splice(tokenIndex, 1);
      releaseScrollLock();
      if (wasTopmost && opener?.isConnected) opener.focus();
    };
  }, []);

  const portalStyles = {
    ...(categoryStyles ?? {}),
    ...(categoryStyles ? {
      "--text-primary": "var(--category-text)",
      "--text-secondary": "var(--category-muted)",
      "--border-card": "var(--category-control-border)",
      "--bg-card": "var(--category-card)",
    } : {}),
    position: "fixed",
    inset: 0,
    zIndex: "var(--z-public-modal, 2000)",
  } as CSSProperties;

  return createPortal(
    <div
      ref={rootRef}
      data-public-blocking-overlay
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      style={portalStyles}
    >
      {children}
    </div>,
    document.body,
  );
};

export default PublicBlockingOverlay;
