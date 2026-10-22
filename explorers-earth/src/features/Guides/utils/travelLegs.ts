import type { TransportSegment, TravelMode } from "../types/guideSectionTypes";
import { calculateDistance } from "./distanceCalculator";
import { calculateTravelTime, formatTravelTime } from "./travelModeConfig";

type LegPlace = {
  id?: string;
  place_id?: string;
  geometry?: { location?: { lat?: number; lng?: number } | null } | null;
};

export type TravelLeg = { distanceKm: number; minutes: number; mode: TravelMode };

const DEFAULT_MODE: TravelMode = "drive";
// Same estimate the Edit Day form makes, memoised so re-renders of the day views and the
// public guide do not redo it. Keyed by coordinates and mode only.
const estimates = new Map<string, number>();

const ids = (place: LegPlace) => [place.id, place.place_id].filter((value): value is string => !!value);

function coordinates(place: LegPlace): { lat: number; lng: number } | null {
  const location = place.geometry?.location;
  return location && Number.isFinite(location.lat) && Number.isFinite(location.lng)
    ? { lat: location.lat as number, lng: location.lng as number }
    : null;
}

function estimateKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const key = `${from.lat},${from.lng}|${to.lat},${to.lng}`;
  let km = estimates.get(key);
  if (km === undefined) {
    km = calculateDistance(from.lat, from.lng, to.lat, to.lng);
    estimates.set(key, km);
  }
  return km;
}

/**
 * Distance and travel time from one stop to the next: the saved segment where there is one
 * (matched by the day-place id the form writes, or the Google place id), otherwise the
 * form's straight-line estimate. Null when it cannot be known, so the view shows nothing.
 */
export function travelLegBetween(from: LegPlace, to: LegPlace, segments: readonly TransportSegment[] = []): TravelLeg | null {
  const fromIds = ids(from);
  const toIds = ids(to);
  const segment = segments.find((s) => fromIds.includes(s.fromPlaceId) && toIds.includes(s.toPlaceId));
  const mode = segment?.mode || DEFAULT_MODE;
  const a = coordinates(from);
  const b = coordinates(to);
  const distanceKm = typeof segment?.distanceKm === "number" ? segment.distanceKm : a && b ? estimateKm(a, b) : null;
  if (distanceKm === null || !Number.isFinite(distanceKm)) return null;
  const minutes = typeof segment?.estimatedMinutes === "number" && segment.estimatedMinutes > 0
    ? segment.estimatedMinutes
    : calculateTravelTime(distanceKm, mode);
  return { distanceKm, minutes, mode };
}

/** One leg per consecutive pair of stops; empty for a day with fewer than two. */
export function dayTravelLegs<P extends LegPlace>(places: readonly P[], segments: readonly TransportSegment[] = []):
  Array<{ from: P; to: P; leg: TravelLeg }> {
  const legs: Array<{ from: P; to: P; leg: TravelLeg }> = [];
  for (let index = 1; index < places.length; index += 1) {
    const leg = travelLegBetween(places[index - 1], places[index], segments);
    if (leg) legs.push({ from: places[index - 1], to: places[index], leg });
  }
  return legs;
}

/** "1.1 km • 2 min", the format the Edit Day form shows. */
export function formatTravelLeg(leg: TravelLeg): string {
  const distance = leg.distanceKm < 1 ? `${Math.round(leg.distanceKm * 1000)} m` : `${leg.distanceKm.toFixed(1)} km`;
  return `${distance} • ${formatTravelTime(leg.minutes)}`;
}
