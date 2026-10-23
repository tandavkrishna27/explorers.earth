import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import ListTabs, { type TabKey } from "./ListTabs";
import RecommendationsTab from "./RecommendationsTab";
import ShareTab from "./ShareTab";
import ManageTab from "./ManageTab";
import PublishPill from "../../../components/controls/PublishPill";
import type { ListPageAdapter } from "./listPageAdapter";
import DashboardPageContainer from "../../../components/layout/DashboardPageContainer";
import { SampleBadge } from "../samples/SampleBadge";
import { SampleActions } from "../samples/SampleActions";
import { isSamplePublishRefusal, useSampleCommands } from "../samples/useSampleCommands";

type Props = { adapter: ListPageAdapter; onMount?: (tab: TabKey) => void };

export default function ListPage({ adapter, onMount }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("recs");
  const cannotPublish = t("samples.cannotPublish", "Samples can't be published. Make it mine to edit and publish it.");
  const { list } = adapter;
  // The pill fires and forgets; a refused change (e.g. publishing an empty list) is shown here.
  const setStatus = async (status: "draft" | "public") => {
    try { await adapter.setStatus(status); }
    catch (error) { toast.error(isSamplePublishRefusal(error) ? cannotPublish : (error as Error).message); }
  };
  const back = () => navigate(`/recommendations/${adapter.category}`); // replaced by WP1 originBack when merged
  // WP11: a sample can't be published; Make it mine turns it into a normal draft in place.
  const sample = list?.isSample === true;
  const { makeMine } = useSampleCommands(list?.id ?? "", adapter.retry);

  if (!list && adapter.error) {
    return (
      <DashboardPageContainer className="grid gap-3 py-4"><div role="alert" className="grid gap-3">
        <p>{t("dashboard.wp3b.listLoadFailed", "This list didn't load.")}</p>
        <button type="button" onClick={adapter.retry} className="justify-self-start rounded-xl bg-blue-400 px-4 py-2 text-white">{t("dashboard.wp3b.retry", "Try again")}</button>
      </div></DashboardPageContainer>
    );
  }
  return (
    <DashboardPageContainer className="grid gap-3 pb-24">
      <button type="button" onClick={back} className="justify-self-start text-[10px] uppercase tracking-[.08em] text-gray-400">
        ‹ {t("dashboard.wp3b.backTo", "Back to {{category}}", { category: adapter.categoryLabel }).replace("{{category}}", adapter.categoryLabel)}
      </button>
      <div className="flex items-start gap-2">
        <h1 className="min-w-0 flex-1 break-words text-xl font-bold line-clamp-2" title={list?.title}>{list?.title ?? <span className="block h-6 w-48 animate-pulse rounded bg-white/10" />}</h1>
        {list && <PublishPill kind="list" value={list.status} privateComingSoon onChange={setStatus}
          disabled={sample} disabledReason={sample ? cannotPublish : undefined} />}
      </div>
      {list && sample && (
        <>
          <div className="-mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <SampleBadge />
            <span>{t("samples.onlyYouCantPublish", "Only you can see this · can't be published")}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-yellow-400/30 bg-yellow-400/[.06] p-3">
            <p className="m-0 min-w-0 flex-1 text-sm text-gray-200">{t("samples.bar", "A sample to show how a list works. Keep it, delete it, or make it yours to edit and publish.")}</p>
            <SampleActions
              onMakeMine={async () => {
                try { await makeMine(); toast.success(t("samples.madeMineToast", "It's yours now. Edit it and publish when ready.")); }
                catch (error) { toast.error((error as Error).message); throw error; }
              }}
              onDelete={async () => {
                try { await adapter.purge(); toast.success(t("samples.deletedToast", "Sample deleted")); back(); }
                catch (error) { toast.error((error as Error).message); throw error; }
              }} />
          </div>
        </>
      )}
      <ListTabs active={tab} onChange={setTab}
        labels={{ recs: t("dashboard.wp3b.tabRecs", "Recommendations"), share: t("dashboard.wp3b.tabShare", "Share"), manage: t("dashboard.wp3b.tabManage", "Manage") }}
        trailing={tab === "recs" && adapter.items.length > 0 ? <button type="button" onClick={() => navigate(adapter.addPath)} className="hidden rounded-xl bg-blue-400 px-3 py-1.5 text-sm text-white sm:inline-flex">＋ {t("dashboard.wp3b.addItem", "Add item")}</button> : null}
        panels={{
          recs: <Mounted tab="recs" onMount={onMount}><RecommendationsTab adapter={adapter} active={tab === "recs"} /></Mounted>,
          share: <Mounted tab="share" onMount={onMount}>{sample ? <p className="pt-3 text-sm text-gray-400">{t("samples.cannotShare", "Samples can't be shared. Make it yours to publish and share it.")}</p> : <ShareTab adapter={adapter} />}</Mounted>,
          manage: <Mounted tab="manage" onMount={onMount}><ManageTab adapter={adapter} /></Mounted>,
        }} />
    </DashboardPageContainer>
  );
}

function Mounted({ tab, onMount, children }: { tab: TabKey; onMount?: (tab: TabKey) => void; children: ReactNode }) {
  useEffect(() => { onMount?.(tab); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{children}</>;
}
