import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import * as contract from './replatform-e2e.mjs';
const diagnostic={version:1,role:'fixture',epoch:0,phase:'bootstrap',code:'unsettled',boundary:'protected-context'};
const line=value=>'Guides owned fixture failed [guides-failure-v1:'+JSON.stringify(value)+']';
test('Guides strict root marker admits exact closed primitives and rejects unsafe encodings',()=>{
 assert.equal(typeof contract.decodeGuidesFixtureFailureLine,'function');const decode=contract.decodeGuidesFixtureFailureLine;
 assert.deepEqual(decode(line(diagnostic)),diagnostic);
 assert.deepEqual(decode(line({...diagnostic,role:'worker',epoch:16,boundary:null})),{...diagnostic,role:'worker',epoch:16,boundary:null});
 for(const value of [{...diagnostic,extra:'private'},{...diagnostic,version:2},{...diagnostic,role:'launcher'},{...diagnostic,epoch:1},{...diagnostic,role:'worker',epoch:0,boundary:null},{...diagnostic,role:'worker',epoch:17,boundary:null},{...diagnostic,role:'worker',epoch:1},{...diagnostic,phase:['bootstrap']},{...diagnostic,code:'private'},{...diagnostic,boundary:'private'}])assert.equal(decode(line(value)),undefined);
 for(const value of [line(diagnostic)+'\n','prefix '+line(diagnostic),line(diagnostic)+' suffix',line(diagnostic).slice(0,-1),line(diagnostic).replace('"version":1','"version":1,"version":1'),line(diagnostic).replace('"version":1','"version": 1'),line(diagnostic)+line(diagnostic),'x'.repeat(1025)])assert.equal(decode(value),undefined);
});
test('Guides root decoder roundtrips every producer enum and authenticated role epoch',()=>{
 const source=readFileSync(new URL('../tunes/scripts/guides-parent-supervision.ts',import.meta.url),'utf8'),match=source.match(/const GUIDES_HOST_BOUNDARIES = Object\.freeze\((\[[^\]]+\]) as const\);/);assert.ok(match);
 const boundaries=JSON.parse(match[1].replaceAll("'",'"'));
 for(const phase of ['bootstrap','reset','observe','execution','retirement'])for(const code of ['failed','timeout','protocol','unsettled'])for(const boundary of [null,...boundaries]){const value={version:1,role:'fixture',epoch:0,phase,code,boundary};assert.deepEqual(contract.decodeGuidesFixtureFailureLine(line(value)),value);}
 for(let epoch=1;epoch<=16;epoch++)for(const phase of ['bootstrap','reset','observe','execution','retirement'])for(const code of ['failed','timeout','protocol','unsettled']){const value={version:1,role:'worker',epoch,phase,code,boundary:null};assert.deepEqual(contract.decodeGuidesFixtureFailureLine(line(value)),value);}
});
test('Guides root retains only one terminated matching failed child marker and no raw stderr',()=>{
 assert.equal(typeof contract.retainGuidesFixtureFailure,'function');const retain=contract.retainGuidesFixtureFailure;
 const record={lane:'guides',status:1,signal:null,error:null};assert.equal(retain(record,{status:1,stderr:'private cookie\n'+line(diagnostic)+'\nprivate database\n'}),line(diagnostic));assert.deepEqual(record.guidesFixtureFailure,diagnostic);assert.equal(Object.isFrozen(record.guidesFixtureFailure),true);assert.doesNotMatch(JSON.stringify(record),/cookie|database/);
 for(const [lane,status,stderr] of [['apps',1,line(diagnostic)+'\n'],['guides',0,line(diagnostic)+'\n'],['guides',1,line(diagnostic)],['guides',1,line(diagnostic)+'\n'+line(diagnostic)+'\n'],['guides',1,'embedded '+line(diagnostic)+'\n'],['guides',1,line(diagnostic)+'\n[guides-failure-v1:broken]\n']]){const r={lane,status};assert.equal(retain(r,{status,stderr}),undefined);assert.equal(r.guidesFixtureFailure,undefined);}
 assert.equal(retain({lane:'guides',status:1},{status:2,stderr:line(diagnostic)+'\n'}),undefined);
 let accessed=0;const unsafe=Object.defineProperty({},'stderr',{get(){accessed++;throw Error('private');}});assert.equal(retain({lane:'guides',status:1},unsafe),undefined);
 const proxy=new Proxy({}, {get(){accessed++;throw Error('private');},ownKeys(){accessed++;throw Error('private');},getPrototypeOf(){accessed++;throw Error('private');}});assert.equal(retain(proxy,{status:1,stderr:line(diagnostic)+'\n'}),undefined);assert.equal(accessed,0);
});
const manifest=()=>JSON.parse(readFileSync(new URL('../explorers-earth/e2e/replatform/suite-manifest.json',import.meta.url)));
const provenance={commit:'a'.repeat(40),sourceHash:'b'.repeat(64),manifestHash:'c'.repeat(64),dirty:true};
const child=lane=>({status:0,signal:null,error:null,receipt:{version:1,lane:lane.name,provenance,config:lane.config,spec:lane.spec,projects:lane.projects,discovery:lane.identities,results:lane.identities.map(identity=>({identity,expectedStatus:'passed',status:'expected',attempts:[{status:'passed',retry:0}]})),errors:[],cleanup:{status:'passed'},artifacts:{trace:'off',video:'off',screenshot:'off',cleanup:'passed'},authority:{owned:true,database:'music_uat_'+'d'.repeat(32),containerId:'e'.repeat(64),imageId:'sha256:'+'f'.repeat(64)},child:{status:0,signal:null},startedAt:'2026-10-02T00:00:00.000Z',endedAt:'2026-10-02T00:00:01.000Z',playwright:'1.61.1'}});
test('Guides selected16 validates complete166 manifest and exact native receipt while full default remains registered',async()=>{
 assert.equal(typeof contract.qualifyGuidesLane,'function');let seen=[];const result=await contract.qualifyGuidesLane({manifest:manifest(),provenance,expectedPlaywright:'1.61.1',runLane:async lane=>{seen.push(lane.name);return child(lane);}});
 assert.deepEqual(seen,['guides']);assert.equal(result.identities,16);assert.deepEqual(result.scopeContents,['guides']);assert.deepEqual(result.selectedLane,{name:'guides',status:'passed'});assert.equal(result.deliveredSlice,'incomplete');assert.equal(result.releaseEligible,false);
 const bad=manifest();bad.lanes[0].identities.pop();seen=[];await assert.rejects(contract.qualifyGuidesLane({manifest:bad,provenance,runLane:async lane=>{seen.push(lane.name);return child(lane);}}));assert.deepEqual(seen,[]);
 for(const change of [c=>c.status=1,c=>c.receipt.results.pop(),c=>c.receipt.results[0].attempts[0].status='skipped',c=>c.receipt.cleanup.status='failed',c=>c.receipt.playwright='wrong'])await assert.rejects(contract.qualifyGuidesLane({manifest:manifest(),provenance,expectedPlaywright:'1.61.1',runLane:async lane=>{const c=child(lane);change(c);return c;}}));
 assert.equal(manifest().lanes.reduce((sum,lane)=>sum+lane.identities.length,0),166);
});
test('Guides selected CLI uses existing exact root authority and refuses selectors beyond closed lane enum',()=>{
 const args=['--milestone','delivered-auth-profile-books','--ack','TASK4_FIXTURE_OWNED_DISPOSABLE_PG15','--receipt',join(tmpdir(),'replatform-e2e-guides-diag-contract')];
 assert.equal(contract.parseArguments([...args,'--lane','guides']).lane,'guides');assert.equal(contract.parseArguments(args).lane,undefined);assert.equal(contract.parseArguments([...args,'--lane','apps']).lane,'apps');
 for(const value of ['profile','all','GUIDES','guides --grep'])assert.throws(()=>contract.parseArguments([...args,'--lane',value]));assert.throws(()=>contract.parseArguments([...args,'--lane','guides','--grep','private']));
});
test('Guides actual root forwarding omits raw stderr and main preserves guarded selection and incomplete failure scope',()=>{
 const source=readFileSync(new URL('./replatform-e2e.mjs',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('   const musicDiagnostic=retainMusicBoundaryFailure(childRecord,child);'),source.indexOf("   const receiptPath=join(directory,'receipt.json');"));assert.ok(body);
 const forward=Function('childRecord','child','lane','capability','process','retainMusicBoundaryFailure','decodeAppsFixtureFailureLine','retainAppsFixtureFailure','retainGuidesFixtureFailure',body);
 for(const stderr of ['Error: short-cookie\nx: ERROR: short-session\n','Error: short-cookie\n'+line(diagnostic)+'\n',line(diagnostic)+'\n'+line(diagnostic)+'\n']){let output='';const record={lane:'guides',status:1};forward(record,{status:1,stderr},{name:'guides'},'synthetic',{stderr:{write:text=>output+=text}},contract.retainMusicBoundaryFailure,contract.decodeAppsFixtureFailureLine,contract.retainAppsFixtureFailure,contract.retainGuidesFixtureFailure);assert.equal(output,stderr==='Error: short-cookie\n'+line(diagnostic)+'\n'?'guides: '+line(diagnostic)+'\n':'');assert.doesNotMatch(output+JSON.stringify(record),/short-cookie|short-session/);}
 const selected=source.match(/const qualify=([^;]+);/);assert.ok(selected);const choose=Function('options','qualifyAppsLane','qualifyGuidesLane','qualifyLanes','return '+selected[1]);
 const apps=()=>{},guides=()=>{},full=()=>{};assert.equal(choose({lane:'guides'},apps,guides,full),guides);assert.equal(choose({lane:'apps'},apps,guides,full),apps);assert.equal(choose({},apps,guides,full),full);
 assert.match(source,/scopeContents:options\.lane\?\[options\.lane\]:Object\.keys\(lanes\)/);assert.match(source,/deliveredSlice:options\.lane\?'incomplete':'failed'/);assert.match(source,/selectedLane:\{name:options\.lane,status:'failed'\}/);
 assert.match(source,/const source=snapshotSource\(root\),locks=/);assert.match(source,/writeFileSync\(join\(directory,'\.protected-owned\.json'\)/);assert.match(source,/Source changed before lane execution/);assert.match(source,/Source changed during lane execution/);
});
