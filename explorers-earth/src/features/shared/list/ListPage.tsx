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

type Props = { adapter: ListPageAdapter; onMount?: (tab: TabKey) => void };

export default function ListPage({ adapter, onMount }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("recs");
  const { list } = adapter;
  // The pill fires and forgets; a refused change (e.g. publishing an empty list) is shown here.
  const setStatus = async (status: "draft" | "public") => {
    try { await adapter.setStatus(status); } catch (error) { toast.error((error as Error).message); }
  };
  const back = () => navigate(`/recommendations/${adapter.category}`); // replaced by WP1 originBack when merged

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
        {list && <PublishPill kind="list" value={list.status} privateComingSoon onChange={setStatus} />}
      </div>
      <ListTabs active={tab} onChange={setTab}
        labels={{ recs: t("dashboard.wp3b.tabRecs", "Recommendations"), share: t("dashboard.wp3b.tabShare", "Share"), manage: t("dashboard.wp3b.tabManage", "Manage") }}
        trailing={tab === "recs" && adapter.items.length > 0 ? <button type="button" onClick={() => navigate(adapter.addPath)} className="hidden rounded-xl bg-blue-400 px-3 py-1.5 text-sm text-white sm:inline-flex">＋ {t("dashboard.wp3b.addItem", "Add item")}</button> : null}
        panels={{
          recs: <Mounted tab="recs" onMount={onMount}><RecommendationsTab adapter={adapter} active={tab === "recs"} /></Mounted>,
          share: <Mounted tab="share" onMount={onMount}><ShareTab adapter={adapter} /></Mounted>,
          manage: <Mounted tab="manage" onMount={onMount}><ManageTab adapter={adapter} /></Mounted>,
        }} />
    </DashboardPageContainer>
  );
}

function Mounted({ tab, onMount, children }: { tab: TabKey; onMount?: (tab: TabKey) => void; children: ReactNode }) {
  useEffect(() => { onMount?.(tab); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{children}</>;
}
