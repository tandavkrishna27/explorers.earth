import { describe, expect, it } from "vitest";
import { selectPlaceCardImage } from "../placeMedia";

describe("selectPlaceCardImage", () => {
  it("uses the item's saved thumbnail ahead of every fallback", () => {
    expect(
      selectPlaceCardImage({
        media_details: { thumbnail: { url: "/uploads/item-thumbnail.jpg" } },
        Media: [{ url: "/uploads/item-media.jpg" }],
      }, "/uploads/list-thumbnail.jpg", "/generic-place.jpg"),
    ).toBe("/uploads/item-thumbnail.jpg");
  });

  it("uses an item's saved media when no thumbnail metadata exists", () => {
    expect(
      selectPlaceCardImage(
        { media_details: { imageDetails: [{ url: "/uploads/item-detail.jpg" }] } },
        "/uploads/list-thumbnail.jpg",
        "/generic-place.jpg",
      ),
    ).toBe("/uploads/item-detail.jpg");
  });

  it("uses the parent list thumbnail when the item has no saved media", () => {
    expect(
      selectPlaceCardImage({}, "/uploads/list-thumbnail.jpg", "/generic-place.jpg"),
    ).toBe("/uploads/list-thumbnail.jpg");
  });

  it("uses the generic image only when neither item nor list has media", () => {
    expect(selectPlaceCardImage({}, undefined, "/generic-place.jpg")).toBe(
      "/generic-place.jpg",
    );
  });
});
