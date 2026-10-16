// ============================================================
// Books Feature — TypeScript Types
// ============================================================

// --- Strapi Entity Types ---

export interface BookList {
  documentId: string;
  List_Name: string;
  list_description: string | null;
  slug: string;
  visibility: boolean;
  cover_image: StrapiMedia | null;
  display_order: number;
  top_reads_heading: string | null;
  recommended_books: RecommendedBook[];
  account: {
    documentId: string;
    username: string;
  };
}

export interface RecommendedBook {
  entity_id?: string;
  isbn_10?: string | null;
  published_date?: string | null;
  language_tag?: string | null;
  ratings_count?: number | null;
  documentId: string;
  volume_id: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  year: string | null;
  cover_url: string | null;
  cover_url_large: string | null;
  subjects: string[];
  publisher: string | null;
  page_count: number | null;
  google_rating: number | null;
  description: string | null;
  isbn_13: string | null;
  preview_link: string | null;
  user_recommendation_note: any; // Blocks JSON (Tiptap)
  user_rating: number | null;     // 1-10 integer
  buy_links: BuyLink[];
  is_pinned: boolean;
  pin_order: number | null;
  display_order: number;
  media_details: BookMediaDetails | null;
  book_list: {
    documentId: string;
    List_Name: string;
    slug: string;
  } | null;
  book_categories: {
    documentId: string;
    subject_name: string;
  }[] | null;
  Media: StrapiMedia[];
}

export interface BuyLink {
  name: string;
  url: string;
  logo?: string; // logo identifier e.g. "google-books", "amazon", "custom"
}

export type BookFormSelection = Pick<RecommendedBook,
  'volume_id' | 'title' | 'subtitle' | 'authors' | 'subjects' | 'publisher' |
  'page_count' | 'google_rating' | 'description' | 'preview_link'> & {
  year: string;
  cover_url: string;
  cover_url_large: string;
  isbn_13: string;
  google_books_buy_link: string | null;
};

export interface BookCategory {
  documentId: string;
  subject_name: string;
}

export interface StrapiMedia {
  documentId?: string;
  url: string;
  caption?: string | null;
  alternativeText?: string | null;
}

export interface BookMediaDetails {
  imageDetails?: { id: string; url: string }[];
}

// --- Form State Types ---

export interface AddBookFormState {
  user_recommendation_note: any;
  user_rating: number | null;
  is_pinned: boolean;
  buy_links: BuyLink[];
  book_categories_id?: string;
  note: string; // raw string for Tiptap
}

export interface CreateBookListFormValues {
  List_Name: string;
  list_description: string;
  slug: string;
}

// --- UI State Types ---

export type BookDetailModalState = {
  open: boolean;
  book: RecommendedBook | null;
};

export type BookSortOrder = "custom" | "rating" | "year" | "recent";
