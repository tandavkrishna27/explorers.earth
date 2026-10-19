import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ReorderableList from './ReorderableList';
import { fillTemplate } from './moveItem';

export interface MediaStripItem { id: string; url: string }

interface Props {
  items: MediaStripItem[];
  onChange: (next: MediaStripItem[]) => void;
  /** Singular noun for labels, e.g. "Screenshot", "Snapshot", "Photo". */
  noun: string;
  /** alt text for each thumbnail, kept as each form already worded it. */
  alt: string;
  /** aria-label of each remove button, kept as each form already worded it. */
  removeLabel: string;
  disabled?: boolean;
}

/**
 * The owner's ordered images for one item. Position in this strip is the saved order and the
 * order every public page renders, so the first image is the lead image.
 */
export default function ReorderableMediaStrip({ items, onChange, noun, alt, removeLabel, disabled = false }: Props) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <ReorderableList
      items={items}
      getKey={item => item.id}
      getLabel={(_, index) => `${noun} ${index + 1}`}
      onReorder={onChange}
      disabled={disabled}
      axis="x"
      ariaLabel={fillTemplate(t('common.reorder.listLabel', { defaultValue: '{{noun}} order' }), { noun })}
      className="flex gap-3 overflow-x-auto pb-2"
      itemClassName="relative"
      renderItem={(item, index) => (
        <div className="relative">
          <img className="w-24 h-24 object-cover rounded" src={item.url} alt={alt} />
          <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-xs text-white" aria-hidden="true">{index + 1}</span>
          <button type="button" aria-label={removeLabel} disabled={disabled} onClick={() => onChange(items.filter(row => row.id !== item.id))}><X size={16} /></button>
        </div>
      )}
    />
  );
}
