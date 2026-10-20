import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createRecommendationSchema } from "../../../../../../tunes/shared/explorersContract";
import { emptyPlaceContext } from "../../../../../../tunes/shared/explorersPlaceContract";
import { useRecommendationFields } from "../useRecommedationFields";
import { useTaggableFields } from "../useTaggableFields";

const person = { recommendationType: "person" as const };
const valid = { recommendation: "@someone", contactName: "Asha" };

describe("person recommendations need a name", () => {
  it("rejects a person without a name and accepts one with a name", async () => {
    const { result } = renderHook(() => useRecommendationFields(person as never));
    await expect(result.current.validationSchema.validate({ ...valid, contactName: "" })).rejects.toThrow();
    await expect(result.current.validationSchema.validate({ ...valid, contactName: "   " })).rejects.toThrow();
    await expect(result.current.validationSchema.validate(valid)).resolves.toBeTruthy();
  });

  it("shows the name field from the start and as a required field", () => {
    const { result } = renderHook(() => useRecommendationFields(person as never));
    const field = result.current.formFields.find((candidate: { name: string }) => candidate.name === "contactName");
    expect(field?.isRequired).toBe(true);
    const tags = renderHook(() => useTaggableFields({ type: "add", recommendationType: "person" } as never)).result.current;
    expect(tags.activeFields).toContain("contactName");
    expect(tags.taggableFields).not.toContain("contactName");
  });

  it("keeps the server contract from accepting a nameless person", () => {
    const base = { category: "places", entityId: "00000000-0000-4000-8000-000000000001", collectionId: "00000000-0000-4000-8000-000000000002", expectedCollectionRevision: 1 };
    const context = (contactName: string | null) => ({ ...emptyPlaceContext(), recommendationType: "person" as const, contactName });
    expect(createRecommendationSchema.safeParse({ ...base, placeContext: context(null) }).success).toBe(false);
    expect(createRecommendationSchema.safeParse({ ...base, placeContext: context("  ") }).success).toBe(false);
    expect(createRecommendationSchema.safeParse({ ...base, placeContext: context("Asha") }).success).toBe(true);
    expect(createRecommendationSchema.safeParse({ ...base, placeContext: { ...emptyPlaceContext(), contactName: null } }).success).toBe(true);
  });
});
