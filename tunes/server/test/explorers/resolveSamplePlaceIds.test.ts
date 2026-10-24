// tunes/server/test/explorers/resolveSamplePlaceIds.test.ts
import { describe, expect, it, vi } from "vitest";
import { resolvePlacesInFixture } from "../../../scripts/resolve-sample-place-ids";

const fixture = { set: "india", version: "v1", category: "places", lists: [{ key: "k", title: "t", description: "d", topPicks: true,
  items: [{ note: "n", rating: 9, googlePlaceId: null as string | null, details: { title: "Gateway of India", formattedAddress: "Apollo Bandar, Colaba, Mumbai", latitude: 18.922, longitude: 72.8347 } }] }] };

describe("resolve-sample-place-ids", () => {
  it("fills id, address and coordinates from the first Text Search hit and leaves resolved items alone", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [{ id: "ChIJ_exampleGatewayId0", formattedAddress: "Apollo Bandar, Colaba, Mumbai, Maharashtra 400001, India", location: { latitude: 18.9219841, longitude: 72.8346543 } }] })));
    const out = await resolvePlacesInFixture(structuredClone(fixture), { key: "test-key", fetcher });
    const item = out.fixture.lists[0].items[0];
    expect(item.googlePlaceId).toBe("ChIJ_exampleGatewayId0");
    expect(item.details.latitude).toBe(18.9219841);
    expect(out.unresolved).toEqual([]);
    const [, init] = fetcher.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ textQuery: "Gateway of India, Apollo Bandar, Colaba, Mumbai" });
    expect(init.headers["X-Goog-FieldMask"]).toBe("places.id,places.formattedAddress,places.location");
    const again = await resolvePlacesInFixture(out.fixture, { key: "test-key", fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(again.unresolved).toEqual([]);
  });

  it("reports a place with no hit instead of guessing", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({})));
    const out = await resolvePlacesInFixture(structuredClone(fixture), { key: "test-key", fetcher });
    expect(out.unresolved).toEqual(["Gateway of India"]);
    expect(out.fixture.lists[0].items[0].googlePlaceId).toBeNull();
  });
});
