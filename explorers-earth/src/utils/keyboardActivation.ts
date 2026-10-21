import type { KeyboardEvent, MouseEvent } from "react";

/**
 * Props that make a non-interactive element (card, banner, chip) behave like a button for
 * keyboard and assistive-technology users: role, tab stop and Enter / Space activation.
 * Keys pressed on a nested control (a real button or link inside the card) are left alone.
 */
export function keyboardActivation<E extends HTMLElement = HTMLElement>(handler: (event: MouseEvent<E>) => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: handler,
    onKeyDown: (event: KeyboardEvent<E>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        handler(event as unknown as MouseEvent<E>);
      }
    },
  };
}
