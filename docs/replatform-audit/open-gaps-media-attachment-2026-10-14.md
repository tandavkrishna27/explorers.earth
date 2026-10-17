# Open gaps: recommendation media attachment write/read asymmetry

Filed 2026-10-14 at `55d4b023`. These were surfaced while diagnosing public parity
case 12 and are deliberately NOT fixed in that diff; this file is the tracking
artifact the attestation record refers to.

## Gap 1 (product): `updateRecommendation` accepts media the read path can never serve

`explorersRecommendationRepository.ts` accepts `mediaIds` for any non-guides
category and calls `replaceMedia` unconditionally — there is no category gate.
Rows land in `recommendation_media`.

The public visibility query resolves generic `recommendation_media`
(`required_category IS NULL`) only for `books`, `movies`, `games`
(`tunes/server/repositories/mediaRepository.ts`, the `recommendation_media`
union branch). For `apps` and `places` the first clause is false by category and
the second evaluates `NULL = 'apps'` -> NULL -> false.

So an owner can attach media to an apps or places recommendation, the write
succeeds, the row persists, and the asset is permanently unservable publicly.
Apps and places carry media through `recommendation_app_screenshots` and
`recommendation_place_photos` instead.

Resolution options (owner decision, none taken):
- reject the write (422) for categories whose rows cannot be served;
- route `mediaIds` into the typed table for those categories;
- widen the read path (NOT recommended — it would serve bytes no public payload
  references).

This asymmetry was previously observable as a public parity case 12 failure
(anonymous GET of the apps recommendation asset returned 404 where 200 was
expected). `55d4b023` stopped the harness seeding those attachments, which
removes the only assertion in the tree that surfaced it. It is now untested.

## Gap 2 (harness): `snapshotMedia` does not scan the typed media tables

`tunes/scripts/public-parity-owned-composition.ts` `snapshotMedia` scans
`collection_media`, `recommendation_media`, `guide_section_photos` and
`profile_feed_items`. It never scans `recommendation_app_screenshots` or
`recommendation_place_photos`, so apps/places typed media cannot appear in the
issued manifest and has no public parity coverage at all.

Consequence: moving apps/places media to the typed tables (the architecturally
correct home) would require `snapshotMedia` to scan them, new attachment slot
values in `mediaAttachmentSchema`, validator updates, and new removal branches in
case 12. That ripple is why `55d4b023` took the smaller route.

## Gap 3 (harness, verifiability): issued manifest has no lower bound

`tunes/scripts/public-parity-browser-support.ts` declares
`media: z.array(issuedMediaSchema).max(32)` and `links: ....max(2)` with no
`.min()`. Case 12 only requires "some png", "some mp4" and "some asset with two
or more attachments". The media attach loop could therefore be narrowed further,
or links could vanish entirely, and the lane would still pass.

Until a lower bound or an exact expected attachment inventory exists, any claim
that an edit to those loops loses no coverage is unverifiable by the gate itself.

## Gap 4 (verifiability, follow-up): playback decode witness is non-specific

Case 12 asserts `playback.width`/`height` with `toBeGreaterThan(0)`. The seed pins
the feed item at `width: 16, height: 16`, and the admission logic added in
`311a0ddf` treats "single frame" as load-bearing. Tightening both to the attested
`16` would make the decode witness specific to the seeded asset rather than merely
non-zero.

Not done yet: `videoWidth === 16` was measured directly, `videoHeight` was not, so
the change is unverified and was deferred rather than guessed into a protected run.
