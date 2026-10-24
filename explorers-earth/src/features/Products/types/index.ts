// ============================================================
// Products Feature — TypeScript Types
// ============================================================

// --- Strapi Entity Types ---

export interface ProductList {
  documentId: string;
  List_Name: string;
  list_description: string | null;
  slug: string;
  Visibility: boolean;
  cover_image: { url: string; alternativeText: string | null } | null;
  display_order: number;
  top_products_heading: string | null;
  recommended_products: RecommendedProduct[];
  account: { documentId: string; username: string };
}

export interface RecommendedProduct {
  documentId: string;
  product_url: string;
  title: string;
  brand: string | null;
  price: number | null;
  currency: string | null;
  buy_url: string | null;
  /** DS-14: the owner disclosed that the buy link is an affiliate link. */
  affiliate_disclosed?: boolean;
  logo_url: string | null;
  description: string | null;
  specifications: Record<string, string> | null;
  /** The same pairs in the owner's order; an object cannot carry order reliably. */
  specification_list?: { key: string; value: string }[] | null;
  user_recommendation_note: any; // Blocks JSON (Tiptap)
  user_rating: number | null;    // 1-10 integer
  is_pinned: boolean;
  pin_order: number | null;
  display_order: number;
  images: string[] | null;
  product_list: {
    documentId: string;
    List_Name: string;
    slug: string;
  } | null;
  product_category: {
    documentId: string;
    name: string;
    slug: string;
  } | null;
}

export interface ProductCategory {
  documentId: string;
  name: string;
  slug: string;
}

// --- Form State Types ---

export interface AddProductFormState {
  user_recommendation_note: any;
  user_rating: number | null;
  is_pinned: boolean;
  product_categories_id?: string;
  note: string;
}

export interface CreateProductListFormValues {
  List_Name: string;
  list_description: string;
  slug: string;
}

// --- UI State Types ---

export type ProductDetailModalState = {
  open: boolean;
  product: RecommendedProduct | null;
};

export type ProductSortOrder = "custom" | "rating" | "price_asc" | "price_desc" | "name";

// --- Scrape Result ---

export interface ProductScrapeResult {
  title?: string;
  brand?: string;
  price?: number;
  currency?: string;
  logo_url?: string;
  description?: string;
  buy_url?: string;
  specifications?: Record<string, string>;
  specification_list?: { key: string; value: string }[] | null;
  images?: string[];
}
