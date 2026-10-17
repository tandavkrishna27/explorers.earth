import { AdvancedMarker, Map, MapCameraChangedEvent, Pin, useApiIsLoaded } from "@vis.gl/react-google-maps";
import { withGoogleMapsProvider } from "../../../components/GoogleMapsProvider";
import { memo, useState, useCallback, useEffect } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import Button from "../../../components/ui/Button";
import WhiteMap from "../../../assets/icons/WhiteMap";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import Card from "../../../components/ui/Card";
import { isNonNullObject, PublicRouteErrorState, PublicRouteLoadingState, PublicRoutePartialNotice } from "./PublicRouteContentState";
import { usePublicRecommendationCategory } from "../api/usePublicRecommendationCategory";

type List = {
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
  isNonNullObject(value) && Array.isArray(value.recommended_places);

type Geometry = {
  lat: number;
  lng: number;
};
const PlaceMapView = memo(() => {
  const outlet = useOutletContext<{ setIsPageLoaded?: (loaded: boolean) => void } | null>();
  const mapsApiLoaded = useApiIsLoaded();
  const [currentCoords, setCurrentCoords] = useState<Geometry | null>(null);
  const [activeMarker, setActiveMarker] = useState<Geometry | null>(null);
  // local state for handle catgeories
  const [selectedCategory, setSelectedCategory] = useState<string>("");

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

  const handleCameraChanged = (event: MapCameraChangedEvent) => {
    const { detail } = event;
    setCurrentCoords(detail.center);
  };

  const { username, place } = useParams();
  const { data, loading, error, refetch } = usePublicRecommendationCategory(username, "places", Boolean(username));
  const rawRecommendationLists = Array.isArray(data?.recommendationLists)
    ? data.recommendationLists.filter((list: any) => list?.slug === place || list?.List_Name === place)
    : [];
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

  useEffect(() => {
    if (!loading || hasUsableData) outlet?.setIsPageLoaded?.(true);
  }, [hasUsableData, loading, outlet?.setIsPageLoaded]);

  const latLngArray = recommendationLists.flatMap(
    (list: List) =>
      list?.recommended_places.map((place) => place.Place_Details.Geometry)
  ).filter((geometry: Geometry | undefined): geometry is Geometry => Boolean(
    geometry && Number.isFinite(geometry.lat) && Number.isFinite(geometry.lng),
  ));

  const handleCardClick = (geometry: Geometry) => {
    setCurrentCoords(geometry);
    setActiveMarker(geometry);
  };

  const placeData = recommendationLists.flatMap(
    (list: List) =>
      list?.recommended_places.map((place) => ({
        ...place.Place_Details,
        Media: place.Media,
        category: place.recommendation_category.Category_Name,
      }))
  );

  // fetching categories for the recommendation list
  const categories: string[] = Array.from(
    new Set(placeData?.map((place: { category: string }) => place?.category))
  );

  // Filter the recommended places by the selected category
  const filteredPlaces = selectedCategory
    ? placeData.filter(
      (place: { category: string }) => place?.category === selectedCategory
    )
    : placeData;

  if (loading && !hasUsableData)
    return <PublicRouteLoadingState label="Place map loading" />;

  if (error && !hasUsableData)
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-page, #090d16)", color: "var(--text-primary, #fff)" }}>
        <PublicRouteErrorState
          title="Place map unavailable"
          error={error}
          onRetry={refetch}
          backAction={(
            <button
              type="button"
              onClick={() => navigate(`/${username}/places/${place}`)}
              className="min-h-11 rounded-xl border px-4 py-2 font-poppins text-sm font-semibold"
              style={{ borderColor: "var(--category-control-border, var(--border-card, #ffffff1a))" }}
            >
              Back to Places
            </button>
          )}
        />
      </div>
    );

  if (!mapsApiLoaded)
    return (
      <div
        className="flex items-center justify-center min-h-screen px-6"
        aria-busy={loading || undefined}
        style={{ background: "var(--bg-page, #090d16)", color: "var(--text-primary, #fff)" }}
      >
        <div className="text-center max-w-sm">
          {Boolean(error) && hasUsableData && <PublicRoutePartialNotice message="Some map data is unavailable." />}
          <h2 className="text-xl font-semibold mb-2">Map Unavailable</h2>
          <p className="mb-5" style={{ color: "var(--category-muted, var(--text-secondary, #9ca3af))" }}>
            Your saved places are still available in the list while the map service reconnects.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/${username}/places/${place}`)}
            className="min-h-11 rounded-xl border px-4 py-2 font-poppins text-sm font-semibold"
            style={{
              background: "var(--bg-card, #111827)",
              borderColor: "var(--category-control-border, var(--border-card, #ffffff1a))",
              color: "var(--text-primary, #fff)",
            }}
          >
            Back to Places
          </button>
        </div>
      </div>
    );

  return (
    <div className="relative" aria-busy={loading || undefined}>
      {Boolean(error) && hasUsableData && (
        <div className="absolute left-4 right-4 top-4 z-[60]">
          <PublicRoutePartialNotice message="Some map data is unavailable." />
        </div>
      )}
      <Map
        defaultCenter={currentCoords ?? latLngArray[0]}
        center={currentCoords}
        defaultZoom={13}
        onCameraChanged={handleCameraChanged}
        mapId={"mapView"}
        style={{ height: "100vh", width: "100%" }}
        scrollwheel={true}
        gestureHandling={"greedy"}
        fullscreenControl={false}
      >
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
      <div className="absolute top-3 right-3 z-50">
        <Button
          startIcon={<WhiteMap />}
          btnText="List View"
          variant="primary"
          size="xsmall"
          onClickHandler={() =>
            navigate(`/${username}/places/${place}`)
          }
          className="bg-[var(--category-accent,hsl(var(--blue-cta)))] hover:bg-[var(--category-accent,hsl(var(--blue-final)))]"
        />
      </div>
      {/* Fullscreen Button (Four Corners Button - Top Right of Second Row / aligned with MapView) */}
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
      <div className="absolute bottom-[13rem] w-full  flex flex-row gap-2 items-center flex-nowrap whitespace-nowrap  py-4 overflow-x-auto " style={{ scrollbarWidth: "none" }}>
        {categories && categories.length >= 1 && (
          <div className="px-2 flex gap-3">
            <Button
              btnText={"All"}
              type="button"
              variant={selectedCategory === "" ? "tagSelected" : "tag"}
              onClickHandler={() => setSelectedCategory("")}
              size="xsmall"
            />
            {categories?.map((tag: string, index: number) => (
              <Button
                key={index}
                btnText={tag}
                type="button"
                variant={selectedCategory === tag ? "tagSelected" : "tag"}
                onClickHandler={() => setSelectedCategory(tag)}
                size="xsmall"
              />
            ))}
          </div>
        )}
      </div>
      <div
        className={` absolute bottom-2 left-0 right-0 z-50 p-2 flex gap-4 overflow-x-auto transition-transform duration-300 ease-in-out `}
        style={{ scrollbarWidth: "none" }}
      >
        {filteredPlaces.map(
          (place, index: number) => (
            <Card
              key={index}
              title={place?.Title}
              image={place?.Media?.[0]?.url}
              rating={place?.Rating}
              reviews={place?.Rating_Count}
              cardType={"map"}
              onClickhandler={() => handleCardClick(place?.Geometry)}
            />
          )
        )}
      </div>
    </div>
  );
});

export default withGoogleMapsProvider(PlaceMapView);
