import {describe, expect, it} from "vitest";
import {attachListLinkSchema, listLinkRoleSchema, reorderListLinksSchema, LIST_LINK_LIMIT} from "../../../shared/explorersListLinkContract";
const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
describe("list link contract (LNK-01/08)", () => {
  it("trims roles and treats blank as no role", () => {
    expect(listLinkRoleSchema.parse("  Packing list ")).toBe("Packing list");
    expect(listLinkRoleSchema.parse("   ")).toBeNull();
    expect(listLinkRoleSchema.safeParse("x".repeat(81)).success).toBe(false);
  });
  it("refuses a self link and defaults the role to null", () => {
    expect(attachListLinkSchema.safeParse({hostCollectionId: id(1), expectedHostRevision: 1, linkedCollectionId: id(1), expectedLinkedRevision: 1}).success).toBe(false);
    expect(attachListLinkSchema.parse({hostCollectionId: id(1), expectedHostRevision: 1, linkedCollectionId: id(2), expectedLinkedRevision: 1}).role).toBeNull();
  });
  it("bounds and de-duplicates a reorder", () => {
    expect(LIST_LINK_LIMIT).toBe(100);
    expect(reorderListLinksSchema.safeParse({hostCollectionId: id(1), expectedHostRevision: 1, linkIds: [id(2), id(2)]}).success).toBe(false);
  });
});
