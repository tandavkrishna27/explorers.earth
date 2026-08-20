import { describe, it, expect } from "vitest";
import { print, type DocumentNode } from "graphql";

// Every write to a Recommended* item must target the PUBLISHED version. Strapi
// returns only published entries by default, so an item created/updated without
// `status: PUBLISHED` is written as a draft and never appears on the public page.
// This contract test guards against that regression across all categories.
import * as Books from "../Books/api/mutation";
import * as Games from "../Games/api/mutation";
import * as Apps from "../AppsAndTools/api/mutation";
import * as People from "../People/api/mutation";
import * as Products from "../Products/api/mutation";
import * as Movies from "../Movies/api/mutation";
import * as Favorites from "../Favorites/api/mutation";
import * as Guides from "../Guides/api/mutations";

const publishes = (doc: DocumentNode): boolean =>
  /status:\s*PUBLISHED/.test(print(doc));

const mustPublish: Record<string, DocumentNode> = {
  // Books
  CREATE_RECOMMENDED_BOOK: Books.CREATE_RECOMMENDED_BOOK,
  UPDATE_RECOMMENDED_BOOK: Books.UPDATE_RECOMMENDED_BOOK,
  TOGGLE_BOOK_PIN: Books.TOGGLE_BOOK_PIN,
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
  // Places / Favorites (place + legacy person-via-place item writes)
  CreateRecommendedPlaceMutation: Favorites.CreateRecommendedPlaceMutation,
  updateRecommendationPlaceMutation: Favorites.updateRecommendationPlaceMutation,
  CreateRecommendedPersonMutation: Favorites.CreateRecommendedPersonMutation,
  updateRecommendedPersonMutation: Favorites.updateRecommendedPersonMutation,
  // Guides (section create + update)
  CREATE_GUIDE_SECTION_MUTATION: Guides.CREATE_GUIDE_SECTION_MUTATION,
  UPDATE_GUIDE_SECTION_MUTATION: Guides.UPDATE_GUIDE_SECTION_MUTATION,
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
  CREATE_BOOK_LIST: Books.CREATE_BOOK_LIST,
  UPDATE_BOOK_LIST: Books.UPDATE_BOOK_LIST,
  CREATE_GAME_LIST: Games.CREATE_GAME_LIST,
  UPDATE_GAME_LIST: Games.UPDATE_GAME_LIST,
  CREATE_APP_LIST: Apps.CREATE_APP_LIST,
  UPDATE_APP_LIST: Apps.UPDATE_APP_LIST,
  CREATE_PERSON_LIST: People.CREATE_PERSON_LIST,
  UPDATE_PERSON_LIST: People.UPDATE_PERSON_LIST,
  CREATE_PRODUCT_LIST: Products.CREATE_PRODUCT_LIST,
  UPDATE_PRODUCT_LIST: Products.UPDATE_PRODUCT_LIST,
  // Places (Favorites) — list create + both list updates (the visibility toggle)
  createRecommendationLinkMutation: Favorites.createRecommendationLinkMutation,
  createRecommendationCategoryMutation: Favorites.createRecommendationCategoryMutation,
  updateRecommendationListVisiblity: Favorites.updateRecommendationListVisiblity,
  updateRecommendedListMutation: Favorites.updateRecommendedListMutation,
  // Guides (guide create + update)
  CREATE_GUIDE_MUTATION: Guides.CREATE_GUIDE_MUTATION,
  UPDATE_GUIDE_MUTATION: Guides.UPDATE_GUIDE_MUTATION,
};

describe("recommendation LIST mutations publish immediately (visibility toggle reaches the public page)", () => {
  for (const [name, doc] of Object.entries(listMustPublish)) {
    it(`${name} sets status: PUBLISHED`, () => {
      expect(publishes(doc)).toBe(true);
    });
  }
});
