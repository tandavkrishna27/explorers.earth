/**
 * Enhanced category mapping utility
 * Maps Google Places API data to recommendation categories
 * Uses rule-based mapping over Google types and primaryTypeDisplayName
 */

export interface PlaceCategoryData {
  placeName: string;
  types: string[];
  primaryType?: string;
  primaryTypeDisplayName?: string;
  formattedAddress?: string;
  rating?: number;
}

export interface CategoryMatch {
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  subcategoryName: string;
  confidence: 'high' | 'medium' | 'low';
  method: 'rule-based' | 'llm';
}

/**
 * Enhanced mapping of Google Places types to category keywords
 * This is more comprehensive than the basic CATEGORY_MAPPINGS
 */
const ENHANCED_TYPE_MAPPINGS: Record<string, string[]> = {
  // Food & Drinks
  'restaurant': ['restaurant', 'dining', 'food', 'eatery', 'bistro', 'diner'],
  'cafe': ['cafe', 'coffee', 'coffee shop', 'espresso'],
  'bar': ['bar', 'pub', 'tavern', 'cocktail', 'lounge', 'brewery'],
  'bakery': ['bakery', 'pastry', 'bread', 'patisserie'],
  'meal_takeaway': ['takeaway', 'fast food', 'food delivery'],
  'food': ['food', 'restaurant', 'dining'],
  
  // Natural Features
  'beach': ['beach', 'shore', 'coast', 'seaside'],
  'park': ['park', 'garden', 'green space'],
  'hiking_area': ['hiking', 'trail', 'mountain', 'nature'],
  'natural_feature': ['nature', 'natural', 'landscape'],
  'campground': ['camping', 'campground', 'outdoor'],
  
  // Tourism & Attractions
  'tourist_attraction': ['attraction', 'tourist', 'landmark', 'sightseeing'],
  'museum': ['museum', 'gallery', 'exhibition', 'art'],
  'zoo': ['zoo', 'wildlife', 'animals'],
  'aquarium': ['aquarium', 'marine', 'fish'],
  'amusement_park': ['amusement', 'theme park', 'entertainment'],
  'art_gallery': ['art', 'gallery', 'exhibition'],
  
  // Lodging
  'lodging': ['hotel', 'accommodation', 'resort', 'inn', 'hostel', 'stay'],
  
  // Entertainment
  'movie_theater': ['cinema', 'movie', 'theater', 'film'],
  'night_club': ['nightclub', 'club', 'nightlife'],
  'casino': ['casino', 'gambling'],
  'bowling_alley': ['bowling'],
  'stadium': ['stadium', 'sports', 'arena'],
  
  // Shopping
  'shopping_mall': ['mall', 'shopping', 'retail'],
  'store': ['store', 'shop', 'retail'],
  'market': ['market', 'bazaar', 'shopping'],
  
  // Health & Wellness
  'gym': ['gym', 'fitness', 'workout', 'exercise'],
  'spa': ['spa', 'wellness', 'massage', 'relaxation'],
  'hospital': ['hospital', 'medical', 'healthcare'],
  'pharmacy': ['pharmacy', 'drugstore', 'medicine'],
  
  // Transportation
  'transit_station': ['station', 'transit', 'transport'],
  'gas_station': ['gas', 'fuel', 'petrol'],
  'parking': ['parking', 'car park'],
  
  // Services
  'bank': ['bank', 'financial'],
  'atm': ['atm', 'cash machine'],
  'post_office': ['post office', 'mail', 'postal'],
  'library': ['library', 'books'],
};

/**
 * Maps a category name to potential Google Places types
 * This is the reverse mapping for better matching
 */
const CATEGORY_TO_TYPES: Record<string, string[]> = {
  'Food & Drinks': ['restaurant', 'cafe', 'bar', 'bakery', 'meal_takeaway', 'food'],
  'Natural Features': ['beach', 'park', 'hiking_area', 'natural_feature', 'campground'],
  'Tourism': ['tourist_attraction', 'museum', 'zoo', 'aquarium', 'amusement_park', 'art_gallery'],
  'Lodging': ['lodging'],
  'Entertainment': ['movie_theater', 'night_club', 'casino', 'bowling_alley', 'stadium', 'amusement_park'],
  'Shopping': ['shopping_mall', 'store', 'market'],
  'Health & Wellness': ['gym', 'spa', 'hospital', 'pharmacy'],
  'Transportation': ['transit_station', 'gas_station', 'parking'],
  'Services': ['bank', 'atm', 'post_office', 'library'],
};

/**
 * Normalizes text for comparison (removes special chars, lowercases)
 */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Finds matching category using rule-based approach
 * This is fast and free, covers most common cases
 */
export function findCategoryByRules(
  placeData: PlaceCategoryData,
  availableCategories: Array<{
    Category_Name: string;
    documentId: string;
    recommendation_sub_categories: Array<{
      sub_category: string;
      documentId: string;
    }>;
  }>
): CategoryMatch | null {
  const { placeName, types, primaryType, primaryTypeDisplayName } = placeData;
  
  // Combine all searchable text
  const searchTexts = [
    ...types,
    primaryType || '',
    primaryTypeDisplayName || '',
    placeName || '',
  ].filter(Boolean).map(normalizeText);

  // Try to match against subcategories first (more specific)
  for (const category of availableCategories) {
    const categoryName = normalizeText(category.Category_Name);
    
    // Check if any type matches the category
    const categoryMatches = CATEGORY_TO_TYPES[category.Category_Name] || [];
    const hasCategoryMatch = searchTexts.some(text => 
      categoryMatches.some(type => text.includes(normalizeText(type)) || normalizeText(type).includes(text))
    );

    if (hasCategoryMatch || searchTexts.some(text => text.includes(categoryName) || categoryName.includes(text))) {
      // Now try to find the best matching subcategory
      for (const subcategory of category.recommendation_sub_categories || []) {
        const subcategoryName = normalizeText(subcategory.sub_category);
        
        // Check if any search text matches the subcategory
        const hasMatch = searchTexts.some(text => {
          // Direct match
          if (text === subcategoryName || subcategoryName === text) return true;
          
          // Contains match
          if (text.includes(subcategoryName) || subcategoryName.includes(text)) return true;
          
          // Check enhanced mappings
          for (const [key, keywords] of Object.entries(ENHANCED_TYPE_MAPPINGS)) {
            if (keywords.some(keyword => 
              normalizeText(keyword) === text || 
              text.includes(normalizeText(keyword)) ||
              normalizeText(keyword).includes(text)
            )) {
              // Check if this keyword matches the subcategory
              if (subcategoryName.includes(normalizeText(key)) || 
                  normalizeText(key).includes(subcategoryName)) {
                return true;
              }
            }
          }
          
          return false;
        });

        if (hasMatch) {
          return {
            categoryId: category.documentId,
            categoryName: category.Category_Name,
            subcategoryId: subcategory.documentId,
            subcategoryName: subcategory.sub_category,
            confidence: 'high',
            method: 'rule-based',
          };
        }
      }
      
      // If category matches but no subcategory, return first subcategory with medium confidence
      if (category.recommendation_sub_categories && category.recommendation_sub_categories.length > 0) {
        return {
          categoryId: category.documentId,
          categoryName: category.Category_Name,
          subcategoryId: category.recommendation_sub_categories[0].documentId,
          subcategoryName: category.recommendation_sub_categories[0].sub_category,
          confidence: 'medium',
          method: 'rule-based',
        };
      }
    }
  }

  return null;
}

/**
 * Main function to find category, by rule-based matching over the Google types.
 *
 * This used to try an LLM first and fall back to these rules. The LLM call went to
 * /api/gemini/generate, which no route serves, so the fallback was the only path that
 * ever returned - the rules are what has actually been categorising places all along.
 */
export async function findPlaceCategory(
  placeData: PlaceCategoryData,
  availableCategories: Array<{
    Category_Name: string;
    documentId: string;
    recommendation_sub_categories: Array<{
      sub_category: string;
      documentId: string;
    }>;
  }>,
  options: {
    useRuleBasedFallback?: boolean; // Keep rule-based matching on (default: true)
    enableCache?: boolean; // Future: cache results (not implemented yet)
  } = {}
): Promise<CategoryMatch | null> {
  const { useRuleBasedFallback = true } = options;

  if (useRuleBasedFallback) {
    const ruleBasedMatch = findCategoryByRules(placeData, availableCategories);
    if (ruleBasedMatch) {
      return ruleBasedMatch;
    }
  }

  return null;
}

