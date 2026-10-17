import { describe, expect, it } from "vitest";
import { parseMusicPublicationResponse, type MusicPublicationMode } from "./musicPublicationContract";

const slug = "owner-slug";
const capability = "C".repeat(43);

function response(mode: MusicPublicationMode): Record<string, unknown> {
  return {
    version: "music-publication/v1",
    publication: { mode, publicSlug: slug },
    ...(mode === "unlisted" ? { capability } : {}),
  };
}

describe("conditional Music publication response contract", () => {
  it("accepts each exact request-matched response shape", () => {
    expect(parseMusicPublicationResponse(response("private"), "private")).toEqual(response("private"));
    expect(parseMusicPublicationResponse(response("public"), "public")).toEqual(response("public"));
    expect(parseMusicPublicationResponse(response("unlisted"), "unlisted")).toEqual(response("unlisted"));
  });

  it.each([
    null,
    "not-an-object",
    [],
    { version: "music-publication/v1", publication: { mode: "public", publicSlug: slug }, wrong: true },
    { publication: { mode: "public", publicSlug: slug }, extra: true },
  ])("rejects a non-object or inexact response root %#", (value) => {
    expect(() => parseMusicPublicationResponse(value, "public")).toThrow("invalid response");
  });

  it.each([
    { version: "wrong", publication: { mode: "public", publicSlug: slug } },
    { version: "music-publication/v1", publication: null },
    { version: "music-publication/v1", publication: "wrong" },
    { version: "music-publication/v1", publication: [] },
    { version: "music-publication/v1", publication: { mode: "public", wrong: slug } },
    { version: "music-publication/v1", publication: { mode: "private", publicSlug: slug } },
    { version: "music-publication/v1", publication: { mode: "public", publicSlug: 7 } },
    { version: "music-publication/v1", publication: { mode: "public", publicSlug: "short" } },
  ])("rejects invalid publication metadata %#", (value) => {
    expect(() => parseMusicPublicationResponse(value, "public")).toThrow("invalid response");
  });

  it.each([
    { version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: slug } },
    { version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: slug }, capability: 7 },
    { version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: slug }, capability: "short" },
  ])("requires an exact 256-bit unlisted capability %#", (value) => {
    expect(() => parseMusicPublicationResponse(value, "unlisted")).toThrow("invalid response");
  });
});
