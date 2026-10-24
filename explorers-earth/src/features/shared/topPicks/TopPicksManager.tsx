import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { motion } from "framer-motion";
import DialogPanel from "../../../components/ui/DialogPanel";
import type { CategoryKey, TopPicksMode } from "../category/categoryConfig";
import type { TopPickModel } from "../category/models";
import { saveItemPins, saveListPins } from "./topPicksWrites";

export interface TopPicksManagerProps {
  category: CategoryKey;
  mode: TopPicksMode;
  limit: number;
  pinned: TopPickModel[];
  candidates: TopPickModel[];
  onClose: () => void;
  onSaved: () => void;
}

export default function TopPicksManager({ category, mode, limit, pinned, candidates, onClose, onSaved }: TopPicksManagerProps) {
  const { t } = useTranslation();
  const [staged, setStaged] = useState<TopPickModel[]>(pinned);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const busy = useRef(false);
  const full = staged.length >= limit;
  const available = candidates.filter((candidate) => !staged.some((item) => item.id === candidate.id));

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= staged.length) return;
    const next = [...staged];
    [next[index], next[target]] = [next[target], next[index]];
    setStaged(next);
    setAnnouncement(t("dashboard.wp3a.card.moved", { name: next[target].title, position: target + 1, total: next.length }));
  };
  const save = async () => {
    if (busy.current) return;
    busy.current = true; setSaving(true);
    try {
      const ids = staged.map((item) => item.id);
      if (mode === "items") await saveItemPins(category as Parameters<typeof saveItemPins>[0], ids);
      else await saveListPins(category as "places" | "guides", pinned.map((item) => item.id), ids);
      toast.success(t("dashboard.wp3a.toasts.pinsSaved"));
      onSaved();
    } catch {
      toast.error(t("dashboard.wp3a.toasts.pinsFailed"));
    } finally { busy.current = false; setSaving(false); }
  };

  return (
    <DialogPanel onClose={onClose} className="fixed inset-0 z-[150] flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center md:p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div role="dialog" aria-modal="true" aria-label={t("dashboard.wp3a.manager.title")}
        className="w-full max-w-lg rounded-t-3xl border border-white/10 bg-[#0d1117] shadow-2xl md:rounded-2xl"
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onClick={(event) => event.stopPropagation()}>
        <div className="flex justify-center pb-1 pt-3 md:hidden"><div className="h-1 w-10 rounded-full bg-white/20" /></div>
        <div className="flex items-center justify-between border-b border-white/[.08] px-5 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white"><span className="text-yellow-400" aria-hidden="true">★</span>{t("dashboard.wp3a.manager.title")}
            <span className="text-xs font-normal text-white/50">{t("dashboard.wp3a.manager.count", { pinned: staged.length, limit })}</span></h2>
          <button type="button" onClick={onClose} aria-label={t("dashboard.wp3a.manager.close")} className="p-2 text-white/40 hover:text-white">✕</button>
        </div>
        <div className="max-h-[65vh] space-y-5 overflow-y-auto px-5 py-4">
          <p className="sr-only" aria-live="polite">{announcement}</p>
          <div>
            <p id="wp3a-pinned" className="mb-2 text-xs uppercase tracking-wider text-white/50">{t("dashboard.wp3a.manager.pinned")}</p>
            {staged.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 py-4 text-center text-sm text-white/30">
                {candidates.length === 0 ? t("dashboard.wp3a.manager.nothing") : t("dashboard.wp3a.manager.none")}</p>
            ) : (
              <ul aria-labelledby="wp3a-pinned" className="space-y-1">
                {staged.map((item, i) => (
                  <li key={item.id} className="flex items-center gap-2 border-b border-white/5 py-2 last:border-0">
                    <div className="flex flex-col">
                      <button type="button" aria-label={t("dashboard.wp3a.manager.moveUp", { name: item.title })} disabled={saving || i === 0} onClick={() => move(i, -1)} className="p-2 -my-1.5 text-white/30 disabled:opacity-30">▲</button>
                      <button type="button" aria-label={t("dashboard.wp3a.manager.moveDown", { name: item.title })} disabled={saving || i === staged.length - 1} onClick={() => move(i, 1)} className="p-2 -my-1.5 text-white/30 disabled:opacity-30">▼</button>
                    </div>
                    <span className="w-4 text-center text-xs text-white/30">{i + 1}</span>
                    <p className="min-w-0 flex-1 truncate text-sm text-white">{item.title}</p>
                    <button type="button" aria-label={t("dashboard.wp3a.manager.unpin", { name: item.title })} disabled={saving}
                      onClick={() => setStaged((current) => current.filter((value) => value.id !== item.id))} className="mx-2 p-2 text-white/40 hover:text-red-400">−</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {available.length > 0 && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-white/50">{t("dashboard.wp3a.manager.available")}</p>
              {full && <p role="status" className="mb-2 text-xs text-amber-300">{t("dashboard.wp3a.manager.full", { limit })}</p>}
              {mode === "lists" && available.some((item) => !item.pinnable) && <p className="mb-2 text-xs text-white/40">{t("dashboard.wp3a.manager.onlyPublic")}</p>}
              <ul className="space-y-1">
                {available.map((item) => (
                  <li key={item.id}>
                    <button type="button" aria-label={t("dashboard.wp3a.manager.pin", { name: item.title })} disabled={saving || full || !item.pinnable}
                      onClick={() => setStaged((current) => [...current, item])}
                      className="flex w-full items-center gap-2 rounded border-b border-white/5 py-2 text-left disabled:opacity-40">
                      <span className="min-w-0 flex-1 truncate text-sm text-white">{item.title}</span><span className="text-white/30" aria-hidden="true">☆</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="border-t border-white/[.08] px-5 py-4">
          <button type="button" onClick={save} disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-500 py-3 text-sm font-semibold text-gray-900 disabled:opacity-60">
            <span aria-hidden="true">★</span> {t("dashboard.wp3a.manager.save")}
          </button>
        </div>
      </motion.div>
    </DialogPanel>
  );
}
