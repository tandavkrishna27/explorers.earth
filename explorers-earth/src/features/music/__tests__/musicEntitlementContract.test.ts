import { describe, expect, it } from "vitest";
import { MusicClientError } from "../../../lib/localTunesApiClient";
import { parseMusicEntitlementResponse } from "../musicEntitlementContract";

const included = {
  state: "included",
  coreRead: true,
  coreMutation: true,
  paidMutation: false,
  maxAgeSeconds: 600,
} as const;

describe("Music entitlement response contract", () => {
  it.each([
    { ...included, state: "unknown" },
    included,
    { ...included, state: "eligible" },
    { ...included, state: "entitled", paidMutation: true, sourceUpdatedAt: "2026-08-14T09:55:00.000Z" },
    { ...included, state: "entitled", paidMutation: false },
    { ...included, state: "revoked" },
  ])("accepts the literal retained DTO %#", (value) => {
    // Break caught: one exact server state or the fresh/stale entitled distinction stops crossing the client boundary.
    expect(parseMusicEntitlementResponse(value)).toEqual(value);
  });

  it.each([
    null,
    [],
    "included",
    { ...included, extra: true },
    { ...included, state: 1 },
    { ...included, state: "paused" },
    { ...included, coreRead: false },
    { ...included, coreMutation: false },
    { ...included, paidMutation: "false" },
    { ...included, maxAgeSeconds: 601 },
    { ...included, paidMutation: true },
    { ...included, state: "entitled", paidMutation: true },
    { ...included, sourceUpdatedAt: 1 },
    { ...included, sourceUpdatedAt: "not-a-date" },
  ])("rejects a contradictory or unsupported DTO %#", (value) => {
    // Break caught: malformed successful JSON creates a client-only entitlement state or authority decision.
    expect(() => parseMusicEntitlementResponse(value)).toThrow(MusicClientError);
    try {
      parseMusicEntitlementResponse(value);
    } catch (error) {
      expect(error).toMatchObject({ code: "SERVICE_UNAVAILABLE", status: 502 });
    }
  });
});
