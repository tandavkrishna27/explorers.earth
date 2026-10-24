import {describe, expect, it} from "vitest";
import {listLinkCommandResultSchema} from "../../../shared/explorersListLinkContract";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const l = "33333333-3333-4333-8333-333333333333";
const link = {id: l, hostCollectionId: a, hostCategory: "guides", linkedCollectionId: b, linkedCategory: "products",
  role: "Packing list", displayOrder: 0, createdAt: "2026-10-23T00:00:00.000Z"};

describe("list link command result (WP10)", () => {
  it("carries the link and both category revisions after the change", () => {
    const result = {link, attached: true, revisions: {guides: 4, products: 9}};
    expect(listLinkCommandResultSchema.parse(result)).toEqual(result);
  });

  it("is strict and needs a revision for every category the link touches", () => {
    expect(listLinkCommandResultSchema.safeParse({link, attached: false, revisions: {guides: 4}}).success).toBe(false);
    expect(listLinkCommandResultSchema.safeParse({link, attached: true, revisions: {guides: 4, products: 9}, extra: 1}).success).toBe(false);
  });
});
