/**
 * Price Level Utilities
 * Centralized functions for handling Google Places price levels and custom budgets
 */

import { formatMoney } from "../../../lib/money";

/**
 * Price level labels mapping
 * Based on Google Places API price levels (0-4)
 */
export const PRICE_LEVEL_LABELS: Record<number, string> = {
  0: "Free",
  1: "Inexpensive",
  2: "Moderate",
  3: "Expensive",
  4: "Very Expensive",
};

/**
 * Convert price level number to human-readable text
 * @param priceLevel - Google Places price level (0-4)
 * @returns Human-readable price level text
 */
export const getPriceLevelText = (priceLevel: number): string => {
  return PRICE_LEVEL_LABELS[priceLevel] || "Unknown";
};

/**
 * Get display text for a place's budget
 * Priority: budgetAmount/budgetCurrency > customBudget > priceRange > priceLevel
 * @param place - Place object with budget information
 * @returns Formatted budget display text
 */
export const getBudgetDisplayText = (place: {
  budgetAmount?: number;
  budgetCurrency?: string;
  customBudget?: string;
  priceRange?: string;
  priceLevel?: number;
}): string | null => {
  // 1. New currency format has highest priority. Zero is a real budget and shows as Free.
  if (place.budgetAmount !== undefined) {
    const formatted = formatMoney(place.budgetAmount, place.budgetCurrency);
    if (formatted) return formatted;
  }

  // 2. Legacy custom budget
  if (place.customBudget) {
    return place.customBudget;
  }

  // 3. Price range from Google Places (e.g., "₹200-400", "$10-20")
  if (place.priceRange) {
    return place.priceRange;
  }

  // 4. Price level from Google Places (convert to text)
  if (typeof place.priceLevel === "number") {
    return getPriceLevelText(place.priceLevel);
  }

  return null;
};
