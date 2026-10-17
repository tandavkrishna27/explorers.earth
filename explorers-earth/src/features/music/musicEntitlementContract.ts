import { MusicClientError } from "../../lib/localTunesApiClient";

export type MusicEntitlementState = "unknown" | "included" | "eligible" | "entitled" | "revoked";

export interface MusicEntitlementResponse {
  state: MusicEntitlementState;
  coreRead: true;
  coreMutation: true;
  paidMutation: boolean;
  maxAgeSeconds: 600;
  sourceUpdatedAt?: string;
}

const entitlementStates = new Set<MusicEntitlementState>([
  "unknown", "included", "eligible", "entitled", "revoked",
]);
const entitlementKeys = new Set([
  "state", "coreRead", "coreMutation", "paidMutation", "maxAgeSeconds", "sourceUpdatedAt",
]);

function invalidEntitlementResponse(): MusicClientError {
  return new MusicClientError("SERVICE_UNAVAILABLE", 502, "Music is temporarily unavailable.");
}

export function parseMusicEntitlementResponse(value: unknown): MusicEntitlementResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidEntitlementResponse();
  const entry = value as Record<string, unknown>;
  if (Object.keys(entry).some((key) => !entitlementKeys.has(key))
      || typeof entry.state !== "string" || !entitlementStates.has(entry.state as MusicEntitlementState)
      || entry.coreRead !== true || entry.coreMutation !== true
      || typeof entry.paidMutation !== "boolean" || entry.maxAgeSeconds !== 600
      || (entry.state !== "entitled" && entry.paidMutation)
      || (entry.paidMutation && entry.sourceUpdatedAt === undefined)
      || (entry.sourceUpdatedAt !== undefined
        && (typeof entry.sourceUpdatedAt !== "string" || Number.isNaN(Date.parse(entry.sourceUpdatedAt))))) {
    throw invalidEntitlementResponse();
  }
  return entry as unknown as MusicEntitlementResponse;
}
