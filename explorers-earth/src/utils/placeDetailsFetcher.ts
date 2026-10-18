import { mapsBrowserKey } from '../lib/publicRuntimeConfig';
import axios from 'axios';

/**
 * Fetches detailed place information including phone number and website
 * using Google Places Details API
 */
export const fetchPlaceDetails = async (placeId: string): Promise<{
  formatted_phone_number?: string;
  website?: string;
  rating?: number;
  user_ratings_total?: number;
}> => {
  try {
    const response = await axios.get(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          "X-Goog-Api-Key": mapsBrowserKey(),
          "X-Goog-FieldMask":
            "id,displayName,formattedAddress,types,addressComponents,location,rating,userRatingCount,nationalPhoneNumber,websiteUri",
        },
      }
    );

    const placeData = response.data;
    
    return {
      formatted_phone_number: placeData.nationalPhoneNumber || '',
      website: placeData.websiteUri || '',
      rating: placeData.rating,
      user_ratings_total: placeData.userRatingCount,
    };
  } catch (error) {
    return {
      formatted_phone_number: '',
      website: '',
      rating: undefined,
      user_ratings_total: undefined,
    };
  }
};
