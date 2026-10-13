import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
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
        expect(Object.keys(module).sort()).toEqual(['createGuidesParentSupervisor','extractGuidesSupervisorBrowserReportFailure','extractGuidesSupervisorDiagnostic','extractGuidesSupervisorNativeFailure','extractGuidesSupervisorPageFailure','extractGuidesSupervisorPageSeal']);
        expect(() => module.createGuidesParentSupervisor({} as never)).toThrow();
    });
    function rootInput(acquisition: any) {
        return { runId: 'a'.repeat(32), commit: 'b'.repeat(40), acquisition,
            inventory: GUIDES_CASES.flatMap(caseId => GUIDES_PROJECTS.map(project => ({ caseId, project, repeat: 0 as const }))),
            configure: { nodeExecutable: 'C:\\node.exe', loaderPath: 'C:\\loader.mjs', fixtureEntrypoint: 'C:\\fixture.ts', workerEntrypoint: 'C:\\worker.ts', cwd: 'C:\\repo', environment: {}, receiptArguments: [] },
            powershellExecutable: 'C:\\pwsh.exe', jobScript: 'C:\\job.ps1', disposableDirectory: 'C:\\owned', storageDirectory: 'C:\\owned\\storage',
            origin: 'http://127.0.0.1:53001', apiOrigin: 'http://127.0.0.1:53004', harnessPort: 53003, apiPort: 53004, controlPort: 53005, frontendPort: 53006,
            personas: { ownerA: { userId: 'A', handle: 'a' }, ownerB: { userId: 'B', handle: 'b' }, ownerC: { userId: 'C', handle: 'c' } }, databasePassword: 'private', authSecret: 'private', custody: [{kind: 'ancestor' as const, path: 'C:\\', dev: '1', ino: '1'}, {kind: 'root' as const, path: 'C:\\owned', dev: '1', ino: '2'}, {kind: 'storage' as const, path: 'C:\\owned\\storage', dev: '1', ino: '3'}, {kind: 'secret' as const, path: 'C:\\private-secret', dev: '1', ino: '4'}] };
    }
    function adapters(events: string[]) {
        return { clock: { now: () => 0, setTimeout: (_callback: () => void, _ms: number) => 0, clearTimeout: () => {} }, randomHex: (n: number) => 'c'.repeat(n * 2),
            listen: async () => { events.push('listen'); throw new Error('refused'); }, launch: () => { events.push('launch'); throw new Error('refused'); },
            witness: async () => { events.push('witness'); throw new Error('refused'); }, drop: async () => { events.push('drop'); }, disposeCustody: async () => { events.push('custody'); } };
    }
    it('retains intent without effects, disposes once before run and refuses acquisition afterward', async () => {
        const { createGuidesParentSupervisor } = await import('../../../scripts/guides-parent-supervision');
        const events: string[] = []; const acquisition = { intent: { runId: 'a'.repeat(32), commit: 'b'.repeat(40), database: 'owned', port: 57001, passwordFile: 'C:\\private-secret' }, create: async () => { events.push('create'); throw new Error('refused'); }, dispose: async () => { events.push('dispose'); } };
        const supervisor = createGuidesParentSupervisor(rootInput(acquisition), adapters(events));
        expect(events).toEqual([]); const first = supervisor.dispose(); expect(supervisor.dispose()).toBe(first);
        expect(await first).toEqual({ disposed: true, failures: [] });
        await expect(supervisor.run()).rejects.toThrow(); expect(events).toEqual(['dispose', 'custody']);
    });
    it('returns the same run promise, latches abort during acquisition and admits no launcher afterward', async () => {
        const { createGuidesParentSupervisor } = await import('../../../scripts/guides-parent-supervision');
        const events: string[] = []; let resolve!: (value: any) => void; const pending = new Promise<any>(r => { resolve = r; });
        const acquisition = { intent: { runId: 'a'.repeat(32), commit: 'b'.repeat(40), database: 'owned', port: 57001, passwordFile: 'C:\\private-secret' }, create: () => { events.push('create'); return pending; }, dispose: async () => { events.push('dispose'); } };
        const supervisor = createGuidesParentSupervisor(rootInput(acquisition), adapters(events)); const running = supervisor.run(); expect(supervisor.run()).toBe(running);
        supervisor.abort('interrupt'); resolve({ runId: 'a'.repeat(32), commit: 'b'.repeat(40), database: 'owned', port: 57001, passwordFile: 'C:\\private-secret', owned: true, containerId: 'd'.repeat(64), imageId: 'sha256:' + 'e'.repeat(64), contextHost: 'npipe://owned' });
        await expect(running).rejects.toThrow(); const result = await supervisor.dispose(); expect(result.disposed).toBe(false); expect(result.failures).toContain('service-children'); expect(events).not.toContain('listen'); expect(events).not.toContain('launch');
    });
    it('refuses invented identities and custody outside the retained disposable root before effects', async () => {
        const { createGuidesParentSupervisor } = await import('../../../scripts/guides-parent-supervision');
        const events: string[] = []; const acquisition = { intent: { runId: 'a'.repeat(32), commit: 'b'.repeat(40), database: 'owned', port: 57001, passwordFile: 'C:\\private-secret' }, create: async () => { throw new Error('refused'); }, dispose: async () => {} };
        const input = rootInput(acquisition);
        expect(() => createGuidesParentSupervisor({ ...input, inventory: input.inventory.map((item, i) => i ? item : { ...item, caseId: 'invented' }) }, adapters(events))).toThrow();
        expect(() => createGuidesParentSupervisor({ ...input, custody: [{ kind: 'root' as const, path: 'C:\\', dev: '1', ino: '2' }] }, adapters(events))).toThrow();
        expect(events).toEqual([]);
    });
    it('imports the real parent through pinned tsImport with zero application effects and only the locked compiler allowance', () => {
        const root = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/[\\/]$/, '');
        const probe = fileURLToPath(new URL('./fixtures/guides-parent-import-probe.mjs', import.meta.url));
        const environment = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP, TMP: process.env.TMP, NODE_ENV: 'test' };
        let result: string;
        try { result = execFileSync('C:/Users/TK/AppData/Local/Temp/explorers-wave1-tools/node-v24.21.0-win-x64/node.exe', [probe], { cwd: root, encoding: 'utf8', shell: false, windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env: { ...environment, TSX_DISABLE_CACHE: '1' } }); }
        catch (error) { const failure = error as { code?: string; status?: number; stderr?: Buffer }; throw new Error(`Import probe cwd=${root} probeBytes=${readFileSync(probe).length} code=${failure.code} status=${failure.status} stderr=${String(failure.stderr ?? '').slice(0, 4096)}`); }
        expect(result.trim()).toBe('{"ok":true,"target":"supervision","applicationResourceCalls":0,"toolIpcDenied":1}');
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
    const workers = new Map<number, ReturnType<typeof stream>>();
    const authority = { runId: GUIDES_TEST_RUN, commit: GUIDES_TEST_COMMIT, database: 'owned', port: 57001, owned: true as const, containerId: 'd'.repeat(64), imageId: 'sha256:' + 'e'.repeat(64), contextHost: 'npipe://owned' };
    const createdAuthority = options.returnedPort === undefined ? authority : {...authority,port:options.returnedPort as number};
    const witnesses: number[] = [];
    const identities = GUIDES_CASES.flatMap(caseId => GUIDES_PROJECTS.map(project => ({caseId, project, repeat: 0 as const})));
    const personas = {ownerA: {userId: 'auth|owner-a', handle: 'guide-owner-a'}, ownerB: {userId: 'auth|owner-b', handle: 'guide-owner-b'}, ownerC: {userId: 'auth|owner-c', handle: 'guide-owner-c'}};
    const acquisition = {
        intent: Object.freeze({runId: GUIDES_TEST_RUN, commit: GUIDES_TEST_COMMIT, database: 'owned', port: 57001 as number, passwordFile: 'C:\\private-secret'}),
        create: async () => { events.push('create'); if (options.uncertain) throw Error('uncertain creation'); return createdAuthority; },
        dispose: async (drop: (value: typeof authority) => Promise<void>) => { events.push('database-dispose'); if (options.uncertain) throw Error('uncertain retained'); await drop(createdAuthority); },
    };
    const input = {runId: GUIDES_TEST_RUN, commit: GUIDES_TEST_COMMIT, acquisition, inventory: identities,
        configure: {nodeExecutable: 'C:\\node.exe', loaderPath: 'C:\\loader.mjs', fixtureEntrypoint: 'C:\\fixture.ts', workerEntrypoint: 'C:\\worker.ts', cwd: 'C:\\repo', environment: {}, receiptArguments: []},
        powershellExecutable: 'C:\\pwsh.exe', jobScript: 'C:\\job.ps1', disposableDirectory: 'C:\\owned', storageDirectory: 'C:\\owned\\storage', origin: 'http://127.0.0.1:53001', apiOrigin: 'http://127.0.0.1:53004', harnessPort: 53003, apiPort: 53004, controlPort: 53005, frontendPort: 53006,
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
            async write(value: Buffer) { const frame=JSON.parse(value.subarray(4).toString()) as ScriptFrame;frames.push(frame);events.push(frame.type);onWrite(frame); if(options.completeEof&&frame.type==='retired'&&frame.payload.epoch===16)for(let turn=0;turn<12;turn++)await Promise.resolve(); },
            async close() { closed=true;while(waiters.length)waiters.shift()!(null);events.push('stream-close'); },
        };
    }
    const soon = (callback: () => void) => queueMicrotask(() => queueMicrotask(callback));
    function next(epoch: number) {
        if(epoch===17){fixture.emit('complete',{browserExitCode:options.badComplete?1:0});if(options.completeTail)tail(fixture,options.completeTail);if(options.completeEof)fixture.push(null);}
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
            if(frame.type==='start-worker-result')soon(()=>{if((options.fixtureDiagnosticEpoch??options.fixtureDiagnosticFrames?.[0]?.payload.epoch)===frame.payload.epoch){for(const diagnostic of options.fixtureDiagnosticFrames)fixture.emit(diagnostic.type,diagnostic.payload);return;}fixture.emit('observe',{epoch:frame.payload.epoch,identity:identities[frame.payload.epoch-1]});});
            if(frame.type==='observe') {
                if(options.earlyWorkerEof){p.push(null);return;}
                if(options.lostObserve)return; if(options.fatalCleanup){p.emit('fatal',{phase:'observe',code:'unsettled',cleanup:options.fatalCleanup},frame.id);return;} if(options.fatalObserve){p.emit('fatal',{phase:'observe',code:'failed',cleanup:null},frame.id);return;}
                if(options.busyRetire) { fixture.emit('retire-worker',{epoch,identity:identities[epoch-1],nativeComplete:true,producersClosed:true,controlIdle:true});return; }
                p.emit('observed',{epoch,observation:{version:1,action:'observe',runId:GUIDES_TEST_RUN,commit:GUIDES_TEST_COMMIT,...identities[epoch-1],generation:options.badObservation?2:1,personas:{},guides:[],sections:[],media:[],objects:[],attachments:[],provider:{version:1,epoch,counts:{search:0,details:0,price:0,photos:0,jpeg:0},error:null}}},frame.id);
            }
            if(frame.type==='retire-provider'){const count=identities[epoch-1].caseId===GUIDES_CASES[6]?1:0;p.emit('provider-retired',{epoch,provider:{version:1,epoch,counts:{search:count,details:count,price:count,photos:count,jpeg:count},error:null}},frame.id);}
            if(frame.type==='observe-result')soon(()=>fixture.emit('retire-worker',{epoch:frame.payload.epoch,identity:identities[frame.payload.epoch-1],nativeComplete:true,producersClosed:true,controlIdle:true}));
            if(frame.type==='retired'){if((options.completeEof||options.completeTail)&&frame.payload.epoch===16)next(17);else soon(()=>next(frame.payload.epoch+1));}
        });
        p.hello(options.badRole&&role==='worker'?'fixture':role,options.badEpoch&&role==='worker'?epoch+1:epoch,token);connections.push(p);connectionWaiters.shift()?.(connections.shift()!);if(role==='fixture')fixture=p;
        if(role==='worker')workers.set(epoch,p);
        return p;
    }
    function tail(p: ReturnType<typeof stream>, kind: string) {
        if(kind==='fatal')p.emit('fatal',{phase:'retirement',code:'unsettled',cleanup:{code:'GUIDES_CONTROL_CLEANUP_FAILED',unsettled:true,failures:['listener','drain']},...(p===fixture?{boundary:null}:{})});
        else if(kind==='extra')p.emit('unexpected',{});
        else if(kind==='utf8')p.push(Buffer.from([0,0,0,1,255]));
        else p.push(kind==='body'?Buffer.from([0,0,0,10,123]):Buffer.alloc(Number(kind),1));
        p.push(null);
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
        if(frame.type==='terminate-worker') { if(options.workerTail)tail(workers.get(frame.payload.epoch)!,options.workerTail);if(options.workerEof)workers.get(frame.payload.epoch)!.push(null);events.push(`worker-exit:${frame.payload.epoch}`);launcher.emit('terminated',{epoch:frame.payload.epoch,processSignaled:!options.unconfirmedExit},frame.id); }
        if(frame.type==='finish-job')launcher.emit('job-empty',{activeProcesses:0,fixtureSignaled:true,fixtureExitCode:options.nonzeroFixture?7:0,workersSignaled:true},frame.id);
        if(frame.type==='abort-job') { if(held)launcher.emit(options.lateSuccess?'launched':'cancelled',options.lateSuccess?{slot:1}:{commandId:held.id},held.id);launcher.emit('job-empty',{activeProcesses:0,fixtureSignaled:true,fixtureExitCode:7,workersSignaled:true},frame.id); }
        if(frame.type==='exit')launcher.emit('exit-ack',{handlesClosed:!options.badExitAck},frame.id);
    });
    const dependencies={
        clock:{now:()=>now,setTimeout(callback:()=>void,ms:number){const id=++timerId;timers.set(id,{callback,ms});return id;},clearTimeout(id:unknown){timers.delete(id as number);}},
        randomHex:(bytes:number)=>(++random).toString(16).padStart(bytes*2,'0'),
        async listen(_pipe:string){events.push('listen');return {async next(){if(connections.length)return connections.shift()!;return new Promise<ReturnType<typeof stream>>(resolve=>connectionWaiters.push(resolve));},async close(){events.push('listener-close');}};},
        launch(){events.push('launcher');return {stream:launcher,async exited(){events.push('actual-exit');return {code:options.badActualExit?1:0,closed:!options.lostClose};}};},
        async witness(value: typeof authority){witnesses.push(value.port);events.push('pg-witness');if(options.pgError)throw Error('query failed');return {...{maintenanceDatabase:'postgres' as const,databaseOid:42,privileged:true as const,maxPreparedTransactions:0 as const,preparedTransactions:0 as const,clientSessions:0 as const,fresh:true as const},...(options.witnessAfterExit && events.some(event=>event.startsWith('worker-exit:')) ? {clientSessions:1} : options.witness)};},
        async drop(){events.push('drop');},async disposeCustody(){events.push('storage-remove','root-remove','secret-remove');if(options.custodyFailure)throw Error('custody mismatch');},
    };
    return {input,dependencies,events,frames,timers,witnesses,setNow(value:number){now=value;},held:()=>held,expire(ms:number){const selected=[...timers.values()].filter(timer=>timer.ms<=ms);selected.forEach(timer=>timer.callback());}};
}

describe('Guides scripted parent behavior',()=>{
    const load=()=>import('../../../scripts/guides-parent-supervision');
    it('retains optional client boundary across authenticated parent run rebrand',async()=>{const module=await load(),capsule={version:1,epoch:2,caseIndex:1,project:GUIDES_PROJECTS[0],repeat:0,action:'fail',kind:'unknown',matcher:'unknown',line:null,column:null,stage:'unknown',clientBoundary:'producer',producerStage:'section-edit',sectionOperation:'await-ack',sectionAck:{seen:1,matched:false,lastStatus:200,fields:{fieldSet:true,revision:true,title:true,description:false,blocks:true}}},fake=guidesScripted({fixtureDiagnosticFrames:[{type:'native-failure',payload:capsule},{type:'fatal',payload:{phase:'execution',code:'unsettled',cleanup:null,boundary:'harness-command'}}]}),supervisor=module.createGuidesParentSupervisor(fake.input,fake.dependencies);let error:unknown;try{await supervisor.run()}catch(caught){error=caught}expect(module.extractGuidesSupervisorNativeFailure(error)).toEqual(capsule);});
    it('retains authenticated browser report through actual run rebrand, driver, formatter and strict isolated root retainer',async()=>{
        const module=await load(),reportModule=await import('../../../scripts/guides-browser-report-diagnostic.mjs'),{guidesNativeCallsites}=await import('../../../scripts/guides-native-diagnostic'),point=guidesNativeCallsites()[0],capsule={version:1,counts:{passed:15,failed:1,timedOut:0,interrupted:0,skipped:0},failures:[{caseIndex:3,project:GUIDES_PROJECTS[0],repeat:0,kind:'assertion',matcher:'toBeVisible',...point}]},fake=guidesScripted({fixtureDiagnosticEpoch:7,fixtureDiagnosticFrames:[{type:'browser-report-failure',payload:capsule},{type:'fatal',payload:{phase:'execution',code:'failed',cleanup:null,boundary:'browser-exit'}}]}),supervisor=module.createGuidesParentSupervisor(fake.input,fake.dependencies);let error:unknown;try{await supervisor.run();}catch(caught){error=caught;}expect(module.extractGuidesSupervisorBrowserReportFailure(error)).toEqual(capsule);expect(module.extractGuidesSupervisorNativeFailure(error)).toBeUndefined();
        const browser=await import('../../../scripts/guides-browser-fixture'),driver=browser.createGuidesBrowserFixture({platform:'win32',argv:['--suite','guides','--ack','TASK4_FIXTURE_OWNED_DISPOSABLE_PG15','--receipt-directory','C:\\Temp\\synthetic-guides','--receipt-capability','a'.repeat(64)],environment:{},clock:{setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:t=>clearTimeout(t as any)},preflight:async()=>({receipt:{adoptArguments(){},decodeDiscovery(){},decodeExecution(){},finish(){throw Error('Failed run cannot finish');},failure(){}}}),prepare:async()=>fake.input,cleanupSetup:async()=>{},createSupervisor:()=>supervisor,readReport:async()=>{throw Error('Failed run cannot read success report');},installSignals:()=>()=>{}});let driverError:unknown;try{await driver.run();}catch(caught){driverError=caught;}const stderr=browser.formatGuidesFixtureFailure(driverError),root=await import('../../../../scripts/replatform-e2e.mjs'),lane=JSON.parse(readFileSync(new URL('../../../../explorers-earth/e2e/replatform/suite-manifest.json',import.meta.url),'utf8')).lanes.find((l:any)=>l.name==='guides'),record:any={lane:'guides',status:1,signal:null,error:null},child={status:1,signal:null,error:null,stdout:'',stderr};expect(root.retainGuidesFixtureFailure(record,child)).toBeDefined();expect(reportModule.retainGuidesBrowserReportFailure(record,child,lane,{caseTitles:GUIDES_CASES,projects:GUIDES_PROJECTS,isSourcePoint:(line:number,column:number)=>point.line===line&&point.column===column,decodeFixtureFailureLine:root.decodeGuidesFixtureFailureLine})).toBeDefined();expect(record.guidesBrowserReportFailure).toEqual(capsule);expect(stderr).not.toContain('Guides native case failed');
    });
    it('preserves page and seal through the actual supervisor run failure rebrand',async()=>{
        const module=await load(),{GUIDES_PAGE_FAMILIES}=await import('../../../../explorers-earth/e2e/replatform/guides-page-diagnostic'),{guidesNativeCallsites}=await import('../../../scripts/guides-native-diagnostic'),epoch=GUIDES_CASES.indexOf(GUIDES_CASES[3])*GUIDES_PROJECTS.length+1;
        const seal={version:1,epoch,caseIndex:3,project:GUIDES_PROJECTS[0],repeat:0,stage:'initial-detail',outcome:'sealed'},page={version:1,epoch,caseIndex:3,project:GUIDES_PROJECTS[0],repeat:0,stage:'initial-detail',pageErrors:1,overflow:false,families:Object.fromEntries(GUIDES_PAGE_FAMILIES.map(f=>[f,{seen:0,lastStatus:null}])),dom:{expectedHeading:0,loadFailure:1,earthLoader:0}},native={version:1,epoch,caseIndex:3,project:GUIDES_PROJECTS[0],repeat:0,action:'fail',kind:'assertion',matcher:'toBeVisible',...guidesNativeCallsites()[0],stage:'initial-detail'},fake=guidesScripted({fixtureDiagnosticFrames:[{type:'page-seal',payload:seal},{type:'page-failure',payload:page},{type:'native-failure',payload:native},{type:'fatal',payload:{phase:'execution',code:'unsettled',cleanup:null,boundary:'harness-command'}}]}),supervisor=module.createGuidesParentSupervisor(fake.input,fake.dependencies);let error:unknown;
        try{await supervisor.run();}catch(caught){error=caught;}expect(module.extractGuidesSupervisorNativeFailure(error)).toEqual(native);expect(module.extractGuidesSupervisorDiagnostic(error)).toMatchObject({role:'fixture',epoch:0,boundary:'harness-command'});expect(module.extractGuidesSupervisorPageFailure(error)).toEqual(page);expect(module.extractGuidesSupervisorPageSeal(error)).toEqual(seal);
        const browser=await import('../../../scripts/guides-browser-fixture'),driver=browser.createGuidesBrowserFixture({platform:'win32',argv:['--suite','guides','--ack','TASK4_FIXTURE_OWNED_DISPOSABLE_PG15','--receipt-directory','C:\\Temp\\synthetic-guides','--receipt-capability','a'.repeat(64)],environment:{},clock:{setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:t=>clearTimeout(t as any)},preflight:async()=>({receipt:{adoptArguments(){},decodeDiscovery(){},decodeExecution(){},finish(){throw Error('Failed run cannot finish');},failure(){}}}),prepare:async()=>fake.input,cleanupSetup:async()=>{},createSupervisor:()=>supervisor,readReport:async()=>{throw Error('Failed run cannot read success report');},installSignals:()=>()=>{}});let driverError:unknown;try{await driver.run();}catch(caught){driverError=caught;}const stderr=browser.formatGuidesFixtureFailure(driverError);
        expect(stderr).toContain('Guides page seal [guides-page-seal-v1:'+JSON.stringify(seal)+']\n');expect(stderr).toContain('Guides page failed [guides-page-failure-v1:'+JSON.stringify(page)+']\n');
        const root=await import('../../../../scripts/replatform-e2e.mjs'),lane=JSON.parse(readFileSync(new URL('../../../../explorers-earth/e2e/replatform/suite-manifest.json',import.meta.url),'utf8')).lanes.find((l:any)=>l.name==='guides'),record:any={lane:'guides',status:1,signal:null,error:null},child={status:1,signal:null,error:null,stdout:'',stderr};expect(root.retainGuidesFixtureFailure(record,child)).toBeDefined();expect(root.retainGuidesNativeFailure(record,child,lane)).toBeDefined();expect(root.retainGuidesPageSeal(record,child,lane)).toBeDefined();expect(root.retainGuidesPageFailure(record,child,lane)).toBeDefined();expect(record.guidesPageSeal).toEqual(seal);expect(record.guidesPageFailure).toEqual(page);
    });
    it.each(['missing frontend','frontend zero','PG outside range','API mismatch','nonloopback origin'])('refuses port ABI %s before effects',async fault=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted();
        if(fault==='missing frontend')delete (fake.input as any).frontendPort;
        if(fault==='frontend zero')fake.input.frontendPort=0;
        if(fault==='PG outside range')fake.input.acquisition.intent={...fake.input.acquisition.intent,port:53000};
        if(fault==='API mismatch')fake.input.apiOrigin='http://127.0.0.1:53002';
        if(fault==='nonloopback origin')fake.input.origin='http://localhost:53001';
        expect(()=>createGuidesParentSupervisor(fake.input,fake.dependencies)).toThrow();expect(fake.events).toEqual([]);
    });
    const portSlots=['gateway','frontend','harness','api','control','PG'] as const;
    const duplicatePairs=portSlots.flatMap((left,index)=>portSlots.slice(index+1).map(right=>({left,right})));
    it.each(duplicatePairs)('refuses port ABI duplicate $left/$right before acquisition',async ({left,right})=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted();
        const values={gateway:57002,frontend:57003,harness:57004,api:57005,control:57006,PG:57001};values[right]=values[left];
        Object.assign(fake.input,{origin:`http://127.0.0.1:${values.gateway}`,apiOrigin:`http://127.0.0.1:${values.api}`,frontendPort:values.frontend,harnessPort:values.harness,apiPort:values.api,controlPort:values.control});
        fake.input.acquisition.intent={...fake.input.acquisition.intent,port:values.PG};
        expect(()=>createGuidesParentSupervisor(fake.input,fake.dependencies)).toThrow();expect(fake.events).toEqual([]);
    });
    const malformedOrigins=['http://localhost:53001','http://[::1]:53001','https://127.0.0.1:53001','http://127.0.0.1:53001/','http://127.0.0.1:53001/api','http://127.0.0.1:53001?x=1','http://127.0.0.1:53001#x','http://user@127.0.0.1:53001','http://127.0.0.1','http://127.0.0.1:80','http://127.0.0.1:053001',' http://127.0.0.1:53001','http://127.0.0.1:53001\n','http://127.0.0.1:1023','http://127.0.0.1:65536','not a URL'];
    it.each(malformedOrigins.flatMap(value=>['origin','apiOrigin'].map(field=>({value,field}))))('refuses port ABI malformed $field $value',async ({value,field})=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted();(fake.input as any)[field]=value;
        expect(()=>createGuidesParentSupervisor(fake.input,fake.dependencies)).toThrow();expect(fake.events).toEqual([]);
    });
    it.each([1023,65536,1.5,NaN,Infinity,'53006'].flatMap(value=>['frontendPort','harnessPort','apiPort','controlPort'].map(field=>({value,field}))))('refuses port ABI invalid $field $value',async ({value,field})=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted();(fake.input as any)[field]=value;
        expect(()=>createGuidesParentSupervisor(fake.input,fake.dependencies)).toThrow();expect(fake.events).toEqual([]);
    });
    it.each([55999,61000,57001.5,NaN,Infinity])('refuses port ABI invalid PG intent %s',async port=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted();fake.input.acquisition.intent={...fake.input.acquisition.intent,port};
        expect(()=>createGuidesParentSupervisor(fake.input,fake.dependencies)).toThrow();expect(fake.events).toEqual([]);
    });
    it.each([57002,53001,53006])('retains port ABI returned authority %s but refuses listener and launcher',async returnedPort=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted({returnedPort}),supervisor=createGuidesParentSupervisor(fake.input,fake.dependencies);
        await expect(supervisor.run()).rejects.toThrow();expect(fake.events).toEqual(['create']);
        await supervisor.dispose();expect(fake.witnesses).toEqual([returnedPort]);expect(fake.events).toContain('database-dispose');expect(fake.events).not.toContain('listen');expect(fake.events).not.toContain('launcher');
    });
    it('sends port ABI frontend only to fixture and preserves exact worker init',async()=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted();await createGuidesParentSupervisor(fake.input,fake.dependencies).run();
        const fixtureInit=fake.frames.find(frame=>frame.type==='init'&&!('epoch'in frame.payload))!.payload;
        expect(Object.keys(fixtureInit).sort()).toEqual(['runId','commit','authority','disposableDirectory','storageDirectory','origin','apiOrigin','harnessPort','frontendPort','personas','harnessCapability','remainingLaneMs'].sort());
        expect(fixtureInit).toMatchObject({frontendPort:53006,apiOrigin:'http://127.0.0.1:53004',origin:'http://127.0.0.1:53001'});
        const workers=fake.frames.filter(frame=>frame.type==='init'&&'epoch'in frame.payload);expect(workers).toHaveLength(16);
        for(const frame of workers)expect(Object.keys(frame.payload).sort()).toEqual(['runId','commit','epoch','identity','authority','disposableDirectory','storageDirectory','origin','personas','databasePassword','authSecret','apiPort','controlPort','initializeDatabase','remainingLaneMs'].sort());
    });
    it.each([{workerEof:true},{completeEof:true}])('accepts planned clean transport EOF only with positive terminal gates %j',async options=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted(options);
        expect((await createGuidesParentSupervisor(fake.input,fake.dependencies).run()).completedEpochs).toBe(16);
        expect(fake.events).toContain('actual-exit');
    });
    it.each(['1','2','3','body','utf8','extra','fatal'])('rejects planned worker termination with trailing %s',async workerTail=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted({workerTail});
        await expect(createGuidesParentSupervisor(fake.input,fake.dependencies).run()).rejects.toThrow();
        expect(fake.frames.some(frame=>frame.type==='launch-worker'&&frame.payload.epoch===2)).toBe(false);
    });
    it.each(['1','2','3','body','utf8','extra','fatal'])('rejects accepted fixture completion with trailing %s',async completeTail=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted({completeTail});
        await expect(createGuidesParentSupervisor(fake.input,fake.dependencies).run()).rejects.toThrow();
    });
    it.each(['worker','fixture'])('preserves terminal %s fatal cleanup rather than upgrading EOF',async role=>{
        const {createGuidesParentSupervisor,extractGuidesSupervisorDiagnostic}=await load(),fake=guidesScripted(role==='worker'?{workerTail:'fatal'}:{completeTail:'fatal'});
        let error:any;try{await createGuidesParentSupervisor(fake.input,fake.dependencies).run();}catch(caught){error=caught;}
        expect(error).toBeDefined();expect(error.cleanup).toEqual({code:'GUIDES_CONTROL_CLEANUP_FAILED',unsettled:true,failures:['listener','drain']});
        expect(Object.isFrozen(error.cleanup)).toBe(true);expect(Object.isFrozen(error.cleanup.failures)).toBe(true);
        const diagnostic=extractGuidesSupervisorDiagnostic(error);expect(diagnostic).toEqual({version:1,role,epoch:role==='fixture'?0:1,phase:'retirement',code:'unsettled',boundary:null});expect(Object.isFrozen(diagnostic)).toBe(true);
    });
    it.each([{earlyWorkerEof:true},{workerEof:true,unconfirmedExit:true},{workerEof:true,witnessAfterExit:true},{workerEof:true,pgError:true},{completeEof:true,badComplete:true},{completeEof:true,nonzeroFixture:true},{completeEof:true,badExitAck:true},{completeEof:true,badActualExit:true},{completeEof:true,lostClose:true}])('does not upgrade EOF with failed independent gates %j',async options=>{
        const {createGuidesParentSupervisor}=await load(),fake=guidesScripted(options);
        await expect(createGuidesParentSupervisor(fake.input,fake.dependencies).run()).rejects.toThrow();
    });
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
        const retirementFrames=fake.frames.filter(frame=>frame.type==='retire-provider');expect(retirementFrames).toHaveLength(16);
        expect(retirementFrames.map(frame=>frame.payload.epoch)).toEqual(Array.from({length:16},(_,i)=>i+1));
        for(const frame of retirementFrames){const retirement=fake.frames.indexOf(frame),termination=fake.frames.findIndex(next=>next.type==='terminate-worker'&&next.payload.epoch===frame.payload.epoch);expect(retirement).toBeLessThan(termination);}
        expect(budgets).toHaveLength(33+retirementFrames.length);
        const laneBudgets=fake.frames.filter(frame=>frame.type==='init'||frame.type==='observe').map(frame=>frame.payload.remainingLaneMs);
        expect(laneBudgets).toHaveLength(33);expect(laneBudgets[0]).toBe(21600000);for(let i=1;i<laneBudgets.length;i++)expect(laneBudgets[i]).toBeLessThanOrEqual(laneBudgets[i-1]);expect(laneBudgets.at(-1)).toBeLessThan(laneBudgets[0]);
        for(const frame of retirementFrames){const observation=fake.frames.find(next=>next.type==='observe'&&next.payload.epoch===frame.payload.epoch);expect(observation).toBeDefined();if(!observation)throw Error('Original observation frame absent');expect(frame.payload.remainingLaneMs).toBeLessThanOrEqual(30000);expect(frame.payload.remainingLaneMs).toBeLessThanOrEqual(observation.payload.remainingLaneMs);}
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
            expect(configurations[0]).toMatchObject({user:'music_migrator',database:'postgres',host:'127.0.0.1',port:57001,password:'private',connectionTimeoutMillis:3000,statement_timeout:3000});
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

// Complete resource-free adapters for the actual worker, never a modeled worker.
function guidesWorkerFake(options: Record<string, any> = {}) {
    const events: string[] = [], sent: any[] = [], timers = new Map<number, {callback: () => void; ms: number}>();
    let serial=0, now=0, incoming=0, waiting: ((chunk: Buffer|null)=>void)|undefined;
    const chunks:(Buffer|null)[]=[];
    const wire=(value:unknown)=>{const body=Buffer.from(typeof value==='string'?value:JSON.stringify(value)),header=Buffer.alloc(4);header.writeUInt32BE(body.length);return Buffer.concat([header,body]);};
    const push=(chunk:Buffer|null)=>{if(waiting){const callback=waiting;waiting=undefined;callback(chunk);}else chunks.push(chunk);};
    const feed=(type:string,payload:any,id='c'.repeat(32))=>push(wire({v:1,seq:++incoming,id,type,payload}));
    const epoch=options.epoch??1, secret='private-worker-auth-secret';
    const data=syntheticGuidesManifest(buildGuidesSeedPlan(options.caseId??GUIDES_CASES[0]),options.project??GUIDES_PROJECTS[0]);
    const personas=Object.fromEntries(Object.entries(data.expected.personas).map(([owner,p]:[string,any])=>[owner,{userId:p.userId,handle:p.handle}]));
    const init:any={runId:GUIDES_TEST_RUN,commit:GUIDES_TEST_COMMIT,epoch,identity:{caseId:options.caseId??GUIDES_CASES[0],project:options.project??GUIDES_PROJECTS[0],repeat:0},
        authority:{runId:GUIDES_TEST_RUN,commit:GUIDES_TEST_COMMIT,database:`music_uat_${GUIDES_TEST_RUN}`,port:56001,owned:true,containerId:'d'.repeat(64),imageId:'sha256:'+'e'.repeat(64),contextHost:'npipe://owned'},
        disposableDirectory:'C:\\private\\explorers-profile-e2e-Abc123',storageDirectory:'C:\\private\\explorers-profile-e2e-Abc123\\owned-media',origin:'http://127.0.0.1:53111',personas,
        databasePassword:'private-worker-password',authSecret:secret,apiPort:54111,controlPort:51111,initializeDatabase:epoch===1,remainingLaneMs:21600000};
    options.changeInit?.(init);
    const cookie=(token:string)=>`better-auth.session_token=${token}.${createHmac('sha256',secret).update(token).digest('base64')}`;
    const reset:any={version:1,action:'reset',runId:init.runId,commit:init.commit,...init.identity,generation:1,manifest:data.manifest,
        sessions:Object.fromEntries(Object.keys(personas).map((owner,i)=>[owner,{cookie:cookie(`reset-${i}`)}]))};
    options.changeReset?.(reset);
    const observation:any={version:1,action:'observe',runId:init.runId,commit:init.commit,...init.identity,generation:1,
        personas:Object.fromEntries(Object.entries(data.manifest.personas).map(([owner,p]:[string,any])=>[owner,{...p,status:'active',publicProfile:false,guidesPublic:false,guidesContentRevision:0}])),guides:[],sections:[],media:[],objects:[],attachments:[]};
    options.changeObservation?.(observation);
    let releaseHelper!:(value:any)=>void, rejectListener!:(error:unknown)=>void, provider:any;
    let session=0;const context={authCookies:{sessionToken:{name:'better-auth.session_token'}},internalAdapter:{createSession:async(userId:string)=>{events.push(`session:${userId}`);return {token:`bootstrap-${session++}`};}}};
    const pool={query:async(sql:string,values:any[]=[])=>{events.push(sql.startsWith('INSERT')?'insert':sql.includes('current_database')?'database':'baseline');
        if(sql.includes('current_database'))return {rows:[{database:options.wrongDatabase?'foreign':init.authority.database}]};
        if(sql.includes('initial_account_bindings')){const owner=Object.keys(personas).find(o=>personas[o].userId===values[0])!,p=data.manifest.personas[owner];return {rows:[{user_id:p.userId,account_id:options.badBinding?'10000000-0000-4000-8000-000000000099':p.accountId,revision:options.badRevision?2:1,display_name:options.badDisplay?'wrong':null}]};}
        return {rows:[]};},connect:async()=>{throw Error('worker fake prohibits unexpected pool client');},end:async()=>{events.push('pool-end');}};
    const storage={environment:'local',putOwned:async()=>{events.push('put');},get:async()=>{events.push('get');},delete:async()=>{events.push('delete');}};
    const helper={version:1 as const,url:'http://127.0.0.1:51111/control',capability:'f'.repeat(64),runId:init.runId,commit:init.commit,close:async()=>{events.push('helper-close');}};
    const composed={auth:{$context:Promise.resolve(context)},app:{}};
    const deps:any={platform:'win32',argv:[],environment:{GUIDES_PRIVATE_PIPE:`\\\\.\\pipe\\explorers-guides-${GUIDES_TEST_RUN}-${'0'.repeat(32)}`,GUIDES_PRIVATE_TOKEN:'f'.repeat(64),GUIDES_PRIVATE_EPOCH:String(epoch)},
        clock:{now:()=>now,setTimeout:(callback:()=>void,ms:number)=>{const key=++serial;timers.set(key,{callback,ms});return key;},clearTimeout:(key:number)=>{timers.delete(key);}},randomHex:(bytes:number)=>'1'.repeat(bytes*2),
        connectPipe:async()=>{events.push('pipe');return {read:async()=>chunks.length?chunks.shift()!:await new Promise<Buffer|null>(resolve=>{waiting=resolve;}),
            write:async(bytes:Buffer)=>{const frame=JSON.parse(bytes.subarray(4).toString());sent.push(frame);events.push(frame.type);
                if(frame.type==='hello'){if(options.rawInit)push(options.rawInit(wire,init));else feed('init',init);}
                if(frame.type==='init-ack'){if(options.holdBegin)return;if(options.noBegin)push(null);else feed(options.badBegin?'reset':'begin',{});}
                if(frame.type==='ready'){if(options.holdObserve)return;const command={epoch,identity:init.identity,remainingLaneMs:21600000};options.changeObserve?.(command);feed('observe',command,'2'.repeat(32));}
                if(frame.type==='observed'&&!options.holdAfterObserved)push(null);},close:async()=>{events.push('pipe-close');}};},
        createPool:async(configuration:any)=>{events.push('pool');expect(configuration).toMatchObject({user:'music_migrator',host:'127.0.0.1',port:56001,database:init.authority.database,password:init.databasePassword});return pool;},
        migrate:async(received:any)=>{expect(received).toBe(pool);events.push('migrate');},
        resolveConfig:async(environment:any)=>{events.push('config');expect(environment).toEqual({EXPLORERS_PUBLIC_ORIGIN:init.origin,EXPLORERS_AUTH_SECRET:secret,GOOGLE_CLIENT_ID:'profile-fixture-google',GOOGLE_CLIENT_SECRET:'profile-fixture-secret'});return {baseURL:init.origin,secret};},
        createStorage:async(directory:string)=>{events.push('storage');expect(directory).toBe(init.storageDirectory);return storage;},
        compose:async(received:any,config:any,settings:any)=>{events.push('compose');expect(received).toBe(pool);expect(settings).toEqual({mediaStorage:storage});return composed;},
        listen:async(received:any,port:number,host:string,ownedProvider:any)=>{provider=ownedProvider;events.push('listen');expect(received).toBe(composed);expect([port,host]).toEqual([54111,'127.0.0.1']);return {failed:new Promise<never>((_,reject)=>{rejectListener=reject;})};},
        startControl:async(settings:any)=>{events.push('helper');expect(settings).toMatchObject({pool,composed,runId:init.runId,commit:init.commit,authority:init.authority,expectedTemporaryRoot:'C:\\private',disposableDirectory:init.disposableDirectory,storage:{directory:init.storageDirectory,instance:storage},port:51111,apiOrigin:'http://127.0.0.1:54111'});
            expect(Object.keys(settings).sort()).toEqual(['pool','composed','config','runId','commit','authority','personas','expectedTemporaryRoot','disposableDirectory','storage','port','apiOrigin'].sort());
            if(options.helperError)throw options.helperError;if(options.holdHelper)return await new Promise(resolve=>{releaseHelper=resolve;});return helper;},
        fetch:async(url:string,request:any)=>{expect(request.redirect).toBe('error');
            if(url.endsWith('/me')){events.push('me');if(options.meError)throw Error('private transport failure');const cookies=Object.values(reset.sessions).map((p:any)=>p.cookie);const index=cookies.indexOf(request.headers.Cookie);const i=index>=0?index:Number(/^better-auth\.session_token=bootstrap-(\d+)/.exec(request.headers.Cookie)![1]);const p=data.manifest.personas[Object.keys(personas)[i]];
                const account:any={id:p.accountId,revision:index>=0?p.accountRevision:1,displayName:index>=0?'Guides '+Object.keys(personas)[i]:null,handle:index>=0?p.handle:null,
                    accountType:index>=0?'Creator':null,onboardingStatus:index>=0?'complete':'incomplete',status:'active',publicProfile:false,autoPinning:false,locale:'en',mobileNumber:null,mobileNumberVisible:false,bioPlain:null,bioRich:null,primaryAddress:null,additionalAddresses:[],publicAddress:null,profilePlaceDetails:null,categories:[],themeSettings:{},socialLinks:[],businessDetails:{},feedItems:[]};
                options.changeMe?.(account,index);return {status:200,headers:{get:()=>null},body:null,text:async()=>JSON.stringify({account})};}
            expect(url).toBe(helper.url);expect(request.method).toBe('POST');expect(request.headers).toMatchObject({Host:'127.0.0.1:51111','x-guides-capability':helper.capability,'Content-Type':'application/json'});
            const command=JSON.parse(request.body);events.push(command.action);expect(command).toEqual({version:1,action:command.action,runId:init.runId,commit:init.commit,...init.identity,generation:command.action==='reset'?0:1});
            if(options.busy&&command.action==='observe')feed('observe',{epoch,identity:init.identity,remainingLaneMs:21600000},'3'.repeat(32));
            if(options.holdReset&&command.action==='reset')return await new Promise(()=>{});
            return {status:200,headers:{get:()=>null},body:null,text:async()=>JSON.stringify(command.action==='reset'?reset:observation)};},
    };
    return {deps,events,sent,init,reset,feed,push,wire,get provider(){return provider;},releaseHelper:()=>releaseHelper(helper),failListener:()=>rejectListener(Error('private listener failure')),setNow:(value:number)=>{now=value;},expire:(minimum:number)=>{for(const [key,timer]of [...timers])if(timer.ms===minimum){timers.delete(key);timer.callback();}},timers};
}

describe('Guides actual resource worker',()=>{
    const load=()=>import('../../../scripts/guides-resource-worker');
    it('provides the sole import-safe worker entry',async()=>{expect(existsSync(new URL('../../../scripts/guides-resource-worker.ts',import.meta.url))).toBe(true);const module=await load();expect(Object.keys(module)).toEqual(['runGuidesResourceWorker']);});
    it('resumes original execution only after observed send then joins five provider finishes and socket closes before its private retirement frame',async()=>{
        const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({caseId:GUIDES_CASES[6],holdObserve:true,holdAfterObserved:true});
        const rejected=expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();
        for(let turn=0;turn<500&&!fake.sent.some(f=>f.type==='ready');turn++)await Promise.resolve();expect(fake.provider).toBeDefined();
        fake.feed('observe',{epoch:1,identity:fake.init.identity,remainingLaneMs:21600000},'2'.repeat(32));
        for(let turn=0;turn<500&&!fake.sent.some(f=>f.type==='observed');turn++)await Promise.resolve();
        for(let turn=0;turn<40;turn++)await Promise.resolve();
        expect(fake.sent.find(f=>f.type==='observed').payload.observation.provider.counts).toEqual({search:0,details:0,price:0,photos:0,jpeg:0});
        const sockets:any[]=[];
        for(const suffix of ['search','places/guides-fixture-museum/details','places/guides-fixture-museum/price','places/guides-fixture-museum/photos','photos/guides-fixture-photo.jpg']){
            const socket:any=Object.assign(new EventEmitter(),{remoteAddress:'127.0.0.1',destroyed:false,destroy(){socket.destroyed=true;fake.events.push('provider-socket-close');socket.emit('close');}});sockets.push(socket);
            const request:any=Object.assign(new EventEmitter(),{method:'GET',url:'/__guides_provider__/v1/'+suffix,headers:{host:'127.0.0.1:53111'},rawHeaders:['Host','127.0.0.1:53111'],socket,complete:false,aborted:false,destroyed:false,resume(){},destroy(){request.destroyed=true;request.emit('close');}});
            const response:any=Object.assign(new EventEmitter(),{statusCode:0,writableFinished:false,destroyed:false,setHeader(){},end(){response.writableFinished=true;response.emit('finish');},destroy(){response.destroyed=true;response.emit('close');}});
            expect(fake.provider.handle(request,response)).toBe(true);request.complete=true;request.emit('end');expect(response.statusCode).toBe(200);
        }
        fake.feed('retire-provider',{epoch:1,identity:fake.init.identity,remainingLaneMs:21600000},'3'.repeat(32));
        for(let turn=0;turn<500&&!fake.sent.some(f=>f.type==='provider-retired');turn++)await Promise.resolve();
        expect(fake.sent.find(f=>f.type==='provider-retired')).toMatchObject({id:'3'.repeat(32),payload:{epoch:1,provider:{version:1,epoch:1,counts:{search:1,details:1,price:1,photos:1,jpeg:1},error:null}}});
        expect(sockets.every(socket=>socket.destroyed)).toBe(true);expect(fake.events.lastIndexOf('provider-socket-close')).toBeLessThan(fake.events.indexOf('provider-retired'));
        fake.failListener();await rejected;expect(fake.events).not.toContain('helper-close');
    });
    it('rejects a partial case6 private retirement and preserves the original safe provider error',async()=>{
        const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({caseId:GUIDES_CASES[6],holdObserve:true});const rejected=expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();
        for(let turn=0;turn<500&&!fake.sent.some(f=>f.type==='ready');turn++)await Promise.resolve();
        fake.feed('retire-provider',{epoch:1,identity:fake.init.identity,remainingLaneMs:21600000},'3'.repeat(32));await rejected;
        expect(fake.sent.some(f=>f.type==='provider-retired')).toBe(false);expect(fake.sent.find(f=>f.type==='fatal')?.payload).toEqual({phase:'retirement',code:'protocol',cleanup:null});
    });
    it('authenticates init ack and begin before effects, reads baseline before helper, resets once and observes generation1',async()=>{
        const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake();await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();
        expect(fake.sent[0]).toEqual({v:1,type:'hello',role:'worker',epoch:1,token:'f'.repeat(64)});expect(fake.sent.find(f=>f.type==='init-ack')).toMatchObject({seq:1,id:'c'.repeat(32),payload:{}});
        expect(fake.events.indexOf('pool')).toBeGreaterThan(fake.events.indexOf('init-ack'));expect(fake.events.filter(e=>e==='insert')).toHaveLength(6);expect(fake.events.filter(e=>e==='migrate')).toHaveLength(1);
        expect(fake.events.indexOf('database')).toBeLessThan(fake.events.indexOf('me'));expect(fake.events.filter(e=>e==='baseline')).toHaveLength(3);expect(fake.events.lastIndexOf('baseline')).toBeLessThan(fake.events.indexOf('helper'));
        expect(fake.events.filter(e=>e==='reset')).toHaveLength(1);expect(fake.sent.find(f=>f.type==='ready')?.payload).toEqual({epoch:1,apiOrigin:'http://127.0.0.1:54111',reset:fake.reset});expect(fake.sent.find(f=>f.type==='observed')?.id).toBe('2'.repeat(32));
        expect(fake.events.indexOf('ready')).toBeGreaterThan(fake.events.indexOf('reset'));expect(fake.events).not.toEqual(expect.arrayContaining(['helper-close','delete','pool-end','put']));
    });
    it('later epoch preserves root personas storage and config without migration or seed',async()=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({epoch:2});await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();expect(fake.sent.some(f=>f.type==='ready')).toBe(true);expect(fake.events).not.toContain('migrate');expect(fake.events).not.toContain('insert');});
    it.each(['GUIDES_PRIVATE_PIPE','GUIDES_PRIVATE_TOKEN','GUIDES_PRIVATE_EPOCH'])('refuses partial bootstrap %s before pipe or effects',async key=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake();delete fake.deps.environment[key];await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();expect(fake.events).toEqual([]);});
    it.each(['0','01','17','1.0','-1'])('refuses malformed epoch %s',async epoch=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake();fake.deps.environment.GUIDES_PRIVATE_EPOCH=epoch;await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();expect(fake.events).toEqual([]);});
    it('refuses partial adapters, Linux, flags and ambient authority before effects',async()=>{const {runGuidesResourceWorker}=await load();for(const mutate of [(d:any)=>delete d.migrate,(d:any)=>d.platform='linux',(d:any)=>d.argv=['--help'],(d:any)=>d.environment.DATABASE_URL='secret']){const fake=guidesWorkerFake();mutate(fake.deps);await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();expect(fake.events).toEqual([]);}});
    it.each(['noBegin','badBegin'])('never allocates if begin is missing or wrong: %s',async fault=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({[fault]:true});await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();expect(fake.events).not.toContain('pool');});
    it.each(['epoch','database','path','ports','persona','first','identity','extra','runId'])('refuses invalid init %s before allocation',async fault=>{
        const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({changeInit:(i:any)=>{if(fault==='epoch')i.epoch=2;if(fault==='database')i.authority.database='foreign';if(fault==='path')i.storageDirectory+='\\..';if(fault==='ports')i.controlPort=i.apiPort;if(fault==='persona')i.personas.ownerB=i.personas.ownerA;if(fault==='first')i.initializeDatabase=false;if(fault==='identity')i.identity.repeat=1;if(fault==='extra')i.extra='private';if(fault==='runId')i.runId='0'.repeat(32);}});await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();expect(fake.events).not.toContain('pool');
    });
    it.each(['wrongDatabase','badBinding','badRevision','badDisplay'])('refuses actual DB/binding baseline mismatch before helper: %s',async fault=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({[fault]:true});await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();expect(fake.events).not.toContain('helper');expect(fake.sent.some(f=>f.type==='ready')).toBe(false);});
    it.each(['generation','manifest','session','extra'])('never publishes mismatched reset %s',async fault=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({changeReset:(r:any)=>{if(fault==='generation')r.generation=2;if(fault==='manifest')r.manifest.caseId=GUIDES_CASES[1];if(fault==='session')r.sessions.ownerB.cookie=r.sessions.ownerA.cookie;if(fault==='extra')r.extra=true;}});await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();expect(fake.sent.some(f=>f.type==='ready')).toBe(false);});
    it.each(['generation','identity','extra'])('refuses invalid observed %s without publication',async fault=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({changeObservation:(o:any)=>{if(fault==='generation')o.generation=2;if(fault==='identity')o.caseId=GUIDES_CASES[1];if(fault==='extra')o.extra=true;}});await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();expect(fake.sent.some(f=>f.type==='ready')).toBe(true);expect(fake.sent.some(f=>f.type==='observed')).toBe(false);});
    it('terminally refuses a concurrent observe without late result or second reset',async()=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({busy:true});await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();expect(fake.sent.some(f=>f.type==='observed')).toBe(false);expect(fake.events.filter(e=>e==='reset')).toHaveLength(1);});
    it('preserves ordered cleanup metadata and sanitizes all diagnostics',async()=>{const {runGuidesResourceWorker}=await load(),cleanup={code:'GUIDES_CONTROL_CLEANUP_FAILED',unsettled:true,failures:['listener','drain','storage']},fake=guidesWorkerFake({helperError:Object.assign(Error('private-worker-password'),{name:'GuidesControlCleanupError',...cleanup})});await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();expect(fake.sent.find(f=>f.type==='fatal')?.payload).toEqual({phase:'bootstrap',code:'unsettled',cleanup});expect(JSON.stringify(fake.sent)).not.toContain('private-worker-password');expect(fake.events).not.toContain('helper-close');});
    it('times out inherited startup and suppresses late publication without fictional cleanup',async()=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({holdHelper:true});const rejected=expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();for(let n=0;n<200&&!fake.events.includes('helper');n++)await Promise.resolve();expect(fake.events).toContain('helper');fake.setNow(305001);fake.expire(305000);await rejected;expect(fake.sent.some(f=>f.type==='ready')).toBe(false);expect(fake.events).not.toContain('helper-close');expect(fake.sent.find(f=>f.type==='fatal')?.payload.code).toBe('unsettled');});
    it.each(['duplicate','sequence','utf8','oversize'])('refuses malformed private frame %s before effects',async fault=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({rawInit:(wire:any,init:any)=>{if(fault==='duplicate')return wire('{"v":1,"v":1,"seq":1,"id":"'+'c'.repeat(32)+'","type":"init","payload":'+JSON.stringify(init)+'}');if(fault==='sequence')return wire({v:1,seq:2,id:'c'.repeat(32),type:'init',payload:init});if(fault==='utf8')return Buffer.from([0,0,0,1,255]);return Buffer.from([0,160,0,0]);}});await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();expect(fake.events).not.toContain('pool');expect(fake.sent.find(f=>f.type==='fatal')?.payload.code).toBe('protocol');});
    it('rejects a malformed full canonical DTO before helper startup',async()=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({changeMe:(account:any)=>account.status='invented'});await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();expect(fake.events).not.toContain('helper');});
    it('reports failed canonical transport as unresolved physical work',async()=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({meError:true});await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();expect(fake.sent.find(f=>f.type==='fatal')?.payload.code).toBe('unsettled');expect(JSON.stringify(fake.sent)).not.toContain('private transport');expect(fake.events).not.toContain('helper');});
    it('does not publish a late helper handle after terminal timeout',async()=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({holdHelper:true});const rejected=expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();for(let n=0;n<200&&!fake.events.includes('helper');n++)await Promise.resolve();fake.setNow(305001);fake.expire(305000);await rejected;const count=fake.events.length;fake.releaseHelper();for(let n=0;n<50;n++)await Promise.resolve();expect(fake.events).toHaveLength(count);expect(fake.sent.some(f=>f.type==='ready')).toBe(false);expect(fake.events).not.toContain('helper-close');});
    it.each([['storage','listener'],['drain','drain'],['control']].map(failures=>({failures})))('refuses malformed cleanup metadata %j',async ({failures})=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({helperError:Object.assign(Error('private'),{name:'GuidesControlCleanupError',code:'GUIDES_CONTROL_CLEANUP_FAILED',unsettled:true,failures})});await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();expect(fake.sent.find(f=>f.type==='fatal')?.payload).toEqual({phase:'bootstrap',code:'protocol',cleanup:null});});
    it('latches an actual API listener failure after readiness',async()=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({holdObserve:true});const rejected=expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();for(let n=0;n<300&&!fake.events.includes('ready');n++)await Promise.resolve();expect(fake.events).toContain('ready');fake.failListener();await rejected;expect(fake.sent.some(f=>f.type==='observed')).toBe(false);expect(JSON.stringify(fake.sent)).not.toContain('private listener failure');});
    it('enforces inherited lane expiry while an active worker is idle',async()=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({holdObserve:true,changeInit:(i:any)=>i.remainingLaneMs=100});const rejected=expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();for(let n=0;n<300&&!fake.events.includes('ready');n++)await Promise.resolve();expect(fake.events).toContain('ready');fake.setNow(101);fake.expire(100);await rejected;expect(fake.sent.find(f=>f.type==='fatal')?.payload.code).toBe('timeout');expect(fake.events).not.toContain('helper-close');});
    it('refuses an extra reserved private environment member before connection',async()=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake();fake.deps.environment.GUIDES_PRIVATE_ROLE='worker';await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();expect(fake.events).toEqual([]);});
    it.each(GUIDES_CASES.flatMap(caseId=>GUIDES_PROJECTS.map(project=>({caseId,project}))))('validates the actual inner manifest and fixed bytes for the frozen source tuple %j',async identity=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake(identity);await expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();expect(fake.sent.find(f=>f.type==='ready')?.payload.reset.manifest.caseId).toBe(identity.caseId);expect(fake.sent.find(f=>f.type==='ready')?.payload.reset.manifest.project).toBe(identity.project);expect(fake.events.filter(e=>e==='reset')).toHaveLength(1);});
    it('retains unresolved helper work when a shorter inherited lane expires',async()=>{const {runGuidesResourceWorker}=await load(),fake=guidesWorkerFake({holdHelper:true,changeInit:(i:any)=>i.remainingLaneMs=100});const rejected=expect(runGuidesResourceWorker(fake.deps)).rejects.toThrow();for(let n=0;n<300&&!fake.events.includes('helper');n++)await Promise.resolve();expect(fake.events).toContain('helper');fake.setNow(101);fake.expire(100);await rejected;expect(fake.sent.find(f=>f.type==='fatal')?.payload.code).toBe('unsettled');fake.releaseHelper();for(let n=0;n<30;n++)await Promise.resolve();expect(fake.events).not.toContain('reset');});
});



