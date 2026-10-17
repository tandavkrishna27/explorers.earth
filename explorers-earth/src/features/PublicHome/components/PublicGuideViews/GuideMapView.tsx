import { selectGuidePlaceThumbnail } from "../../utils/publicGuidePhotoViewModel";
import { usePublicCategoryThemeStyles } from "../PublicCategoryThemeContext";
import React, { memo, useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Map, AdvancedMarker, Pin, useMap, MapCameraChangedEvent } from "@vis.gl/react-google-maps";
import { withGoogleMapsProvider } from "../../../../components/GoogleMapsProvider";
import { parseTimeline } from "../../../Guides/utils/guideDataParser";
import GooglePlaceModal from "./GooglePlaceModal";
import Card from "../../../../components/ui/Card";
import Button from "../../../../components/ui/Button";
import WhiteMap from "../../../../assets/icons/WhiteMap";
import UpArrow from "../../../../assets/icons/UpArrow";
import Down from "../../../../assets/icons/Down";
import CrossIcon from "../../../../assets/icons/CrossIcon";

interface PlaceWithCoords {
  place: any;
  lat: number;
  lng: number;
  dayNumber: number;
  sequence: number; // Overall sequence across all days
  placeIndex: number; // Index within the day
}

interface GuideMapViewProps {
  sections: any[];
  guide: any;
  isMapView: boolean;
  onCloseMap: () => void;
  onPlaceClick?: (place: any) => void;
  highlightedPlaceId?: string | null;
}

// Map Camera Controller Component
const MapCameraController = memo(({
  targetBounds,
  targetCenter,
  targetZoom
}: {
  targetBounds?: google.maps.LatLngBounds | null;
  targetCenter?: { lat: number; lng: number };
  targetZoom?: number;
}) => {
  const map = useMap();
  const hasUpdatedRef = useRef(false);

  useEffect(() => {
    if (!map) return;

    if (targetBounds) {
      map.fitBounds(targetBounds, {
        top: 80,
        bottom: 80,
        left: 80,
        right: 80
      });
      hasUpdatedRef.current = true;
    } else if (targetCenter && targetZoom) {
      map.moveCamera({
        center: targetCenter,
        zoom: targetZoom,
      });
      hasUpdatedRef.current = true;
    }
  }, [map, targetBounds, targetCenter, targetZoom]);

  return null;
});

MapCameraController.displayName = "MapCameraController";

// Polyline Renderer Component
const PolylineRenderer = memo(({
  path
}: {
  path: Array<{ lat: number; lng: number }>;
}) => {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || path.length < 2) {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
      return;
    }

    if (!polylineRef.current) {
      polylineRef.current = new google.maps.Polyline({
        path: path.map(p => new google.maps.LatLng(p.lat, p.lng)),
        geodesic: true,
        strokeColor: "#3498DB",
        strokeOpacity: 0.8,
        strokeWeight: 4,
        icons: [{
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 5,
            strokeColor: "#3498DB",
            strokeWeight: 2,
          },
          offset: "100%",
          repeat: "100px",
        }],
      });
      polylineRef.current.setMap(map);
    } else {
      polylineRef.current.setPath(path.map(p => new google.maps.LatLng(p.lat, p.lng)));
    }

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [map, path]);

  return null;
});

PolylineRenderer.displayName = "PolylineRenderer";

// Clickable Marker Component - attaches click handler directly to marker element
const ClickableMarker = memo(({
  placeWithCoords,
  isActive,
  isHighlighted,
  onMarkerClick
}: {
  placeWithCoords: PlaceWithCoords;
  isActive: boolean;
  isHighlighted: boolean;
  onMarkerClick: (placeWithCoords: PlaceWithCoords, event?: any) => void;
}) => {
  const markerRef = useRef<any>(null);

  useEffect(() => {
    // Wait for marker to be rendered, then attach listener
    const timer = setTimeout(() => {
      if (markerRef.current) {
        // Try to get the underlying marker element
        const markerElement = markerRef.current;

        // Attach click listener directly to the marker element
        const clickListener = (event: Event) => {
          event.stopPropagation();
          onMarkerClick(placeWithCoords, event);
        };

        // Try multiple event types
        if (markerElement.addEventListener) {
          markerElement.addEventListener('gmp-click', clickListener);
          markerElement.addEventListener('click', clickListener);
        }

        return () => {
          if (markerElement.removeEventListener) {
            markerElement.removeEventListener('gmp-click', clickListener);
            markerElement.removeEventListener('click', clickListener);
          }
        };
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [placeWithCoords, onMarkerClick]);

  return (
    <AdvancedMarker
      ref={markerRef}
      position={{ lat: placeWithCoords.lat, lng: placeWithCoords.lng }}
      onClick={(event) => {
        // Primary click handler - this should work for the marker
        onMarkerClick(placeWithCoords, event);
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          cursor: 'pointer',
          touchAction: 'manipulation',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onClick={(e) => {
          // Backup: ensure clicks on the wrapper also trigger
          e.stopPropagation();
          onMarkerClick(placeWithCoords, e);
        }}
      >
        {/* Pin - Directly clickable, no blocking elements */}
        {/* Styled exactly like recommendations page markers */}
        <Pin
          background={isActive || isHighlighted ? "purple" : "red"}
          borderColor={isActive || isHighlighted ? "3px solid purple" : "red"}
          glyphColor={"white"}
        />
      </div>
    </AdvancedMarker>
  );
});

ClickableMarker.displayName = "ClickableMarker";

const GuideMapView = memo(({
  sections,
  guide: _guide,
  isMapView,
  onCloseMap,
  onPlaceClick,
  highlightedPlaceId
}: GuideMapViewProps) => {
  const categoryStyles = usePublicCategoryThemeStyles();
  const [selectedDay, setSelectedDay] = useState<string>("all");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeMarker, setActiveMarker] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 20.5937, lng: 78.9629 });
  const [mapZoom, setMapZoom] = useState<number>(5);
  const [targetBounds, setTargetBounds] = useState<google.maps.LatLngBounds | null>(null);
  const [targetCenter, setTargetCenter] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [targetZoom, setTargetZoom] = useState<number | undefined>(undefined);
  const [selectedGooglePlace, setSelectedGooglePlace] = useState<{ visible: boolean; place: any | null }>({
    visible: false,
    place: null,
  });
  const [isCardsExpanded, setIsCardsExpanded] = useState(true);
  const [infoWindowPlace, setInfoWindowPlace] = useState<PlaceWithCoords | null>(null);
  const markerClickRef = useRef<boolean>(false);
  const lastClickTimeRef = useRef<number>(0);

  // Extract all places with coordinates in strict order
  const allPlacesWithCoords = useMemo(() => {
    const places: PlaceWithCoords[] = [];
    let globalSequence = 0;

    // Sort sections by Sequence
    const sortedSections = [...sections]
      .filter(section => section.Timeline)
      .sort((a, b) => (a.Sequence || 0) - (b.Sequence || 0));

    sortedSections.forEach((section) => {
      const timeline = parseTimeline(section.Timeline);
      const dayNumber = section.Sequence || 0;

      // Process in strict order: morning → afternoon → evening
      const timeSlots = [
        { key: 'morning', places: timeline.morning || [] },
        { key: 'afternoon', places: timeline.afternoon || [] },
        { key: 'evening', places: timeline.evening || [] },
      ];

      timeSlots.forEach(({ places: timeSlotPlaces }) => {
        timeSlotPlaces.forEach((place: any, placeIndex: number) => {
          if (!place || typeof place !== 'object') return;

          // Extract coordinates
          let lat: number | null = null;
          let lng: number | null = null;

          if (place.geometry?.location) {
            if (typeof place.geometry.location.lat === 'function') {
              lat = place.geometry.location.lat();
              lng = place.geometry.location.lng();
            } else {
              lat = place.geometry.location.lat;
              lng = place.geometry.location.lng;
            }
          }

          // Validate coordinates
          if (
            typeof lat === 'number' &&
            typeof lng === 'number' &&
            !isNaN(lat) &&
            !isNaN(lng) &&
            lat >= -90 &&
            lat <= 90 &&
            lng >= -180 &&
            lng <= 180
          ) {
            places.push({
              place,
              lat,
              lng,
              dayNumber,
              sequence: globalSequence++,
              placeIndex,
            });
          }
        });
      });
    });

    return places;
  }, [sections]);

  // Filter places based on selected day
  const filteredPlaces = useMemo(() => {
    if (selectedDay === "all") {
      return allPlacesWithCoords;
    }
    const dayNum = parseInt(selectedDay.replace("day-", ""));
    return allPlacesWithCoords.filter(p => p.dayNumber === dayNum);
  }, [allPlacesWithCoords, selectedDay]);

  // Get unique days for filter chips
  const availableDays = useMemo(() => {
    const days = new Set<number>();
    allPlacesWithCoords.forEach(p => {
      if (p.dayNumber > 0) {
        days.add(p.dayNumber);
      }
    });
    return Array.from(days).sort((a, b) => a - b);
  }, [allPlacesWithCoords]);

  // Calculate map bounds for filtered places
  useEffect(() => {
    if (filteredPlaces.length === 0) {
      setTargetBounds(null);
      setTargetCenter({ lat: 20.5937, lng: 78.9629 });
      setTargetZoom(5);
      return;
    }

    if (filteredPlaces.length === 1) {
      const place = filteredPlaces[0];
      setTargetBounds(null);
      setTargetCenter({ lat: place.lat, lng: place.lng });
      setTargetZoom(12);
      return;
    }

    // Calculate bounds for multiple places
    const lats = filteredPlaces.map(p => p.lat);
    const lngs = filteredPlaces.map(p => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const bounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(minLat, minLng),
      new google.maps.LatLng(maxLat, maxLng)
    );

    setTargetBounds(bounds);
    setTargetCenter(undefined);
    setTargetZoom(undefined);
  }, [filteredPlaces]);


  const getPlaceImage = useCallback((place: unknown): string => selectGuidePlaceThumbnail(place, sections)?.url ?? "https://placehold.co/400x400", [sections]);

  // Handle marker click - show InfoWindow (like recommendations map)
  const handleMarkerClick = useCallback((placeWithCoords: PlaceWithCoords, event?: any) => {
    // Prevent duplicate calls within 100ms (debounce)
    const now = Date.now();
    if (now - lastClickTimeRef.current < 100) {
      return;
    }
    lastClickTimeRef.current = now;

    // Mark that a marker was clicked to prevent map onClick from interfering
    markerClickRef.current = true;

    // Prevent event propagation if event exists
    if (event) {
      if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
    }

    // Immediately update state to show InfoWindow
    // Close any previously open InfoWindow and open the new one
    setInfoWindowPlace((currentInfoPlace) => {
      if (currentInfoPlace?.sequence === placeWithCoords.sequence) {
        // If clicking the same marker, toggle it closed
        setActiveMarker(null);
        markerClickRef.current = false;
        return null;
      } else {
        // Open InfoWindow for clicked marker - close any previous one first
        setActiveMarker(placeWithCoords.place.place_id || placeWithCoords.sequence.toString());
        return placeWithCoords;
      }
    });

    // Reset the flag after a short delay
    setTimeout(() => {
      markerClickRef.current = false;
    }, 200);

    if (onPlaceClick) {
      onPlaceClick(placeWithCoords.place);
    }
  }, [onPlaceClick]);

  // Handle card click - center map on place
  const handleCardClick = useCallback((placeWithCoords: PlaceWithCoords) => {
    setTargetBounds(null);
    setTargetCenter({ lat: placeWithCoords.lat, lng: placeWithCoords.lng });
    setTargetZoom(14);
    setActiveMarker(placeWithCoords.place.place_id || placeWithCoords.sequence.toString());

    // Scroll to map if needed
    const mapElement = document.getElementById('guide-map-container');
    if (mapElement) {
      mapElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Get polyline path for filtered places
  const polylinePath = useMemo(() => {
    return filteredPlaces.map(p => ({ lat: p.lat, lng: p.lng }));
  }, [filteredPlaces]);

  // Handle map camera changes
  const handleCameraChange = useCallback((ev: MapCameraChangedEvent) => {
    if (ev.detail.center) {
      setMapCenter({ lat: ev.detail.center.lat, lng: ev.detail.center.lng });
    }
    if (ev.detail.zoom) {
      setMapZoom(ev.detail.zoom);
    }
  }, []);

  // Trigger map resize when fullscreen toggles to prevent blinking
  useEffect(() => {
    // Small delay to ensure DOM is ready before triggering resize
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      // Also trigger a custom event for Google Maps
      const mapElement = document.querySelector('[data-map-id="guide-map"]');
      if (mapElement) {
        const resizeEvent = new Event('resize');
        window.dispatchEvent(resizeEvent);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  // Get marker type (start, intermediate, end) - not currently used
  // const getMarkerType = useCallback((index: number, total: number) => {
  //   if (index === 0) return 'start';
  //   if (index === total - 1) return 'end';
  //   return 'intermediate';
  // }, []);

  // Parse address into City, State, Country components
  const parseAddress = useCallback((formattedAddress: string) => {
    if (!formattedAddress) return { city: '', state: '', country: '', full: '' };

    const parts = formattedAddress.split(',').map(p => p.trim());
    const full = formattedAddress;

    // Try to extract city, state, country from formatted address
    // Common format: "Street, City, State ZIP, Country"
    let city = '';
    let state = '';
    let country = '';

    if (parts.length >= 2) {
      city = parts[parts.length - 3] || parts[parts.length - 2] || '';
      // State might be in format "State ZIP" or just "State"
      const statePart = parts[parts.length - 2] || '';
      state = statePart.split(/\s+/)[0] || '';
      country = parts[parts.length - 1] || '';
    } else if (parts.length === 1) {
      city = parts[0];
    }

    return { city, state, country, full };
  }, []);

  if (!isMapView) {
    return null;
  }

  if (allPlacesWithCoords.length === 0) {
    return (
      <div className="relative w-full h-screen md:h-[700px] flex items-center justify-center bg-[var(--category-panel,#111827)]">
        <div className="text-[var(--category-text,#FFFFFF)] text-center">
          <p className="text-lg font-semibold mb-2">No places with coordinates found</p>
          <p className="text-sm text-[var(--category-muted,#9CA3AF)]">Please add places with valid locations to view the map</p>
          <Button
            btnText="Close"
            variant="primary"
            size="small"
            onClickHandler={onCloseMap}
            className="mt-4"
          />
        </div>
      </div>
    );
  }

  const MapContent = (
    <div className="relative w-full" style={{ height: '100vh' }}>
      {/* Day Filter Buttons - Positioned just below map controls like recommendations page */}
      <div
        className="absolute top-12 left-0 right-0 z-40 flex flex-row gap-2 items-center flex-nowrap whitespace-nowrap py-3 px-2 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {availableDays.length > 0 ? (
          <div className="flex gap-3">
            <Button
              btnText="All"
              type="button"
              variant={selectedDay === "all" ? "tagSelected" : "tag"}
              onClickHandler={() => setSelectedDay("all")}
              size="xsmall"
            />
            {availableDays.map((dayNum) => {
              const dayId = `day-${dayNum}`;
              return (
                <Button
                  key={dayNum}
                  btnText={`Day ${dayNum}`}
                  type="button"
                  variant={selectedDay === dayId ? "tagSelected" : "tag"}
                  onClickHandler={() => setSelectedDay(dayId)}
                  size="xsmall"
                />
              );
            })}
          </div>
        ) : (
          <div className="flex">
            <span className="text-[var(--category-text,#FFFFFF)] text-sm">Loading days...</span>
          </div>
        )}
      </div>

      {/* Map - Single instance with same mapId to prevent re-initialization */}
      {/* Mobile: full viewport height, Desktop: fixed height */}
      <Map
        defaultCenter={mapCenter}
        center={mapCenter}
        defaultZoom={mapZoom}
        zoom={mapZoom}
        onCameraChanged={handleCameraChange}
        onClick={() => {
          // Close InfoWindow when clicking on map background
          // But only if a marker wasn't just clicked
          if (!markerClickRef.current) {
            setInfoWindowPlace(null);
            setActiveMarker(null);
          }
        }}
        mapId="guide-map"
        style={{ width: '100%', height: '100vh' }}
        gestureHandling="greedy"
        disableDefaultUI={false}
      >
        <MapCameraController
          targetBounds={targetBounds}
          targetCenter={targetCenter}
          targetZoom={targetZoom}
        />

        {/* Render polyline */}
        {polylinePath.length >= 2 && (
          <PolylineRenderer path={polylinePath} />
        )}

        {/* Render markers */}
        {filteredPlaces.map((placeWithCoords, index) => {
          const isHighlighted = highlightedPlaceId === placeWithCoords.place.place_id;
          const isActive = activeMarker === (placeWithCoords.place.place_id || placeWithCoords.sequence.toString());
          const showInfoWindow = infoWindowPlace?.sequence === placeWithCoords.sequence;

          return (
            <React.Fragment key={`marker-wrapper-${placeWithCoords.sequence}-${placeWithCoords.place.place_id || index}`}>
              <ClickableMarker
                placeWithCoords={placeWithCoords}
                isActive={isActive}
                isHighlighted={isHighlighted}
                onMarkerClick={handleMarkerClick}
              />

              {/* InfoWindow - Rendered as separate AdvancedMarker overlay to not block marker clicks */}
              {showInfoWindow && (
                <AdvancedMarker
                  position={{ lat: placeWithCoords.lat, lng: placeWithCoords.lng }}
                  zIndex={10002}
                >
                  {(() => {
                    const placeImage = getPlaceImage(placeWithCoords.place);
                    const addressInfo = parseAddress(placeWithCoords.place.formatted_address || '');
                    const placeName = placeWithCoords.place.name || placeWithCoords.place.formatted_address || "Place";
                    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName)}${placeWithCoords.place.place_id ? `&query_place_id=${placeWithCoords.place.place_id}` : ''}`;

                    return (
                      <div
                        className="absolute left-1/2 bg-[var(--category-panel,#FFFFFF)] rounded-lg shadow-2xl pointer-events-auto min-w-[280px] max-w-[320px] overflow-hidden"
                        style={{
                          zIndex: 10002,
                          bottom: '100%',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          marginBottom: '8px',
                          pointerEvents: 'auto',
                          position: 'absolute'
                        }}
                        onClick={(e) => {
                          // Prevent InfoWindow clicks from bubbling to marker
                          if (e && typeof e.stopPropagation === 'function') {
                            e.stopPropagation();
                          }
                        }}
                      >
                        {/* Close Button */}
                        <button
                          onClick={(e) => {
                            if (e && typeof e.stopPropagation === 'function') {
                              e.stopPropagation();
                            }
                            setInfoWindowPlace(null);
                            setActiveMarker(null);
                          }}
                          className={`absolute top-2 right-2 z-[10001] bg-[var(--category-panel,rgba(255,255,255,0.9))] hover:bg-[var(--category-hover,#F3F4F6)] rounded-full p-1.5 shadow-sm transition-colors ${categoryStyles ? "focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-[var(--category-focus)] focus-visible:!transform-none" : ""}`}
                          aria-label="Close"
                        >
                          <CrossIcon stroke="var(--category-text, #666)" size="4" />
                        </button>

                        {/* Place Image */}
                        {placeImage && (
                          <div className="relative w-full h-32 overflow-hidden">
                            <img
                              src={placeImage}
                              alt={placeName}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          </div>
                        )}

                        {/* InfoWindow Content */}
                        <div className="p-4">
                          {/* Place Name */}
                          <h3 className="text-base font-semibold text-[var(--category-text,#111827)] mb-2 line-clamp-2 pr-8">
                            {placeName}
                          </h3>

                          {/* Full Address */}
                          {addressInfo.full && (
                            <div className="mb-3">
                              <p className="text-sm text-[var(--category-muted,#4B5563)] line-clamp-2">
                                {addressInfo.full}
                              </p>
                              {/* City, State, Country breakdown */}
                              {(addressInfo.city || addressInfo.state || addressInfo.country) && (
                                <p className="text-xs text-[var(--category-muted,#6B7280)] mt-1">
                                  {[addressInfo.city, addressInfo.state, addressInfo.country].filter(Boolean).join(', ')}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Rating and Reviews */}
                          {(placeWithCoords.place.rating || placeWithCoords.place.user_ratings_total) && (
                            <div className="flex items-center gap-2 mb-3">
                              {placeWithCoords.place.rating && (
                                <div className="flex items-center gap-1">
                                  <span className="text-[var(--category-rating,#EAB308)] text-sm">★</span>
                                  <span className="text-sm font-medium text-[var(--category-text,#111827)]">
                                    {placeWithCoords.place.rating.toFixed(1)}
                                  </span>
                                </div>
                              )}
                              {placeWithCoords.place.user_ratings_total && (
                                <span className="text-sm text-[var(--category-muted,#6B7280)]">
                                  ({placeWithCoords.place.user_ratings_total.toLocaleString()} {placeWithCoords.place.user_ratings_total === 1 ? 'review' : 'reviews'})
                                </span>
                              )}
                            </div>
                          )}

                          {/* View on Google Maps Link */}
                          <a
                            href={googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              if (e && typeof e.stopPropagation === 'function') {
                                e.stopPropagation();
                              }
                            }}
                            className={`inline-flex items-center gap-2 text-sm text-[var(--category-text,#2563EB)] hover:text-[var(--category-text,#1D4ED8)] font-medium mb-2 transition-colors ${categoryStyles ? "focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-[var(--category-focus)] focus-visible:!transform-none" : ""}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                            View on Google Maps
                          </a>

                          {/* Day and Sequence Info */}
                          <div className="flex items-center gap-2 text-xs text-[var(--category-muted,#6B7280)] pt-2 border-t border-[var(--category-control-border,#E5E7EB)] mt-2">
                            <span>Day {placeWithCoords.dayNumber}</span>
                            <span>•</span>
                            <span>Stop #{placeWithCoords.sequence}</span>
                          </div>
                        </div>

                        {/* Arrow pointing to marker */}
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-transparent border-t-white"></div>
                      </div>
                    );
                  })()}
                </AdvancedMarker>
              )}
            </React.Fragment>
          );
        })}
      </Map>

      {/* Collapsible Wrapper for Cards - Positioned like recommendations page */}
      <div
        data-public-guide-map-tray
        className="bg-[var(--category-panel,rgba(0,0,0,0.3))] backdrop-blur-sm py-4 absolute left-0 right-0 z-50 transition-transform duration-300 ease-in-out"
        style={{
          bottom: 'calc(var(--public-nav-reserved-bottom) + var(--public-guide-tray-gap))',
          transform: isCardsExpanded ? 'translateY(0)' : 'translateY(calc(100% - var(--public-guide-tray-visible-height) + var(--public-guide-tray-gap)))',
        }}
      >
        {/* Toggle Button - Centered above cards */}
        <div className="flex justify-center mb-2">
          <button
            onClick={() => setIsCardsExpanded(!isCardsExpanded)}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center bg-[var(--category-panel,rgba(0,0,0,0.8))] backdrop-blur-sm border border-[var(--category-control-border,#374151)] rounded-full p-2 text-[var(--category-text,#FFFFFF)] hover:bg-[var(--category-hover,rgba(0,0,0,0.9))] transition-colors duration-200 ${categoryStyles ? "focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-[var(--category-focus)] focus-visible:!transform-none" : ""}`}
            aria-label={isCardsExpanded ? "Collapse cards" : "Expand cards"}
            aria-expanded={isCardsExpanded}
          >
            {isCardsExpanded ? <UpArrow /> : <Down />}
          </button>
        </div>

        {/* Place Cards */}
        <div
          data-public-guide-map-card-rail
          className="p-2 flex gap-4 overflow-x-auto"
          aria-hidden={!isCardsExpanded}
          {...(!isCardsExpanded ? { inert: '' } : {})}
          style={{ scrollbarWidth: "none", visibility: isCardsExpanded ? 'visible' : 'hidden' }}
        >
          {filteredPlaces.map((placeWithCoords) => {
            const placeImage = getPlaceImage(placeWithCoords.place);

            return (
              <Card
                key={placeWithCoords.sequence}
                cardType="map"
                title={placeWithCoords.place.name || placeWithCoords.place.formatted_address || "Place"}
                image={placeImage}
                rating={placeWithCoords.place.rating}
                reviews={placeWithCoords.place.user_ratings_total}
                onClickhandler={() => {
                  // Only center map on clicked place, do not open modal for cards in map view
                  handleCardClick(placeWithCoords);
                  setActiveMarker(placeWithCoords.place.place_id || placeWithCoords.sequence.toString());
                  if (onPlaceClick) {
                    onPlaceClick(placeWithCoords.place);
                  }
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Fullscreen Toggle Button */}
      {!isFullscreen && (
        <button
          onClick={() => setIsFullscreen(true)}
          className={`absolute right-4 z-50 inline-flex min-h-11 min-w-11 items-center justify-center bg-[var(--category-panel,rgba(0,0,0,0.7))] hover:bg-[var(--category-hover,rgba(0,0,0,0.9))] backdrop-blur-sm text-[var(--category-text,#FFFFFF)] p-2 rounded-lg shadow-lg transition-all duration-200 ${categoryStyles ? "focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-[var(--category-focus)] focus-visible:!transform-none" : ""}`}
          style={{ top: "calc(var(--public-header-reserved-offset, 0px) + 1rem)" }}
          aria-label="Expand map"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      )}

      {/* List View Button - Positioned like recommendations page */}
      <div
        className="fixed z-50 flex"
        style={{
          left: 'calc(var(--public-safe-left, env(safe-area-inset-left, 0px)) + 1rem)',
          bottom: 'calc(var(--public-nav-reserved-bottom) + .5rem)',
        }}
      >
        <Button
          startIcon={<WhiteMap />}
          btnText="List View"
          variant="primary"
          size="xsmall"
          onClickHandler={onCloseMap}
          className="min-h-11 bg-[var(--category-accent,hsl(var(--blue-cta)))] hover:bg-[var(--category-accent,hsl(var(--blue-final)))]"
        />
      </div>
    </div>
  );

  return (
    <>
      {/* Normal view container - always rendered but hidden when fullscreen */}
      {/* Mobile: no fixed height (map uses 100vh), Desktop: fixed height */}
      <div
        id="guide-map-container"
        className={`relative w-full md:h-[700px] transition-all duration-300 ${isFullscreen ? 'opacity-0 pointer-events-none fixed -z-10' : 'opacity-100'
          }`}
      >
        {MapContent}
      </div>

      {/* Fullscreen overlay - render same map content via portal when fullscreen */}
      {/* Using same mapId ensures Google Maps reuses the instance, preventing blinking */}
      {isFullscreen && typeof document !== "undefined" && createPortal(
        <motion.div
          data-public-guide-map-portal
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={categoryStyles ? "public-guide-map-portal fixed inset-0 bg-[var(--category-page)]" : "public-guide-map-portal fixed inset-0 bg-black"}
          style={{ ...categoryStyles, width: '100vw', height: '100vh' }}
        >
          {MapContent}
        </motion.div>,
        document.body
      )}
      {selectedGooglePlace.visible && selectedGooglePlace.place && (
        <>
          <div className="fixed inset-0 bg-black md:bg-opacity-40 md:backdrop-blur-md z-[60]"></div>
          <div
            className={`fixed md:max-w-4xl md:mx-auto inset-x-0 bottom-0 top-0 z-[60] transition-transform duration-300 ease-in-out overflow-x-hidden ${selectedGooglePlace.visible ? "translate-y-0" : "translate-y-full"
              }`}
          >
            <GooglePlaceModal
              place={selectedGooglePlace.place}
              isOpen={selectedGooglePlace.visible}
              onClose={() => setSelectedGooglePlace({ visible: false, place: null })}
              sections={sections}
            />
          </div>
        </>
      )}
    </>
  );
});

GuideMapView.displayName = "GuideMapView";

export default withGoogleMapsProvider(GuideMapView);
