import { describe, expect, it } from "vitest";
import {
  resolveTrustProxySetting,
  shouldLogRequestBody,
} from "../request-security-policy";

describe("request security policy", () => {
  it("trusts only local/private ingress proxies by default and accepts explicit CIDRs", () => {
    expect(resolveTrustProxySetting(undefined)).toEqual([
      "loopback",
      "linklocal",
      "uniquelocal",
    ]);
    expect(resolveTrustProxySetting("10.0.0.0/8, 203.0.113.10/32")).toEqual([
      "10.0.0.0/8",
      "203.0.113.10/32",
    ]);
  });

  it("rejects settings that trust every client-supplied forwarding hop", () => {
    expect(() => resolveTrustProxySetting("true")).toThrow("unsafe");
    expect(() => resolveTrustProxySetting("*")).toThrow("unsafe");
    expect(() => resolveTrustProxySetting("0.0.0.0/0")).toThrow("unsafe");
  });

  it("never logs consented analytics event bodies", () => {
    expect(shouldLogRequestBody("/api/explorers/analytics/events")).toBe(false);
    expect(shouldLogRequestBody("/api/playlist/test")).toBe(true);
  });
});
