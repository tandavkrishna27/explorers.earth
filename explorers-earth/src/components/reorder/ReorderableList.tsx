import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fillTemplate, moveItem } from './moveItem';

export interface ReorderableListProps<T> {
  items: readonly T[];
  getKey: (item: T) => string;
  /** Human name of one entry, used in button labels and announcements, e.g. "Screenshot 2" or "Day 3". */
  getLabel: (item: T, index: number) => string;
  /** Receives the complete new order. Called once per completed move or drop. */
  onReorder: (next: T[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
  /** Layout of the entries: a wrapping-free row (thumbnails) or a column (rows). */
  axis?: 'x' | 'y';
  disabled?: boolean;
  className?: string;
  itemClassName?: string;
  /** Accessible name of the whole list. */
  ariaLabel: string;
}

type Direction = 'up' | 'down';

interface RowProps<T> {
  item: T;
  index: number;
  total: number;
  id: string;
  label: string;
  disabled: boolean;
  className?: string;
  onMove: (index: number, delta: -1 | 1) => void;
  onDragEnd: () => void;
  children: ReactNode;
}

function Row<T>({ item, index, total, id, label, disabled, className, onMove, onDragEnd, children }: RowProps<T>) {
  const { t } = useTranslation();
  const controls = useDragControls();
  const buttonClass = 'inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-8 sm:min-w-8 rounded-md border border-dashboard text-dashboard transition-colors hover:border-dashboard-accent disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent';
  const upLabel = fillTemplate(t('common.reorder.moveEarlier', { defaultValue: 'Move {{item}} up' }), { item: label });
  const downLabel = fillTemplate(t('common.reorder.moveLater', { defaultValue: 'Move {{item}} down' }), { item: label });
  const dragLabel = fillTemplate(t('common.reorder.drag', { defaultValue: 'Drag {{item}} to reorder' }), { item: label });
  return (
    <Reorder.Item
      as="li"
      value={item}
      id={id}
      data-reorder-id={id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className={className}
      style={{ listStyle: 'none' }}
    >
      {children}
      <div className="mt-1 flex items-center gap-1" role="group" aria-label={label}>
        <button
          type="button"
          disabled={disabled}
          aria-label={dragLabel}
          onPointerDown={(event) => { if (!disabled) controls.start(event); }}
          style={{ touchAction: 'none' }}
          className={`${buttonClass} cursor-grab`}
        >
          <GripVertical aria-hidden="true" size={16} />
        </button>
        <button type="button" data-move="up" disabled={disabled || index === 0} aria-label={upLabel} onClick={() => onMove(index, -1)} className={buttonClass}>
          <ArrowUp aria-hidden="true" size={16} />
        </button>
        <button type="button" data-move="down" disabled={disabled || index === total - 1} aria-label={downLabel} onClick={() => onMove(index, 1)} className={buttonClass}>
          <ArrowDown aria-hidden="true" size={16} />
        </button>
      </div>
    </Reorder.Item>
  );
}

/**
 * An ordered collection the owner can rearrange by dragging the grip or with the visible
 * Move up / Move down buttons. The buttons are the keyboard and touch path, so every drag
 * has a non-drag equivalent; each completed move is announced through a polite live region.
 * The component is controlled: it never keeps an order the parent has not been told about.
 */
export default function ReorderableList<T>({ items, getKey, getLabel, onReorder, renderItem, axis = 'x', disabled = false, className, itemClassName, ariaLabel }: ReorderableListProps<T>) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<T[] | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const focusAfter = useRef<{ id: string; direction: Direction } | null>(null);
  const root = useRef<HTMLUListElement>(null);
  const instructionsId = useId();
  const shown = draft ?? (items as T[]);
  const total = items.length;

  const announce = useCallback((item: T, position: number) => {
    const index = items.findIndex(row => getKey(row) === getKey(item));
    setAnnouncement(fillTemplate(t('common.reorder.moved', { defaultValue: '{{item}} moved to position {{position}} of {{total}}.' }), {
      item: getLabel(item, index < 0 ? position - 1 : index), position, total,
    }));
  }, [getKey, getLabel, items, t, total]);

  const move = useCallback((index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (disabled || target < 0 || target >= total) return;
    const moving = items[index];
    focusAfter.current = { id: getKey(moving), direction: delta < 0 ? 'up' : 'down' };
    setAnnouncement(fillTemplate(t('common.reorder.moved', { defaultValue: '{{item}} moved to position {{position}} of {{total}}.' }), {
      item: getLabel(moving, index), position: target + 1, total,
    }));
    onReorder(moveItem(items, index, target));
  }, [disabled, getKey, getLabel, items, onReorder, t, total]);

  const commitDrag = useCallback(() => {
    if (!draft) return;
    const same = draft.length === items.length && draft.every((row, position) => getKey(row) === getKey(items[position]));
    setDraft(null);
    if (same) return;
    const moved = draft.findIndex((row, position) => getKey(row) !== getKey(items[position]));
    onReorder(draft);
    if (moved >= 0) announce(draft[moved], moved + 1);
  }, [announce, draft, getKey, items, onReorder]);

  // The moved entry keeps its DOM node when it is keyed, but a browser may still blur it as
  // the node is repositioned, so focus is restored onto the same direction button (or its
  // sibling when the move reached an end of the list).
  useLayoutEffect(() => {
    const pending = focusAfter.current;
    if (!pending || !root.current) return;
    focusAfter.current = null;
    const row = Array.from(root.current.querySelectorAll<HTMLElement>('[data-reorder-id]')).find(node => node.dataset.reorderId === pending.id);
    const preferred = row?.querySelector<HTMLButtonElement>(`[data-move="${pending.direction}"]`);
    const fallback = row?.querySelector<HTMLButtonElement>(`[data-move="${pending.direction === 'up' ? 'down' : 'up'}"]`);
    (preferred && !preferred.disabled ? preferred : fallback)?.focus();
  });

  const signature = items.map(getKey).join('|');
  useEffect(() => { setDraft(null); }, [signature]);

  return (
    <div>
      <p id={instructionsId} className="sr-only">
        {t('common.reorder.instructions', { defaultValue: 'Use the move up and move down buttons to change the order, or drag the grip.' })}
      </p>
      <Reorder.Group
        ref={root}
        as="ul"
        axis={axis}
        values={shown}
        onReorder={setDraft}
        aria-label={ariaLabel}
        aria-describedby={instructionsId}
        className={className}
        style={{ margin: 0, padding: 0 }}
      >
        {shown.map((item, index) => (
          <Row
            key={getKey(item)}
            item={item}
            index={index}
            total={total}
            id={getKey(item)}
            label={getLabel(item, index)}
            disabled={disabled}
            className={itemClassName}
            onMove={move}
            onDragEnd={commitDrag}
          >
            {renderItem(item, index)}
          </Row>
        ))}
      </Reorder.Group>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>
    </div>
  );
}
