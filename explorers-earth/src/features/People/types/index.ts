// ============================================================
// People Feature — TypeScript Types
// ============================================================

// --- Strapi Entity Types ---

export interface PersonList {
  documentId: string;
  List_Name: string;
  list_description: string | null;
  slug: string;
  Visibility: boolean;
  cover_image: { url: string; alternativeText: string | null } | null;
  display_order: number;
  top_picks_heading: string | null;
  top_people_heading?: string | null; // Compatibility alias
  recommended_people: RecommendedPerson[];
  account: { documentId: string; username: string };
}

export interface RecommendedPerson {
  people_sector?: {catalogState:'CONFIGURED'|'UNCONFIGURED';catalogVersion:number;defaultLocale:string|null;sector:{id:string;slug:string;label:string|null;unavailable:boolean}|null;selectionUnavailable:boolean};
  documentId: string;
  name: string;
  username_handle: string | null;
  headline: string | null;
  location: string | null;
  avatar_path: string | null;
  media_details?: {
    imageDetails?: Array<{ id: string; url: string }>;
    thumbnail?: { url: string };
  } | null;
  primary_platform: "instagram" | "linkedin" | "twitter" | "github" | "youtube" | "website" | "other" | null;
  social_urls: any; // JSON object: { primary: string, instagram?: string, linkedin?: string, ... }
  skills_tags: string[] | null; // JSON array of strings
  user_recommendation_note: any; // Blocks JSON (Tiptap)
  user_rating: number | null; // 1-10 integer
  is_pinned: boolean;
  pin_order: number | null;
  display_order: number;
  person_list: {
    documentId: string;
    List_Name: string;
    slug: string;
  } | null;

  // Compatibility fields for frontend UI components (populated via GraphQL aliases or client-side mapping)
  profile_url?: string;
  full_name?: string;
  handle?: string | null;
  avatar_url?: string | null;
  platform?: "instagram" | "linkedin" | "twitter" | "x" | "github" | "youtube" | "website" | "other" | null;
  tags?: string[] | null;
  bio?: string | null;
  follower_count?: string | null;
  people_category?: PeopleCategory | null;
  person_category?: any;
  person_categories?: any[] | null;
}

export interface PeopleCategory {
  id?: string;
  documentId: string;
  Category_name: string | null;
  slug?: string;
  unavailable?: boolean;
}

// --- Form State Types ---

export interface AddPersonFormState {
  user_recommendation_note: any;
  user_rating: number | null;
  is_pinned: boolean;
  note: string;
}

export interface CreatePersonListFormValues {
  List_Name: string;
  list_description: string;
  slug: string;
}

// --- UI State Types ---

export type PersonDetailModalState = {
  open: boolean;
  person: RecommendedPerson | null;
};

export type PersonSortOrder = "custom" | "rating" | "name" | "platform";

// --- Scrape Result ---

export interface PersonScrapeResult {
  full_name?: string;
  handle?: string;
  headline?: string;
  bio?: string;
  avatar_url?: string;
  platform?: "instagram" | "linkedin" | "twitter" | "github" | "youtube" | "website" | "other" | null;
  follower_count?: string;
  location?: string;
  screenshots?: string[];
}
