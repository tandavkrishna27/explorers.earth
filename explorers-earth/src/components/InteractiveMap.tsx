import { mapsBrowserKey } from "../lib/publicRuntimeConfig";
import { memo, useEffect, useMemo, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { AdvancedMarker, Map, MapCameraChangedEvent, Pin, useMap } from "@vis.gl/react-google-maps";
import { withGoogleMapsProvider } from "./GoogleMapsProvider";

interface InteractiveMapProps {
  locations: { lat: number; lng: number }[];
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  defaultMapTypeId?: "satellite" | "roadmap";
}

interface LocationWithLabel {
  lat: number;
  lng: number;
  city?: string;
  country?: string;
  label?: string;
}

// Smooth map controller component for animated transitions
const SmoothMapController = ({ targetCoords, targetZoom }: { targetCoords: { lat: number; lng: number }; targetZoom: number }): JSX.Element | null => {
  const map = useMap();

  useEffect(() => {
    if (map && targetCoords) {
      map.moveCamera({
        center: targetCoords,
        zoom: targetZoom,
      });
    }
  }, [map, targetCoords, targetZoom]);

  return null;
};

const InteractiveMap = memo(({ locations, onToggleExpand, defaultMapTypeId = "roadmap" }: InteractiveMapProps) => {
  const [locationLabels, setLocationLabels] = useState<LocationWithLabel[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number }>({ lat: 20.5937, lng: 78.9629 });
  const [currentZoom, setCurrentZoom] = useState<number>(2);
  const [targetCoords, setTargetCoords] = useState<{ lat: number; lng: number }>({ lat: 20.5937, lng: 78.9629 });
  const [targetZoom, setTargetZoom] = useState<number>(2);
  const [activeMarker, setActiveMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [mapTypeId, _setMapTypeId] = useState<"satellite" | "roadmap">(defaultMapTypeId);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);

  // Calculate bounds and zoom for multiple locations
  const calculateBoundsAndZoom = useMemo(() => {
    if (locations.length === 0) {
      return { center: { lat: 20.5937, lng: 78.9629 }, zoom: 2 };
    }

    if (locations.length === 1) {
      return { center: { lat: locations[0].lat, lng: locations[0].lng }, zoom: 8 };
    }

    const lats = locations.map(coord => coord.lat);
    const lngs = locations.map(coord => coord.lng);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const center = {
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2,
    };

    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;
    const maxDiff = Math.max(latDiff, lngDiff);

    let zoom = 2;
    if (maxDiff > 50) zoom = 2;
    else if (maxDiff > 20) zoom = 3;
    else if (maxDiff > 10) zoom = 4;
    else if (maxDiff > 5) zoom = 5;
    else if (maxDiff > 2) zoom = 6;
    else if (maxDiff > 1) zoom = 7;
    else if (maxDiff > 0.5) zoom = 8;
    else if (maxDiff > 0.2) zoom = 9;
    else if (maxDiff > 0.1) zoom = 10;
    else zoom = 11;

    return { center, zoom };
  }, [locations]);

  // Initialize target coordinates
  useEffect(() => {
    if (targetCoords.lat === 20.5937 && targetCoords.lng === 78.9629) {
      setTargetCoords(calculateBoundsAndZoom.center);
      setTargetZoom(calculateBoundsAndZoom.zoom);
      setCurrentCoords(calculateBoundsAndZoom.center);
      setCurrentZoom(calculateBoundsAndZoom.zoom);
    }
  }, [calculateBoundsAndZoom, targetCoords]);

  // Update target when locations change
  useEffect(() => {
    setTargetCoords(calculateBoundsAndZoom.center);
    setTargetZoom(calculateBoundsAndZoom.zoom);
  }, [calculateBoundsAndZoom]);

  // Smooth transition function
  const smoothTransitionTo = useCallback((coords: { lat: number; lng: number }, zoom: number) => {
    setTargetCoords(coords);
    setTargetZoom(zoom);
  }, []);

  const handleCameraChanged = (event: MapCameraChangedEvent) => {
    const { detail } = event;
    setCurrentCoords(detail.center);
    setCurrentZoom(detail.zoom || 2);
  };

  // Reverse geocode locations to get city and country names
  useEffect(() => {
    const fetchLocationNames = async () => {
      if (locations.length === 0) {
        setLocationLabels([]);
        return;
      }

      const labels: LocationWithLabel[] = await Promise.all(
        locations.map(async (loc) => {
          try {
            const response = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${loc.lat},${loc.lng}&key=${mapsBrowserKey()}`
            );
            const data = await response.json();

            if (data.results && data.results.length > 0) {
              const addressComponents = data.results[0].address_components;
              const city = addressComponents.find((comp: any) =>
                comp.types.includes("locality") || comp.types.includes("administrative_area_level_2")
              );
              const country = addressComponents.find((comp: any) =>
                comp.types.includes("country")
              );

              const cityName = city?.long_name || city?.short_name;
              const countryName = country?.long_name || country?.short_name;

              return {
                lat: loc.lat,
                lng: loc.lng,
                city: cityName,
                country: countryName,
                label: cityName || countryName || `${loc.lat.toFixed(2)}, ${loc.lng.toFixed(2)}`,
              };
            }
          } catch (error) {
            console.warn("Error reverse geocoding:", error);
          }

          return {
            lat: loc.lat,
            lng: loc.lng,
            label: `${loc.lat.toFixed(2)}, ${loc.lng.toFixed(2)}`,
          };
        })
      );

      setLocationLabels(labels);
    };

    fetchLocationNames();
  }, [locations]);

  // Handle marker click
  const handleMarkerClick = useCallback((loc: { lat: number; lng: number }) => {
    smoothTransitionTo(loc, 15);
    setActiveMarker(loc);
  }, [smoothTransitionTo]);

  // Handle fullscreen toggle
  const handleFullscreenToggle = () => {
    setIsFullscreen(!isFullscreen);
    if (onToggleExpand) {
      onToggleExpand();
    }
  };

  // Get markers to display
  const markersToDisplay = locationLabels.length > 0 ? locationLabels : locations;

  // Fullscreen Overlay Component
  const FullscreenOverlay = () => {
    const [fullscreenCoords, setFullscreenCoords] = useState(currentCoords);
    const [fullscreenZoom, setFullscreenZoom] = useState(currentZoom);
    const [fullscreenTargetCoords, setFullscreenTargetCoords] = useState(targetCoords);
    const [fullscreenTargetZoom, setFullscreenTargetZoom] = useState(targetZoom);
    const [fullscreenMapTypeId, setFullscreenMapTypeId] = useState<"satellite" | "roadmap">(mapTypeId);

    // Sync with main map state
    useEffect(() => {
      setFullscreenCoords(currentCoords);
      setFullscreenZoom(currentZoom);
      setFullscreenTargetCoords(targetCoords);
      setFullscreenTargetZoom(targetZoom);
      setFullscreenMapTypeId(mapTypeId);
    }, [currentCoords, currentZoom, targetCoords, targetZoom, mapTypeId]);

    if (!isFullscreen) return null;

    const handleFullscreenCameraChanged = (event: MapCameraChangedEvent) => {
      const { detail } = event;
      setFullscreenCoords(detail.center);
      setFullscreenZoom(detail.zoom || 2);
    };

    const handleFullscreenMarkerClick = (loc: { lat: number; lng: number }) => {
      setFullscreenTargetCoords(loc);
      setFullscreenTargetZoom(15);
      setActiveMarker(loc);
    };

    return (
      <div
        ref={fullscreenContainerRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          width: "100%",
          height: "100%",
          backgroundColor: "#000000",
        }}
      >
        <Map
          defaultCenter={fullscreenCoords}
          center={fullscreenCoords}
          zoom={fullscreenZoom}
          onCameraChanged={handleFullscreenCameraChanged}
          mapId={"fullscreenMapView"}
          mapTypeId={fullscreenMapTypeId}
          style={{ height: "100%", width: "100%" }}
          scrollwheel={true}
          gestureHandling={"greedy"}
        >
          <SmoothMapController targetCoords={fullscreenTargetCoords} targetZoom={fullscreenTargetZoom} />
          {markersToDisplay.map((loc, index) => (
            <AdvancedMarker
              key={index}
              position={{ lat: loc.lat, lng: loc.lng }}
              onClick={() => handleFullscreenMarkerClick(loc)}
            >
              <Pin
                background={
                  activeMarker?.lat === loc.lat && activeMarker?.lng === loc.lng
                    ? "purple"
                    : "red"
                }
                borderColor={
                  activeMarker?.lat === loc.lat && activeMarker?.lng === loc.lng
                    ? "3px solid purple"
                    : "red"
                }
                glyphColor={"white"}
              />
            </AdvancedMarker>
          ))}
        </Map>
        {/* Map Type Toggle Button */}
        <button
          onClick={() => setFullscreenMapTypeId(prev => prev === "satellite" ? "roadmap" : "satellite")}
          className="absolute top-2 left-2 z-[10000] bg-black/70 hover:bg-black/90 backdrop-blur-sm text-white px-3 py-2 rounded-lg shadow-lg transition-all duration-200 pointer-events-auto text-sm font-medium"
          aria-label="Toggle map type"
        >
          {fullscreenMapTypeId === "satellite" ? "Map" : "Satellite"}
        </button>
        {/* Close Button */}
        <button
          onClick={handleFullscreenToggle}
          className="absolute top-2 right-2 z-[10000] bg-black/70 hover:bg-black/90 backdrop-blur-sm text-white p-2 rounded-lg shadow-lg transition-all duration-200 pointer-events-auto"
          aria-label="Close map"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  };

  return (
    <>
      {/* Original Map Container */}
      <div
        className="absolute inset-0 w-full h-full overflow-hidden"
        style={{
          pointerEvents: "auto",
          zIndex: 1,
          width: "100%",
          height: "100%",
        }}
      >
        <Map
          defaultCenter={currentCoords}
          center={currentCoords}
          zoom={currentZoom}
          onCameraChanged={handleCameraChanged}
          mapId={"homeMapView"}
          mapTypeId={mapTypeId}
          style={{ height: "100%", width: "100%" }}
          scrollwheel={true}
          gestureHandling={"greedy"}
          disableDefaultUI={true}
          fullscreenControl={false}
          zoomControl={false}
          mapTypeControl={false}
          streetViewControl={false}
        >
          <SmoothMapController targetCoords={targetCoords} targetZoom={targetZoom} />
          {markersToDisplay.map((loc, index) => (
            <AdvancedMarker
              key={index}
              position={{ lat: loc.lat, lng: loc.lng }}
              onClick={() => handleMarkerClick(loc)}
            >
              <Pin
                background={
                  activeMarker?.lat === loc.lat && activeMarker?.lng === loc.lng
                    ? "purple"
                    : "red"
                }
                borderColor={
                  activeMarker?.lat === loc.lat && activeMarker?.lng === loc.lng
                    ? "3px solid purple"
                    : "red"
                }
                glyphColor={"white"}
              />
            </AdvancedMarker>
          ))}
        </Map>
      </div>

      {/* Expand Button - Only shown when not fullscreen */}
      {!isFullscreen && (
        <button
          onClick={handleFullscreenToggle}
          className="absolute bottom-8 right-2 z-50 bg-black/70 hover:bg-black/90 active:bg-black text-white p-2 rounded-lg shadow-lg transition-all duration-200 pointer-events-auto cursor-pointer hover:scale-110 active:scale-95 flex items-center justify-center border border-white/5"
          aria-label="Expand map"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      )}

      {/* Fullscreen Overlay - Rendered via Portal */}
      {typeof document !== "undefined" && createPortal(<FullscreenOverlay />, document.body)}
    </>
  );
});

InteractiveMap.displayName = "InteractiveMap";

export default withGoogleMapsProvider(InteractiveMap);

