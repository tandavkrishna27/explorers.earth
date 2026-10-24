import { useCallback, useEffect, useRef, useState } from "react";

export function moveCard<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** GL-06 for list cards: drag is primary; Space/arrows/Space and the ⋯ menu are the keyboard and touch paths. */
export function useCardReorder(savedOrder: string[], commit: (order: string[]) => Promise<unknown> | void) {
  const [order, setOrder] = useState(savedOrder);
  const [picked, setPicked] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const before = useRef<string[]>(savedOrder);
  const savedKey = savedOrder.join("|");
  useEffect(() => { if (!picked && !dragging) setOrder(savedOrder); }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback((next: string[], revertTo: string[]) => {
    if (next.join("|") === revertTo.join("|")) return;
    setOrder(next);
    Promise.resolve(commit(next)).catch(() => setOrder(revertTo));
  }, [commit]);

  const onGripKey = (id: string, event: Pick<KeyboardEvent, "key" | "preventDefault">) => {
    const index = order.indexOf(id);
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (picked === id) { setPicked(null); save(order, before.current); }
      else { before.current = order; setPicked(id); }
    } else if (picked === id && (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowUp")) {
      event.preventDefault();
      const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      setOrder(moveCard(order, index, index + delta));
    } else if (picked === id && event.key === "Escape") {
      event.preventDefault(); setPicked(null); setOrder(before.current);
    }
  };
  const dragStart = (id: string) => { before.current = order; setDragging(id); };
  const dragOver = (id: string) => {
    if (!dragging || id === dragging) return;
    setOver(id);
    setOrder((current) => moveCard(current, current.indexOf(dragging), current.indexOf(id)));
  };
  const drop = () => { const next = order; setDragging(null); setOver(null); save(next, before.current); };
  const dragEnd = () => { if (dragging) { setDragging(null); setOver(null); setOrder(before.current); } };
  const moveBy = (id: string, delta: -1 | 1) => {
    const index = order.indexOf(id);
    save(moveCard(order, index, index + delta), order);
  };
  return { order, picked, dragging, over, onGripKey, dragStart, dragOver, drop, dragEnd, moveBy };
}
