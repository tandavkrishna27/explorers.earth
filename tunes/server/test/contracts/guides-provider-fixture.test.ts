import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createGuidesProviderFixture } from '../../../scripts/guides-provider-fixture';

const caseId = 'Guides: native section photo import persists metadata and public views after reload';
function setup(overrides: Record<string, unknown> = {}, holdSocketClose = false) {
  let now = 0, phase = 'execution'; const timers = new Map<number, () => void>(); let serial = 0;
  const init = { runId: 'a'.repeat(32), commit: 'b'.repeat(40), epoch: 1, identity: { caseId, project: 'guides-desktop', repeat: 0 }, origin: 'http://127.0.0.1:53001', ...overrides };
  const provider = createGuidesProviderFixture(init, { clock: { now: () => now, setTimeout: (fn, _ms) => { timers.set(++serial, fn); return serial; }, clearTimeout: id => { timers.delete(id as number); } }, phase: () => phase, deadline: () => 1000 });
  const incoming = (url = '/__guides_provider__/v1/search', fields: Record<string, unknown> = {}) => {
    const socket = Object.assign(new EventEmitter(), { remoteAddress: '127.0.0.1', destroyed: false, destroy(this: EventEmitter & { destroyed: boolean }) { this.destroyed = true; if (!holdSocketClose) this.emit('close'); return this; } });
    const req = Object.assign(new EventEmitter(), { url, method: 'GET', headers: { host: '127.0.0.1:53001' }, rawHeaders: ['Host', '127.0.0.1:53001'], socket, complete: false, aborted: false, destroyed: false, resume() {}, destroy(this: EventEmitter & { destroyed: boolean }) { this.destroyed = true; this.emit('close'); socket.destroy(); return this; }, ...fields });
    const headers: Record<string, unknown> = {}; const res = Object.assign(new EventEmitter(), { statusCode: 0, writableFinished: false, destroyed: false, bytes: Buffer.alloc(0), setHeader(name: string, value: unknown) { headers[name.toLowerCase()] = value; }, end(bytes: Buffer) { this.bytes = bytes; }, destroy(this: EventEmitter & { destroyed: boolean }) { this.destroyed = true; this.emit('close'); socket.destroy(); return this; } });
    provider.handle(req as any, res as any);
    return { req, res, socket, headers, end() { req.complete = true; req.emit('end'); }, finish() { res.writableFinished = true; res.emit('finish'); }, close() { socket.destroy(); } };
  };
  return { provider, incoming, setNow: (value: number) => { now = value; }, setPhase: (value: string) => { phase = value; }, expire() { now = 1000; for (const fn of [...timers.values()]) fn(); } };
}
describe('owned Guides provider original HTTP custody', () => {
  it('counts only original body end and response finish and returns the exact fixture', async () => {
    const f = setup(), request = f.incoming();
    expect(request.res.bytes.length).toBe(0); request.end();
    expect(JSON.parse(request.res.bytes.toString())).toEqual([{ id: 'guides-fixture-museum', label: 'Guides Fixture Museum' }]);
    const observed = f.provider.observe(1000); let done = false; observed.then(() => { done = true; }); await Promise.resolve(); expect(done).toBe(false);
    request.finish(); const o = await observed; expect(o.counts.search).toBe(1); expect(o.error).toBeNull();
    request.close(); f.provider.resume();
  });
  it.each(['bootstrap', 'reset', 'observe', 'retirement'])('denies admission in original %s phase', phase => {
    const f = setup(); f.setPhase(phase); expect(f.incoming().res.statusCode).toBe(403);
  });
  it.each(['/__guides_provider__/v1/search?query=Guides%20Fixture%20Museum', '/__guides_provider__/v1/places/other/details', '/__guides_provider__/v1/search/', '/__guides_provider__/v1/%73earch'])('denies nonexact paths %s', url => {
    const f = setup(), request = f.incoming(url); expect(request.res.statusCode).toBe(403);
  });
  it.each([{ method: 'POST' }, { headers: { host: 'evil' } }, { headers: { host: '127.0.0.1:53001', 'content-length': '1' }, rawHeaders: ['Host', '127.0.0.1:53001', 'Content-Length', '1'] }, { rawHeaders: ['Host', '127.0.0.1:53001', 'host', '127.0.0.1:53001'] }])('denies method/header/body anomalies', fields => {
    const f = setup(), request = f.incoming(undefined, fields); expect(request.res.statusCode).toBe(403);
  });
  it('denies other cases and double admission', () => {
    expect(setup({ identity: { caseId: 'other', project: 'guides-desktop', repeat: 0 } }).incoming().res.statusCode).toBe(403);
    const f = setup(); f.incoming(); expect(f.incoming().res.statusCode).toBe(403);
  });
  it('closes observation admission and never fabricates settlement on expiry', async () => {
    const f = setup(), request = f.incoming(); const observing = f.provider.observe(1000); const rejection = expect(observing).rejects.toThrow();
    expect(f.incoming('/__guides_provider__/v1/places/guides-fixture-museum/details').res.statusCode).toBe(403);
    f.expire(); await rejection; expect(request.socket.destroyed).toBe(true);
  });
  it.each(['aborted', 'disconnect', 'body'])('retains first safe failure for %s', async fault => {
    const f = setup(), request = f.incoming();
    if (fault === 'aborted') { request.req.aborted = true; request.req.emit('aborted'); }
    else if (fault === 'disconnect') request.res.emit('close');
    else request.req.emit('data', Buffer.from('private'));
    await expect(f.provider.observe(1000)).rejects.toThrow(/Guides provider/);
    expect(JSON.stringify(f.provider.snapshot())).not.toContain('private');
  });
  it('requires all five finishes and actual socket close before retirement', async () => {
    const f = setup(); const paths = ['search', 'places/guides-fixture-museum/details', 'places/guides-fixture-museum/price', 'places/guides-fixture-museum/photos', 'photos/guides-fixture-photo.jpg'];
    const requests = paths.map(p => f.incoming('/__guides_provider__/v1/' + p));
    for (const request of requests) { request.end(); request.finish(); }
    const photo = requests[4]; expect(photo.headers['content-type']).toBe('image/jpeg'); expect(photo.res.bytes.length).toBe(633);
    expect(createHash('sha256').update(photo.res.bytes).digest('hex')).toBe('040d3d472c846ce1e2ea09b361b3224c5723a591f305797217e20b98778d9f1c');
    const retired = await f.provider.retire(1000); expect(Object.values(retired.counts)).toEqual([1, 1, 1, 1, 1]); expect(requests.every(r => r.socket.destroyed)).toBe(true);
    expect(f.incoming().res.statusCode).toBe(403);
  });
  it('rejects incomplete retirement and cannot resume a retired epoch', async () => {
    const f = setup(); await expect(f.provider.retire(1000)).rejects.toThrow(); expect(() => f.provider.resume()).toThrow();
  });
  it('requires original socket close after destroy and cannot accept destroyed booleans as evidence', async () => {
    const f = setup({ identity: { caseId: 'other', project: 'guides-desktop', repeat: 0 } }, true);
    const request = f.incoming('/__guides_provider__/v1/search');
    const aborted = f.provider.abort(1000); let done = false; aborted.then(() => { done = true; });
    await Promise.resolve(); expect(done).toBe(false); expect(request.socket.destroyed).toBe(true);
    request.socket.emit('close'); await aborted; expect(done).toBe(true);
  });
  it('preserves an unfinished original on cleanup deadline and ignores late finishes', async () => {
    const f = setup({}, true), request = f.incoming(); request.end(); request.res.emit('close');
    const aborting = f.provider.abort(1000); const rejected = expect(aborting).rejects.toThrow(/unsettled/); f.expire(); await rejected;
    request.finish(); expect(f.provider.snapshot().counts.search).toBe(0); expect(f.provider.snapshot().error).toBe('unsettled');
    request.socket.emit('close');
  });
  it('denies expired admission and a response finish after its original deadline', () => {
    const expired = setup(); expired.setNow(1000); expect(expired.incoming().res.statusCode).toBe(403);
    const f = setup(), request = f.incoming(); request.end(); f.setNow(1000); request.finish(); expect(f.provider.snapshot().counts.search).toBe(0);
  });
  it('captures init identity and rejects extra dependency or caller closure authority', () => {
    expect(() => setup({ closed: true })).toThrow(/protocol/);
    const f = setup(); const request = f.incoming(); request.end(); request.finish(); request.finish(); expect(f.provider.snapshot().counts.search).toBe(1); request.close();
  });
});
