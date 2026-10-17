// ============================================================
// Games Feature — TypeScript Types
// ============================================================

// --- Strapi Entity Types ---

export interface GameList {
  documentId: string;
  List_Name: string;
  list_description: string | null;
  slug: string;
  Visibility: boolean;
  cover_image: { url: string; alternativeText: string | null } | null;
  display_order: number;
  top_picks_heading: string | null;
  recommended_games: RecommendedGame[];
  account: { documentId: string; username: string };
}

export interface RecommendedGame {
  documentId: string;
  igdb_id: number | null;
  entity_id?: string;
  igdb_slug: string | null;
  title: string;
  cover_url: string | null;
  cover_url_large: string | null;
  igdb_image_id: string | null;
  summary: string | null;
  release_date: string | null;
  release_year: string | null;
  igdb_rating: number | null;
  igdb_rating_count: number | null;
  genres: string[] | null;
  platforms: string[] | null;
  developer: string | null;
  publisher: string | null;
  game_modes: string[] | null;
  screenshot_ids: string[] | null;
  igdb_url: string | null;
  user_recommendation_note: any; // Blocks JSON (Tiptap)
  user_rating: number | null;     // 1-10 integer
  is_pinned: boolean;
  pin_order: number | null;
  display_order: number;
  media_details: GameMediaDetails | null;
  game_list: {
    documentId: string;
    List_Name: string;
    slug: string;
  } | null;
  game_categories: {
    documentId: string;
    genre_name: string;
  }[] | null;
  Media: StrapiMedia[];
}

export interface StrapiMedia {
  documentId?: string;
  url: string;
  caption?: string | null;
  alternativeText?: string | null;
}

export interface GameMediaDetails {
  imageDetails?: { id: string; url: string }[];
}

// --- Form State Types ---

export interface AddGameFormState {
  user_recommendation_note: any;
  user_rating: number | null;
  is_pinned: boolean;
  game_categories_id?: string;
  note: string; // raw string for Tiptap
}

export interface CreateGameListFormValues {
  List_Name: string;
  list_description: string;
  slug: string;
}

// --- UI State Types ---

export type GameDetailModalState = {
  open: boolean;
  game: RecommendedGame | null;
};

export type GameSortOrder = "custom" | "rating" | "year" | "recent";
