import { describe, expect, it } from "vitest";
import { resolveLocalPublicProfileGatewayConfig } from "../../config/local-public-profile-gateway";

const valid = {
  host: "127.0.0.1",
  port: 5001,
  origin: "https://api.localqr.earth",
  tokenFile: "C:\\private\\public-profile-reader",
  allowedOrigins: ["http://localhost:5174", "http://127.0.0.1:5174"],
};

describe("local public profile gateway configuration", () => {
  it("accepts only the fixed loopback and Strapi configuration", () => {
    expect(resolveLocalPublicProfileGatewayConfig(valid)).toEqual(valid);
  });

  it.each([
    { ...valid, host: "0.0.0.0" },
    { ...valid, port: 80 },
    { ...valid, port: 65536 },
    { ...valid, origin: "http://77.42.95.255:1337" },
    { ...valid, tokenFile: "reader-token" },
    { ...valid, allowedOrigins: ["http://localhost:5174", "https://example.com"] },
    { ...valid, allowedOrigins: ["http://localhost:5174", "http://localhost:5174"] },
  ])("refuses unsafe local gateway configuration", (input) => {
    expect(() => resolveLocalPublicProfileGatewayConfig(input)).toThrow("LOCAL_PUBLIC_PROFILE_GATEWAY");
  });
});
