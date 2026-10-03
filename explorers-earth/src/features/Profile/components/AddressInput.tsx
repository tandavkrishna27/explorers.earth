import { mapsBrowserKey } from "../../../lib/publicRuntimeConfig";
import { useState, useEffect, useRef, FC } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Places } from "../types/types";
import { getCurrentLocation } from "../../../utils/getCurrentLocation";
import CurrLocation from "../../../assets/icons/CurrLocation";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { withGoogleMapsProvider } from "../../../components/GoogleMapsProvider";

interface AddressInputProps {
  value?: string;
  type?: "title" | "address" | "listName" | "primaryAddressCombined";
  onChange: (value: string) => void;
  label: string;
  setPlaces?: (places: Places) => void;
  placeHolder?: string;
  initalValue?: string;
  disabled?: boolean;
  className?: string;
  showDetectLocation?: boolean;
}

const AddressInput: FC<AddressInputProps> = ({
  value = "",
  type,
  initalValue,
  onChange,
  disabled,
  setPlaces,
  placeHolder,
  label,
  className,
  showDetectLocation = false,
}) => {
  const { t } = useTranslation();
  const [address, setAddress] = useState(value);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const placesLibrary = useMapsLibrary("places");

  // Keep the latest callbacks in refs so the Autocomplete init effect can depend
  // only on [placesLibrary, type] and build the Google Autocomplete ONCE. Before
  // this, a keystroke re-render (fresh onChange/setPlaces closures) tore down and
  // rebuilt the Autocomplete, so a pending place_changed fired on the cleared
  // instance and the first selection was lost (BUG-4).
  const onChangeRef = useRef(onChange);
  const setPlacesRef = useRef(setPlaces);
  onChangeRef.current = onChange;
  setPlacesRef.current = setPlaces;

  // Monotonic token identifying the latest user intent. It increments on every
  // new place selection, on manual typing, and on effect cleanup. A place's async
  // metadata fetch captures the token at request start and bails if it's no longer
  // the latest — so an earlier selection whose request resolves LAST (or after the
  // user resumes typing) can't overwrite the newer value (BUG-4 stale request).
  const requestTokenRef = useRef(0);

  useEffect(() => {
    if (initalValue !== undefined) {
      setAddress(initalValue);
    }
  }, [initalValue]);

  useEffect(() => {
    if (value !== undefined) {
      setAddress(value);
    }
  }, [value]);

  // Helper function to extract city and country from address components
  const extractCityCountry = (
    addressComponents: google.maps.GeocoderAddressComponent[]
  ) => {
    let city = "";
    let country = "";

    // Priority order for city extraction
    const cityTypes = [
      "locality", // City/Town
      "sublocality", // Neighborhood/Suburb
      "administrative_area_level_2", // County/District
      "administrative_area_level_3", // Sub-district
    ];

    addressComponents.forEach((component) => {
      const types = component.types;

      // Extract city - prioritize locality first
      if (!city) {
        for (const cityType of cityTypes) {
          if (types.includes(cityType)) {
            city = component.long_name;
            break;
          }
        }
      }

      // Extract country
      if (types.includes("country")) {
        country = component.long_name;
      }
    });

    return { city, country };
  };

  // Initialize the Google Maps Autocomplete when the component is mounted
  useEffect(() => {
    if (!inputRef.current || !placesLibrary) return;

    let autocomplete: google.maps.places.Autocomplete | null = null;

    try {
      autocomplete = new placesLibrary.Autocomplete(inputRef.current, {
        fields: [
          "address_components",
          "geometry",
          "formatted_address",
          "types",
          "place_id",
          "name",
          "formatted_phone_number",
          "website",
        ],
        types: type === "listName" ? ["(regions)"] : [],
      });

      // Listener to handle when the user selects a place
      autocomplete.addListener("place_changed", async () => {
        // Each selection is a new user intent — invalidate any in-flight request.
        const requestToken = ++requestTokenRef.current;
        const place = autocomplete?.getPlace();
        if (!place || !place.geometry) {
          setAddress("");
          onChangeRef.current?.("");
          return;
        }

        let displayValue = "";
        let returnValue = "";

        if (type === "primaryAddressCombined") {
          // For primary address, extract only city and country
          if (place.address_components) {
            const { city, country } = extractCityCountry(
              place.address_components
            );
            displayValue =
              city && country ? `${city}, ${country}` : city || country;
            returnValue = displayValue;
          }
        } else if (type === "title" || type === "listName") {
          // For title/listName, use place name
          displayValue = place.name || "";
          returnValue = place.formatted_address || "";
        } else {
          // For regular address, use full formatted address
          displayValue = place.formatted_address || "";
          returnValue = place.formatted_address || "";
        }

        setAddress(displayValue);

        // If setPlaces is provided and we have a place_id, fetch full place details
        // to get primaryType and primaryTypeDisplayName for better categorization
        if (setPlacesRef.current && place.place_id && (type === "title" || type === "listName")) {
          try {
            // Fetch place details using new Google Places API to get primaryType
            const response = await axios.get(
              `https://places.googleapis.com/v1/places/${place.place_id}`,
              {
                headers: {
                  "X-Goog-Api-Key": mapsBrowserKey(),
                  "X-Goog-FieldMask": "id,displayName,formattedAddress,types,primaryType,primaryTypeDisplayName,addressComponents,location,rating",
                },
              }
            );

            // A newer selection (or manual typing, or cleanup) happened while
            // awaiting — don't let this stale response overwrite the newer value.
            if (requestTokenRef.current !== requestToken) return;

            const placeData = response.data;

            // Merge the autocomplete place with the detailed place data
            const enhancedPlace = {
              ...place,
              primaryType: placeData.primaryType,
              primaryTypeDisplayName: placeData.primaryTypeDisplayName?.text || placeData.primaryTypeDisplayName,
              rating: placeData.rating,
            };

            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            setPlacesRef.current?.(enhancedPlace);
          } catch (error) {
            console.warn("Error fetching place details for metadata:", error);
            if (requestTokenRef.current !== requestToken) return;
            // Fallback to original place if fetch fails
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            setPlacesRef.current?.(place);
          }
        } else if (setPlacesRef.current) {
          // For other types, just pass the place as-is
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          setPlacesRef.current?.(place);
        }

        // A newer intent may have arrived during the awaited fetch above — don't
        // report this (now stale) selection's value.
        if (requestTokenRef.current !== requestToken) return;
        // Call onChange with the appropriate value
        onChangeRef.current?.(returnValue);
      });
    } catch (error) {
      console.error("Error initializing autocomplete:", error);
    }

    // Cleanup function
    return () => {
      // Invalidate any in-flight metadata request tied to this instance.
      requestTokenRef.current += 1;
      if (autocomplete) {
        google.maps.event.clearInstanceListeners(autocomplete);
      }
    };
  }, [placesLibrary, type]);

  const populatePlaceData = (
    place: google.maps.GeocoderResult | google.maps.places.PlaceResult,
    overrideCoords?: { lat: number; lng: number }
  ) => {
    let displayValue = "";
    let returnValue = "";

    if (type === "primaryAddressCombined" && place.address_components) {
      // For primary address, extract only city and country
      const { city, country } = extractCityCountry(place.address_components);
      displayValue = city && country ? `${city}, ${country}` : city || country;
      returnValue = displayValue;
    } else if (type === "title" || type === "listName") {
      // For title/listName, prefer place name or use formatted address
      displayValue = ('name' in place && place.name) ? place.name : (place.formatted_address || "");
      returnValue = place.formatted_address || "";
    } else {
      // For regular address, use full formatted address
      displayValue = place.formatted_address || "";
      returnValue = place.formatted_address || "";
    }

    setAddress(displayValue);

    if (setPlaces) {
      const finalCoords = overrideCoords || {
        lat: place.geometry?.location?.lat() || 0,
        lng: place.geometry?.location?.lng() || 0,
      };

      const placesObject: Places = {
        place_id: ('place_id' in place) ? place.place_id! : "",
        name: ('name' in place && place.name) ? place.name : (place.formatted_address || ""),
        formatted_address: place.formatted_address || "",
        types: place.types || [],
        address_components: place.address_components || [],
        geometry: {
          location: {
            lat: () => finalCoords.lat,
            lng: () => finalCoords.lng,
          },
        },
      };
      setPlaces(placesObject);
    }

    // Call onChange with the appropriate value
    onChange(returnValue);

    toast.success("Location detected successfully!");
  };

  // Handle detect location button click
  const handleDetectLocation = async () => {
    if (!placesLibrary) {
      toast.error("Maps library not loaded yet. Please try again.");
      return;
    }

    setIsDetectingLocation(true);

    try {
      const coords = await getCurrentLocation();

      const originalGpsCoords = {
        lat: coords.latitude,
        lng: coords.longitude,
      };

      // Create a geocoder instance
      const geocoder = new google.maps.Geocoder();

      // Reverse geocode the coordinates to get place details
      geocoder.geocode(
        {
          location: {
            lat: coords.latitude,
            lng: coords.longitude,
          },
        },
        (results, status) => {
          setIsDetectingLocation(false);

          if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
            const place = results[0];

            if (placesLibrary.PlacesService && google.maps.Map) {
              const mapDiv = document.createElement('div');
              const map = new google.maps.Map(mapDiv);
              const service = new placesLibrary.PlacesService(map);

              service.nearbySearch(
                {
                  location: new google.maps.LatLng(coords.latitude, coords.longitude),
                  radius: 100,
                  type: 'establishment',
                },
                (nearbyResults, nearbyStatus) => {
                  if (nearbyStatus === google.maps.places.PlacesServiceStatus.OK &&
                    nearbyResults &&
                    nearbyResults.length > 0 &&
                    nearbyResults[0].place_id) {
                    // Get detailed place information
                    service.getDetails(
                      {
                        placeId: nearbyResults[0].place_id,
                        fields: [
                          "address_components",
                          "geometry",
                          "formatted_address",
                          "types",
                          "place_id",
                          "name",
                          "formatted_phone_number",
                          "website",
                        ],
                      },
                      (detailsResult, detailsStatus) => {
                        if (detailsStatus === google.maps.places.PlacesServiceStatus.OK && detailsResult) {
                          populatePlaceData(detailsResult, originalGpsCoords);
                        } else {
                          populatePlaceData(place, originalGpsCoords);
                        }
                      }
                    );
                  } else {
                    populatePlaceData(place, originalGpsCoords);
                  }
                }
              );
            } else {
              populatePlaceData(place, originalGpsCoords);
            }
          } else {
            toast.error("Unable to find address for your location. Please try again or enter manually.");
          }
        }
      );
    } catch (error: any) {
      setIsDetectingLocation(false);
      console.error("Error detecting location:", error);

      if (error.code === 1) {
        toast.error("Location access denied. Please enable location permissions in your browser.");
      } else if (error.code === 2) {
        toast.error("Location unavailable. Please check your device settings.");
      } else if (error.code === 3) {
        toast.error("Location request timed out. Please try again.");
      } else if (error === "Geolocation not supported") {
        toast.error("Your browser doesn't support geolocation.");
      } else {
        toast.error("Unable to detect your location. Please try again or enter manually.");
      }
    }
  };

  const handleManualChange = (nextAddress: string) => {
    // Manual typing is a new user intent — invalidate a pending selection's
    // async metadata fetch so it can't overwrite what the user is typing.
    requestTokenRef.current += 1;
    setAddress(nextAddress);
    onChange(nextAddress);
  };

  return (
    <>
      {label && (
        <label className="block text-sm font-poppins text-white font-semibold mb-1">
          {label}
        </label>
      )}
      <div className="relative w-full">
        <input
          ref={inputRef}
          type="text"
          disabled={disabled || isDetectingLocation}
          value={address}
          onChange={(e) => handleManualChange(e.target.value)}
          placeholder={placeHolder || t("dashboard.profile.account.fields.addressPlaceholder")}
          className={`w-full placeholder:text-dashboard-muted outline-none p-3 border border-dashboard bg-dashboard-muted font-poppins rounded-md text-sm text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent hover:border-dashboard-accent focus:bg-dashboard-muted ${showDetectLocation ? 'pr-12' : ''
            } ${className || ''}`}
        />
        {showDetectLocation && (
          <button
            type="button"
            onClick={handleDetectLocation}
            disabled={disabled || isDetectingLocation}
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md transition-all duration-200 ${isDetectingLocation
                ? 'bg-dashboard-accent/20 cursor-wait'
                : 'hover:bg-dashboard-accent/10 active:bg-dashboard-accent/20'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={t("dashboard.profile.account.fields.detectLocation")}
          >
            <div className={isDetectingLocation ? 'animate-pulse' : ''}>
              <CurrLocation size="20" />
            </div>
          </button>
        )}
      </div>
    </>
  );
};

export default withGoogleMapsProvider(AddressInput);
