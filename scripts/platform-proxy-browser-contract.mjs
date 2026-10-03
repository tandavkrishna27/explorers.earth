import assert from 'node:assert/strict';
export function validateProxyResources(r) {
 assert.match(r.runId,/^[a-f0-9]{32}$/);assert.equal(r.project,'platform-browser-'+r.runId);
 assert.ok(Array.isArray(r.containers)&&Array.isArray(r.volumes));
 for(const c of r.containers){assert.equal(c.project,r.project);assert.ok(['postgres','api','render','web','proxy','browser'].includes(c.service));}
 for(const v of r.volumes){if(v.name.startsWith(r.project+'-')){assert.ok(['fixture','private','renderer','routing','ca'].includes(v.name.slice(r.project.length+1)));assert.equal(v.nonce,r.runId);}else{assert.ok(['postgres-data','runtime-web'].some(n=>v.name===r.project+'_'+n));assert.equal(v.project,r.project);}}
}
export function identities(report) {
 const found=[];function visit(suites){for(const s of suites??[]){for(const spec of s.specs??[])for(const test of spec.tests??[])found.push({file:spec.file.split(/[\\/]/).at(-1),project:test.projectName,title:spec.title,test});visit(s.suites);}}visit(report.suites);return found;
}
export function validateProxyDiscovery(report,manifest) {
 assert.equal(manifest.version,'owned-synthetic-proxy/v1');assert.equal(manifest.count,38);assert.equal(manifest.identities.length,38);
 const key=x=>JSON.stringify([x.file,x.project,x.title]),expected=manifest.identities.map(key).sort(),observed=identities(report).map(key).sort();
 assert.equal(new Set(expected).size,38);assert.deepEqual(observed,expected);assert.ok(!report.errors?.length);return 38;
}
export function validateProxyExecution(report,manifest,exitCode) {
 validateProxyDiscovery(report,manifest);assert.equal(exitCode,0);assert.deepEqual({expected:report.stats?.expected,unexpected:report.stats?.unexpected,flaky:report.stats?.flaky,skipped:report.stats?.skipped},{expected:38,unexpected:0,flaky:0,skipped:0});
 for(const {test} of identities(report)){assert.equal(test.expectedStatus,'passed');assert.equal(test.status,'expected');assert.equal(test.results?.length,1);const r=test.results[0];assert.equal(r.status,'passed');assert.equal(r.retry,0);assert.ok(!r.error&&!r.errors?.length);}
 return 38;
}
