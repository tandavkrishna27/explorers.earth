import * as fs from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { isAbsolute, join, relative, resolve, parse, dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { attestSourceTree } from './browser-source-attestation.mjs';
import { encodeTestList, validateSelectedIdentities } from './browser-test-list.mjs';
import { canonical, discoveryIdentities, exactFields, identityKey, validatePlan } from './browser-shard-plan.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const reject = code => { const error = new Error(code); error.code = code; throw error; };
const samePath = (a,b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
function within(root, target) {
  const rel = relative(root, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) reject('PATH_ESCAPE');
  return target;
}
async function plainPath(path, kind) {
  if (!isAbsolute(path)) reject('ABSOLUTE_PATH_REQUIRED');
  const normalized = resolve(path);
  let current = parse(normalized).root;
  for (const segment of normalized.slice(current.length).split(/[\\/]/).filter(Boolean)) {
    current = join(current, segment);
    if ((await fs.lstat(current)).isSymbolicLink()) reject('SYMLINK_REJECTED');
  }
  const stat = await fs.lstat(normalized);
  if ((kind === 'directory' && !stat.isDirectory()) || (kind === 'file' && !stat.isFile())) reject('WRONG_PATH_KIND');
  if (!samePath(await fs.realpath(normalized), normalized)) reject('PATH_ALIAS_REJECTED');
  return normalized;
}
function relativeFile(root, path) {
  identityKey({file:path,titlePath:['source'],project:'',repeat:0});
  return within(root, resolve(root,path));
}
async function walkFiles(root, directory) {
  const full = relativeFile(root,directory);
  await plainPath(full,'directory');
  const paths = [];
  for (const entry of await fs.readdir(full,{withFileTypes:true})) {
    const path = `${directory}/${entry.name}`;
    const actual = await fs.lstat(relativeFile(root,path));
    if (actual.isSymbolicLink()) reject('SYMLINK_REJECTED');
    if (actual.isDirectory()) paths.push(...await walkFiles(root,path));
    else if (actual.isFile()) paths.push(path);
    else reject('UNSUPPORTED_FILE_KIND');
  }
  return paths;
}
async function sourceSnapshot(source) {
  const root = await plainPath(source.root,'directory');
  if (!Array.isArray(source.directoryScopes) || !Array.isArray(source.fileScopes)) reject('SOURCE_SCOPE_REQUIRED');
  const observedPaths = [];
  for (const path of source.directoryScopes) observedPaths.push(...await walkFiles(root,path));
  for (const path of source.fileScopes) { await plainPath(relativeFile(root,path),'file'); observedPaths.push(path); }
  if (new Set(observedPaths).size !== observedPaths.length) reject('SOURCE_SCOPE_OVERLAP');
  const tracked = new Set(source.trackedPaths);
  const untracked = observedPaths.filter(path=>!tracked.has(path));
  const files = [];
  for (const file of source.files) {
    const actual = await plainPath(relativeFile(root,file.path),'file');
    files.push({...file,observed:await fs.readFile(actual),observedKind:'file'});
  }
  const attestation = attestSourceTree({...source,files,untracked});
  if (observedPaths.length !== tracked.size) reject('SOURCE_SCOPE_INCOMPLETE');
  return {attestation,files};
}
async function reservePort() {
  const server = createServer();
  await new Promise((done,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',done);});
  return {port:server.address().port,close:()=>new Promise((done,fail)=>server.close(error=>error?fail(error):done()))};
}

/** Native Linux process-group ownership. Windows must use a reviewed native Job
 * Object adapter: killing an already-exited parent PID cannot prove descendants.
 */
export function linuxProcessGroupOwner({spawnProcess=spawn,kill=process.kill.bind(process),pause=delay}={}) {
  let pid,child,stopRequested=false;
  const groupExists=()=>{try{kill(-pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
  async function terminateGroup() {
    if (!pid) return {proved:true};
    if (!groupExists()) return {proved:true};
    try { kill(-pid,'SIGTERM'); } catch(error) { if(error.code!=='ESRCH')return {proved:false}; }
    for(let n=0;n<20;n++){if(!groupExists())return {proved:true};await pause(25);}
    try { kill(-pid,'SIGKILL'); } catch(error) { if(error.code!=='ESRCH')return {proved:false}; }
    for(let n=0;n<20;n++){if(!groupExists())return {proved:true};await pause(25);}
    return {proved:false};
  }
  let termination;
  const terminate=()=>termination??=terminateGroup().catch(()=>({proved:false}));
  return {
    kind:'native-linux-process-group',
    run(command,args,options) {
      if(child) reject('OWNER_ALREADY_USED');
      return new Promise(done=>{
        let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),error,status=null,signal=null,finished=false,stopping=false;
        const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);options.signal?.removeEventListener('abort',stop);done({status,signal,stdout:stdout.toString('utf8'),stderr:stderr.toString('utf8'),error});};
        const stop=()=>{if(stopping)return;stopping=true;stopRequested=true;error??={code:'CHILD_CANCELLED'};if(!pid)child?.kill?.('SIGTERM');void terminate().then(finish);};
        child=spawnProcess(command,args,{cwd:options.cwd,env:options.env,shell:false,detached:true,windowsHide:true,stdio:['ignore','pipe','pipe']});
        pid=child.pid;
        const timer=setTimeout(()=>{error={code:'CHILD_TIMEOUT'};stop();},options.timeoutMs);
        options.signal?.addEventListener('abort',stop,{once:true});
        if(options.signal?.aborted)stop();
        for(const [stream,key] of [[child.stdout,'stdout'],[child.stderr,'stderr']])stream?.on('data',data=>{
          if(finished||stopping)return;
          const bytes=Buffer.from(data),remaining=Math.max(0,options.maxOutputBytes-stdout.length-stderr.length);
          const retained=bytes.subarray(0,remaining);
          if(key==='stdout')stdout=Buffer.concat([stdout,retained]);else stderr=Buffer.concat([stderr,retained]);
          if(bytes.length>remaining){stdout=Buffer.alloc(0);stderr=Buffer.alloc(0);error={code:'CHILD_OUTPUT_LIMIT'};stop();}
        });
        child.once('error',value=>{error={code:value.code??'SPAWN_ERROR'};finish();});
        child.once('close',(code,sig)=>{status=code;signal=sig;if(stopRequested)error??={code:'CHILD_CANCELLED'};finish();});
      });
    },
    cleanup:terminate,
  };
}

/** API authority is supplied independently by a trusted dispatcher, never read
 * from request/receipt claims. This ticket can produce discovery-only evidence.
 * Synthetic adapters are explicitly recorded; neither is a runtime receipt.
 */
export async function discoverOwnedShard(request,authority,{owner,platform=process.platform,ambient=process.env,signal}={}) {
  // Unsafe allocation authority is rejected without writing to an untrusted path.
  const allocationRoot=await plainPath(authority.allocationRoot,'directory');
  const root=await fs.mkdtemp(join(allocationRoot,'browser-shard-'));
  const nonce=randomBytes(24).toString('hex');
  const control=join(root,'control'),artifactRoot=join(root,'artifacts'),workspace=join(root,'workspace');
  await fs.mkdir(control);await fs.mkdir(artifactRoot);await fs.mkdir(workspace);
  await fs.writeFile(join(root,'.owner.json'),JSON.stringify({nonce}),{flag:'wx',mode:0o600});
  const receiptPath=join(artifactRoot,'discovery-attempt.json');
  const record={kind:'discovery-only',runtimeQualified:false,passed:false,phase:'initializing',cleanup:'pending'};
  async function owned() {
    await plainPath(root,'directory');within(allocationRoot,root);
    if(JSON.parse(await fs.readFile(join(root,'.owner.json'),'utf8')).nonce!==nonce)reject('OWNERSHIP_CHANGED');
  }
  async function persist() {
    await owned();await plainPath(artifactRoot,'directory');
    const staging=join(artifactRoot,`${randomBytes(8).toString('hex')}.tmp`);
    await fs.writeFile(staging,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
    await fs.rename(staging,receiptPath);
  }
  await persist();
  let started=false,reservation,linked=[];
  try {
    exactFields(request,['mode','shard'],'request');
    if(request.mode!=='discover')reject('RUNTIME_MODE_NOT_QUALIFIED');
    validatePlan(authority.plan);
    if(authority.plan.schemaVersion!==2||!Number.isSafeInteger(request.shard)||request.shard<1||request.shard>authority.plan.shards.length)reject('INVALID_PLAN_OR_SHARD');
    exactFields(authority.producer,['repository','workflow','runId','attempt','event','ref','shardJobs'],'producer');
    exactFields(authority.producer.shardJobs,authority.plan.shards.map(s=>String(s.index)),'trusted job mapping');
    if(['repository','workflow','runId','event','ref'].some(k=>typeof authority.producer[k]!=='string'||!authority.producer[k])||!Number.isSafeInteger(authority.producer.attempt)||authority.producer.attempt<1||new Set(Object.values(authority.producer.shardJobs)).size!==authority.plan.shards.length||Object.values(authority.producer.shardJobs).some(j=>typeof j!=='string'||!j))reject('INVALID_PRODUCER_MAPPING');
    record.producer=structuredClone(authority.producer);record.planHash=authority.plan.planHash;record.shard=request.shard;
    for(const key of ['PLAYWRIGHT_EXTERNAL_BASE_URL','DATABASE_URL','DATABASE_URL_TEST','NODE_OPTIONS','NODE_PATH','DOCKER_HOST','DOCKER_CONTEXT','GATE_PROD','MUSIC_DEPLOY_PRODUCTION','MUSIC_DEPLOY_PROD'])if(ambient[key])reject('AMBIENT_AUTHORITY_REJECTED');
    if(signal?.aborted)reject('CANCELLED');
    const snapshot=await sourceSnapshot(authority.source);
    if(canonical(snapshot.attestation.provenance)!==canonical(authority.plan.provenance))reject('SOURCE_PROVENANCE_MISMATCH');
    record.provenance=snapshot.attestation.provenance;record.observedHash=snapshot.attestation.observedHash;
    for(const file of snapshot.files){const target=relativeFile(workspace,file.path);await fs.mkdir(dirname(target),{recursive:true});await fs.writeFile(target,file.observed,{flag:'wx',mode:file.mode==='100755'?0o755:0o644});}
    const runtime=authority.runtime;
    if(runtime.nodeVersion!=='24.21.0')reject('NODE_VERSION_PREREQUISITE');
    const node=await plainPath(runtime.nodePath,'file');
    if(hash(await fs.readFile(node))!==runtime.nodeHash)reject('NODE_BINARY_MISMATCH');
    const roots={};
    for(const name of ['frontend','tunes']){
      const dependency=authority.dependencies[name];const dependencyRoot=await plainPath(dependency.root,'directory');
      const install=await plainPath(join(dependencyRoot,'.package-lock.json'),'file');
      if(hash(await fs.readFile(install))!==dependency.installationHash)reject('INSTALLATION_MISMATCH');
      roots[name]=dependencyRoot;
    }
    const cli=await plainPath(join(roots.frontend,'@playwright/test/cli.js'),'file');
    const packageJson=JSON.parse(await fs.readFile(await plainPath(join(roots.frontend,'@playwright/test/package.json'),'file'),'utf8'));
    if(hash(await fs.readFile(cli))!==authority.dependencies.cliHash||packageJson.version!==runtime.playwrightVersion)reject('PLAYWRIGHT_PREREQUISITE');
    for(const [folder,target] of [['explorers-earth',roots.frontend],['tunes',roots.tunes]]){const link=join(workspace,folder,'node_modules');await fs.mkdir(dirname(link),{recursive:true});await fs.symlink(target,link,'junction');linked.push({link,target});}
    if(!owner){if(platform!=='linux')reject(platform==='win32'?'WINDOWS_OWNER_UNAVAILABLE':'PLATFORM_OWNER_UNAVAILABLE');owner=linuxProcessGroupOwner();}
    if(typeof owner.run!=='function'||typeof owner.cleanup!=='function'||!['native-linux-process-group','synthetic-test-only'].includes(owner.kind))reject('UNREVIEWED_CHILD_OWNER');
    if(owner.kind==='native-linux-process-group'&&platform!=='linux')reject('PLATFORM_OWNER_MISMATCH');
    record.childOwner=owner.kind;
    reservation=await reservePort();
    const assignment=authority.plan.shards[request.shard-1];
    const selector=encodeTestList(assignment.identities,{configRoot:'explorers-earth/e2e'});
    const selectorPath=join(control,'selection.txt');await fs.writeFile(selectorPath,selector,{flag:'wx',mode:0o600});
    record.assignmentHash=assignment.assignmentHash;record.selectionHash=hash(selector);
    const args=[join(workspace,'explorers-earth/node_modules/@playwright/test/cli.js'),'test'];
    if(authority.lane==='music')args.push('e2e/music.spec.ts','e2e/account-lifecycle.spec.ts','e2e/music-accessibility.spec.ts','--project=chromium-pr-safe','--project=firefox-music-visual','--project=webkit-music-visual');
    else if(authority.lane==='publishing')args.push('--config=playwright.music-publishing.config.ts');
    else reject('UNKNOWN_LANE');
    args.push('--retries=0','--workers=1','--list','--reporter=json','--test-list',selectorPath,`--output=${join(artifactRoot,'tests')}`);
    const env={};for(const key of ['PATH','SystemRoot','SYSTEMROOT','COMSPEC','HOME','USERPROFILE','APPDATA','LOCALAPPDATA'])if(ambient[key])env[key]=ambient[key];
    env.CI='true';env.TEMP=control;env.TMP=control;env.TMPDIR=control;env.CATEGORY_FIXTURE_PORT=String(reservation.port);env.PLAYWRIGHT_PORT=String(reservation.port);
    started=true;record.phase='discovering';await persist();
    const child=await owner.run(node,args,{cwd:join(workspace,'explorers-earth'),env,shell:false,signal,timeoutMs:30000,maxOutputBytes:4*1024*1024});
    record.child={status:child.status,signal:child.signal,spawnError:child.error?.code??null,stdoutHash:hash(child.stdout??''),stderrHash:hash(child.stderr??'')};
    if(signal?.aborted)reject('CANCELLED');
    const selected=discoveryIdentities(child,{filePrefix:'explorers-earth/e2e',projects:authority.projects});
    validateSelectedIdentities(assignment.identities,selected);
    const after=await sourceSnapshot({...authority.source,root:workspace});
    if(canonical(after.attestation.provenance)!==canonical(snapshot.attestation.provenance)||after.attestation.observedHash!==snapshot.attestation.observedHash)reject('CHILD_SOURCE_CHANGED');
    record.identities=selected;record.phase='discovered';
  } catch(error) {record.reason=error.code??'DISCOVERY_OR_PREREQUISITE_REJECTED';record.phase='failed';}
  finally {
    let clean=true;
    if(started){try{clean=(await owner.cleanup()).proved===true;}catch{clean=false;}}
    if(reservation){try{await reservation.close();}catch{clean=false;}}
    if(clean){try{
      await owned();
      for(const item of linked){within(workspace,item.link);if(!(await fs.lstat(item.link)).isSymbolicLink()||!samePath(await fs.realpath(item.link),item.target))reject('DEPENDENCY_LINK_CHANGED');await fs.unlink(item.link);}
      // Never recursively delete a tree containing unknown links/reparse points.
      await walkFiles(root,'workspace');await owned();within(root,workspace);
      await fs.rm(workspace,{recursive:true,force:false});
    }catch{clean=false;}}
    record.cleanup=clean?'passed':'failed';
    if(!clean){record.reason='CLEANUP_NOT_PROVED';record.phase='failed';}
    record.passed=record.phase==='discovered'&&clean;
    await persist();
  }
  return {...record,root,artifactRoot,workspace,receiptPath};
}
