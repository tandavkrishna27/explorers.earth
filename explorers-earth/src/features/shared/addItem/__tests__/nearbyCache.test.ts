import { describe, expect, it, vi } from "vitest";
import { createNearbyCache } from "../nearbyCache";

describe("nearbyCache", () => {
  it("one lookup per rounded area; concurrent taps share the request", async () => {
    const lookup = vi.fn().mockResolvedValue([{ id: "a", title: "Cafe Bodega", subtitle: "120 m" }]);
    const cache = createNearbyCache(lookup);
    await Promise.all([cache.get({ lat: 15.49871, lng: 73.82612 }), cache.get({ lat: 15.49874, lng: 73.82609 })]);
    await cache.get({ lat: 15.4987, lng: 73.8261 });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith({ lat: 15.499, lng: 73.826 });
  });

  it("a different cell looks up again; a failure is not cached", async () => {
    const lookup = vi.fn().mockRejectedValueOnce(new Error("quota")).mockResolvedValue([]);
    const cache = createNearbyCache(lookup);
    await expect(cache.get({ lat: 1.1, lng: 2.2 })).rejects.toThrow("quota");
    await cache.get({ lat: 1.1, lng: 2.2 });
    await cache.get({ lat: 1.2, lng: 2.2 });
    expect(lookup).toHaveBeenCalledTimes(3);
  });

  it("evicts the least recently used cell beyond the limit", async () => {
    const lookup = vi.fn().mockResolvedValue([]);
    const cache = createNearbyCache(lookup, 2);
    await cache.get({ lat: 1, lng: 1 }); await cache.get({ lat: 2, lng: 2 }); await cache.get({ lat: 1, lng: 1 });
    await cache.get({ lat: 3, lng: 3 }); await cache.get({ lat: 2, lng: 2 });
    expect(lookup).toHaveBeenCalledTimes(4);
  });
});
