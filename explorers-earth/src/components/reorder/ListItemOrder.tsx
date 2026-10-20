import { useState } from 'react';
import OrderPanel from './OrderPanel';
import { reorderListItems, type ReorderableItemCategory } from '../../lib/reorderListItems';

interface Props {
  category: ReorderableItemCategory;
  listId: string;
  /** The list's recommendations in their saved order. */
  items: { id: string; title: string }[];
  /** "App" and "apps"; rows are labelled "<Noun> <n>". */
  noun: string;
  nounPlural: string;
  /** Called after the order is written (and after a failed write, to show what is stored). */
  onChanged: () => void;
}

/**
 * "Reorder <items>" for one list. The order set here is the order of the list on its public
 * page; pinned Top Picks keep their own order, managed with Top Picks.
 */
export default function ListItemOrder({ category, listId, items, noun, nounPlural, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <OrderPanel
      items={items}
      noun={noun}
      nounPlural={nounPlural}
      open={open}
      onOpenChange={setOpen}
      help={`The ${nounPlural} appear on your public list in this order.`}
      onReorder={async (ids) => {
        try {
          await reorderListItems(category, listId, ids);
        } finally {
          onChanged();
        }
      }}
    />
  );
}
