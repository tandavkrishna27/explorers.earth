/* eslint-disable @typescript-eslint/no-explicit-any -- legacy owner-read shapes */
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { NavigationStatus } from "../../../navigation/NavigationStatus";
import { useCategoryNavigation } from "../../../navigation/CategoryNavigationProvider";
import { usePeopleOwner } from "../../hooks/usePeopleOwner";
import { buildImageUrl } from "../../utils/personHelpers";
import useAuthStore from "../../../../store/store";
import CategoryPage from "../../../shared/category/CategoryPage";
import { toItemTopPicks, toListCards } from "../../../shared/category/models";
import { createLegacyListModal } from "../../../shared/lists/NewListDialog";

/** Kept for pages/Home.tsx and existing tests; renders the shared New list popup. */
export const CreatePersonListModal = createLegacyListModal("people");

const relation = "recommended_people";
const name = (p: Record<string, any>) => p.full_name ?? p.name ?? "";
const avatar = (p: Record<string, any>) => (p.avatar_url ? buildImageUrl(p.avatar_url) : null);
const item = { relation, title: name, image: avatar, subtitle: () => null };

const PeopleHome = () => {
  const navigation = useCategoryNavigation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data, loading, error, refetch } = usePeopleOwner(undefined, true, true);
  useEffect(() => { if (!loading) (window as any).__dashboardLoaded = true; }, [loading]);
  const lists = useMemo(() => (data?.personLists ?? []) as any[], [data]);
  const cards = useMemo(() => toListCards(lists, { relation, visibility: "Visibility", cover: avatar }), [lists]);
  const picks = useMemo(() => toItemTopPicks(lists, item), [lists]);
  const candidates = useMemo(() => toItemTopPicks(lists, item, false), [lists]);
  return (
    <>
      <NavigationStatus navigation={navigation} />
      <CategoryPage
        category="people"
        status={{ loading, error: (error as Error | null | undefined) ?? null, refreshing: loading && lists.length > 0 }}
        lists={cards} topPicks={picks} pinCandidates={candidates}
        categoryVisibility={navigation.snapshot?.visibility.public_people === "Yes" ? "public" : "hidden"}
        visibilityBusy={navigation.busy || !navigation.authority}
        onCategoryVisibility={(next) => { if (navigation.authority && !navigation.busy) void navigation.request({ category: "public_people", action: next === "public" ? "publish" : "unpublish" }, navigation.authority); }}
        onOpenList={(id) => navigate(`/recommendations/people/${id}`)}
        onRetry={() => { void refetch(); }} onChanged={() => { void refetch(); }}
        newList={{ kind: "dialog", username: user?.username ?? "", onCreated: (id) => navigate(`/recommendations/people/${id}`, { state: { justCreatedList: true } }) }}
      />
    </>
  );
};

export default PeopleHome;
