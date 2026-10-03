import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,copyFileSync,rmSync,readdirSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,basename,dirname,resolve} from 'node:path';
import {parseArguments,assertEnvironment,validateManifest,validateLaneReceipt,qualifyLanes,capturedChild,decodeProtectedReport,snapshotSource,protectedBrowserConfiguration,validateFailureRecord,decodeProtectedFailureDiagnostics} from './replatform-e2e.mjs';
const ack='TASK4_FIXTURE_OWNED_DISPOSABLE_PG15';
const manifest=()=>JSON.parse(readFileSync(new URL('../explorers-earth/e2e/replatform/suite-manifest.json',import.meta.url)));
const provenance={commit:'a'.repeat(40),sourceHash:'b'.repeat(64),manifestHash:'c'.repeat(64),dirty:true};
const child=(lane)=>({status:0,signal:null,error:null,receipt:{version:1,lane:lane.name,provenance,config:lane.config,spec:lane.spec,projects:lane.projects,discovery:lane.identities,results:lane.identities.map(identity=>({identity,expectedStatus:'passed',status:'expected',attempts:[{status:'passed',retry:0}]})),errors:[],cleanup:{status:'passed'},artifacts:{trace:'off',video:'off',screenshot:'off',cleanup:'passed'},authority:{owned:true,database:'music_uat_'+'d'.repeat(32),containerId:'e'.repeat(64),imageId:'sha256:'+'f'.repeat(64)},child:{status:0,signal:null},startedAt:'2026-10-02T00:00:00.000Z',endedAt:'2026-10-02T00:00:01.000Z',playwright:'1.61.1'}});
test('only named delivered scope and fresh owned temporary output are accepted',()=>{
 const args=['--milestone','delivered-auth-profile-books','--ack',ack,'--receipt',join(tmpdir(),'replatform-e2e-contract-12345678')];
 assert.equal(parseArguments(args).milestone,'delivered-auth-profile-books');
 for(const patch of [[],[...args,'--ack',ack],args.map(x=>x===ack?'wrong':x),args.map(x=>x==='delivered-auth-profile-books'?'full-parity':x),args.map(x=>x.startsWith(tmpdir())?'../outside':x),[...args,'--grep','auth']])assert.throws(()=>parseArguments(patch));
});
test('ambient hosted/database/production authority is rejected before any child',()=>{
 for(const key of ['DATABASE_URL','DATABASE_URL_TEST','DOCKER_HOST','DOCKER_CONTEXT','PLAYWRIGHT_EXTERNAL_BASE_URL','GATE_PROD','MUSIC_C10_STANDALONE_POSTGRES_ACK'])assert.throws(()=>assertEnvironment({[key]:'unowned'}));
 assert.throws(()=>assertEnvironment({NODE_ENV:'production'}));assert.doesNotThrow(()=>assertEnvironment({}));
});
test('manifest requires exactly four nonempty unique delivered lanes and pending obligations',()=>{
 assert.equal(validateManifest(manifest()),true);
 for(const change of [m=>m.lanes.pop(),m=>m.lanes.push(m.lanes[0]),m=>m.lanes[0].identities.pop(),m=>m.lanes[0].identities[0].file='../escape',m=>m.lanes[0].identities[0].titlePath=[],m=>m.pending=[],m=>m.version=2]){const m=manifest();change(m);assert.throws(()=>validateManifest(m));}
});
test('fake children qualify only scoped delivery while full milestone remains incomplete',async()=>{
 const m=manifest();const seen=[];const receipt=await qualifyLanes({manifest:m,provenance,runLane:async lane=>{seen.push(lane.name);return child(lane);}});
 assert.deepEqual(seen,['auth','profile','books','lifecycle']);assert.equal(receipt.deliveredSlice,'passed');assert.equal(receipt.overallMilestone,'incomplete');assert.equal(receipt.releaseEligible,false);assert.equal(receipt.identities,38);
});
for(const [name,change] of [
 ['nonzero',c=>c.status=1],['signal',c=>c.signal='SIGTERM'],['spawn error',c=>c.error='failed'],['missing receipt',c=>delete c.receipt],['wrong source',c=>c.receipt.provenance.commit='0'.repeat(40)],['source hash',c=>c.receipt.provenance.sourceHash='0'.repeat(64)],['wrong config',c=>c.receipt.config='other.config.ts'],['wrong project',c=>c.receipt.projects=['other']],['loader error',c=>c.receipt.errors.push({message:'missing module'})],['missing discovery',c=>c.receipt.discovery.pop()],['extra discovery',c=>c.receipt.discovery.push({...c.receipt.discovery[0],titlePath:['extra']})],['duplicate discovery',c=>c.receipt.discovery.push(c.receipt.discovery[0])],['missing result',c=>c.receipt.results.pop()],['extra result',c=>c.receipt.results.push(c.receipt.results[0])],['dynamic skip',c=>c.receipt.results[0].attempts[0].status='skipped'],['fixme',c=>c.receipt.results[0].expectedStatus='skipped'],['timeout',c=>c.receipt.results[0].attempts[0].status='timedOut'],['interrupted',c=>c.receipt.results[0].attempts[0].status='interrupted'],['retry pass',c=>c.receipt.results[0].attempts.push({status:'passed',retry:1})],['flaky',c=>c.receipt.results[0].status='flaky'],['empty attempts',c=>c.receipt.results[0].attempts=[]],['cleanup failure',c=>c.receipt.cleanup.status='failed'],['unowned database',c=>c.receipt.authority.owned=false],['failed browser child',c=>c.receipt.child.status=1]
])test(`lane evidence rejects ${name}`,()=>{const lane=manifest().lanes[0],c=structuredClone(child(lane));change(c);assert.throws(()=>validateLaneReceipt(lane,c,provenance));});
test('failed lane prevents later child execution and cannot yield green aggregate',async()=>{
 const m=manifest(),seen=[];await assert.rejects(()=>qualifyLanes({manifest:m,provenance,runLane:async lane=>{seen.push(lane.name);const c=child(lane);c.status=1;return c;}}));assert.deepEqual(seen,['auth']);
});
test('unknown receipt fields cannot archive credentials as passing evidence',()=>{const lane=manifest().lanes[0],c=child(lane);c.receipt.cookie='not-allowed';assert.throws(()=>validateLaneReceipt(lane,c,provenance));});
test('private IPC cancellation waits for controlled child cleanup and still fails the child signal',async()=>{
 const controller=new AbortController(),capability='test-owned-capability';
 const timer=setTimeout(()=>controller.abort(),200);
 try{const c=await capturedChild(process.execPath,['-e',`process.on('message',m=>{if(m.type==='replatform-cancel'&&m.capability==='${capability}'){process.stdout.write('fake owned cleanup completed');process.disconnect();process.exitCode=0;}});`],process.cwd(),process.env,capability,controller.signal);assert.equal(c.status,0);assert.equal(c.signal,'SIGTERM');assert.match(c.stdout,/fake owned cleanup completed/);}
 finally{clearTimeout(timer);}
});
const rawReport=(lane,execution=false)=>({errors:[],config:{workers:1,shard:null,forbidOnly:true,rootDir:join(process.cwd(),'explorers-earth/e2e/replatform'),configFile:join(process.cwd(),lane.config),projects:[...lane.projects.map(name=>({name,repeatEach:1,retries:0})),{name:'unselected-music',repeatEach:1,retries:2}],version:'1.61.1'},suites:[{title:basename(lane.spec),specs:lane.identities.map(identity=>({file:basename(identity.file),title:identity.titlePath[0],tests:[{projectName:identity.project,expectedStatus:'passed',annotations:[],status:execution?'expected':'skipped',results:execution?[{status:'passed',retry:0}]:[]}]}))}]});
test('actual reporter contract permits unselected configured projects but requires selected exact tuples',()=>{const lane=manifest().lanes[0];assert.deepEqual(decodeProtectedReport(rawReport(lane),lane,process.cwd(),false).results,lane.identities);});
for(const [name,change] of [['loader errors',r=>r.errors.push({message:'loader'})],['missing selected project',r=>r.config.projects.shift()],['selected retries',r=>r.config.projects[0].retries=1],['sharding',r=>r.config.shard={current:1,total:2}],['only allowed',r=>r.config.forbidOnly=false],['wrong spec',r=>r.suites[0].specs[0].file='other.spec.ts'],['unknown project',r=>r.suites[0].specs[0].tests[0].projectName='unselected-music'],['skip annotation',r=>r.suites[0].specs[0].tests[0].annotations=[{type:'skip'}]],['stdout/incomplete JSON',r=>delete r.errors]])test(`raw discovery rejects ${name}`,()=>{const lane=manifest().lanes[0],r=rawReport(lane);change(r);assert.throws(()=>decodeProtectedReport(r,lane,process.cwd(),false));});
test('raw dynamic skip cannot qualify even if process succeeds',()=>{const lane=manifest().lanes[0],r=rawReport(lane,true);r.suites[0].specs[0].tests[0].results[0].status='skipped';const c=child(lane);c.receipt.results=decodeProtectedReport(r,lane,process.cwd(),true).results;assert.throws(()=>validateLaneReceipt(lane,c,provenance));});

test('already-dirty executed migration and helper edits change source provenance',()=>{
 const root=process.cwd(),directory=mkdtempSync(join(tmpdir(),'replatform-source-contract-'));
 const omitted=['tunes/migrations/0001_runtime_baseline.sql','tunes/scripts/music-uat-database.ts','tunes/scripts/music-fixture-secret.ts','tunes/scripts/music-qualification-postgres.ts','tunes/scripts/music-output-redaction.ts','tunes/scripts/music-vitest-evidence.ts'];
 try{
  const original=snapshotSource(root);for(const path of new Set([...Object.keys(original.hashes),...omitted])){mkdirSync(dirname(join(directory,path)),{recursive:true});copyFileSync(join(root,path),join(directory,path));}
  const git=args=>execFileSync('git',args,{cwd:directory,windowsHide:true,stdio:'pipe'});
  git(['init','-q']);git(['add','.']);git(['-c','user.name=Contract','-c','user.email=contract@example.invalid','commit','-qm','source fixture']);writeFileSync(join(directory,'unrelated-dirty-marker'),'dirty');
  for(const path of omitted){const before=snapshotSource(directory);assert.equal(before.provenance.dirty,true);writeFileSync(join(directory,path),readFileSync(join(directory,path),'utf8')+'\n// mutation\n');const after=snapshotSource(directory);assert.equal(after.provenance.dirty,true);assert.notEqual(after.provenance.sourceHash,before.provenance.sourceHash,path);}
  for(const path of ['tunes/scripts/music-output-redaction.ts','tunes/scripts/music-vitest-evidence.ts','explorers-earth/index.html','tunes/auth-runtime/node_modules/.package-lock.json'])assert.ok(snapshotSource(directory).hashes[path],path);
  writeFileSync(join(directory,'tunes/migrations/9999_untracked.sql'),'SELECT 1;');assert.throws(()=>snapshotSource(directory));rmSync(join(directory,'tunes/migrations/9999_untracked.sql'));
  writeFileSync(join(directory,'explorers-earth/src/untracked-runtime.ts'),'export default 1;');assert.throws(()=>snapshotSource(directory));rmSync(join(directory,'explorers-earth/src/untracked-runtime.ts'));
  writeFileSync(join(directory,'.gitignore'),'ignored-helper.ts\nignored-runtime.ts\n');writeFileSync(join(directory,'explorers-earth/src/ignored-runtime.ts'),'export default 1;');git(['check-ignore','explorers-earth/src/ignored-runtime.ts']);assert.throws(()=>snapshotSource(directory));rmSync(join(directory,'explorers-earth/src/ignored-runtime.ts'));writeFileSync(join(directory,'tunes/scripts/ignored-helper.ts'),'export const injected=1;');git(['check-ignore','tunes/scripts/ignored-helper.ts']);writeFileSync(join(directory,omitted[1]),readFileSync(join(directory,omitted[1]),'utf8')+'\nimport "./ignored-helper";');assert.throws(()=>snapshotSource(directory));  rmSync(join(directory,omitted[1]));assert.throws(()=>snapshotSource(directory));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('protected configuration disables all credential artifacts and owns output for every selected lane',()=>{
 for(const lane of manifest().lanes){const config=protectedBrowserConfiguration({testDir:'.',use:{trace:'retain-on-failure',video:'retain-on-failure',screenshot:'only-on-failure'},projects:lane.projects.map(name=>({name,use:{trace:'on',video:'on'}}))},process.cwd(),lane.config,join(tmpdir(),'owned-output'));assert.equal(config.use.trace,'off');assert.equal(config.use.video,'off');assert.equal(config.use.screenshot,'off');for(const p of config.projects){assert.equal(p.use.trace,'off');assert.equal(p.use.video,'off');assert.equal(p.use.screenshot,'off');assert.equal(p.outputDir,join(tmpdir(),'owned-output'));}}
});
test('protected reporter rejects enabled trace/video/screenshots and output escape',()=>{
 const lane=manifest().lanes[0],policy={configFile:join(tmpdir(),'owned-config.mjs'),outputDir:join(tmpdir(),'owned-output')};
 const report=rawReport(lane);report.config.configFile=policy.configFile;report.config.metadata={protectedArtifacts:{sourceConfig:lane.config,outputDir:policy.outputDir,trace:'off',video:'off',screenshot:'off'}};for(const project of report.config.projects)project.outputDir=policy.outputDir;
 assert.doesNotThrow(()=>decodeProtectedReport(report,lane,process.cwd(),false,policy));
 for(const mutation of [r=>r.config.metadata.protectedArtifacts.trace='on',r=>r.config.metadata.protectedArtifacts.video='retain-on-failure',r=>r.config.metadata.protectedArtifacts.screenshot='only-on-failure',r=>r.config.projects[0].outputDir='../escape',r=>r.config.configFile='../escape']){const changed=structuredClone(report);mutation(changed);assert.throws(()=>decodeProtectedReport(changed,lane,process.cwd(),false,policy));}
 const c=child(lane);c.receipt.artifacts.trace='on';assert.throws(()=>validateLaneReceipt(lane,c,provenance));
});

test('controlled failing protected browser retains failure but no credential artifacts',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'replatform-artifact-contract-')),privateDirectory=join(directory,'private');mkdirSync(privateDirectory);
 try{
  const module=pathToFileURL(join(process.cwd(),'scripts/replatform-e2e.mjs')).href;
  const playwright=pathToFileURL(join(process.cwd(),'explorers-earth/node_modules/@playwright/test/index.mjs')).href;
  writeFileSync(join(privateDirectory,'failure.spec.mjs'),`import {test,expect} from ${JSON.stringify(playwright)};test('intentional protected failure',async({page,context})=>{await context.addCookies([{name:'session',value:'controlled-fake-sensitive-cookie',url:'http://127.0.0.1'}]);await page.setContent('<p>Controlled failure</p>');expect(1).toBe(2);});`);
  const output=join(privateDirectory,'output'),config=join(privateDirectory,'config.mjs'),json=join(privateDirectory,'raw.json');
  writeFileSync(config,`import {protectedBrowserConfiguration} from ${JSON.stringify(module)};export default protectedBrowserConfiguration({testDir:'.',testMatch:'failure.spec.mjs',workers:1,retries:0,reporter:'json',use:{trace:'retain-on-failure',video:'retain-on-failure',screenshot:'only-on-failure'},projects:[{name:'controlled',use:{browserName:'chromium'}}]},${JSON.stringify(privateDirectory)},'config.mjs',${JSON.stringify(output)});`);
  const result=await capturedChild(process.execPath,[join(process.cwd(),'explorers-earth/node_modules/@playwright/test/cli.js'),'test','--config',config,'--trace=off','--output',output],process.cwd(),{...process.env,PLAYWRIGHT_JSON_OUTPUT_NAME:json},'controlled');
  assert.equal(result.status,1);const report=JSON.parse(readFileSync(json));assert.equal(report.config.configFile,config);assert.equal(resolve(report.config.projects[0].outputDir),resolve(output));assert.deepEqual(report.config.metadata.protectedArtifacts,{sourceConfig:'config.mjs',outputDir:output,trace:'off',video:'off',screenshot:'off'});assert.equal(report.suites[0].specs[0].tests[0].results[0].status,'failed');assert.match(report.suites[0].specs[0].tests[0].results[0].error.message,/Expected/);
  const walk=path=>readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(path,entry.name)):[entry.name]);assert.equal(walk(privateDirectory).some(name=>/\.(?:zip|webm|png|jpg)$/.test(name)),false);
  const diagnostics=decodeProtectedFailureDiagnostics(report,{spec:'failure.spec.mjs',identities:[{file:'failure.spec.mjs',titlePath:['intentional protected failure'],project:'controlled',repeat:0}]},privateDirectory);assert.equal(diagnostics.length,1);assert.equal(diagnostics[0].matcher,'toBe');assert.ok(diagnostics[0].locations.length);writeFileSync(join(directory,'failure.json'),JSON.stringify({status:'failed',childStatus:1,cleanup:'passed',artifacts:[],diagnostics}));rmSync(privateDirectory,{recursive:true,force:true});assert.equal(existsSync(privateDirectory),false);assert.deepEqual(readdirSync(directory),['failure.json']);assert.doesNotMatch(readFileSync(join(directory,'failure.json'),'utf8'),/sensitive-cookie/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('sanitized failed identity evidence never qualifies and cannot carry credentials or retries',()=>{
 const lane=manifest().lanes[0],c=structuredClone(child(lane));c.status=1;c.receipt.child.status=1;c.receipt.results[0].status='unexpected';c.receipt.results[0].attempts[0].status='failed';const {results,cleanup,artifacts}=c.receipt;const failure={version:1,lane:lane.name,provenance,results,child:{status:1,signal:null},cleanup,artifacts};assert.equal(validateFailureRecord(lane,failure,provenance,c),failure);assert.throws(()=>validateLaneReceipt(lane,c,provenance));
 for(const mutate of [r=>r.cookie='sensitive',r=>r.results[0].error='sensitive',r=>r.results[0].attempts[0].retry=1,r=>r.artifacts.trace='on',r=>r.cleanup.status='failed',r=>r.child.status=0]){const changed=structuredClone(failure);mutate(changed);assert.throws(()=>validateFailureRecord(lane,changed,provenance,c));}
});
test('private failed assertion diagnostics retain only manifest identity, category, matcher and source coordinates',()=>{
 const lane=manifest().lanes[1],report=rawReport(lane,true);report.suites[0].specs[1].tests[0].results[0]={status:'failed',retry:0,error:{message:'Error: expect(locator).toHaveValue(expected) session=DO_NOT_EXPORT cookie=DO_NOT_EXPORT proof=DO_NOT_EXPORT',stack:'Error: private data\n at test (C:/owned/profile.spec.ts:110:7)'}};
 const diagnostics=decodeProtectedFailureDiagnostics(report,lane,process.cwd());assert.deepEqual(diagnostics,[{identity:lane.identities[1],kind:'assertion',matcher:'toHaveValue',locations:[{line:110,column:7}]}]);assert.doesNotMatch(JSON.stringify(diagnostics),/DO_NOT_EXPORT|session|cookie|proof|C:\/owned/);
});
test('structured private error location is sufficient without exporting raw message or stack',()=>{
 const lane=manifest().lanes[1],report=rawReport(lane,true);report.suites[0].specs[1].tests[0].results[0]={status:'failed',retry:0,errors:[{message:'Timeout 10000ms exceeded: expect(locator).toBeVisible() cookie=DO_NOT_EXPORT',location:{file:join(process.cwd(),lane.spec),line:94,column:5}}]};
 assert.deepEqual(decodeProtectedFailureDiagnostics(report,lane,process.cwd()),[{identity:lane.identities[1],kind:'timeout',matcher:'toBeVisible',locations:[{line:94,column:5}]}]);
});
test('failure diagnostic allowlist rejects credentials, arbitrary messages and unsafe coordinates',()=>{
 const lane=manifest().lanes[1],c=structuredClone(child(lane));c.status=1;const failure={version:1,lane:lane.name,provenance,results:c.receipt.results,child:{status:1,signal:null},cleanup:{status:'passed'},artifacts:c.receipt.artifacts,diagnostics:[{identity:lane.identities[1],kind:'assertion',matcher:'toHaveValue',locations:[{line:110,column:7}]}]};assert.doesNotThrow(()=>validateFailureRecord(lane,failure,provenance,c));
 for(const mutation of [r=>r.diagnostics[0].message='private cookie',r=>r.diagnostics[0].matcher='private cookie',r=>r.diagnostics[0].locations[0].file='private cookie',r=>r.diagnostics[0].locations[0].line=0,r=>r.diagnostics[0].identity={...lane.identities[1],titlePath:['unreviewed']},r=>r.diagnostics[0].kind='private cookie']){const changed=structuredClone(failure);mutation(changed);assert.throws(()=>validateFailureRecord(lane,changed,provenance,c));}
});