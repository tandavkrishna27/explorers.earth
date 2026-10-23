import { useMemo } from "react";
import useAuthStore from "../../../../store/store";
import { useGamesCommands } from "../../../Games/api/query";
import { GamesClient } from "../../../Games/api/gamesClient";
import { useGamesOwner } from "../../../Games/hooks/useGamesOwner";
import { deduplicateGames, buildCoverUrl, extractNoteText } from "../../../Games/utils/gameHelpers";
import { notePreviewText } from "../../../../utils/notePreviewText";
import type { RecommendedGame } from "../../../Games/types";
import { explorersApiClient } from "../../../../lib/explorersApiClient";
import { reorderListItems } from "../../../../lib/reorderListItems";
import { buildListPublicUrl } from "../../../../utils/listShareUrls";
import type { ListPageAdapter } from "../listPageAdapter";

const MAX_TOP_PICKS = 15;

/** The Games list page's data and commands, moved out of GameListView. Commands throw; the tabs report. */
export function useGamesListAdapter(listId: string): ListPageAdapter {
  const user = useAuthStore((state) => state.user) as { username?: string } | null;
  const { data, content, loading, error, refetch } = useGamesOwner(listId, Boolean(listId), true);
  const commands = useGamesCommands();

  const rawList = data?.gameLists?.[0];
  const games: RecommendedGame[] = useMemo(() => deduplicateGames(rawList?.recommended_games), [rawList]);
  const allCategoryGames = content?.view.lists.flatMap((candidate) => candidate.recommended_games) ?? [];
  const pinnedGames = deduplicateGames(allCategoryGames.filter((game) => game.is_pinned));

  const list = rawList
    ? {
        id: rawList.documentId,
        title: rawList.List_Name,
        description: rawList.list_description ?? null,
        slug: rawList.slug,
        coverUrl: rawList.cover_image?.url ?? null,
        status: rawList.Visibility ? ("public" as const) : ("draft" as const),
        itemCount: games.length,
        publicUrl: buildListPublicUrl(rawList.account?.username ?? user?.username, "games", rawList.slug),
      }
    : null;

  const items = games.map((game) => ({
    id: game.documentId,
    title: game.title,
    subtitle: [game.developer, game.release_year].filter(Boolean).join(" · ") || undefined,
    note: notePreviewText(extractNoteText(game.user_recommendation_note)) || undefined,
    imageUrl: buildCoverUrl(game.cover_url_large || game.cover_url) || null,
    rating: game.user_rating ?? null,
    pinned: Boolean(game.is_pinned),
  }));

  return {
    category: "games",
    categoryLabel: "Games",
    itemNoun: "game",
    loading,
    error: error ?? null,
    retry: refetch,
    list,
    items,
    addPath: `/recommendations/games/${listId}/add`,
    editPath: (itemId) => `/recommendations/games/${listId}/edit/${itemId}`,
    setStatus: async (status) => {
      const publish = status === "public";
      if (publish && games.length === 0) throw new Error("Add at least one game before publishing.");
      await commands.updateList(listId, { visibility: publish ? "public" : "private", publicationState: publish ? "published" : "draft" });
    },
    reorder: async (orderedIds) => { await reorderListItems("games", listId, orderedIds); refetch(); },
    togglePin: async (itemId, pinned) => {
      if (pinned && pinnedGames.length >= MAX_TOP_PICKS && !pinnedGames.some((game) => game.documentId === itemId)) {
        throw new Error("Max 15 top picks allowed.");
      }
      await commands.pin(itemId, listId, pinned);
    },
    removeItem: async (itemId) => { await commands.membership(itemId, listId, false); },
    rename: async ({ title, description, slug, coverFile }) => {
      const coverMediaId = coverFile === undefined ? undefined : coverFile === null ? null : (await explorersApiClient.createMedia(coverFile, "collection")).id;
      await commands.updateList(listId, {
        ...(title === undefined ? {} : { title }),
        ...(description === undefined ? {} : { description: description ?? "" }),
        ...(slug === undefined ? {} : { slug }),
        ...(coverMediaId === undefined ? {} : { coverMediaId }),
      });
    },
    archive: async () => { await commands.archiveList(listId); },
    purge: async () => {
      const observed = await GamesClient.observeCollection(listId);
      await explorersApiClient.purgeMyCollection(observed, crypto.randomUUID());
    },
  };
}
