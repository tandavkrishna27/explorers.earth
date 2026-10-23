import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import ReorderableList from "../../../components/reorder/ReorderableList";
import BottomAddButton from "../../../components/controls/BottomAddButton";
import type { ListItemView, ListPageAdapter } from "./listPageAdapter";

const messageOf = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

export default function RecommendationsTab({ adapter, active }: { adapter: ListPageAdapter; active: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [order, setOrder] = useState<ListItemView[]>(adapter.items);
  const [menu, setMenu] = useState<string | null>(null);
  useEffect(() => setOrder(adapter.items), [adapter.items]);
  const add = () => navigate(adapter.addPath);
  const addNoun = t("dashboard.wp3b.addNoun", "Add {{noun}}", { noun: adapter.itemNoun });
  const addLabel = `＋ ${addNoun}`;
  // WP11 (mocks v3): a sample keeps reorder but has no pins, item menus or Add until it is made yours.
  const sample = adapter.list?.isSample === true;

  if (adapter.loading && !adapter.items.length) {
    return <div className="grid gap-2 pt-3">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />)}</div>;
  }
  if (!adapter.items.length) {
    return (
      <div className="mt-3 grid justify-items-center gap-3 rounded-2xl border border-dashed border-blue-400/45 px-4 py-9 text-center">
        <b>{t("dashboard.wp3b.emptyTitle", "No {{noun}}s yet", { noun: adapter.itemNoun })}</b>
        <span className="text-xs text-gray-400">{t("dashboard.wp3b.emptyHint", "Add your first {{noun}} to start this list.", { noun: adapter.itemNoun })}</span>
        {!sample && <button type="button" onClick={add} className="min-h-11 rounded-xl bg-blue-400 px-4 text-white">{addLabel}</button>}
      </div>
    );
  }
  const save = async (next: ListItemView[]) => {
    const previous = order;
    setOrder(next);
    try { await adapter.reorder(next.map((i) => i.id)); toast.success(t("dashboard.wp3b.orderSaved", "Order saved")); }
    catch {
      setOrder(previous);
      toast.error(t("dashboard.wp3b.orderFailed", "Couldn't save the order"), { action: { label: t("dashboard.wp3b.retry", "Try again"), onClick: () => void save(next) } });
    }
  };
  const togglePin = async (item: ListItemView) => {
    try { await adapter.togglePin(item.id, !item.pinned); }
    catch (error) { toast.error(messageOf(error, t("dashboard.wp3b.pinFailed", "Couldn't update Top Picks"))); }
  };
  const remove = async (itemId: string) => {
    setMenu(null);
    try { await adapter.removeItem(itemId); }
    catch (error) { toast.error(messageOf(error, t("dashboard.wp3b.removeFailed", "Couldn't remove the item"))); }
  };
  return (
    <div className="grid gap-2 pt-3">
      <ReorderableList controls="keyboard" axis="y" items={order} getKey={(i) => i.id} getLabel={(i) => i.title} onReorder={(next) => void save(next)}
        ariaLabel={t("dashboard.wp3b.items", "Items")} className="grid gap-2" itemClassName="rounded-xl border border-white/10 bg-[#0e1218]"
        renderItem={(item) => (
          <div className="relative flex items-center gap-3 p-2">
            {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-11 w-8 rounded object-cover" /> : <span className="h-11 w-8 rounded bg-slate-700" />}
            <button type="button" onClick={() => navigate(adapter.editPath(item.id))} className="min-w-0 flex-1 text-left">
              <b className="block truncate text-sm">{item.title}</b>
              <span className="text-xs text-gray-400">{item.subtitle}{item.rating ? ` · ★ ${item.rating / 2}` : ""}</span>
              {item.note ? <span className="mt-0.5 block line-clamp-1 text-xs text-gray-500">{item.note}</span> : null}
            </button>
            {!sample && <>
            <button type="button" aria-pressed={item.pinned} aria-label={t("dashboard.wp3b.pin", "Pin {{item}} to Top Picks", { item: item.title })}
              onClick={() => void togglePin(item)} className={`h-11 w-11 rounded-lg ${item.pinned ? "text-amber-400" : "text-gray-400"}`}>{item.pinned ? "★" : "☆"}</button>
            <button type="button" aria-haspopup="menu" aria-expanded={menu === item.id} aria-label={t("dashboard.wp3b.more", "More actions for {{item}}", { item: item.title })}
              onClick={() => setMenu(menu === item.id ? null : item.id)} className="h-11 w-11 rounded-lg">⋯</button>
            {menu === item.id && (
              <div role="menu" className="absolute right-2 top-12 z-10 grid min-w-[160px] rounded-xl border border-white/10 bg-[#1f2430] p-1 text-sm">
                <button role="menuitem" type="button" onClick={() => navigate(adapter.editPath(item.id))} className="rounded px-3 py-2 text-left hover:bg-white/5">{t("dashboard.wp3b.edit", "Edit")}</button>
                <button role="menuitem" type="button" onClick={() => void remove(item.id)} className="rounded px-3 py-2 text-left text-red-300 hover:bg-white/5">{t("dashboard.wp3b.remove", "Remove from list")}</button>
              </div>
            )}
            </>}
          </div>
        )} />
      {!sample && <button type="button" onClick={add} className="rounded-xl border border-dashed border-white/20 p-3 text-left text-sm text-gray-400 hover:border-blue-400 hover:text-blue-400">{addLabel}</button>}
      <BottomAddButton label={addNoun} onClick={add} hidden={!active || sample} />
    </div>
  );
}
