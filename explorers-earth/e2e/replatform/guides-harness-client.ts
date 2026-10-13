import * as fs from 'node:fs';
import path from 'node:path';
import { request } from 'node:http';
import { TextDecoder } from 'node:util';
import {captureGuidesNativeFailure,type GuidesNativeMetadata} from '../../../tunes/scripts/guides-native-diagnostic';
import type { Browser, BrowserContext, Request as BrowserRequest } from '@playwright/test';
import { GUIDES_CASES, GUIDES_PROJECTS, buildGuidesSeedPlan, guidesManifestSchema, guidesProviderObservationSchema, guidesObservationRowSchemas, type GuidesManifest } from '../../../tunes/scripts/guides-browser-support';
const owners = ['ownerA', 'ownerB', 'ownerC'] as const;
const LIMIT = 65536, RESPONSE_LIMIT = 9 * 1024 * 1024;
type Identity = {
    caseId: typeof GUIDES_CASES[number];
    project: typeof GUIDES_PROJECTS[number];
    repeat: 0;
};
type Descriptor = {
    v: 1;
    runId: string;
    commit: string;
    origin: string;
    parent: {
        url: string;
        capability: string;
    };
};
type FileStat = Pick<fs.BigIntStats, 'dev' | 'ino' | 'mode' | 'uid' | 'gid' | 'nlink' | 'mtimeNs' | 'ctimeNs' | 'size' | 'isFile' | 'isDirectory' | 'isSymbolicLink'>;
type FileSystem = {
    lstatSync(file: string, options: {
        bigint: true;
    }): FileStat;
    realpathSync(file: string): string;
    openSync(file: string, flags: number): number;
    fstatSync(fd: number, options: {
        bigint: true;
    }): FileStat;
    readSync(fd: number, bytes: Buffer, offset: number, length: number, position: null): number;
    closeSync(fd: number): void;
};
type Reply = {
    status: number;
    headers: Record<string, string>;
    body: Uint8Array;
};
type Clock = {
    now(): number;
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(timer: unknown): void;
};
type Dependencies = {
    fs: FileSystem;
    post(url: string, headers: Record<string, string>, body: string): Promise<Reply>;
    clock: Clock;
};
function denied(): never { throw Error('Guides harness invalid or unsettled'); }
function exact(value: any, keys: string[]) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(','))
        denied();
}
function origin(value: unknown) {
    const match = typeof value === 'string' && /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(value);
    const port = Number(match && match[1]);
    if (!match || port < 1024 || port > 65535 || value !== `http://127.0.0.1:${port}`)
        denied();
    return value as string;
}
function canonical(value: unknown) {
    if (typeof value !== 'string' || value.length < 1 || value.length > 1024 || /[\x00-\x1f\x7f]/.test(value) || !path.isAbsolute(value) || path.resolve(value) !== value || process.platform === 'win32' && (/[\/].*[\/]/.test(value) && value.includes('/') || value.slice(2).includes(':') || value.slice(3).split('\\').some(p => !p || /[. ]$/.test(p))))
        denied();
    return value;
}
export function validateGuidesEnvironment(environment: Record<string, string | undefined>) {
    const url = origin(environment.PLAYWRIGHT_EXTERNAL_BASE_URL), file = canonical(environment.GUIDES_E2E_FIXTURE_PATH);
    if (environment.REPLATFORM_E2E_LANE !== 'guides' || environment.REPLATFORM_E2E_FIXTURE_PATH !== file)
        denied();
    return Object.freeze({ origin: url, file });
}
/** Duplicate-key rejecting, finite JSON decoder. Errors never expose private text. */
function json(bytes: Uint8Array, limit: number): any {
    try {
        if (bytes.byteLength > limit)
            denied();
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        let i = 0, nodes = 0;
        const white = () => {
            while (/[ \t\r\n]/.test(text[i] ?? 'x'))
                i++;
        };
        const string = () => {
            const begin = i++;
            while (i < text.length) {
                const c = text[i++];
                if (c === '\\') {
                    i++;
                    continue;
                }
                if (c === '"')
                    return JSON.parse(text.slice(begin, i));
            }
            denied();
        };
        const value = (depth: number): any => {
            if (depth > 64 || ++nodes > 100000)
                denied();
            white();
            if (text[i] === '"')
                return string();
            if (text[i] === '{') {
                i++;
                const out = Object.create(null);
                white();
                if (text[i] === '}') {
                    i++;
                    return out;
                }
                for (;;) {
                    white();
                    if (text[i] !== '"')
                        denied();
                    const key = string();
                    if (Object.hasOwn(out, key))
                        denied();
                    white();
                    if (text[i++] !== ':')
                        denied();
                    out[key] = value(depth + 1);
                    white();
                    const c = text[i++];
                    if (c === '}')
                        return out;
                    if (c !== ',')
                        denied();
                }
            }
            if (text[i] === '[') {
                i++;
                const out: any[] = [];
                white();
                if (text[i] === ']') {
                    i++;
                    return out;
                }
                for (;;) {
                    out.push(value(depth + 1));
                    white();
                    const c = text[i++];
                    if (c === ']')
                        return out;
                    if (c !== ',')
                        denied();
                }
            }
            const begin = i;
            while (i < text.length && !/[\s,}\]]/.test(text[i]))
                i++;
            if (i === begin)
                denied();
            return JSON.parse(text.slice(begin, i));
        };
        const out = value(0);
        white();
        if (i !== text.length)
            denied();
        return out;
    }
    catch {
        denied();
    }
}
/** Explicit invocation only. Parent-verified Windows private ACL remains required. */
export function readGuidesDescriptor(file: string, filesystem: FileSystem = fs): Descriptor {
    let fd: number | undefined;
    try {
        canonical(file);
        const names = ['lstatSync', 'realpathSync', 'openSync', 'fstatSync', 'readSync', 'closeSync'] as const;
        for (const name of names)
            if (typeof filesystem[name] !== 'function')
                denied();
        const same = (a: any, b: any) => Object.keys(a).every(k => a[k] === b[k]);
        const identify = (s: any, isFile: boolean) => {
            if (s.isSymbolicLink() || !(isFile ? s.isFile() : s.isDirectory()))
                denied();
            const result: any = {};
            for (const field of ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'mtimeNs', 'ctimeNs']) {
                if (typeof s[field] !== 'bigint')
                    denied();
                result[field] = s[field];
            }
            if (isFile) {
                if (typeof s.size !== 'bigint' || s.size < 1n || s.size > BigInt(LIMIT) || s.nlink !== 1n)
                    denied();
                result.size = s.size;
            }
            return result;
        };
        const inspect = (p: string, isFile: boolean) => {
            if (filesystem.realpathSync(p) !== p)
                denied();
            return identify(filesystem.lstatSync(p, { bigint: true }), isFile);
        };
        const ancestors: {
            p: string;
            id: any;
        }[] = [];
        for (let p = path.dirname(file), n = 0;; n++) {
            if (n > 1024)
                denied();
            ancestors.push({ p, id: inspect(p, false) });
            const parent = path.dirname(p);
            if (parent === p)
                break;
            p = parent;
        }
        const before = inspect(file, true);
        fd = filesystem.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
        if (!Number.isSafeInteger(fd) || fd < 0 || !same(before, identify(filesystem.fstatSync(fd, { bigint: true }), true)))
            denied();
        const bytes = Buffer.alloc(Number(before.size) + 1);
        let count = 0, calls = 0;
        while (count < bytes.length) {
            if (++calls > LIMIT + 2)
                denied();
            const length = Math.min(4096, bytes.length - count), n = filesystem.readSync(fd, bytes, count, length, null);
            if (!Number.isSafeInteger(n) || n < 0 || n > length)
                denied();
            if (n === 0)
                break;
            count += n;
        }
        if (count !== Number(before.size) || !same(before, identify(filesystem.fstatSync(fd, { bigint: true }), true)) || !same(before, inspect(file, true)) || ancestors.some(a => !same(a.id, inspect(a.p, false))))
            denied();
        const closing = fd;
        fd = undefined;
        filesystem.closeSync(closing);
        const v = json(bytes.subarray(0, count), LIMIT);
        exact(v, ['v', 'runId', 'commit', 'origin', 'parent']);
        exact(v.parent, ['url', 'capability']);
        if (v.v !== 1 || !/^[a-f0-9]{32}$/.test(v.runId) || !/^[a-f0-9]{40}$/.test(v.commit) || !/^[a-f0-9]{64}$/.test(v.parent.capability))
            denied();
        origin(v.origin);
        if (typeof v.parent.url !== 'string' || !v.parent.url.endsWith('/control'))
            denied();
        const parent = origin(v.parent.url.slice(0, -8));
        if (parent === v.origin)
            denied();
        return Object.freeze({ ...v, parent: Object.freeze({ ...v.parent }) });
    }
    catch {
        if (fd !== undefined)
            try {
                filesystem.closeSync(fd);
            }
            catch { }
        denied();
    }
}
const FIXTURES = {
    'old-cover': 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mP8z4AdMDEMKQkAzUEBD7t4NqoAAAAASUVORK5CYII=',
    'replacement-cover': 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFUlEQVR42mNkYPjPgA0wMeAAg1MCAMtDAQ9w2TiCAAAAAElFTkSuQmCC',
    'activity-import': '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAIAAgDAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDu6/h8/wA4j//Z',
} as const;
/** Returns a fresh copy of fixed real bytes; no file or provider access. */
export function guidesFixtureBytes(id: keyof typeof FIXTURES) {
    if (!Object.hasOwn(FIXTURES, id))
        denied();
    return new Uint8Array(Buffer.from(FIXTURES[id], 'base64'));
}
function nativePost(url: string, headers: Record<string, string>, body: string): Promise<Reply> {
    return new Promise((resolve, reject) => {
        let ended = false, closed = false, failure = false, status = 0, parts: Buffer[] = [], size = 0, received: Record<string, string> = {};
        const finish = () => {
            if (!closed)
                return;
            if (!ended || failure)
                reject(Error('Guides harness transport unsettled'));
            else
                resolve({ status, headers: received, body: Buffer.concat(parts) });
        };
        const req = request(url, { method: 'POST', agent: false, headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body)) } }, res => {
            status = res.statusCode ?? 0;
            let remaining = 0;
            for (let i = 0; i < res.rawHeaders.length; i += 2)
                if (res.rawHeaders[i].toLowerCase() === 'x-guides-remaining-lane-ms')
                    remaining++;
            if (remaining > 1)
                failure = true;
            for (const [key, value] of Object.entries(res.headers))
                if (typeof value === 'string')
                    received[key] = value;
            res.on('data', (chunk: Buffer) => {
                size += chunk.length;
                if (size > RESPONSE_LIMIT) {
                    failure = true;
                    req.destroy();
                }
                else
                    parts.push(chunk);
            });
            res.once('end', () => { ended = res.complete; finish(); });
            res.once('error', () => { failure = true; req.destroy(); });
            res.once('close', () => {
                if (!ended) {
                    failure = true;
                    req.destroy();
                }
            });
        });
        req.once('error', () => { failure = true; });
        req.once('close', () => { closed = true; finish(); });
        req.end(body);
    });
}
const native: Dependencies = { fs, post: nativePost, clock: { now: () => performance.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>) } };
/** Node-only owner of its actual transport/context producer promises. No import effects. */
export function createGuidesHarnessClient(environment: Record<string, string | undefined> = process.env, dependencies: Dependencies = native) {
    exact(dependencies, ['fs', 'post', 'clock']);
    exact(dependencies.clock, ['now', 'setTimeout', 'clearTimeout']);
    if (typeof dependencies.post !== 'function' || Object.values(dependencies.clock).some(v => typeof v !== 'function'))
        denied();
    const e = validateGuidesEnvironment(environment), descriptor = readGuidesDescriptor(e.file, dependencies.fs);
    if (descriptor.origin !== e.origin)
        denied();
    const d = dependencies;
    let deadline = d.clock.now() + 21600000, failed = false, busy = false, lastEpoch = 0, total = 0;
    let firstFailure:GuidesNativeMetadata|undefined;
    let active: {
        identity: Identity;
        epoch: number;
        manifest: GuidesManifest;
        sessions: any;
        observed: boolean;
    } | undefined;
    const operations = new Set<Promise<unknown>>(), contexts = new Map<BrowserContext, 'open' | 'closed'>(), cookies = new Set<string>(), completed = new Set<string>();
    const providerRequests = new Set<BrowserRequest>();
    const providerPaths = new Set(['/__guides_provider__/v1/search', '/__guides_provider__/v1/places/guides-fixture-museum/details', '/__guides_provider__/v1/places/guides-fixture-museum/price', '/__guides_provider__/v1/places/guides-fixture-museum/photos', '/__guides_provider__/v1/photos/guides-fixture-photo.jpg']);
    let contextReservations = 0;
    const remainingMs = () => Math.max(0, Math.floor(deadline - d.clock.now()));
    const check = () => {
        if (failed || remainingMs() < 1)
            denied();
    };
    function requireOperationSlot() {
        if (total >= 4096) {
            failed = true;
            denied();
        }
    }
    function track<T>(operation: () => Promise<T>) {
        requireOperationSlot();
        total++;
        const original=Promise.resolve().then(operation);
        operations.add(original);
        original.then(() => operations.delete(original), () => { operations.delete(original); failed = true; });
        return original;
    }
    async function bounded<T>(operation: () => Promise<T>, ceiling: number) {
        const owned = track(operation);
        let timer: unknown;
        try {
            return await Promise.race([owned, new Promise<never>((_, reject) => { timer = d.clock.setTimeout(() => { failed = true; reject(Error('Guides harness timeout unsettled')); }, Math.max(1, Math.min(remainingMs(), ceiling))); })]);
        }
        catch (error) {
            firstFailure ??= captureGuidesNativeFailure(error);
            failed = true;
            denied();
        }
        finally {
            d.clock.clearTimeout(timer);
        }
    }
    const identity = (i: Identity) => {
        exact(i, ['caseId', 'project', 'repeat']);
        if (!GUIDES_CASES.includes(i.caseId) || !GUIDES_PROJECTS.includes(i.project) || i.repeat !== 0)
            denied();
        return { ...i };
    };
    async function command(action: 'start' | 'observe' | 'retire' | 'fail', selected: Identity, epoch?: number) {
        const sentAt = d.clock.now();
        const body = JSON.stringify({ v: 1, action, ...selected, ...(epoch === undefined ? {} : { epoch }), ...(action === 'retire' ? { nativeComplete: true, producersClosed: true } : {}),...(action==='fail'?{failure:firstFailure??null}:{}) });
        if (Buffer.byteLength(body) > 4096)
            denied();
        const result = await bounded(() => d.post(descriptor.parent.url, { 'x-guides-parent-capability': descriptor.parent.capability }, body), action === 'start' ? 630000 : action === 'observe' ? 310000 : 30000);
        if (result.status !== 200)
            denied();
        const header = result.headers['x-guides-remaining-lane-ms'];
        if (!/^[1-9][0-9]{0,7}$/.test(header) || Number(header) > 21600000)
            denied();
        deadline = Math.min(deadline, sentAt + Number(header));
        return json(result.body, RESPONSE_LIMIT);
    }
    async function start(input: Identity) {
        check();
        if (busy || active || lastEpoch >= 16)
            denied();
        const selected = identity(input), key = JSON.stringify(selected);
        if (completed.has(key))
            denied();
        busy = true;
        try {
            const result = await command('start', selected);
            exact(result, ['v', 'epoch', 'reset']);
            if (result.v !== 1 || result.epoch !== lastEpoch + 1)
                denied();
            const r = result.reset;
            exact(r, ['version', 'action', 'runId', 'commit', 'caseId', 'project', 'repeat', 'generation', 'manifest', 'sessions']);
            if (r.version !== 1 || r.action !== 'reset' || r.runId !== descriptor.runId || r.commit !== descriptor.commit || r.caseId !== selected.caseId || r.project !== selected.project || r.repeat !== 0 || r.generation !== 1)
                denied();
            exact(r.sessions, [...owners]);
            exact(r.manifest.personas, [...owners]);
            const personas: any = {};
            for (const owner of owners) {
                const { accountRevision, ...binding } = r.manifest.personas[owner];
                personas[owner] = binding;
                exact(r.sessions[owner], ['cookie']);
                const cookie = r.sessions[owner].cookie;
                if (typeof cookie !== 'string' || cookie.length > 8192 || !/^better-auth\.session_token=[A-Za-z0-9_-]+\.[A-Za-z0-9+/=]+$/.test(cookie) || cookies.has(cookie))
                    denied();
                cookies.add(cookie);
            }
            const manifest = guidesManifestSchema.parse({ expected: { version: 1, runId: descriptor.runId, commit: descriptor.commit, ...selected, generation: 1, personas }, manifest: r.manifest, fixtureBytes: Object.fromEntries([...new Set(buildGuidesSeedPlan(selected.caseId).mediaRoles.map(role => role.key === 'replacement-cover' ? 'replacement-cover' : role.key === 'activity-import' ? 'activity-import' : 'old-cover'))].map(key => [key, guidesFixtureBytes(key)])) });
            check();
            lastEpoch = result.epoch;
            active = { identity: selected, epoch: lastEpoch, manifest, sessions: r.sessions, observed: false };
            return structuredClone(manifest);
        }
        catch {
            failed = true;
            denied();
        }
        finally {
            busy = false;
        }
    }
    async function observe() {
        check();
        if (busy || !active)
            denied();
        busy = true;
        try {
            const result = await command('observe', active.identity, active.epoch);
            exact(result, ['v', 'epoch', 'observation']);
            if (result.v !== 1 || result.epoch !== active.epoch)
                denied();
            const o = result.observation;
            exact(o, ['version', 'action', 'runId', 'commit', 'caseId', 'project', 'repeat', 'generation', 'personas', 'guides', 'sections', 'media', 'objects', 'attachments', 'provider']);
            if (o.version !== 1 || o.action !== 'observe' || o.runId !== descriptor.runId || o.commit !== descriptor.commit || o.caseId !== active.identity.caseId || o.project !== active.identity.project || o.repeat !== 0 || o.generation !== 1)
                denied();
            const provider = guidesProviderObservationSchema.parse(o.provider);
            if (provider.epoch !== active.epoch || provider.error !== null || active.identity.caseId !== GUIDES_CASES[6] && Object.values(provider.counts).some(count => count !== 0))
                denied();
            exact(o.personas, [...owners]);
            for (const owner of owners) {
                const p = guidesObservationRowSchemas.persona.parse(o.personas[owner]), expected = active.manifest.personas[owner];
                for (const key of ['userId', 'accountId', 'handle'] as const)
                    if (p[key] !== expected[key])
                        denied();
            }
            const rows: any = {};
            for (const [key, schema] of Object.entries({ guides: guidesObservationRowSchemas.guide, sections: guidesObservationRowSchemas.section, media: guidesObservationRowSchemas.media, objects: guidesObservationRowSchemas.object, attachments: guidesObservationRowSchemas.attachment })) {
                if (!Array.isArray(o[key]) || o[key].length > 5000)
                    denied();
                rows[key] = o[key].map((v: unknown) => schema.parse(v));
            }
            const accountIds = owners.map(owner => active!.manifest.personas[owner].accountId);
            for (const key of ['guides', 'sections', 'media', 'objects', 'attachments'])
                if (rows[key].some((r: any) => !accountIds.includes(r.accountId)))
                    denied();
            for (const key of ['guides', 'sections', 'media'])
                if (new Set(rows[key].map((r: any) => r.id)).size !== rows[key].length)
                    denied();
            for (const s of rows.sections)
                if (!rows.guides.some((g: any) => g.id === s.collectionId && g.accountId === s.accountId))
                    denied();
            for (const obj of rows.objects)
                if (obj.environment !== 'local' || obj.key !== `local/${obj.accountId}/${obj.mediaId}` || !rows.media.some((m: any) => m.id === obj.mediaId && m.accountId === obj.accountId))
                    denied();
            for (const a of rows.attachments)
                if (!rows.guides.some((g: any) => g.id === a.guideId && g.accountId === a.accountId) || !rows.media.some((m: any) => m.id === a.mediaId && m.accountId === a.accountId) || a.slot === 'section-photo' && !rows.sections.some((s: any) => s.id === a.sectionId && s.collectionId === a.guideId && s.accountId === a.accountId))
                    denied();
            const attachmentKey = (a: any) => JSON.stringify([a.slot, a.guideId, a.sectionId ?? null, a.mediaId]);
            if (new Set(rows.attachments.map(attachmentKey)).size !== rows.attachments.length || new Set(rows.objects.map((o: any) => JSON.stringify([o.mediaId, o.variant, o.environment]))).size !== rows.objects.length)
                denied();
            for (const s of rows.sections) {
                const ids = new Set([...s.blocks.timeline.morning, ...s.blocks.timeline.afternoon, ...s.blocks.timeline.evening, ...s.blocks.stay.accommodations, ...s.blocks.activities.activities].flatMap((p: any) => p.photos.map((p: any) => p.mediaId)));
                const registered = rows.attachments.filter((a: any) => a.slot === 'section-photo' && a.sectionId === s.id).map((a: any) => a.mediaId);
                if (ids.size !== registered.length || registered.some((id: string) => !ids.has(id)))
                    denied();
            }
            for (const a of rows.attachments)
                if (!rows.media.some((m: any) => m.id === a.mediaId && m.purpose === (a.slot === 'cover' ? 'collection' : 'guide')))
                    denied();
            check();
            active.observed = true;
            return structuredClone(o);
        }
        catch {
            failed = true;
            denied();
        }
        finally {
            busy = false;
        }
    }
    async function createContext(browser: Browser, owner: typeof owners[number], options: Parameters<Browser['newContext']>[0] = {}) {
        check();
        if (busy || !active || !owners.includes(owner) || contexts.size + contextReservations >= 64 || !options || typeof options !== 'object' || Array.isArray(options))
            denied();
        if (Object.keys(options).some(key => !['viewport', 'deviceScaleFactor', 'isMobile', 'hasTouch'].includes(key)))
            denied();
        const selected = active;
        requireOperationSlot();
        contextReservations++;
        const work = async () => {
            let context: BrowserContext;
            try {
                context = await browser.newContext({ ...options, baseURL: descriptor.origin });
            }
            catch {
                contextReservations--;
                throw Error('Guides harness context creation failed');
            }
            contextReservations--;
            contexts.set(context, 'open');
            check();
            const cookie = selected.sessions[owner].cookie, index = cookie.indexOf('=');
            await context.addCookies([{ name: cookie.slice(0, index), value: cookie.slice(index + 1), url: descriptor.origin, httpOnly: true, sameSite: 'Lax' }]);
            const ownedProviderRequest = (request: BrowserRequest) => {
                const url = new URL(request.url());
                return url.origin === descriptor.origin && providerPaths.has(url.pathname) && request.url() === `${descriptor.origin}${url.pathname}` && request.method() === 'GET' && request.postData() === null && request.redirectedFrom() === null && active === selected && selected.identity.caseId === GUIDES_CASES[6] && !busy && !failed;
            };
            context.on('request', request => {
                if (!new URL(request.url()).pathname.startsWith('/__guides_provider__')) return;
                if (!ownedProviderRequest(request) || providerRequests.size >= 5) { failed = true; return; }
                providerRequests.add(request);
            });
            context.on('requestfinished', request => { providerRequests.delete(request); });
            context.on('requestfailed', request => { if (providerRequests.delete(request)) failed = true; });
            await context.route('**/*', route => {
                const request = route.request(), url = new URL(request.url());
                if (url.pathname.startsWith('/__guides_provider__')) return ownedProviderRequest(request) ? route.continue() : route.abort();
                return url.origin === descriptor.origin || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
            });
            for (const [url, validate] of [['/api/auth/get-session', (v: any) => v.user?.id === selected.manifest.personas[owner].userId], ['/api/explorers/v1/me', (v: any) => v.account?.id === selected.manifest.personas[owner].accountId && v.account?.handle === selected.manifest.personas[owner].handle]] as const) {
                const response = await context.request.get(url);
                try {
                    if (response.status() !== 200 || !validate(await response.json()))
                        denied();
                }
                finally {
                    await response.dispose();
                }
            }
            check();
            return context;
        };
        return bounded(work, 60000);
    }
    async function closeContext(context: BrowserContext) {
        if (contexts.get(context) !== 'open')
            denied();
        return bounded(async () => { await context.close(); contexts.set(context, 'closed'); }, 30000);
    }
    async function retire() {
        check();
        if (busy || !active || !active.observed || operations.size)
            denied();
        busy = true;
        try {
            for (const [context, state] of contexts)
                if (state === 'open')
                    await closeContext(context);
            if (operations.size || providerRequests.size || failed)
                denied();
            const result = await command('retire', active.identity, active.epoch);
            exact(result, ['v', 'epoch', 'retired']);
            if (result.v !== 1 || result.epoch !== active.epoch || result.retired !== true)
                denied();
            check();
            completed.add(JSON.stringify(active.identity));
            active = undefined;
            contexts.clear();
        }
        catch {
            failed = true;
            denied();
        }
        finally {
            busy = false;
        }
    }
    async function fail() {
        if (!active) {
            failed = true;
            return;
        }
        try {
            const result = await command('fail', active.identity, active.epoch);
            exact(result, ['v', 'failed']);
            if (result.v !== 1 || result.failed !== true)
                denied();
        }
        finally {
            failed = true;
        }
    }
    return Object.freeze({ start, observe, createContext, closeContext, retire, fail, remainingMs,captureFailure(error:unknown){firstFailure??=captureGuidesNativeFailure(error);}, trackProducer<T>(operation: () => Promise<T>) {
            check();
            if (busy || !active || typeof operation !== 'function')
                denied();
            return bounded(operation, 900000);
        }, snapshot: () => Object.freeze({ pending: operations.size + providerRequests.size, openContexts: [...contexts.values()].filter(v => v === 'open').length, failed, epoch: lastEpoch }) });
}
