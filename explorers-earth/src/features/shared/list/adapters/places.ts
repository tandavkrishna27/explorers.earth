import { createElement, useMemo } from "react";
import useAuthStore from "../../../../store/store";
import { usePlacesOwner } from "../../../Favorites/hooks/usePlacesOwner";
import { usePlacesCommands } from "../../../Favorites/api/placesCommands";
import { PlacesClient } from "../../../Favorites/api/placesClient";
import { explorersApiClient } from "../../../../lib/explorersApiClient";
import { notePreviewText } from "../../../../utils/notePreviewText";
import { buildListPublicUrl } from "../../../../utils/listShareUrls";
import PlacesManageExtras from "../../../Favorites/components/PlacesManageExtras";
import type { ListPageAdapter } from "../listPageAdapter";

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** The Places list page's data and commands on the shared list template (WP6). Commands throw; the tabs report. */
export function usePlacesListAdapter(listId: string): ListPageAdapter {
  const user = useAuthStore((state) => state.user) as { username?: string } | null;
  const { data, content, loading, error, refetch } = usePlacesOwner(listId, Boolean(listId), true);
  const commands = usePlacesCommands(listId);

  const rawList = data?.recommendationLists?.[0];
  const places = useMemo(() => rawList?.recommended_places ?? [], [rawList]);

  const list = rawList
    ? {
        id: rawList.documentId,
        title: rawList.List_Name,
        description: rawList.List_Name_Details?.note ?? null,
        slug: rawList.slug,
        coverUrl: rawList.cover_image?.url ?? null,
        status: rawList.Visibility ? ("public" as const) : ("draft" as const),
        itemCount: places.length,
        publicUrl: buildListPublicUrl(rawList.account?.username ?? user?.username, "places", rawList.slug),
      }
    : null;

  const items = places.map((place) => ({
    id: place.documentId,
    title: place.Place_Details?.Title ?? "Unnamed place",
    subtitle: [place.placesTaxonomy?.category?.label, place.Place_Details?.Place_Address].filter(Boolean).join(" · ") || undefined,
    note: notePreviewText(stripHtml(place.user_recommendation_note ?? "")) || undefined,
    imageUrl: place.media_details?.thumbnail?.url ?? null,
    rating: place.user_rating ?? null,
    pinned: Boolean(place.is_pinned),
  }));

  return {
    category: "places",
    categoryLabel: "Places",
    itemNoun: "place",
    loading,
    error: error ?? null,
    retry: refetch,
    list,
    items,
    addPath: `/recommendations/places/${listId}/add`,
    editPath: (itemId) => `/recommendations/places/${listId}/edit/${itemId}`,
    setStatus: async (status) => {
      const publish = status === "public";
      if (publish && places.length === 0) throw new Error("Add at least one place before publishing.");
      // Publishing a list publishes its places too, or the public list would be empty.
      await commands.publishListWithPlaces(listId, publish, places.map((place) => place.documentId));
    },
    reorder: async (orderedIds) => { await commands.reorderList(listId, orderedIds); },
    togglePin: async () => {
      // Places Top Picks are whole lists (categoryConfig topPicks: "lists").
      throw new Error("Places pins whole lists. Pin this list from the Places page.");
    },
    removeItem: async (itemId) => { await commands.membership(itemId, listId, false); },
    rename: async ({ title, description, slug, coverFile }) => {
      const coverMediaId = coverFile === undefined ? undefined : coverFile === null ? null : (await commands.upload(coverFile, "collection")).id;
      await commands.updateList(listId, {
        ...(title === undefined ? {} : { title }),
        ...(description === undefined ? {} : { description }),
        ...(slug === undefined ? {} : { slug }),
        ...(coverMediaId === undefined ? {} : { coverMediaId }),
      });
    },
    archive: async () => { await commands.archiveList(listId); },
    renderManageExtras: () => createElement(PlacesManageExtras, {
      // Remount once the location detail arrives so the field starts from the stored link.
      key: `${listId}:${content?.lists.get(listId)?.detail.placeLocation ? "loaded" : "pending"}`,
      location: content?.lists.get(listId)?.detail.placeLocation ?? null,
      save: (details) => commands.setLocation(listId, details),
    }),
    purge: async () => {
      const observed = await PlacesClient.observeCollection(listId);
      await explorersApiClient.purgeMyCollection(observed, crypto.randomUUID());
    },
  };
}
