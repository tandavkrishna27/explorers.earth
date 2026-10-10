import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';
import { GUIDES_CASES, GUIDES_PROJECTS, buildGuidesSeedPlan } from '../../../scripts/guides-browser-support';
import { parseBrowserSuite, assertBrowserEnvironment, validateLifecycleControl, assertLifecycleResults, assertProviderCode, assertOwnedCleanup, classifyLifecycleRequest, LIFECYCLE_CASES, LIFECYCLE_FONT_QUERIES } from '../../../scripts/lifecycle-browser-guards';
const ack = 'TASK4_FIXTURE_OWNED_DISPOSABLE_PG15';
describe('owned lifecycle browser boundary', () => {
    it('locally intercepts the exact current bootstrap typography without widening font authority', () => {
        const bootstrap = readFileSync(new URL('../../../../explorers-earth/src/bootstrap.ts', import.meta.url), 'utf8');
        const href = bootstrap.match(/fonts\.href\s*=\s*'([^']+)'/)?.[1];
        expect(href).toBeDefined();
        const current = new URL(href!);
        expect(current.searchParams.getAll('family').map(family => family.split(':')[0])).toEqual(['DM Sans', 'Fraunces', 'Inter', 'Lato', 'Montserrat', 'Poppins', 'Space Grotesk']);
        const classify = (url: string, resource = 'stylesheet', navigation = false) => classifyLifecycleRequest({url, resource, navigation, origin: 'http://127.0.0.1:53111'});
        expect(classify(current.href)).toBe('font');
        for (const query of LIFECYCLE_FONT_QUERIES) expect(classify('https://fonts.googleapis.com/css2?' + query)).toBe('font');
        const alteredFamily = new URL(current);alteredFamily.searchParams.set('family', 'Unowned Family:wght@400');
        const extraQuery = new URL(current);extraQuery.searchParams.set('token', 'unowned');
        for (const url of [alteredFamily.href, extraQuery.href, current.href.replace('fonts.googleapis.com', 'fonts.googleapis.com.evil'), current.href.replace('https:', 'http:'), current.href.replace('/css2?', '/api?')]) expect(classify(url)).toBe('deny');
        for (const resource of ['fetch', 'script', 'font', 'document']) expect(classify(current.href, resource)).toBe('deny');
        expect(classify(current.href, 'stylesheet', true)).toBe('deny');
    });
    it('accepts only exact existing and lifecycle selectors', () => {
        expect(parseBrowserSuite(['--ack', ack])).toBe('profile');
        for (const suite of ['auth', 'lifecycle', 'places', 'place-links'])
            expect(parseBrowserSuite(['--suite', suite, '--ack', ack])).toBe(suite);
        for (const args of [[], ['--suite', 'music', '--ack', ack], ['--suite', 'lifecycle', '--ack', 'wrong'], ['--ack', ack, '--ack', ack], ['--suite', 'lifecycle', '--ack', ack, '--list']])
            expect(() => parseBrowserSuite(args)).toThrow();
    });
    it('rejects ambient and production authority', () => {
        for (const key of ['DATABASE_URL', 'DATABASE_URL_TEST', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'GATE_PROD', 'MUSIC_DEPLOY_PRODUCTION', 'MUSIC_C10_STANDALONE_POSTGRES_ACK', 'PLACES_E2E_FIXTURE_PATH', 'PLACE_LINKS_E2E_FIXTURE_PATH', 'PROFILE_E2E_SUITE'])
            expect(() => assertBrowserEnvironment({ [key]: 'x' })).toThrow();
        expect(() => assertBrowserEnvironment({ NODE_ENV: 'production' })).toThrow();
        expect(() => assertBrowserEnvironment({})).not.toThrow();
    });
    it('requires exact local control origin, capability and case', () => {
        const input = { remote: '127.0.0.1', host: '127.0.0.1:55001', expectedHost: '127.0.0.1:55001', capability: 'a'.repeat(64), expectedCapability: 'a'.repeat(64), caseId: LIFECYCLE_CASES[0], action: 'prepare' };
        expect(() => validateLifecycleControl(input)).not.toThrow();
        for (const patch of [{ remote: '10.0.0.1' }, { host: 'attacker:55001' }, { capability: 'b'.repeat(64) }, { caseId: 'invented' }, { action: 'sql' }])
            expect(() => validateLifecycleControl({ ...input, ...patch })).toThrow();
    });
    it('requires exact discoveries and successful no-retry, no-skip executions', () => {
        const results = LIFECYCLE_CASES.map(title => ({ title, status: 'passed', retry: 0 }));
        expect(() => assertLifecycleResults([...LIFECYCLE_CASES], results)).not.toThrow();
        for (const altered of [results.slice(1), [...results, results[0]], results.map((r, i) => i ? r : { ...r, status: 'skipped' }), results.map((r, i) => i ? r : { ...r, retry: 1 })])
            expect(() => assertLifecycleResults([...LIFECYCLE_CASES], altered)).toThrow();
        expect(() => assertLifecycleResults([...LIFECYCLE_CASES].reverse(), results)).toThrow();
    });
    it('bounds replacement sessions to a current case and an existing owned identity', () => {
        const input = { remote: '127.0.0.1', host: '127.0.0.1:55001', expectedHost: '127.0.0.1:55001', capability: 'a'.repeat(64), expectedCapability: 'a'.repeat(64), caseId: LIFECYCLE_CASES[10], activeCaseId: LIFECYCLE_CASES[10], action: 'session', owner: 0 };
        for (const owner of [0, 1]) expect(() => validateLifecycleControl({ ...input, owner })).not.toThrow();
        for (const patch of [{ owner: 2 }, { owner: -1 }, { owner: '0' }, { owner: undefined }, { activeCaseId: undefined }, { activeCaseId: LIFECYCLE_CASES[0] }, { capability: 'b'.repeat(64) }, { remote: '10.0.0.1' }])
            expect(() => validateLifecycleControl({ ...input, ...patch } as typeof input)).toThrow();
        expect(LIFECYCLE_CASES).toHaveLength(18);
        const results = LIFECYCLE_CASES.map(title => ({ title, status: 'passed', retry: 0 }));
        expect(() => assertLifecycleResults([...LIFECYCLE_CASES].slice(0, 10), results.slice(0, 10))).toThrow();
        expect(() => assertLifecycleResults([...LIFECYCLE_CASES], results.map((r, i) => i === 11 ? { ...r, status: 'failed' } : r))).toThrow();
    });
    it('requires all six completion replacement identities after the twelve retained cases', () => {
        expect(LIFECYCLE_CASES.slice(12)).toEqual(['held deletion completion preserves verified replacement B', 'held deletion completion preserves a fresh verified returning A session', 'held deactivation completion preserves verified replacement B', 'held deactivation completion preserves a fresh verified returning A session', 'held recovery completion preserves verified replacement B', 'held recovery completion preserves a fresh verified returning A session']);
        const results = LIFECYCLE_CASES.map(title => ({ title, status: 'passed', retry: 0 }));
        for (let index = 12; index < 18; index++) {
            expect(() => assertLifecycleResults(LIFECYCLE_CASES.filter((_, i) => i !== index), results.filter((_, i) => i !== index))).toThrow();
            expect(() => assertLifecycleResults([...LIFECYCLE_CASES], results.map((result, i) => i === index ? { ...result, status: 'failed' } : result))).toThrow();
        }
    });
    it('rejects provider code from a previous or absent scenario', () => {
        expect(() => assertProviderCode('this-case', 'this-case')).not.toThrow();
        for (const expected of [undefined, 'other-case'])
            expect(() => assertProviderCode('this-case', expected)).toThrow();
    });
    it('never issues a successful cleanup claim after any cleanup failure', () => {
        expect(() => assertOwnedCleanup([])).not.toThrow();
        expect(() => assertOwnedCleanup(['owned database drop'])).toThrow();
    });
    it('contains only exact Google navigation and inert assets, denying unsupported HTTP', () => {
        const origin = 'http://127.0.0.1:53111';
        const classify = (url: string, resource = 'document', navigation = true) => classifyLifecycleRequest({ url, origin, resource, navigation });
        expect(classify(origin + '/api/explorers/v1/recovery/status')).toBe('local');
        expect(classify('https://accounts.google.com/o/oauth2/v2/auth?state=x&redirect_uri=' + encodeURIComponent(origin + '/api/auth/callback/google'))).toBe('google');
        for (const url of ['https://accounts.google.com/o/oauth2/v2/auth?state=x&redirect_uri=https://attacker.invalid/callback', 'https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=' + encodeURIComponent(origin + '/api/auth/callback/google'), 'https://attacker.invalid/api', origin + '/api/music/identity/lifecycle/suspend'])
            expect(classify(url)).toBe('deny');
        expect(classify('https://fonts.googleapis.com/css2?' + LIFECYCLE_FONT_QUERIES[0], 'stylesheet', false)).toBe('font');
        expect(classify('https://fonts.googleapis.com/css2?token=unowned', 'stylesheet', false)).toBe('deny');
        expect(classify('https://zupimages.net/up/19/34/4820.gif', 'image', false)).toBe('image');
        expect(classify('https://zupimages.net/up/19/34/other.gif', 'image', false)).toBe('deny');
    });
});

describe('Guides parent job contract', () => {
    const cases = ['assign-before-resume', 'create-failure', 'assign-failure', 'resume-failure', 'process-wait-timeout', 'job-query-failure', 'nonzero-active', 'abort-stuck-fixture', 'abort-pending-command', 'finish-nonzero-fixture', 'exit-handshake', 'handle-release-failure'];
    for (const caseName of cases) it(`runs the actual fixed native runner: ${caseName}`, () => {
        const script = fileURLToPath(new URL('../../../scripts/guides-windows-job.ps1', import.meta.url));
        const source = `$ErrorActionPreference='Stop'\n. '${script.replaceAll("'", "''")}' -DefinitionsOnly\n[Console]::Out.WriteLine([GuidesJob.ContractCases]::Run('${caseName}'))`;
        const output = execFileSync('C:/Users/TK/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(source, 'utf16le').toString('base64')], { encoding: 'utf8', shell: false, windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
        const lines = output.trim().split(/\r?\n/);
        expect(lines).toHaveLength(1);
        const result = JSON.parse(lines[0]);
        expect(result.caseName).toBe(caseName);
        expect(result.passed).toBe(true);
        expect(result.productionConstructors).toBe(0);
        expect(result.productionEntries).toBe(0);
        expect(result.events).toContain('job');
        if (caseName === 'assign-before-resume') expect(result.events.slice(0, 4)).toEqual(['job', 'create', 'assign', 'resume']);
        if (caseName === 'abort-stuck-fixture') expect(result.events.indexOf('terminate-job')).toBeLessThan(result.events.indexOf('wait'));
        if (caseName === 'exit-handshake') expect(result.events.slice(-3)).toEqual(['release-thread', 'release-process', 'release-job']);
    }, 30000);
    it('imports the sole effect-free factory and refuses invalid root input without effects', async () => {
        const module = await import('../../../scripts/guides-parent-supervision');
        expect(Object.keys(module)).toEqual(['createGuidesParentSupervisor']);
        expect(() => module.createGuidesParentSupervisor({} as never)).toThrow();
    });
    function rootInput(acquisition: any) {
        return { runId: 'a'.repeat(32), commit: 'b'.repeat(40), acquisition,
            inventory: GUIDES_CASES.flatMap(caseId => GUIDES_PROJECTS.map(project => ({ caseId, project, repeat: 0 as const }))),
            configure: { nodeExecutable: 'C:\\node.exe', loaderPath: 'C:\\loader.mjs', fixtureEntrypoint: 'C:\\fixture.ts', workerEntrypoint: 'C:\\worker.ts', cwd: 'C:\\repo', environment: {}, receiptArguments: [] },
            powershellExecutable: 'C:\\pwsh.exe', jobScript: 'C:\\job.ps1', disposableDirectory: 'C:\\owned', storageDirectory: 'C:\\owned\\storage',
            origin: 'http://127.0.0.1:53001', apiOrigin: 'http://127.0.0.1:53002', harnessPort: 53003, apiPort: 53004, controlPort: 53005,
            personas: { ownerA: { userId: 'A', handle: 'a' }, ownerB: { userId: 'B', handle: 'b' }, ownerC: { userId: 'C', handle: 'c' } }, databasePassword: 'private', authSecret: 'private', custody: [{kind: 'ancestor' as const, path: 'C:\\', dev: '1', ino: '1'}, {kind: 'root' as const, path: 'C:\\owned', dev: '1', ino: '2'}, {kind: 'storage' as const, path: 'C:\\owned\\storage', dev: '1', ino: '3'}, {kind: 'secret' as const, path: 'C:\\private-secret', dev: '1', ino: '4'}] };
    }
    function adapters(events: string[]) {
        return { clock: { now: () => 0, setTimeout: (_callback: () => void, _ms: number) => 0, clearTimeout: () => {} }, randomHex: (n: number) => 'c'.repeat(n * 2),
            listen: async () => { events.push('listen'); throw new Error('refused'); }, launch: () => { events.push('launch'); throw new Error('refused'); },
            witness: async () => { events.push('witness'); throw new Error('refused'); }, drop: async () => { events.push('drop'); }, disposeCustody: async () => { events.push('custody'); } };
    }
    it('retains intent without effects, disposes once before run and refuses acquisition afterward', async () => {
        const { createGuidesParentSupervisor } = await import('../../../scripts/guides-parent-supervision');
        const events: string[] = []; const acquisition = { intent: { runId: 'a'.repeat(32), commit: 'b'.repeat(40), database: 'owned', port: 53000, passwordFile: 'C:\\private-secret' }, create: async () => { events.push('create'); throw new Error('refused'); }, dispose: async () => { events.push('dispose'); } };
        const supervisor = createGuidesParentSupervisor(rootInput(acquisition), adapters(events));
        expect(events).toEqual([]); const first = supervisor.dispose(); expect(supervisor.dispose()).toBe(first);
        expect(await first).toEqual({ disposed: true, failures: [] });
        await expect(supervisor.run()).rejects.toThrow(); expect(events).toEqual(['dispose', 'custody']);
    });
    it('returns the same run promise, latches abort during acquisition and admits no launcher afterward', async () => {
        const { createGuidesParentSupervisor } = await import('../../../scripts/guides-parent-supervision');
        const events: string[] = []; let resolve!: (value: any) => void; const pending = new Promise<any>(r => { resolve = r; });
        const acquisition = { intent: { runId: 'a'.repeat(32), commit: 'b'.repeat(40), database: 'owned', port: 53000, passwordFile: 'C:\\private-secret' }, create: () => { events.push('create'); return pending; }, dispose: async () => { events.push('dispose'); } };
        const supervisor = createGuidesParentSupervisor(rootInput(acquisition), adapters(events)); const running = supervisor.run(); expect(supervisor.run()).toBe(running);
        supervisor.abort('interrupt'); resolve({ runId: 'a'.repeat(32), commit: 'b'.repeat(40), database: 'owned', port: 53000, passwordFile: 'C:\\private-secret', owned: true, containerId: 'd'.repeat(64), imageId: 'sha256:' + 'e'.repeat(64), contextHost: 'npipe://owned' });
        await expect(running).rejects.toThrow(); const result = await supervisor.dispose(); expect(result.disposed).toBe(false); expect(result.failures).toContain('service-children'); expect(events).not.toContain('listen'); expect(events).not.toContain('launch');
    });
    it('refuses invented identities and custody outside the retained disposable root before effects', async () => {
        const { createGuidesParentSupervisor } = await import('../../../scripts/guides-parent-supervision');
        const events: string[] = []; const acquisition = { intent: { runId: 'a'.repeat(32), commit: 'b'.repeat(40), database: 'owned', port: 53000, passwordFile: 'C:\\private-secret' }, create: async () => { throw new Error('refused'); }, dispose: async () => {} };
        const input = rootInput(acquisition);
        expect(() => createGuidesParentSupervisor({ ...input, inventory: input.inventory.map((item, i) => i ? item : { ...item, caseId: 'invented' }) }, adapters(events))).toThrow();
        expect(() => createGuidesParentSupervisor({ ...input, custody: [{ kind: 'root' as const, path: 'C:\\', dev: '1', ino: '2' }] }, adapters(events))).toThrow();
        expect(events).toEqual([]);
    });
    it('imports the real parent through pinned tsImport with zero application effects and only the locked compiler allowance', () => {
        const root = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/[\\/]$/, '');
        const source = `
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import http from 'node:http';
import https from 'node:https';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=${JSON.stringify(root)};
const require=createRequire(path.join(root,'tunes/package.json'));
const compiler=fs.realpathSync(path.join(root,'tunes/node_modules/tsx/node_modules/@esbuild/win32-x64/esbuild.exe'));
assert.equal(require('./node_modules/tsx/node_modules/esbuild/package.json').version,'0.25.12');
assert.equal(require('./node_modules/tsx/package.json').version,'4.21.0');
let resourceCalls=0,toolCalls=0;
const deny=()=>{resourceCalls++;throw Error('application import effect');};
const spawn=cp.spawn;
cp.spawn=(exe,args,options)=>{if(fs.realpathSync(exe)===compiler&&JSON.stringify(args)===JSON.stringify(['--service=0.25.12','--ping'])&&options?.shell!==true){toolCalls++;return spawn(exe,args,options);}return deny();};
for(const key of ['spawnSync','exec','execSync','execFile','execFileSync','fork'])cp[key]=deny;
for(const object of [fs,fsp])for(const key of ['mkdir','mkdirSync','mkdtemp','mkdtempSync','writeFile','writeFileSync','appendFile','appendFileSync','rename','renameSync','rm','rmSync','rmdir','rmdirSync','unlink','unlinkSync','truncate','truncateSync','chmod','chmodSync','chown','chownSync','link','linkSync','symlink','symlinkSync','copyFile','copyFileSync','write','writeSync','createWriteStream'])if(key in object)object[key]=deny;
for(const [object,key] of [[fs,'open'],[fs,'openSync'],[fsp,'open']]){const open=object[key];object[key]=(...args)=>{const flags=args[1];if(flags!==undefined&&flags!=='r'&&flags!=='rs'&&flags!==0)return deny();return open.apply(object,args);};}
net.Server.prototype.listen=deny;net.connect=deny;net.createConnection=deny;tls.connect=deny;dgram.Socket.prototype.bind=deny;dgram.Socket.prototype.send=deny;http.request=deny;http.get=deny;https.request=deny;https.get=deny;globalThis.fetch=deny;
const pg=require('pg');for(const type of [pg.Pool,pg.Client]){type.prototype.connect=deny;type.prototype.query=deny;}
syncBuiltinESMExports();
const apiURL=pathToFileURL(path.join(root,'tunes/node_modules/tsx/dist/esm/api/index.mjs')).href;
const parentURL=pathToFileURL(path.join(root,'scripts/replatform-e2e.mjs')).href;
const {tsImport}=await import(apiURL);assert.equal(typeof tsImport,'function');
await tsImport('data:text/javascript,export default 1',{parentURL,tsconfig:false});
const targetURL=pathToFileURL(path.join(root,'tunes/scripts/guides-parent-supervision.ts')).href;
const module=await tsImport(targetURL,{parentURL,tsconfig:false});assert.deepEqual(Object.keys(module),['createGuidesParentSupervisor']);assert.equal(typeof module.createGuidesParentSupervisor,'function');assert.equal(resourceCalls,0);assert.ok(toolCalls<=1);
console.log(JSON.stringify({ok:true,target:'supervision',resourceCalls:0}));
`;
        const environment = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP, TMP: process.env.TMP, NODE_ENV: 'test' };
        let result: string;
        try { result = execFileSync('C:/Users/TK/AppData/Local/Temp/explorers-wave1-tools/node-v24.21.0-win-x64/node.exe', ['--input-type=module', '--eval', source], { cwd: root, encoding: 'utf8', shell: false, windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env: { ...environment, TSX_DISABLE_CACHE: '1' } }); }
        catch (error) { const failure = error as { code?: string; status?: number; stderr?: Buffer }; throw new Error(`Import probe cwd=${root} sourceBytes=${Buffer.byteLength(source)} code=${failure.code} status=${failure.status} stderr=${String(failure.stderr ?? '').slice(0, 4096)}`); }
        expect(result.trim()).toBe('{"ok":true,"target":"supervision","resourceCalls":0}');
    }, 30000);
});


const GUIDES_TEST_RUN = 'a'.repeat(32), GUIDES_TEST_COMMIT = 'b'.repeat(40);
const clone = <T>(value: T): T => structuredClone(value);
const KNOWN_GUIDES_BYTES = {
  'old-cover': {base64:'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mP8z4AdMDEMKQkAzUEBD7t4NqoAAAAASUVORK5CYII=',byteLength:74,sha256:'efd697c3369b86b0b540c0bded797ca813a3984c1a95d7d16644744e252840a2',mimeType:'image/png'},
  'replacement-cover': {base64:'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFUlEQVR42mNkYPjPgA0wMeAAg1MCAMtDAQ9w2TiCAAAAAElFTkSuQmCC',byteLength:78,sha256:'737a59b1d4ed37b6cd836d483eff2ad8b0183d5a8078e355e7bb30a91c746f82',mimeType:'image/png'},
  'activity-import': {base64:'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAIAAgDAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDu6/h8/wA4j//Z',byteLength:633,sha256:'040d3d472c846ce1e2ea09b361b3224c5723a591f305797217e20b98778d9f1c',mimeType:'image/jpeg'},
} as const;

function syntheticGuidesManifest(plan:any, project:string=GUIDES_PROJECTS[0], generation=1):any {
  const ids=Array.from({length:200},(_,i)=>`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
  const bindings={ownerA:{userId:'auth|owner-a',accountId:ids[0],handle:'guide-owner-a'},ownerB:{userId:'auth|owner-b',accountId:ids[1],handle:'guide-owner-b'},ownerC:{userId:'auth|owner-c',accountId:ids[2],handle:'guide-owner-c'}};
  const expected={version:1,runId:GUIDES_TEST_RUN,commit:GUIDES_TEST_COMMIT,caseId:plan.caseId,project,repeat:0,generation,personas:clone(bindings)};
  const personas=Object.fromEntries(Object.entries(bindings).map(([key,value],i)=>[key,{...value,accountRevision:[7,13,29][i]}]));
  const guides=plan.guides.map((row:any,i:number)=>{const {owner,...rest}=clone(row);return {...rest,id:ids[10+i],accountId:(bindings as any)[owner].accountId,category:'guides',collectionRevision:31+i,categoryContentRevision:owner==='ownerA'?47:59};});
  const sections=plan.sections.map((row:any,i:number)=>{const {guideKey,...rest}=clone(row);const parent=guides.find((g:any)=>g.key===guideKey);return {...rest,id:ids[80+i],collectionId:parent.id,accountId:parent.accountId};});
  const fixtureBytes:any={};
  const media=plan.mediaRoles.filter((r:any)=>r.key!=='activity-import').map((role:any,i:number)=>{
    const fixtureId=role.key==='replacement-cover'?'replacement-cover':'old-cover'; const known=KNOWN_GUIDES_BYTES[fixtureId];
    fixtureBytes[fixtureId]=new Uint8Array(Buffer.from(known.base64,'base64'));
    const id=ids[150+i],accountId=(bindings as any)[role.owner].accountId;
    return {key:role.key,id,accountId,purpose:role.purpose,status:'ready',variant:'original',environment:'local',keyPath:`local/${accountId}/${id}`,mimeType:known.mimeType,byteLength:known.byteLength,sha256:known.sha256,contentUrl:`/api/explorers/v1/media/${id}/content`,fixtureId};
  });
  if(plan.mediaRoles.some((r:any)=>r.key==='activity-import'))fixtureBytes['activity-import']=new Uint8Array(Buffer.from(KNOWN_GUIDES_BYTES['activity-import'].base64,'base64'));
  const attachments:any[]=[];
  for(const binding of plan.photoBindings){const section=sections.find((s:any)=>s.key===binding.sectionKey),asset=media.find((m:any)=>m.key===binding.roleKey);const [block,field]=binding.block.split('.');section.blocks[block][field][binding.entryIndex].photos=[{mediaId:asset.id,fileName:`${binding.roleKey}.png`,width:8,height:8,aspectRatio:'1:1'}];attachments.push({slot:'section-photo',guideId:section.collectionId,sectionId:section.id,accountId:section.accountId,mediaId:asset.id});}
  for(const key of ['old-cover','independent-cover']){const asset=media.find((m:any)=>m.key===key);if(asset){const guide=guides.find((g:any)=>g.accountId===asset.accountId);attachments.push({slot:'cover',guideId:guide.id,accountId:guide.accountId,mediaId:asset.id});}}
  const own=guides.filter((g:any)=>g.accountId===bindings.ownerA.accountId&&g.visibility==='public'&&g.publicationState==='published'&&!g.archived);
  const traversal=plan.traversal?{guideCount:53,sectionCount:53,publicDetail:{limit:12,lengths:[12,12,12,12,5],offsets:[0,12,24,36,48],cursors:['o12','o24','o36','o48',null]},publicCategory:{limit:24,lengths:[24,24,5]},ownerSections:{limit:20,lengths:[20,20,13],requests:[{},{after:19},{after:39}],cursors:[19,39,null],wireCursors:['19','39',null]}}:null;
  const expectedPublic={eligibleGuideIds:own.map((g:any)=>g.id),selectedGuideId:traversal?own[0].id:null,orderedSectionIds:traversal?sections.filter((s:any)=>s.collectionId===own[0].id).map((s:any)=>s.id):[],roleMediaIds:Object.fromEntries(plan.mediaRoles.map((r:any)=>[r.key,media.find((m:any)=>m.key===r.key)?.id??null])),traversal};
  return {expected,manifest:{version:1,runId:GUIDES_TEST_RUN,commit:GUIDES_TEST_COMMIT,caseId:plan.caseId,project,repeat:0,generation,personas,guides,sections,media,attachments,expectedPublic},fixtureBytes};
}



type ScriptFrame = { v: number; seq: number; id: string; type: string; payload: any };
function guidesScripted(options: Record<string, any> = {}) {
    const events: string[] = [], frames: ScriptFrame[] = [], timers = new Map<number, {callback: () => void; ms: number}>();
    let timerId = 0, random = 0, now = 0, fixture: ReturnType<typeof stream>, held: ScriptFrame | undefined;
    const connections: ReturnType<typeof stream>[] = [], connectionWaiters: ((value: ReturnType<typeof stream>) => void)[] = [];
    const authority = { runId: GUIDES_TEST_RUN, commit: GUIDES_TEST_COMMIT, database: 'owned', port: 53000, owned: true as const, containerId: 'd'.repeat(64), imageId: 'sha256:' + 'e'.repeat(64), contextHost: 'npipe://owned' };
    const identities = GUIDES_CASES.flatMap(caseId => GUIDES_PROJECTS.map(project => ({caseId, project, repeat: 0 as const})));
    const personas = {ownerA: {userId: 'auth|owner-a', handle: 'guide-owner-a'}, ownerB: {userId: 'auth|owner-b', handle: 'guide-owner-b'}, ownerC: {userId: 'auth|owner-c', handle: 'guide-owner-c'}};
    const acquisition = {
        intent: Object.freeze({runId: GUIDES_TEST_RUN, commit: GUIDES_TEST_COMMIT, database: 'owned', port: 53000, passwordFile: 'C:\\private-secret'}),
        create: async () => { events.push('create'); if (options.uncertain) throw Error('uncertain creation'); return authority; },
        dispose: async (drop: (value: typeof authority) => Promise<void>) => { events.push('database-dispose'); if (options.uncertain) throw Error('uncertain retained'); await drop(authority); },
    };
    const input = {runId: GUIDES_TEST_RUN, commit: GUIDES_TEST_COMMIT, acquisition, inventory: identities,
        configure: {nodeExecutable: 'C:\\node.exe', loaderPath: 'C:\\loader.mjs', fixtureEntrypoint: 'C:\\fixture.ts', workerEntrypoint: 'C:\\worker.ts', cwd: 'C:\\repo', environment: {}, receiptArguments: []},
        powershellExecutable: 'C:\\pwsh.exe', jobScript: 'C:\\job.ps1', disposableDirectory: 'C:\\owned', storageDirectory: 'C:\\owned\\storage', origin: 'http://127.0.0.1:53001', apiOrigin: 'http://127.0.0.1:53002', harnessPort: 53003, apiPort: 53004, controlPort: 53005,
        personas, databasePassword: 'private', authSecret: 'private', custody: [{kind: 'ancestor' as const,path:'C:\\',dev:'1',ino:'1'},{kind:'root' as const,path:'C:\\owned',dev:'1',ino:'2'},{kind:'storage' as const,path:'C:\\owned\\storage',dev:'1',ino:'3'},{kind:'secret' as const,path:'C:\\private-secret',dev:'1',ino:'4'}],
    };
    function wire(value: unknown) { const body = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)); const header = Buffer.alloc(4); header.writeUInt32BE(body.length); return Buffer.concat([header,body]); }
    function stream(onWrite: (frame: ScriptFrame) => void) {
        let sequence = 0, closed = false;
        const bytes: (Buffer|null)[] = [], waiters: ((value: Buffer|null) => void)[] = [];
        const push = (value: Buffer|null) => { const waiter=waiters.shift(); if(waiter)waiter(value);else bytes.push(value); };
        return {
            push,
            emit(type: string, payload: any, id = 'f'.repeat(32)) { events.push(`emit:${type}`); push(wire({v:1,seq:++sequence,id,type,payload})); },
            hello(role: string, epoch: number, token: string) { push(wire({v:1,type:'hello',role,epoch,token: options.badHello && role==='worker'?'0'.repeat(64):token})); },
            async read(): Promise<Buffer|null> { if(bytes.length)return bytes.shift()!;if(closed)return null;return new Promise(resolve=>waiters.push(resolve)); },
            async write(value: Buffer) { const frame=JSON.parse(value.subarray(4).toString()) as ScriptFrame;frames.push(frame);events.push(frame.type);onWrite(frame); },
            async close() { closed=true;while(waiters.length)waiters.shift()!(null);events.push('stream-close'); },
        };
    }
    const soon = (callback: () => void) => queueMicrotask(() => queueMicrotask(callback));
    function next(epoch: number) {
        if(epoch===17)fixture.emit('complete',{browserExitCode:0});
        else fixture.emit('start-worker',{epoch,identity:identities[epoch-1]});
    }
    function peer(role: 'fixture'|'worker', epoch: number, token: string) {
        let init: any;
        const p=stream(frame=>{
            if(frame.type==='init') { if(options.advanceClock)now+=100; init=frame.payload; p.emit('init-ack',{},frame.id); }
            if(frame.type==='begin') {
                if(role==='fixture') { p.emit('ready',{harnessOrigin:'http://127.0.0.1:53003'});soon(()=>next(1)); }
                else {
                    if(options.lostReady)return; const identity=identities[epoch-1], manifest=syntheticGuidesManifest(buildGuidesSeedPlan(identity.caseId),identity.project).manifest;
                    const sessions=Object.fromEntries(Object.keys(personas).map(owner=>{const token=`epoch${epoch}-${owner}`;return [owner,{cookie:`better-auth.session_token=${token}.${createHmac('sha256','private').update(token).digest('base64')}`}];}));
                    const reset={version:1,action:'reset',runId:GUIDES_TEST_RUN,commit:GUIDES_TEST_COMMIT,...identity,generation:1,manifest,sessions};
                    if(options.generation)reset.generation=2;
                    if(options.badManifest)reset.manifest.commit='0'.repeat(40);
                    if(options.badSession)reset.sessions.ownerA.cookie='better-auth.session_token=invalid.signature';
                    p.emit('ready',{epoch,apiOrigin:'http://127.0.0.1:53004',reset});
                }
            }
            if(frame.type==='start-worker-result')soon(()=>fixture.emit('observe',{epoch:frame.payload.epoch,identity:identities[frame.payload.epoch-1]}));
            if(frame.type==='observe') {
                if(options.lostObserve)return; if(options.fatalCleanup){p.emit('fatal',{phase:'observe',code:'unsettled',cleanup:options.fatalCleanup},frame.id);return;} if(options.fatalObserve){p.emit('fatal',{phase:'observe',code:'failed',cleanup:null},frame.id);return;}
                if(options.busyRetire) { fixture.emit('retire-worker',{epoch,identity:identities[epoch-1],nativeComplete:true,producersClosed:true,controlIdle:true});return; }
                p.emit('observed',{epoch,observation:{version:1,action:'observe',runId:GUIDES_TEST_RUN,commit:GUIDES_TEST_COMMIT,...identities[epoch-1],generation:options.badObservation?2:1,personas:{},guides:[],sections:[],media:[],objects:[],attachments:[]}},frame.id);
            }
            if(frame.type==='observe-result')soon(()=>fixture.emit('retire-worker',{epoch:frame.payload.epoch,identity:identities[frame.payload.epoch-1],nativeComplete:true,producersClosed:true,controlIdle:true}));
            if(frame.type==='retired')soon(()=>next(frame.payload.epoch+1));
        });
        p.hello(options.badRole&&role==='worker'?'fixture':role,options.badEpoch&&role==='worker'?epoch+1:epoch,token);connections.push(p);connectionWaiters.shift()?.(connections.shift()!);if(role==='fixture')fixture=p;
        return p;
    }
    const launcher=stream(frame=>{
        if(frame.type==='configure') {
            if(options.malformed) {
                const valid={v:1,seq:1,id:frame.id,type:'configured',payload:{}};
                if(options.malformed==='duplicate')launcher.push(wire(JSON.stringify(valid).replace('"payload":{}','"payload":{"x":1,"x":2}')));
                else if(options.malformed==='utf8')launcher.push(Buffer.from([0,0,0,1,0xff]));
                else if(options.malformed==='incomplete')launcher.push(Buffer.from([0,0,0,10,123]));
                else if(options.malformed==='sequence')launcher.push(wire({...valid,seq:2}));
                else if(options.malformed==='correlation')launcher.push(wire({...valid,id:'0'.repeat(32)}));
                else if(options.malformed==='extra')launcher.push(wire({...valid,extra:true}));
                else launcher.push(wire({...valid,type:'arbitrary-command'}));
            } else launcher.emit('configured',{},frame.id);
        }
        if(frame.type==='launch-fixture') { peer('fixture',0,frame.payload.token);launcher.emit('launched',{slot:'fixture'},frame.id); }
        if(frame.type==='launch-worker') { if(options.pendingLaunch){held=frame;return;}peer('worker',frame.payload.epoch,frame.payload.token);launcher.emit('launched',{slot:frame.payload.epoch},frame.id); }
        if(frame.type==='terminate-worker') { events.push(`worker-exit:${frame.payload.epoch}`);launcher.emit('terminated',{epoch:frame.payload.epoch,processSignaled:!options.unconfirmedExit},frame.id); }
        if(frame.type==='finish-job')launcher.emit('job-empty',{activeProcesses:0,fixtureSignaled:true,fixtureExitCode:options.nonzeroFixture?7:0,workersSignaled:true},frame.id);
        if(frame.type==='abort-job') { if(held)launcher.emit(options.lateSuccess?'launched':'cancelled',options.lateSuccess?{slot:1}:{commandId:held.id},held.id);launcher.emit('job-empty',{activeProcesses:0,fixtureSignaled:true,fixtureExitCode:7,workersSignaled:true},frame.id); }
        if(frame.type==='exit')launcher.emit('exit-ack',{handlesClosed:!options.badExitAck},frame.id);
    });
    const dependencies={
        clock:{now:()=>now,setTimeout(callback:()=>void,ms:number){const id=++timerId;timers.set(id,{callback,ms});return id;},clearTimeout(id:unknown){timers.delete(id as number);}},
        randomHex:(bytes:number)=>(++random).toString(16).padStart(bytes*2,'0'),
        async listen(_pipe:string){events.push('listen');return {async next(){if(connections.length)return connections.shift()!;return new Promise<ReturnType<typeof stream>>(resolve=>connectionWaiters.push(resolve));},async close(){events.push('listener-close');}};},
        launch(){events.push('launcher');return {stream:launcher,async exited(){events.push('actual-exit');return {code:options.badActualExit?1:0,closed:!options.lostClose};}};},
        async witness(){events.push('pg-witness');if(options.pgError)throw Error('query failed');return {...{maintenanceDatabase:'postgres' as const,databaseOid:42,privileged:true as const,maxPreparedTransactions:0 as const,preparedTransactions:0 as const,clientSessions:0 as const,fresh:true as const},...(options.witnessAfterExit && events.some(event=>event.startsWith('worker-exit:')) ? {clientSessions:1} : options.witness)};},
        async drop(){events.push('drop');},async disposeCustody(){events.push('storage-remove','root-remove','secret-remove');if(options.custodyFailure)throw Error('custody mismatch');},
    };
    return {input,dependencies,events,frames,timers,setNow(value:number){now=value;},held:()=>held,expire(ms:number){const selected=[...timers.values()].filter(timer=>timer.ms<=ms);selected.forEach(timer=>timer.callback());}};
}

describe('Guides scripted parent behavior',()=>{
    const load=()=>import('../../../scripts/guides-parent-supervision');
    it('completes exactly sixteen unique epochs with one reset domain and checked ordered retirement/disposal',async()=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted();
        const supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        const evidence=await supervisor.run().catch(error=>{throw new Error(`${String(error)}; scripted events=${JSON.stringify(fake.events)}`);});
        expect(evidence).toEqual({completedEpochs:16,activeProcesses:0,fixtureExitCode:0,launcherExitCode:0,handlesClosed:true,databaseOid:42});
        expect(fake.frames.filter(frame=>frame.type==='launch-worker').map(frame=>frame.payload.epoch)).toEqual(Array.from({length:16},(_,i)=>i+1));
        const initializes=fake.frames.filter(frame=>frame.type==='init'&&'epoch'in frame.payload);
        expect(initializes.map(frame=>frame.payload.initializeDatabase)).toEqual([true,...Array(15).fill(false)]);
        expect(fake.frames.some(frame=>frame.type==='close'||frame.type==='reset')).toBe(false);
        for(let epoch=1;epoch<=16;epoch++){const exit=fake.events.indexOf(`worker-exit:${epoch}`);expect(fake.events.slice(exit+1).indexOf('pg-witness')).toBeGreaterThanOrEqual(0);expect(fake.events.slice(exit+1).indexOf('pg-witness')).toBeLessThan(fake.events.slice(exit+1).indexOf('retired'));}
        expect(await supervisor.dispose()).toEqual({disposed:true,failures:[]});
        expect(fake.events.slice(-3)).toEqual(['storage-remove','root-remove','secret-remove']);
        expect(fake.events.indexOf('actual-exit')).toBeLessThan(fake.events.indexOf('drop'));
        expect(fake.events.indexOf('drop')).toBeLessThan(fake.events.indexOf('storage-remove'));
    },1000);
    it.each(['badHello','generation','badManifest','badSession','busyRetire','unconfirmedExit'])('fails %s without admitting a successor or upgrading after recovery',async fault=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted({[fault]:true}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        await expect(supervisor.run()).rejects.toThrow();const disposing=supervisor.dispose();for(let turn=0;turn<100;turn++)await Promise.resolve();expect(fake.events.includes('actual-exit'),JSON.stringify(fake.events)).toBe(true);const disposed=await disposing;expect(disposed.disposed).toBe(false);
        expect(fake.frames.filter(frame=>frame.type==='launch-worker')).toHaveLength(1);
        expect(fake.frames.some(frame=>frame.type==='finish-job')).toBe(false);
        expect(fake.frames.some(frame=>frame.type==='abort-job')).toBe(true);
    },1000);
    it.each([{maintenanceDatabase:'owned'},{privileged:false},{maxPreparedTransactions:1},{preparedTransactions:1},{clientSessions:1},{fresh:false},{databaseOid:0}])('refuses a negative fresh PG witness before worker admission: %j',async witness=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted({witness}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        await expect(supervisor.run()).rejects.toThrow();expect(fake.frames.some(frame=>frame.type==='launch-worker')).toBe(false);
        const disposal=await supervisor.dispose();expect(disposal.failures).toContain('owned-database');expect(disposal.failures).toContain('private-directory');expect(fake.events).not.toContain('drop');expect(fake.events).not.toContain('storage-remove');
    },1000);
    it('issues priority abort while launch is pending, checks correlation and retains the failed outcome',async()=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted({pendingLaunch:true}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        const running=supervisor.run();const rejected=expect(running).rejects.toThrow();
        for(let turn=0;turn<100&&!fake.held();turn++)await Promise.resolve();
        expect(fake.held()).toBeDefined();supervisor.abort('interrupt');await rejected;
        const disposal=await supervisor.dispose();expect(disposal.disposed).toBe(false);expect(fake.frames.filter(frame=>frame.type==='abort-job')).toHaveLength(1);expect(fake.frames.filter(frame=>frame.type==='launch-worker')).toHaveLength(1);
        expect(fake.frames.some(frame=>frame.type==='start-worker-result')).toBe(false);
    },1000);
    it.each(['duplicate','utf8','sequence','extra','variant','correlation'])('refuses malformed launcher %s and preserves failure',async malformed=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted({malformed}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        await expect(supervisor.run()).rejects.toThrow();await supervisor.dispose();expect(fake.frames.some(frame=>frame.type==='launch-fixture')).toBe(false);
    },1000);
    it('caps incomplete-frame waiting by an absolute five-second bound without chunk resets',async()=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted({malformed:'incomplete'}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        const running=supervisor.run();const rejected=expect(running).rejects.toThrow();for(let turn=0;turn<50;turn++)await Promise.resolve();
        expect([...fake.timers.values()].some(timer=>timer.ms===5000)).toBe(true);fake.setNow(5001);fake.expire(5000);await rejected;await supervisor.dispose();
        expect(fake.frames.some(frame=>frame.type==='launch-fixture')).toBe(false);
    },1000);
    it.each(['nonzeroFixture','badExitAck','badActualExit','lostClose'])('never substitutes containment or exit-ack for successful native completion: %s',async fault=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted({[fault]:true}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        await expect(supervisor.run()).rejects.toThrow();expect((await supervisor.dispose()).disposed).toBe(false);
        if(fault==='nonzeroFixture')expect(fake.frames.some(frame=>frame.type==='abort-job')).toBe(true);
    },1000);
    it('preserves uncertain staged creation and reports skipped dependent cleanup',async()=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted({uncertain:true}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        await expect(supervisor.run()).rejects.toThrow();const result=await supervisor.dispose();expect(result.failures).toContain('owned-database');expect(result.failures).toContain('private-directory');expect(result.failures).toContain('artifacts');expect(fake.events).not.toContain('launcher');expect(fake.events).not.toContain('drop');expect(fake.events).not.toContain('storage-remove');
    });
    it('rejects an observation from another reset generation before retirement',async()=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted({badObservation:true}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        await expect(supervisor.run()).rejects.toThrow();await supervisor.dispose();expect(fake.frames.some(frame=>frame.type==='terminate-worker')).toBe(false);
    },1000);
    it('retains the database after a nonzero all-session witness following positive worker exit',async()=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted({witnessAfterExit:true}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        await expect(supervisor.run()).rejects.toThrow();expect(fake.events).toContain('worker-exit:1');expect(fake.frames.filter(frame=>frame.type==='launch-worker')).toHaveLength(1);
        expect((await supervisor.dispose()).failures).toContain('owned-database');expect(fake.events).not.toContain('drop');expect(fake.events).not.toContain('storage-remove');
    },1000);
    it('reports ordered custody failure without upgrading completed native execution',async()=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted({custodyFailure:true}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        await supervisor.run();expect((await supervisor.dispose()).failures).toEqual(['private-directory','artifacts']);
    },1000);    it('passes declining lane budgets without restarting the absolute deadline',async()=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted({advanceClock:true}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        await supervisor.run();const budgets=fake.frames.filter(frame=>'remainingLaneMs'in frame.payload).map(frame=>frame.payload.remainingLaneMs);
        expect(budgets).toHaveLength(33);expect(budgets[0]).toBe(21600000);for(let i=1;i<budgets.length;i++)expect(budgets[i]).toBeLessThanOrEqual(budgets[i-1]);expect(budgets.at(-1)).toBeLessThan(budgets[0]);
        expect(fake.frames.filter(frame=>frame.type==='terminate-worker').every(frame=>frame.payload.remainingMs<=10000)).toBe(true);await supervisor.dispose();
    },1000);    it.each(['lostReady','lostObserve'])('does not retire or admit a successor when the fully received %s result is unavailable',async fault=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted({[fault]:true}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        const rejected=expect(supervisor.run()).rejects.toThrow();for(let turn=0;turn<150;turn++)await Promise.resolve();fake.setNow(630001);fake.expire(630000);await rejected;await supervisor.dispose();
        expect(fake.frames.filter(frame=>frame.type==='launch-worker')).toHaveLength(1);expect(fake.frames.some(frame=>frame.type==='terminate-worker')).toBe(false);expect(fake.frames.some(frame=>frame.type==='finish-job')).toBe(false);
    },1000);    it.each(['badRole','fatalObserve'])('fails a wrong role or pending observation fatal without successor: %s',async fault=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted({[fault]:true}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        await expect(supervisor.run()).rejects.toThrow();await supervisor.dispose();expect(fake.frames.filter(frame=>frame.type==='launch-worker')).toHaveLength(1);expect(fake.frames.some(frame=>frame.type==='terminate-worker')).toBe(false);
    },1000);
    it('refuses late ordinary success after priority cancellation and retains dependent resources',async()=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted({pendingLaunch:true,lateSuccess:true}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        const rejected=expect(supervisor.run()).rejects.toThrow();for(let turn=0;turn<100&&!fake.held();turn++)await Promise.resolve();supervisor.abort('interrupt');await rejected;
        for(let turn=0;turn<100;turn++)await Promise.resolve();const disposal=supervisor.dispose();for(let turn=0;turn<100;turn++)await Promise.resolve();fake.setNow(300001);fake.expire(300000);
        expect((await disposal).failures).toContain('owned-database');expect(fake.events).not.toContain('drop');expect(fake.events).not.toContain('storage-remove');expect(fake.frames.some(frame=>frame.type==='start-worker-result')).toBe(false);
    },1000);});


// These production-adapter regressions allocate no resources. The only child
// processes compile the actual PS assembly through the approved DefinitionsOnly seam.
describe('Guides R1 review regressions', () => {
    function definitions(source: string) {
        const script = fileURLToPath(new URL('../../../scripts/guides-windows-job.ps1', import.meta.url));
        const literal = `$ErrorActionPreference='Stop'\n. '${script.replaceAll("'", "''")}' -DefinitionsOnly\n${source}`;
        return JSON.parse(execFileSync('C:/Users/TK/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(literal, 'utf16le').toString('base64')], {encoding:'utf8',shell:false,windowsHide:true,timeout:30000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']}).trim());
    }
    it('uses the retained owned fixture role with maintenance database postgres in the real production Client configuration', async () => {
        const configurations: any[] = [], effects: string[] = [];
        vi.resetModules();
        vi.doMock('node:fs', async () => {
            const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
            return {...actual, lstatSync: (target: string) => ({isFile:()=>target!=='C:\\repo',isDirectory:()=>target==='C:\\repo',isSymbolicLink:()=>false}), realpathSync:(target:string)=>target};
        });
        vi.doMock('pg', () => ({Client: class {
            constructor(configuration: unknown) { configurations.push(configuration); }
            async connect() { effects.push('guarded-connect'); throw Error('test refuses all PG I/O'); }
            async end() { effects.push('guarded-end'); }
        }}));
        try {
            const {createGuidesParentSupervisor}=await import('../../../scripts/guides-parent-supervision');
            const fake=guidesScripted(); let supervisor: ReturnType<typeof createGuidesParentSupervisor>;
            const originalCreate=fake.input.acquisition.create;
            fake.input.acquisition.create=async()=>{const authority=await originalCreate();supervisor.abort('interrupt');return authority;};
            supervisor=createGuidesParentSupervisor(fake.input);
            await expect(supervisor.run()).rejects.toThrow();await supervisor.dispose();
            expect(configurations).toHaveLength(1);
            expect(configurations[0]).toMatchObject({user:'music_migrator',database:'postgres',host:'127.0.0.1',port:53000,password:'private',connectionTimeoutMillis:3000,statement_timeout:3000});
            expect(effects).toEqual(['guarded-connect','guarded-end']);expect(fake.events).not.toContain('launcher');
        } finally {vi.doUnmock('node:fs');vi.doUnmock('pg');vi.resetModules();}
    },1000);
    it('settles real dispatcher ownership before immediate next command or exit while the sender task tail remains pending', () => {
        const result=definitions('[Console]::Out.WriteLine([GuidesJob.Wire]::ReplyTailRegression())');
        expect(result).toMatchObject({passed:true,overlapRefused:true,exitAdmitted:true,successorAdmitted:true,tailPending:true,priorityKeptOwnership:true,productionConstructors:0,productionEntries:0});
    },30000);
    it.each(['protocol','release'])('retains an after-job-empty %s drain failure and refuses handlesClosed', stage => {
        const result=definitions(`$n=[GuidesJob.ScriptedNative]::new(); $r=[GuidesJob.JobRunner]::new($n); $null=$r.Launch([GuidesJob.Launch]@{Slot='fixture'},[Environment]::TickCount64+1000); $null=$r.Finish([Environment]::TickCount64+1000,$true); $n.RecordDrainFailure('${stage}'); $n.RecordDrainFailure('${stage === 'protocol' ? 'release' : 'protocol'}'); $failure=$null; try{$r.Exit()}catch{$failure=$_.Exception.InnerException.Stage}; [Console]::Out.WriteLine((@{stage=$failure;empty=$r.Empty;closed=$r.Closed;failed=$r.Failed;constructors=[GuidesJob.ProductionNative]::ConstructionCount;entries=[GuidesJob.ProductionNative]::EntryCount}|ConvertTo-Json -Compress))`);
        expect(result).toEqual({stage,empty:true,closed:false,failed:true,constructors:0,entries:0});
    },30000);
});

describe('Guides coordinated worker bootstrap ABI', () => {
    it('refuses a child hello epoch different from the exact parent pending launch',async()=>{
        const {createGuidesParentSupervisor}=await import('../../../scripts/guides-parent-supervision');const fake=guidesScripted({badEpoch:true}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        await expect(supervisor.run()).rejects.toThrow();await supervisor.dispose();expect(fake.frames.filter(frame=>frame.type==='launch-worker')).toHaveLength(1);expect(fake.frames.some(frame=>frame.type==='start-worker-result')).toBe(false);
    },1000);
    it('conveys only parent-derived canonical fixture and worker epochs through the real launcher environment builder', () => {
        const script=fileURLToPath(new URL('../../../scripts/guides-windows-job.ps1',import.meta.url));
        const literal=`$ErrorActionPreference='Stop'\n. '${script.replaceAll("'", "''")}' -DefinitionsOnly\n[Console]::Out.WriteLine([GuidesJob.Wire]::EpochEnvironmentRegression())`;
        const result=JSON.parse(execFileSync('C:/Users/TK/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(literal,'utf16le').toString('base64')],{encoding:'utf8',shell:false,windowsHide:true,timeout:30000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']}).trim());
        expect(result).toEqual({fixture:'0',workers:Array.from({length:16},(_,i)=>String(i+1)),reservedOverridesRefused:3,invalidEpochsRefused:5,productionConstructors:0,productionEntries:0});
    },30000);
    it.each([['listener','drain','authority','custody','storage'],['listener','custody'],['storage'],[]].map(failures=>({failures})))('preserves the actual ordered controller cleanup metadata: %j',async ({failures})=>{
        const {createGuidesParentSupervisor}=await import('../../../scripts/guides-parent-supervision');
        const cleanup={code:'GUIDES_CONTROL_CLEANUP_FAILED',unsettled:true,failures};const fake=guidesScripted({fatalCleanup:cleanup}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        let error:any;try{await supervisor.run();}catch(caught){error=caught;}
        expect(error).toBeDefined();expect(error.cleanup).toEqual(cleanup);expect(Object.isFrozen(error.cleanup)).toBe(true);expect(Object.isFrozen(error.cleanup.failures)).toBe(true);
        expect((await supervisor.dispose()).disposed).toBe(false);expect(fake.frames.some(frame=>frame.type==='terminate-worker')).toBe(false);expect(fake.frames.filter(frame=>frame.type==='launch-worker')).toHaveLength(1);
    },1000);
    it.each([['control'],['storage','listener'],['drain','drain'],['unknown']].map(failures=>({failures})))('refuses malformed helper labels without retaining them as controller metadata: %j',async ({failures})=>{
        const {createGuidesParentSupervisor}=await import('../../../scripts/guides-parent-supervision');const fake=guidesScripted({fatalCleanup:{code:'GUIDES_CONTROL_CLEANUP_FAILED',unsettled:true,failures}}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        let error:any;try{await supervisor.run();}catch(caught){error=caught;}expect(error).toBeDefined();expect(error.cleanup).toBeUndefined();expect((await supervisor.dispose()).disposed).toBe(false);expect(fake.frames.filter(frame=>frame.type==='launch-worker')).toHaveLength(1);
    },1000);
});