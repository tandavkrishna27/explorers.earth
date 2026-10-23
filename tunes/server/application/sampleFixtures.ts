import { z } from "zod/v3";
import { resolveManualMovieSchema } from "../../shared/explorersMovieContract";
import { resolveManualBookSchema } from "../../shared/explorersBookContract";
import { resolveManualGameSchema } from "../../shared/explorersContract";
import { resolveManualAppSchema } from "../../shared/explorersAppContract";
import { resolveManualProductSchema } from "../../shared/explorersProductContract";
import { resolveManualPersonSchema } from "../../shared/explorersPersonContract";
import { resolveManualPlaceSchema } from "../../shared/explorersPlaceContract";
import indiaPlaces from "../fixtures/samples/india/v1/places.json";
import indiaMovies from "../fixtures/samples/india/v1/movies.json";
import indiaBooks from "../fixtures/samples/india/v1/books.json";
import indiaGames from "../fixtures/samples/india/v1/games.json";
import indiaApps from "../fixtures/samples/india/v1/apps.json";
import indiaProducts from "../fixtures/samples/india/v1/products.json";
import indiaPeople from "../fixtures/samples/india/v1/people.json";
import indiaGuides from "../fixtures/samples/india/v1/guides.json";
import globalPlaces from "../fixtures/samples/global/v1/places.json";
import globalMovies from "../fixtures/samples/global/v1/movies.json";
import globalBooks from "../fixtures/samples/global/v1/books.json";
import globalGames from "../fixtures/samples/global/v1/games.json";
import globalApps from "../fixtures/samples/global/v1/apps.json";
import globalProducts from "../fixtures/samples/global/v1/products.json";
import globalPeople from "../fixtures/samples/global/v1/people.json";
import globalGuides from "../fixtures/samples/global/v1/guides.json";

import { SAMPLE_FIXTURE_SETS, sampleKeySchema, type SampleFixtureSet, type SampleKey } from "../../shared/explorersSampleContract";
import { guideDayItemSchema, guideTimeLabelSchema, type GuideDayItem } from "../../shared/explorersGuideContract";

/** S3 `fixture_version` ('v1'). Bump with a new `v2/` folder; never edit a shipped version (receipts record which one each key came from). */
export const SAMPLE_FIXTURE_VERSION = "v1" as const;
export type SampleSet = SampleFixtureSet; // 'india' | 'global', from S3
export const SAMPLE_LIST_CATEGORIES = ["places", "movies", "books", "games", "apps", "products", "people"] as const;
export type SampleListCategory = (typeof SAMPLE_LIST_CATEGORIES)[number];
/** S3 `sample_key` = '<category>/<slug>'; the fixture's list key is the slug. */
export const sampleKeyFor = (category: SampleListCategory | "guides", listKey: string): SampleKey => sampleKeySchema.parse(`${category}/${listKey}`);

// The movie schema is refined (a ZodEffects), so its object shape sits one level in.
const detailsSchemas = {
  places: resolveManualPlaceSchema.shape.details,
  movies: resolveManualMovieSchema.innerType().shape.details,
  books: resolveManualBookSchema.shape.details,
  games: resolveManualGameSchema.shape.details,
  apps: resolveManualAppSchema.shape.details,
  products: resolveManualProductSchema.shape.details,
  people: resolveManualPersonSchema.shape.details,
} as const;

const listKey = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80);
const note = z.string().min(1).max(400);
const rating = z.number().int().min(1).max(10);
const googlePlaceId = z.string().regex(/^[A-Za-z0-9_-]{10,}$/).nullable();

const itemSchema = <C extends SampleListCategory>(category: C) => z.object({
  note, rating,
  details: detailsSchemas[category] as (typeof detailsSchemas)[C],
  ...(category === "places" ? { googlePlaceId } : {}),
}).strict();

const listSchema = <C extends SampleListCategory>(category: C) => z.object({
  key: listKey, title: z.string().min(1).max(200), description: z.string().min(1).max(500),
  topPicks: z.boolean(), items: z.array(itemSchema(category)).min(1).max(12),
}).strict();

export const sampleFixtureFileSchema = z.discriminatedUnion("category", SAMPLE_LIST_CATEGORIES.map((category) => z.object({
  set: z.enum(SAMPLE_FIXTURE_SETS), version: z.literal(SAMPLE_FIXTURE_VERSION), category: z.literal(category),
  lists: z.array(listSchema(category)).max(3),
}).strict()) as unknown as [z.ZodDiscriminatedUnionOption<"category">, z.ZodDiscriminatedUnionOption<"category">, ...z.ZodDiscriminatedUnionOption<"category">[]]);

// Guide fixture = the S3/0069 v2 day model in a compact authoring form: each day becomes ONE
// guide_sections row (display_order = day index, block_version 'guide-section-blocks/v2') whose
// blocks.items is this ordered list. `toGuideDayItem` expands a compact place into S3's full
// GuideDayPlace; the fixture test proves every expanded item parses guideDayItemSchema.
// 'listItem' is not used in v1 fixtures (its ref needs a real recommendation id).
const localId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(100);
const timeLabel = guideTimeLabelSchema.nullable();
const guidePlaceItemSchema = z.object({
  kind: z.literal("place"), localId, timeLabel, tips: note, googlePlaceId, details: detailsSchemas.places,
}).strict();
const guideNoteItemSchema = z.object({ kind: z.literal("note"), localId, timeLabel, text: note }).strict();
const guideFixtureItemSchema = z.discriminatedUnion("kind", [guidePlaceItemSchema, guideNoteItemSchema]);
export type SampleGuideFixtureItem = z.infer<typeof guideFixtureItemSchema>;

export const sampleGuideFileSchema = z.object({
  set: z.enum(SAMPLE_FIXTURE_SETS), version: z.literal(SAMPLE_FIXTURE_VERSION), category: z.literal("guides"),
  guide: z.object({
    key: listKey, title: z.string().min(1).max(200), description: z.string().min(1).max(500),
    guideType: z.literal("itinerary"), numberOfDays: z.number().int().min(1).max(14),
    days: z.array(z.object({ day: z.number().int().min(1), items: z.array(guideFixtureItemSchema).min(1).max(8) }).strict()).min(1).max(14),
  }).strict(),
}).strict();

/** Compact fixture item -> S3 v2 GuideDayItem. Field list equals S3's guideDayPlaceSchema. */
export function toGuideDayItem(item: SampleGuideFixtureItem): GuideDayItem {
  if (item.kind === "note") return guideDayItemSchema.parse({ kind: "note", localId: item.localId, timeLabel: item.timeLabel, text: item.text });
  const d = item.details;
  return guideDayItemSchema.parse({ kind: "place", localId: item.localId, timeLabel: item.timeLabel, place: {
    localId: item.localId, placeId: item.googlePlaceId, name: d.title, formattedAddress: d.formattedAddress ?? null,
    geometry: d.latitude != null && d.longitude != null ? { location: { lat: d.latitude, lng: d.longitude } } : null,
    types: [], tips: item.tips, photos: [], priceLevel: null, priceRange: null, customBudget: null,
    budgetAmount: null, budgetCurrency: null, source: item.googlePlaceId ? "google" : "manual", verified: item.googlePlaceId !== null,
  } });
}

type ListItem<C extends SampleListCategory> = { note: string; rating: number; details: z.infer<(typeof detailsSchemas)[C]>; googlePlaceId?: string | null };
export type SampleList<C extends SampleListCategory = SampleListCategory> = { key: string; title: string; description: string; topPicks: boolean; items: Array<ListItem<C>> };
export type SampleListFile<C extends SampleListCategory = SampleListCategory> = {
  set: SampleSet; version: typeof SAMPLE_FIXTURE_VERSION; category: C; lists: Array<SampleList<C>>;
};
export type SampleGuideFile = z.infer<typeof sampleGuideFileSchema>;
export type LoadedSampleSet = { set: SampleSet; lists: { [C in SampleListCategory]: SampleListFile<C> }; guide: SampleGuideFile };

const raw: Record<SampleSet, Record<SampleListCategory | "guides", unknown>> = {
  india: { places: indiaPlaces, movies: indiaMovies, books: indiaBooks, games: indiaGames, apps: indiaApps, products: indiaProducts, people: indiaPeople, guides: indiaGuides },
  global: { places: globalPlaces, movies: globalMovies, books: globalBooks, games: globalGames, apps: globalApps, products: globalProducts, people: globalPeople, guides: globalGuides },
};

const cache = new Map<SampleSet, LoadedSampleSet>();
/** Parses once per process; a malformed fixture throws at first use and is caught by sampleFixtures.test.ts in CI. */
export function loadSampleSet(set: SampleSet): LoadedSampleSet {
  const hit = cache.get(set);
  if (hit) return hit;
  const lists = Object.fromEntries(SAMPLE_LIST_CATEGORIES.map((category) => {
    const file = sampleFixtureFileSchema.parse(raw[set][category]) as SampleListFile;
    if (file.set !== set || file.category !== category) throw new Error(`Sample fixture ${set}/${category} is mislabelled`);
    return [category, file];
  })) as LoadedSampleSet["lists"];
  const guide = sampleGuideFileSchema.parse(raw[set].guides);
  if (guide.set !== set) throw new Error(`Sample fixture ${set}/guides is mislabelled`);
  const loaded = { set, lists, guide };
  cache.set(set, loaded);
  return loaded;
}
