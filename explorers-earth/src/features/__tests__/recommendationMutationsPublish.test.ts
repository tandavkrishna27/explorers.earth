import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { print, type DocumentNode } from "graphql";

// Every write to a Recommended* item must target the PUBLISHED version. Strapi
// returns only published entries by default, so an item created/updated without
// `status: PUBLISHED` is written as a draft and never appears on the public page.
// This contract test guards against that regression across all categories.
//
// Books, Favorites (Places) and Guides are no longer in the document lists below,
// because their Strapi mutation modules were deleted once measured unreachable.
// **Their coverage did not go away** — it inverted: `RETIRED` asserts those modules
// stay absent and that the feature imports no Apollo at all. That is a stronger
// guarantee than "the document publishes", and it is why the categories were removed
// from the lists rather than the lists being left to rot. A reintroduced Strapi write
// for those three fails here instead of passing unnoticed.
import * as Games from "../Games/api/mutation";
import * as Apps from "../AppsAndTools/api/mutation";
import * as People from "../People/api/mutation";
import * as Products from "../Products/api/mutation";
import * as Movies from "../Movies/api/mutation";

const publishes = (doc: DocumentNode): boolean =>
  /status:\s*PUBLISHED/.test(print(doc));

const mustPublish: Record<string, DocumentNode> = {
  // Games
  CREATE_RECOMMENDED_GAME: Games.CREATE_RECOMMENDED_GAME,
  UPDATE_RECOMMENDED_GAME: Games.UPDATE_RECOMMENDED_GAME,
  TOGGLE_GAME_PIN: Games.TOGGLE_GAME_PIN,
  // Apps
  CREATE_RECOMMENDED_APP: Apps.CREATE_RECOMMENDED_APP,
  UPDATE_RECOMMENDED_APP: Apps.UPDATE_RECOMMENDED_APP,
  TOGGLE_APP_PIN: Apps.TOGGLE_APP_PIN,
  // People
  CREATE_RECOMMENDED_PERSON: People.CREATE_RECOMMENDED_PERSON,
  UPDATE_RECOMMENDED_PERSON: People.UPDATE_RECOMMENDED_PERSON,
  TOGGLE_PERSON_PIN: People.TOGGLE_PERSON_PIN,
  // Products
  CREATE_RECOMMENDED_PRODUCT: Products.CREATE_RECOMMENDED_PRODUCT,
  UPDATE_RECOMMENDED_PRODUCT: Products.UPDATE_RECOMMENDED_PRODUCT,
  TOGGLE_PRODUCT_PIN: Products.TOGGLE_PRODUCT_PIN,
  // Movies (create/update already published; pin was the gap)
  CREATE_RECOMMENDED_MOVIE: Movies.CREATE_RECOMMENDED_MOVIE,
  UPDATE_RECOMMENDED_MOVIE: Movies.UPDATE_RECOMMENDED_MOVIE,
  TOGGLE_MOVIE_PIN: Movies.TOGGLE_MOVIE_PIN,
};

describe("recommendation item mutations publish immediately (no hidden drafts)", () => {
  for (const [name, doc] of Object.entries(mustPublish)) {
    it(`${name} sets status: PUBLISHED`, () => {
      expect(publishes(doc)).toBe(true);
    });
  }
});

// List-level create + update must also publish, or the visibility toggle / list
// edits write the draft while the published copy keeps its old Visibility — the
// change never reaches the public page (RecommendationList/*List all have D&P).
const listMustPublish: Record<string, DocumentNode> = {
  CREATE_MOVIE_LIST: Movies.CREATE_MOVIE_LIST,
  UPDATE_MOVIE_LIST: Movies.UPDATE_MOVIE_LIST,
  CREATE_GAME_LIST: Games.CREATE_GAME_LIST,
  UPDATE_GAME_LIST: Games.UPDATE_GAME_LIST,
  CREATE_APP_LIST: Apps.CREATE_APP_LIST,
  UPDATE_APP_LIST: Apps.UPDATE_APP_LIST,
  CREATE_PERSON_LIST: People.CREATE_PERSON_LIST,
  UPDATE_PERSON_LIST: People.UPDATE_PERSON_LIST,
  CREATE_PRODUCT_LIST: Products.CREATE_PRODUCT_LIST,
  UPDATE_PRODUCT_LIST: Products.UPDATE_PRODUCT_LIST,
};

describe("recommendation LIST mutations publish immediately (visibility toggle reaches the public page)", () => {
  for (const [name, doc] of Object.entries(listMustPublish)) {
    it(`${name} sets status: PUBLISHED`, () => {
      expect(publishes(doc)).toBe(true);
    });
  }
});

/*
 * The inverted half. Each entry names a category whose Strapi documents were deleted
 * because nothing executed them, and the canonical write path that replaced it — the
 * method names are listed so this file says *why* the deletion was safe, and so a
 * reviewer can check the replacement still exists rather than taking it on trust.
 */
const RETIRED = [
  {
    feature: "Books",
    modules: ["api/mutation.ts", "api/query.ts"],
    canonicalWrites: ["createMyRecommendation", "updateMyRecommendation", "createMyCollection", "updateMyCollection"],
  },
  {
    feature: "Favorites",
    modules: ["api/mutation.ts", "api/query.ts"],
    canonicalWrites: ["createMyRecommendation", "updateMyRecommendation", "createMyCollection", "updateMyCollection", "reorderMyCollection"],
  },
  {
    feature: "Guides",
    // Note the plural: this feature's modules are `mutations.ts`/`queries.ts`.
    modules: ["api/mutations.ts", "api/queries.ts"],
    // `add`/`write`, not `create`/`update` — the verbs differ from every other category.
    canonicalWrites: ["addMyGuideSection", "writeMyGuideSection", "createMyCollection", "updateMyCollection"],
  },
] as const;

const featuresRoot = resolve(__dirname, "..");

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "__tests__") walk(absolute); continue; }
      if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\.tsx?$/.test(entry.name)) found.push(absolute);
    }
  };
  walk(directory);
  return found;
}

describe("retired categories keep their Strapi write path deleted", () => {
  for (const { feature, modules, canonicalWrites } of RETIRED) {
    const directory = join(featuresRoot, feature);

    it(`${feature} has no Strapi document module`, () => {
      // A trivially-true assertion would be the failure mode here, so prove the
      // feature directory is really there before asserting things are missing from it.
      expect(existsSync(directory)).toBe(true);
      for (const module of modules) expect(existsSync(join(directory, module))).toBe(false);
    });

    it(`${feature} imports no Apollo client in shipped code`, () => {
      const offenders = sourceFiles(directory)
        .filter((file) => readFileSync(file, "utf8").includes("@apollo/client"))
        .map((file) => relative(featuresRoot, file).replaceAll("\\", "/"));
      expect(offenders).toEqual([]);
    });

    it(`${feature} writes through the canonical client instead`, () => {
      // The point of the two assertions above is that the writes moved, not that they
      // vanished. If this fails, deleting the Strapi module removed a capability.
      const text = sourceFiles(directory).map((file) => readFileSync(file, "utf8")).join("\n");
      for (const method of canonicalWrites) {
        expect(text, `${feature} must still call ${method}`).toContain(`explorersApiClient.${method}`);
      }
    });
  }
});
