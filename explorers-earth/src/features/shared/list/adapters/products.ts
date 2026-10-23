import { useMemo } from "react";
import useAuthStore from "../../../../store/store";
import { useProductsCommands } from "../../../Products/api/query";
import { useProductsOwner, invalidateProducts } from "../../../Products/hooks/useProductsOwner";
import { ProductsClient } from "../../../Products/api/productsClient";
import { deduplicateProducts, buildImageUrl, extractNoteText } from "../../../Products/utils/productHelpers";
import { notePreviewText } from "../../../../utils/notePreviewText";
import type { ProductList } from "../../../Products/types";
import { explorersApiClient } from "../../../../lib/explorersApiClient";
import { reorderListItems } from "../../../../lib/reorderListItems";
import { buildListPublicUrl } from "../../../../utils/listShareUrls";
import type { ListPageAdapter, ListItemView, ListView } from "../listPageAdapter";

const MAX_PINS = 15;

// Moved from ProductListView: owner read, publish/pin/remove/archive handlers.
export function useProductsListAdapter(listId: string): ListPageAdapter {
  const { user } = useAuthStore();
  const { data, loading, error, refetch } = useProductsOwner(listId, Boolean(listId), true);
  const commands = useProductsCommands();
  const listData: ProductList | null = data?.productLists?.[0] ?? null;
  const products = useMemo(() => deduplicateProducts(listData?.recommended_products ?? []), [listData]);

  const list: ListView | null = listData ? {
    id: listData.documentId,
    title: listData.List_Name,
    description: listData.list_description ?? null,
    slug: listData.slug,
    coverUrl: listData.cover_image?.url ? buildImageUrl(listData.cover_image.url) : null,
    status: listData.Visibility ? "public" : "draft",
    itemCount: products.length,
    publicUrl: buildListPublicUrl(user?.username, "products", listData.slug),
  } : null;

  const items: ListItemView[] = products.map((p) => ({
    id: p.documentId,
    title: p.title,
    subtitle: p.brand ?? undefined,
    note: notePreviewText(extractNoteText(p.user_recommendation_note)) || undefined,
    imageUrl: buildImageUrl(p.logo_url) || null,
    rating: p.user_rating ?? null,
    pinned: Boolean(p.is_pinned),
  }));

  const observe = () => ProductsClient.observeCollection(listId);

  return {
    category: "products",
    categoryLabel: "Products",
    itemNoun: "product",
    loading: loading && !listData,
    error: error ?? null,
    retry: () => { void refetch(); },
    list,
    items,
    addPath: `/recommendations/products/${listId}/add`,
    editPath: (itemId) => `/recommendations/products/${listId}/edit/${itemId}`,
    setStatus: async (status) => {
      const publish = status === "public";
      if (publish && products.length === 0) throw new Error("Add at least one product before publishing.");
      await commands.updateList(listId, { visibility: publish ? "public" : "private", publicationState: publish ? "published" : "draft" });
    },
    reorder: async (orderedIds) => {
      try { await reorderListItems("products", listId, orderedIds); } finally { invalidateProducts(); }
    },
    togglePin: async (itemId, pinned) => {
      if (pinned && products.filter((p) => p.is_pinned && p.documentId !== itemId).length >= MAX_PINS) {
        throw new Error("Max 15 pinned products allowed.");
      }
      await commands.pin(itemId, listId, pinned);
    },
    removeItem: async (itemId) => { await commands.membership(itemId, listId, false); },
    rename: async ({ title, description, slug }) => {
      const patch = { ...(title === undefined ? {} : { title }), ...(description === undefined ? {} : { description }), ...(slug === undefined ? {} : { slug }) };
      if (Object.keys(patch).length === 0) return;
      const observed = await observe();
      await explorersApiClient.updateMyCollection(observed, patch, crypto.randomUUID());
      invalidateProducts();
    },
    archive: async () => { await commands.archiveList(listId); },
    purge: async () => {
      const observed = await observe();
      await explorersApiClient.purgeMyCollection(observed, crypto.randomUUID());
      invalidateProducts();
    },
  };
}
