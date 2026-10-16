import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

type Clock = { now(): number; setTimeout(callback: () => void, ms: number): unknown; clearTimeout(timer: unknown): void };
type Identity = { caseId: string; project: string; repeat: number };
type Init = { runId: string; commit: string; epoch: number; identity: Identity; origin: string };
type Dependencies = { clock: Clock; phase(): string; deadline(): number };
type Code = 'protocol' | 'timeout' | 'unsettled';
type Role = 'search' | 'details' | 'price' | 'photos' | 'jpeg';
export type GuidesProviderObservation = { version: 1; epoch: number; counts: Record<Role, number>; error: Code | null };
const CASE = 'Guides: native section photo import persists metadata and public views after reload';
const ROOT = '/__guides_provider__/';
const PATHS: Readonly<Record<string, Role>> = Object.freeze({
  '/__guides_provider__/v1/search': 'search',
  '/__guides_provider__/v1/places/guides-fixture-museum/details': 'details',
  '/__guides_provider__/v1/places/guides-fixture-museum/price': 'price',
  '/__guides_provider__/v1/places/guides-fixture-museum/photos': 'photos',
  '/__guides_provider__/v1/photos/guides-fixture-photo.jpg': 'jpeg',
});
const DATA = {
  search: [{ id: 'guides-fixture-museum', label: 'Guides Fixture Museum' }],
  details: { id: 'guides-fixture-museum', displayName: { text: 'Guides Fixture Museum' }, formattedAddress: '8 Museum Road, Fixture City, Fixture Country', types: ['museum'], primaryType: 'museum', primaryTypeDisplayName: { text: 'Museum' }, addressComponents: [{ longText: 'Fixture City', shortText: 'Fixture City', types: ['locality'] }, { longText: 'Fixture Country', shortText: 'FC', types: ['country'] }], location: { latitude: 12.5, longitude: 77.5 }, rating: 4.5 },
  price: { priceLevel: 'PRICE_LEVEL_MODERATE', priceRange: '$5 - $10' },
  photos: { photos: [{ name: 'guides-fixture-photo', widthPx: 8, heightPx: 8 }] },
};
// The source-owned activity-import bytes, served through HTTP. No media ID or
// storage object exists until the browser performs the actual canonical upload.
const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAIAAgDAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDu6/h8/wA4j//Z';
export class GuidesProviderFixtureError extends Error { constructor(readonly code: Code) { super(`Guides provider ${code}`); } }
function exact(value: unknown, keys: readonly string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw new GuidesProviderFixtureError('protocol');
}
type Original = { request: IncomingMessage; response: ServerResponse; socket: Socket; bodyEnded: boolean; responseFinished: boolean; requestClosed: boolean; responseClosed: boolean; socketClosed: boolean; settled: boolean };

/** Construction is resource free. Only the original worker listener calls handle. */
export function createGuidesProviderFixture(input: Init, dependencies: Dependencies) {
  exact(input, ['runId', 'commit', 'epoch', 'identity', 'origin']); exact(input.identity, ['caseId', 'project', 'repeat']);
  exact(dependencies, ['clock', 'phase', 'deadline']); exact(dependencies.clock, ['now', 'setTimeout', 'clearTimeout']);
  const d = dependencies;
  if (typeof input.runId !== 'string' || typeof input.commit !== 'string' || typeof input.origin !== 'string' || !/^[a-f0-9]{32}$/.test(input.runId) || !/^[a-f0-9]{40}$/.test(input.commit) || !Number.isInteger(input.epoch) || input.epoch < 1 || input.epoch > 16 || !['guides-desktop', 'guides-mobile'].includes(input.identity.project) || input.identity.repeat !== 0 || typeof input.identity.caseId !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(input.origin) || (Number(new URL(input.origin).port) < 1024 || Number(new URL(input.origin).port) > 65535) || ['phase', 'deadline'].some(key => typeof Reflect.get(d, key) !== 'function') || ['now', 'setTimeout', 'clearTimeout'].some(key => typeof Reflect.get(d.clock, key) !== 'function')) throw new GuidesProviderFixtureError('protocol');
  // Capture the validated original init; later caller mutation grants no admission.
  const epoch = input.epoch, eligible = input.identity.caseId === CASE, origin = input.origin, host = new URL(origin).host;
  let gate: 'execution' | 'observe' | 'retired' = 'execution', first: GuidesProviderFixtureError | undefined, previousTime = -Infinity;
  const counts: Record<Role, number> = { search: 0, details: 0, price: 0, photos: 0, jpeg: 0 }, admitted = new Set<Role>();
  const originals = new Set<Original>(), sockets = new Set<Socket>(), waiters = new Set<() => void>();
  const wake = () => { for (const fn of [...waiters]) fn(); };
  const fail = (code: Code) => { if (!first) { first = new GuidesProviderFixtureError(code); gate = 'retired'; cleanup(); wake(); } return first; };
  const now = () => { const value = d.clock.now(); if (!Number.isFinite(value) || value < 0 || value < previousTime) throw fail('protocol'); previousTime = value; return value; };
  const deadline = (end: number) => { const owner = d.deadline(); if (!Number.isFinite(end) || !Number.isFinite(owner)) throw fail('protocol'); return Math.min(end, owner); };
  const snapshot = (): GuidesProviderObservation => ({ version: 1, epoch, counts: { ...counts }, error: first?.code ?? null });
  const destroy = (original: Original) => { if (!original.request.destroyed) original.request.destroy(); if (!original.response.destroyed) original.response.destroy(); if (!original.socket.destroyed) original.socket.destroy(); };
  const cleanup = () => { for (const original of [...originals]) destroy(original); for (const socket of [...sockets]) if (!socket.destroyed) socket.destroy(); };
  const settle = (original: Original) => {
    if (!original.settled && (original.bodyEnded && original.responseFinished || original.requestClosed && original.responseClosed && original.socketClosed)) { original.settled = true; originals.delete(original); wake(); }
  };
  function handle(request: IncomingMessage, response: ServerResponse): boolean {
    if (typeof request.url !== 'string' || !request.url.startsWith(ROOT.slice(0, -1))) return false;
    const original: Original = { request, response, socket: request.socket, bodyEnded: false, responseFinished: false, requestClosed: false, responseClosed: false, socketClosed: false, settled: false };
    originals.add(original);
    request.once('close', () => { original.requestClosed = true; settle(original); });
    response.once('close', () => { original.responseClosed = true; settle(original); });
    request.socket.once('close', () => { original.socketClosed = true; settle(original); });
    if (!sockets.has(request.socket)) { sockets.add(request.socket); request.socket.once('close', () => { sockets.delete(request.socket); if (!original.settled && !(original.bodyEnded && original.responseFinished)) fail('unsettled'); wake(); }); }
    const reject = () => { fail('protocol'); response.statusCode = 403; response.setHeader('Connection', 'close'); response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Type', 'application/json'); response.end(Buffer.from('{"error":"denied"}')); destroy(original); };
    try {
      const role = Object.hasOwn(PATHS, request.url) ? PATHS[request.url] : undefined;
      if (first || gate !== 'execution' || d.phase() !== 'execution' || !eligible || now() >= deadline(d.deadline()) || !role || admitted.has(role) || request.method !== 'GET' || request.socket.remoteAddress !== '127.0.0.1' || request.headers.host !== host || request.aborted || request.complete || request.destroyed || response.writableFinished || response.destroyed || sockets.size > 16 || originals.size > 5) { reject(); return true; }
      const seen = new Set<string>();
      if (!Array.isArray(request.rawHeaders) || request.rawHeaders.length % 2) { reject(); return true; }
      const allowed = /^(?:host|cookie|accept|accept-encoding|accept-language|user-agent|referer|origin|connection|sec-fetch-(?:dest|mode|site)|sec-ch-ua(?:-mobile|-platform)?|content-length|cache-control|pragma|priority)$/;
      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        const name = request.rawHeaders[index].toLowerCase(), value = request.rawHeaders[index + 1];
        if (!allowed.test(name) || seen.has(name) || typeof value !== 'string' || Buffer.byteLength(value) > 8192 || /[\x00-\x1f\x7f]/.test(value) || request.headers[name] !== value) { reject(); return true; }
        seen.add(name);
      }
      if (!seen.has('host') || Object.keys(request.headers).some(name => !seen.has(name)) || request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0' || request.headers.origin !== undefined && request.headers.origin !== origin || request.headers.referer !== undefined && !String(request.headers.referer).startsWith(origin + '/') || request.headers.connection !== undefined && request.headers.connection !== 'close' && request.headers.connection !== 'keep-alive') { reject(); return true; }
      admitted.add(role);
      const failedOriginal = (code: Code) => { fail(code); destroy(original); };
      request.once('aborted', () => failedOriginal('unsettled'));
      request.once('error', () => failedOriginal('unsettled'));
      request.on('data', chunk => { if (Buffer.byteLength(chunk) !== 0) failedOriginal('protocol'); });
      request.once('close', () => { if (!original.bodyEnded) failedOriginal('unsettled'); });
      response.once('error', () => failedOriginal('unsettled'));
      response.once('close', () => { if (!original.responseFinished) failedOriginal('unsettled'); });
      response.once('finish', () => {
        try {
          if (first || original.responseFinished || !response.writableFinished || !original.bodyEnded) { failedOriginal('protocol'); return; }
          if (now() >= deadline(d.deadline())) { failedOriginal('unsettled'); return; }
          original.responseFinished = true; counts[role]++; settle(original);
        } catch { failedOriginal('protocol'); }
      });
      request.once('end', () => {
        try {
        if (!request.complete || request.aborted || first || original.bodyEnded || now() >= deadline(d.deadline())) { failedOriginal('unsettled'); return; }
        original.bodyEnded = true;
        const bytes = role === 'jpeg' ? Buffer.from(JPEG, 'base64') : Buffer.from(JSON.stringify(DATA[role]));
        response.statusCode = 200; response.setHeader('Connection', 'close'); response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Type', role === 'jpeg' ? 'image/jpeg' : 'application/json'); response.setHeader('Content-Length', String(bytes.length)); response.end(bytes);
        } catch { failedOriginal('protocol'); }
      });
      request.resume(); return true;
    } catch { reject(); return true; }
  }
  async function drain(end: number, closeSockets: boolean, cleanupOnly = false) {
    const until = deadline(end); if (first && !cleanupOnly) { cleanup(); throw first; }
    if (!cleanupOnly && now() >= until) { cleanup(); throw fail('timeout'); }
    if (closeSockets) for (const socket of [...sockets]) socket.destroy();
    if (!originals.size && (!closeSockets || !sockets.size)) return;
    if (now() >= until) { cleanup(); fail('unsettled'); throw new GuidesProviderFixtureError('unsettled'); }
    await new Promise<void>((resolve, reject) => {
      let settled = false, timer: unknown;
      const finish = (error?: GuidesProviderFixtureError) => { if (settled) return; settled = true; waiters.delete(poll); d.clock.clearTimeout(timer); error ? reject(error) : resolve(); };
      const poll = () => { if (first && !cleanupOnly) finish(first); else if (!originals.size && (!closeSockets || !sockets.size)) finish(); };
      waiters.add(poll); timer = d.clock.setTimeout(() => { fail('unsettled'); cleanup(); finish(new GuidesProviderFixtureError('unsettled')); }, Math.max(1, until - now())); poll();
    });
  }
  return Object.freeze({ handle, snapshot,
    async observe(end: number) { if (gate !== 'execution') throw first ?? fail('protocol'); gate = 'observe'; await drain(end, false); return snapshot(); },
    resume() { if (first || gate !== 'observe') throw first ?? fail('protocol'); if (d.phase() !== 'execution' || now() >= deadline(d.deadline())) throw fail('protocol'); gate = 'execution'; },
    async retire(end: number) { if (gate === 'retired') throw first ?? fail('protocol'); gate = 'retired'; await drain(end, false); if (Object.values(counts).some(count => count !== (eligible ? 1 : 0))) { cleanup(); throw fail('protocol'); } await drain(end, true); return snapshot(); },
    async abort(end: number) { gate = 'retired'; cleanup(); await drain(end, true, true); },
  });
}
