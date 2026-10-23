import { useMemo } from "react";
import useAuthStore from "../../../../store/store";
import { useAppsCommands } from "../../../AppsAndTools/api/query";
import { AppsClient } from "../../../AppsAndTools/api/appsClient";
import { useAppsOwner } from "../../../AppsAndTools/hooks/useAppsOwner";
import { deduplicateApps, buildLogoUrl, extractNoteText } from "../../../AppsAndTools/utils/appHelpers";
import { notePreviewText } from "../../../../utils/notePreviewText";
import type { AppList } from "../../../AppsAndTools/types";
import { explorersApiClient } from "../../../../lib/explorersApiClient";
import { reorderListItems } from "../../../../lib/reorderListItems";
import { buildListPublicUrl } from "../../../../utils/listShareUrls";
import type { ListPageAdapter } from "../listPageAdapter";

const MAX_PINS = 15;

/** The Apps list page's data and commands, moved out of AppListView. Commands throw; the tabs report. */
export function useAppsListAdapter(listId: string): ListPageAdapter {
  const user = useAuthStore((state) => state.user) as { username?: string } | null;
  const { data, loading, error, refetch } = useAppsOwner(listId, Boolean(listId), true);
  const commands = useAppsCommands();

  const listData: AppList | null = data?.appLists?.[0] ?? null;
  const apps = useMemo(() => deduplicateApps(listData?.recommended_apps ?? []), [listData]);
  const pinnedCount = apps.filter((app) => app.is_pinned).length;

  const list = listData
    ? {
        id: listData.documentId,
        title: listData.List_Name,
        description: listData.list_description ?? null,
        slug: listData.slug,
        coverUrl: listData.cover_image?.url ?? null,
        status: listData.Visibility ? ("public" as const) : ("draft" as const),
        itemCount: apps.length,
        publicUrl: buildListPublicUrl(user?.username ?? listData.account?.username, "apps", listData.slug),
      }
    : null;

  const items = apps.map((app) => ({
    id: app.documentId,
    title: app.title,
    subtitle: [app.developer, app.price_tier].filter(Boolean).join(" · ") || undefined,
    note: notePreviewText(extractNoteText(app.user_recommendation_note)) || undefined,
    imageUrl: buildLogoUrl(app.logo_url) || null,
    rating: app.user_rating ?? null,
    pinned: Boolean(app.is_pinned),
  }));

  return {
    category: "apps",
    categoryLabel: "Apps & Tools",
    itemNoun: "app",
    loading,
    error: error ?? null,
    retry: refetch,
    list,
    items,
    addPath: `/recommendations/apps/${listId}/add`,
    editPath: (itemId) => `/recommendations/apps/${listId}/edit/${itemId}`,
    setStatus: async (status) => {
      const publish = status === "public";
      if (publish && apps.length === 0) throw new Error("Add at least one app before publishing.");
      await commands.updateList(listId, { visibility: publish ? "public" : "private", publicationState: publish ? "published" : "draft" });
    },
    reorder: async (orderedIds) => { await reorderListItems("apps", listId, orderedIds); refetch(); },
    togglePin: async (itemId, pinned) => {
      const already = apps.some((app) => app.documentId === itemId && app.is_pinned);
      if (pinned && !already && pinnedCount >= MAX_PINS) throw new Error("Max 15 pinned apps allowed.");
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
      const observed = await AppsClient.observeCollection(listId);
      await explorersApiClient.purgeMyCollection(observed, crypto.randomUUID());
    },
  };
}
