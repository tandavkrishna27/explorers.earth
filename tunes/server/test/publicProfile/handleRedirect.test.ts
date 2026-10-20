import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { setupExplorersPublicProfileRoutes } from "../../routes/explorersPublicProfileRoutes";
import { handleRedirectMarker, movedHandle, redirectLocation } from "../../publicProfile/handleRedirect";
import { PublicProfileService, type PublicProfileGateway } from "../../publicProfile/publicProfileService";
import { createLoopbackSupertestScope } from "../helpers/loopback-supertest";

const loopback = createLoopbackSupertestScope();
afterEach(async () => loopback.closeAll());

describe("handle redirect marker", () => {
  it("round-trips and ignores anything else", () => {
    expect(movedHandle(handleRedirectMarker("new-handle"))).toBe("new-handle");
    for (const other of [undefined, null, {}, { username: "x" }, { version: "other", username: "x" }, { username: "public_profile" }])
      expect(movedHandle(other)).toBeUndefined();
  });
  it("swaps only the handle in the request path and keeps the rest, query included", () => {
    const base = "/api/explorers/v1/profiles";
    expect(redirectLocation(`${base}/Old`, "new")).toBe(`${base}/new`);
    expect(redirectLocation(`${base}/old/recommendations/places?limit=5&cursor=o10`, "new")).toBe(`${base}/new/recommendations/places?limit=5&cursor=o10`);
    expect(redirectLocation(`${base}/old/recommendations/places/a-list`, "new")).toBe(`${base}/new/recommendations/places/a-list`);
    expect(redirectLocation(`${base}/old?x=1`, "new")).toBe(`${base}/new?x=1`);
  });
});

describe("public profile service for a handle that moved", () => {
  const account = { documentId: "a", username: "new", public_profile: "Yes" };
  const gateway = (overrides: Partial<PublicProfileGateway> = {}): PublicProfileGateway => ({
    resolveAccount: async (username) => (username === "new" ? account : undefined),
    resolveCategory: async () => undefined, resolveDetail: async () => undefined,
    resolveHandleRedirect: async (username) => (username === "old" ? "new" : undefined),
    ...overrides,
  });
  it("answers the old handle with the redirect marker and the new one with the profile", async () => {
    const service = new PublicProfileService(gateway(), { ttlMs: 0 });
    expect(movedHandle(await service.shell("old"))).toBe("new");
    expect(await service.shell("new")).toBe(account);
    expect(await service.shell("never-held")).toBeUndefined();
  });
  it("is a plain miss where the gateway has no hold concept", async () => {
    const service = new PublicProfileService(gateway({ resolveHandleRedirect: undefined }), { ttlMs: 0 });
    expect(await service.shell("old")).toBeUndefined();
  });
});

describe("public profile routes for a handle that moved", () => {
  const dependencies = () => {
    const shell = async (username: string) => (username === "old" ? handleRedirectMarker("new") : username === "new" ? { username: "new", public_profile: "Yes" } : undefined);
    return { shell, category: async (username: string) => (username === "new" ? { lists: [] } : undefined),
      detail: async (username: string) => (username === "new" ? { list: {} } : undefined) };
  };
  it("redirects the shell, a category and a detail permanently to the same resource under the new handle", async () => {
    const app = express();
    setupExplorersPublicProfileRoutes(app, dependencies());
    const { request } = await loopback.open({ app });
    const shell = await request.get("/api/explorers/v1/profiles/old").redirects(0).expect(308);
    expect(shell.headers.location).toBe("/api/explorers/v1/profiles/new");
    const category = await request.get("/api/explorers/v1/profiles/old/recommendations/places?limit=3").redirects(0).expect(308);
    expect(category.headers.location).toBe("/api/explorers/v1/profiles/new/recommendations/places?limit=3");
    const detail = await request.get("/api/explorers/v1/profiles/old/recommendations/places/my-list").redirects(0).expect(308);
    expect(detail.headers.location).toBe("/api/explorers/v1/profiles/new/recommendations/places/my-list");
  });
  it("follows to the new profile, and never redirects the new handle or an unknown one", async () => {
    const app = express();
    setupExplorersPublicProfileRoutes(app, dependencies());
    const { request } = await loopback.open({ app });
    await request.get("/api/explorers/v1/profiles/old").redirects(1).expect(200).expect({ username: "new", public_profile: "Yes" });
    await request.get("/api/explorers/v1/profiles/new").redirects(0).expect(200);
    await request.get("/api/explorers/v1/profiles/nobody").redirects(0).expect(404);
    await request.get("/api/explorers/v1/profiles/nobody/recommendations/places").redirects(0).expect(404);
  });
});
