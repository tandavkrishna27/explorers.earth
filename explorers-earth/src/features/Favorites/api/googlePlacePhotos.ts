import axios from "axios";
import { GOOGLE_PLACES_API_BASE_URL } from "../../../config";
import { mapsBrowserKey } from "../../../lib/publicRuntimeConfig";
import { PlacesClient } from "./placesClient";

/**
 * A place item's Google photos, imported into owned recommendation media by the API.
 *
 * The browser asks Google only for each photo's URI (skipHttpRedirect answers JSON from
 * places.googleapis.com, which CSP allows) and hands that key-free URI to the API, which
 * fetches the bytes. Fetching them here follows Google's redirect to googleusercontent.com,
 * which CSP refuses, so every place used to end with "No images found" (PLC-02).
 *
 * A photo that cannot be imported is counted, not thrown, so the others still arrive and
 * the caller can say how many were lost.
 */
export async function importGooglePlacePhotos(placeId: string, limit: number, signal?: AbortSignal):
  Promise<{ photos: { id: string; url: string }[]; failed: number }> {
  const details = await axios.get(
    `${GOOGLE_PLACES_API_BASE_URL}/${placeId}?fields=photos&key=${mapsBrowserKey()}`, { signal });
  const references: string[] = (Array.isArray(details.data?.photos) ? details.data.photos : [])
    .map((photo: { name?: string }) => String(photo?.name ?? "").split(`${placeId}/`)[1])
    .filter(Boolean)
    .slice(0, Math.max(0, limit));
  const photos: { id: string; url: string }[] = [];
  let failed = 0;
  // One at a time, as before: Google rate-limits bursts of media requests.
  for (const reference of references) {
    try {
      const photo = await axios.get(
        `${GOOGLE_PLACES_API_BASE_URL}/${placeId}/${reference}/media?maxWidthPx=800&skipHttpRedirect=true&key=${mapsBrowserKey()}`,
        { signal });
      const photoUri = photo.data?.photoUri;
      if (typeof photoUri !== "string" || !photoUri) throw new Error("Google photo has no URI");
      const media = await PlacesClient.importPlacePhoto(photoUri, "recommendation", signal);
      photos.push({ id: media.id, url: media.url });
    } catch (error) {
      if (signal?.aborted) throw error;
      console.warn("A place photo could not be imported:", error);
      failed += 1;
    }
  }
  return { photos, failed };
}
