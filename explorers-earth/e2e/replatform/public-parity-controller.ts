import * as fs from 'node:fs';
import path from 'node:path';
import { request } from 'node:http';
import { TextDecoder } from 'node:util';
import type { Browser, BrowserContext } from '@playwright/test';
import { PUBLIC_PARITY_CASES, PUBLIC_PARITY_PROJECTS, PEOPLE_CASES, PEOPLE_PROJECTS, publicParityIssuedManifestSchema, publicParityObservationSchema, type PublicParityIssuedManifest, type PublicParityExpectedManifest } from '../../../tunes/scripts/public-parity-browser-support';
import { isProxy } from 'node:util/types';
const LIMIT = 65536, RESPONSE_LIMIT = 9 * 1024 * 1024;
export type PublicParityIdentity = {
    caseId: typeof PUBLIC_PARITY_CASES[number] | typeof PEOPLE_CASES[number];
    project: typeof PUBLIC_PARITY_PROJECTS[number] | typeof PEOPLE_PROJECTS[number];
    repeat: 0;
};
export type PublicParityDescriptor = {
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
export type PublicParityDependencies = {
    fs: FileSystem;
    post(url: string, headers: Record<string, string>, body: string, signal: AbortSignal): Promise<Reply>;
    clock: Clock;
};
function denied(): never { throw Error('Public parity harness invalid or unsettled'); }
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
export function validatePublicParityEnvironment(environment: Record<string, string | undefined>) {
    const url = origin(environment.PLAYWRIGHT_EXTERNAL_BASE_URL), file = canonical(environment.PUBLIC_PARITY_E2E_FIXTURE_PATH);
    if (!['public-parity', 'people'].includes(environment.REPLATFORM_E2E_LANE ?? '') || environment.REPLATFORM_E2E_FIXTURE_PATH !== file)
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
                const out: Record<string, unknown> = {};
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
                    Object.defineProperty(out, key, { value: value(depth + 1), enumerable: true, writable: true, configurable: true });
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
export function readPublicParityDescriptor(file: string, filesystem: FileSystem, policy: PublicParityPolicy): PublicParityDescriptor {
    let fd: number | undefined;
    try {
        validatePublicParityPolicy(policy);
        canonical(file);
        const names = ['lstatSync', 'realpathSync', 'openSync', 'fstatSync', 'readSync', 'closeSync'] as const;
        if (!filesystem || isProxy(filesystem))
            denied();
        const captured: any = {};
        for (const name of names) {
            const descriptor = Object.getOwnPropertyDescriptor(filesystem, name);
            if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function')
                denied();
            captured[name] = descriptor.value.bind(filesystem);
        }
        filesystem = Object.freeze(captured);
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
export const PUBLIC_PARITY_QUALIFICATION_POLICY = Object.freeze({ suiteMs: 21600000, rateWindowMs: 65000, startMs: 630000, observeMs: 310000, controlMs: 30000, contextMs: 60000, producerMs: 900000, maxOperations: 4096, maxContexts: 64, descriptorBytes: 65536, responseBytes: 9 * 1024 * 1024, commandBytes: 4096, sessionBytes: 8192, maxJsonDepth: 64, maxJsonNodes: 100000 });
export type PublicParityPolicy = typeof PUBLIC_PARITY_QUALIFICATION_POLICY;
function data(value: unknown): Record<string, any> { if (!value || typeof value !== 'object' || isProxy(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    denied(); const descriptors = Object.getOwnPropertyDescriptors(value); if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string') || Object.values(descriptors).some(d => !d.enumerable || !Object.hasOwn(d, 'value')))
    denied(); return Object.fromEntries(Object.entries(descriptors).map(([key, d]) => [key, d.value])); }
export function validatePublicParityPolicy(input: unknown): PublicParityPolicy { const values = data(input); exact(values, Object.keys(PUBLIC_PARITY_QUALIFICATION_POLICY)); for (const key of Object.keys(PUBLIC_PARITY_QUALIFICATION_POLICY) as (keyof PublicParityPolicy)[])
    if (values[key] !== PUBLIC_PARITY_QUALIFICATION_POLICY[key] || !Number.isSafeInteger(values[key]) || values[key] < 1)
        denied(); return Object.freeze({ ...values }) as PublicParityPolicy; }
function nativePost(url: string, headers: Record<string, string>, body: string, signal: AbortSignal): Promise<Reply> { return new Promise((resolve, reject) => { let closed = false, ended = false, failed = false, status = 0, size = 0; const parts: Buffer[] = [], received: Record<string, string> = {}; const finish = () => { if (!closed)
    return; signal.removeEventListener('abort', abort); if (failed || !ended)
    reject(Error('Public parity transport refused'));
else
    resolve({ status, headers: received, body: Buffer.concat(parts) }); }; const req = request(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) } }, res => { status = res.statusCode ?? 0; for (const [key, value] of Object.entries(res.headers))
    if (typeof value === 'string')
        received[key] = value; res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > RESPONSE_LIMIT) {
    failed = true;
    req.destroy();
}
else
    parts.push(chunk); }); res.once('end', () => { ended = res.complete; finish(); }); res.once('error', () => { failed = true; req.destroy(); }); res.once('close', () => { if (!ended) {
    failed = true;
    req.destroy();
} }); }); const abort = () => { failed = true; req.destroy(); }; signal.addEventListener('abort', abort, { once: true }); req.once('error', () => { failed = true; }); req.once('close', () => { closed = true; finish(); }); if (signal.aborted)
    abort();
else
    req.end(body); }); }
export const publicParityNativeDependencies: PublicParityDependencies = Object.freeze({ fs, post: nativePost, clock: Object.freeze({ now: () => performance.now(), setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>) }) });
/** Inert constructor. Data parsing conveys no authority: the protected root's
 * private session/control issuer alone owns native composition and observations. */
export function createPublicParityHarnessClient(environment: Record<string, string | undefined>, dependencies: PublicParityDependencies, policyInput: PublicParityPolicy) {
    const policy = validatePublicParityPolicy(policyInput), env = Object.freeze(environment === process.env ? Object.fromEntries(['REPLATFORM_E2E_LANE', 'PLAYWRIGHT_EXTERNAL_BASE_URL', 'PUBLIC_PARITY_E2E_FIXTURE_PATH', 'REPLATFORM_E2E_FIXTURE_PATH'].map(key => { const descriptor = Object.getOwnPropertyDescriptor(environment, key); if (!descriptor || !Object.hasOwn(descriptor, 'value'))
        denied(); return [key, descriptor.value]; })) : data(environment)), e = validatePublicParityEnvironment(env);
    const deps = data(dependencies);
    exact(deps, ['fs', 'post', 'clock']);
    const clock = data(deps.clock);
    exact(clock, ['now', 'setTimeout', 'clearTimeout']);
    if (typeof deps.post !== 'function' || Object.values(clock).some(value => typeof value !== 'function') || isProxy(deps.fs))
        denied();
    const filesystem: any = {};
    for (const key of ['lstatSync', 'realpathSync', 'openSync', 'fstatSync', 'readSync', 'closeSync']) {
        const method = Object.getOwnPropertyDescriptor(deps.fs, key);
        if (!method || !Object.hasOwn(method, 'value') || typeof method.value !== 'function')
            denied();
        filesystem[key] = method.value.bind(deps.fs);
    }
    const d = { fs: Object.freeze(filesystem) as FileSystem, post: deps.post as PublicParityDependencies['post'], clock: { now: clock.now.bind(deps.clock), setTimeout: clock.setTimeout.bind(deps.clock), clearTimeout: clock.clearTimeout.bind(deps.clock) } };
    let descriptor: PublicParityDescriptor | undefined, deadline: number | undefined, failed = false, busy = false, lastEpoch = 0, total = 0, reservations = 0;
    const operations = new Set<Promise<unknown>>(), controllers = new Set<AbortController>(), contexts = new Map<BrowserContext, 'open' | 'closed'>(), cookies = new Set<string>(), completed = new Set<string>();
    let active: {
        identity: PublicParityIdentity;
        manifest: PublicParityIssuedManifest;
        expected: PublicParityExpectedManifest;
        sessions: Record<'ownerA' | 'ownerB', {
            cookie: string;
        }>;
        epoch: number;
        observed: boolean;
        rotationIssued: boolean;
        currentPersonas: PublicParityIssuedManifest['personas'];
    } | undefined;
    const remainingMs = () => deadline === undefined ? 0 : Math.max(0, Math.floor(deadline - d.clock.now()));
    const check = () => { if (failed || deadline === undefined || remainingMs() < 1)
        denied(); };
    const seal = () => { failed = true; for (const controller of controllers)
        controller.abort(); };
    function track<T>(operation: (signal: AbortSignal) => Promise<T>) { if (++total > policy.maxOperations)
        denied(); const controller = new AbortController(); controllers.add(controller); const original = Promise.resolve().then(() => operation(controller.signal)); operations.add(original); void original.then(() => { operations.delete(original); controllers.delete(controller); }, () => { operations.delete(original); controllers.delete(controller); seal(); }); return { original, controller }; }
    async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>, ceiling: number, closing = false): Promise<T> { if (!closing)
        check();
    else if (deadline === undefined || remainingMs() < 1)
        denied(); const owned = track(operation); let timer: unknown; try {
        return await Promise.race([owned.original, new Promise<never>((_resolve, reject) => { timer = d.clock.setTimeout(() => { seal(); reject(Error('Public parity operation unsettled')); }, Math.max(1, Math.min(remainingMs(), ceiling))); })]);
    }
    catch {
        seal();
        denied();
    }
    finally {
        d.clock.clearTimeout(timer);
    } }
    function identity(input: unknown): PublicParityIdentity { const value = data(input); exact(value, ['caseId', 'project', 'repeat']); const publicLane = env.REPLATFORM_E2E_LANE === 'public-parity'; if (value.repeat !== 0 || !((publicLane ? PUBLIC_PARITY_CASES : PEOPLE_CASES) as readonly string[]).includes(value.caseId) || !((publicLane ? PUBLIC_PARITY_PROJECTS : PEOPLE_PROJECTS) as readonly string[]).includes(value.project))
        denied(); return Object.freeze({ ...value }) as PublicParityIdentity; }
    async function command(action: 'start' | 'observe' | 'retire' | 'fail', selected: PublicParityIdentity, epoch?: number) { if (!descriptor)
        denied(); const sentAt = d.clock.now(), body = JSON.stringify({ v: 1, action, ...selected, ...(epoch === undefined ? {} : { epoch }), ...(action === 'retire' ? { nativeComplete: true, producersClosed: true } : {}) }); if (Buffer.byteLength(body) > policy.commandBytes)
        denied(); const reply = await bounded(signal => d.post(descriptor!.parent.url, { 'x-public-parity-parent-capability': descriptor!.parent.capability }, body, signal), action === 'start' ? policy.startMs : action === 'observe' ? policy.observeMs : policy.controlMs, action === 'fail'); if (reply.status !== 200)
        denied(); const remaining = reply.headers['x-public-parity-remaining-lane-ms']; if (!/^[1-9][0-9]{0,7}$/.test(remaining) || Number(remaining) > policy.suiteMs)
        denied(); deadline = Math.min(deadline!, sentAt + Number(remaining)); return json(reply.body, policy.responseBytes); }
    async function start(input: PublicParityIdentity) { if (failed || busy || active || lastEpoch >= (env.REPLATFORM_E2E_LANE === 'public-parity' ? 32 : 12))
        denied(); const selected = identity(input), key = JSON.stringify(selected); if (completed.has(key))
        denied(); if (!descriptor) {
        descriptor = readPublicParityDescriptor(e.file, d.fs, policy);
        if (descriptor.origin !== e.origin)
            denied();
        deadline = d.clock.now() + policy.suiteMs;
    } check(); busy = true; try {
        const reply = await command('start', selected);
        exact(reply, ['v', 'epoch', 'reset']);
        if (reply.v !== 1 || !Number.isSafeInteger(reply.epoch) || reply.epoch < 1 || reply.epoch > (env.REPLATFORM_E2E_LANE === 'public-parity' ? 32 : 12) || (lastEpoch !== 0 && reply.epoch !== lastEpoch + 1))
            denied();
        const reset = reply.reset;
        exact(reset, ['version', 'action', 'runId', 'commit', 'family', 'caseId', 'project', 'repeat', 'generation', 'personas', 'manifest', 'sessions']);
        const family: 'public-parity' | 'people' = env.REPLATFORM_E2E_LANE === 'public-parity' ? 'public-parity' : 'people';
        if (reset.version !== 1 || reset.action !== 'reset' || reset.runId !== descriptor.runId || reset.commit !== descriptor.commit || reset.family !== family || reset.caseId !== selected.caseId || reset.project !== selected.project || reset.repeat !== 0 || reset.generation !== 1)
            denied();
        exact(reset.sessions, ['ownerA', 'ownerB']);
        const sessions = {} as Record<'ownerA' | 'ownerB', {
            cookie: string;
        }>;
        for (const owner of ['ownerA', 'ownerB'] as const) {
            exact(reset.sessions[owner], ['cookie']);
            const cookie = reset.sessions[owner].cookie;
            if (typeof cookie !== 'string' || cookie.length > policy.sessionBytes || !/^better-auth\.session_token=[A-Za-z0-9_-]+\.[A-Za-z0-9+/=]+$/.test(cookie) || cookies.has(cookie))
                denied();
            cookies.add(cookie);
            sessions[owner] = Object.freeze({ cookie });
        }
        const expected = { version: 1 as const, runId: descriptor.runId, commit: descriptor.commit, family, caseId: selected.caseId, project: selected.project, repeat: 0 as const, generation: 1 as const, epoch: reply.epoch, origin: descriptor.origin, personas: reset.personas };
        const manifest = publicParityIssuedManifestSchema.parse({ expected, manifest: reset.manifest });
        check();
        lastEpoch = reply.epoch;
        active = { identity: selected, manifest, expected, sessions: Object.freeze(sessions), epoch: lastEpoch, observed: false, rotationIssued: false, currentPersonas: manifest.personas };
        return manifest;
    }
    catch {
        seal();
        denied();
    }
    finally {
        busy = false;
    } }
    async function observe() { if (!active || busy)
        denied(); check(); busy = true; try {
        const selected = active, reply = await command('observe', selected.identity, selected.epoch);
        exact(reply, Object.hasOwn(reply, 'replacementSessions') ? ['v', 'epoch', 'observation', 'replacementSessions'] : ['v', 'epoch', 'observation']);
        if (reply.v !== 1 || reply.epoch !== selected.epoch)
            denied();
        const result = publicParityObservationSchema.parse({ expected: selected.expected, observation: reply.observation });
        check();
        if (Object.hasOwn(reply, 'replacementSessions')) {
            if (selected.identity.caseId !== PUBLIC_PARITY_CASES[7] || selected.expected.family !== 'public-parity' || selected.rotationIssued)
                denied();
            const replacement = reply.replacementSessions;
            exact(replacement, ['ownerA']);
            exact(replacement.ownerA, ['cookie']);
            const cookie = replacement.ownerA.cookie;
            if (typeof cookie !== 'string' || cookie.length > policy.sessionBytes || !/^better-auth\.session_token=[A-Za-z0-9_-]+\.[A-Za-z0-9+/=]+$/.test(cookie) || cookies.has(cookie))
                denied();
            cookies.add(cookie);
            selected.sessions = Object.freeze({ ...selected.sessions, ownerA: Object.freeze({ cookie }) });
            selected.rotationIssued = true;
        }
        selected.observed = true;
        selected.currentPersonas = result.personas;
        return result;
    }
    catch {
        seal();
        denied();
    }
    finally {
        busy = false;
    } }
    async function closeContext(context: BrowserContext) { if (contexts.get(context) !== 'open')
        denied(); return bounded(async () => { await context.close(); contexts.set(context, 'closed'); }, policy.controlMs, true); }
    async function createContext(browser: Browser, owner: 'ownerA' | 'ownerB' | 'anonymous', options: Parameters<Browser['newContext']>[0] = {}) { if (!active || busy || !['ownerA', 'ownerB', 'anonymous'].includes(owner) || contexts.size + reservations >= policy.maxContexts)
        denied(); check(); const opts = data(options); if (Object.keys(opts).some(key => !['viewport', 'deviceScaleFactor', 'isMobile', 'hasTouch'].includes(key)))
        denied(); if (Object.hasOwn(opts, 'viewport')) {
        const viewport = data(opts.viewport);
        exact(viewport, ['width', 'height']);
        if (!['width', 'height'].every(key => Number.isSafeInteger(viewport[key]) && viewport[key] > 0))
            denied();
        opts.viewport = Object.freeze({ ...viewport });
    } for (const key of ['isMobile', 'hasTouch'])
        if (Object.hasOwn(opts, key) && typeof opts[key] !== 'boolean')
            denied(); if (Object.hasOwn(opts, 'deviceScaleFactor') && (!Number.isFinite(opts.deviceScaleFactor) || opts.deviceScaleFactor <= 0))
        denied(); const selected = active; reservations++; return bounded(async () => { let context: BrowserContext; try {
        context = await browser.newContext({ ...opts, baseURL: descriptor!.origin });
        contexts.set(context, 'open');
    }
    finally {
        reservations--;
    } if (failed || active !== selected) {
        await context.close();
        contexts.set(context, 'closed');
        denied();
    } try {
        await context.route('**/*', route => { const url = new URL(route.request().url()); return url.origin === descriptor!.origin || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort(); });
        if (owner !== 'anonymous') {
            const cookie = selected.sessions[owner].cookie, index = cookie.indexOf('=');
            await context.addCookies([{ name: cookie.slice(0, index), value: cookie.slice(index + 1), url: descriptor!.origin, httpOnly: true, sameSite: 'Lax' }]);
            for (const [suffix, verify] of [['/api/auth/get-session', (v: any) => v.user?.id === selected.currentPersonas[owner].userId], ['/api/explorers/v1/me', (v: any) => v.account?.id === selected.currentPersonas[owner].accountId && v.account?.handle === selected.currentPersonas[owner].handle]] as const) {
                check();
                const response = await context.request.get(descriptor!.origin + suffix, { timeout: Math.min(remainingMs(), policy.contextMs) });
                try {
                    if (response.status() !== 200 || !verify(await response.json()))
                        denied();
                }
                finally {
                    await response.dispose();
                }
            }
        }
        check();
        return context;
    }
    catch {
        await context.close();
        contexts.set(context, 'closed');
        throw Error('Public parity context refused');
    } }, policy.contextMs); }
    async function retire() { if (!active || busy || !active.observed || operations.size || reservations)
        denied(); check(); busy = true; try {
        for (const [context, state] of contexts)
            if (state === 'open')
                await closeContext(context);
        if (operations.size || reservations)
            denied();
        const selected = active, reply = await command('retire', selected.identity, selected.epoch);
        exact(reply, ['v', 'epoch', 'retired']);
        if (reply.v !== 1 || reply.epoch !== selected.epoch || reply.retired !== true)
            denied();
        check();
        completed.add(JSON.stringify(selected.identity));
        active = undefined;
        contexts.clear();
    }
    catch {
        seal();
        denied();
    }
    finally {
        busy = false;
    } }
    async function fail() { seal(); for (const [context, state] of contexts)
        if (state === 'open')
            await closeContext(context); if (operations.size || reservations)
        denied(); if (!active)
        return; try {
        const reply = await command('fail', active.identity, active.epoch);
        exact(reply, ['v', 'failed']);
        if (reply.v !== 1 || reply.failed !== true)
            denied();
    }
    finally {
        seal();
    } }
    return Object.freeze({ start, observe, retire, fail, createContext, closeContext, remainingMs, trackProducer<T>(operation: (signal: AbortSignal) => Promise<T>) { if (!active || busy || typeof operation !== 'function')
            denied(); check(); return bounded(operation, policy.producerMs); } });
}
