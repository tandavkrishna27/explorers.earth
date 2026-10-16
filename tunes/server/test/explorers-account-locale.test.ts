import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { updateAccountRequestSchema } from "../../shared/explorersContract";

/**
 * Decision D7, 2026-10-08. `locale` was `z.enum(["en","hi"])` while the frontend ships 47
 * i18n locale bundles, so 45 of the languages a creator can select in the UI could never be
 * stored as their preference.
 *
 * Latent rather than live: no frontend write sends `locale` today, which is why nothing was
 * failing. These cases exist so that stays true once one does.
 *
 * The locale list is read off the i18n bundle directory rather than written out here, so the
 * assertion cannot drift away from the languages actually shipped - adding a bundle
 * extends the coverage automatically.
 */

const parse = (fields: Record<string, unknown>) =>
  updateAccountRequestSchema.safeParse({ expectedRevision: 1, ...fields }).success;

const i18nDirectory = resolve(__dirname, "../../../explorers-earth/src/i18n/resources");

const shippedLocales = readdirSync(i18nDirectory)
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.replace(/\.json$/, ""));

/** The locales that carry reference content (ticket 7.2), a subset of the bundles. */
const referenceLocales = readdirSync(resolve(__dirname, "../../../explorers-earth/src/content/reference"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.replace(/\.json$/, ""));

describe("account locale contract", () => {
  it("has more shipped UI locales than the old two-value enum admitted", () => {
    // Guards the premise. If this ever drops to 2 the widening is pointless and the
    // reviewer should know that rather than read a vacuous pass below.
    expect(shippedLocales.length).toBeGreaterThan(2);
    expect(shippedLocales).toContain("en");
    expect(shippedLocales).toContain("hi");
  });

  it("accepts every locale the frontend actually ships a bundle for", () => {
    const rejected = shippedLocales.filter((locale) => !parse({ locale }));
    expect(rejected).toEqual([]);
  });

  it("accepts every locale that carries reference content", () => {
    // These are the ten the legal and FAQ copy was migrated for. A creator whose Terms page
    // renders must be able to hold that locale as a preference.
    expect(referenceLocales.length).toBeGreaterThanOrEqual(10);
    const rejected = referenceLocales.filter((locale) => !parse({ locale }));
    expect(rejected).toEqual([]);
  });

  it("accepts a region-qualified locale", () => {
    // `en-GB` is what a browser reports; ticket 7.2's content resolution normalises it to
    // `en`, but the stored preference keeps the region the creator's client sent.
    expect(parse({ locale: "en-GB" })).toBe(true);
    expect(parse({ locale: "pt-BR" })).toBe(true);
  });

  it("still refuses anything that is not a locale", () => {
    for (const locale of [
      "", "e", "eng", "EN", "en_GB", "en-gb", "en-GBR", "1n", "en ", " en",
      "en-GB-oed", "../../etc/passwd", "en;DROP TABLE", "zz-ZZ-ZZ",
    ]) expect(parse({ locale }), locale).toBe(false);
  });

  it("refuses a non-string locale", () => {
    for (const locale of [null, 27, true, {}, ["en"]]) expect(parse({ locale })).toBe(false);
  });

  it("keeps locale optional, so a write that omits it is unaffected", () => {
    expect(parse({})).toBe(true);
    expect(parse({ displayName: "Ada" })).toBe(true);
  });

  it("matches the locale rule migration 0037 already uses for taxonomy translations", () => {
    // One locale rule in this codebase, not two. If 0037's CHECK is ever edited, this fails
    // and whoever edited it has to decide deliberately rather than let the two drift.
    const migration = readFileSync(
      resolve(__dirname, "../../migrations/0037_explorers_movies_provider_context.sql"), "utf8",
    );
    expect(migration).toContain("locale ~ '^[a-z]{2}(-[A-Z]{2})?$'");
  });
});
