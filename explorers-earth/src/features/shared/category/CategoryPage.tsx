import { useCallback, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BottomAddButton, PublishPill } from "./controls";
import ListCard from "./ListCard";
import { CATEGORY_CONFIG, type CategoryKey } from "./categoryConfig";
import type { ListCardModel, ListStatus, TopPickModel } from "./models";
import { orderLists, setListStatus } from "./listWrites";
import { useCardReorder } from "./useCardReorder";
import TopPicksHero from "../topPicks/TopPicksHero";
import TopPicksManager from "../topPicks/TopPicksManager";
import NewListDialog, { type NewListCreate } from "../lists/NewListDialog";
import { RestoreListButton } from "./restoreButton";
import DashboardPageContainer from "../../../components/layout/DashboardPageContainer";

export interface CategoryPageProps {
  category: CategoryKey;
  status: { loading: boolean; error: Error | null; refreshing: boolean };
  lists: ListCardModel[];
  /** Archived lists of this category; the Archived filter shows only when non-empty. */
  archivedLists?: ListCardModel[];
  /** Current pins in order. */
  topPicks: TopPickModel[];
  /** Everything that can be pinned (items mode: every unique item; lists mode: every list). */
  pinCandidates: TopPickModel[];
  categoryVisibility: "public" | "hidden";
  visibilityBusy: boolean;
  onCategoryVisibility: (next: "public" | "hidden") => void;
  onOpenList: (id: string) => void;
  onRetry: () => void;
  /** Called after any write so the wrapper can invalidate and refetch. */
  onChanged: () => void;
  /** Overrides the generic publish write (Guides keeps its own guarded write). */
  onSetListStatus?: (id: string, next: ListStatus) => Promise<unknown>;
  newList: { kind: "dialog"; username: string; onCreated: (id: string) => void; create?: NewListCreate } | { kind: "navigate"; onNew: () => void };
  /** Category-specific row under the header (Guides' location filter until WP9). */
  toolbar?: ReactNode;
}

export default function CategoryPage(props: CategoryPageProps) {
  const { t } = useTranslation();
  const { category, status, lists, onChanged } = props;
  const config = CATEGORY_CONFIG[category];
  const title = t(`dashboard.wp3a.titles.${category}`);
  const newLabel = category === "guides" ? t("dashboard.wp3a.newGuide") : t("dashboard.wp3a.newList");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  /** The button that opened the manager; focus returns to it on close (Task 11). */
  const managerOpener = useRef<HTMLElement | null>(null);
  const openManager = () => { managerOpener.current = document.activeElement as HTMLElement | null; setManagerOpen(true); };
  const closeManager = () => { setManagerOpen(false); const opener = managerOpener.current; managerOpener.current = null; requestAnimationFrame(() => opener?.focus()); };
  const [busyId, setBusyId] = useState<string | null>(null);
  const archived = props.archivedLists ?? [];
  const [filter, setFilter] = useState<"active" | "archived">("active");

  const startNew = () => (props.newList.kind === "navigate" ? props.newList.onNew() : setDialogOpen(true));
  const commitOrder = useCallback(async (ids: string[]) => {
    try { await orderLists(category, ids); toast.success(t("dashboard.wp3a.toasts.orderSaved")); }
    catch (error) { toast.error(t("dashboard.wp3a.toasts.orderFailed")); throw error; }
    finally { onChanged(); }
  }, [category, onChanged, t]);
  const reorder = useCardReorder(lists.map((list) => list.id), commitOrder);
  const byId = new Map(lists.map((list) => [list.id, list]));

  const setStatus = async (id: string, next: ListStatus) => {
    setBusyId(id);
    try {
      await (props.onSetListStatus ?? setListStatus)(id, next);
      toast.success(next === "public" ? t("dashboard.wp3a.toasts.nowPublic") : t("dashboard.wp3a.toasts.nowDraft"));
      onChanged();
    } catch { toast.error(t("dashboard.wp3a.toasts.statusFailed")); }
    finally { setBusyId(null); }
  };

  const showSkeleton = status.loading && lists.length === 0;
  const showError = Boolean(status.error) && !status.loading;
  // WP11: once the owner removes their last sample, the page shows the ordinary empty state, not first-visit.
  const [sampleTouched, setSampleTouched] = useState(false);
  const sampleChanged = useCallback(() => { setSampleTouched(true); onChanged(); }, [onChanged]);
  const heroState = lists.length === 0 ? (sampleTouched ? "empty" : "firstVisit") : props.topPicks.length === 0 ? "empty" : "picks";

  return (
    <DashboardPageContainer className="grid gap-3.5 pb-28 pt-2 md:pb-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* The header already shows the category name; this heading stays for assistive tech only. */}
        <h2 className="sr-only">{title}</h2>
        <PublishPill kind="category" value={props.categoryVisibility} categoryName={title} disabled={props.visibilityBusy} onChange={props.onCategoryVisibility} />
        <button type="button" onClick={startNew}
          className="hidden md:inline-flex rounded-xl bg-[#60a5fa] px-3.5 py-[7px] text-[13px] font-medium text-white whitespace-nowrap">＋ {newLabel}</button>
      </div>
      {props.toolbar}
      {archived.length > 0 && (
        <div role="radiogroup" aria-label={t("dashboard.wp3a.archive.archived")} className="flex gap-2">
          {(["active", "archived"] as const).map((key) => (
            <button key={key} type="button" role="radio" aria-checked={filter === key} onClick={() => setFilter(key)}
              className={`min-h-[44px] rounded-full px-3 text-xs ${filter === key ? "bg-white/10 text-gray-50" : "text-gray-400"}`}>
              {t(`dashboard.wp3a.archive.${key}`)}
            </button>
          ))}
        </div>
      )}
      {status.refreshing && lists.length > 0 && <p className="m-0 text-xs text-gray-400" aria-live="polite">{t("dashboard.wp3a.states.refreshing")}</p>}
      {showError && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-400/40 bg-red-400/5 px-3 py-2.5 text-sm text-red-300">
          <span className="flex-1">{t("dashboard.wp3a.states.loadError")}</span>
          <button type="button" onClick={props.onRetry} className="rounded-xl border border-white/10 px-3 py-1.5 text-gray-100">{t("dashboard.wp3a.states.retry")}</button>
        </div>
      )}
      {filter === "archived" && archived.length > 0 ? (
        <ul data-testid="archived-lists" className="m-0 grid list-none gap-2 p-0">
          {archived.map((list) => (
            <li key={list.id} className="flex items-center gap-3 rounded-[14px] border border-white/10 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-gray-100">{list.title}</span>
              <RestoreListButton listId={list.id} category={category} onRestored={() => { setFilter("active"); onChanged(); }} />
            </li>
          ))}
        </ul>
      ) : showSkeleton ? (
        <div role="status" aria-label={t("dashboard.wp3a.states.loading")} className="grid gap-3.5">
          <div className="h-60 rounded-[18px] skeleton-shimmer bg-[#151a25]" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-[130px] rounded-[14px] bg-[#151a25] skeleton-shimmer" />)}</div>
        </div>
      ) : (
        <>
          <TopPicksHero category={category} state={heroState} picks={props.topPicks} onOpenPick={(pick) => props.onOpenList(pick.listId)} onManage={openManager} />
          {lists.length === 0 && !showError ? (
            <button type="button" onClick={startNew}
              className="grid min-h-[130px] place-items-center rounded-2xl border-[1.5px] border-dashed border-blue-400/45 px-4 py-8 text-center text-[15px] font-semibold text-blue-400">
              ＋ {t("dashboard.wp3a.states.firstList")}
            </button>
          ) : lists.length > 0 ? (
            <div data-testid="list-grid" className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <button type="button" onClick={startNew}
                className="grid min-h-[130px] place-items-center rounded-[14px] border-[1.5px] border-dashed border-blue-400/45 text-[13px] text-blue-400">
                <span>＋<br />{newLabel}</span>
              </button>
              {reorder.order.map((id) => byId.get(id)).filter((list): list is ListCardModel => Boolean(list)).map((list) => (
                <ListCard key={list.id} category={category} list={list} busy={busyId === list.id}
                  dragging={reorder.dragging === list.id} over={reorder.over === list.id} picked={reorder.picked === list.id}
                  onOpen={props.onOpenList} onSetStatus={setStatus} onMove={reorder.moveBy} onSampleChanged={sampleChanged}
                  grip={{
                    onKeyDown: (event) => reorder.onGripKey(list.id, event.nativeEvent),
                    onDragStart: () => reorder.dragStart(list.id), onDragOver: () => reorder.dragOver(list.id),
                    onDrop: reorder.drop, onDragEnd: reorder.dragEnd,
                  }} />
              ))}
            </div>
          ) : null}
        </>
      )}
      <BottomAddButton label={newLabel} onClick={startNew} hidden={showSkeleton} />
      {props.newList.kind === "dialog" && (
        <NewListDialog open={dialogOpen} category={category} username={props.newList.username} create={props.newList.create}
          onClose={() => setDialogOpen(false)}
          onCreated={(id) => { setDialogOpen(false); onChanged(); (props.newList as { onCreated: (id: string) => void }).onCreated(id); }} />
      )}
      {managerOpen && (
        <TopPicksManager category={category} mode={config.topPicks} limit={config.pinLimit} pinned={props.topPicks.filter((pick) => pick.pinned)} candidates={props.pinCandidates}
          onClose={closeManager} onSaved={() => { closeManager(); onChanged(); }} />
      )}
    </DashboardPageContainer>
  );
}
