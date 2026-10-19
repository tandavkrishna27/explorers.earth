import OrderPanel from "../../../../components/reorder/OrderPanel";

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

const stripDayPrefix = (title: string) => title.replace(/^Day \d+(:\s*|\s+|$)/i, "");

/**
 * Reorders a guide's days. Day numbers are never typed: a day's number is its position, so
 * moving a day renumbers every day after it in the List and Timeline views and on the
 * public guide, all of which read the same saved order.
 */
export default function DayOrderPanel({ sections, open, onOpenChange, onReorder }: DayOrderPanelProps) {
  return (
    <OrderPanel
      items={sections.map((section) => ({ id: section.documentId, title: section.Title || "" }))}
      noun="Day"
      nounPlural="days"
      untitled="Untitled day"
      displayTitle={stripDayPrefix}
      help="Day numbers follow the order below. Move a day and the days after it are renumbered."
      open={open}
      onOpenChange={onOpenChange}
      onReorder={onReorder}
    />
  );
}
