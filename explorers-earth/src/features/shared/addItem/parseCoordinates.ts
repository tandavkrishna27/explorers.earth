export type LatLng = { lat: number; lng: number };

const DECIMAL = String.raw`(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([NSEW])?`;
const PAIR = new RegExp(String.raw`^\s*${DECIMAL}\s*[,\s]\s*${DECIMAL}\s*$`, "i");
const MAPS_AT = /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/;

const signed = (value: string, hemisphere: string | undefined) =>
  (hemisphere ? (/[SW]/i.test(hemisphere) ? -1 : 1) * Math.abs(Number(value)) : Number(value));

// Typed or pasted coordinates (scope ADD-06). 0,0 is refused like RecommendForm.tsx does.
export function parseCoordinates(input: string): LatLng | null {
  const text = input.trim();
  const at = MAPS_AT.exec(text);
  const match = at ? [text, at[1], undefined, at[2], undefined] : PAIR.exec(text);
  if (!match) return null;
  const lat = signed(match[1]!, match[2] ?? undefined);
  const lng = signed(match[3]!, match[4] ?? undefined);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}
