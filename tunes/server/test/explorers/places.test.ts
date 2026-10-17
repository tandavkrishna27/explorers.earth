/**
 * Ticket 5.1's named Places unit suite, which did not exist - the ticket's own state
 * table records it twice as "not written" while `places.integration.test.ts` is marked
 * delivered.
 *
 * Scoped to what needs no database, which is also what the integration suite cannot
 * cheaply cover: the declarations in migrations 0046-0048, and the shared contract's
 * schemas. Deliberately NOT repeated here - `publicPlaceContact`'s disclosure rules and
 * cross-account isolation, which `places.integration.test.ts:125-159` already asserts
 * against real rows. Duplicating them would add no evidence and two places to update.
 *
 * Structured after `apps.test.ts`, which is the established shape for a category unit
 * suite: assert the migration declares the guards, then assert the contract refuses what
 * the guards refuse.
 */
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  PLACE_CONTACT_VISIBILITY,
  PLACE_RECOMMENDATION_SOURCES,
  PLACE_RECOMMENDATION_TYPES,
  emptyPlaceCollectionDetails,
  emptyPlaceContext,
  emptyPlaceDetails,
  legacyListNameDetails,
  placeCollectionDetailsSchema,
  placeEntityDetailsSchema,
  placeLocationSnapshotSchema,
  placePhotosSchema,
  placeRecommendationContextSchema,
  resolveManualPlaceSchema,
  safePlaceUrlSchema,
} from "../../../shared/explorersPlaceContract";

const migration = (name: string) =>
  readFileSync(new URL(`../../../migrations/${name}`, import.meta.url), "utf8");

it("0046 declares the typed Places tables, their kind guards and their revision triggers", () => {
  const sql = migration("0046_explorers_places_catalog.sql");
  for (const table of ["place_entity_details", "place_recommendation_context"]) {
    expect(sql).toContain(`CREATE TABLE public.${table}`);
  }
  /*
   * Both guards are paired: one on the detail table, one on the parent it must agree
   * with. A guard on the detail row alone is bypassed by later changing the parent's
   * kind, which is why `entities_place_details_kind_guard` and
   * `recommendations_place_context_kind_guard` exist on `entities` and `recommendations`.
   */
  for (const trigger of [
    "place_entity_details_guard",
    "entities_place_details_kind_guard",
    "place_recommendation_context_kind_guard",
    "recommendations_place_context_kind_guard",
  ]) {
    expect(sql, `${trigger} is missing`).toContain(trigger);
  }
  // Deferred, so a write may reach a consistent state within its transaction.
  expect(sql).toMatch(/place_entity_details_guard AFTER INSERT OR UPDATE[\s\S]{0,120}DEFERRABLE INITIALLY DEFERRED/);
  // The guard functions are not callable by the runtime role.
  expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.guard_place_entity_details\(\),public\.guard_place_context_kind\(\) FROM PUBLIC,music_runtime/);
  // Every revision kind, or an owner page serves a stale snapshot after an edit.
  for (const kind of ["insert", "update", "delete"]) {
    expect(sql).toContain(`place_recommendation_context_content_revision_${kind}`);
  }
});

it("0047 keys place photos to owned media with the account, not to a provider URL", () => {
  const sql = migration("0047_explorers_place_photo_media.sql");
  expect(sql).toContain("CREATE TABLE public.recommendation_place_photos");
  /*
   * The composite reference is the point: `(media_id,account_id)` means one creator
   * cannot attach another's media, which a plain `media_id` reference would allow.
   * RESTRICT rather than CASCADE so deleting media cannot silently empty a place.
   */
  expect(sql).toMatch(/FOREIGN KEY\(media_id,account_id\) REFERENCES public\.media_assets\(id,account_id\) ON DELETE RESTRICT/);
  for (const trigger of ["recommendation_place_photos_guard", "media_assets_place_photo_guard"]) {
    expect(sql, `${trigger} is missing`).toContain(trigger);
  }
});

it("rejects every unsafe authority trick on a Place URL", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,<script>",
    "file:///etc/passwd",
    "ftp://example.com/a",
    // Embedded credentials and an explicit port are refused even over https: both are
    // ways to point a rendered link at something other than what it appears to be.
    "https://user:pass@example.com/a",
    "https://user@example.com/a",
    "https://example.com:8443/a",
    "not a url",
  ]) {
    expect(safePlaceUrlSchema.safeParse(url).success, `${url} was accepted`).toBe(false);
  }
  for (const url of ["https://example.com/place", "http://example.com/place?q=1#f"]) {
    expect(safePlaceUrlSchema.safeParse(url).success, `${url} was refused`).toBe(true);
  }
});

it("round-trips typed Place details and refuses an unknown field", () => {
  const details = emptyPlaceDetails();
  expect(placeEntityDetailsSchema.parse(details)).toEqual(details);
  expect(placeEntityDetailsSchema.safeParse({ ...details, invented: "x" }).success).toBe(false);
});

it("keeps person-only fields on person recommendations", () => {
  const context = emptyPlaceContext();
  expect(placeRecommendationContextSchema.parse(context)).toEqual(context);

  // A place must not carry person fields...
  for (const field of ["personProfileUrl", "personAddress"] as const) {
    const leaked = { ...context, recommendationType: "place" as const,
      [field]: field === "personProfileUrl" ? "https://example.com/p" : "Somewhere" };
    expect(placeRecommendationContextSchema.safeParse(leaked).success, `${field} leaked onto a place`).toBe(false);
  }
  // ...and a person may.
  expect(placeRecommendationContextSchema.safeParse({
    ...context, recommendationType: "person", personProfileUrl: "https://example.com/p", personAddress: "Somewhere",
  }).success).toBe(true);
});

it("defaults contact visibility to private and closes all three vocabularies", () => {
  // The default is the privacy guarantee: a fresh row cannot be public by omission.
  expect(emptyPlaceContext().contactVisibility).toBe("private");
  expect(PLACE_CONTACT_VISIBILITY).toEqual(["private", "public"]);
  expect(PLACE_RECOMMENDATION_TYPES).toEqual(["place", "person"]);
  expect(PLACE_RECOMMENDATION_SOURCES).toEqual(["self", "suggestion"]);
  for (const [field, value] of [
    ["contactVisibility", "hidden"], ["recommendationType", "venue"], ["sourceOfRecommendation", "import"],
  ] as const) {
    expect(placeRecommendationContextSchema.safeParse({ ...emptyPlaceContext(), [field]: value }).success,
      `${field} accepted ${value}`).toBe(false);
  }
});

it("bounds place photos to ten owned media IDs and refuses a URL", () => {
  const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
  expect(placePhotosSchema.safeParse({ photoMediaIds: Array.from({ length: 10 }, (_, i) => id(i)) }).success).toBe(true);
  expect(placePhotosSchema.safeParse({ photoMediaIds: Array.from({ length: 11 }, (_, i) => id(i)) }).success).toBe(false);
  // Owned media only: a provider URL in this slot is what the owner decision ruled out.
  expect(placePhotosSchema.safeParse({ photoMediaIds: ["https://example.com/photo.jpg"] }).success).toBe(false);
  expect(placePhotosSchema.safeParse({ photoMediaIds: [], extra: 1 }).success).toBe(false);
});

it("requires a location snapshot's coordinates to be both present or both absent", () => {
  const base = { version: 1 as const, name: "Lisbon", address: null, providerPlaceId: null,
    latitude: null, longitude: null };
  expect(placeLocationSnapshotSchema.safeParse(base).success).toBe(true);
  expect(placeLocationSnapshotSchema.safeParse({ ...base, latitude: 38.7, longitude: -9.1 }).success).toBe(true);
  // A half-set coordinate is the shape that renders a marker in the Atlantic.
  expect(placeLocationSnapshotSchema.safeParse({ ...base, latitude: 38.7 }).success).toBe(false);
  expect(placeLocationSnapshotSchema.safeParse({ ...base, longitude: -9.1 }).success).toBe(false);
  // And the ranges are per-axis, not shared.
  expect(placeLocationSnapshotSchema.safeParse({ ...base, latitude: 100, longitude: 0 }).success).toBe(false);
  expect(placeLocationSnapshotSchema.safeParse({ ...base, latitude: 0, longitude: 190 }).success).toBe(false);
});

it("assembles the legacy List_Name_Details blob without inventing a location", () => {
  const parts = { note: "A note", thumbnailUrl: "/api/explorers/v1/media/11111111-1111-4111-8111-111111111111/content" };

  // No location set: `location` and `place_id` are null rather than zeroed or omitted.
  expect(legacyListNameDetails(null, parts)).toEqual({
    note: "A note", thumbnail: parts.thumbnailUrl, location: null, place_id: null, name: null,
  });

  /*
   * Zero coordinates survive. This is the case the contract's own comment calls out, and
   * the one a `latitude || null` would silently destroy: (0,0) is a real position, and
   * turning a set coordinate into "unset" moves a place rather than hiding it.
   */
  expect(legacyListNameDetails({
    version: 1, name: "Null Island", address: "Gulf of Guinea", providerPlaceId: "p-1",
    latitude: 0, longitude: 0,
  }, parts)).toEqual({
    note: "A note", thumbnail: parts.thumbnailUrl,
    location: { latitude: 0, longitude: 0, address: "Gulf of Guinea" },
    place_id: "p-1", name: "Null Island",
  });

  // A located snapshot with no coordinates keeps them null instead of becoming (0,0).
  expect(legacyListNameDetails({
    version: 1, name: "Lisbon", address: null, providerPlaceId: null, latitude: null, longitude: null,
  }, { note: null, thumbnailUrl: null }).location).toEqual({ latitude: null, longitude: null, address: null });
});

it("keeps a list's own location selection separate from its linked entity", () => {
  const details = emptyPlaceCollectionDetails();
  expect(details).toEqual({ locationEntityId: null, locationSnapshot: null, instagramMediaUrl: null });
  expect(placeCollectionDetailsSchema.parse(details)).toEqual(details);
  // The snapshot is display text and the entity is identity; the schema carries both and
  // neither substitutes for the other.
  expect(placeCollectionDetailsSchema.safeParse({
    ...details, locationEntityId: "11111111-1111-4111-8111-111111111111",
  }).success).toBe(true);
  expect(placeCollectionDetailsSchema.safeParse({ ...details, locationEntityId: "not-a-uuid" }).success).toBe(false);
  expect(placeCollectionDetailsSchema.safeParse({ ...details, instagramMediaUrl: "javascript:alert(1)" }).success).toBe(false);
});

it("requires a title to resolve a manual Place", () => {
  expect(resolveManualPlaceSchema.safeParse({
    kind: "manual", category: "places", details: { title: "Corner cafe" },
  }).success).toBe(true);
  expect(resolveManualPlaceSchema.safeParse({ kind: "manual", category: "places", details: {} }).success).toBe(false);
  // A manual Place is never a provider place, and the category is not overridable.
  expect(resolveManualPlaceSchema.safeParse({
    kind: "manual", category: "books", details: { title: "Corner cafe" },
  }).success).toBe(false);
  expect(resolveManualPlaceSchema.safeParse({
    kind: "provider", category: "places", details: { title: "Corner cafe" },
  }).success).toBe(false);
});
