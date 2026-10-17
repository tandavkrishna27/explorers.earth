import { describe, expect, it } from "vitest";
import { resolvePublicProfileGatewayConfig } from "../../config/public-profile-gateway-config";

const live = {
  MUSIC_MODE: "live",
  EXPLORERS_PUBLIC_PROFILE_GATEWAY_ENABLED: "true",
  STRAPI_PUBLIC_PROFILE_READ_TOKEN: "server_only_public_profile_read_token_123456",
  ALLOWED_ORIGINS: "https://explorers.earth,https://localtunes.earth",
};

describe("public profile gateway runtime configuration", () => {
  it("fails closed when the enabled production gateway lacks its dedicated server token", () => {
    expect(() => resolvePublicProfileGatewayConfig({ ...live, STRAPI_PUBLIC_PROFILE_READ_TOKEN: "" })).toThrow("STRAPI_PUBLIC_PROFILE_READ_TOKEN");
  });

  it("requires the Explorers production origin when the gateway is enabled", () => {
    expect(() => resolvePublicProfileGatewayConfig({ ...live, ALLOWED_ORIGINS: "https://localtunes.earth" })).toThrow("ALLOWED_ORIGINS");
  });

  it("does not make an unconfigured local runtime unusable", () => {
    expect(resolvePublicProfileGatewayConfig({ MUSIC_MODE: "live", EXPLORERS_PUBLIC_PROFILE_GATEWAY_ENABLED: "false" })).toEqual({ enabled: false });
  });

  it("returns only the enabled runtime credential to the server composition", () => {
    expect(resolvePublicProfileGatewayConfig(live)).toEqual({ enabled: true, token: live.STRAPI_PUBLIC_PROFILE_READ_TOKEN });
  });
});
