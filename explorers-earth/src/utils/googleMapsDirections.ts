export type MapCoordinates = {
  lat: number;
  lng: number;
};

function hasFiniteCoordinates(value: MapCoordinates | undefined): value is MapCoordinates {
  return Boolean(value && Number.isFinite(value.lat) && Number.isFinite(value.lng));
}

export function buildGoogleMapsDirectionsUrl(
  destination: MapCoordinates | undefined,
  origin?: MapCoordinates,
): string | null {
  if (!hasFiniteCoordinates(destination)) return null;

  const query = new URLSearchParams();
  query.set("api", "1");
  query.set("destination", `${destination.lat},${destination.lng}`);
  query.set("travelmode", "driving");
  if (hasFiniteCoordinates(origin)) {
    query.set("origin", `${origin.lat},${origin.lng}`);
  }

  return `https://www.google.com/maps/dir/?${query.toString()}`;
}
