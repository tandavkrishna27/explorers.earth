/* eslint-disable @typescript-eslint/no-explicit-any -- legacy owner-read shapes */
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { NavigationStatus } from "../../../navigation/NavigationStatus";
import { useBooksNavigation as useCategoryNavigation } from "../../api/useBooksNavigation";
import { useBooksOwnerContent } from "../../api/useBooksOwnerContent";
import { buildCoverUrl } from "../../utils/bookHelpers";
import useAuthStore from "../../../../store/store";
import CategoryPage from "../../../shared/category/CategoryPage";
import { toItemTopPicks, toListCards } from "../../../shared/category/models";
import { createLegacyListModal } from "../../../shared/lists/NewListDialog";

/** Kept for pages/Home.tsx and existing tests; renders the shared New list popup. */
export const CreateBookListModal = createLegacyListModal("books");

const relation = "recommended_books";
const item = { relation, title: (b: Record<string, any>) => b.title ?? "", image: (b: Record<string, any>) => (b.cover_url ? buildCoverUrl(b.cover_url) : null), subtitle: () => null };

const BooksHome = () => {
  const navigation = useCategoryNavigation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data, loading, error, refetch } = useBooksOwnerContent();
  useEffect(() => { if (!loading) (window as any).__dashboardLoaded = true; }, [loading]);
  const lists = useMemo(() => (data?.bookLists ?? []) as any[], [data]);
  const cards = useMemo(() => toListCards(lists, { relation, visibility: "visibility", cover: (b) => (b.cover_url ? buildCoverUrl(b.cover_url) : null) }), [lists]);
  const picks = useMemo(() => toItemTopPicks(lists, item), [lists]);
  const candidates = useMemo(() => toItemTopPicks(lists, item, false), [lists]);
  return (
    <>
      <NavigationStatus navigation={navigation} />
      <CategoryPage
        category="books"
        status={{ loading, error: (error as Error | null) ?? null, refreshing: loading && lists.length > 0 }}
        lists={cards} topPicks={picks} pinCandidates={candidates}
        categoryVisibility={navigation.snapshot?.visibility.public_books === "Yes" ? "public" : "hidden"}
        visibilityBusy={navigation.busy || !navigation.authority}
        onCategoryVisibility={(next) => { if (navigation.authority && !navigation.busy) void navigation.request({ category: "public_books", action: next === "public" ? "publish" : "unpublish" }, navigation.authority); }}
        onOpenList={(id) => navigate(`/recommendations/books/${id}`)}
        onRetry={() => { void refetch(); }} onChanged={() => { void refetch(); }}
        newList={{ kind: "dialog", username: user?.username ?? "", onCreated: (id) => navigate(`/recommendations/books/${id}`, { state: { justCreatedList: true } }) }}
      />
    </>
  );
};

export default BooksHome;
