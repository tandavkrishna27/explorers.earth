import { useState } from 'react';
import OrderPanel from './OrderPanel';
import { reorderCategoryLists, type ReorderableListCategory } from '../../lib/reorderCategoryLists';

interface Props {
  category: ReorderableListCategory;
  /** The owner's lists in their saved order. */
  lists: { id: string; title: string }[];
  /** "List" / "lists" by default; guides pass "Guide" / "guides". */
  noun?: string;
  nounPlural?: string;
  /** Called after the order is written (and after a failed write, to show what is stored). */
  onChanged: () => void;
}

/** "Reorder lists" for one category. The order set here is the order of the lists on the public page. */
export default function CategoryListsOrder({ category, lists, noun = 'List', nounPlural = 'lists', onChanged }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <OrderPanel
      items={lists}
      noun={noun}
      nounPlural={nounPlural}
      open={open}
      onOpenChange={setOpen}
      help={`Your ${nounPlural} appear on your public page in this order. Pinned ones stay first.`}
      onReorder={async (ids) => {
        try {
          await reorderCategoryLists(category, 'display', ids);
        } finally {
          onChanged();
        }
      }}
    />
  );
}
