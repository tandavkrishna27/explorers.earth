/**
 * Types for Guide Section Day Division feature
 * Enables users to add Google Places to different times of the day in their travel itinerary
 */

/**
 * Travel modes available for inter-place transportation
 */
export type TravelMode = 
  | "walk"
  | "drive"
  | "bike"
  | "public_transit"
  | "taxi"
  | "auto"
  | "ferry"
  | "flight";

/**
 * Photo metadata for activity places
 */
export interface ActivityPhoto {
  /** Unique ID for the photo */
  id: string;
  /** Strapi document ID for the uploaded file */
  documentId: string;
  /** CDN URL of the photo */
  url: string;
  /** Original file name */
  fileName: string;
  /** Photo width in pixels */
  width: number;
  /** Photo height in pixels */
  height: number;
  /** Aspect ratio (e.g., "16:9", "4:3") */
  aspectRatio: string;
}

/**
 * Uploaded activity photo data structure
 * Alias for ActivityPhoto - used during upload process
 */
export type UploadedActivityPhoto = ActivityPhoto;

/**
 * Transportation info between two consecutive places
 */
export interface TransportSegment {
  /** ID of the starting place */
  fromPlaceId: string;
  /** ID of the destination place */
  toPlaceId: string;
  /** Selected travel mode */
  mode: TravelMode;
  /**
   * Distance in kilometers, or null when it was never measured.
   *
   * Ticket 5.3: these were non-nullable, so the canonical null had to become 0 on the way
   * in - and "distance unknown" rendered as "0 km". The round-trip test caught it. Null
   * means unknown; zero means two stops at the same spot.
   */
  distanceKm: number | null;
  /** Estimated travel time in minutes, or null when it was never estimated. */
  estimatedMinutes: number | null;
}

/**
 * Represents a single place added to a time segment
 * Contains essential information from Google Places API
 */
export interface DayPlace {
  /** Unique identifier for the place within the day division */
  id: string;
  /** Name of the place (e.g., "Cafe Lake Side") */
  name: string;
  /** Full formatted address from Google Places */
  formatted_address: string;
  /** Google Places unique place identifier for future lookups */
  place_id: string;
  /** Optional geographic coordinates */
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
  };
  /** Place types from Google Places API (e.g., ["restaurant", "food", "establishment"]) */
  types?: string[];
  /** Optional tips/notes for this specific place (e.g., "Wake up early", "Try the special dish") */
  tips?: string;
  /** Photos for activity places (auto-fetched from Google Places) */
  photos?: ActivityPhoto[];
  /** Loading state for photo fetching */
  photosLoading?: boolean;
  /** Price level from Google Places API (0-4, where 0 is free and 4 is very expensive) */
  priceLevel?: number;
  /** Price range from Google Places API (e.g., "$5 - $10", "€10–20") */
  priceRange?: string;
  /** Custom budget set by user (overrides priceLevel/priceRange) - Legacy string format */
  customBudget?: string;
  /** Budget amount in numeric format (new format) */
  budgetAmount?: number;
  /** Currency code (ISO 4217, e.g., "USD", "EUR", "INR") - new format */
  budgetCurrency?: string;
  /** Flag indicating if place was verified via Google Places API (for AI-generated places) */
  isVerified?: boolean;
  /** Source of place data: "google" (verified), "ai-unverified", or "manual" */
  source?: "google" | "ai-unverified" | "manual";
}

/**
 * Structure for storing places organized by time of day
 * Stored as JSON in the Timeline field of guide_sections
 */
export interface TimelineData {
  /** Places to visit in the morning */
  morning: DayPlace[];
  /** Places to visit in the afternoon */
  afternoon: DayPlace[];
  /** Places to visit in the evening */
  evening: DayPlace[];
}

/**
 * Structure for storing transportation segments between places
 * Stored as JSON in the Transport field of guide_sections
 */
export interface TransportData {
  /** Transportation segments between places */
  segments: TransportSegment[];
}

/**
 * Structure for storing accommodation/stay information
 * Stored as JSON in the Stay field of guide_sections
 */
export interface StayData {
  /** Array of accommodation places */
  accommodations: DayPlace[];
}

/**
 * Structure for storing activity/attraction recommendations
 * Stored as JSON in the Recommendation_Activity field of guide_sections
 */
export interface ActivityData {
  /** Array of activity/attraction places */
  activities: DayPlace[];
}

/**
 * Budget place information (minimal data for budget tracking)
 */
export interface BudgetPlace {
  /**
   * The timeline entry this price belongs to.
   *
   * Ticket 5.3: a budget row is a projection of a timeline entry, and place_id alone
   * cannot identify it - a day that visits the same cafe twice has two entries with one
   * place_id. Keying by the entry handle is what lets the canonical contract check that
   * every priced entry is actually in the section.
   */
  localId: string;
  /** Google Places unique place identifier */
  place_id: string;
  /** Name of the place */
  name: string;
  /** Price level from Google Places API (0-4) */
  priceLevel?: number;
  /** Price range from Google Places API (e.g., "$5 - $10", "€10–20") */
  priceRange?: string;
  /** Custom budget set by user (overrides priceLevel/priceRange) - Legacy string format */
  customBudget?: string;
  /** Budget amount in numeric format (new format) */
  budgetAmount?: number;
  /** Currency code (ISO 4217, e.g., "USD", "EUR", "INR") - new format */
  budgetCurrency?: string;
}

/**
 * Structure for storing budget information organized by time of day
 * Stored as JSON in the Budget field of guide_sections
 */
export interface BudgetData {
  /** Budget places for morning */
  morning: BudgetPlace[];
  /** Budget places for afternoon */
  afternoon: BudgetPlace[];
  /** Budget places for evening */
  evening: BudgetPlace[];
}
