const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
function run(mode, overrides = {}) {
  const harness = `
uname(){ echo "${overrides.kernel ?? 'Linux'}"; }
df(){ printf 'Available\\n%s\\n' "${overrides.free ?? 20000000000}"; }
docker(){ case "$*" in *Size*) echo "${overrides.size ?? 1000000000}";; *revision*) echo "${overrides.revision ?? 'abc'}";; *) echo "${overrides.id ?? 'sha256:' + 'a'.repeat(64)}";; esac; }
test(){ if [[ "$1" == -d ]]; then [[ "$2" != "${overrides.missing ?? 'none'}" ]]; else builtin test "$@"; fi; }
realpath(){ if [[ "$*" == *"${overrides.symlink ?? 'never'}"* ]]; then echo /unapproved; else echo "\${@: -1}"; fi; }
sudo(){ printf 'DELETE:%s\\n' "$*"; }
du(){ echo "123 $*"; }
export -f uname df docker test realpath sudo du
bash scripts/image-ci-disk.sh ${mode}
`;
  return spawnSync(bash, ['-c', harness], {cwd: root, encoding:'utf8',env:{...process.env, GITHUB_OUTPUT:'', RUNNER_ENVIRONMENT:overrides.runner ?? 'github-hosted', RUNNER_OS:overrides.os ?? 'Linux', RUNNER_TEMP:'/tmp', IMAGE_REF:'tag:abc', GITHUB_SHA:'abc', EXPECTED_IMAGE_ID:'sha256:'+'a'.repeat(64)}});
}
test('cleanup only deletes literal SDKs and handles missing SDK',()=>{
  const r=run('cleanup',{missing:'/usr/local/lib/android/sdk'}); assert.equal(r.status,0,r.stderr);
  const deletes=r.stdout.split('\n').filter(x=>x.startsWith('DELETE:'));
  assert.equal(deletes.length,1); for(const d of deletes) assert.match(d,/^DELETE:rm -rf -- (\/usr\/share\/dotnet|\/usr\/local\/lib\/android\/sdk)$/);
  assert.ok(!deletes.some(x=>x.endsWith('/usr/local/lib/android/sdk')));
});
test('cleanup refuses symlink resolution and self hosted runners before deletion',()=>{
  for(const [opts,error] of [[{symlink:'/usr/share/dotnet'},/SDK path resolution refused/],[{symlink:'/usr/local/lib/android/sdk'},/SDK path resolution refused/],[{runner:'self-hosted'},/requires GitHub hosted Linux/],[{os:'Windows'},/requires GitHub hosted Linux/],[{kernel:'Darwin'},/requires GitHub hosted Linux/]]) {const r=run('cleanup',opts);assert.notEqual(r.status,0);assert.match(r.stderr,error);assert.ok(!r.stdout.includes('DELETE:'));}
});
test('reserve requires larger of 8GiB and 3 image sizes plus 4GiB',()=>{
  assert.notEqual(run('reserve',{free:8589934591}).status,0);
  assert.equal(run('reserve',{free:8589934592}).status,0);
  assert.notEqual(run('reserve',{size:4000000000,free:16000000000}).status,0);
  assert.equal(run('reserve',{size:4000000000,free:16294967296}).status,0);
  assert.notEqual(run('reserve',{free:'not-measured'}).status,0);
  assert.notEqual(run('reserve',{size:0}).status,0);
});
test('identity refuses revision or immutable ID changes',()=>{
  assert.equal(run('identity').status,0);
  assert.notEqual(run('identity',{revision:'wrong'}).status,0);
  assert.notEqual(run('identity',{id:'sha256:'+'b'.repeat(64)}).status,0);
  assert.notEqual(run('identity',{id:'bad-id'}).status,0);
});
test('report requires parseable complete SARIF and positive catalog evidence',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'image-report-test-'));
  try {
    for(const [report,log,pass] of [['','gathered packages packages=12',false],['{','gathered packages packages=12',false],[JSON.stringify({version:'2.1.0',runs:[]}),'gathered packages packages=12',false],[JSON.stringify({version:'2.1.0',runs:[{tool:{driver:{name:'grype'}},results:[]}]}),'',false],[JSON.stringify({version:'2.1.0',runs:[{tool:{driver:{name:'grype'}},results:[]}]}),'[0002] INFO gathered packages packages=0 time=2s',false],[JSON.stringify({version:'2.1.0',runs:[{tool:{driver:{name:'other'}},results:[]}]}),'gathered packages packages=12',false],[JSON.stringify({version:'2.1.0',runs:[{tool:{driver:{name:'grype'}},results:[]}]}),'[0002] INFO gathered packages packages=12 time=2s',true]]) {
      fs.writeFileSync(path.join(tmp,'report'),report);fs.writeFileSync(path.join(tmp,'log'),log);
      const r=spawnSync(process.execPath,['scripts/image-ci-report.cjs',path.join(tmp,'report'),path.join(tmp,'log')],{cwd:root,encoding:'utf8'});
      assert.equal(r.status===0,pass,r.stderr);
    }
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('actual image workflow preserves build once, strict gate, source and release authority',()=>{
  const yaml=require(path.join(root,'tunes/node_modules/js-yaml'));
  const source=fs.readFileSync(path.join(root,'.github/workflows/tunes.yml'),'utf8');
  const workflow=yaml.load(source);
  const baselineResult=spawnSync('git',['show','HEAD:.github/workflows/tunes.yml'],{cwd:root,encoding:'utf8'});
  assert.equal(baselineResult.status,0,baselineResult.stderr);
  const baseline=yaml.load(baselineResult.stdout);
  assert.deepEqual(workflow.on,baseline.on);
  for(const job of ['release-preflight','publish-image','deploy-production']) assert.deepEqual(workflow.jobs[job],baseline.jobs[job]);
  const steps=workflow.jobs['build-test-scan-push'].steps;
  assert.equal(steps.filter(s=>s.uses?.startsWith('docker/build-push-action@')).length,1);
  const strict=steps.find(s=>s.id==='strict_scan');
  assert.equal(strict.uses,'anchore/scan-action@e1165082ffb1fe366ebaf02d8526e7c4989ea9d2');
  assert.deepEqual([strict.with['fail-build'],strict.with['severity-cutoff'],strict.with['only-fixed']],[true,'high',true]);
  assert.equal(strict['continue-on-error'],undefined);
  assert.equal(strict.env.TMPDIR,'${{ runner.temp }}');
  const complete=steps.find(s=>s.id==='complete_scan');
  assert.deepEqual([complete.with['fail-build'],complete.with['only-fixed']],[false,false]);
  assert.equal(complete.env.TMPDIR,strict.env.TMPDIR);
  assert.match(steps.find(s=>s.id==='report_valid').run,/test "\$COMPLETE_SCAN_OUTCOME" = success/);
  for(const name of ['Retain complete vulnerability report','Save the qualified image for an explicit release','Transfer the qualified image to the release job']) assert.match(steps.find(s=>s.name===name).if,/steps\.report_valid\.outcome == 'success'/);
  for(const step of steps.filter(s=>s.shell==='bash')) {
    const script=step.run.replace(/\$\{\{.*?\}\}/g,'fixture');
    const result=spawnSync(bash,['-n'],{input:script,encoding:'utf8'});
    assert.equal(result.status,0,`${step.name}: ${result.stderr}`);
  }
});
