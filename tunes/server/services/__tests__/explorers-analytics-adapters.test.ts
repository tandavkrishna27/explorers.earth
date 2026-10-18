import { describe, expect, it, vi } from "vitest";
import { resolveCountryFromIp } from "../explorers-analytics-adapters";
it('loads the production geoip data and resolves a public address through the default adapter',()=>{
  expect(resolveCountryFromIp('8.8.8.8')).toBe('US');
});

describe("resolveCountryFromIp", () => {
  it("returns a coarse uppercase country and rejects private/local addresses", () => {
    const lookup = vi.fn().mockReturnValue({ country: "in" });

    expect(resolveCountryFromIp("8.8.8.8", lookup)).toBe("IN");
    expect(resolveCountryFromIp("127.0.0.1", lookup)).toBeNull();
    expect(resolveCountryFromIp("10.1.2.3", lookup)).toBeNull();
    expect(resolveCountryFromIp("192.168.1.5", lookup)).toBeNull();
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
