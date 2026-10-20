export type LatLng = { lat: number; lng: number };
export type SubmittedCoords = { lat: number | null; lng: number | null };

/**
 * The coordinates a place is saved with. Only a point a provider or the user supplied is
 * ever stored; with none, the place is saved without coordinates (and renders without a
 * map pin) rather than at an invented default.
 */
export function submittedCoordinates(input: {
  isPlace: boolean;
  isEdit: boolean;
  hasProviderPlace: boolean;
  userEdited: boolean;
  initial: { lat?: unknown; lng?: unknown };
  chosen: LatLng | null;
}): SubmittedCoords {
  if (!input.isPlace) return { lat: null, lng: null };
  if (input.isEdit && !input.hasProviderPlace && !input.userEdited) {
    const lat = Number(input.initial.lat), lng = Number(input.initial.lng);
    const stored = input.initial.lat != null && input.initial.lng != null && Number.isFinite(lat) && Number.isFinite(lng);
    return stored ? { lat, lng } : { lat: null, lng: null };
  }
  return input.chosen ?? { lat: null, lng: null };
}
