import { useCallback, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { browserPlacesProvider } from "../../../lib/browserPlacesProvider";
import type { ItemSearchResult } from "../../shared/addItem";
import type { Places } from "../../Profile/types/types";

/**
 * Place search by name (scope ADD-06), moved out of the old AddPlaceOverlay. In the browser it
 * is the Google SDK's autocomplete; under the owned-http provider (e2e) it is that transport.
 * Must render under GoogleMapsProvider.
 */
export function usePlaceNameSearch() {
  const places = useMapsLibrary("places");
  const session = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const search = useCallback(async (query: string, signal: AbortSignal): Promise<ItemSearchResult[]> => {
    if (browserPlacesProvider.kind === "owned-http") {
      return (await browserPlacesProvider.search(query, signal)).map((hit) => ({ id: hit.id, title: hit.label }));
    }
    if (!places) return [];
    session.current ??= new places.AutocompleteSessionToken();
    const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: query, sessionToken: session.current });
    return suggestions.flatMap((s) => s.placePrediction ? [{
      id: s.placePrediction.placeId,
      title: s.placePrediction.mainText?.text ?? s.placePrediction.text.text,
      subtitle: s.placePrediction.secondaryText?.text,
    }] : []);
  }, [places]);

  /** The chosen place in the legacy `Places` shape the WP5 save path reads. */
  const select = useCallback(async (id: string): Promise<Places> => {
    if (browserPlacesProvider.kind === "owned-http" || !places) return browserPlacesProvider.selection(id);
    const place = new places.Place({ id });
    await place.fetchFields({ fields: ["id", "displayName", "formattedAddress", "location", "types", "rating", "primaryType"] });
    session.current = null;
    const lat = place.location?.lat() ?? 0, lng = place.location?.lng() ?? 0;
    return {
      place_id: place.id,
      name: place.displayName ?? "",
      formatted_address: place.formattedAddress ?? undefined,
      types: place.types ?? [],
      rating: place.rating ?? undefined,
      primaryType: place.primaryType ?? undefined,
      address_components: [],
      geometry: place.location ? { location: { lat: () => lat, lng: () => lng } } : undefined,
    };
  }, [places]);

  return { search, select };
}
