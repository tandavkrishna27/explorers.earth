/**
 * The one definition of "this is already a canonical media URL, leave it alone".
 *
 * Every canonical projection emits exactly one shape for owned imagery -
 * `/api/explorers/v1/media/<uuid>/content` - and it is same-origin and complete, so any
 * caller that rewrites URLs must recognise it before doing anything else.
 *
 * This exists because the rule was written three times and two copies were wrong, which is
 * the ordinary fate of a policy that lives in whichever component needed it:
 *
 * - `publicPlaceMedia.ts` had it right, as an exact match.
 * - `ProfileRecommendationsTab.tsx` did not have it at all, so a canonical cover was
 *   concatenated onto the Strapi origin, or onto TMDB's host on the movie shelf.
 * - `pages/Home.tsx` had it twice, narrowed to `type === 'movie'` and `type === 'game'`, so
 *   the book, guide and place shelves on the owner dashboard still got the Strapi origin.
 *
 * The match is exact rather than a prefix, so nothing else under `/api` can be passed off
 * as media, and a query or fragment is refused - the media route takes neither, and
 * accepting them would let one stored URL vary.
 */
const CANONICAL_MEDIA_PATH =
  /^\/api\/explorers\/v1\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/content$/i;

/*
 * Returns a plain boolean rather than a `value is string` predicate on purpose. Every
 * caller has already established it holds a string, so a predicate narrowed the *negative*
 * branch to `never` and broke the `startsWith` checks that follow the call.
 */
export const isCanonicalMediaPath = (value: unknown): boolean =>
  typeof value === "string" && CANONICAL_MEDIA_PATH.test(value);
