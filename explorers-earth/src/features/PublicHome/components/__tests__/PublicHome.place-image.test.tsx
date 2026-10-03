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

const s3 = (name: string) => `https://saved-media.s3.amazonaws.com/${name}`;

describe("public Place saved-media resolution", () => {
  beforeEach(() => {
    categoryResults.clear();
  });

  it("uses saved item media ahead of every other Place image source", () => {
    expect(
      resolvePublicPlaceImage({
        itemMedia: [{ url: s3("item-media.jpg") }],
        itemThumbnail: { url: s3("item-thumbnail.jpg") },
        itemPhotos: [s3("item-photo.jpg")],
        parentListThumbnail: s3("list-thumbnail.jpg"),
      }),
    ).toBe(s3("item-media.jpg"));
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
        parentListThumbnail: s3("list-thumbnail.jpg"),
      }),
    ).toBe(s3("list-thumbnail.jpg"));
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

  it("uses saved item media for the Places profile shelf before its list thumbnail", () => {
    categoryResults.set("places", {
      data: {
        recommendationLists: [
          {
            documentId: "list-1",
            List_Name: "Places list",
            slug: "places-list",
            Visibility: true,
            List_Name_Details: { thumbnail: s3("list-thumbnail.jpg") },
            recommended_places: [
              {
                documentId: "place-1",
                Media: [{ url: s3("item-media.jpg") }],
                media_details: {
                  thumbnail: { url: s3("item-thumbnail.jpg") },
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
      s3("item-media.jpg"),
    );
  });
});
