import { createHash, randomUUID } from "node:crypto";
import type { MusicPrincipal } from "../middleware/musicPrincipal";

export const musicFeatureFlags = ["ownerWorkspace", "guestWorkspace", "playlistImports"] as const;
export type MusicFeatureFlag = typeof musicFeatureFlags[number];
export type MusicFeatureExposure = Record<MusicFeatureFlag, boolean> & { exposureId: string; expiresAt: string };

export interface MusicFeatureDecisionOptions {
  killSwitch: () => boolean;
  salt: string;
  cohortVersion: string;
  allowlists?: Partial<Record<MusicFeatureFlag, ReadonlySet<string>>>;
  percentages?: Partial<Record<MusicFeatureFlag, number>>;
  cacheTtlMs?: number;
  cacheRefreshWindowMs?: number;
  cacheMaxEntries?: number;
  now?: () => number;
  exposureId?: () => string;
  log?: (entry: { flag: MusicFeatureFlag; decision: boolean; cohortVersion: string; exposureId: string }) => void;
  allowlistIdentity?: (principal: MusicPrincipal) => string;
}

export class MusicFeatureDecisionService {
  private readonly cache = new Map<string, { expires: number; value: MusicFeatureExposure }>();
  constructor(private readonly options: MusicFeatureDecisionOptions) {}

  decide(principal: MusicPrincipal): MusicFeatureExposure {
    const now = this.options.now?.() ?? Date.now();
    this.cache.forEach((entry, key) => {
      if (entry.expires <= now) this.cache.delete(key);
    });
    if (this.options.killSwitch()) {
      this.cache.clear();
      const exposureId = this.options.exposureId?.() ?? randomUUID();
      for (const flag of musicFeatureFlags) this.options.log?.({ flag, decision: false, cohortVersion: this.options.cohortVersion, exposureId });
      return { ownerWorkspace: false, guestWorkspace: false, playlistImports: false, exposureId, expiresAt: new Date(now).toISOString() };
    }
    const cacheKey = `${principal.musicUserId}:${principal.accountDocumentId}:${principal.sessionVersion}`;
    const ttl = Math.min(Math.max(this.options.cacheTtlMs ?? 60_000, 0), 60_000);
    const refreshWindow = Math.min(Math.max(this.options.cacheRefreshWindowMs ?? 5_000, 0), 5_000, ttl);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires - now > refreshWindow) return cached.value;
    const expires = now + ttl;
    const exposureId = this.options.exposureId?.() ?? randomUUID();
    const decision = Object.fromEntries(musicFeatureFlags.map((flag) => [flag, this.flag(flag, principal)])) as Record<MusicFeatureFlag, boolean>;
    for (const flag of musicFeatureFlags) this.options.log?.({ flag, decision: decision[flag], cohortVersion: this.options.cohortVersion, exposureId });
    const value = { ...decision, exposureId, expiresAt: new Date(expires).toISOString() };
    const maxEntries = Math.min(Math.max(Math.trunc(this.options.cacheMaxEntries ?? 10_000), 1), 10_000);
    if (cached) this.cache.delete(cacheKey);
    while (this.cache.size >= maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    this.cache.set(cacheKey, { expires, value });
    return value;
  }

  private flag(flag: MusicFeatureFlag, principal: MusicPrincipal): boolean {
    const allowlistIdentity = this.options.allowlistIdentity?.(principal) ?? principal.accountDocumentId;
    if (this.options.allowlists?.[flag]?.has(allowlistIdentity)) return true;
    const percentage = Math.min(Math.max(this.options.percentages?.[flag] ?? 0, 0), 100);
    if (percentage === 0 || this.options.salt.trim().length === 0) return false;
    const digest = createHash("sha256").update(`${this.options.salt}:${this.options.cohortVersion}:${flag}:${principal.accountDocumentId}`).digest();
    return digest.readUInt32BE(0) % 10_000 < percentage * 100;
  }
}
