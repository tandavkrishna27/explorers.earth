// Authoring-time only (SMP-08: stored ids, no runtime cost). The author's key comes from their own
// shell as GOOGLE_PLACES_AUTHORING_KEY and is never committed or logged.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type PlaceDetails = { title: string; formattedAddress?: string | null; latitude?: number | null; longitude?: number | null };
type PlaceItem = { googlePlaceId: string | null; details: PlaceDetails };
// Guide days mix v2 'place' and 'note' items; only place items carry details.
type GuideItem = ({ kind: "place" } & PlaceItem) | { kind: "note" };
type Fixture = { lists?: Array<{ items: PlaceItem[] }>; guide?: { days: Array<{ items: GuideItem[] }> } };
type Options = { key: string; fetcher?: typeof fetch };

const endpoint = "https://places.googleapis.com/v1/places:searchText";

/** Pure over its fetcher: resolves only items whose id is still null, so a re-run costs nothing. */
export async function resolvePlacesInFixture<F extends Fixture>(fixture: F, { key, fetcher = fetch }: Options) {
  const unresolved: string[] = [];
  const items: PlaceItem[] = [...(fixture.lists ?? []).flatMap((l) => l.items), ...(fixture.guide?.days ?? []).flatMap((d) => d.items.flatMap((i) => (i.kind === "place" ? [i] : [])))];
  for (const item of items) {
    if (item.googlePlaceId) continue;
    const textQuery = [item.details.title, item.details.formattedAddress].filter(Boolean).join(", ");
    const response = await fetcher(endpoint, { method: "POST", body: JSON.stringify({ textQuery }), headers: {
      "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.formattedAddress,places.location" } });
    const hit = ((await response.json()) as { places?: Array<{ id: string; formattedAddress?: string; location?: { latitude: number; longitude: number } }> }).places?.[0];
    if (!hit?.id || !hit.location) { unresolved.push(item.details.title); continue; }
    item.googlePlaceId = hit.id;
    item.details.formattedAddress = hit.formattedAddress ?? item.details.formattedAddress ?? null;
    item.details.latitude = hit.location.latitude;
    item.details.longitude = hit.location.longitude;
  }
  return { fixture, unresolved };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/scripts/resolve-sample-place-ids.ts")) {
  const key = process.env.GOOGLE_PLACES_AUTHORING_KEY;
  if (!key) { console.error("Set GOOGLE_PLACES_AUTHORING_KEY in your own shell; it is never committed."); process.exit(2); }
  const files = process.argv.slice(2).filter((a) => a.endsWith(".json"));
  let failed = false;
  for (const file of files) {
    const path = resolve(file);
    const { fixture, unresolved } = await resolvePlacesInFixture(JSON.parse(readFileSync(path, "utf8")) as Fixture, { key });
    writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
    if (unresolved.length) { failed = true; console.error(`${file}: unresolved ${unresolved.join("; ")}`); }
  }
  process.exit(failed ? 1 : 0);
}
