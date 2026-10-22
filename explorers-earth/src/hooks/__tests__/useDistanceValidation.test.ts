import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDistanceValidation } from "../useDistanceValidation";

// PLC-04. A place with no driving route (an island, across water) made the Distance Matrix
// answer ZERO_RESULTS, which the form showed as a connection error. It is now judged by
// straight-line distance against the same 400 km limit.
const stubMaps = (elementStatus: string) => vi.stubGlobal("google", { maps: {
  LatLng: class { constructor(public lat: number, public lng: number) {} },
  TravelMode: { DRIVING: "DRIVING" }, UnitSystem: { METRIC: 0 },
  DistanceMatrixStatus: { OK: "OK" }, DistanceMatrixElementStatus: { OK: "OK" },
  DistanceMatrixService: class { getDistanceMatrix(_req: unknown, cb: (r: unknown, s: string) => void) {
    cb({ rows: [{ elements: [{ status: elementStatus }] }] }, "OK"); } },
} });

describe("useDistanceValidation without a driving route", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts a place within 400 km in a straight line", async () => {
    stubMaps("ZERO_RESULTS");
    const { result } = renderHook(() => useDistanceValidation());
    // Port Blair to Havelock Island: ~40 km over water.
    const outcome = await result.current.validateDistance({ lat: 11.6234, lng: 92.7265 }, { lat: 11.9761, lng: 92.9876 });
    expect(outcome.isValid).toBe(true);
    expect(outcome.method).toBe("fallback");
    expect(outcome.error).toBeUndefined();
    expect(outcome.distance?.text).toMatch(/^\d+\.\d km \(straight-line\)$/);
  });

  it("refuses a place beyond 400 km in a straight line, with its real distance", async () => {
    stubMaps("ZERO_RESULTS");
    const { result } = renderHook(() => useDistanceValidation());
    // Chennai to Port Blair: ~1,330 km.
    const outcome = await result.current.validateDistance({ lat: 13.0827, lng: 80.2707 }, { lat: 11.6234, lng: 92.7265 });
    expect(outcome.isValid).toBe(false);
    expect(outcome.method).toBe("fallback");
    expect(outcome.error).toBeUndefined();
    expect(Number.parseFloat(outcome.distance!.text)).toBeGreaterThan(1300);
  });
});
