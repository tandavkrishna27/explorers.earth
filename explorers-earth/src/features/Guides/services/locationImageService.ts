/**
 * Location Image Service
 * Handles fetching representative images for guide locations using Google Places Photos API
 * 
 * Features:
 * - Fetch location image based on place ID
 * - Support for single-city and multi-city guides (uses final destination)
 * - Download image as File for upload compatibility
 * - Error handling and fallbacks
 */

import { mapsBrowserKey } from "../../../lib/publicRuntimeConfig";
import axios from "axios";

export interface LocationImageResult {
  file: File;
  previewUrl: string;
  source: 'google-places';
}

/**
 * Fetch the first available photo for a Google Place
 * @param placeId - Google Place ID
 * @returns Photo URL or null if no photos available
 */
const fetchPlacePhotoUrl = async (placeId: string): Promise<string | null> => {
  const apiKey = mapsBrowserKey();

  if (!apiKey) {
    console.error("Google Maps API key not configured");
    return null;
  }

  try {
    // Fetch place details including photos
    const detailsUrl = `https://places.googleapis.com/v1/places/${placeId}`;

    const response = await axios.get(detailsUrl, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'photos',
      },
    });

    const photos = response.data?.photos || [];

    if (photos.length === 0) {
      console.warn(`No photos found for place ${placeId}`);
      return null;
    }

    // Get first photo with good quality (800px width)
    const firstPhoto = photos[0];
    const photoUrl = `https://places.googleapis.com/v1/${firstPhoto.name}/media?maxWidthPx=800&key=${apiKey}`;

    return photoUrl;
  } catch (error: any) {
    console.error("Error fetching place photo:", error.response?.data || error.message);
    return null;
  }
};

/**
 * Download image from URL and convert to File object
 * @param photoUrl - Image URL to download
 * @param fileName - Custom file name
 * @returns File object and preview URL
 */
const downloadImageAsFile = async (
  photoUrl: string,
  fileName: string = 'location-cover.jpg'
): Promise<{ file: File; previewUrl: string } | null> => {
  try {
    // Fetch image as blob
    const response = await axios.get(photoUrl, {
      responseType: 'blob',
    });

    if (!response.data) {
      throw new Error("Failed to download image");
    }

    const photoBlob = response.data;

    // Convert blob to File
    const file = new File([photoBlob], fileName, { type: 'image/jpeg' });

    // Create preview URL
    const previewUrl = URL.createObjectURL(photoBlob);

    return { file, previewUrl };
  } catch (error: any) {
    console.error("Error downloading image:", error.message);
    return null;
  }
};

/**
 * Fetch and download a representative image for a location
 * @param placeId - Google Place ID
 * @param placeName - Place name (used for file naming)
 * @returns LocationImageResult with File and preview URL, or null if failed
 */
export const fetchLocationImage = async (
  placeId: string,
  placeName: string = 'location'
): Promise<LocationImageResult | null> => {
  try {
    // Step 1: Fetch photo URL from Google Places
    const photoUrl = await fetchPlacePhotoUrl(placeId);

    if (!photoUrl) {
      console.info("No image available for location");
      return null;
    }

    // Step 2: Download image and convert to File
    const sanitizedName = placeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const fileName = `${sanitizedName}-cover.jpg`;

    const downloadedImage = await downloadImageAsFile(photoUrl, fileName);

    if (!downloadedImage) {
      return null;
    }

    return {
      file: downloadedImage.file,
      previewUrl: downloadedImage.previewUrl,
      source: 'google-places',
    };
  } catch (error: any) {
    console.error("Error fetching location image:", error.message);
    return null;
  }
};

/**
 * Fetch location image for multi-city guides (uses final destination)
 * @param toPlace - Destination place (ending/to location)
 * @returns LocationImageResult or null
 */
export const fetchMultiCityLocationImage = async (
  toPlace: google.maps.places.PlaceResult
): Promise<LocationImageResult | null> => {
  if (!toPlace.place_id) {
    console.warn("No place_id available for destination location");
    return null;
  }

  const placeName = toPlace.name || toPlace.formatted_address || 'destination';

  return fetchLocationImage(toPlace.place_id, placeName);
};

/**
 * Fetch location image for single-city guides
 * @param place - Selected place
 * @returns LocationImageResult or null
 */
export const fetchSingleCityLocationImage = async (
  place: google.maps.places.PlaceResult
): Promise<LocationImageResult | null> => {
  if (!place.place_id) {
    console.warn("No place_id available for location");
    return null;
  }

  const placeName = place.name || place.formatted_address || 'location';

  return fetchLocationImage(place.place_id, placeName);
};

const locationImageService = {
  fetchLocationImage,
  fetchMultiCityLocationImage,
  fetchSingleCityLocationImage,
};

export default locationImageService;
