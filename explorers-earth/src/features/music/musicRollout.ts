import { z } from "zod";
import type { MusicRequest } from "./musicWorkspaceClient";

export interface MusicRolloutScope { userDocumentId: string; accountDocumentId: string }
export interface MusicFeatureExposure { ownerWorkspace: boolean; guestWorkspace: boolean; playlistImports: boolean; exposureId: string; expiresAt: string }

const schema = z.object({
  ownerWorkspace: z.boolean(), guestWorkspace: z.boolean(), playlistImports: z.boolean(),
  exposureId: z.string().min(1).max(128), expiresAt: z.string().datetime(),
}).strict();
const key = (scope: MusicRolloutScope) => `${scope.userDocumentId}:${scope.accountDocumentId}`;
const closed = (now: number): MusicFeatureExposure => ({ ownerWorkspace: false, guestWorkspace: false, playlistImports: false, exposureId: "unavailable", expiresAt: new Date(now).toISOString() });

export function createMusicRolloutClient(request: MusicRequest, clock: () => number = Date.now) {
  const cache = new Map<string, MusicFeatureExposure>();
  const generations = new Map<string, number>();
  const controllers = new Map<string, AbortController>();
  return {
    async get(scope: MusicRolloutScope): Promise<MusicFeatureExposure> {
      const now = clock();
      const cacheKey = key(scope);
      const cached = cache.get(cacheKey);
      if (cached && Date.parse(cached.expiresAt) > now) return cached;
      const generation = generations.get(cacheKey) ?? 0;
      controllers.get(cacheKey)?.abort();
      const controller = new AbortController();
      controllers.set(cacheKey, controller);
      try {
        const response = await request({ method: "GET", path: "/api/music/features", signal: controller.signal });
        if (controller.signal.aborted || (generations.get(cacheKey) ?? 0) !== generation) return closed(now);
        if (!response.ok) return closed(now);
        const parsed = schema.safeParse(await response.json());
        if (controller.signal.aborted || (generations.get(cacheKey) ?? 0) !== generation) return closed(now);
        if (!parsed.success) return closed(now);
        const serverExpiry = Date.parse(parsed.data.expiresAt);
        if (!Number.isFinite(serverExpiry) || serverExpiry <= now) return closed(now);
        const value = { ...parsed.data, expiresAt: new Date(Math.min(serverExpiry, now + 60_000)).toISOString() };
        cache.set(cacheKey, value);
        return value;
      } catch { return closed(now); }
      finally { if (controllers.get(cacheKey) === controller) controllers.delete(cacheKey); }
    },
    clear(scope: MusicRolloutScope): void {
      const cacheKey = key(scope);
      generations.set(cacheKey, (generations.get(cacheKey) ?? 0) + 1);
      controllers.get(cacheKey)?.abort(); controllers.delete(cacheKey); cache.delete(cacheKey);
    },
    clearAll(): void {
      for (const [cacheKey, controller] of controllers) { generations.set(cacheKey, (generations.get(cacheKey) ?? 0) + 1); controller.abort(); }
      controllers.clear(); cache.clear();
    },
  };
}

export function subscribeMusicRollout(
  rollout: Pick<ReturnType<typeof createMusicRolloutClient>, "get">,
  scope: MusicRolloutScope,
  onExposure: (exposure: MusicFeatureExposure) => void,
  clock: () => number = Date.now,
): () => void {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = async (): Promise<void> => {
    const exposure = await rollout.get(scope);
    if (!active) return;
    onExposure(exposure);
    const now = clock();
    const expiry = Date.parse(exposure.expiresAt);
    const delay = Number.isFinite(expiry) && expiry > now ? expiry - now : 60_000;
    timer = setTimeout(() => { void refresh(); }, delay);
  };
  void refresh();
  return () => {
    active = false;
    if (timer !== undefined) clearTimeout(timer);
  };
}
