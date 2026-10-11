import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { GUIDES_CASES, buildGuidesSeedPlan, guidesObservationRowSchemas } from '../../../tunes/scripts/guides-browser-support';
import { validateGuidesEnvironment, readGuidesDescriptor, createGuidesHarnessClient, guidesFixtureBytes } from '../../e2e/replatform/guides-harness-client';
import { createHash } from 'node:crypto';
const runId = 'a'.repeat(32), commit = 'b'.repeat(40), origin = 'http://127.0.0.1:55001', file = path.resolve('fake-guides-harness.json');
const descriptor = { v: 1, runId, commit, origin, parent: { url: 'http://127.0.0.1:55003/control', capability: 'c'.repeat(64) } };
const env = { PLAYWRIGHT_EXTERNAL_BASE_URL: origin, GUIDES_E2E_FIXTURE_PATH: file, REPLATFORM_E2E_FIXTURE_PATH: file, REPLATFORM_E2E_LANE: 'guides' };
const people = Object.fromEntries(['ownerA', 'ownerB', 'ownerC'].map((key, i) => [key, { userId: `user-${i}`, accountId: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, handle: `guide-owner-${i}`, accountRevision: 1 }]));
const identity = { caseId: GUIDES_CASES[0], project: 'guides-desktop', repeat: 0 } as const;
function reset() { const seed = buildGuidesSeedPlan(identity.caseId); const guides = seed.guides.map(({ owner, ...rest }, i) => ({ ...rest, id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, accountId: people[owner].accountId, category: 'guides', collectionRevision: 1, categoryContentRevision: 1 })); return { version: 1, action: 'reset', runId, commit, ...identity, generation: 1, manifest: { version: 1, runId, commit, ...identity, generation: 1, personas: structuredClone(people), guides, sections: seed.sections.map(({ guideKey, ...rest }, i) => ({ ...rest, id: `30000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, collectionId: guides.find(g => g.key === guideKey)!.id, accountId: guides.find(g => g.key === guideKey)!.accountId })), media: [], attachments: [], expectedPublic: { eligibleGuideIds: [], selectedGuideId: null, orderedSectionIds: [], roleMediaIds: {}, traversal: null } }, sessions: Object.fromEntries(Object.keys(people).map((key, i) => [key, { cookie: `better-auth.session_token=token${i}.signature${i}=` }])) }; }
function fsFake(bytes = Buffer.from(JSON.stringify(descriptor))) { const regular = (file: boolean) => ({ dev: 1n, ino: file ? 2n : 1n, mode: 1n, uid: 1n, gid: 1n, nlink: 1n, mtimeNs: 1n, ctimeNs: 1n, size: BigInt(bytes.length), isFile: () => file, isDirectory: () => !file, isSymbolicLink: () => false }); let position = 0; return { lstatSync: vi.fn((value: string) => regular(value === file)), realpathSync: vi.fn((value: string) => value), openSync: vi.fn(() => 1), fstatSync: vi.fn(() => regular(true)), readSync: vi.fn((_fd: number, out: Buffer, offset: number, length: number) => { const n = Math.min(length, bytes.length - position); bytes.copy(out, offset, position, position + n); position += n; return n; }), closeSync: vi.fn() }; }
function setup() { const posts: any[] = []; let observation: any = { version: 1, action: 'observe', runId, commit, ...identity, generation: 1, personas: Object.fromEntries(Object.entries(people).map(([k, p]) => [k, { ...p, status: 'active', publicProfile: true, guidesPublic: true, guidesContentRevision: 1 }])), guides: [], sections: [], media: [], objects: [], attachments: [], provider: { version: 1, epoch: 1, counts: {search:0,details:0,price:0,photos:0,jpeg:0}, error: null } }; const post = vi.fn(async (_url: string, _headers: unknown, body: string) => { const command = JSON.parse(body); posts.push(command); return { status: 200, headers: { 'x-guides-remaining-lane-ms': '100000' }, body: Buffer.from(JSON.stringify(command.action === 'start' ? { v: 1, epoch: 1, reset: reset() } : command.action === 'observe' ? { v: 1, epoch: 1, observation } : command.action === 'retire' ? { v: 1, epoch: 1, retired: true } : { v: 1, failed: true })) }; }); const clock = { now: () => performance.now(), setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer) }; const client = createGuidesHarnessClient(env, { fs: fsFake(), post, clock }); return { client, post, posts, setObservation: (v: any) => { observation = v; } }; }
describe('Guides Node harness custody', () => {
    it('refuses operation4097 before producer effects and retains existing original custody',async()=>{const s=setup();await s.client.start(identity);let release!:()=>void;const held=s.client.trackProducer(()=>new Promise<void>(r=>{release=r;}));await Promise.all(Array.from({length:4094},()=>s.client.trackProducer(async()=>undefined)));expect(s.client.snapshot().pending).toBe(1);const extra=vi.fn(async()=>undefined);await expect(s.client.trackProducer(extra)).rejects.toThrow('Guides harness');await Promise.resolve();expect.soft(extra).not.toHaveBeenCalled();expect(s.client.snapshot().pending).toBe(1);release();await held;expect(s.client.snapshot().pending).toBe(0);await expect(s.client.retire()).rejects.toThrow('Guides harness');});
    it('reserves all64 context slots before concurrent effects and retains late ownership after timeout', async () => { vi.useFakeTimers(); try {
        const s = setup();
        await s.client.start(identity);
        const settlers: ((value: any) => void)[] = [];
        const browser: any = { newContext: vi.fn(() => new Promise(r => { settlers.push(r); })) };
        const calls = Array.from({ length: 65 }, () => s.client.createContext(browser, 'ownerA').then(() => true, () => false));
        await Promise.resolve();
        await Promise.resolve();
        expect.soft(browser.newContext).toHaveBeenCalledTimes(64);
        expect.soft(s.client.snapshot().pending).toBe(64);
        await vi.advanceTimersByTimeAsync(60001);
        expect(await Promise.all(calls)).toEqual(Array(65).fill(false));
        expect.soft(s.client.snapshot().pending).toBe(64);
        for (const settle of settlers)
            settle({});
        for (let n = 0; n < 8; n++)
            await Promise.resolve();
        expect.soft(s.client.snapshot().openContexts).toBe(64);
        expect(s.client.snapshot().pending).toBe(0);
        await expect(s.client.retire()).rejects.toThrow('Guides harness');
    }
    finally {
        vi.useRealTimers();
    } });
    it.each([{ value: null }, { value: 1 }, { value: [] }])('sanitizes non-object context options before effects ($value)', async ({ value: options }) => { const s = setup(); await s.client.start(identity); const browser: any = { newContext: vi.fn() }; await expect(s.client.createContext(browser, 'ownerA', options as any)).rejects.toThrow('Guides harness'); expect(browser.newContext).not.toHaveBeenCalled(); });
    it('rejects an uncorrelated fail acknowledgement', async () => { const s = setup(); await s.client.start(identity); s.post.mockImplementationOnce(async () => ({ status: 200, headers: { 'x-guides-remaining-lane-ms': '100000' }, body: Buffer.from(JSON.stringify({ v: 1, retired: true })) })); await expect(s.client.fail()).rejects.toThrow('Guides harness'); expect(s.client.snapshot().failed).toBe(true); });
    it('denies new context producer before effects while retirement is closing contexts', async () => { const s = setup(); await s.client.start(identity); const p = people.ownerA; let closed!: () => void; const ctx: any = { on() {}, addCookies: async () => undefined, route: async () => undefined, close: () => new Promise<void>(r => { closed = r; }), request: { get: async (url: string) => ({ status: () => 200, json: async () => url.includes('get-session') ? { user: { id: p.userId } } : { account: { id: p.accountId, handle: p.handle } }, dispose: async () => undefined }) } }; await s.client.createContext({ newContext: async () => ctx } as any, 'ownerA'); await s.client.observe(); const retiring = s.client.retire(); await Promise.resolve(); const other: any = { newContext: vi.fn() }; await expect(s.client.createContext(other, 'ownerB')).rejects.toThrow('Guides harness'); expect(other.newContext).not.toHaveBeenCalled(); closed(); await retiring; });
    it.each(['epoch', 'generation', 'session', 'persona', 'manifest'] as const)('refuses incorrect reset %s correlation', async (change) => {
        const s = setup(), value: any = { v: 1, epoch: 1, reset: reset() };
        if (change === 'epoch')
            value.epoch = 2;
        else if (change === 'generation')
            value.reset.generation = 2;
        else if (change === 'session')
            value.reset.sessions.ownerB.cookie = value.reset.sessions.ownerA.cookie;
        else if (change === 'persona')
            value.reset.manifest.personas.ownerB.accountId = value.reset.manifest.personas.ownerA.accountId;
        else
            value.reset.manifest.guides[0].details.categories = ['lost'];
        s.post.mockImplementationOnce(async () => ({ status: 200, headers: { 'x-guides-remaining-lane-ms': '100000' }, body: Buffer.from(JSON.stringify(value)) }));
        await expect(s.client.start(identity)).rejects.toThrow('Guides harness');
    });
    it('refuses duplicate section-photo attachment registry even for valid typed rows', async () => { const s = setup(); await s.client.start(identity); const initial = reset(), seed = initial.manifest.sections[0], guide = initial.manifest.guides[0], id = '40000000-0000-4000-8000-000000000001', accountId = guide.accountId, now = '2026-10-10T10:00:00.000Z', blocks = structuredClone(seed.blocks); blocks.timeline.morning[0].photos = [{ mediaId: id, fileName: 'photo.png', width: 8, height: 8, aspectRatio: '1:1' }]; const attachment = { slot: 'section-photo', guideId: guide.id, sectionId: seed.id, accountId, mediaId: id }; s.setObservation({ version: 1, action: 'observe', runId, commit, ...identity, generation: 1, personas: Object.fromEntries(Object.entries(people).map(([k, p]) => [k, { ...p, status: 'active', publicProfile: true, guidesPublic: true, guidesContentRevision: 1 }])), guides: [{ id: guide.id, accountId, category: 'guides', title: guide.title, description: null, slug: guide.slug, displayOrder: 0, revision: 1, categoryContentRevision: 1, visibility: 'public', publicationState: 'published', pinOrder: null, archivedAt: null, details: guide.details }], sections: [{ id: seed.id, collectionId: guide.id, accountId, title: seed.title, description: seed.description, displayOrder: 0, blocks, archivedAt: null, createdAt: now, updatedAt: now }], media: [{ id, accountId, purpose: 'guide', status: 'ready', mimeType: 'image/png', byteLength: 74, sha256: 'd'.repeat(64), originalFilename: 'photo.png', width: 8, height: 8, alternativeText: null, caption: null, readyAt: now, deletedAt: null }], objects: [], attachments: [attachment, attachment], provider: { version: 1, epoch: 1, counts: {search:0,details:0,price:0,photos:0,jpeg:0}, error: null } }); await expect(s.client.observe()).rejects.toThrow('Guides harness'); });
    it('subtracts response transport time from inherited remaining budget', async () => {
        vi.useFakeTimers();
        try {
            const s = setup();
            let resolve!: (value: any) => void;
            s.post.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
            const work = s.client.start(identity);
            await vi.advanceTimersByTimeAsync(1000);
            resolve({ status: 200, headers: { 'x-guides-remaining-lane-ms': '100000' }, body: Buffer.from(JSON.stringify({ v: 1, epoch: 1, reset: reset() })) });
            await work;
            expect(s.client.remainingMs()).toBeLessThanOrEqual(99000);
        }
        finally {
            vi.useRealTimers();
        }
    });
    it.each([['old-cover', 74, 'efd697c3369b86b0b540c0bded797ca813a3984c1a95d7d16644744e252840a2'], ['replacement-cover', 78, '737a59b1d4ed37b6cd836d483eff2ad8b0183d5a8078e355e7bb30a91c746f82'], ['activity-import', 633, '040d3d472c846ce1e2ea09b361b3224c5723a591f305797217e20b98778d9f1c']] as const)('supplies fixed actual %s bytes independently hashed', (id, length, hash) => { const bytes = guidesFixtureBytes(id); expect(bytes.byteLength).toBe(length); expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash); bytes[0] = 0; expect(createHash('sha256').update(guidesFixtureBytes(id)).digest('hex')).toBe(hash); });
    it.each(['symlink', 'nonregular', 'exclusive', 'open-identity', 'ancestor', 'growth', 'read-limit', 'close'] as const)('refuses descriptor %s custody loss', change => {
        const fake = fsFake();
        if (change === 'symlink')
            fake.lstatSync.mockImplementation(() => ({ ...fake.fstatSync(), isSymbolicLink: () => true }));
        else if (change === 'nonregular')
            fake.fstatSync.mockImplementation(() => ({ isFile: () => false, isDirectory: () => false, isSymbolicLink: () => false }) as any);
        else if (change === 'exclusive') {
            const old = fake.fstatSync();
            fake.fstatSync.mockReturnValue({ ...old, nlink: 2n });
        }
        else if (change === 'open-identity') {
            const old = fake.fstatSync();
            fake.fstatSync.mockReturnValue({ ...old, ino: 3n });
        }
        else if (change === 'ancestor')
            fake.realpathSync.mockImplementation(() => path.resolve('different'));
        else if (change === 'growth')
            fake.readSync.mockImplementation((_fd, out, offset, length) => { out.fill(1, offset, offset + length); return length; });
        else if (change === 'read-limit')
            fake.readSync.mockReturnValue(4097);
        else
            fake.closeSync.mockImplementation(() => { throw Error('private close secret'); });
        expect(() => readGuidesDescriptor(file, fake)).toThrow('Guides harness');
        if (['nonregular', 'exclusive', 'open-identity', 'growth', 'read-limit', 'close'].includes(change))
            expect(fake.closeSync).toHaveBeenCalled();
    });
    it('refuses duplicate descriptor keys without exposing their values', () => { const text = JSON.stringify(descriptor).replace('"v":1', '"v":1,"v":1'); expect(() => readGuidesDescriptor(file, fsFake(Buffer.from(text)))).toThrow('Guides harness'); });
    it('closes an owned context before retirement and verifies session/me identity', async () => { const s = setup(); await s.client.start(identity); const order: string[] = [], p = people.ownerA; const ctx: any = { on() {}, addCookies: vi.fn(async () => undefined), route: vi.fn(async () => undefined), close: vi.fn(async () => { order.push('close'); }), request: { get: vi.fn(async (url: string) => ({ status: () => 200, json: async () => url.includes('get-session') ? { user: { id: p.userId } } : { account: { id: p.accountId, handle: p.handle } }, dispose: async () => undefined })) } }; const browser: any = { newContext: vi.fn(async () => ctx) }; await s.client.createContext(browser, 'ownerA'); await s.client.observe(); s.post.mockImplementationOnce(async () => { order.push('retire'); return { status: 200, headers: { 'x-guides-remaining-lane-ms': '100000' }, body: Buffer.from(JSON.stringify({ v: 1, epoch: 1, retired: true })) }; }); await s.client.retire(); expect(order).toEqual(['close', 'retire']); expect(ctx.addCookies).toHaveBeenCalledOnce(); expect(ctx.request.get.mock.calls.map((v: any) => v[0])).toEqual(['/api/auth/get-session', '/api/explorers/v1/me']); });
    it('retains a late-created actual context after timeout and prevents retirement', async () => {
        vi.useFakeTimers();
        try {
            const s = setup();
            await s.client.start(identity);
            let settle!: (v: any) => void;
            const browser: any = { newContext: () => new Promise(r => { settle = r; }) };
            const work = s.client.createContext(browser, 'ownerA');
            const rejected = expect(work).rejects.toThrow('Guides harness');
            await vi.advanceTimersByTimeAsync(60001);
            await rejected;
            expect(s.client.snapshot().pending).toBe(1);
            settle({});
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
            expect(s.client.snapshot().openContexts).toBe(1);
            await expect(s.client.retire()).rejects.toThrow('Guides harness');
        }
        finally {
            vi.useRealTimers();
        }
    });
    it('rejects caller context proxy or storage-state overrides before creation', async () => { const s = setup(); await s.client.start(identity); const browser: any = { newContext: vi.fn() }; await expect(s.client.createContext(browser, 'ownerA', { proxy: { server: 'http://other.invalid' } })).rejects.toThrow('Guides harness'); expect(browser.newContext).not.toHaveBeenCalled(); });
    it('tracks producer creation before effects and denies retire while original work lives', async () => { const s = setup(); await s.client.start(identity); await s.client.observe(); let done!: (v: void) => void; const work = s.client.trackProducer(() => new Promise<void>(r => { done = r; })); await Promise.resolve(); expect(s.client.snapshot().pending).toBe(1); await expect(s.client.retire()).rejects.toThrow('Guides harness'); done(); await work; expect(s.client.snapshot().pending).toBe(0); });
    it('requires fixed no-artifact projects and no direct Vite API proxy', async () => {
        vi.stubEnv('PLAYWRIGHT_EXTERNAL_BASE_URL', origin);
        vi.stubEnv('GUIDES_E2E_FIXTURE_PATH', file);
        vi.stubEnv('REPLATFORM_E2E_FIXTURE_PATH', file);
        vi.stubEnv('REPLATFORM_E2E_LANE', 'guides');
        vi.stubEnv('GUIDES_E2E_FRONTEND_PORT', '55004');
        vi.stubEnv('GUIDES_E2E_ORIGIN', origin);
        try {
            const pw = (await import('../../e2e/replatform/guides.playwright.config')).default;
            expect(pw.projects?.map(p => p.name)).toEqual(['guides-desktop', 'guides-mobile']);
            expect([pw.workers, pw.retries, pw.repeatEach]).toEqual([1, 0, 1]);
            expect(pw.use).toMatchObject({ trace: 'off', video: 'off', screenshot: 'off', baseURL: origin });
            const vite = (await import('../../e2e/replatform/guides.vite.config')).default as any;
            expect(vite.server).toMatchObject({ port: 55004, hmr: false, origin, proxy: {} });
            expect(vite.envDir).toBe(false);
            expect(vite.define['import.meta.env.VITE_PUBLIC_PROFILE_GATEWAY_URL']).toBe(JSON.stringify(origin));
        }
        finally {
            vi.unstubAllEnvs();
        }
    });
    it('requires exact host-minted lane/origin/path agreement', () => {
        expect(validateGuidesEnvironment(env).origin).toBe(origin);
        for (const changed of [{ ...env, REPLATFORM_E2E_LANE: 'apps' }, { ...env, GUIDES_E2E_FIXTURE_PATH: 'relative' }, { ...env, PLAYWRIGHT_EXTERNAL_BASE_URL: 'http://localhost:55001' }])
            expect(() => validateGuidesEnvironment(changed)).toThrow('Guides harness');
    });
    it.each([Buffer.from([0xff]), Buffer.alloc(65537), Buffer.from('{"secret":"sentinel"')])('sanitizes descriptor invalid bytes', bytes => { expect(() => readGuidesDescriptor(file, fsFake(bytes))).toThrow('Guides harness'); });
    it('reads exclusive canonical descriptor and closes its handle', () => { const fs = fsFake(); expect(readGuidesDescriptor(file, fs)).toEqual(descriptor); expect(fs.closeSync).toHaveBeenCalledOnce(); });
    it('rejects descriptor origin disagreement before parent transport', () => { const fs = fsFake(Buffer.from(JSON.stringify({ ...descriptor, origin: 'http://127.0.0.1:55002' }))); expect(() => createGuidesHarnessClient(env, { fs, post: vi.fn(), clock: { now: () => 0, setTimeout: () => 1, clearTimeout: () => undefined } })).toThrow('Guides harness'); });
    it('validates exact reset, observes and retires in correlated order', async () => { const s = setup(); await s.client.start(identity); await s.client.observe(); await s.client.retire(); expect(s.posts.map(v => v.action)).toEqual(['start', 'observe', 'retire']); expect(s.posts[2]).toEqual({ v: 1, action: 'retire', ...identity, epoch: 1, nativeComplete: true, producersClosed: true }); });
    it('refuses retire before observation', async () => { const s = setup(); await s.client.start(identity); await expect(s.client.retire()).rejects.toThrow('Guides harness'); expect(s.posts).toHaveLength(1); });
    it('uses actual producer row schemas, rejects dangling live rows', async () => { expect(guidesObservationRowSchemas.guide.safeParse({ id: 'invalid' }).success).toBe(false); const s = setup(); await s.client.start(identity); s.setObservation({ version: 1, action: 'observe', runId, commit, ...identity, generation: 1, personas: people, guides: [], sections: [], media: [], objects: [], attachments: [] }); await expect(s.client.observe()).rejects.toThrow('Guides harness'); });
    it('does not let increasing remaining headers extend the inherited deadline', async () => { const s = setup(); await s.client.start(identity); const before = s.client.remainingMs(); s.post.mockImplementationOnce(async () => ({ status: 200, headers: { 'x-guides-remaining-lane-ms': '200000' }, body: Buffer.from(JSON.stringify({ v: 1, failed: true })) })); await s.client.fail(); expect(s.client.remainingMs()).toBeLessThanOrEqual(before); });
    it('retains original parent transport after timeout and denies retirement', async () => {
        vi.useFakeTimers();
        try {
            const s = setup();
            let resolve!: (v: any) => void;
            s.post.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
            const work = s.client.start(identity);
            const rejection = expect(work).rejects.toThrow('Guides harness');
            await vi.advanceTimersByTimeAsync(630001);
            await rejection;
            expect(s.client.snapshot().pending).toBe(1);
            resolve({ status: 500, headers: {}, body: Buffer.from('{}') });
            await Promise.resolve();
            await Promise.resolve();
            expect(s.client.snapshot().pending).toBe(0);
            await expect(s.client.retire()).rejects.toThrow('Guides harness');
        }
        finally {
            vi.useRealTimers();
        }
    });
});
