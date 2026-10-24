import { useBooksOwnerContent } from "../../../Books/api/useBooksOwnerContent";
import { useBookListCommands } from "../../../Books/api/useBookListCommands";
import { booksCommandKey } from "../../../Books/api/booksClient";
import { buildCoverUrl, deduplicateBooks, formatAuthors, extractNoteText } from "../../../Books/utils/bookHelpers";
import { notePreviewText } from "../../../../utils/notePreviewText";
import type { RecommendedBook } from "../../../Books/types";
import { explorersApiClient } from "../../../../lib/explorersApiClient";
import { reorderListItems } from "../../../../lib/reorderListItems";
import { buildListPublicUrl } from "../../../../utils/listShareUrls";
import useAuthStore from "../../../../store/store";
import { readIsSample } from "../../samples/readIsSample";
import type { ListPageAdapter } from "../listPageAdapter";

const MAX_PINS = 15;

/** The Books list page's data and commands, moved out of BookListView. */
export function useBooksListAdapter(listId: string): ListPageAdapter {
  const { user } = useAuthStore();
  const { data, content, loading, error, refetch } = useBooksOwnerContent(listId);
  const { update: updateBookList, archive: archiveBookList } = useBookListCommands();

  const rawList = data?.bookLists?.[0];
  const books: RecommendedBook[] = deduplicateBooks(rawList?.recommended_books);
  const pinnedCount = content?.observation.topPicks?.length ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const username = rawList?.account?.username ?? (user as any)?.username ?? "";

  return {
    category: "books",
    categoryLabel: "Books",
    itemNoun: "book",
    loading,
    error: error ?? null,
    retry: () => { void refetch(); },
    list: rawList
      ? {
        id: rawList.documentId,
        title: rawList.List_Name,
        description: rawList.list_description ?? null,
        slug: rawList.slug,
        coverUrl: null,
        status: rawList.visibility ? "public" : "draft",
        itemCount: books.length,
        publicUrl: buildListPublicUrl(username, "books", rawList.slug),
        ...(readIsSample(rawList) ? { isSample: true } : {}),
      }
      : null,
    items: books.map((book) => {
      const authors = formatAuthors(book.authors);
      return {
        id: book.documentId,
        title: book.title,
        subtitle: [authors !== "Unknown Author" ? authors : null, book.year].filter(Boolean).join(" · ") || undefined,
        note: notePreviewText(extractNoteText(book.user_recommendation_note)) || undefined,
        imageUrl: buildCoverUrl(book.cover_url_large || book.cover_url) || null,
        rating: book.user_rating ?? null,
        pinned: Boolean(book.is_pinned),
      };
    }),
    addPath: `/recommendations/books/${listId}/add`,
    editPath: (itemId) => `/recommendations/books/${listId}/edit/${itemId}`,
    setStatus: async (status) => {
      if (status === "public" && books.length === 0) throw new Error("Add at least one book before publishing.");
      await updateBookList({ variables: { documentId: listId, visibility: status === "public" } });
      void refetch();
    },
    reorder: async (orderedIds) => {
      await reorderListItems("books", listId, orderedIds);
      void refetch();
    },
    togglePin: async (itemId, pinned) => {
      const current = books.find((b) => b.documentId === itemId);
      if (pinned && !current?.is_pinned && pinnedCount >= MAX_PINS) throw new Error("Max 15 top reads allowed.");
      if (!content || !listId) throw new Error("Refresh Books before saving pins");
      const pins = (content.observation.topPicks ?? []).filter((pin) => pin.recommendationId !== itemId).map((pin) => ({ recommendationId: pin.recommendationId, collectionId: pin.collectionId }));
      if (pinned) pins.push({ recommendationId: itemId, collectionId: listId });
      await explorersApiClient.setMyCategoryTopPicks(content.observation, pins, booksCommandKey());
      void refetch();
    },
    removeItem: async (itemId) => {
      const observation = content?.details.get(itemId);
      if (!observation) throw new Error("Refresh Books before deleting");
      await explorersApiClient.archiveMyRecommendation(observation, booksCommandKey());
      void refetch();
    },
    rename: async ({ title, description, slug }) => {
      await updateBookList({
        variables: {
          documentId: listId,
          ...(title === undefined ? {} : { List_Name: title }),
          ...(description === undefined ? {} : { list_description: description }),
          ...(slug === undefined ? {} : { slug }),
        },
      });
      void refetch();
    },
    archive: async () => { await archiveBookList({ variables: { documentId: listId } }); },
    purge: async () => {
      const observed = await explorersApiClient.getMyEditableCollection(listId);
      await explorersApiClient.purgeMyCollection(observed, booksCommandKey());
    },
  };
}
