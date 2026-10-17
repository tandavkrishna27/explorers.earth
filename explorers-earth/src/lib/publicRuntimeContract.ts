export type PublicRuntimeConfig = Readonly<{
  version: 1; environment: 'qa' | 'production'; origin: string; apiPath: '/api'; socketPath: '/socket.io';
  mapsBrowserKey?: string; analytics?: Readonly<{ enabled: boolean; identifier?: string }>;
}>;
function invalid(): never { throw new Error('PUBLIC_RUNTIME_CONFIG_INVALID'); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
export function parsePublicRuntimeConfig(value: unknown, browserOrigin?: string): PublicRuntimeConfig {
  const r = record(value);
  if (Object.keys(r).some(key => !['version','environment','origin','apiPath','socketPath','mapsBrowserKey','analytics'].includes(key))
      || r.version !== 1 || !['qa','production'].includes(String(r.environment)) || r.apiPath !== '/api' || r.socketPath !== '/socket.io'
      || typeof r.origin !== 'string' || r.origin.length > 512) invalid();
  let url: URL; try { url = new URL(r.origin); } catch { return invalid(); }
  if (url.protocol !== 'https:' || url.origin !== r.origin || url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || (browserOrigin !== undefined && r.origin !== browserOrigin)) invalid();
  if (r.mapsBrowserKey !== undefined && (typeof r.mapsBrowserKey !== 'string' || !/^[A-Za-z0-9_-]{16,200}$/.test(r.mapsBrowserKey))) invalid();
  let analytics: PublicRuntimeConfig['analytics'];
  if (r.analytics !== undefined) {
    const a = record(r.analytics);
    if (Object.keys(a).some(key => !['enabled','identifier'].includes(key)) || typeof a.enabled !== 'boolean'
        || (r.environment === 'qa' && a.enabled)
        || (a.enabled ? typeof a.identifier !== 'string' || !/^G-[A-Z0-9]{3,40}$/.test(a.identifier) : a.identifier !== undefined)) invalid();
    analytics = Object.freeze({ enabled: a.enabled, ...(a.identifier ? { identifier: a.identifier as string } : {}) });
  }
  return Object.freeze({version:1, environment:r.environment as 'qa'|'production', origin:r.origin, apiPath:'/api',socketPath:'/socket.io',
    ...(r.mapsBrowserKey ? {mapsBrowserKey:r.mapsBrowserKey as string} : {}), ...(analytics ? {analytics} : {})});
}
