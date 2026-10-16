import {describe, expect, it} from 'vitest';
import {guideSlug} from '../guideCreation';

/**
 * Ticket 5.3. The guide slug.
 *
 * collections.slug carries a database CHECK - ^[a-z0-9]+(-[a-z0-9]+)*$, 1 to 200 chars -
 * and it is unique per account and category. A slug that fails it is a 422 the creator sees
 * as "could not create guide" with nothing actionable in it, so the rules are asserted here
 * rather than discovered in production.
 */
const PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('guide slug', () => {
 it('satisfies the database pattern for an ordinary title', () => {
  const slug = guideSlug('Kerala in five days');
  expect(slug).toMatch(PATTERN);
  expect(slug.startsWith('kerala-in-five-days-')).toBe(true);
 });

 it('is unique per call, so two guides of the same name both save', () => {
  // The slug is unique per account and category, so "My trip" twice must not collide.
  expect(guideSlug('My trip')).not.toBe(guideSlug('My trip'));
 });

 it('produces a valid slug from titles that contain no Latin alphanumerics', () => {
  // Stripping these to empty and sending "" would fail the CHECK. Non-Latin titles are
  // ordinary here - the app is used in Malayalam and Hindi.
  for (const title of ['ചായക്കട', '日本の旅', '!!!', '   ', '—']) {
   const slug = guideSlug(title);
   expect(slug, title).toMatch(PATTERN);
   expect(slug.startsWith('guide-'), title).toBe(true);
  }
 });

 it('collapses punctuation and whitespace rather than emitting it', () => {
  for (const title of ['A  B', 'A--B', ' A/B ', 'A & B', "A's B"]) {
   expect(guideSlug(title), title).toMatch(PATTERN);
  }
 });

 it('never leads or trails with a hyphen, which the pattern refuses', () => {
  for (const title of ['-leading', 'trailing-', '  spaced  ', '///']) {
   const slug = guideSlug(title);
   expect(slug.startsWith('-'), title).toBe(false);
   expect(slug.endsWith('-'), title).toBe(false);
   expect(slug, title).toMatch(PATTERN);
  }
 });

 it('stays inside the 200-character column bound even for a very long title', () => {
  const slug = guideSlug('Kerala '.repeat(80));
  expect(slug.length).toBeLessThanOrEqual(200);
  expect(slug).toMatch(PATTERN);
 });

 it('keeps digits, since a guide may legitimately be named after one', () => {
  expect(guideSlug('72 hours in Kochi')).toMatch(/^72-hours-in-kochi-/);
 });

 it('folds accents rather than stripping the whole word', () => {
  // NFKD then strip means "Café" keeps "cafe" instead of becoming "caf".
  expect(guideSlug('Café hopping')).toMatch(/^cafe-hopping-/);
 });
});
