import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('../tunes/node_modules/typescript');
const original=()=>JSON.parse(readFileSync(new URL('../explorers-earth/e2e/replatform/suite-manifest.json',import.meta.url),'utf8'));
test('Wave2 registration preserves the exact original166 and adds public32 plus People12',async()=>{
 const r=await import('./wave2-browser-registration.mjs');
 const value=r.buildWave2BrowserRegistration(original());
 assert.equal(value.originalIdentityCount,166);assert.equal(value.addedIdentityCount,44);assert.equal(value.totalIdentityCount,210);
 assert.deepEqual(value.lanes.slice(0,11),original().lanes);
 assert.deepEqual(value.lanes.slice(11).map(l=>[l.name,l.identities.length]),[['public-parity',32],['people',12]]);
 assert.equal(value.qualified,false);assert.equal(value.status,'authored');
 assert.equal(new Set(value.lanes.flatMap(l=>l.identities.map(i=>JSON.stringify(i)))).size,210);
 assert(Object.isFrozen(value));assert(Object.isFrozen(value.lanes.at(-1).identities[0].titlePath));
});
test('Wave2 registration refuses old title or order changes rather than relabeling prior qualification',async()=>{
 const r=await import('./wave2-browser-registration.mjs');
 for(const mutate of [m=>m.lanes[0].identities.pop(),m=>m.lanes[0].identities.reverse(),m=>m.lanes[0].identities[0].titlePath[0]='changed',m=>m.lanes[10].projects.reverse(),m=>m.lanes[0].runner='other.ts']){
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
