import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import ReorderableList from "../../../../components/reorder/ReorderableList";

interface DaySection {
  documentId: string;
  Title?: string | null;
  Sequence?: number | null;
}

interface DayOrderPanelProps {
  /** Sections in their current saved order. */
  sections: DaySection[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Persists the complete new order; resolves once the guide has been written. */
  onReorder: (sectionIds: string[]) => Promise<void>;
}

const stripDayPrefix = (title: string) => title.replace(/^Day \d+(:\s*|\s+|$)/i, "").trim();

/**
 * Reorders a guide's days. Day numbers are never typed: a day's number is its position, so
 * moving a day renumbers every day after it in the List and Timeline views and on the
 * public guide, all of which read the same saved order.
 */
export default function DayOrderPanel({ sections, open, onOpenChange, onReorder }: DayOrderPanelProps) {
  const [pending, setPending] = useState<{ ids: string[]; from: string } | null>(null);
  const [error, setError] = useState("");
  const savedIds = sections.map((section) => section.documentId);
  const savedSignature = savedIds.join("|");

  // The optimistic order is shown until the refreshed guide arrives in that same order, so
  // the list does not flick back to the old order while the reload is in flight.
  // Any other change to the saved order (another editor, a conflict reload) also ends it.
  useEffect(() => {
    if (pending && (pending.ids.join("|") === savedSignature || pending.from !== savedSignature)) setPending(null);
  }, [pending, savedSignature]);

  const ordered = useMemo(() => {
    if (!pending) return sections;
    const byId = new Map(sections.map((section) => [section.documentId, section]));
    const known = pending.ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    return known.length === sections.length ? known : sections;
  }, [pending, sections]);

  if (sections.length < 2) return null;

  const change = async (next: DaySection[]) => {
    const ids = next.map((section) => section.documentId);
    setPending({ ids, from: savedSignature });
    setError("");
    try {
      await onReorder(ids);
    } catch (failure) {
      setPending(null);
      const message = failure instanceof Error ? failure.message : "The days could not be reordered.";
      setError(message);
      toast.error(message);
    }
  };

  return (
    <div className="mb-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="guide-day-order"
        onClick={() => onOpenChange(!open)}
        className="px-3 py-1.5 rounded-md text-xs font-poppins font-medium border border-dashboard text-dashboard hover:border-dashboard-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent"
      >
        {open ? "Done reordering" : "Reorder days"}
      </button>
      {open && (
        <div id="guide-day-order" className="mt-3 rounded-lg border border-dashboard-muted p-3">
          <p className="text-xs text-dashboard-light mb-2">
            Day numbers follow the order below. Move a day and the days after it are renumbered.
          </p>
          <ReorderableList
            items={ordered}
            getKey={(section) => section.documentId}
            getLabel={(_, index) => `Day ${index + 1}`}
            onReorder={change}
            ariaLabel="Day order"
            axis="y"
            className="space-y-2"
            itemClassName="rounded-md bg-dashboard-bg p-2"
            renderItem={(section, index) => (
              <div className="flex items-baseline gap-2 text-sm text-dashboard">
                <span className="font-semibold shrink-0">Day {index + 1}</span>
                <span className="truncate">{stripDayPrefix(section.Title || "") || "Untitled day"}</span>
              </div>
            )}
          />
          {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
