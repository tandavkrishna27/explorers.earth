// Shared types for Guides feature

export interface PlaceDetails {
  Place_Name?: string;
  Place_Address?: string;
  Place_Id?: string;
  Rating?: number;
  Rating_Count?: number;
  lat?: number;
  lng?: number;
}

export interface GuideMedia {
  url: string;
  name?: string;
}

export interface Guide {
  documentId: string;
  Title: string;
  Description?: string;
  Guide_Type?: string;
  Visibility?: boolean;
  Estimated_Budget?: number;
  /** ISO 4217 code of Estimated_Budget; absent when none was recorded. */
  Estimated_Budget_Currency?: string | null;
  Budget_Type?: string | null;
  is_Multicity?: boolean | null;
  slug?: string;
  Guide_Media?: GuideMedia[];
  Place_Details?: PlaceDetails | string; // Can be JSON string or object
  Number_Of_Days?: number | null;
  Category?: string[] | string | null; // Can be array or JSON string
  Best_Time_To_Visit?: string[] | string | null; // Can be array or JSON string
  Guide_Tags?: string[];
  Tips_Notes?: any;
  Guide_Section_Details?: any; // Can be JSON string or array of section objects
  guide_sections?: Array<{
    documentId: string;
    Timeline?: any;
    Stay?: any;
    Recommendation_Activity?: any;
    Budget?: any;
  }>;
  account?: {
    documentId: string;
  };
  is_pinned?: boolean;
  pin_order?: number;
  display_order?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuideSection {
  documentId: string;
  Title: string;
  Sequence: number;
  Description?: string;
  Recommendation_Activity?: any;
  Map_Details?: any;
  Packing_List?: any;
  Pre_Tasks?: any;
  Section_tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}
