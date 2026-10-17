import { memo, useMemo, useEffect, useState, useCallback, useRef } from "react";
import { Map, AdvancedMarker, Pin, useMap, MapCameraChangedEvent } from "@vis.gl/react-google-maps";
import { withGoogleMapsProvider } from "../../../../components/GoogleMapsProvider";
import { parseTimeline } from "../../../Guides/utils/guideDataParser";

interface PlaceWithCoords {
  lat: number;
  lng: number;
  name: string;
  place_id?: string;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  dayNumber: number;
}

interface GuideCoverMapViewProps {
  sections: any[];
  isVisible: boolean;
}

// Component to handle map camera updates (only on initial load)
// Uses fitBounds for accurate fitting of all places with padding
const MapCameraController = memo(({ 
  targetCenter, 
  targetZoom,
  bounds,
  shouldUpdate
}: { 
  targetCenter: { lat: number; lng: number } | null; 
  targetZoom: number;
  bounds: google.maps.LatLngBounds | null;
  shouldUpdate: boolean;
}) => {
  const map = useMap();
  const hasUpdatedRef = useRef(false);

  useEffect(() => {
    if (!map || !shouldUpdate || hasUpdatedRef.current) return;

    if (bounds) {
      // Use fitBounds for accurate fitting with padding
      // Padding ensures places are not at the edge of the map
      map.fitBounds(bounds, {
        top: 50,    // Padding in pixels
        right: 50,
        bottom: 50,
        left: 50,
      });
      hasUpdatedRef.current = true;
    } else if (targetCenter) {
      // Fallback to center/zoom if no bounds
      map.moveCamera({
        center: targetCenter,
        zoom: targetZoom,
      });
      hasUpdatedRef.current = true;
    }
  }, [map, targetCenter, targetZoom, bounds, shouldUpdate]);

  // Reset when shouldUpdate changes
  useEffect(() => {
    if (!shouldUpdate) {
      hasUpdatedRef.current = false;
    }
  }, [shouldUpdate]);

  return null;
});

MapCameraController.displayName = "MapCameraController";

// Component to render polyline connecting all places
const PolylineRenderer = memo(({ 
  path, 
  polylineRef 
}: { 
  path: google.maps.LatLng[]; 
  polylineRef: React.MutableRefObject<google.maps.Polyline | null>;
}) => {
  const map = useMap();

  useEffect(() => {
    if (!map || path.length < 2) return;

    // Remove existing polyline
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    // Create new polyline connecting all places in itinerary order
    const polyline = new google.maps.Polyline({
      path: path,
      geodesic: true, // Follows Earth's curvature for long distances
      strokeColor: "#3B82F6",
      strokeOpacity: 0.8,
      strokeWeight: 4,
      icons: [
        {
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 5,
            strokeColor: "#FFFFFF",
            strokeWeight: 2,
            fillColor: "#3B82F6",
            fillOpacity: 1,
          },
          offset: '50%',
          repeat: '100px', // Arrows every 100px
        },
      ],
    });

    polyline.setMap(map);
    polylineRef.current = polyline;

    // Cleanup
    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [map, path, polylineRef]);

  return null;
});

PolylineRenderer.displayName = "PolylineRenderer";

const GuideCoverMapView = memo(({ sections, isVisible }: GuideCoverMapViewProps) => {
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 20.5937, lng: 78.9629 });
  const [mapZoom, setMapZoom] = useState<number>(4);
  const [targetCenter, setTargetCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [targetZoom, setTargetZoom] = useState<number>(4);
  const [targetBounds, setTargetBounds] = useState<google.maps.LatLngBounds | null>(null);
  const [activeMarker, setActiveMarker] = useState<number | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  // Extract all places with coordinates in EXACT itinerary order
  // Order: Day 1 (morning → afternoon → evening) → Day 2 (morning → afternoon → evening) → ...
  // IMPORTANT: Only extract places from the provided sections - no assumptions, no defaults
  const placesWithCoords = useMemo(() => {
    const places: PlaceWithCoords[] = [];

    // Validate sections exist and are an array
    if (!sections || !Array.isArray(sections) || sections.length === 0) {
      console.log('[Map] No sections provided or sections is empty');
      return places;
    }

    // Sort sections by Sequence to ensure Day 1, Day 2, Day 3 order
    // Handle both numeric and string sequences, and ensure proper ordering
    const sortedSections = [...sections].filter(section => {
      // Only include sections that have a valid Timeline
      return section && section.Timeline;
    }).sort((a, b) => {
      const seqA = typeof a.Sequence === 'number' ? a.Sequence : (typeof a.Sequence === 'string' ? parseInt(a.Sequence, 10) : 0);
      const seqB = typeof b.Sequence === 'number' ? b.Sequence : (typeof b.Sequence === 'string' ? parseInt(b.Sequence, 10) : 0);
      return (seqA || 0) - (seqB || 0);
    });

    // Debug: Log section order
    console.log('[Map] Sections in order:', sortedSections.map(s => ({ 
      sequence: s.Sequence, 
      title: s.Title || `Day ${s.Sequence}`,
      hasTimeline: !!s.Timeline 
    })));

    // Process each section in order
    sortedSections.forEach((section, sectionIndex) => {
      // Validate section has Timeline data
      if (!section || !section.Timeline) {
        console.warn(`[Map] Section ${sectionIndex} has no Timeline, skipping`);
        return;
      }

      const dayNumber = typeof section.Sequence === 'number' 
        ? section.Sequence 
        : (typeof section.Sequence === 'string' ? parseInt(section.Sequence, 10) : 0);
      
      const timeline = parseTimeline(section.Timeline);
      
      // Process places in EXACT order: morning → afternoon → evening
      // Process each time slot separately to maintain exact order
      const morningPlaces = Array.isArray(timeline.morning) ? timeline.morning : [];
      const afternoonPlaces = Array.isArray(timeline.afternoon) ? timeline.afternoon : [];
      const eveningPlaces = Array.isArray(timeline.evening) ? timeline.evening : [];

      // Debug: Log places in this section
      console.log(`[Map] Section ${dayNumber} (Sequence ${section.Sequence}):`, {
        morning: morningPlaces.map((p: any) => p?.name || 'Unknown'),
        afternoon: afternoonPlaces.map((p: any) => p?.name || 'Unknown'),
        evening: eveningPlaces.map((p: any) => p?.name || 'Unknown'),
      });

      // Helper function to extract and validate place coordinates
      const extractPlace = (place: any): { lat: number; lng: number; name: string; place_id?: string } | null => {
        // Validate place object exists
        if (!place || typeof place !== 'object') {
          return null;
        }

        // Validate place has geometry and location
        if (!place.geometry || !place.geometry.location) {
          return null;
        }

        // Extract coordinates - handle both function and direct value
        let lat: number | undefined;
        let lng: number | undefined;

        if (typeof place.geometry.location.lat === "function") {
          lat = place.geometry.location.lat();
        } else {
          lat = place.geometry.location.lat;
        }

        if (typeof place.geometry.location.lng === "function") {
          lng = place.geometry.location.lng();
        } else {
          lng = place.geometry.location.lng;
        }

        // Validate coordinates are valid numbers
        if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) {
          return null;
        }

        // Validate coordinates are within valid range
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          console.warn(`[Map] Invalid coordinates for place ${place.name}: lat=${lat}, lng=${lng}`);
          return null;
        }

        // Extract place name - use actual name or fallback
        const placeName = place.name || place.formatted_address || "Unknown Place";
        
        return {
          lat,
          lng,
          name: placeName,
          place_id: place.place_id,
        };
      };

      // Process morning places first
      morningPlaces.forEach((place: any) => {
        const extracted = extractPlace(place);
        if (extracted) {
          places.push({
            lat: extracted.lat,
            lng: extracted.lng,
            name: extracted.name,
            place_id: extracted.place_id,
            index: places.length,
            isFirst: places.length === 0,
            isLast: false,
            dayNumber: dayNumber,
          });
        }
      });

      // Then afternoon places
      afternoonPlaces.forEach((place: any) => {
        const extracted = extractPlace(place);
        if (extracted) {
          places.push({
            lat: extracted.lat,
            lng: extracted.lng,
            name: extracted.name,
            place_id: extracted.place_id,
            index: places.length,
            isFirst: places.length === 0,
            isLast: false,
            dayNumber: dayNumber,
          });
        }
      });

      // Finally evening places
      eveningPlaces.forEach((place: any) => {
        const extracted = extractPlace(place);
        if (extracted) {
          places.push({
            lat: extracted.lat,
            lng: extracted.lng,
            name: extracted.name,
            place_id: extracted.place_id,
            index: places.length,
            isFirst: places.length === 0,
            isLast: false,
            dayNumber: dayNumber,
          });
        }
      });
    });

    // Mark the last place
    if (places.length > 0) {
      places[places.length - 1].isLast = true;
    }

    // Debug: Log final place order to console with detailed info
    if (places.length > 0) {
      console.log('[Map] ===== FINAL PLACES ORDER =====');
      places.forEach((p, idx) => {
        console.log(`[Map] ${idx + 1}. ${p.name} (Day ${p.dayNumber}, Index ${p.index}, Lat: ${p.lat}, Lng: ${p.lng}) - ${p.isFirst ? 'START' : p.isLast ? 'END' : 'INTERMEDIATE'}`);
      });
      console.log('[Map] ===== END PLACES ORDER =====');
      console.log(`[Map] Total places extracted: ${places.length} from ${sortedSections.length} sections`);
    } else {
      console.warn('[Map] No places with valid coordinates found in any section');
    }

    return places;
  }, [sections]);

  // Calculate optimal map bounds using Google Maps LatLngBounds for accurate fitting
  const calculateBoundsAndZoom = useMemo(() => {
    if (placesWithCoords.length === 0) {
      return { center: { lat: 20.5937, lng: 78.9629 }, zoom: 4, bounds: null };
    }

    if (placesWithCoords.length === 1) {
      // Single place - center on it with appropriate zoom
      return { 
        center: placesWithCoords[0], 
        zoom: 14, // Good zoom level for single place
        bounds: null 
      };
    }

    // Use Google Maps LatLngBounds to calculate proper bounds
    const bounds = new google.maps.LatLngBounds();
    
    // Extend bounds to include all places
    placesWithCoords.forEach(place => {
      bounds.extend(new google.maps.LatLng(place.lat, place.lng));
    });

    // Get center from bounds
    const center = bounds.getCenter();
    const centerLat = center.lat();
    const centerLng = center.lng();

    // Calculate spread for zoom estimation
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const latDiff = ne.lat() - sw.lat();
    const lngDiff = ne.lng() - sw.lng();
    const maxDiff = Math.max(latDiff, lngDiff);

    // Estimate zoom level based on spread (will be refined by fitBounds)
    let estimatedZoom = 4;
    if (maxDiff > 50) estimatedZoom = 2;      // Very large spread (multiple countries)
    else if (maxDiff > 20) estimatedZoom = 3; // Large spread (country level)
    else if (maxDiff > 10) estimatedZoom = 4;  // Medium-large spread (country/region)
    else if (maxDiff > 5) estimatedZoom = 5;   // Medium spread (state level)
    else if (maxDiff > 2) estimatedZoom = 6;   // Small-medium spread (state level)
    else if (maxDiff > 1) estimatedZoom = 7;   // Small spread (state/city level)
    else if (maxDiff > 0.5) estimatedZoom = 8;  // Very small spread (city level)
    else if (maxDiff > 0.2) estimatedZoom = 9;  // Tiny spread
    else estimatedZoom = 10;                    // Very close places

    return { 
      center: { lat: centerLat, lng: centerLng }, 
      zoom: estimatedZoom,
      bounds: bounds 
    };
  }, [placesWithCoords]);

  // Update map center, zoom, and bounds when places change (only on initial load)
  useEffect(() => {
    if (placesWithCoords.length > 0 && isVisible && isInitialLoad) {
      const { center, zoom, bounds } = calculateBoundsAndZoom;
      setTargetCenter(center);
      setTargetZoom(zoom);
      setTargetBounds(bounds);
      setMapCenter(center);
      setMapZoom(zoom);
      setIsInitialLoad(false);
    }
  }, [placesWithCoords, calculateBoundsAndZoom, isVisible, isInitialLoad]);

  // Reset initial load flag when map view is toggled
  useEffect(() => {
    if (isVisible) {
      setIsInitialLoad(true);
    }
  }, [isVisible]);

  // Handle camera changes (user interaction)
  const handleCameraChanged = useCallback((ev: MapCameraChangedEvent) => {
    if (ev.detail?.center) {
      setMapCenter({
        lat: ev.detail.center.lat,
        lng: ev.detail.center.lng,
      });
      if (ev.detail.zoom !== undefined) {
        setMapZoom(ev.detail.zoom);
      }
    }
  }, []);

  // Create polyline path from all places in exact sequence. The isVisible gate
  // lives inside the memo so google.maps is only touched when the map renders.
  const polylinePath = useMemo(() => {
    if (!isVisible || placesWithCoords.length < 2) return [];
    return placesWithCoords.map(p => new google.maps.LatLng(p.lat, p.lng));
  }, [isVisible, placesWithCoords]);

  // Don't render if no places or not visible
  if (!isVisible || placesWithCoords.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 w-full h-full z-[5] pointer-events-auto" style={{ touchAction: 'none' }}>
      <Map
        defaultCenter={mapCenter}
        center={mapCenter}
        zoom={mapZoom}
        onCameraChanged={handleCameraChanged}
        mapId="guideCoverMap"
        style={{ width: "100%", height: "100%", pointerEvents: "auto" }}
        gestureHandling="greedy"
        zoomControl={true}
        scrollwheel={true}
        disableDefaultUI={false}
        mapTypeControl={false}
        fullscreenControl={false}
        streetViewControl={false}
        clickableIcons={false}
        draggable={true}
      >
        <MapCameraController 
          targetCenter={targetCenter} 
          targetZoom={targetZoom}
          bounds={targetBounds}
          shouldUpdate={isInitialLoad} 
        />
        
        {/* Polyline connecting all places in itinerary order */}
        {polylinePath.length > 1 && (
          <PolylineRenderer path={polylinePath} polylineRef={polylineRef} />
        )}

        {/* Markers for each place */}
        {placesWithCoords.map((place) => (
          <AdvancedMarker
            key={`${place.place_id || place.index}-${place.lat}-${place.lng}`}
            position={{ lat: place.lat, lng: place.lng }}
            onClick={() => {
              setActiveMarker(place.index === activeMarker ? null : place.index);
            }}
          >
            <div className="relative flex flex-col items-center" style={{ zIndex: activeMarker === place.index ? 1000 : 'auto' }}>
              <div className="relative cursor-pointer">
                <Pin
                  background={
                    place.isFirst
                      ? "#EF4444" // Red for start
                      : place.isLast
                      ? "#10B981" // Green for end
                      : "#3B82F6" // Blue for intermediate
                  }
                  borderColor={
                    activeMarker === place.index
                      ? "4px solid #FBBF24"
                      : place.isFirst
                      ? "3px solid #DC2626"
                      : place.isLast
                      ? "3px solid #059669"
                      : "3px solid #2563EB"
                  }
                  glyphColor="white"
                />
                {/* Sequence number badge - Shows order in itinerary (1, 2, 3, ...) */}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-[10px] font-bold text-black shadow-lg border-2 border-white/80 z-10">
                  {place.index + 1}
                </div>
              </div>
              
              {/* Info window on click - Higher z-index and better positioning */}
              {activeMarker === place.index && (
                <div 
                  className="absolute -top-24 left-1/2 -translate-x-1/2 bg-gradient-to-br from-gray-900 to-black text-white px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap backdrop-blur-md border-2 border-blue-400/60 shadow-2xl pointer-events-none"
                  style={{ 
                    zIndex: 10000,
                    minWidth: 'max-content'
                  }}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        place.isFirst
                          ? "bg-red-500"
                          : place.isLast
                          ? "bg-green-500"
                          : "bg-blue-500"
                      }`}></div>
                      <span className="text-blue-300 font-bold text-xs">Day {place.dayNumber} • #{place.index + 1}</span>
                    </div>
                    <span className="text-white font-bold text-base">{place.name}</span>
                  </div>
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 -mb-2 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-transparent border-t-gray-900"></div>
                </div>
              )}
            </div>
          </AdvancedMarker>
        ))}
      </Map>
    </div>
  );
});

GuideCoverMapView.displayName = "GuideCoverMapView";

export default withGoogleMapsProvider(GuideCoverMapView);
