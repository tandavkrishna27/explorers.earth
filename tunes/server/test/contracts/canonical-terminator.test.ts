import { describe, expect, it } from "vitest";
import { resolveTrustedProxy } from "../../middleware/canonicalTerminator";

describe("canonical trust proxy", () => {
  it("trusts exactly one configured address, never every upstream", () => {
    // Break caught: `trust proxy: true` ships and X-Forwarded-For becomes
    // attacker-controlled for anything keyed on request.ip.
    const trusted = resolveTrustedProxy({ EXPLORERS_TRUSTED_PROXY_IP: "172.31.250.2" });
    expect(typeof trusted).toBe("function");
    expect((trusted as (peer: string) => boolean)("172.31.250.2")).toBe(true);
    expect((trusted as (peer: string) => boolean)("::ffff:172.31.250.2")).toBe(true);
    expect((trusted as (peer: string) => boolean)("[172.31.250.2]")).toBe(true);
    expect((trusted as (peer: string) => boolean)("172.31.250.3")).toBe(false);
  });

  it("still reads the variable the running compose file sets today", () => {
    // Break caught: the rename lands before docker-compose.yml is updated and
    // the deployed app silently stops trusting its only reverse proxy.
    const trusted = resolveTrustedProxy({ MUSIC_TRUSTED_PROXY_IP: "172.31.250.2" });
    expect((trusted as (peer: string) => boolean)("172.31.250.2")).toBe(true);
  });

  it("refuses a non-IP value and trusts nothing when unset", () => {
    expect(() => resolveTrustedProxy({ EXPLORERS_TRUSTED_PROXY_IP: "traefik" })).toThrow();
    expect(resolveTrustedProxy({})).toBe(false);
  });
});
