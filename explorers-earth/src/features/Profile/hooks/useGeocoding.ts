import { mapsBrowserKey } from "../../../lib/publicRuntimeConfig";
import { useState, useEffect } from "react";
import axios from "axios";
import { Address, formatAddress } from "../../../utils/formatAddress";
import { GOOGLE_GEOCODING_BASE_URL } from "../../../config";

interface GeocodingResult {
  address_components: {
    long_name: string;
    short_name: string;
    types: string[];
  }[];
  formatted_address: string;
  geometry: {
    bounds: {
      northeast: { lat: number; lng: number };
      southwest: { lat: number; lng: number };
    };
    location: { lat: number; lng: number };
    location_type: string;
    viewport: {
      northeast: { lat: number; lng: number };
      southwest: { lat: number; lng: number };
    };
  };
  navigation_points: { location: { lat: number; lng: number } }[];
  partial_match: boolean;
  place_id: string;
}

const useGeocoding = (address: Address) => {
  const [mapData, setMapData] = useState<GeocodingResult | null>(null);

  useEffect(() => {
    if (!address) return;

    const getGeocodingResult = async () => {
      const encodedAddress = encodeURIComponent(formatAddress(address));

      try {
        const response = await axios.get(
          `${GOOGLE_GEOCODING_BASE_URL}?address=${encodedAddress}&key=${
            mapsBrowserKey()
          }`
        );
        setMapData(response.data.results[0]);
      } catch (error) {
        console.error("Error fetching geocoding data:", error);
      }
    };

    getGeocodingResult();
  }, [address]);

  return { mapData };
};

export default useGeocoding;
