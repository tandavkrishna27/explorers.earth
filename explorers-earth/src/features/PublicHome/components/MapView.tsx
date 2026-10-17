import { AdvancedMarker, Map, MapCameraChangedEvent, Pin, useApiIsLoaded, useMap } from "@vis.gl/react-google-maps";
import { withGoogleMapsProvider } from "../../../components/GoogleMapsProvider";
import { memo, useState, useCallback, useEffect, useRef } from "react";
import Button from "../../../components/ui/Button";
import WhiteMap from "../../../assets/icons/WhiteMap";
import UpArrow from "../../../assets/icons/UpArrow";
import Down from "../../../assets/icons/Down";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import Card from "../../../components/ui/Card";
import SEO from "../../../components/SEO";
import { createMapGEOData } from "../../../utils/geoHelpers";
import { createCanonicalUrl } from "../../../utils/getCurrentDomain";
import { Maximize2, Minimize2 } from "lucide-react";
import { isNonNullObject, PublicRouteLoadingState, PublicRoutePartialNotice, settlePublicRouteRetries } from "./PublicRouteContentState";
import { usePublicRecommendationCategory } from "../api/usePublicRecommendationCategory";
// import Logo from "../../../assets/icons/Logo";

type List = {
  List_Name: string;
  recommended_places: {
    Place_Details: {
      Place_Address: string;
      Place_Id: string;
      Place_Name: string;
      Geometry: {
        lat: number;
        lng: number;
      };
      Rating: number;
      Rating_Count: number;
      Title: string;
    };
    recommendation_category: { Category_Name: string };
    documentId: string;
    Media: {
      url: string;
    }[];
  }[];
};

type MapPlace = List["recommended_places"][number];

const isRenderableMapPlace = (value: unknown): value is MapPlace => {
  if (!isNonNullObject(value) || !isNonNullObject(value.Place_Details)) return false;
  const geometry = value.Place_Details.Geometry;
  return isNonNullObject(geometry)
    && Number.isFinite(geometry.lat)
    && Number.isFinite(geometry.lng)
    && Array.isArray(value.Media)
    && typeof value.documentId === "string";
};

const isRenderableMapList = (value: unknown): value is List =>
  isNonNullObject(value)
  && typeof value.List_Name === "string"
  && Array.isArray(value.recommended_places);

type Geometry = {
  lat: number;
  lng: number;
};

// Utility function to calculate bounds and appropriate zoom level
const calculateBoundsAndZoom = (coordinates: Geometry[]): { center: Geometry; zoom: number } => {
  if (coordinates.length === 0) {
    return { center: { lat: 20.5937, lng: 78.9629 }, zoom: 13 };
  }

  if (coordinates.length === 1) {
    return { center: coordinates[0], zoom: 15 };
  }

  const lats = coordinates.map(coord => coord.lat);
  const lngs = coordinates.map(coord => coord.lng);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const center = {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
  };

  // Calculate appropriate zoom level based on the spread of coordinates
  const latDiff = maxLat - minLat;
  const lngDiff = maxLng - minLng;
  const maxDiff = Math.max(latDiff, lngDiff);

  // Improved zoom level calculation for better handling of large spreads
  let zoom = 13; // Default zoom
  if (maxDiff > 50) zoom = 4;      // Very large spread (country level)
  else if (maxDiff > 20) zoom = 5; // Large spread (state level)
  else if (maxDiff > 10) zoom = 6; // Medium-large spread
  else if (maxDiff > 5) zoom = 7;  // Medium spread
  else if (maxDiff > 2) zoom = 8;  // Medium-small spread
  else if (maxDiff > 1) zoom = 9;  // Small-medium spread
  else if (maxDiff > 0.5) zoom = 10; // Small spread
  else if (maxDiff > 0.2) zoom = 11; // Very small spread
  else if (maxDiff > 0.1) zoom = 12; // Tiny spread
  else if (maxDiff > 0.05) zoom = 13; // Micro spread
  else if (maxDiff > 0.01) zoom = 14; // Very micro spread
  else zoom = 15; // Single point or very close points

  return { center, zoom };
};

// Smooth map animation component with enhanced long-distance handling
const SmoothMapController = ({ targetCoords, targetZoom }: { targetCoords: Geometry; targetZoom: number }) => {
  const map = useMap();

  useEffect(() => {
    if (map && targetCoords) {

      // Check if target coordinates are different from current coordinates
      const currentCenter = map.getCenter();
      const currentZoom = map.getZoom();

      if (currentCenter &&
        Math.abs(currentCenter.lat() - targetCoords.lat) < 0.0001 &&
        Math.abs(currentCenter.lng() - targetCoords.lng) < 0.0001 &&
        currentZoom === targetZoom) {
        return; // Skip if already at target
      }

      // Add small delay to ensure map is fully loaded before animating
      const timeoutId = setTimeout(() => {
        const currentCenter = map.getCenter();
        const currentZoom = map.getZoom();

        if (!currentCenter) {
          // Fallback: just pan to target if we can't get current center
          map.panTo(targetCoords);
          if (targetZoom !== map.getZoom()) {
            map.setZoom(targetZoom);
          }
          return;
        }

        // Calculate distance using simple lat/lng difference (approximate)
        const latDiff = Math.abs(currentCenter.lat() - targetCoords.lat);
        const lngDiff = Math.abs(currentCenter.lng() - targetCoords.lng);
        const maxDiff = Math.max(latDiff, lngDiff);

        // Enhanced long-distance animation based on coordinate difference
        if (maxDiff > 5) { // Very long distance (roughly >500km)
          // Calculate intermediate zoom level based on distance
          let intermediateZoom = 4;
          if (maxDiff > 20) intermediateZoom = 3; // Very long
          else if (maxDiff > 10) intermediateZoom = 4; // Long
          else if (maxDiff > 7) intermediateZoom = 5; // Medium-long
          else intermediateZoom = 6; // Medium

          // Step 1: Smoothly zoom out to intermediate level
          map.setZoom(intermediateZoom);

          // Step 2: Wait for zoom out, then pan to target
          setTimeout(() => {
            map.panTo(targetCoords);
          }, 400);

          // Step 3: Wait for pan, then zoom to target level
          setTimeout(() => {
            if (targetZoom !== intermediateZoom) {
              map.setZoom(targetZoom);
            }
          }, 900);

        } else if (maxDiff > 0.5) { // Medium distance
          // For medium distances, use a gentler approach
          const intermediateZoom = Math.min(currentZoom || 13, 8);

          if (currentZoom && currentZoom > intermediateZoom) {
            map.setZoom(intermediateZoom);
            setTimeout(() => {
              map.panTo(targetCoords);
            }, 250);
            setTimeout(() => {
              if (targetZoom !== intermediateZoom) {
                map.setZoom(targetZoom);
              }
            }, 600);
          } else {
            // Direct pan if already at low zoom
            map.panTo(targetCoords);
            setTimeout(() => {
              if (targetZoom !== currentZoom) {
                map.setZoom(targetZoom);
              }
            }, 300);
          }

        } else {
          // For short distances, use regular smooth pan and zoom
          map.panTo(targetCoords);
          if (targetZoom !== currentZoom) {
            // Slight delay for zoom to make it smoother
            setTimeout(() => {
              map.setZoom(targetZoom);
            }, 200);
          }
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [map, targetCoords, targetZoom]);

  return null;
};

const MapView = memo(() => {
  const mapsApiLoaded = useApiIsLoaded();
  const [currentCoords, setCurrentCoords] = useState<Geometry>({
    lat: 20.5937,
    lng: 78.9629,
  });
  const [currentZoom, setCurrentZoom] = useState<number>(13);
  const [targetCoords, setTargetCoords] = useState<Geometry>({
    lat: 20.5937,
    lng: 78.9629,
  });
  const [targetZoom, setTargetZoom] = useState<number>(13);
  const [activeMarker, setActiveMarker] = useState<Geometry | null>(null);
  // local state for handle categories
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  // local state for handle regions
  const [selectedRegion, setSelectedRegion] = useState<string>("");
  // local state for collapsible wrapper
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  // ref to track if initial region has been set from URL
  const initialRegionSet = useRef<boolean>(false);
  // ref to track if we're currently setting region from URL to prevent URL updates
  const isSettingFromUrl = useRef<boolean>(false);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((err) => {
          console.error("Error attempting to exit fullscreen:", err);
        });
      }
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Smooth map transition function
  const smoothTransitionTo = useCallback((coords: Geometry, zoom: number) => {
    setTargetCoords(coords);
    setTargetZoom(zoom);
  }, []);

  const handleCameraChanged = (event: MapCameraChangedEvent) => {
    const { detail } = event;
    setCurrentCoords(detail.center);
    setCurrentZoom(detail.zoom);
  };

  // Initialize target coordinates to match initial coordinates
  useEffect(() => {
    // Only set initial targets if they haven't been set yet
    if (targetCoords.lat === 20.5937 && targetCoords.lng === 78.9629) {
      setTargetCoords(currentCoords);
      setTargetZoom(currentZoom);

    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCoords, currentZoom]); // Run when coordinates change

  const { username } = useParams();
  const { placeSlug } = useParams();
  const { data, loading, error, refetch } = usePublicRecommendationCategory(username, "places", Boolean(username));
  const rawRecommendationLists = data?.recommendationLists;
  const recommendationLists: List[] = (Array.isArray(rawRecommendationLists) ? rawRecommendationLists : [])
    .filter(isRenderableMapList)
    .map((list) => ({
      ...list,
      recommended_places: list.recommended_places.filter(isRenderableMapPlace),
    }));
  const completeCollection = Array.isArray(rawRecommendationLists)
    && rawRecommendationLists.every((list) => (
      isRenderableMapList(list) && list.recommended_places.every(isRenderableMapPlace)
    ));
  const hasUsableData = error
    ? recommendationLists.some((list) => list.recommended_places.length > 0)
    : completeCollection;
  const navigate = useNavigate();
  const outlet = useOutletContext<{ setIsPageLoaded?: (loaded: boolean) => void } | null>();

  useEffect(() => {
    if (!loading || hasUsableData) outlet?.setIsPageLoaded?.(true);
  }, [hasUsableData, loading, outlet?.setIsPageLoaded]);

  // Get available regions from recommendation lists with fallback
  const regions: string[] = Array.from(
    new Set(
      recommendationLists
        .map((list: List) => list?.List_Name)
        .filter((name: string | undefined): name is string => Boolean(name && name.trim()))
    )
  );

  // Create place data with region information
  const placeDataWithRegion = recommendationLists.flatMap(
    (list: List) =>
      list?.recommended_places?.map((place) => ({
        ...place.Place_Details,
        Media: place.Media,
        category: place.recommendation_category?.Category_Name,
        region: list.List_Name || 'Unknown Region',
        documentId: place.documentId,
      })) || []
  );

  // Helper function to convert region name to URL slug
  const toUrlSlug = (str: string) => {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  };

  // Helper function to find region by URL slug
  const findRegionBySlug = (slug: string) => {
    return regions.find(region => toUrlSlug(region) === slug);
  };

  // Set initial region based on URL parameter
  useEffect(() => {
    if (placeSlug && regions.length > 0 && !initialRegionSet.current) {
      const regionFromSlug = findRegionBySlug(placeSlug);
      if (regionFromSlug) {
        isSettingFromUrl.current = true;
        setSelectedRegion(regionFromSlug);
        initialRegionSet.current = true;

        // Get places for the selected region and center the map
        const regionPlaces = placeDataWithRegion.filter(
          (place: { region: string }) => place?.region === regionFromSlug
        );

        const regionCoordinates = regionPlaces
          .map((place: any) => place.Geometry)
          .filter((geometry: any) => geometry !== undefined);

        if (regionCoordinates.length > 0) {
          const { center, zoom } = calculateBoundsAndZoom(regionCoordinates);
          smoothTransitionTo(center, zoom);
          setActiveMarker(null);
        }

        // Reset the flag after a short delay to allow state updates to complete
        setTimeout(() => {
          isSettingFromUrl.current = false;
        }, 100);
      }
    }
  }, [placeSlug, regions, placeDataWithRegion, smoothTransitionTo]);

  // Handle initial "All Regions" view when no placeSlug is provided
  useEffect(() => {
    if (!placeSlug && regions.length > 0 && placeDataWithRegion.length > 0 && !initialRegionSet.current) {
      // No specific region selected, show all regions
      setSelectedRegion("");
      initialRegionSet.current = true;

      // Get all coordinates and fit them in the viewport
      const allCoordinates = placeDataWithRegion
        .map((place: any) => place.Geometry)
        .filter((geometry: any) => geometry !== undefined);

      if (allCoordinates.length > 0) {
        const { center, zoom } = calculateBoundsAndZoom(allCoordinates);
        smoothTransitionTo(center, zoom);
        setActiveMarker(null);
      }
    }
  }, [placeSlug, regions, placeDataWithRegion, smoothTransitionTo]);

  // Filter places by selected region first
  const regionFilteredPlaces = selectedRegion
    ? placeDataWithRegion.filter(
      (place: { region: string }) => place?.region === selectedRegion
    )
    : placeDataWithRegion;

  // Then filter by selected category
  const filteredPlaces = selectedCategory
    ? regionFilteredPlaces.filter(
      (place: { category: string }) => place?.category === selectedCategory
    )
    : regionFilteredPlaces;

  // Get coordinates for filtered places only
  const latLngArray = filteredPlaces
    .map((place: any) => place.Geometry)
    .filter((geometry: any) => geometry !== undefined);

  const handleCardClick = (geometry: Geometry) => {
    smoothTransitionTo(geometry, 15); // Smooth zoom in when clicking on a specific place
    setActiveMarker(geometry);
  };

  // Handle region selection with map repositioning
  const handleRegionSelection = useCallback((region: string) => {
    setSelectedRegion(region);
    setSelectedCategory(""); // Reset category when region changes

    // Update URL to reflect the selected region (only if not setting from URL)
    if (!isSettingFromUrl.current) {
      if (region) {
        // If a specific region is selected, navigate to that region's map view
        const regionSlug = toUrlSlug(region);
        navigate(`/${username}/places/${regionSlug}/map`, { replace: true });
      } else {
        // If "All Regions" is selected, navigate to the general map view
        navigate(`/${username}/places/map`, { replace: true });
      }
    }

    // Get places for the selected region
    const regionPlaces = region
      ? placeDataWithRegion.filter((place: { region: string }) => place?.region === region)
      : placeDataWithRegion;

    const regionCoordinates = regionPlaces
      .map((place: any) => place.Geometry)
      .filter((geometry: any) => geometry !== undefined);

    if (regionCoordinates.length > 0) {
      const { center, zoom } = calculateBoundsAndZoom(regionCoordinates);
      smoothTransitionTo(center, zoom);
      setActiveMarker(null); // Clear active marker when switching regions
    }
  }, [placeDataWithRegion, navigate, username, toUrlSlug, smoothTransitionTo]);

  // Handle category selection (existing behavior)
  const handleCategorySelection = useCallback((category: string) => {
    setSelectedCategory(category);

    // If a category is selected, center on the filtered places
    if (category) {
      const categoryPlaces = regionFilteredPlaces.filter(
        (place: { category: string }) => place?.category === category
      );

      const categoryCoordinates = categoryPlaces
        .map((place: any) => place.Geometry)
        .filter((geometry: any) => geometry !== undefined);

      if (categoryCoordinates.length > 0) {
        const { center, zoom } = calculateBoundsAndZoom(categoryCoordinates);
        smoothTransitionTo(center, zoom);
        setActiveMarker(null);
      }
    }
  }, [regionFilteredPlaces, smoothTransitionTo]);

  // fetching categories for the filtered places
  const categories: string[] = Array.from(
    new Set(regionFilteredPlaces?.map((place: { category: string }) => place?.category))
  ).filter((category): category is string => Boolean(category));


  // Comprehensive dynamic SEO data extraction for map views
  const profileName = username || "User";
  const totalLocationsCount = regions.length;
  const totalPlacesCount = placeDataWithRegion.length;
  const profileUsername = username || "";

  // Extract location names and place names for meta descriptions
  const allLocationNames = regions.slice(0, 5); // Limit to first 5 for SEO
  const allPlaceNames = placeDataWithRegion.slice(0, 8).map((place: any) => place.Title || place.Place_Name).filter(Boolean);

  // Determine if this is All Regions Map or Location-specific Map
  const isAllRegionsMap = !placeSlug;
  const currentLocationName = placeSlug ? findRegionBySlug(placeSlug) || placeSlug : "";

  // Find the specific location data for location-specific map
  const currentLocationData = currentLocationName ?
    recommendationLists.find(
      (list: List) => list.List_Name === currentLocationName
    ) : null;

  const currentLocationNote = currentLocationData ?
    (currentLocationData as any).Note ||
    (currentLocationData as any).description ||
    (currentLocationData as any).List_Note ||
    "" : "";

  const currentLocationPlacesCount = currentLocationData?.recommended_places?.length || 0;
  const currentLocationPlaces = currentLocationData?.recommended_places?.slice(0, 5).map(
    (place: any) => place.Place_Details?.Title || place.Place_Details?.Place_Name
  ).filter(Boolean) || [];



  // SEO Configuration for All Regions Map vs Location Map
  const seoConfig = isAllRegionsMap ? {
    // ALL REGIONS MAP SEO
    title: `${profileName} | Explore All Regions Map | explorers`,
    description: `Explore ${profileName}'s interactive all regions map on explorers, featuring over ${totalLocationsCount} locations and ${totalPlacesCount} curated places like ${allPlaceNames.slice(0, 5).join(', ')}. Discover personalized local recommendations across multiple regions.`,
    keywords: [
      'interactive all regions map',
      'multi-region local guide',
      'complete location map',
      ...allLocationNames.slice(0, 10),
      ...allPlaceNames.slice(0, 5),
      `${profileName} recommendations`,
      'explorers map',
      'curated local spots',
      'explore places map',
      'map view',
      'all locations',
      `${profileName} guide`,
      `${profileUsername} map`,
      ...allLocationNames,
      ...allPlaceNames.slice(0, 5),
      'interactive map',
      'local recommendations',
      'places map',
      'location guide',
      'travel map',
      `${profileName} recommendations`,
      'local spots map',
      'curated locations'
    ],
    canonical: createCanonicalUrl(`/${username}/places/map`),
    type: "website" as const
  } : {
    // LOCATION/LIST MAP SEO  
    title: `${profileName} | Explore ${currentLocationName} Map | explorers`,
    description: `Explore ${currentLocationName} with ${profileName}'s interactive map on explorers. Discover ${currentLocationPlacesCount} recommended places and local favorites. ${currentLocationNote ? currentLocationNote.substring(0, 100) + '...' : ''} View all curated places now.`,
    keywords: [
      `${currentLocationName}`,
      'interactive map',
      'local travelguide',
      `${profileUsername}`,
      `${profileName} ${currentLocationName}`,
      `${currentLocationName} recommendations`,
      `${currentLocationName} map`,
      `${currentLocationName} places to visit`,
      'location map',
      'travel guide',
      'places to visit',
      ...currentLocationPlaces.slice(0, 10),
      'featured places',
      'explore local spots',
      'explorers map'
    ],
    canonical: createCanonicalUrl(`/${username}/places/${placeSlug}/map`),
    type: "website" as const
  };

  // Generate GEO data for enhanced structured data
  const geoData = createMapGEOData({
    isAllLocations: isAllRegionsMap,
    locationName: currentLocationName,
    recommenderName: profileName,
    totalPlaces: isAllRegionsMap ? totalPlacesCount : currentLocationPlacesCount,
    categories: Array.from(new Set(allLocationNames)).slice(0, 5)
  });



  if (loading && !hasUsableData)
    return <PublicRouteLoadingState label="Map loading" />;

  if (error && !hasUsableData)
    return (
      <div className="flex bg-[var(--category-page,#000000)] items-center justify-center min-h-screen">
        <div className="text-[var(--category-text,#FFFFFF)] text-center">
          <h2 className="text-xl font-semibold mb-2">Failed to Load Map</h2>
          <p className="text-[var(--category-muted,#9CA3AF)] mb-4">Could not connect to the data service.</p>
          <button
            onClick={() => void settlePublicRouteRetries(refetch)}
            className="min-h-11 px-4 py-2 bg-[var(--category-panel,rgba(255,255,255,0.1))] hover:bg-[var(--category-hover,rgba(255,255,255,0.2))] rounded-md text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Retry
          </button>
        </div>
      </div>
    );

  if (!mapsApiLoaded)
    return (
      <div className="flex bg-[var(--category-page,#000000)] items-center justify-center min-h-screen" aria-busy={loading || undefined}>
        <div className="text-[var(--category-text,#FFFFFF)] text-center px-6">
          {Boolean(error) && hasUsableData && <PublicRoutePartialNotice message="Some map data is unavailable." />}
          <h2 className="text-xl font-semibold mb-2">Map Unavailable</h2>
          <p className="text-[var(--category-muted,#9CA3AF)]">Use the list view while the map service is unavailable.</p>
        </div>
      </div>
    );

  // Check if we have valid data
  if (!Array.isArray(rawRecommendationLists)) {
    return (
      <div className="flex bg-[var(--category-page,#000000)] items-center justify-center min-h-screen">
        <div className="text-[var(--category-text,#FFFFFF)] text-center">
          <h2 className="text-xl font-semibold mb-2">No Data Available</h2>
          <p className="text-[var(--category-muted,#9CA3AF)]">No recommendation lists found for this user.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEO
        title={seoConfig.title}
        description={seoConfig.description}
        keywords={seoConfig.keywords}
        canonical={seoConfig.canonical}
        url={seoConfig.canonical}
        type={seoConfig.type}
        author={profileName}
        siteName="explorers"
        enableGEO={true}
        geoData={geoData}
      />

      <div className="relative">
        {Boolean(error) && hasUsableData && (
          <div className="absolute left-4 right-4 top-4 z-[60]">
            <PublicRoutePartialNotice message="Some map data is unavailable." />
          </div>
        )}
        <Map
          defaultCenter={currentCoords ?? latLngArray[0]}
          center={currentCoords}
          zoom={currentZoom}
          onCameraChanged={handleCameraChanged}
          mapId={"mapView"}
          style={{ height: "100vh", width: "100%" }}
          scrollwheel={true}
          gestureHandling={"greedy"}
          fullscreenControl={false}
        >
          <SmoothMapController targetCoords={targetCoords} targetZoom={targetZoom} />
          {latLngArray.map(
            (coords: { lat: number; lng: number }, index: number) => (
              <AdvancedMarker key={index} position={coords}>
                <Pin
                  background={
                    activeMarker?.lat === coords.lat &&
                      activeMarker?.lng === coords.lng
                      ? "purple"
                      : "red"
                  }
                  borderColor={
                    activeMarker?.lat === coords.lat &&
                      activeMarker?.lng === coords.lng
                      ? "3px solid purple"
                      : "red"
                  }
                  glyphColor={"white"}
                />
              </AdvancedMarker>
            )
          )}
        </Map>

        {/* List View Button - Moved to Top Right */}
        <div className="absolute top-3 right-3 z-50">
          <Button
            startIcon={<WhiteMap />}
            btnText="List View"
            variant="primary"
            size="xsmall"
            onClickHandler={() => {
              if (selectedRegion) {
                // If a specific region is selected, navigate to that region's list view
                const regionSlug = toUrlSlug(selectedRegion);
                navigate(`/${username}/places/${regionSlug}`);
              } else {
                // If "All Regions" is selected, navigate to the general places view
                navigate(`/${username}/places`);
              }
            }}
            className="bg-[var(--category-accent,hsl(var(--blue-cta)))] hover:bg-[var(--category-accent,hsl(var(--blue-final)))]"
          />
        </div>

        {/* Region Filter - Moved to top */}
        <div
          className="absolute  top-12 left-0 right-0 z-40 flex flex-row gap-2 items-center flex-nowrap whitespace-nowrap py-3 pl-2 pr-14 overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
        >
          {regions && regions.length > 0 ? (
            <div className="flex gap-3">
              <Button
                btnText={"All Regions"}
                type="button"
                variant={selectedRegion === "" ? "tagSelected" : "tag"}
                onClickHandler={() => {
                  handleRegionSelection("");
                }}
                size="xsmall"
              />
              {regions?.map((region: string, index: number) => (
                <Button
                  key={`${region}-${index}`}
                  btnText={region}
                  type="button"
                  variant={selectedRegion === region ? "tagSelected" : "tag"}
                  onClickHandler={() => {
                    handleRegionSelection(region);
                  }}
                  size="xsmall"
                />
              ))}
            </div>
          ) : (
            <div className="flex">
              <span className="text-[var(--category-text,#FFFFFF)] text-sm">Loading regions...</span>
            </div>
          )}
        </div>

        {/* Fullscreen Button (Four Corners Button - Top Right of Second Row) */}
        <button
          onClick={toggleFullscreen}
          className="absolute top-14 right-3 z-50 bg-[var(--category-panel,#FFFFFF)] hover:bg-[var(--category-hover,#F3F4F6)] text-[var(--category-muted,#374151)] p-2.5 rounded-lg shadow-md transition-all duration-200 cursor-pointer flex items-center justify-center border border-[var(--category-control-border,#E5E7EB)]"
          aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4 text-[var(--category-muted,#374151)]" />
          ) : (
            <Maximize2 className="w-4 h-4 text-[var(--category-muted,#374151)]" />
          )}
        </button>

        {/* Collapsible Wrapper for Category Filter and Place Cards */}
        <div
          className="bg-[var(--category-panel,rgba(13,17,23,0.9))] border-t border-[var(--category-control-border,rgba(255,255,255,0.1))] backdrop-blur-md py-4 absolute bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out rounded-t-2xl shadow-2xl"
          style={{
            transform: isCollapsed ? "translateY(calc(100% - 68px))" : "translateY(0)"
          }}
        >
          {/* Toggle Button / Drag Handle */}
          <div className="flex justify-center mb-2">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="bg-[var(--category-panel,#1F2937)] hover:bg-[var(--category-hover,#374151)] border border-[var(--category-control-border,rgba(255,255,255,0.15))] rounded-full p-2 text-[var(--category-text,#FFFFFF)] transition-colors duration-200 cursor-pointer flex items-center justify-center"
              aria-label={isCollapsed ? "Expand filters and cards" : "Collapse filters and cards"}
            >
              {isCollapsed ? <UpArrow /> : <Down />}
            </button>
          </div>

          {/* Category Filter */}
          <div
            className="w-full flex flex-row gap-2 items-center flex-nowrap whitespace-nowrap py-2 overflow-x-auto scrollbar-hide"
            style={{ scrollbarWidth: "none" }}
          >
            {categories && categories.length > 0 ? (
              <div className="flex px-4 gap-2">
                <Button
                  btnText={"All Categories"}
                  type="button"
                  variant={selectedCategory === "" ? "tagSelected" : "tag"}
                  onClickHandler={() => {
                    handleCategorySelection("");
                  }}
                  size="xsmall"
                />
                {categories?.map((tag: string, index: number) => (
                  <Button
                    key={`${tag}-${index}`}
                    btnText={tag}
                    type="button"
                    variant={selectedCategory === tag ? "tagSelected" : "tag"}
                    onClickHandler={() => {
                      handleCategorySelection(tag);
                    }}
                    size="xsmall"
                  />
                ))}
              </div>
            ) : (
              <div className="flex px-4">
                <span className="text-[var(--category-muted,rgba(255,255,255,0.4))] text-xs font-poppins">No categories available</span>
              </div>
            )}
          </div>

          {/* Place Cards */}
          <div
            className="p-4 flex gap-4 overflow-x-auto scrollbar-hide"
            style={{ scrollbarWidth: "none" }}
          >
            {filteredPlaces.map(
              (place, index: number) => (
                <div key={index} className="w-[135px] md:w-[155px] flex-shrink-0">
                  <Card
                    title={place?.Title}
                    image={place?.Media?.[0]?.url}
                    rating={place?.Rating}
                    reviews={place?.Rating_Count}
                    cardType={"default"}
                    recommendationType="place"
                    onClickhandler={() => handleCardClick(place?.Geometry)}
                  />
                </div>
              )
            )}
          </div>
        </div>

        {/* <div className="absolute top-0 right-1/2 mx-auto ">
        <h1
          className="p-4 mx-auto cursor-pointer z-50"
          onClick={() => navigate("/")}
        >
          <Logo variant="dark" />
        </h1>
      </div> */}
      </div>
    </>
  );
});

export default withGoogleMapsProvider(MapView);
