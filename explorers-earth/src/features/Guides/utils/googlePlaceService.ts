/**
 * Google Place Service
 * Handles fetching place details from Google Places API
 */

import { mapsBrowserKey } from "../../../lib/publicRuntimeConfig";
import { browserPlacesProvider } from "../../../lib/browserPlacesProvider";
import { formatMoney } from "../../../lib/money";

/**
 * Price information returned from Google Places API
 */
export interface PlacePriceInfo {
  priceLevel?: number;
  priceRange?: string;
}

/**
 * Fetch price level and price range for a Google Place using Places API (New)
 * @param placeId - Google Place ID
 * @returns Price info with level and range, or undefined if not available
 */
export const fetchPlacePriceLevel = async (
  placeId: string
): Promise<PlacePriceInfo | undefined> => {
  const apiKey = mapsBrowserKey();
  
  if (browserPlacesProvider.kind === "google-sdk" && !apiKey) {
    console.error("Google Maps API key not found");
    return undefined;
  }

  try {
    // Fetch place details including priceLevel and priceRange using Places API (New)
    const data = await browserPlacesProvider.details(placeId, "priceLevel,priceRange", undefined, apiKey);

    const priceLevel = data?.priceLevel;
    const priceRange = data?.priceRange;
    
    const result: PlacePriceInfo = {};
    
    // Price level is a string enum: "PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", 
    // "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"
    // Convert to number: 0-4
    if (priceLevel) {
      const priceLevelMap: Record<string, number> = {
        'PRICE_LEVEL_FREE': 0,
        'PRICE_LEVEL_INEXPENSIVE': 1,
        'PRICE_LEVEL_MODERATE': 2,
        'PRICE_LEVEL_EXPENSIVE': 3,
        'PRICE_LEVEL_VERY_EXPENSIVE': 4,
      };
      
      result.priceLevel = priceLevelMap[priceLevel] ?? undefined;
    }

    // Price range can be:
    // 1. A string like "$5 - $10" or "€10–20" or "₹1–200"
    // 2. An object with startPrice/endPrice structure (Google Places API New format)
    //    {
    //      startPrice: { currencyCode: "INR", units: "1" },
    //      endPrice: { currencyCode: "INR", units: "200" }
    //    }
    // 3. An object with min/max/currencyCode properties (legacy format)
    if (priceRange) {
      if (typeof priceRange === 'string') {
        // Direct string format
        result.priceRange = priceRange;
      } else if (typeof priceRange === 'object' && priceRange !== null) {
        // Check for Google Places API New format with startPrice/endPrice
        if (priceRange.startPrice && priceRange.endPrice) {
          const startPrice = priceRange.startPrice;
          const endPrice = priceRange.endPrice;
          // No currency from Google means none: amounts are shown bare, never as USD.
          const currencyCode = startPrice.currencyCode || endPrice.currencyCode || null;
          
          // Handle units (can be string or number)
          const startUnits = startPrice.units !== undefined && startPrice.units !== null 
            ? String(startPrice.units) 
            : null;
          const endUnits = endPrice.units !== undefined && endPrice.units !== null 
            ? String(endPrice.units) 
            : null;
          
          // Format as "₹1–₹200" in the viewer's locale and the currency's own digits
          if (startUnits && endUnits) {
            result.priceRange = `${formatMoney(startUnits, currencyCode)}–${formatMoney(endUnits, currencyCode)}`;
          } else if (startUnits) {
            result.priceRange = `${formatMoney(startUnits, currencyCode)}+`;
          } else if (endUnits) {
            result.priceRange = `up to ${formatMoney(endUnits, currencyCode)}`;
          }
        } 
        // Legacy format with min/max/currencyCode
        else if (priceRange.min !== undefined || priceRange.max !== undefined) {
          const min = priceRange.min;
          const max = priceRange.max;
          const currencyCode = priceRange.currencyCode || null;
          
          if (min !== undefined && max !== undefined) {
            result.priceRange = `${formatMoney(min, currencyCode)}–${formatMoney(max, currencyCode)}`;
          } else if (min !== undefined) {
            result.priceRange = `${formatMoney(min, currencyCode)}+`;
          }
        }
      }
    }

    // Return undefined if neither priceLevel nor priceRange is available
    if (!result.priceLevel && !result.priceRange) {
      return undefined;
    }

    return result;
  } catch (error: any) {
    console.error("Error fetching Google Place price info:", error.response?.data || error.message);
    return undefined;
  }
};
