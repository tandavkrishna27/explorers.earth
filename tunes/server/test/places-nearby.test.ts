import {describe, expect, it, vi} from "vitest";
import {PlacesNearbyService, PlacesNearbyFailure, nearbyCellKey, GOOGLE_NEARBY_FIELD_MASK} from "../services/placesNearby";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json"}});
const google = {places: [
  {id: "g1", displayName: {text: "Cafe One"}, location: {latitude: 38.7223, longitude: -9.1393}, shortFormattedAddress: "1 Rua, Lisbon"},
  {id: "g2", displayName: {text: "No address"}, location: {latitude: 38.7224, longitude: -9.1394}},
  {id: "bad", displayName: {text: ""}, location: {latitude: 1, longitude: 2}},
]};
const osm = {osm_type: "way", osm_id: 42, name: "Praca", display_name: "Praca, Lisbon, Portugal", lat: "38.7220000", lon: "-9.1390000"};

describe("PlacesNearbyService", () => {
  it("asks Google with the basic field mask and maps the places", async () => {
    const fetch = vi.fn(async () => json(google));
    const service = new PlacesNearbyService({googleApiKey: "k", fetch});
    const result = await service.nearby("acct", {lat: 38.7223, lng: -9.1393});
    expect(result).toEqual({source: "google", places: [
      {id: "g1", title: "Cafe One", subtitle: "1 Rua, Lisbon", lat: 38.7223, lng: -9.1393},
      {id: "g2", title: "No address", subtitle: null, lat: 38.7224, lng: -9.1394},
    ]});
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchNearby");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("k");
    expect(headers["X-Goog-FieldMask"]).toBe("places.id,places.displayName,places.location,places.shortFormattedAddress");
    expect(GOOGLE_NEARBY_FIELD_MASK).toBe(headers["X-Goog-FieldMask"]);
    expect(JSON.parse(String(init.body))).toEqual({maxResultCount: 8, rankPreference: "DISTANCE",
      locationRestriction: {circle: {center: {latitude: 38.7223, longitude: -9.1393}, radius: 250}}});
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses OpenStreetMap when no Google key is set", async () => {
    const fetch = vi.fn(async () => json(osm));
    const result = await new PlacesNearbyService({fetch}).nearby("acct", {lat: 38.722, lng: -9.139});
    expect(result).toEqual({source: "osm", places: [{id: "osm:way:42", title: "Praca", subtitle: "Praca, Lisbon, Portugal", lat: 38.722, lng: -9.139}]});
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=38.722&lon=-9.139&zoom=18");
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^explorers\.earth\//);
  });

  it("falls back to OpenStreetMap when Google fails, and to none when both fail", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({}, 500)).mockResolvedValueOnce(json(osm));
    expect((await new PlacesNearbyService({googleApiKey: "k", fetch}).nearby("a", {lat: 1, lng: 1})).source).toBe("osm");
    const broken = vi.fn(async () => { throw new Error("down"); });
    expect(await new PlacesNearbyService({googleApiKey: "k", fetch: broken}).nearby("a", {lat: 1, lng: 1})).toEqual({source: "none", places: []});
  });

  it("refuses an oversized provider response", async () => {
    const fetch = vi.fn(async () => new Response("x".repeat(300_000), {status: 200}));
    expect((await new PlacesNearbyService({fetch}).nearby("a", {lat: 1, lng: 1})).source).toBe("none");
  });

  it("caches per ~110m cell but never caches none", async () => {
    const fetch = vi.fn(async () => json(osm));
    const service = new PlacesNearbyService({fetch});
    await service.nearby("a", {lat: 38.72231, lng: -9.13931});
    await service.nearby("a", {lat: 38.72234, lng: -9.13934});
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(nearbyCellKey(38.72231, -9.13931)).toBe("38.722,-9.139");
    const failing = vi.fn(async () => json({}, 500));
    const none = new PlacesNearbyService({fetch: failing});
    await none.nearby("a", {lat: 1, lng: 1});
    await none.nearby("a", {lat: 1, lng: 1});
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("expires cache entries and bounds the cache", async () => {
    let now = 0;
    const fetch = vi.fn(async () => json(osm));
    const service = new PlacesNearbyService({fetch, now: () => now, cacheEntries: 2, rateLimit: 1000});
    await service.nearby("a", {lat: 1, lng: 1});
    await service.nearby("a", {lat: 2, lng: 2});
    await service.nearby("a", {lat: 3, lng: 3});
    await service.nearby("a", {lat: 1, lng: 1}); // evicted
    expect(fetch).toHaveBeenCalledTimes(4);
    now = 25 * 3600_000;
    await service.nearby("a", {lat: 3, lng: 3}); // expired
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("rate limits per account with a retry hint", async () => {
    let now = 0;
    const service = new PlacesNearbyService({fetch: vi.fn(async () => json(osm)), now: () => now, rateLimit: 2});
    await service.nearby("a", {lat: 1, lng: 1});
    await service.nearby("a", {lat: 1, lng: 1});
    await service.nearby("b", {lat: 1, lng: 1});
    const refused = await service.nearby("a", {lat: 1, lng: 1}).catch(e => e);
    expect(refused).toBeInstanceOf(PlacesNearbyFailure);
    expect(refused).toMatchObject({status: 429, code: "RATE_LIMITED"});
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    now = 60_000;
    await expect(service.nearby("a", {lat: 1, lng: 1})).resolves.toMatchObject({source: "osm"});
  });
});
