import { describe, expect, it } from "vitest";
import { isCanonicalMediaPath } from "../canonicalMedia";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("isCanonicalMediaPath", () => {
  it("accepts the shape every canonical projection emits", () => {
    expect(isCanonicalMediaPath(`/api/explorers/v1/media/${uuid}/content`)).toBe(true);
  });

  it("accepts an upper-case uuid, because the route matches case-insensitively", () => {
    expect(isCanonicalMediaPath(`/api/explorers/v1/media/${uuid.toUpperCase()}/content`)).toBe(true);
  });

  it.each([
    ["a query string", `/api/explorers/v1/media/${uuid}/content?w=185`],
    ["a fragment", `/api/explorers/v1/media/${uuid}/content#x`],
    ["a trailing segment", `/api/explorers/v1/media/${uuid}/content/extra`],
    ["a missing /content", `/api/explorers/v1/media/${uuid}`],
    ["a non-uuid id", "/api/explorers/v1/media/not-a-uuid/content"],
    ["another api route", "/api/explorers/v1/accounts/me"],
    ["a legacy Strapi upload", "/uploads/cover.jpg"],
    ["an absolute url on this path", `https://explorers.earth/api/explorers/v1/media/${uuid}/content`],
    ["a TMDB poster path", "/abcdef.jpg"],
  ])("refuses %s", (_label, value) => {
    expect(isCanonicalMediaPath(value)).toBe(false);
  });

  it.each([[null], [undefined], [42], [{}], [[]]])("refuses the non-string %s", (value) => {
    expect(isCanonicalMediaPath(value)).toBe(false);
  });

  /*
   * A prefix match would accept every row above that starts with the route, so the exact
   * match is the assertion that matters here, not an implementation detail.
   */
  it("does not merely prefix-match", () => {
    expect(isCanonicalMediaPath(`/api/explorers/v1/media/${uuid}/content.jpg`)).toBe(false);
  });
});
