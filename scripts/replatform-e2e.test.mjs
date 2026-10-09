import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,copyFileSync,rmSync,readdirSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,basename,dirname,resolve} from 'node:path';
import {validateLockedInstall,childNodeEnvironment,parseArguments,assertEnvironment,validateManifest,validateLaneReceipt,validateMusicTopology,qualifyLanes,capturedChild,decodeProtectedReport,snapshotSource,protectedBrowserConfiguration,validateFailureRecord,validateLifecycleFailureRecord,decodeProtectedFailureDiagnostics} from './replatform-e2e.mjs';
const ack='TASK4_FIXTURE_OWNED_DISPOSABLE_PG15';
test('Windows child environment has one PATH key and survives exact environment custody roundtrip',()=>{
 const clean=childNodeEnvironment({...process.env,Path:'controlled-path',PATH:'controlled-path'},'win32');
 assert.deepEqual(Object.keys(clean).filter(key=>key.toUpperCase()==='PATH'),['PATH']);
 assert.equal(clean.PATH.startsWith(dirname(process.execPath)),true);
 const equality=execFileSync(process.execPath,['-e',"process.stdout.write(JSON.stringify(Object.entries(process.env).sort(([a],[b])=>a.localeCompare(b))))"],{env:clean,windowsHide:true,encoding:'utf8'});
 const same=JSON.stringify(JSON.parse(equality))===JSON.stringify(Object.entries(clean).sort(([a],[b])=>a.localeCompare(b)));
 assert.equal(same,true,'Child environment custody roundtrip must match');
 assert.match(readFileSync(new URL('../tunes/scripts/canonical-music-browser-fixture.ts',import.meta.url),'utf8'),/\.\.\.contract\.childNodeEnvironment\(process\.env\)/);
});
const manifest=()=>JSON.parse(readFileSync(new URL('../explorers-earth/e2e/replatform/suite-manifest.json',import.meta.url)));
const provenance={commit:'a'.repeat(40),sourceHash:'b'.repeat(64),manifestHash:'c'.repeat(64),dirty:true};
const child=(lane)=>{const result=({status:0,signal:null,error:null,receipt:{version:1,lane:lane.name,provenance,config:lane.config,spec:lane.spec,projects:lane.projects,discovery:lane.identities,results:lane.identities.map(identity=>({identity,expectedStatus:'passed',status:'expected',attempts:[{status:'passed',retry:0}]})),errors:[],cleanup:{status:'passed'},artifacts:{trace:'off',video:'off',screenshot:'off',cleanup:'passed'},authority:{owned:true,database:'music_uat_'+'d'.repeat(32),containerId:'e'.repeat(64),imageId:'sha256:'+'f'.repeat(64)},child:{status:0,signal:null},startedAt:'2026-10-02T00:00:00.000Z',endedAt:'2026-10-02T00:00:01.000Z',playwright:'1.61.1'}});if(lane.name==='music')result.topology=musicTopology(result.receipt.authority);return result;};
test('only named delivered scope and fresh owned temporary output are accepted',()=>{
 const args=['--milestone','delivered-auth-profile-books','--ack',ack,'--receipt',join(tmpdir(),'replatform-e2e-contract-12345678')];
 assert.equal(parseArguments(args).milestone,'delivered-auth-profile-books');
 for(const patch of [[],[...args,'--ack',ack],args.map(x=>x===ack?'wrong':x),args.map(x=>x==='delivered-auth-profile-books'?'full-parity':x),args.map(x=>x.startsWith(tmpdir())?'../outside':x),[...args,'--grep','auth']])assert.throws(()=>parseArguments(patch));
});
test('ambient hosted/database/production authority is rejected before any child',()=>{
 for(const key of ['DATABASE_URL','DATABASE_URL_TEST','DOCKER_HOST','DOCKER_CONTEXT','PLAYWRIGHT_EXTERNAL_BASE_URL','GATE_PROD','MUSIC_C10_STANDALONE_POSTGRES_ACK'])assert.throws(()=>assertEnvironment({[key]:'unowned'}));
 assert.throws(()=>assertEnvironment({NODE_ENV:'production'}));assert.doesNotThrow(()=>assertEnvironment({}));
});
test('manifest requires exactly nine nonempty unique delivered lanes and pending obligations',()=>{
 assert.equal(validateManifest(manifest()),true);
 for(const change of [m=>m.lanes.pop(),m=>m.lanes.push(m.lanes[0]),m=>m.lanes[0].identities.pop(),m=>m.lanes[0].identities[0].file='../escape',m=>m.lanes[0].identities[0].titlePath=[],m=>m.pending=[],m=>m.version=2]){const m=manifest();change(m);assert.throws(()=>validateManifest(m));}
});
test('fake children qualify only scoped delivery while full milestone remains incomplete',async()=>{
 const m=manifest();const seen=[];const receipt=await qualifyLanes({manifest:m,provenance,runLane:async lane=>{seen.push(lane.name);return child(lane);}});
 assert.deepEqual(seen,['auth','profile','books','lifecycle','movies','games','music','places','place-links']);assert.equal(receipt.deliveredSlice,'passed');assert.equal(receipt.overallMilestone,'incomplete');assert.equal(receipt.releaseEligible,false);assert.equal(receipt.identities,134);
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
 const omitted=['tunes/migrations/0001_runtime_baseline.sql','tunes/scripts/music-uat-database.ts','tunes/scripts/music-fixture-secret.ts','tunes/scripts/music-qualification-postgres.ts','tunes/scripts/music-output-redaction.ts','tunes/scripts/music-vitest-evidence.ts','tunes/scripts/music-local-private-files.ps1','tunes/scripts/windows-write-through.ps1','tunes/scripts/places-browser-support.ts'];
 try{
  const original=snapshotSource(root);for(const path of new Set([...Object.keys(original.hashes),...omitted])){mkdirSync(dirname(join(directory,path)),{recursive:true});copyFileSync(join(root,path),join(directory,path));}
  const git=args=>execFileSync('git',args,{cwd:directory,windowsHide:true,stdio:'pipe'});
  git(['init','-q']);git(['add','.']);git(['-c','user.name=Contract','-c','user.email=contract@example.invalid','commit','-qm','source fixture']);writeFileSync(join(directory,'unrelated-dirty-marker'),'dirty');
  for(const path of omitted){const before=snapshotSource(directory);assert.equal(before.provenance.dirty,true);writeFileSync(join(directory,path),readFileSync(join(directory,path),'utf8')+'\n// mutation\n');const after=snapshotSource(directory);assert.equal(after.provenance.dirty,true);assert.notEqual(after.provenance.sourceHash,before.provenance.sourceHash,path);}
  for(const path of ['tunes/scripts/music-output-redaction.ts','tunes/scripts/music-vitest-evidence.ts','explorers-earth/index.html','tunes/auth-runtime/node_modules/.package-lock.json','tunes/scripts/music-local-private-files.ps1','tunes/scripts/windows-write-through.ps1'])assert.ok(snapshotSource(directory).hashes[path],path);
  git(['rm','--cached','tunes/scripts/windows-write-through.ps1']);assert.throws(()=>snapshotSource(directory));git(['add','tunes/scripts/windows-write-through.ps1']);
  const placesHelper='tunes/scripts/places-browser-support.ts',placesSource=readFileSync(join(directory,placesHelper),'utf8');
  assert.ok(snapshotSource(directory).hashes[placesHelper]);
  git(['rm','--cached',placesHelper]);assert.throws(()=>snapshotSource(directory));git(['add',placesHelper]);
  for(const ignored of [false,true]){
   const dependency='tunes/scripts/places-unreviewed-helper.ts';
   writeFileSync(join(directory,'.gitignore'),ignored?'places-unreviewed-helper.ts\n':'');
   writeFileSync(join(directory,dependency),'export const unowned=1;');
   if(ignored)git(['check-ignore',dependency]);
   writeFileSync(join(directory,placesHelper),placesSource+'\nimport "./places-unreviewed-helper";');
   assert.throws(()=>snapshotSource(directory),/Unreviewed relative executed dependency/);
   writeFileSync(join(directory,placesHelper),placesSource);rmSync(join(directory,dependency));
  }
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

test('Music failure stages retain only reviewed fixed markers and reject arbitrary stage data',()=>{
 const lane=manifest().lanes.find(value=>value.name==='music'),report=rawReport(lane,true);
 report.suites[0].specs[1].tests[0].results[0]={status:'failed',retry:0,error:{message:'[music-stage:control-provider-timeout] cookie=DO_NOT_EXPORT'}};
 const diagnostics=decodeProtectedFailureDiagnostics(report,lane,process.cwd());
 assert.equal(diagnostics[0].stage,'control-provider-timeout');assert.doesNotMatch(JSON.stringify(diagnostics),/cookie|DO_NOT_EXPORT/);
 const c=structuredClone(child(lane));c.status=1;const failure={version:1,lane:lane.name,provenance,results:c.receipt.results,child:{status:1,signal:null},cleanup:{status:'passed'},artifacts:c.receipt.artifacts,diagnostics};
 assert.doesNotThrow(()=>validateFailureRecord(lane,failure,provenance,c));
 for(const stage of ['private-cookie','',null,{},'control-provider-timeout cookie']){const changed=structuredClone(failure);changed.diagnostics[0].stage=stage;assert.throws(()=>validateFailureRecord(lane,changed,provenance,c));}
 report.suites[0].specs[1].tests[0].results[0].error.message='[music-stage:private-cookie]';assert.equal(Object.hasOwn(decodeProtectedFailureDiagnostics(report,lane,process.cwd())[0],'stage'),false);
 const other=manifest().lanes[1],otherReport=rawReport(other,true);otherReport.suites[0].specs[1].tests[0].results[0]={status:'failed',retry:0,error:{message:'[music-stage:control-provider-timeout]'}};assert.equal(Object.hasOwn(decodeProtectedFailureDiagnostics(otherReport,other,process.cwd())[0],'stage'),false);
});

test('Music IPC diagnostics retain only three reviewed fixed causes',()=>{
 const lane=manifest().lanes.find(value=>value.name==='music'),report=rawReport(lane,true);
 for(const cause of ['child-unavailable','child-timeout','child-failed']){
  report.suites[0].specs[1].tests[0].results[0]={status:'failed',retry:0,error:{message:`[music-stage:control-provider-timeout] [music-cause:${cause}] cookie=DO_NOT_EXPORT`}};
  const diagnostics=decodeProtectedFailureDiagnostics(report,lane,process.cwd());assert.equal(diagnostics[0].cause,cause);assert.doesNotMatch(JSON.stringify(diagnostics),/cookie|DO_NOT_EXPORT/);
  const c=structuredClone(child(lane));c.status=1;const failure={version:1,lane:lane.name,provenance,results:c.receipt.results,child:{status:1,signal:null},cleanup:{status:'passed'},artifacts:c.receipt.artifacts,diagnostics};assert.doesNotThrow(()=>validateFailureRecord(lane,failure,provenance,c));
  for(const unsafe of ['',null,{},'child-timeout cookie','secret']){const changed=structuredClone(failure);changed.diagnostics[0].cause=unsafe;assert.throws(()=>validateFailureRecord(lane,changed,provenance,c));}
 }
 report.suites[0].specs[1].tests[0].results[0].error.message='[music-cause:secret]';assert.equal(Object.hasOwn(decodeProtectedFailureDiagnostics(report,lane,process.cwd())[0],'cause'),false);
 const other=manifest().lanes[1],otherReport=rawReport(other,true);otherReport.suites[0].specs[1].tests[0].results[0]={status:'failed',retry:0,error:{message:'[music-cause:child-failed]'}};assert.equal(Object.hasOwn(decodeProtectedFailureDiagnostics(otherReport,other,process.cwd())[0],'cause'),false);
});

test('Movies is a distinct mandatory24-identity lane and cannot be omitted or relabeled Books',()=>{
 const m=manifest(),movies=m.lanes.find(l=>l.name==='movies');assert.ok(movies);assert.equal(movies.identities.length,24);assert.deepEqual(movies.projects,['movies-desktop','movies-mobile']);
 for(const mutate of [x=>x.lanes.splice(x.lanes.findIndex(l=>l.name==='movies'),1),x=>x.lanes.find(l=>l.name==='movies').runner='tunes/scripts/books-browser-fixture.ts',x=>x.lanes.find(l=>l.name==='movies').identities[0].project='books-desktop',x=>x.lanes.find(l=>l.name==='movies').identities.pop()]){const changed=structuredClone(m);mutate(changed);assert.throws(()=>validateManifest(changed));}
});
test('ambient Movies fixture authority is denied before protected allocation',()=>{for(const key of ['MOVIES_E2E_FIXTURE_PATH','MOVIES_E2E_ARTIFACT_DIR','MOVIES_E2E_LOCAL_AUTHORITY'])assert.throws(()=>assertEnvironment({[key]:'unowned'}));});

const gamesTitles = ["Games manual: Home creates a native list and distinct same-title recommendations","Games manual: note and creator rating survive edit and reload without provider facts","Games manual: complete owner pages preserve memberships reorder and pin position zero","Games manual: Keep draft and Publish preserve keyboard decision and public state","Games manual: ready uploaded cover and gallery bytes enforce owner public and foreign attachment","Games manual: provider unavailable preserves draft and forbids browser credential authority","Games manual: anonymous category and list continuation reveal later rows and terminal state","Games manual: ancestor hide archive and suspension deny fresh and inflight public bytes","Games manual: two anonymous contexts and username transition never reuse private or late rows","Games manual: account and route changes fence every deferred save continuation"];
const gamesManifest=()=>{const m=manifest(); if(!m.lanes.some(l=>l.name==='games')){m.scopeContents.push('games');m.lanes.push({name:'games',runner:'tunes/scripts/games-browser-fixture.ts',config:'explorers-earth/e2e/replatform/games.playwright.config.ts',spec:'explorers-earth/e2e/replatform/games.spec.ts',projects:['games-desktop','games-mobile'],identities:['games-desktop','games-mobile'].flatMap(project=>gamesTitles.map(title=>({file:'explorers-earth/e2e/replatform/games.spec.ts',titlePath:[title],project,repeat:0}))) });} return m;};
test('Games adds exact twenty identities while the preceding seventy-four stay unchanged',async()=>{const m=gamesManifest();assert.equal(validateManifest(m),true);assert.equal(m.lanes.slice(0,5).reduce((n,l)=>n+l.identities.length,0),74);const r=await qualifyLanes({manifest:m,provenance,runLane:async lane=>child(lane)});assert.equal(r.identities,134);assert.equal(r.releaseEligible,false);});
test('Games exact identity admission rejects renamed duplicate extra and missing cases',()=>{for(const change of [l=>l.identities[0].titlePath=['renamed'],l=>l.identities[0].titlePath=['extra',gamesTitles[0]],l=>l.identities.pop(),l=>l.identities.push(l.identities[0]),l=>l.identities[0].repeat=1,l=>l.identities[0].project='games-other']){const m=gamesManifest();change(m.lanes.find(lane=>lane.name==='games'));assert.throws(()=>validateManifest(m));}});
test('Games ambient fixture authority is rejected before any child',()=>{assert.throws(()=>assertEnvironment({GAMES_E2E_FIXTURE_PATH:'unowned'}));});

test('Games receipts preserve source artifact cleanup and single-attempt ownership guards',()=>{const lane=gamesManifest().lanes.find(lane=>lane.name==='games');for(const change of [c=>c.receipt.provenance.sourceHash='0'.repeat(64),c=>c.receipt.cleanup.status='failed',c=>c.receipt.authority.database='foreign',c=>c.receipt.artifacts.trace='on',c=>c.receipt.results[0].attempts.push({status:'passed',retry:1}),c=>c.receipt.results[0].attempts[0].status='skipped']){const c=structuredClone(child(lane));change(c);assert.throws(()=>validateLaneReceipt(lane,c,provenance));}});
// Preserve all committed preceding identities while permitting the six reviewed
// lifecycle additions during a source qualification overlay.
test('Games preserves committed preceding identities through lifecycle extension',()=>{const prior=JSON.parse(execFileSync('git',['show','HEAD:explorers-earth/e2e/replatform/suite-manifest.json'],{encoding:'utf8',windowsHide:true}));const m=gamesManifest();const preserved=structuredClone(m.lanes.slice(0,5));const priorLifecycle=prior.lanes.find(l=>l.name==='lifecycle');assert.ok([12,18].includes(priorLifecycle.identities.length));assert.equal(preserved.reduce((n,l)=>n+l.identities.length,0),74);preserved.find(l=>l.name==='lifecycle').identities=preserved.find(l=>l.name==='lifecycle').identities.slice(0,priorLifecycle.identities.length);assert.deepEqual(preserved,prior.lanes.slice(0,5));const lane=structuredClone(m.lanes[0]),raw=rawReport(lane);lane.identities[0].titlePath=['unreviewed old-lane rename'];assert.throws(()=>decodeProtectedReport(raw,lane,process.cwd(),false));});

test('Games declared source titles remain exact before actual protected discovery',()=>{const source=readFileSync(new URL('../explorers-earth/e2e/replatform/games.spec.ts',import.meta.url),'utf8');const declared=[...source.matchAll(/^test\('([^']+)'/gm)].map(m=>m[1]);assert.deepEqual(declared.sort(),[...gamesTitles].sort());});

test('Games fixture-local control remains inside its fixed native API preview proxy',()=>{const source=readFileSync(new URL('../tunes/scripts/games-browser-fixture.ts',import.meta.url),'utf8');const path=source.match(/composed\.app\.post\('([^']+)'/)?.[1];assert.ok(path&&path.startsWith('/api/'),'Fixture control must reach native API through the fixed /api proxy');assert.match(source,/proxy:\{'\/api':\{target:/);});

test('lifecycle requires exactly eighteen ordered identities including C9 and six held completions',()=>{
 const m=manifest(),lane=m.lanes.find(l=>l.name==='lifecycle');
 assert.equal(lane.identities.length,18);assert.equal(validateManifest(m),true);
 assert.deepEqual(lane.identities.slice(12).map(i=>i.titlePath[0]),["held deletion completion preserves verified replacement B","held deletion completion preserves a fresh verified returning A session","held deactivation completion preserves verified replacement B","held deactivation completion preserves a fresh verified returning A session","held recovery completion preserves verified replacement B","held recovery completion preserves a fresh verified returning A session"]);
 assert.deepEqual(lane.identities.slice(10,12).map(i=>i.titlePath[0]),['held feedback cannot mutate navigate or log out verified replacement B','held feedback cannot mutate navigate or log out a fresh verified returning A session']);
 for(const mutate of [l=>l.identities.splice(10),l=>l.identities.push({...l.identities[11],titlePath:['unapproved']}),l=>l.identities[11].titlePath=['unapproved']]){const changed=structuredClone(m);mutate(changed.lanes.find(l=>l.name==='lifecycle'));if(changed.lanes.find(l=>l.name==='lifecycle').identities.length!==18)assert.throws(()=>validateManifest(changed));else assert.throws(()=>validateLaneReceipt(lane,child(changed.lanes.find(l=>l.name==='lifecycle')),provenance));}
});
test('C9 cookie freshness assertions expose only boolean comparison diagnostics',()=>{
 const source=readFileSync(new URL('../explorers-earth/e2e/replatform/lifecycle.spec.ts',import.meta.url),'utf8');
 assert.ok(source.includes('expect(issued.cookie === owners[owner].cookie).toBe(false)'));
 assert.ok(source.includes('expect(current.cookie === b.cookie).toBe(false)'));
 assert.doesNotMatch(source,/expect\([^\n]*cookie\)\.not\.toBe/);
});
test('fixture excludes reserved port before bind even when it is available',async()=>{
 const {runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../tunes/scripts/profile-browser-fixture.ts',import.meta.url),'utf8');
 const start=source.indexOf('async function freePort('),end=source.indexOf('async function waitFor(',start);
 const body=source.slice(start,end).replace(': Promise<number>','').replace('new Promise<boolean>','new Promise');
 let candidate=0,created=0;const bound=[];
 const freePort=runInNewContext(body+';freePort',{randomBytes:()=>({readUInt16BE:()=>[642,643][candidate++]}),createServer:()=>(created++,{once(){},listen(port,host,ready){bound.push(port);ready();},close(done){done();}})});
 assert.equal(await freePort(51000,51999),51643);assert.deepEqual(bound,[51643]);assert.equal(created,1);
});

const profileNavigationTitles=["canonical navigation: native Books Movies and Games publish and hide through verified owner preferences","canonical navigation: external account preference refresh preserves all nine saved rows","canonical navigation: external revision contention reports conflict without replay or lost profile update","canonical navigation: a foreign signed owner cannot read content or mutate another owner preference scope"];
test('profile registry preserves original two and appends exactly four reviewed canonical navigation identities',()=>{
 const m=manifest(),lane=m.lanes.find(l=>l.name==='profile');
 const source=readFileSync(new URL('../explorers-earth/e2e/replatform/profile.spec.ts',import.meta.url),'utf8');
 const declared=[...source.matchAll(/^test\('([^']+)'/gm)].map(match=>match[1]);
 assert.deepEqual(declared,profileNavigationTitles);
 assert.equal(lane.identities.length,6);
 assert.deepEqual(lane.identities.slice(2),profileNavigationTitles.map(title=>({file:lane.spec,titlePath:[title],project:'chromium-pr-safe',repeat:0})));
 assert.equal(validateManifest(m),true);
 for(const mutate of [...[2,3,4,5].map(index=>l=>l.identities.splice(index,1)),l=>l.identities.push({...l.identities[2],titlePath:['unapproved extra']}),l=>l.identities.push(l.identities[2]),l=>l.identities[2].titlePath=['unreviewed'],l=>l.identities[2].repeat=1,l=>l.identities[2].project='other']){const changed=structuredClone(m);mutate(changed.lanes.find(l=>l.name==='profile'));assert.throws(()=>validateLaneReceipt(lane,child(changed.lanes.find(l=>l.name==='profile')),provenance));}
});

test('Lifecycle exact title and repeat admission cannot be changed at the same count',()=>{for(const mutate of [l=>l.identities[17].titlePath=['unapproved'],l=>l.identities[17].repeat=1]){const m=manifest();mutate(m.lanes.find(l=>l.name==='lifecycle'));assert.throws(()=>validateManifest(m),/Lifecycle exact identity mismatch|Invalid protected identity/);}});

test('Music adds exactly24 frozen tuples while preserving94 preceding identities',()=>{const m=manifest(),prior=JSON.parse(execFileSync('git',['show','HEAD:explorers-earth/e2e/replatform/suite-manifest.json'],{encoding:'utf8',windowsHide:true}));assert.deepEqual(m.lanes.slice(0,6),prior.lanes.slice(0,6));assert.equal(m.lanes.slice(0,6).reduce((n,l)=>n+l.identities.length,0),94);assert.equal(m.lanes[6].identities.length,24);for(const mutate of [l=>l.identities[0].titlePath=['unapproved'],l=>l.identities[0].repeat=1,l=>l.identities[0].project='music-unknown']){const wrong=structuredClone(m);mutate(wrong.lanes[6]);assert.throws(()=>validateManifest(wrong));}});
test('Music ambient fixture authority is rejected before allocation',()=>{for(const key of ['MUSIC_E2E_FIXTURE_PATH','MUSIC_E2E_LOCAL_AUTHORITY','MUSIC_E2E_WEB_PORT'])assert.throws(()=>assertEnvironment({[key]:'unowned'}));});

test('lifecycle failure evidence admits only fixed phases labels and bounded counts',()=>{const lane=manifest().lanes.find(l=>l.name==='music'),record={version:1,lane:'music',provenance,phase:'startup',interrupted:false,sourceIntact:true,cleanup:{status:'passed',failures:[]},artifacts:{trace:'off',video:'off',screenshot:'off',cleanup:'passed'},counts:{discovered:null,executed:null,passed:null,failed:null,skipped:null,attempts:null}};assert.deepEqual(validateLifecycleFailureRecord(lane,record,provenance),record);for(const mutate of [r=>r.phase='secret value',r=>r.cleanup.failures=['raw credentials'],r=>r.counts.executed=25,r=>r.counts.passed=-1,r=>r.counts.passed=1,r=>r.counts={discovered:24,executed:1,passed:1,failed:0,skipped:0,attempts:0},r=>r.cookie='secret',r=>r.artifacts.trace='on',r=>r.sourceIntact='true',r=>r.provenance.commit='0'.repeat(40)]){const wrong=structuredClone(record);mutate(wrong);assert.throws(()=>validateLifecycleFailureRecord(lane,wrong,provenance));}const interrupted=structuredClone(record);interrupted.interrupted=true;interrupted.sourceIntact=false;interrupted.cleanup={status:'failed',failures:['browser']};interrupted.artifacts.cleanup='failed';assert.deepEqual(validateLifecycleFailureRecord(lane,interrupted,provenance),interrupted);});

function musicTopology(authority){const id=readFileSync(new URL('../tunes/shared/music-migration-contract.ts',import.meta.url),'utf8').match(/EXPECTED_MUSIC_MIGRATION_ID\s*=\s*"([a-z0-9_]+)"/)[1];return {version:1,lane:'music',provenance,authority:{database:authority.database,containerId:authority.containerId,imageId:authority.imageId},runtime:{role:'music_browser_'+authority.database.slice(10,22),migratorRole:'music_migrator',verified:true},schema:{ready:true,currentId:id,currentChecksum:createHash('sha256').update(readFileSync(new URL('../tunes/migrations/'+id+'.sql',import.meta.url),'utf8')).digest('hex')},transport:{browserOrigin:'http://127.0.0.1:11000',canonicalOrigin:'http://127.0.0.1:11001',musicOrigin:'http://127.0.0.1:11002',logicalMusicOrigin:'https://music-fixture.test',socketPath:'/__localtunes/ws'},children:['canonical','music'].map((kind,n)=>({kind,pid:n+1,startedAt:'2026-10-09T00:00:00Z',stoppedAt:'2026-10-09T00:00:01Z',exitCode:0,signal:null})),seams:{session:'better-auth-internal-adapter',provider:'guarded-youtube-transport',clock:'virtual-date-now-601000ms'},cleanup:{status:'passed'}};}
test('Music topology requires actual distinct children role schema authority and declared seams',()=>{const lane=manifest().lanes.find(l=>l.name==='music'),c=child(lane),record=c.topology;assert.deepEqual(validateMusicTopology(record,provenance,c.receipt.authority),record);for(const mutate of [r=>r.children.pop(),r=>r.children[1].pid=r.children[0].pid,r=>r.children[0].signal='SIGTERM',r=>r.children[0].exitCode=1,r=>r.runtime.role='music_migrator',r=>r.schema.currentChecksum='0'.repeat(64),r=>r.schema.currentId='0038_old',r=>r.transport.canonicalOrigin=r.transport.musicOrigin,r=>r.transport.musicOrigin='https://external.test',r=>r.seams.clock='wall-clock',r=>r.cookie='secret',r=>r.authority.database='music_uat_'+'0'.repeat(32)]){const wrong=structuredClone(record);mutate(wrong);assert.throws(()=>validateMusicTopology(wrong,provenance,c.receipt.authority));}delete c.topology;assert.throws(()=>validateLaneReceipt(lane,c,provenance));});

test('Music graceful shutdown waits for natural exit and bounds a stalled exit',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'replatform-natural-exit-'));
 try{
  const helper=pathToFileURL(join(process.cwd(),'tunes/scripts/protected-browser-receipt.ts')).href;
  const script=join(directory,'check.mjs');
  writeFileSync(script,`import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {waitProtectedChild,stopProtectedChild} from ${JSON.stringify(helper)};
const child=spawn(process.execPath,['-e',"process.send('ready');setTimeout(()=>process.disconnect(),150)"],{stdio:['ignore','ignore','ignore','ipc']});await new Promise(r=>child.once('message',r));await waitProtectedChild(child,2000);assert.equal(child.exitCode,0);assert.equal(child.signalCode,null);
const stalled=spawn(process.execPath,['-e',"process.send('ready');setInterval(()=>{},1000)"],{stdio:['ignore','ignore','ignore','ipc']});await new Promise(r=>stalled.once('message',r));try{await assert.rejects(waitProtectedChild(stalled,50),/natural exit timed out/);assert.equal(stalled.exitCode,null);assert.equal(stalled.signalCode,null);}finally{await stopProtectedChild(stalled);}console.log('natural exit contract passed');`);
  const result=await capturedChild(process.execPath,['--import','tsx',script],join(process.cwd(),'tunes'),process.env,'natural-exit');
  assert.equal(result.status,0);assert.equal(result.signal,null);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('Games diagnostics retain fixed stages and causes without private data',()=>{
 const lane=manifest().lanes.find(l=>l.name==='games'),report=rawReport(lane,true);
 for(const [stage,cause] of [['patch-request','request-aborted'],['save-click-completed','save-enabled'],['edit-state','observation-mismatch']]){
  report.suites[0].specs[1].tests[0].results[0]={status:'failed',retry:0,error:{message:`[games-stage:${stage}] [games-cause:${cause}] cookie=DO_NOT_EXPORT`}};
  const diagnostics=decodeProtectedFailureDiagnostics(report,lane,process.cwd());assert.equal(diagnostics[0].stage,stage);assert.equal(diagnostics[0].cause,cause);assert.doesNotMatch(JSON.stringify(diagnostics),/cookie|DO_NOT_EXPORT/);
  const c=structuredClone(child(lane));c.status=1;const failure={version:1,lane:lane.name,provenance,results:c.receipt.results,child:{status:1,signal:null},cleanup:{status:'passed'},artifacts:c.receipt.artifacts,diagnostics};assert.doesNotThrow(()=>validateFailureRecord(lane,failure,provenance,c));
  for(const field of ['stage','cause'])for(const value of ['private-cookie','',null,{},'patch-request cookie']){const changed=structuredClone(failure);changed.diagnostics[0][field]=value;assert.throws(()=>validateFailureRecord(lane,changed,provenance,c));}
 }
 report.suites[0].specs[1].tests[0].results[0].error.message='[games-stage:secret] [games-cause:secret]';const safe=decodeProtectedFailureDiagnostics(report,lane,process.cwd())[0];assert.equal(Object.hasOwn(safe,'stage'),false);assert.equal(Object.hasOwn(safe,'cause'),false);
 const other=manifest().lanes[0],otherReport=rawReport(other,true);otherReport.suites[0].specs[1].tests[0].results[0]={status:'failed',retry:0,error:{message:'[games-stage:patch-request] [games-cause:request-aborted]'}};const cross=decodeProtectedFailureDiagnostics(otherReport,other,process.cwd())[0];assert.equal(Object.hasOwn(cross,'stage'),false);assert.equal(Object.hasOwn(cross,'cause'),false);
});

test('Places lanes preserve the original ordered118 and append exact proposed16 with zero retry custody',()=>{
 const m=manifest();
 assert.equal(createHash('sha256').update(JSON.stringify(m.lanes.slice(0,7))).digest('hex'),'7d574d84788ac979be8560ec3f65ad95a25f1d7b9605664a2656c1430e43de01');
 assert.deepEqual(m.scopeContents,['auth','profile','books','lifecycle','movies','games','music','places','place-links']);
 assert.equal(m.lanes.flatMap(lane=>lane.identities).length,134);
 for(const name of ['places','place-links']){
   const lane=m.lanes.find(lane=>lane.name===name);
   assert.equal(lane.runner,'tunes/scripts/profile-browser-fixture.ts');
   assert.equal(lane.identities.length,8);
   assert.deepEqual(lane.projects,[`${name}-desktop`,`${name}-mobile`]);
   const changed=structuredClone(m);changed.lanes.find(lane=>lane.name===name).identities[0].titlePath=['unreviewed'];assert.throws(()=>validateManifest(changed));
 }
 for(const key of ['PLACES_E2E_FIXTURE_PATH','PLACE_LINKS_E2E_FIXTURE_PATH','PROFILE_E2E_SUITE'])assert.throws(()=>assertEnvironment({[key]:'unowned'}));
});

function lockedInstallFixture(prefix,check){
 const root=mkdtempSync(join(tmpdir(),'replatform-lock-contract-')),directory=join(root,prefix);
 const packages={'':{version:'ignored-installed-root'},'node_modules/direct':{version:'1.2.3',integrity:'sha512-direct'},'node_modules/dev':{version:'4.5.6',integrity:'sha512-dev'},'node_modules/direct/node_modules/transitive':{version:'7.8.9',integrity:'sha512-transitive'}};
 const lock={lockfileVersion:3,packages:structuredClone(packages)},installed={lockfileVersion:3,packages:structuredClone(packages)},pkg={dependencies:{direct:'^1.2.3'},devDependencies:{dev:'^4.5.6'}};
 lock.packages['']={version:'different-root-metadata'};
 const paths={lock:join(directory,'package-lock.json'),installed:join(directory,'node_modules/.package-lock.json'),pkg:join(directory,'package.json')};
 const write=()=>{writeFileSync(paths.lock,JSON.stringify(lock,null,2)+'\n');writeFileSync(paths.installed,JSON.stringify(installed));writeFileSync(paths.pkg,JSON.stringify(pkg));};
 try{mkdirSync(join(directory,'node_modules'),{recursive:true});write();check({root,prefix,lock,installed,pkg,paths,write});}finally{rmSync(root,{recursive:true,force:true});}
}
for(const prefix of ['','tunes/auth-runtime'])test(`locked install hashes exact raw lock bytes with direct dev and transitive metadata at ${prefix||'root'}`,()=>{
 lockedInstallFixture(prefix,({root,paths,write,lock})=>{
  const digest=()=>createHash('sha256').update(readFileSync(paths.lock)).digest('hex');
  assert.equal(validateLockedInstall(root,prefix),digest());
  const initial=digest();writeFileSync(paths.lock,JSON.stringify(lock));assert.notEqual(digest(),initial);assert.equal(validateLockedInstall(root,prefix),digest());
  delete lock.packages['node_modules/dev'].integrity;write();const installed=JSON.parse(readFileSync(paths.installed));delete installed.packages['node_modules/dev'].integrity;writeFileSync(paths.installed,JSON.stringify(installed));assert.equal(validateLockedInstall(root,prefix),digest());
 });
});
for(const [name,mutate,message] of [
 ['installed path absent from lock',f=>delete f.lock.packages['node_modules/direct/node_modules/transitive'],'Installed lock metadata mismatch'],
 ['version mismatch',f=>f.installed.packages['node_modules/direct'].version='9.9.9','Installed lock metadata mismatch'],
 ['integrity mismatch',f=>f.installed.packages['node_modules/dev'].integrity='sha512-other','Installed lock metadata mismatch'],
 ['direct dependency absent from installed',f=>delete f.installed.packages['node_modules/direct'],'Required locked dependency absent'],
 ['dev dependency absent from installed',f=>delete f.installed.packages['node_modules/dev'],'Required locked dependency absent'],
 ['direct dependency absent from lock',f=>{delete f.installed.packages['node_modules/direct'];delete f.lock.packages['node_modules/direct'];},'Required locked dependency absent']
])test(`locked install rejects ${name}`,()=>lockedInstallFixture('tunes',f=>{mutate(f);f.write();assert.throws(()=>validateLockedInstall(f.root,f.prefix),new RegExp(message+' in tunes'));}));
for(const file of ['lock','installed','pkg'])for(const failure of ['missing','malformed'])test(`locked install rejects ${failure} ${file} input`,()=>lockedInstallFixture('',f=>{
 if(failure==='missing')rmSync(f.paths[file]);else writeFileSync(f.paths[file],'{invalid json');
 assert.throws(()=>validateLockedInstall(f.root,f.prefix),failure==='missing'?{code:'ENOENT'}:SyntaxError);
}));
