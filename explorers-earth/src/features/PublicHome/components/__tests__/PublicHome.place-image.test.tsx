import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_CONFIG } from "../../../../config";
import { resolvePublicPlaceImage } from "../publicPlaceMedia";
import ProfileRecommendationsTab from "../ProfileRecommendationsTab";

const { categoryResults } = vi.hoisted(() => ({
  categoryResults: new Map<string, any>(),
}));

vi.mock("../../api/usePublicRecommendationCategory", () => ({
  usePublicRecommendationCategory: (_username: string, category: string) =>
    categoryResults.get(category) || {
      data: undefined,
      loading: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, options?: any) =>
      typeof options === "string"
        ? options
        : options?.defaultValue || _key,
  }),
}));

/*
 * Ticket 7.1. These cases used to build `https://saved-media.s3.amazonaws.com/...` URLs,
 * because `resolveSavedMediaUrl` admitted any `*.amazonaws.com` host and the Strapi origin
 * as well as the canonical media route. That allowance was the visibility bypass the 7.1
 * review named: the media route is where visibility is applied, so a direct S3 URL skipped
 * the gate and hiding a place's only public attachment did not deny its bytes.
 *
 * The boundary is closed, so "saved media" here is the shape the canonical projection
 * actually emits - `/api/explorers/v1/media/{uuid}/content` and nothing else. Every
 * behaviour the S3 URLs were standing in for is unchanged: which source wins, what the
 * fallback chain does, and that untrusted hosts are refused. `rejected` below adds the
 * shapes that are now refused and used not to be.
 */
const saved = (slot: string) => `/api/explorers/v1/media/${slot}/content`;
const MEDIA_IDS = {
  itemMedia: "11111111-1111-4111-8111-111111111111",
  itemThumbnail: "22222222-2222-4222-8222-222222222222",
  itemPhoto: "33333333-3333-4333-8333-333333333333",
  listThumbnail: "44444444-4444-4444-8444-444444444444",
} as const;
const s3 = (name: string) => `https://saved-media.s3.amazonaws.com/${name}`;

describe("public Place saved-media resolution", () => {
  beforeEach(() => {
    categoryResults.clear();
  });

  it("uses saved item media ahead of every other Place image source", () => {
    expect(
      resolvePublicPlaceImage({
        itemMedia: [{ url: saved(MEDIA_IDS.itemMedia) }],
        itemThumbnail: { url: saved(MEDIA_IDS.itemThumbnail) },
        itemPhotos: [saved(MEDIA_IDS.itemPhoto)],
        parentListThumbnail: saved(MEDIA_IDS.listThumbnail),
      }),
    ).toBe(saved(MEDIA_IDS.itemMedia));
  });

  it("accepts only the same-origin canonical media content route", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(resolvePublicPlaceImage({ itemMedia: `/api/explorers/v1/media/${id}/content` }))
      .toBe(`/api/explorers/v1/media/${id}/content`);
    expect(resolvePublicPlaceImage({ itemMedia: `/api/explorers/v1/media/${id}/content/extra` }))
      .toBe(IMAGE_CONFIG.defaultImages.place);
    expect(resolvePublicPlaceImage({ itemMedia: `https://evil.example/api/explorers/v1/media/${id}/content` }))
      .toBe(IMAGE_CONFIG.defaultImages.place);
  });

  it("falls back from absent item media to the stored parent-list thumbnail", () => {
    expect(
      resolvePublicPlaceImage({
        itemMedia: [],
        itemThumbnail: null,
        itemPhotos: [],
        parentListThumbnail: saved(MEDIA_IDS.listThumbnail),
      }),
    ).toBe(saved(MEDIA_IDS.listThumbnail));
  });

  it("uses the generic local image when neither item nor parent has saved media", () => {
    expect(resolvePublicPlaceImage({})).toBe(IMAGE_CONFIG.defaultImages.place);
  });

  it("rejects untrusted external images instead of making a public third-party request", () => {
    expect(
      resolvePublicPlaceImage({
        itemMedia: [{ url: "https://images.example/item.jpg" }],
        itemThumbnail: { url: "https://places.googleapis.com/photo.jpg" },
        itemPhotos: ["https://maps.googleapis.com/photo.jpg"],
        parentListThumbnail: "https://search.example/list.jpg",
      }),
    ).toBe(IMAGE_CONFIG.defaultImages.place);
  });

  it("refuses the S3 and Strapi media shapes that used to bypass the media route", () => {
    // The bypass itself. `publicPlacesProjection` emits only `mediaUrl(id)` for every
    // source this function reads, so nothing renders by these shapes - but admitting them
    // meant a caller holding a stored S3 URL could serve bytes the media route would have
    // denied. Each is asserted individually so a partial re-opening cannot pass.
    for (const bypass of [
      s3("item-media.jpg"),
      "https://s3.amazonaws.com/bucket/item.jpg",
      "https://bucket.s3.eu-west-1.amazonaws.com/item.jpg",
      "/uploads/legacy-item.jpg",
      "http://localhost:1337/uploads/legacy-item.jpg",
    ]) {
      expect(resolvePublicPlaceImage({ itemMedia: bypass }), bypass)
        .toBe(IMAGE_CONFIG.defaultImages.place);
    }
  });

  it("refuses a bypass in every source slot, not only the first", () => {
    // The fallback chain tries four sources in turn, so a boundary that held only for
    // itemMedia would still serve a bypassed thumbnail.
    expect(
      resolvePublicPlaceImage({
        itemMedia: [{ url: s3("a.jpg") }],
        itemThumbnail: { url: s3("b.jpg") },
        itemPhotos: [s3("c.jpg")],
        parentListThumbnail: "/uploads/d.jpg",
      }),
    ).toBe(IMAGE_CONFIG.defaultImages.place);
  });

  it("falls through a refused source to a canonical one later in the chain", () => {
    // A place whose item media is a stale S3 URL but whose list cover is canonical should
    // show the cover, not the default - the boundary refuses a source, it does not abandon
    // the chain.
    expect(
      resolvePublicPlaceImage({
        itemMedia: [{ url: s3("stale.jpg") }],
        parentListThumbnail: saved(MEDIA_IDS.listThumbnail),
      }),
    ).toBe(saved(MEDIA_IDS.listThumbnail));
  });

  it("uses saved item media for the Places profile shelf before its list thumbnail", () => {
    categoryResults.set("places", {
      data: {
        recommendationLists: [
          {
            documentId: "list-1",
            List_Name: "Places list",
            slug: "places-list",
            Visibility: true,
            List_Name_Details: { thumbnail: saved(MEDIA_IDS.listThumbnail) },
            recommended_places: [
              {
                documentId: "place-1",
                Media: [{ url: saved(MEDIA_IDS.itemMedia) }],
                media_details: {
                  thumbnail: { url: saved(MEDIA_IDS.itemThumbnail) },
                },
                Place_Details: { Photos: [] },
              },
            ],
          },
        ],
      },
      loading: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    });

    render(
      <MemoryRouter>
        <ProfileRecommendationsTab
          username="alice"
          accountData={{
            public_recommendations: "Yes",
            public_music: "No",
            public_movie: "No",
            public_books: "No",
            public_guides: "No",
            public_games: "No",
            public_apps: "No",
            public_products: "No",
            public_people: "No",
          }}
        />
      </MemoryRouter>,
    );

    const card = screen.getByRole("link", { name: "Places list" });
    expect(card.querySelector("img")).toHaveAttribute(
      "src",
      saved(MEDIA_IDS.itemMedia),
    );
  });

  /*
   * The same canonical media route, on the other eight shelves.
   *
   * Places resolve their image through `publicPlaceMedia.ts`, which was hardened to admit
   * only this route. Every other category on this tab goes through the component's own
   * `resolveCoverUrl`, which was still Strapi-era: it prefixed any path starting with "/"
   * with the Strapi origin, and for a movie shelf prepended TMDB's host instead.
   *
   * Every canonical projection emits exactly this shape for a cover -
   * `publicBooksProjection.ts:62`, `publicMoviesProjection.ts:89`,
   * `publicAppsProjection.ts:81`, `publicProductsProjection.ts:95,119`,
   * `publicPeopleProjection.ts:97,121`, `publicGuidesProjection.ts:94` - so on the
   * canonical runtime this was every cover image on a public profile, pointed at the wrong
   * host.
   */
  it.each([
    ["books", "bookLists", "public_books", "List_Name"],
    ["movies", "movieLists", "public_movie", "List_Name"],
  ] as const)(
    "leaves a canonical %s cover on this origin instead of the Strapi or provider host",
    (category, listKey, visibilityFlag, titleKey) => {
      categoryResults.set(category, {
        data: {
          [listKey]: [{
            documentId: `${category}-1`,
            [titleKey]: "Shelf",
            slug: "shelf",
            visibility: true,
            Visibility: true,
            cover_image: { url: saved(MEDIA_IDS.itemMedia) },
          }],
        },
        loading: false,
        error: null,
        refetch: vi.fn().mockResolvedValue(undefined),
      });

      render(
        <MemoryRouter>
          <ProfileRecommendationsTab
            username="alice"
            accountData={{
              public_recommendations: "No",
              public_music: "No",
              public_movie: "No",
              public_books: "No",
              public_guides: "No",
              public_games: "No",
              public_apps: "No",
              public_products: "No",
              public_people: "No",
              [visibilityFlag]: "Yes",
            }}
          />
        </MemoryRouter>,
      );

      const card = screen.getByRole("link", { name: "Shelf" });
      expect(card.querySelector("img")).toHaveAttribute("src", saved(MEDIA_IDS.itemMedia));
    },
  );
});
