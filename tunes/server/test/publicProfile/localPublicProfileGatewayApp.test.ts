import { afterEach, describe, expect, it } from "vitest";
import { createLocalPublicProfileGatewayApp, startLocalPublicProfileGateway } from "../../publicProfile/localPublicProfileGatewayApp";
import type { LocalPublicProfileGatewayConfig } from "../../config/local-public-profile-gateway";
import type { PublicProfileGateway } from "../../publicProfile/publicProfileService";
import { createLoopbackSupertestScope } from "../helpers/loopback-supertest";

const loopback = createLoopbackSupertestScope();
afterEach(async () => loopback.closeAll());

const config: LocalPublicProfileGatewayConfig = {
  host: "127.0.0.1",
  port: 5001,
  origin: "https://api.localqr.earth",
  tokenFile: "C:\\private\\public-profile-reader",
  allowedOrigins: ["http://localhost:5174", "http://127.0.0.1:5174"],
};

const gateway: PublicProfileGateway = {
  resolveAccount: async () => ({ username: "tk2727", public_profile: "Yes", public_recommendations: true }),
  resolveCategory: async () => ({ recommendationLists: [] }),
  resolveDetail: async () => ({ recommendationLists: [] }),
};

describe("local public profile gateway application", () => {
  it("serves public profiles but no unrelated Tunes route", async () => {
    const app = createLocalPublicProfileGatewayApp(config, gateway);
    const { request } = await loopback.open({ app });
    await request.get("/health/live").expect(200).expect({ status: "ok" });
    await request.get("/api/explorers/v1/profiles/tk2727").expect(200).expect({ username: "tk2727", public_profile: "Yes", public_recommendations: true });
    await request.get("/api/music-entry/status").expect(404);
  });

  it("allows only the configured local browser origins", async () => {
    const app = createLocalPublicProfileGatewayApp(config, gateway);
    const { request } = await loopback.open({ app });
    for (const origin of config.allowedOrigins) {
      const allowed = await request.get("/health/live").set("Origin", origin).expect(200);
      expect(allowed.headers["access-control-allow-origin"]).toBe(origin);
    }
    const denied = await request.get("/health/live").set("Origin", "https://example.com").expect(200);
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers an allowed cache-bypass preflight so browser Retry can reach the profile read", async () => {
    const app = createLocalPublicProfileGatewayApp(config, gateway);
    const { request } = await loopback.open({ app });
    const response = await request
      .options("/api/explorers/v1/profiles/tk2727")
      .set("Origin", "http://localhost:5174")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "cache-control,if-none-match")
      .expect(204);

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5174");
    expect(response.headers["access-control-allow-methods"]).toContain("GET");
    expect(response.headers["access-control-allow-headers"]).toContain("Cache-Control");
    expect(response.headers["access-control-allow-headers"]).toContain("If-None-Match");
  });

  it("does not listen when protected token resolution fails", async () => {
    await expect(startLocalPublicProfileGateway(config, {
      readToken: async () => { throw new Error("refused"); },
      createGateway: () => gateway,
    })).rejects.toThrow("LOCAL_PUBLIC_PROFILE_GATEWAY_REFUSED");
  });
});
