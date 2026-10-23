/* eslint-disable @typescript-eslint/no-explicit-any -- legacy owner-read shapes */
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { NavigationStatus } from "../../../navigation/NavigationStatus";
import { useCategoryNavigation } from "../../../navigation/CategoryNavigationProvider";
import { useGamesOwner } from "../../hooks/useGamesOwner";
import { buildCoverUrl } from "../../utils/gameHelpers";
import useAuthStore from "../../../../store/store";
import CategoryPage from "../../../shared/category/CategoryPage";
import { toItemTopPicks, toListCards } from "../../../shared/category/models";
import { createLegacyListModal } from "../../../shared/lists/NewListDialog";

/** Kept for pages/Home.tsx and existing tests; renders the shared New list popup. */
export const CreateGameListModal = createLegacyListModal("games");

const relation = "recommended_games";
const item = { relation, title: (g: Record<string, any>) => g.title ?? "", image: (g: Record<string, any>) => (g.cover_url ? buildCoverUrl(g.cover_url) : null), subtitle: () => null };

const GamesHome = () => {
  const navigation = useCategoryNavigation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data, loading, error, refetch } = useGamesOwner(undefined, true, true);
  useEffect(() => { if (!loading) (window as any).__dashboardLoaded = true; }, [loading]);
  const lists = useMemo(() => (data?.gameLists ?? []) as any[], [data]);
  const cards = useMemo(() => toListCards(lists, { relation, visibility: "Visibility", cover: (g) => (g.cover_url ? buildCoverUrl(g.cover_url) : null) }), [lists]);
  const picks = useMemo(() => toItemTopPicks(lists, item), [lists]);
  const candidates = useMemo(() => toItemTopPicks(lists, item, false), [lists]);
  return (
    <>
      <NavigationStatus navigation={navigation} />
      <CategoryPage
        category="games"
        status={{ loading, error: (error as Error | null | undefined) ?? null, refreshing: loading && lists.length > 0 }}
        lists={cards} topPicks={picks} pinCandidates={candidates}
        categoryVisibility={navigation.snapshot?.visibility.public_games === "Yes" ? "public" : "hidden"}
        visibilityBusy={navigation.busy || !navigation.authority}
        onCategoryVisibility={(next) => { if (navigation.authority && !navigation.busy) void navigation.request({ category: "public_games", action: next === "public" ? "publish" : "unpublish" }, navigation.authority); }}
        onOpenList={(id) => navigate(`/recommendations/games/${id}`)}
        onRetry={() => { void refetch(); }} onChanged={() => { void refetch(); }}
        newList={{ kind: "dialog", username: user?.username ?? "", onCreated: (id) => navigate(`/recommendations/games/${id}`, { state: { justCreatedList: true } }) }}
      />
    </>
  );
};

export default GamesHome;
