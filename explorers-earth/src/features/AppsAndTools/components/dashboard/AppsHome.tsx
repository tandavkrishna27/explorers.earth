/* eslint-disable @typescript-eslint/no-explicit-any -- legacy owner-read shapes */
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { NavigationStatus } from "../../../navigation/NavigationStatus";
import { useCategoryNavigation } from "../../../navigation/CategoryNavigationProvider";
import { useAppsOwner } from "../../hooks/useAppsOwner";
import { buildLogoUrl } from "../../utils/appHelpers";
import useAuthStore from "../../../../store/store";
import CategoryPage from "../../../shared/category/CategoryPage";
import { toItemTopPicks, toListCards } from "../../../shared/category/models";
import { createLegacyListModal } from "../../../shared/lists/NewListDialog";

/** Kept for pages/Home.tsx and existing tests; renders the shared New list popup. */
export const CreateAppListModal = createLegacyListModal("apps");

const relation = "recommended_apps";
const item = { relation, title: (a: Record<string, any>) => a.title ?? "", image: (a: Record<string, any>) => (a.logo_url ? buildLogoUrl(a.logo_url) : null), subtitle: () => null };

const AppsHome = () => {
  const navigation = useCategoryNavigation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data, loading, error, refetch } = useAppsOwner(undefined, true, true);
  useEffect(() => { if (!loading) (window as any).__dashboardLoaded = true; }, [loading]);
  const lists = useMemo(() => (data?.appLists ?? []) as any[], [data]);
  const cards = useMemo(() => toListCards(lists, { relation, visibility: "Visibility", cover: (a) => (a.logo_url ? buildLogoUrl(a.logo_url) : null) }), [lists]);
  const picks = useMemo(() => toItemTopPicks(lists, item), [lists]);
  const candidates = useMemo(() => toItemTopPicks(lists, item, false), [lists]);
  return (
    <>
      <NavigationStatus navigation={navigation} />
      <CategoryPage
        category="apps"
        status={{ loading, error: (error as Error | null | undefined) ?? null, refreshing: loading && lists.length > 0 }}
        lists={cards} topPicks={picks} pinCandidates={candidates}
        categoryVisibility={navigation.snapshot?.visibility.public_apps === "Yes" ? "public" : "hidden"}
        visibilityBusy={navigation.busy || !navigation.authority}
        onCategoryVisibility={(next) => { if (navigation.authority && !navigation.busy) void navigation.request({ category: "public_apps", action: next === "public" ? "publish" : "unpublish" }, navigation.authority); }}
        onOpenList={(id) => navigate(`/recommendations/apps/${id}`)}
        onRetry={() => { void refetch(); }} onChanged={() => { void refetch(); }}
        newList={{ kind: "dialog", username: user?.username ?? "", onCreated: (id) => navigate(`/recommendations/apps/${id}`, { state: { justCreatedList: true } }) }}
      />
    </>
  );
};

export default AppsHome;
