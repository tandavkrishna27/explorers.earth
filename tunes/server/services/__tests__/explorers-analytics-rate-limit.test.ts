import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { InMemoryAnalyticsRateLimiter } from "../explorers-analytics-rate-limit";

const requestFrom = (ip: string, remoteAddress = "10.0.0.8") =>
  ({ ip, socket: { remoteAddress } }) as Request;

describe("InMemoryAnalyticsRateLimiter", () => {
  it("limits by Express's trusted client IP and account", () => {
    let now = 1_000;
    const limiter = new InMemoryAnalyticsRateLimiter(2, 60_000, 100, () => now);
    const request = {
      ip: "203.0.113.1",
      socket: { remoteAddress: "10.0.0.8" },
      headers: { "x-forwarded-for": "203.0.113.1" },
    } as unknown as Request;

    expect(limiter.allow(request, "account-1")).toBe(true);
    expect(limiter.allow(request, "account-1")).toBe(true);
    expect(limiter.allow(request, "account-1")).toBe(false);
    expect(limiter.allow(request, "account-2")).toBe(true);

    now += 60_001;
    expect(limiter.allow(request, "account-1")).toBe(true);
  });

  it("keeps clients behind the same trusted ingress independent", () => {
    const limiter = new InMemoryAnalyticsRateLimiter(1);
    expect(limiter.allow(requestFrom("203.0.113.1"), "account-1")).toBe(true);
    expect(limiter.allow(requestFrom("203.0.113.1"), "account-1")).toBe(false);
    expect(limiter.allow(requestFrom("203.0.113.2"), "account-1")).toBe(true);
  });

  it("falls back to the socket peer when Express has no resolved IP", () => {
    const limiter = new InMemoryAnalyticsRateLimiter(1);
    const request = { socket: { remoteAddress: "10.0.0.9" } } as Request;
    expect(limiter.allow(request, "account-1")).toBe(true);
    expect(limiter.allow(request, "account-1")).toBe(false);
  });
});
