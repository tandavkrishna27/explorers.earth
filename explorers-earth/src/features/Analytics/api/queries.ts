/**
 * TypeScript interface for analytics event structure
 * Matches the Stats field structure from Strapi
 */
export interface AnalyticsEvent {
  type: 'view' | 'click' | 'interaction';
  timestamp: string; // ISO 8601 format
  page: string;
  element?: string;
  canonicalPath: string;
  country?: string | null;
  referrerOrigin?: string;
  utmParams?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
  };
  metadata?: Record<string, any>;
}

/**
 * TypeScript interface for Strapi analytics data structure
 */
export interface PublicPageAnalyticsData {
  Account_Id: string;
  Location_Id?: string | null;
  Recommendation_Id?: string | null;
  Stats: AnalyticsEvent[];
}

