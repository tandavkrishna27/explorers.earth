import { describe, expect, it } from "vitest";
import { dayTravelLegs, formatTravelLeg, travelLegBetween } from "../travelLegs";

const at = (id: string, lat: number, lng: number) => ({ id: `day-${id}`, place_id: `g-${id}`, geometry: { location: { lat, lng } } });
const a = at("a", 12.9716, 77.5946);
const b = at("b", 12.9816, 77.5946);

describe("travel legs (GDE-X05)", () => {
  it("estimates distance and drive time from coordinates", () => {
    const leg = travelLegBetween(a, b)!;
    expect(leg.mode).toBe("drive");
    expect(leg.distanceKm).toBeCloseTo(1.11, 1);
    expect(formatTravelLeg(leg)).toMatch(/^1\.1 km • \d+ min$/);
  });

  it("prefers the saved segment, matched by the form's day-place id or the Google id", () => {
    const seg = { fromPlaceId: "day-a", toPlaceId: "day-b", mode: "walk" as const, distanceKm: 1.1, estimatedMinutes: 13 };
    expect(travelLegBetween(a, b, [seg])).toEqual({ distanceKm: 1.1, minutes: 13, mode: "walk" });
    const byGoogle = { ...seg, fromPlaceId: "g-a", toPlaceId: "g-b" };
    expect(travelLegBetween(a, b, [byGoogle])?.minutes).toBe(13);
  });

  it("returns nothing for a single place", () => {
    expect(dayTravelLegs([a])).toEqual([]);
    expect(dayTravelLegs([])).toEqual([]);
  });

  it("degrades to nothing when coordinates are missing (Maps failed)", () => {
    expect(travelLegBetween({ id: "x" }, b)).toBeNull();
    expect(dayTravelLegs([{ id: "x" }, b, a])).toHaveLength(1);
  });
});
