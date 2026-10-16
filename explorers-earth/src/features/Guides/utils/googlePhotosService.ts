/**
 * Google Places Photo Service
 * Handles fetching photos from Google Places API for activities
 */

import { browserPlacesProvider } from "../../../lib/browserPlacesProvider";

export interface PlacePhoto {
  name: string;
  widthPx: number;
  heightPx: number;
}

export interface FetchedPhoto {
  url: string;
  width: number;
  height: number;
  aspectRatio: string;
}

/**
 * Fetch photos for a Google Place using Places API (New)
 * @param placeId - Google Place ID
 * @param maxPhotos - Maximum number of photos to fetch (default: 8)
 * @returns Array of photo URLs
 */
export const fetchGooglePlacePhotos = async (
  placeId: string,
  maxPhotos: number = 8
): Promise<FetchedPhoto[]> => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  
  if (browserPlacesProvider.kind === "google-sdk" && !apiKey) {
    console.error("Google Maps API key not found");
    return [];
  }

  try {
    // Fetch place details including photos using Places API (New)
    const data = await browserPlacesProvider.details(placeId, "photos", undefined, apiKey);

    const photos = data?.photos || [];
    
    if (photos.length === 0) {
      console.warn(`No photos found for place ${placeId}`);
      return [];
    }

    // Limit to maxPhotos
    const limitedPhotos = photos.slice(0, maxPhotos);

    // Fetch photo URLs
    const photoPromises = limitedPhotos.map(async (photo: PlacePhoto) => {
      try {
        // Use maxWidthPx=800 for good quality while keeping file size reasonable
        const photoUrl = browserPlacesProvider.photoUrl(photo.name, apiKey);
        
        // Calculate aspect ratio
        const aspectRatio = photo.widthPx && photo.heightPx 
          ? `${photo.widthPx}:${photo.heightPx}`
          : "4:3";

        return {
          url: photoUrl,
          width: photo.widthPx || 800,
          height: photo.heightPx || 600,
          aspectRatio,
        };
      } catch (error) {
        console.error("Error fetching photo URL:", error);
        return null;
      }
    });

    const fetchedPhotos = await Promise.all(photoPromises);
    return fetchedPhotos.filter((photo): photo is FetchedPhoto => photo !== null);
  } catch (error: any) {
    console.error("Error fetching Google Place photos:", error.response?.data || error.message);
    return [];
  }
};
