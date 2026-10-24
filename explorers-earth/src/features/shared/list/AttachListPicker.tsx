import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CATEGORY_KEYS, type CategoryKey } from "../category/categoryConfig";

export type PickableList = { id: string; category: string; title: string; isSample?: boolean };
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lists: readonly PickableList[];
  isAttachable: (list: { id: string }) => boolean;
  onPick: (list: PickableList) => void;
  onCreateNew: (category: CategoryKey) => void;
};

const ORDER: readonly CategoryKey[] = ["places", "guides", "movies", "books", "games", "apps", "products", "people"];

/**
 * WP10 (LNK-02, LNK-06). Only the owner's own lists reach this picker; the list itself and
 * lists already linked either way are filtered out. Same overlay as NewListDialog.
 */
export function AttachListPicker({ open, onOpenChange, lists, isAttachable, onPick, onCreateNew }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [newCategory, setNewCategory] = useState<CategoryKey>("products");
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQuery(""); search.current?.focus(); } }, [open]);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    // WP11: a sample is never offered; the server refuses a link to one.
    const visible = lists.filter((l) => !l.isSample && isAttachable(l) && (!q || l.title.toLowerCase().includes(q)));
    return ORDER.map((category) => ({ category, items: visible.filter((l) => l.category === category) })).filter((g) => g.items.length > 0);
  }, [lists, isAttachable, query]);
  if (!open) return null;
  const close = () => onOpenChange(false);
  const categoryLabel = (key: string) => t(`dashboard.wp1.back.categories.${key}`, key);
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm md:p-6" role="presentation" onClick={close}>
      <div role="dialog" aria-modal="true" aria-label={t("dashboard.wp10.attachTitle", "Attach a list")} onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") close(); }}
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-hidden rounded-xl border border-dashboard-border bg-dashboard-sidebar p-4 shadow-2xl md:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-dashboard">{t("dashboard.wp10.attachTitle", "Attach a list")}</h2>
          <button type="button" onClick={close} aria-label={t("dashboard.wp3a.dialog.cancel", "Cancel")} className="rounded-full bg-white/5 p-1.5 text-dashboard-muted">✕</button>
        </div>
        <input ref={search} type="search" aria-label={t("dashboard.wp10.findList", "Find a list")} placeholder={t("dashboard.wp10.findList", "Find a list")}
          value={query} onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-dashboard-border bg-dashboard-muted px-3 py-2 text-sm text-dashboard" />
        <div role="listbox" aria-label={t("dashboard.wp10.yourLists", "Your lists")} className="min-h-0 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.category} role="group" aria-label={categoryLabel(g.category)}>
              <p className="px-2 pt-2 text-xs uppercase tracking-wide text-dashboard-muted" aria-hidden="true">{categoryLabel(g.category)}</p>
              {g.items.map((l) => (
                <div key={l.id} role="option" aria-selected={false} tabIndex={0} onClick={() => onPick(l)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(l); } }}
                  className="min-h-11 cursor-pointer break-words rounded-lg px-2 py-2.5 text-sm text-dashboard hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">{l.title}</div>
              ))}
            </div>
          ))}
          {groups.length === 0 && <p className="px-2 py-4 text-sm text-gray-400">{t("dashboard.wp10.noLists", "No other lists to attach yet.")}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-dashboard-border pt-3">
          <select aria-label={t("dashboard.wp10.newListCategory", "Category for the new list")} value={newCategory} onChange={(e) => setNewCategory(e.target.value as CategoryKey)}
            className="min-h-11 rounded-lg border border-dashboard-border bg-dashboard-muted px-2 text-sm text-dashboard">
            {CATEGORY_KEYS.map((key) => <option key={key} value={key}>{categoryLabel(key)}</option>)}
          </select>
          <button type="button" onClick={() => onCreateNew(newCategory)} className="min-h-11 flex-1 rounded-lg border border-dashed border-white/30 px-3 text-sm text-dashboard">
            {t("dashboard.wp10.createNew", "Create a new list")}
          </button>
        </div>
      </div>
    </div>
  );
}
