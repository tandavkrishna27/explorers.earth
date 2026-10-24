import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Switch from "../../../components/ui/Switch";
import { CATEGORY_CONFIG, type CategoryKey } from "./categoryConfig";
import type { ListCardModel, ListStatus } from "./models";
import { SampleBadge } from "../samples/SampleBadge";
import { MakeMineSheet, SampleDeleteDialog } from "../samples/SampleActions";
import { useSampleCommands } from "../samples/useSampleCommands";
import { toast } from "sonner";

export interface ListCardProps {
  category: CategoryKey;
  list: ListCardModel;
  busy?: boolean;
  dragging?: boolean;
  over?: boolean;
  picked?: boolean;
  onOpen: (id: string) => void;
  onSetStatus: (id: string, next: ListStatus) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  /** WP11: refetch after a sample is made mine or deleted. */
  onSampleChanged?: () => void;
  grip: {
    onKeyDown: (event: React.KeyboardEvent) => void;
    onDragStart: () => void;
    onDragOver: () => void;
    onDrop: () => void;
    onDragEnd: () => void;
  };
}

export default function ListCard({ category, list, busy, dragging, over, picked, onOpen, onSetStatus, onMove, onSampleChanged, grip }: ListCardProps) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState(false);
  const shape = CATEGORY_CONFIG[category].coverShape;
  const coverClass = shape === "landscape" ? "w-[60px] h-10" : shape === "square" ? "w-10 h-10" : "w-[34px] h-12";
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  const empty = list.itemCount === 0;
  const sample = list.isSample === true;
  const commands = useSampleCommands(list.id, onSampleChanged);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [askMine, setAskMine] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  // The ref closes the gap before `sampleBusy` re-renders, so a double click sends one request.
  const sampleInFlight = useRef(false);
  const runSample = async (work: () => Promise<void>, done: string) => {
    if (sampleInFlight.current) return;
    sampleInFlight.current = true;
    setSampleBusy(true);
    try { await work(); toast.success(done); }
    catch { toast.error(t("samples.failed", "That didn't work. Try again.")); }
    finally { sampleInFlight.current = false; setSampleBusy(false); setConfirmDelete(false); setAskMine(false); }
  };
  return (
    <div
      data-testid="list-card"
      draggable
      onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; grip.onDragStart(); }}
      onDragOver={(event) => { event.preventDefault(); grip.onDragOver(); }}
      onDrop={(event) => { event.preventDefault(); grip.onDrop(); }}
      onDragEnd={grip.onDragEnd}
      className={`relative grid gap-2.5 rounded-[14px] border bg-[#151a25] p-3 text-left transition-colors hover:border-blue-400/50 ${dragging ? "opacity-40" : ""} ${over || picked ? "outline-2 outline-dashed outline-blue-400" : ""} ${sample ? "border-dashed border-yellow-400/30" : "border-white/[.09]"}`}
    >
      <button type="button" aria-label={t("dashboard.wp3a.card.grip", { name: list.title })} aria-pressed={picked}
        onKeyDown={grip.onKeyDown} onClick={stop}
        className="absolute left-1/2 top-0.5 z-10 -translate-x-1/2 cursor-grab px-2 text-[10px] tracking-[2px] text-gray-600 min-h-[24px]">⋮⋮</button>
      <div className="flex items-start gap-2">
        <a role="link" href="#" title={list.title.length > 47 ? list.title : undefined}
          onClick={(event) => { event.preventDefault(); onOpen(list.id); }}
          className="flex-1 min-w-0 text-[13px] font-semibold leading-tight text-gray-50 [overflow-wrap:anywhere] line-clamp-2 after:absolute after:inset-0 after:content-['']">
          {list.title}
        </a>
        {sample ? <SampleBadge className="relative z-10" /> : <>
        <span className={`relative z-10 shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${list.status === "public" ? "bg-emerald-500 text-[#03271b]" : "bg-gray-700 text-gray-300"}`}>
          {list.status === "public" ? t("dashboard.wp3a.card.public") : t("dashboard.wp3a.card.draft")}
        </span>
        <span className="relative z-10 hidden md:inline-flex" onClick={(event) => event.stopPropagation()} title={empty ? t("dashboard.wp3a.card.emptyCantPublish") : undefined}>
          <Switch checked={list.status === "public"} disabled={empty || busy} loading={busy}
            ariaLabel={t("dashboard.wp3a.card.publishSwitch", { name: list.title })}
            onChange={() => onSetStatus(list.id, list.status === "public" ? "draft" : "public")} />
        </span>
        </>}
        <span className="relative z-10">
          <button type="button" aria-haspopup="menu" aria-expanded={menu} aria-label={t("dashboard.wp3a.card.more", { name: list.title })}
            onClick={(event) => { stop(event); setMenu((value) => !value); }}
            className="grid h-[22px] w-6 place-items-center rounded-lg border border-white/[.09] bg-black/35 text-[13px] leading-none text-white min-h-[44px] md:min-h-[22px]">⋯</button>
          {menu && sample && (
            <span role="menu" onClick={stop} className="absolute right-0 top-8 z-20 grid min-w-[150px] rounded-[10px] border border-white/[.09] bg-[#1f2430] p-1 text-xs text-gray-100">
              <button role="menuitem" type="button" disabled={sampleBusy} className="rounded-md px-2.5 py-1.5 text-left hover:bg-white/5 disabled:opacity-50"
                onClick={() => { setMenu(false); setAskMine(true); }}>{t("samples.makeMine", "Make it mine")}</button>
              <button role="menuitem" type="button" className="rounded-md px-2.5 py-1.5 text-left hover:bg-white/5"
                onClick={() => { setMenu(false); onOpen(list.id); }}>{t("samples.open", "Open")}</button>
              <button role="menuitem" type="button" className="rounded-md px-2.5 py-1.5 text-left text-red-300 hover:bg-white/5"
                aria-label={t("samples.deleteSample", "Delete sample")}
                onClick={() => { setMenu(false); setConfirmDelete(true); }}>{t("samples.delete", "Delete")}</button>
            </span>
          )}
          {menu && !sample && (
            <span role="menu" onClick={stop} className="absolute right-0 top-8 z-20 grid min-w-[150px] rounded-[10px] border border-white/[.09] bg-[#1f2430] p-1 text-xs">
              <button role="menuitem" type="button" className="rounded-md px-2.5 py-1.5 text-left hover:bg-white/5 md:hidden"
                onClick={() => { setMenu(false); onSetStatus(list.id, "draft"); }}>{t("dashboard.wp3a.pill.draft")}</button>
              <button role="menuitem" type="button" disabled={empty} className="rounded-md px-2.5 py-1.5 text-left hover:bg-white/5 disabled:opacity-50 md:hidden"
                onClick={() => { setMenu(false); onSetStatus(list.id, "public"); }}>{t("dashboard.wp3a.pill.public")}</button>
              <button role="menuitem" type="button" className="rounded-md px-2.5 py-1.5 text-left hover:bg-white/5"
                onClick={() => { setMenu(false); onMove(list.id, -1); }}>{t("dashboard.wp3a.card.moveEarlier")}</button>
              <button role="menuitem" type="button" className="rounded-md px-2.5 py-1.5 text-left hover:bg-white/5"
                onClick={() => { setMenu(false); onMove(list.id, 1); }}>{t("dashboard.wp3a.card.moveLater")}</button>
            </span>
          )}
        </span>
      </div>
      {list.covers.length > 0 ? (
        <div className="flex gap-1.5">{list.covers.slice(0, shape === "landscape" ? 3 : 4).map((src) => (
          <img key={src} src={src} alt="" loading="lazy" className={`${coverClass} rounded-[5px] object-cover bg-gradient-to-br from-slate-700 to-slate-900`} />
        ))}</div>
      ) : (
        // The empty state follows itemCount (the same source as the count line); items without covers get a blank strip.
        <div className="flex h-12 items-center justify-center rounded-lg border border-dashed border-white/10 text-[11px] text-gray-400">{empty ? t("dashboard.wp3a.card.noItems") : null}</div>
      )}
      <div className="flex items-center gap-2 text-[11px] text-gray-400">
        <span>{t(`dashboard.wp3a.itemCount.${category}`, { count: list.itemCount })}</span>
        {list.pinnedCount > 0 && <span className="text-yellow-500">{t("dashboard.wp3a.card.pinned", { count: list.pinnedCount })}</span>}
      </div>
      {sample && <div className="text-[11px] text-gray-500">{t("samples.onlyYou", "Only you can see this")}</div>}
      {confirmDelete && (
        <SampleDeleteDialog busy={sampleBusy} onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void runSample(commands.remove, t("samples.deletedToast", "Sample deleted"))} />
      )}
      {askMine && (
        <MakeMineSheet title={list.title} itemsLabel={t(`dashboard.wp3a.itemCount.${category}`, { count: list.itemCount })} busy={sampleBusy}
          onCancel={() => setAskMine(false)}
          onConfirm={(name) => void runSample(() => commands.makeMine(name, list.title), t("samples.madeMineToast", "It's yours now: a draft you can edit and publish"))} />
      )}
    </div>
  );
}
