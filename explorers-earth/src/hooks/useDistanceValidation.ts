import { useState } from "react";
import { 
  LOCATION_VALIDATION_CONFIG,
  LocationValidationCoords,
  LocationValidationResult
} from "../config/locationValidationConfig";

/**
 * Custom hook for validating places based on distance and travel time
 * Uses Google Distance Matrix API to calculate real-world distance and driving time
 * 
 * Features:
 * - Real-time distance and travel time validation
 * - Fallback to straight-line distance calculation
 * - Configurable distance and time thresholds
 * - Comprehensive error handling
 * - Loading state management
 */
export const useDistanceValidation = () => {
  const [isValidating, setIsValidating] = useState(false);

  /**
   * Validates if a place is within acceptable distance/time from the parent location
   * @param originCoords - Coordinates of the parent location (city/region)
   * @param destinationCoords - Coordinates of the place to be added
   * @returns Promise<LocationValidationResult>
   */
  const validateDistance = async (
    originCoords: LocationValidationCoords,
    destinationCoords: LocationValidationCoords
  ): Promise<LocationValidationResult> => {
    setIsValidating(true);

    try {
      // Check if Google Maps API is loaded
      if (typeof google === 'undefined' || !google.maps) {
        console.error("Google Maps API not loaded");
        return {
          isValid: false,
          method: 'error',
          error: "Google Maps API not loaded",
          debugInfo: { googleMapsAvailable: typeof google !== 'undefined' }
        };
      }

      // Create timeout promise for API request
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('API timeout')), LOCATION_VALIDATION_CONFIG.UX.API_TIMEOUT)
      );

      // Use Google Distance Service through the Maps JavaScript API instead of REST API
      // This avoids CORS issues since we're using the JavaScript API
      const service = new google.maps.DistanceMatrixService();
      
      const distancePromise = new Promise<LocationValidationResult>((resolve) => {
        service.getDistanceMatrix(
          {
            origins: [new google.maps.LatLng(originCoords.lat, originCoords.lng)],
            destinations: [new google.maps.LatLng(destinationCoords.lat, destinationCoords.lng)],
            travelMode: google.maps.TravelMode.DRIVING,
            unitSystem: google.maps.UnitSystem.METRIC,
            avoidHighways: false,
            avoidTolls: false,
          },
          (response, status) => {
            if (status !== google.maps.DistanceMatrixStatus.OK) {
              resolve({
                isValid: false,
                method: 'error',
                error: `API Error: ${status}`,
                debugInfo: { apiStatus: status, response }
              });
              return;
            }

            if (!response) {
              resolve({
                isValid: false,
                method: 'error',
                error: "No response from API",
                debugInfo: { status }
              });
              return;
            }

            // Extract distance and duration from the response
            const element = response.rows[0]?.elements[0];

            if (!element) {
              resolve({
                isValid: false,
                method: 'error',
                error: "No route data available",
                debugInfo: { response }
              });
              return;
            }

            // No driving route (an island, across water) is not a connection failure: the
            // place is judged by straight-line distance against the same limit (PLC-04).
            if (element.status === "ZERO_RESULTS") {
              resolve(fallbackDistanceValidation(originCoords, destinationCoords));
              return;
            }

            if (element.status !== google.maps.DistanceMatrixElementStatus.OK) {
              resolve({
                isValid: false,
                method: 'error',
                error: `Route Error: ${element.status}`,
                debugInfo: { elementStatus: element.status, element }
              });
              return;
            }

            const distance = element.distance;
            const duration = element.duration;

            if (!distance || !duration) {
              resolve({
                isValid: false,
                method: 'error',
                error: "Incomplete route data",
                debugInfo: { distance, duration, element }
              });
              return;
            }

            // Convert distance from meters to kilometers for validation
            const distanceKm = distance.value / 1000;
            const durationHours = duration.value / 3600;

            // Validate against our thresholds
            const isDistanceValid = distanceKm <= LOCATION_VALIDATION_CONFIG.MAX_DISTANCE_KM;
            const isTimeValid = duration.value <= LOCATION_VALIDATION_CONFIG.MAX_TRAVEL_TIME_SECONDS;

            if (LOCATION_VALIDATION_CONFIG.VALIDATION.ENABLE_VALIDATION_LOGGING) {
              console.log("Distance validation result:", {
                distanceKm: distanceKm.toFixed(1),
                durationHours: durationHours.toFixed(1),
                isDistanceValid,
                isTimeValid,
                maxDistanceKm: LOCATION_VALIDATION_CONFIG.MAX_DISTANCE_KM,
                maxTimeHours: LOCATION_VALIDATION_CONFIG.MAX_TRAVEL_TIME_HOURS,
                distance: distance,
                duration: duration
              });
            }

            resolve({
              isValid: isDistanceValid && isTimeValid,
              method: 'distance-api',
              distance: {
                text: distance.text,
                value: distance.value
              },
              duration: {
                text: duration.text,
                value: duration.value
              },
              debugInfo: {
                distanceKm: distanceKm.toFixed(1),
                durationHours: durationHours.toFixed(1),
                isDistanceValid,
                isTimeValid,
                thresholds: {
                  maxDistanceKm: LOCATION_VALIDATION_CONFIG.MAX_DISTANCE_KM,
                  maxTimeHours: LOCATION_VALIDATION_CONFIG.MAX_TRAVEL_TIME_HOURS,
                }
              }
            });
          }
        );
      });

      // Race between API call and timeout
      const result = await Promise.race([distancePromise, timeoutPromise]);
      return result;
    } catch (error) {
      console.error("Error validating distance:", error);
      
      return {
        isValid: false,
        method: 'error',
        error: error instanceof Error ? error.message : "Unexpected error during distance validation",
        debugInfo: { originalError: error }
      };
    } finally {
      setIsValidating(false);
    }
  };

  /**
   * Simple haversine formula for calculating straight-line distance
   * Used as a fallback when Distance Matrix API is unavailable
   */
  const calculateStraightLineDistance = (
    origin: LocationValidationCoords,
    destination: LocationValidationCoords
  ): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (destination.lat - origin.lat) * (Math.PI / 180);
    const dLon = (destination.lng - origin.lng) * (Math.PI / 180);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(origin.lat * (Math.PI / 180)) *
        Math.cos(destination.lat * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  };

  /**
   * Fallback validation using straight-line distance
   * Used when Distance Matrix API fails
   */
  const fallbackDistanceValidation = (
    origin: LocationValidationCoords,
    destination: LocationValidationCoords
  ): LocationValidationResult => {
    const distance = calculateStraightLineDistance(origin, destination);
    
    return {
      isValid: distance <= LOCATION_VALIDATION_CONFIG.MAX_DISTANCE_KM,
      method: 'fallback',
      distance: {
        text: `${distance.toFixed(1)} km (straight-line)`,
        value: distance * 1000, // Convert to meters for consistency
      },
      duration: {
        text: "Estimate unavailable",
        value: 0,
      },
      debugInfo: {
        straightLineDistanceKm: distance.toFixed(1),
        maxDistanceKm: LOCATION_VALIDATION_CONFIG.MAX_DISTANCE_KM,
        calculationMethod: 'haversine'
      }
    };
  };

  return {
    validateDistance,
    fallbackDistanceValidation,
    isValidating,
    config: LOCATION_VALIDATION_CONFIG,
  };
};
