import { useMemo } from "react";
import useAuthStore from "../../../../store/store";
import { usePeopleCommands } from "../../../People/api/query";
import { usePeopleOwner, invalidatePeople } from "../../../People/hooks/usePeopleOwner";
import { PeopleClient } from "../../../People/api/peopleClient";
import { deduplicatePeople, buildImageUrl, extractNoteText } from "../../../People/utils/personHelpers";
import { notePreviewText } from "../../../../utils/notePreviewText";
import type { PersonList } from "../../../People/types";
import { explorersApiClient } from "../../../../lib/explorersApiClient";
import { reorderListItems } from "../../../../lib/reorderListItems";
import { buildListPublicUrl } from "../../../../utils/listShareUrls";
import { readIsSample } from "../../samples/readIsSample";
import type { ListPageAdapter, ListItemView, ListView } from "../listPageAdapter";

const MAX_PINS = 15;

// Moved from PersonListView: owner read, publish/pin/remove/archive handlers.
export function usePeopleListAdapter(listId: string): ListPageAdapter {
  const { user } = useAuthStore();
  const { data, loading, error, refetch } = usePeopleOwner(listId, Boolean(listId), true);
  const commands = usePeopleCommands();
  const listData: PersonList | null = data?.personLists?.[0] ?? null;
  const people = useMemo(() => deduplicatePeople(listData?.recommended_people ?? []), [listData]);

  const list: ListView | null = listData ? {
    id: listData.documentId,
    title: listData.List_Name,
    description: listData.list_description ?? null,
    slug: listData.slug,
    coverUrl: listData.cover_image?.url ? buildImageUrl(listData.cover_image.url) : null,
    status: listData.Visibility ? "public" : "draft",
    itemCount: people.length,
    publicUrl: buildListPublicUrl(user?.username, "people", listData.slug),
    ...(readIsSample(listData) ? { isSample: true } : {}),
  } : null;

  const items: ListItemView[] = people.map((p) => ({
    id: p.documentId,
    title: p.full_name ?? "",
    subtitle: p.handle ? `@${p.handle}` : p.headline ?? undefined,
    note: notePreviewText(extractNoteText(p.user_recommendation_note)) || undefined,
    imageUrl: buildImageUrl(p.avatar_url) || null,
    rating: p.user_rating ?? null,
    pinned: Boolean(p.is_pinned),
  }));

  const observe = () => PeopleClient.observeCollection(listId);

  return {
    category: "people",
    categoryLabel: "People",
    itemNoun: "person",
    loading: loading && !listData,
    error: error ?? null,
    retry: () => { void refetch(); },
    list,
    items,
    addPath: `/recommendations/people/${listId}/add`,
    editPath: (itemId) => `/recommendations/people/${listId}/edit/${itemId}`,
    setStatus: async (status) => {
      const publish = status === "public";
      if (publish && people.length === 0) throw new Error("Add at least one person before publishing.");
      await commands.updateList(listId, { visibility: publish ? "public" : "private", publicationState: publish ? "published" : "draft" });
    },
    reorder: async (orderedIds) => {
      try { await reorderListItems("people", listId, orderedIds); } finally { invalidatePeople(); }
    },
    togglePin: async (itemId, pinned) => {
      if (pinned && people.filter((p) => p.is_pinned && p.documentId !== itemId).length >= MAX_PINS) {
        throw new Error("Max 15 pinned people allowed.");
      }
      await commands.pin(itemId, listId, pinned);
    },
    removeItem: async (itemId) => { await commands.membership(itemId, listId, false); },
    rename: async ({ title, description, slug }) => {
      const patch = { ...(title === undefined ? {} : { title }), ...(description === undefined ? {} : { description }), ...(slug === undefined ? {} : { slug }) };
      if (Object.keys(patch).length === 0) return;
      const observed = await observe();
      await explorersApiClient.updateMyCollection(observed, patch, crypto.randomUUID());
      invalidatePeople();
    },
    archive: async () => { await commands.archiveList(listId); },
    purge: async () => {
      const observed = await observe();
      await explorersApiClient.purgeMyCollection(observed, crypto.randomUUID());
      invalidatePeople();
    },
  };
}
