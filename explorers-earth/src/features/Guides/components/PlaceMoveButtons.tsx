import { ArrowDown, ArrowUp } from "lucide-react";
import { moveItem } from "../../../components/reorder/moveItem";

interface Props<T> {
  /** The place's name, used in the button labels. */
  name: string;
  index: number;
  places: T[];
  setPlaces: (next: T[]) => void;
  announce: (label: string, position: number, total: number) => void;
}

/**
 * Move up / Move down for a place inside a day part, so the order can be changed from the
 * keyboard or a touch screen as well as by dragging the card. The buttons stop pointer
 * events from reaching the draggable card, which would otherwise start a drag.
 */
export default function PlaceMoveButtons<T>({ name, index, places, setPlaces, announce }: Props<T>) {
  const move = (delta: -1 | 1) => {
    setPlaces(moveItem(places, index, index + delta));
    announce(name, index + delta + 1, places.length);
  };
  const base = "inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-8 sm:min-w-8 rounded-md border border-dashboard text-dashboard disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent";
  return (
    <div className="flex flex-shrink-0 gap-1" onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" className={base} disabled={index === 0} aria-label={`Move ${name} up`} onClick={() => move(-1)}>
        <ArrowUp aria-hidden="true" size={14} />
      </button>
      <button type="button" className={base} disabled={index === places.length - 1} aria-label={`Move ${name} down`} onClick={() => move(1)}>
        <ArrowDown aria-hidden="true" size={14} />
      </button>
    </div>
  );
}
