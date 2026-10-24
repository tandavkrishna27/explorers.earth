import { createNearbyCache, type ItemSearchResult, type LatLng } from "../../shared/addItem";
import useAuthStore from "../../../store/store";
import { ExplorersApiError, handleExpiredSession } from "../../../lib/explorersApiClient";

export type NearbySource = "google" | "osm" | "none";
export type NearbyPlace = { id: string; title: string; subtitle: string | null; lat: number; lng: number };
export type NearbyAnswer = { source: NearbySource; places: NearbyPlace[] };

const isPlace = (value: unknown): value is NearbyPlace => {
  const v = value as NearbyPlace;
  return !!v && typeof v.id === "string" && typeof v.title === "string" && (v.subtitle === null || typeof v.subtitle === "string")
    && Number.isFinite(v.lat) && Number.isFinite(v.lng);
};

/** GET /api/explorers/v1/places/nearby (scope ADD-08). The server picks Google or the OSM fallback. */
export async function fetchPlacesNearby(at: LatLng, signal?: AbortSignal): Promise<NearbyAnswer> {
  const query = new URLSearchParams({ lat: String(at.lat), lng: String(at.lng) });
  const generation = useAuthStore.getState().generation;
  const response = await fetch(`/api/explorers/v1/places/nearby?${query}`, { credentials: "include", cache: "no-store", signal });
  handleExpiredSession(response, generation);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ExplorersApiError(response.status, body?.error?.code ?? "UNAVAILABLE", body?.error?.message ?? "Nearby places could not be loaded");
  const source: NearbySource = body?.source === "google" || body?.source === "osm" ? body.source : "none";
  const places = Array.isArray(body?.places) ? body.places.filter(isPlace) : [];
  return { source, places };
}

/** An `osm:` id is a fallback row: never sent to Google, used like a pin with a prefilled name. */
export const isOsmPlaceId = (id: string) => id.startsWith("osm:");

/**
 * The nearby lookup wrapped in the shared per-cell cache, remembering each row's point and
 * the source of the latest answer so the page can show the OpenStreetMap note.
 */
export function createPlacesNearby(onSource: (source: NearbySource) => void, lookup = fetchPlacesNearby) {
  const points = new Map<string, NearbyPlace>();
  const cache = createNearbyCache(async (cell): Promise<ItemSearchResult[]> => {
    const answer = await lookup(cell);
    onSource(answer.source);
    return answer.places.map((place) => {
      points.set(place.id, place);
      return { id: place.id, title: place.title, subtitle: place.subtitle ?? undefined };
    });
  });
  return { cache, place: (id: string) => points.get(id) };
}
