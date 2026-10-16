import { memo, useState, useEffect, useCallback } from "react";
import axios from "axios";
import TopPlaceCard from "../../../components/ui/TopPlaceCard";
import NoImagePlaceCard from "../../../components/ui/NoImagePlaceCard";
import { EarthLoader } from "../../../components/EarthLoader";
import { toast } from "sonner";
import { getCurrentLocation } from "../../../utils/getCurrentLocation";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useCityStore } from "../../../store/useCityStore";
import { createPlaceQueryParams } from "../../../utils/transformGooglePlace";
import {
  filterAndSortPlacesWithFallback,
  filterAndSortPlacesWithDistance,
  type Place,
} from "../../../utils/placesFilter";
import { getConfigForCategory } from "../../../utils/placesConfig";
import { useTranslation } from "react-i18next";

// Google Places API types for Nearby Search
export interface PlacePhoto {
  name: string;
  widthPx: number;
  heightPx: number;
}

export interface PlaceLocation {
  latitude: number;
  longitude: number;
}

export interface GooglePlace {
  id: string;
  displayName: {
    text: string;
    languageCode: string;
  };
  rating?: number;
  userRatingCount?: number;
  photos?: PlacePhoto[];
  location: PlaceLocation;
  primaryType?: string;
  priceLevel?: string;
  score?: number; // Add score for sorting
}

// Legacy Google Places Text Search interface for nature spots
export interface LegacyGooglePlace {
  name: string;
  place_id: string;
  formatted_address?: string;
  geometry?: { location: { lat: number; lng: number } };
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  photos?: { photo_reference: string }[];
  isNature?: boolean;
}

// Adapter function to convert GooglePlace to Place interface for filtering
const adaptGooglePlaceToPlace = (googlePlace: GooglePlace): Place => ({
  ...googlePlace, // Keep all other properties first
  name: googlePlace.displayName.text,
  rating: googlePlace.rating,
  user_ratings_total: googlePlace.userRatingCount,
  location: {
    lat: googlePlace.location.latitude,
    lng: googlePlace.location.longitude,
  },
  photos: googlePlace.photos,
  hasImage: googlePlace.photos && googlePlace.photos.length > 0,
});

// Convert legacy Google Places result to new format
const adaptLegacyPlaceToGooglePlace = (
  legacyPlace: LegacyGooglePlace
): GooglePlace => ({
  id: legacyPlace.place_id,
  displayName: {
    text: legacyPlace.name,
    languageCode: "en",
  },
  rating: legacyPlace.rating,
  userRatingCount: legacyPlace.user_ratings_total,
  photos: legacyPlace.photos
    ? legacyPlace.photos.map((_, index) => ({
      name: `places/${legacyPlace.place_id}/photos/${index}`,
      widthPx: 400,
      heightPx: 300,
    }))
    : undefined,
  location: {
    latitude: legacyPlace.geometry?.location.lat || 0,
    longitude: legacyPlace.geometry?.location.lng || 0,
  },
  primaryType: "natural_feature",
  priceLevel: undefined,
});

// Nature keywords for Text Search API
const defaultNatureKeywords = [
  "waterfall",
  "hiking trail",
  "trekking trail",
  "viewpoint",
  "scenic overlook",
  "nature reserve",
  "wildlife sanctuary",
  "botanical garden",
  "natural spring",
  "lake",
  "river",
  "cave",
  "beach",
  "island",
  "hill station",
  "scenic point",
  "hidden gem",
  "national park",
  "protected forest",
];

// Fetch natural places using Text Search API
const fetchNaturePlaces = async (
  lat: number,
  lng: number,
  radius: number,
  apiKey: string,
  keywords: string[] = defaultNatureKeywords
): Promise<LegacyGooglePlace[]> => {
  const results: LegacyGooglePlace[] = [];

  // Limit to first 5 keywords to avoid too many API calls
  const limitedKeywords = keywords.slice(0, 5);

  for (const keyword of limitedKeywords) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
        keyword
      )}&location=${lat},${lng}&radius=${radius}&key=${apiKey}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.results && data.results.length > 0) {
        const keywordResults = data.results.map((p: LegacyGooglePlace) => ({
          ...p,
          isNature: true,
        }));
        results.push(...keywordResults);
      }
    } catch (error) {
      console.error(`Error fetching places for keyword ${keyword}:`, error);
    }
  }

  // Deduplicate by place_id
  const uniqueResults = Array.from(
    new Map(results.map((p) => [p.place_id, p])).values()
  );

  return uniqueResults;
};

interface NearbySearchResponse {
  places: GooglePlace[];
}

// Category mapping for Google Places API types
const CATEGORY_MAPPINGS = {
  "Food & Drinks": ["restaurant", "meal_takeaway", "cafe", "bar", "bakery"],
  Lodging: ["lodging"],
  "Health & Wellness": ["hospital", "pharmacy", "gym", "spa"],
  Shopping: ["store", "shopping_mall"],
  Entertainment: [
    "amusement_park",
    "movie_theater",
    "museum",
    "tourist_attraction",
  ],
  Transportation: ["gas_station", "parking", "transit_station"],
  Services: ["bank", "atm", "post_office", "library"],
  Tourism: ["tourist_attraction", "travel_agency", "zoo", "park"],
  "Natural Features": ["hiking_area", "beach"],
};

interface TopPlacesByCategoryProps {
  selectedLocationName?: string;
  selectedLocationCoords?: { lat: number; lng: number } | null;
  // A manually entered place has no provider id, and the native DTO says so rather
  // than substituting an internal id for one.
  existingRecommendations?: Array<{
    Place_Details: { Place_Id: string | null; Place_Name: string; Title: string };
  }>;
  onPlaceAdded?: () => void;
  selectedCityVisibility?: boolean; // Deprecated: Visibility is no longer used for filtering - kept for backward compatibility
  onPlaceSelect?: (place: GooglePlace) => void; // Optional callback to handle place selection directly (overrides default navigation)
}

const TopPlacesByCategory = memo(
  ({
    selectedLocationName,
    selectedLocationCoords,
    existingRecommendations = [],
    onPlaceAdded,
    onPlaceSelect,
    // selectedCityVisibility, // Deprecated: no longer used, kept for backward compatibility
  }: TopPlacesByCategoryProps) => {
    const { t } = useTranslation();
    const defaultLocationName = t("dashboard.recommendations.locationLabels.currentLocation");

    // Function to get translation key for category
    const getCategoryTranslationKey = (category: string) => {
      const categoryMap: { [key: string]: string } = {
        "Food & Drinks": "dashboard.recommendations.categories.foodDrinks",
        Lodging: "dashboard.recommendations.categories.lodging",
        "Health & Wellness":
          "dashboard.recommendations.categories.healthWellness",
        Shopping: "dashboard.recommendations.categories.shopping",
        Entertainment: "dashboard.recommendations.categories.entertainment",
        Transportation: "dashboard.recommendations.categories.transportation",
        Services: "dashboard.recommendations.categories.services",
        Tourism: "dashboard.recommendations.categories.tourism",
        "Natural Features":
          "dashboard.recommendations.categories.naturalFeatures",
      };
      return categoryMap[category] || category;
    };

    const [selectedCategory, setSelectedCategory] =
      useState<string>("Food & Drinks");
    const [places, setPlaces] = useState<GooglePlace[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [userLocation, setUserLocation] = useState<{
      lat: number;
      lng: number;
    } | null>(null);
    const [locationName, setLocationName] =
      useState<string>(selectedLocationName || defaultLocationName);

    const navigate = useNavigate();
    const { selectedCity } = useCityStore();

    // Get user's current location on component mount
    useEffect(() => {
      const fetchUserLocation = async () => {
        try {
          if (
            selectedLocationCoords &&
            selectedLocationCoords.lat &&
            selectedLocationCoords.lng
          ) {
            setUserLocation(selectedLocationCoords);
            setLocationName(selectedLocationName || t("dashboard.recommendations.locationLabels.selectedLocation"));
          } else {
            // Always fallback to current location if no coordinates provided
            // Visibility status doesn't affect location fetching
            const location = await getCurrentLocation();
            setUserLocation({
              lat: location.latitude,
              lng: location.longitude,
            });

            // Reverse geocode to get location name
            try {
              const response = await axios.get(
                `https://maps.googleapis.com/maps/api/geocode/json?latlng=${location.latitude
                },${location.longitude}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY
                }`
              );

              if (response.data.results && response.data.results.length > 0) {
                const addressComponents =
                  response.data.results[0].address_components;
                const city = addressComponents.find(
                  (component: any) =>
                    component.types.includes("locality") ||
                    component.types.includes("administrative_area_level_2")
                );
                const state = addressComponents.find((component: any) =>
                  component.types.includes("administrative_area_level_1")
                );

                if (city && state) {
                  setLocationName(`${city.long_name}, ${state.long_name}`);
                } else if (city) {
                  setLocationName(city.long_name);
                } else {
                  setLocationName(t("dashboard.recommendations.locationLabels.currentLocation"));
                }
              }
            } catch (error) {
              console.error("Error getting location name:", error);
              setLocationName(t("dashboard.recommendations.locationLabels.currentLocation"));
            }
          }
        } catch (error) {
          console.error("Error getting location:", error);
          toast.error(
            "Unable to get your location. Please enable location access."
          );
        }
      };

      fetchUserLocation();
    }, [selectedLocationCoords, selectedLocationName]);

    const fetchNearbyPlaces = useCallback(async () => {
      if (!userLocation) {
        return;
      }
      setLoading(true);
      try {
        let allPlaces: GooglePlace[] = [];

        // Special handling for Natural Features category - use hybrid approach
        const naturalFeaturesKey = t("dashboard.recommendations.categories.naturalFeatures");
        if (selectedCategory === "Natural Features" || selectedCategory === naturalFeaturesKey) {
          // 1. First get standard nearby places
          const placeTypes =
            CATEGORY_MAPPINGS[
            selectedCategory as keyof typeof CATEGORY_MAPPINGS
            ];
          if (placeTypes && placeTypes.length > 0) {
            const requestBody = {
              includedTypes: placeTypes,
              maxResultCount: 20,
              locationRestriction: {
                circle: {
                  center: {
                    latitude: userLocation.lat,
                    longitude: userLocation.lng,
                  },
                  radius: 15000, // Larger radius for nature spots
                },
              },
              rankPreference: "POPULARITY",
              languageCode: "en",
            };

            try {
              const response = await axios.post(
                "https://places.googleapis.com/v1/places:searchNearby",
                requestBody,
                {
                  headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
                    "X-Goog-FieldMask":
                      "places.id,places.displayName,places.rating,places.userRatingCount,places.photos,places.location,places.primaryType,places.priceLevel",
                  },
                }
              );

              const nearbyData: NearbySearchResponse = response.data;
              if (nearbyData.places && nearbyData.places.length > 0) {
                allPlaces.push(...nearbyData.places);
              }
            } catch (apiError) {
              console.error("Nearby Search API failed:", apiError);
            }
          }

          // 2. Then get nature places via Text Search
          try {
            const naturePlaces = await fetchNaturePlaces(
              userLocation.lat,
              userLocation.lng,
              25000, // 25km radius for nature spots
              import.meta.env.VITE_GOOGLE_MAPS_API_KEY
            );

            // Convert legacy places to new format
            const convertedNaturePlaces = naturePlaces.map(
              adaptLegacyPlaceToGooglePlace
            );

            // Merge with existing places, avoiding duplicates
            const newNaturePlaces = convertedNaturePlaces.filter(
              (naturePlace) =>
                !allPlaces.some((existing) => existing.id === naturePlace.id)
            );

            allPlaces.push(...newNaturePlaces);
          } catch (textSearchError) {
            console.error("Text Search API failed:", textSearchError);
          }
        } else {
          // Standard flow for other categories
          const placeTypes =
            CATEGORY_MAPPINGS[
            selectedCategory as keyof typeof CATEGORY_MAPPINGS
            ];

          if (!placeTypes || placeTypes.length === 0) {
            setPlaces([]);
            setLoading(false);
            return;
          }

          // Use ALL types from the category mapping for comprehensive results
          const categoryTypes = placeTypes;
          let attempts = 0;
          const maxAttempts = 2;
          let currentRadius = 8000.0;

          // Fetch places with expanded radius approach
          while (attempts < maxAttempts) {
            const requestBody = {
              includedTypes: categoryTypes,
              maxResultCount: 20,
              locationRestriction: {
                circle: {
                  center: {
                    latitude: userLocation.lat,
                    longitude: userLocation.lng,
                  },
                  radius: currentRadius,
                },
              },
              rankPreference: "POPULARITY",
              languageCode: "en",
            };

            try {
              const response = await axios.post(
                "https://places.googleapis.com/v1/places:searchNearby",
                requestBody,
                {
                  headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
                    "X-Goog-FieldMask":
                      "places.id,places.displayName,places.rating,places.userRatingCount,places.photos,places.location,places.primaryType,places.priceLevel",
                  },
                }
              );

              const nearbyData: NearbySearchResponse = response.data;
              if (nearbyData.places && nearbyData.places.length > 0) {
                // Add unique places to our collection
                const newPlaces = nearbyData.places.filter(
                  (place) =>
                    !allPlaces.some((existing) => existing.id === place.id)
                );
                allPlaces = [...allPlaces, ...newPlaces];
              }
            } catch (apiError) {
              console.error(
                `API call failed for attempt ${attempts + 1}:`,
                apiError
              );
              if (axios.isAxiosError(apiError)) {
                console.error("API Error Details:", {
                  status: apiError.response?.status,
                  statusText: apiError.response?.statusText,
                  data: apiError.response?.data,
                  requestBody: requestBody,
                });

                // Log the specific error message from Google
                if (apiError.response?.data) {
                  console.error(
                    "Google API Error Response:",
                    apiError.response.data
                  );
                }
              }
            }

            attempts++;
            currentRadius += 5000;

            // If we have enough places for filtering, break early
            if (allPlaces.length >= 15) break;
          }
        }
        // Filter out places that are already in recommendations
        const filteredPlaces = allPlaces.filter((place) => {
          const isAlreadyRecommended = existingRecommendations.some(
            (recommendation) => {
              const placeId = recommendation.Place_Details?.Place_Id;
              const placeName =
                recommendation.Place_Details?.Place_Name ||
                recommendation.Place_Details?.Title;

              // Check by Place_Id (Google Place ID) or by name similarity
              return (
                placeId === place.id ||
                (placeName &&
                  place.displayName?.text &&
                  placeName.toLowerCase().trim() ===
                  place.displayName.text.toLowerCase().trim())
              );
            }
          );

          return !isAlreadyRecommended;
        });
        // Convert GooglePlace to Place interface for filtering
        const adaptedPlaces = filteredPlaces.map(adaptGooglePlaceToPlace);

        // Get category-specific configuration
        const config = getConfigForCategory(selectedCategory);
        let topQualityPlaces;
        if (config.useDistanceFiltering) {
          // Apply smart filtering with distance consideration
          topQualityPlaces = filterAndSortPlacesWithDistance(
            adaptedPlaces,
            { lat: userLocation.lat, lng: userLocation.lng },
            config.minRating,
            config.minReviews,
            config.qualityWeight,
            config.distanceWeight,
            config.maxDistance,
            config.limit,
            config.fallbackMinCount,
            config.imageWeight
          );
        } else {
          // Apply smart filtering without distance (fallback method)
          topQualityPlaces = filterAndSortPlacesWithFallback(
            adaptedPlaces,
            config.minRating,
            config.minReviews,
            config.qualityWeight,
            config.limit,
            config.fallbackMinCount,
            config.imageWeight
          );
        }
        // Convert back to GooglePlace format with scores
        const scoredPlaces: GooglePlace[] = topQualityPlaces.map((place) => {
          const originalPlace = filteredPlaces.find(
            (original) => original.id === (place as any).id
          );
          return {
            ...originalPlace!,
            score: (place as any).score,
          };
        });

        setPlaces(scoredPlaces);
      } catch (error) {
        console.error("Error fetching nearby places:", error);
        toast.error(t("toast.error.failedToFetchNearbyPlaces"));
        setPlaces([]);
      } finally {
        setLoading(false);
      }
    }, [userLocation, selectedCategory, existingRecommendations]);

    // Fetch places when location or category changes
    useEffect(() => {
      if (userLocation && selectedCategory) {
        fetchNearbyPlaces();
      }
    }, [userLocation, selectedCategory, fetchNearbyPlaces]);

    const handleCategorySelection = useCallback((category: string) => {
      setSelectedCategory(category);
    }, []);

    const getPlacePhotoUrl = (place: GooglePlace): string => {
      if (place.photos && place.photos.length > 0) {
        const photoName = place.photos[0].name;
        return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=400&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY
          }`;
      }
      // Return null for places without images - we'll handle this in the UI
      return "";
    };

    // Function to check if place has a real image
    const placeHasImage = (place: GooglePlace): boolean => {
      return !!(place.photos && place.photos.length > 0);
    };

    const handleAddPlace = useCallback(
      (place: GooglePlace) => {
        // If custom onPlaceSelect is provided, use it instead of default navigation
        if (onPlaceSelect) {
          onPlaceSelect(place);
          return;
        }

        // Default behavior: navigate to add recommendation page
        if (!selectedCity?.documentId) {
          toast.error(t("toast.error.pleaseSelectListFirst"));
          return;
        }

        // Create query parameters from the place data
        const queryParams = createPlaceQueryParams(place);

        // Navigate to AddRecommendation with pre-filled data
        const queryString = new URLSearchParams(queryParams).toString();
        navigate(`/${selectedCity.documentId}/new?${queryString}`);

        // Call the callback to notify parent component
        if (onPlaceAdded) {
          onPlaceAdded();
        }
      },
      [selectedCity, navigate, onPlaceAdded, onPlaceSelect]
    );

    const categories = Object.keys(CATEGORY_MAPPINGS);

    // Always show loading spinner if no location yet, regardless of visibility
    if (!userLocation && !selectedLocationCoords) {
      return (
        <div
          className="white-theme"
          style={{
            width: "100%",
            height: "200px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <EarthLoader context="general" size="small" />
        </div>
      );
    }

    return (
      <div className="white-theme w-full px-1">
        {/* Header with location info - Extra small styling */}
        <div className="flex items-center gap-1 mb-4">
          <div>
            <h3 className="text-white font-poppins font-medium text-sm">
              {t("dashboard.recommendations.exploreSection.heading")}
            </h3>
            <p className="text-white font-poppins text-sm">{locationName}</p>
          </div>
        </div>

        {/* Category Filter - Extra small buttons */}
        <div className="mb-2">
          <div
            className="w-full flex flex-row gap-1 items-center flex-nowrap whitespace-nowrap overflow-x-auto pb-1"
            style={{ scrollbarWidth: "none" }}
          >
            <div className="flex gap-1 px-1">
              {categories.map((category: string) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => handleCategorySelection(category)}
                  className={`text-xs px-1.5 py-0.5 rounded-full border transition-all duration-200 font-poppins ${selectedCategory === category
                    ? "bg-dashboard-accent text-white border-dashboard-accent"
                    : "bg-transparent text-gray-300 border-gray-600 hover:border-gray-500 hover:text-white"
                    }`}
                >
                  {t(getCategoryTranslationKey(category))}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Places Cards - Extra small and compact */}
        {loading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              width: "100%",
              height: "120px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <EarthLoader context="general" size="small" />
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="px-1 flex items-center gap-2 md:gap-2 overflow-x-auto mt-2"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              WebkitOverflowScrolling: "touch",
              height: "155px", // Adjusted for shorter card + button
              alignItems: "center",
            }}
          >
            {places.length > 0 ? (
              places.map((place, index) => (
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    delay: index * 0.03, // Even faster stagger
                    ease: "easeOut",
                  }}
                  key={place.id}
                  className="flex-shrink-0"
                  style={{
                    height: "145px", // Adjusted for shorter card + button
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {placeHasImage(place) ? (
                    <TopPlaceCard
                      key={place.id}
                      title={place.displayName.text}
                      image={getPlacePhotoUrl(place)}
                      rating={place.rating || 0}
                      reviews={place.userRatingCount || 0}
                      cardType="suggestion"
                      showAddButton={true}
                      onAddClick={() => handleAddPlace(place)}
                      onClickhandler={() => {
                        // Open in Google Maps
                        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          place.displayName.text
                        )}&query_place_id=${place.id}`;
                        window.open(mapsUrl, "_blank");
                      }}
                    />
                  ) : (
                    <NoImagePlaceCard
                      title={place.displayName.text}
                      rating={place.rating || 0}
                      reviews={place.userRatingCount || 0}
                      category={selectedCategory}
                      onAddClick={() => handleAddPlace(place)}
                      onClickhandler={() => {
                        // Open in Google Maps
                        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          place.displayName.text
                        )}&query_place_id=${place.id}`;
                        window.open(mapsUrl, "_blank");
                      }}
                    />
                  )}
                </motion.div>
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="flex items-center justify-center w-full min-h-[120px]"
              >
                <div className="text-center">
                  <p className="text-white font-poppins text-xs mb-1">
                    No places found
                  </p>
                  <p className="dt-subtext">Try a different category.</p>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    );
  }
);

export default TopPlacesByCategory;
