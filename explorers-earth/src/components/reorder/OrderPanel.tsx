import { useEffect, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import ReorderableList from './ReorderableList';

export interface OrderPanelItem { id: string; title: string }

interface Props {
  items: OrderPanelItem[];
  /** Singular noun for position labels: "Day", "App". Rows read "<noun> <n>". */
  noun: string;
  /** Plural noun for the toggle: "days" gives "Reorder days". */
  nounPlural: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Persists the complete new order of ids; resolves once it has been written. */
  onReorder: (ids: string[]) => Promise<void>;
  /** Text under the toggle explaining what the order controls. */
  help?: string;
  /** Text shown for an item with no title. */
  untitled?: string;
  /** Drop a leading "Day 3:" style prefix so the row's own number is not contradicted. */
  displayTitle?: (title: string) => string;
}

/**
 * A collapsed "Reorder …" control that reveals the items as an arrangeable list.
 *
 * The order shown while a write is in flight is the owner's attempt; it gives way to the
 * saved order the moment the parent re-reads, and an attempt that fails or is overtaken by a
 * different saved order is dropped, so the panel never keeps an order the server does not hold.
 */
export default function OrderPanel({ items, noun, nounPlural, open, onOpenChange, onReorder, help, untitled = 'Untitled', displayTitle }: Props) {
  const [pending, setPending] = useState<{ ids: string[]; from: string } | null>(null);
  const [error, setError] = useState('');
  const regionId = useId();
  const savedSignature = items.map(item => item.id).join('|');

  useEffect(() => {
    if (pending && (pending.ids.join('|') === savedSignature || pending.from !== savedSignature)) setPending(null);
  }, [pending, savedSignature]);

  const ordered = useMemo(() => {
    if (!pending) return items;
    const byId = new Map(items.map(item => [item.id, item]));
    const known = pending.ids.flatMap(id => (byId.has(id) ? [byId.get(id)!] : []));
    return known.length === items.length ? known : items;
  }, [pending, items]);

  if (items.length < 2) return null;

  const change = async (next: OrderPanelItem[]) => {
    const ids = next.map(item => item.id);
    setPending({ ids, from: savedSignature });
    setError('');
    try {
      await onReorder(ids);
    } catch (failure) {
      setPending(null);
      const message = failure instanceof Error ? failure.message : `The ${nounPlural} could not be reordered.`;
      setError(message);
      toast.error(message);
    }
  };

  return (
    <div className="mb-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => onOpenChange(!open)}
        className="px-3 py-1.5 rounded-md text-xs font-medium border border-dashboard text-dashboard hover:border-dashboard-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent"
      >
        {open ? 'Done reordering' : `Reorder ${nounPlural}`}
      </button>
      {open && (
        <div id={regionId} className="mt-3 rounded-lg border border-dashboard-muted p-3">
          {help && <p className="text-xs text-dashboard-light mb-2">{help}</p>}
          <ReorderableList
            items={ordered}
            getKey={item => item.id}
            getLabel={(_, index) => `${noun} ${index + 1}`}
            onReorder={change}
            ariaLabel={`${noun} order`}
            axis="y"
            className="space-y-2"
            itemClassName="rounded-md bg-dashboard-bg p-2"
            renderItem={(item, index) => (
              <div className="flex items-baseline gap-2 text-sm text-dashboard">
                <span className="font-semibold shrink-0">{noun} {index + 1}</span>
                <span className="truncate">{(displayTitle ? displayTitle(item.title) : item.title).trim() || untitled}</span>
              </div>
            )}
          />
          {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
