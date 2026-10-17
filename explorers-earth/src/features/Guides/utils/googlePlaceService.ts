/**
 * Google Place Service
 * Handles fetching place details from Google Places API
 */

import { browserPlacesProvider } from "../../../lib/browserPlacesProvider";

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
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  
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
          const currencyCode = startPrice.currencyCode || endPrice.currencyCode || 'USD';
          const currencySymbol = getCurrencySymbol(currencyCode);
          
          // Handle units (can be string or number)
          const startUnits = startPrice.units !== undefined && startPrice.units !== null 
            ? String(startPrice.units) 
            : null;
          const endUnits = endPrice.units !== undefined && endPrice.units !== null 
            ? String(endPrice.units) 
            : null;
          
          // Format as "₹1–200"
          if (startUnits && endUnits) {
            result.priceRange = `${currencySymbol}${startUnits}–${endUnits}`;
          } else if (startUnits) {
            result.priceRange = `${currencySymbol}${startUnits}+`;
          } else if (endUnits) {
            result.priceRange = `${currencySymbol}up to ${endUnits}`;
          }
        } 
        // Legacy format with min/max/currencyCode
        else if (priceRange.min !== undefined || priceRange.max !== undefined) {
          const min = priceRange.min;
          const max = priceRange.max;
          const currencyCode = priceRange.currencyCode || 'USD';
          const currencySymbol = getCurrencySymbol(currencyCode);
          
          if (min !== undefined && max !== undefined) {
            result.priceRange = `${currencySymbol}${min}–${max}`;
          } else if (min !== undefined) {
            result.priceRange = `${currencySymbol}${min}+`;
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

/**
 * Get currency symbol from currency code
 */
function getCurrencySymbol(currencyCode: string): string {
  const currencyMap: Record<string, string> = {
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'INR': '₹',
    'JPY': '¥',
    'CNY': '¥',
    'AUD': 'A$',
    'CAD': 'C$',
    'CHF': 'CHF',
    'SEK': 'kr',
    'NOK': 'kr',
    'DKK': 'kr',
    'PLN': 'zł',
    'RUB': '₽',
    'BRL': 'R$',
    'MXN': '$',
    'ZAR': 'R',
    'KRW': '₩',
    'SGD': 'S$',
    'HKD': 'HK$',
    'NZD': 'NZ$',
    'THB': '฿',
    'PHP': '₱',
    'IDR': 'Rp',
    'MYR': 'RM',
    'VND': '₫',
  };
  
  return currencyMap[currencyCode] || currencyCode;
};

