import { describe, expect, it } from "vitest";
import { parseLocalPublicProfileGatewayArguments } from "../../../scripts/public-profile-local";

describe("local public profile gateway command", () => {
  it("requires one protected token file and uses the loopback default port", () => {
    expect(parseLocalPublicProfileGatewayArguments(["--token-file", "C:\\private\\reader"])).toEqual({
      tokenFile: "C:\\private\\reader",
      port: 5001,
    });
  });

  it.each([
    [],
    ["--token-file", "relative"],
    ["--port", "5002"],
    ["--token-file", "C:\\private\\reader", "--port", "80"],
    ["--token-file", "C:\\private\\reader", "--unexpected"],
  ])("rejects ambiguous launcher arguments", (args) => {
    expect(() => parseLocalPublicProfileGatewayArguments(args)).toThrow("LOCAL_PUBLIC_PROFILE_GATEWAY_ARGUMENTS");
  });
});
