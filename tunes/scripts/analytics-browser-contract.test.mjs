import {test} from 'vitest';import assert from 'node:assert/strict';import {cases,projects,validateDiscovery,assertUnchanged,validateExecution} from './analytics-browser-contract.mjs';
const full=()=>({suites:[{specs:cases.map(title=>({title,tests:projects.map(projectName=>({projectName}))}))}]});
test('exact ten identities accepted',()=>assert.equal(validateDiscovery(full()),10));
test('missing identity refused',()=>{const r=full();r.suites[0].specs[0].tests.pop();assert.throws(()=>validateDiscovery(r));});
test('extra or duplicate identity refused',()=>{const r=full();r.suites[0].specs.push(r.suites[0].specs[0]);assert.throws(()=>validateDiscovery(r));});
test('mutated executed source refused',()=>assert.throws(()=>assertUnchanged({a:'one'},{a:'two'})));
test('same source accepted',()=>assert.doesNotThrow(()=>assertUnchanged({a:'one'},{a:'one'})));

test('failed result cannot qualify',()=>assert.throws(()=>validateExecution({...full(),stats:{expected:9,unexpected:1,flaky:0,skipped:0}},1)));
test('skipped or retry result cannot qualify',()=>assert.throws(()=>validateExecution({...full(),stats:{expected:9,unexpected:0,flaky:0,skipped:1}},0)));

const qualified=()=>{const r=full();r.stats={expected:10,unexpected:0,flaky:0,skipped:0};for(const s of r.suites[0].specs)for(const t of s.tests)Object.assign(t,{expectedStatus:'passed',status:'expected',results:[{status:'passed',retry:0}]});return r;};
test('real-shaped single passed result accepted',()=>assert.equal(validateExecution(qualified(),0),10));
for(const [label,change] of [['missing',t=>delete t.results],['skipped',t=>t.results[0].status='skipped'],['failed',t=>t.results[0].status='failed'],['retry',t=>t.results[0].retry=1],['multiple',t=>t.results.push({...t.results[0]})],['expectedStatus',t=>t.expectedStatus='failed'],['status',t=>t.status='unexpected']])test(`reject ${label} per-test execution`,()=>{const r=qualified();change(r.suites[0].specs[0].tests[0]);assert.throws(()=>validateExecution(r,0));});
