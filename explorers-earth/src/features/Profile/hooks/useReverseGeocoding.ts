import { mapsBrowserKey } from "../../../lib/publicRuntimeConfig";
import { useState } from "react";
import axios from "axios";
import { Places, AddressResult } from "../types/types";
import { getCurrentLocation } from "../../../utils/getCurrentLocation";
import { GOOGLE_GEOCODING_BASE_URL } from "../../../config";
import { mapAddressComponents } from "../../../utils/mapAddress";
import { toast } from "sonner";

export const useReverseGeocoding = () => {
  const [mapData, setMapData] = useState<Places | null>(null);
  const [mappedAddress, setMappedAddress] = useState<AddressResult>({});

  const handleGetCurrentLocation = async () => {
    try {
      const { latitude, longitude } = await getCurrentLocation();
      const response = await axios.get(
        `${GOOGLE_GEOCODING_BASE_URL}?latlng=${latitude},${longitude}&key=${
          mapsBrowserKey()
        }`
      );
      const locationData = response.data.results[0];
      setMapData(locationData);
      
      // Map address components for easy access
      if (locationData?.address_components) {
        const mapped = mapAddressComponents(locationData.address_components);
        setMappedAddress(mapped);
      }
      
      return locationData;
    } catch (error) {
      console.error("Error fetching geocoding data:", error);
      toast.error("Failed to detect location. Please try again.");
      throw error;
    }
  };

  return {
    currentLocation: mapData,
    mappedAddress,
    handleGetCurrentLocation,
  };
};
