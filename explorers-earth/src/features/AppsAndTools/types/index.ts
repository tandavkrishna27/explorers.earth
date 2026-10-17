// ============================================================
// Apps & Tools Feature — TypeScript Types
// ============================================================

// --- Strapi Entity Types ---

export interface AppList {
  documentId: string;
  List_Name: string;
  list_description: string | null;
  slug: string;
  Visibility: boolean;
  cover_image: { url: string; alternativeText: string | null } | null;
  display_order: number;
  top_apps_heading: string | null;
  recommended_apps: RecommendedApp[];
  account: { documentId: string; username: string };
}

export interface RecommendedApp {
  documentId: string;
  app_url: string;
  title: string;
  description: string | null;
  logo_url: string | null;
  developer: string | null;
  platforms: string[] | null;
  price_tier: "Free" | "Freemium" | "Paid" | "Subscription" | null;
  download_url: string | null;
  user_recommendation_note: any; // Blocks JSON (Tiptap)
  user_rating: number | null;    // 1-10 integer
  is_pinned: boolean;
  pin_order: number | null;
  display_order: number;
  screenshots: string[] | null;
  app_list: {
    documentId: string;
    List_Name: string;
    slug: string;
  } | null;
  app_category: {
    documentId: string;
    name: string;
    slug: string;
  } | null;
}

export interface AppCategory {
  documentId: string;
  name: string;
  slug: string;
}

// --- Form State Types ---

export interface AddAppFormState {
  user_recommendation_note: any;
  user_rating: number | null;
  is_pinned: boolean;
  app_categories_id?: string;
  note: string;
}

export interface CreateAppListFormValues {
  List_Name: string;
  list_description: string;
  slug: string;
}

// --- UI State Types ---

export type AppDetailModalState = {
  open: boolean;
  app: RecommendedApp | null;
};

export type AppSortOrder = "custom" | "rating" | "name" | "recent";

// --- Scrape Result ---

export interface AppScrapeResult {
  title?: string;
  description?: string;
  logo_url?: string;
  developer?: string;
  platforms?: string[];
  price_tier?: string;
  download_url?: string;
  screenshots?: string[];
}
