import type { ReactNode } from "react";

export type ListCategory = "movies" | "books" | "games" | "apps" | "products" | "people";

export type ListItemView = { id: string; title: string; subtitle?: string; note?: string; imageUrl?: string | null; rating?: number | null; pinned: boolean };

export type ListView = {
  id: string; title: string; description: string | null; slug: string; coverUrl: string | null;
  status: "draft" | "public"; itemCount: number; publicUrl: string;
  /** WP11: a first-visit sample list. */
  isSample?: boolean;
};

// Built per category from that category's existing query/command hooks.
export type ListPageAdapter = {
  category: ListCategory;
  categoryLabel: string;          // "Movies & Shows"
  itemNoun: string;               // "movie"
  loading: boolean;
  error: Error | null;
  retry: () => void;
  list: ListView | null;
  items: ListItemView[];
  addPath: string;                // /recommendations/movies/<id>/add
  editPath: (itemId: string) => string;
  setStatus: (status: "draft" | "public") => Promise<void>;
  reorder: (orderedIds: string[]) => Promise<void>;
  togglePin: (itemId: string, pinned: boolean) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  rename: (patch: { title?: string; description?: string | null; slug?: string; coverFile?: File | null }) => Promise<void>;
  archive: () => Promise<void>;
  purge: () => Promise<void>;
  renderItemDetail?: (itemId: string) => ReactNode; // the category's existing detail modal
};
