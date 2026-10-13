import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodePublicParityFixtureFailureLine as decode,retainPublicParityFixtureFailure as retain} from './replatform-e2e.mjs';
const manifest=JSON.parse(readFileSync(new URL('../explorers-earth/e2e/replatform/suite-manifest.json',import.meta.url),'utf8'));
const line=value=>'Public fixture failed [public-parity-failure-v1:'+JSON.stringify(value)+']';
const value=(lane,epoch=null)=>({version:1,family:lane.name,epoch,caseIndex:epoch===null?null:epoch-1,caseId:epoch===null?null:lane.identities[epoch-1].titlePath[0],project:epoch===null?null:lane.identities[epoch-1].project,boundary:'bootstrap',completedEpochs:0});
test('reset checkpoints require a real bound reset epoch and cannot relabel bootstrap or execution',()=>{
 for(const family of ['people','public-parity']){
  const lane=manifest.lanes.find(l=>l.name===family),base={...value(lane,1),boundary:'reset'};
  for(const resetStep of ['worker-launch','worker-handshake','worker-init','worker-bootstrap','owner-bindings','materialization','manifest-validation']){
   const capsule={...base,resetStep};assert.deepEqual(decode(line(capsule),lane),capsule);
   const record={lane:family,status:1,signal:null,error:null};assert.equal(retain(record,{status:1,signal:null,error:null,stdout:'',stderr:line(capsule)+'\n'},lane),line(capsule));assert.deepEqual(record.publicParityFixtureFailure,capsule);
  }
  for(const changed of [{resetStep:'private-error'},{resetStep:null},{resetStep:{}},{boundary:'execution',resetStep:'worker-init'},{...value(lane),resetStep:'worker-init'},{bootstrapStep:'source',resetStep:'worker-init'}])assert.equal(decode(line({...base,...changed}),lane),undefined);
 }
});
test('bootstrap checkpoint admits only closed bootstrap metadata and preserves legacy capsules',()=>{
 const lane=manifest.lanes.find(l=>l.name==='people'),base=value(lane);
 for(const step of ['source','manifest','powershell','receipt','physical-files','private-directory','private-secret','acquisition-preflight','acquisition-create','pg-witness','launcher','kernel-configure','fixture-launch','fixture-handshake','discovery','discovery-adopt','discovery-read','discovery-decode']){
  const capsule={...base,bootstrapStep:step};assert.deepEqual(decode(line(capsule),lane),capsule);
  const record={lane:'people',status:1,signal:null,error:null};assert.equal(retain(record,{status:1,signal:null,error:null,stdout:'',stderr:line(capsule)+'\n'},lane),line(capsule));assert.deepEqual(record.publicParityFixtureFailure,capsule);
 }
 for(const step of [null,undefined,{},'private-secret-value'])assert.deepEqual(decode(line({...base,bootstrapStep:step}),lane),step===undefined?base:undefined);
 assert.equal(decode(line({...base,boundary:'execution',bootstrapStep:'discovery'}),lane),undefined);
});
test('public failure decoder binds both complete source inventories and every issued epoch',()=>{
 for(const family of ['public-parity','people']){const lane=manifest.lanes.find(l=>l.name===family);assert.deepEqual(decode(line(value(lane)),lane),value(lane));for(let epoch=1;epoch<=lane.identities.length;epoch++){const capsule={...value(lane,epoch),boundary:'execution',completedEpochs:epoch-1};assert.deepEqual(decode(line(capsule),lane),capsule);}for(const boundary of ['bootstrap','reset','observe','retirement','execution','browser-exit','cleanup'])assert.deepEqual(decode(line({...value(lane),boundary}),lane),{...value(lane),boundary});}
});
test('public failure decoder refuses private fields foreign identities unsafe progress and noncanonical lines',()=>{
 const lane=manifest.lanes.find(l=>l.name==='people'),base=value(lane,1);
 for(const changed of [{...base,raw:'private-cookie'},{...base,family:'public-parity'},{...base,caseId:'foreign'},{...base,caseIndex:1},{...base,project:'people-mobile'},{...base,epoch:13},{...base,epoch:1.5},{...base,completedEpochs:-1},{...base,completedEpochs:2},{...base,boundary:'unknown'},{...value(lane),caseId:base.caseId}])assert.equal(decode(line(changed),lane),undefined);
 for(const malformed of [line(base)+'\n','prefix '+line(base),line(base).replace('"version":1','"version": 1'),line(base).replace('"version":1','"version":1,"version":1')])assert.equal(decode(malformed,lane),undefined);
 for(const mutate of [l=>l.identities.pop(),l=>l.identities.reverse(),l=>l.identities[0].titlePath[0]='changed']){const bad=structuredClone(lane);mutate(bad);assert.equal(decode(line(base),bad),undefined);}
});
test('public root retains one terminated matching failed marker and never raw stderr',()=>{
 const lane=manifest.lanes.find(l=>l.name==='people'),capsule=value(lane),record={lane:'people',status:1,signal:null,error:null},child={status:1,signal:null,error:null,stdout:'',stderr:'private-cookie\n'+line(capsule)+'\n'};
 assert.equal(retain(record,child,lane),line(capsule));assert.deepEqual(record.publicParityFixtureFailure,capsule);assert.doesNotMatch(JSON.stringify(record),/private-cookie/);assert.equal(Object.hasOwn(record,'stderr'),false);assert(Object.isFrozen(record.publicParityFixtureFailure));assert.equal(retain(record,child,lane),undefined);
 for(const changed of [{...child,status:0},{...child,signal:'SIGTERM'},{...child,stderr:line(capsule)},{...child,stderr:line(capsule)+'\n'+line(capsule)+'\n'}])assert.equal(retain({lane:'people',status:1,signal:null,error:null},changed,lane),undefined);
 const unsafe=Object.defineProperty({lane:'people',status:1,signal:null},'error',{enumerable:true,get(){throw Error('Getter must not run');}});assert.equal(retain(unsafe,child,lane),undefined);
});

test('worker bootstrap stage remains bound to exact native begin reset evidence',()=>{for(const family of ['people','public-parity']){const lane=manifest.lanes.find(l=>l.name===family),base={...value(lane,1),boundary:'reset',resetStep:'worker-bootstrap'};for(const workerBootstrapStep of ['database-identity','migrations','runtime-provision','runtime-verify','canonical-app','owner-auth-seed','owner-ensure','owner-profile','owner-proof','composition','api-listen']){const capsule={...base,workerBootstrapStep};assert.deepEqual(decode(line(capsule),lane),capsule);const record={lane:family,status:1,signal:null,error:null};assert.equal(retain(record,{status:1,signal:null,error:null,stdout:'',stderr:line(capsule)+'\n'},lane),line(capsule));}for(const changed of [{resetStep:'worker-init'},{resetStep:'materialization'},{boundary:'execution'},{epoch:null,caseIndex:null,caseId:null,project:null},{workerBootstrapStep:'private-error'},{workerBootstrapStep:{}},{extra:true}])assert.equal(decode(line({...base,workerBootstrapStep:'owner-profile',...changed}),lane),undefined);}});
