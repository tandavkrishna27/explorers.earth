import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const ts=createRequire(import.meta.url)('../tunes/node_modules/typescript');
const original=()=>{const value=JSON.parse(readFileSync(new URL('../explorers-earth/e2e/replatform/suite-manifest.json',import.meta.url),'utf8'));return {...value,lanes:value.lanes.slice(0,10),scopeContents:value.lanes.slice(0,10).map(lane=>lane.name)};};
test('Wave2 registration preserves the exact original142 and adds public32 People12 and enrichment4',async()=>{
 const r=await import('./wave2-browser-registration.mjs');
 const value=r.buildWave2BrowserRegistration(original());
 assert.equal(value.originalIdentityCount,142);assert.equal(value.addedIdentityCount,48);assert.equal(value.totalIdentityCount,190);
 assert.deepEqual(value.lanes.slice(0,10),original().lanes);
 assert.deepEqual(value.lanes.slice(10).map(l=>[l.name,l.identities.length]),[['public-parity',32],['people',12],['apps-enrichment',4]]);
 assert.equal(value.qualified,false);assert.equal(value.status,'authored');
 assert.equal(new Set(value.lanes.flatMap(l=>l.identities.map(i=>JSON.stringify(i)))).size,190);
 assert(Object.isFrozen(value));assert(Object.isFrozen(value.lanes.at(-1).identities[0].titlePath));
});
test('Wave2 registration refuses old title or order changes rather than relabeling prior qualification',async()=>{
 const r=await import('./wave2-browser-registration.mjs');
 for(const mutate of [m=>m.lanes[0].identities.pop(),m=>m.lanes[0].identities.reverse(),m=>m.lanes[0].identities[0].titlePath[0]='changed',m=>m.lanes[9].projects.reverse(),m=>m.lanes[0].runner='other.ts']){
  const m=original();mutate(m);assert.throws(()=>r.buildWave2BrowserRegistration(m));
 }
});
test('Wave2 additive titles match the approved actual TypeScript source inventory',async()=>{
 const r=await import('./wave2-browser-registration.mjs');
 const source=readFileSync(new URL('../tunes/scripts/public-parity-browser-support.ts',import.meta.url),'utf8');
 const parsed=ts.createSourceFile('public-parity-browser-support.ts',source,ts.ScriptTarget.Latest,true);
 for(const [name,titles]of [['PUBLIC_PARITY_CASES',r.PUBLIC_PARITY_TITLES],['PEOPLE_CASES',r.PEOPLE_TITLES]]){
  const declaration=parsed.statements.filter(ts.isVariableStatement).flatMap(s=>s.declarationList.declarations).find(d=>ts.isIdentifier(d.name)&&d.name.text===name);assert(declaration);
  let value=declaration.initializer;
  if(ts.isCallExpression(value)){assert.equal(value.expression.getText(parsed),'Object.freeze');assert.equal(value.arguments.length,1);value=value.arguments[0];}
  if(ts.isAsExpression(value))value=value.expression;
  assert(ts.isArrayLiteralExpression(value));assert(value.elements.every(ts.isStringLiteral));
  assert.deepEqual(titles,value.elements.map(element=>element.text));
 }
});
test('protected manifest accepts the additive inventory and refuses missing or renamed identities',async()=>{
 const r=await import('./wave2-browser-registration.mjs'),root=await import('./replatform-e2e.mjs');
 const manifest=original(),registration=r.buildWave2BrowserRegistration(manifest);
 const expanded={...manifest,scopeContents:registration.lanes.map(l=>l.name),lanes:registration.lanes};
 assert.doesNotThrow(()=>root.validateManifest(expanded));
 for(const mutate of [m=>m.lanes.at(-1).identities.pop(),m=>m.lanes.at(-1).identities[0].titlePath[0]='invented',m=>m.lanes[0].identities.reverse()]){
  const changed=JSON.parse(JSON.stringify(expanded));mutate(changed);assert.throws(()=>root.validateManifest(changed));
 }
});
test('selected public/People synthetic receipts stay incomplete and reject skipped required identities',async()=>{
 const r=await import('./wave2-browser-registration.mjs'),root=await import('./replatform-e2e.mjs'),base=original(),registration=r.buildWave2BrowserRegistration(base),manifest={...base,scopeContents:registration.lanes.map(l=>l.name),lanes:registration.lanes};
 const provenance={commit:'a'.repeat(40),sourceHash:'b'.repeat(64),manifestHash:'c'.repeat(64),dirty:true};
 const child=lane=>({status:0,signal:null,error:null,receipt:{version:1,lane:lane.name,provenance,config:lane.config,spec:lane.spec,projects:lane.projects,discovery:lane.identities,results:lane.identities.map(identity=>({identity,expectedStatus:'passed',status:'expected',attempts:[{status:'passed',retry:0}]})),errors:[],cleanup:{status:'passed'},artifacts:{trace:'off',video:'off',screenshot:'off',cleanup:'passed'},authority:{owned:true,database:'music_uat_'+'d'.repeat(32),containerId:'e'.repeat(64),imageId:'sha256:'+'f'.repeat(64)},child:{status:0,signal:null},startedAt:'2026-10-02T00:00:00.000Z',endedAt:'2026-10-02T00:00:01.000Z',playwright:'1.61.1'}});
 for(const [name,count]of [['public-parity',32],['people',12],['apps-enrichment',4]]){
  const seen=[],result=await root.qualifyPublicPeopleLane({manifest,provenance,expectedPlaywright:'1.61.1',runLane:async lane=>{seen.push(lane.name);return child(lane);}},name);
  assert.deepEqual(seen,[name]);assert.equal(result.identities,count);assert.equal(result.deliveredSlice,'incomplete');assert.equal(result.releaseEligible,false);assert.equal(result.overallMilestone,'incomplete');
  await assert.rejects(root.qualifyPublicPeopleLane({manifest,provenance,runLane:async lane=>{const value=child(lane);value.receipt.results[0].attempts[0].status='skipped';return value;}},name));
 }
 await assert.rejects(root.qualifyPublicPeopleLane({manifest,provenance,runLane:async()=>{throw Error('Unsupported selection must refuse before effects');}},'music'));
});
test('public/People selected CLI requires exact acknowledgement and rejects ambient authority',async()=>{
 const root=await import('./replatform-e2e.mjs'),args=['--milestone','delivered-auth-profile-books','--ack','TASK4_FIXTURE_OWNED_DISPOSABLE_PG15','--receipt',join(tmpdir(),'replatform-e2e-registration-synthetic-unused')];
 for(const name of ['public-parity','people','apps-enrichment']){
  assert.equal(root.parseArguments([...args,'--lane',name]).lane,name);
  assert.throws(()=>root.parseArguments([...args,'--lane',name,'--grep','positive']));
 }
 for(const key of ['PUBLIC_PARITY_E2E_ORIGIN','PEOPLE_E2E_FIXTURE_PATH'])assert.throws(()=>root.assertEnvironment({[key]:''}));
});

test('Apps enrichment registration matches actual source titles and existing project names',async()=>{
 const r=await import('./wave2-browser-registration.mjs');
 const source=readFileSync(new URL('../tunes/scripts/apps-enrichment-browser-support.ts',import.meta.url),'utf8');
 const parsed=ts.createSourceFile('apps-enrichment-browser-support.ts',source,ts.ScriptTarget.Latest,true);
 const declaration=parsed.statements.filter(ts.isVariableStatement).flatMap(s=>s.declarationList.declarations).find(d=>ts.isIdentifier(d.name)&&d.name.text==='APPS_ENRICHMENT_CASES');assert(declaration);
 const call=declaration.initializer;assert(ts.isCallExpression(call));assert.equal(call.expression.getText(parsed),'Object.freeze');assert.equal(call.arguments.length,1);
 let array=call.arguments[0];if(ts.isAsExpression(array))array=array.expression;assert(ts.isArrayLiteralExpression(array));assert(array.elements.every(ts.isStringLiteral));assert.deepEqual(r.APPS_ENRICHMENT_TITLES,array.elements.map(element=>element.text));
 const lane=r.buildWave2BrowserRegistration(original()).lanes.at(-1);assert.equal(lane.name,'apps-enrichment');assert.deepEqual(lane.projects,['apps-desktop','apps-mobile']);assert.equal(lane.identities.length,4);assert.equal(lane.spec,'explorers-earth/e2e/replatform/apps-enrichment.spec.ts');
});