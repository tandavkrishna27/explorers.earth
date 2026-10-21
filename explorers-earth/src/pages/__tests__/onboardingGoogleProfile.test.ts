import { describe, expect, it, vi } from "vitest";
import { applyGoogleNamePrefill, isGoogleProfilePhoto, readSessionProfile, shouldImportGooglePhoto } from "../onboardingGoogleProfile";

describe("onboarding Google profile prefill", () => {
  it("prefills the display name from the Google name", () => {
    expect(applyGoogleNamePrefill({ accountName: "", username: "" }, "  Ada Lovelace ")).toEqual({ accountName: "Ada Lovelace", username: "" });
  });

  it("never overwrites a display name the user already typed", () => {
    const form = { accountName: "Countess", username: "" };
    expect(applyGoogleNamePrefill(form, "Ada Lovelace")).toBe(form);
  });

  it("never prefills the username", () => {
    expect(applyGoogleNamePrefill({ accountName: "", username: "" }, "Ada Lovelace").username).toBe("");
  });

  it("leaves the form alone without a usable name", () => {
    const form = { accountName: "", username: "" };
    expect(applyGoogleNamePrefill(form, undefined)).toBe(form);
    expect(applyGoogleNamePrefill(form, "   ")).toBe(form);
  });

  it.each([
    ["https://lh3.googleusercontent.com/a/ACg8oc=s96-c", true],
    ["https://lh6.googleusercontent.com/a/x", true],
    ["http://lh3.googleusercontent.com/a/x", false],
    ["https://lh3.googleusercontent.com.evil.example/a/x", false],
    ["https://evil.example/a.png", false],
    ["javascript:alert(1)", false],
    ["", false],
  ])("recognises %s as a Google profile photo: %s", (url, expected) => {
    expect(isGoogleProfilePhoto(url)).toBe(expected);
  });

  it("imports the Google photo only when the user kept it and chose no photo of their own", () => {
    expect(shouldImportGooglePhoto({ googlePhoto: "https://lh3.googleusercontent.com/a/x", keepGooglePhoto: true, hasOwnPhoto: false })).toBe(true);
    expect(shouldImportGooglePhoto({ googlePhoto: "https://lh3.googleusercontent.com/a/x", keepGooglePhoto: true, hasOwnPhoto: true })).toBe(false);
    expect(shouldImportGooglePhoto({ googlePhoto: "https://lh3.googleusercontent.com/a/x", keepGooglePhoto: false, hasOwnPhoto: false })).toBe(false);
    expect(shouldImportGooglePhoto({ googlePhoto: "", keepGooglePhoto: true, hasOwnPhoto: false })).toBe(false);
  });

  it("reads the name and only a Google photo from the session", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ user: { name: "Ada", image: "https://lh3.googleusercontent.com/a/x" } })));
    expect(await readSessionProfile(fetchImpl)).toEqual({ name: "Ada", photo: "https://lh3.googleusercontent.com/a/x" });
    expect(fetchImpl).toHaveBeenCalledWith("/api/auth/get-session", { credentials: "include", cache: "no-store" });
    const other = vi.fn(async () => new Response(JSON.stringify({ user: { name: "Ada", image: "https://evil.example/a.png" } })));
    expect(await readSessionProfile(other)).toEqual({ name: "Ada", photo: "" });
  });

  it("degrades to nothing when the session cannot be read", async () => {
    expect(await readSessionProfile(async () => { throw new Error("offline"); })).toEqual({ name: "", photo: "" });
    expect(await readSessionProfile(async () => new Response("null"))).toEqual({ name: "", photo: "" });
  });
});
