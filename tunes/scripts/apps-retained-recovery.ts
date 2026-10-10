import {writeSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {isIP} from 'node:net';

const ACK='APPS_EXACT_RETAINED_RECOVERY_V1';
const ENDPOINT='npipe:////./pipe/dockerDesktopLinuxEngine';
const IMAGE='sha256:f7d23353e1b15400d22ebe31189f4d314b87a4c129cc400c8c2d8d4ca127bf81';
// Fresh recovery authority reviewed independently against original terminal parents
// and immutable source checkpoints. Neither checkpoint launched browser/media work.
const RUNS=Object.freeze([
 Object.freeze({runId:'b1b0579261e7d0ffd2c3410bc77b5d5d',commit:'420e13c6895d0ae70d4c997b7244167db0079bce',containerId:'06f3d43b95e1b58c3cf417371735845dfc05a318ac12be4516a87172ae5a82af',port:57181,secretName:'current-b7e028133a9ddbaa592f51dac56e5b9b'}),
 Object.freeze({runId:'956d55c6591e17c3fa056d49d11c37b7',commit:'aa735d7e1ad0640f30f8f22a928a2e41675f6cd5',containerId:'e62389a614340f604cfd0c7c639bb009682e9ca58be4d1de697a4c68dca982e3',port:59450,secretName:'current-6c19df9181633a022588752c25ca1674'}),
]);
type Run=typeof RUNS[number];
type Admin={query(sql:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[]}>;end():Promise<void>};
type Custody={verify():Promise<void>;removeChildren():Promise<void>;removeRoot():Promise<void>;eraseSecret():Promise<void>};
type Lease={release():Promise<void>};
type Dependencies={platform:string;argv:string[];environment:Record<string,string|undefined>;root:string;temporaryRoot:string;clock:{now():number;setTimeout(fn:()=>void,ms:number):unknown;clearTimeout(timer:unknown):void};preflight():Promise<void>;inspect(run:Run):Promise<unknown>;capture(run:Run):Promise<Custody>;lease(custody:Custody):Promise<Lease>;openAdmin(run:Run):Promise<Admin>;stop(run:Run):Promise<void>;remove(run:Run):Promise<void>;absent(run:Run):Promise<boolean>};
const KEYS=['platform','argv','environment','root','temporaryRoot','clock','preflight','inspect','capture','lease','openAdmin','stop','remove','absent'];
type FailureStage='validate'|'preflight'|'inspect'|'capture'|'lease'|'admin'|'witness'|'drop'|'db-absence'|'admin-close'|'stop'|'container-absence'|'children'|'root'|'secret'|'lease-release';
const failureStages=new WeakMap<object,FailureStage>();
class Refusal extends Error{constructor(){super('APPS_RETAINED_RECOVERY_FAILED');}}
function requireValue(value:unknown):asserts value{if(!value)throw new Refusal();}
function database(run:Run){return `music_uat_${run.runId}`;}
function secret(root:string,run:Run){return path.win32.join(root,'.artifacts','music-token-secrets',run.secretName);}
function validateInspect(value:unknown,run:Run,root:string,running=true){
 const observation=value as any,x=observation?.container,c=x?.Config,h=x?.HostConfig,pinned=observation?.image;
 requireValue(pinned?.Id===IMAGE&&Array.isArray(pinned.Config?.Env));
 requireValue(x?.Id===run.containerId&&x.Name===`/explorers-music-uat-db-${run.runId}`&&x.Image===IMAGE&&c?.Image===IMAGE);
 const labels={'com.explorers.music.fixture':'true','com.explorers.music.project':'explorers-music-fixture','com.explorers.music.uat-database':'true','com.explorers.music.uat-run':run.runId,'com.explorers.music.database':database(run),'com.explorers.music.commit':run.commit};
 requireValue(c.Labels&&Object.keys(c.Labels).length===6&&Object.entries(labels).every(([key,v])=>c.Labels[key]===v));
 requireValue(Array.isArray(c.Env)&&c.Env.every((v:unknown)=>typeof v==='string'));
 const env=new Map<string,string>();for(const item of c.Env){const at=item.indexOf('=');requireValue(at>0&&!env.has(item.slice(0,at)));env.set(item.slice(0,at),item.slice(at+1));}
 requireValue(env.get('POSTGRES_USER')==='music_migrator'&&env.get('POSTGRES_DB')===database(run)&&env.get('POSTGRES_PASSWORD_FILE')==='/run/secrets/music-uat-database-password');
 requireValue([...env.keys()].every(key=>['PATH','GOSU_VERSION','LANG','PG_MAJOR','PG_VERSION','PG_SHA256','DOCKER_PG_LLVM_DEPS','PGDATA','POSTGRES_USER','POSTGRES_DB','POSTGRES_PASSWORD_FILE'].includes(key)));
 const defaults=pinned.Config.Env as unknown[];requireValue(defaults.every(v=>typeof v==='string'&&!/^POSTGRES_/.test(v)));
 requireValue(JSON.stringify([...c.Env].sort())===JSON.stringify([...defaults,`POSTGRES_USER=music_migrator`,`POSTGRES_DB=${database(run)}`,'POSTGRES_PASSWORD_FILE=/run/secrets/music-uat-database-password'].sort()));
 requireValue(JSON.stringify(c.Entrypoint)==='["docker-entrypoint.sh"]'&&JSON.stringify(c.Cmd)==='["postgres"]');
 const health=c.Healthcheck;requireValue(JSON.stringify(health?.Test)===JSON.stringify(['CMD-SHELL',`pg_isready -U music_migrator -d ${database(run)} -h 127.0.0.1 -p 5432`])&&health.Interval===1000000000&&health.Timeout===5000000000&&health.Retries===30);
 requireValue(h?.AutoRemove===true&&h.Privileged===false&&h.ReadonlyRootfs===false&&h.NetworkMode==='bridge'&&h.PidMode===''&&h.IpcMode==='private'&&h.RestartPolicy?.Name==='no'&&h.RestartPolicy.MaximumRetryCount===0);
 requireValue([h.CapAdd,h.CapDrop,h.Binds].every(v=>v===null||Array.isArray(v)&&v.length===0)&&Array.isArray(h.Devices)&&h.Devices.length===0);
 requireValue(Object.keys(h.PortBindings??{}).join(',')==='5432/tcp'&&h.PortBindings['5432/tcp'].length===1&&h.PortBindings['5432/tcp'][0].HostIp==='127.0.0.1'&&h.PortBindings['5432/tcp'][0].HostPort===String(run.port));
 const ports=x.NetworkSettings?.Ports;requireValue(Object.keys(ports??{}).join(',')==='5432/tcp'&&(!running&&ports['5432/tcp']===null||Array.isArray(ports['5432/tcp'])&&ports['5432/tcp'].length===1&&ports['5432/tcp'][0].HostIp==='127.0.0.1'&&ports['5432/tcp'][0].HostPort===String(run.port)));
 const networks=x.NetworkSettings?.Networks;requireValue(Object.keys(networks??{}).join(',')==='bridge');const address=networks.bridge?.IPAddress;
 requireValue(!running&&address===''||typeof address==='string'&&isIP(address)===4&&/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(address));
 const tmp=h.Tmpfs;requireValue(Object.keys(tmp??{}).join(',')==='/var/lib/postgresql/data'&&typeof tmp['/var/lib/postgresql/data']==='string'&&tmp['/var/lib/postgresql/data'].split(',').sort().join(',')===['rw','noexec','nosuid','size=2147483648'].sort().join(','));
 requireValue(Array.isArray(x.Mounts));const binds=x.Mounts.filter((m:any)=>m.Type==='bind');requireValue(binds.length===1&&binds[0].RW===false&&binds[0].Destination==='/run/secrets/music-uat-database-password'&&binds[0].Source===secret(root,run));
 requireValue(x.Mounts.every((m:any)=>m===binds[0]||m.Type==='tmpfs'&&m.Destination==='/var/lib/postgresql/data'));
 requireValue(running?x.State?.Running===true&&x.State.Health?.Status==='healthy':x.State?.Running===false);
 return address as string;
}
/** No resource allocation during construction/import. Complete injected adapters are synthetic. */
export function createAppsRetainedRecovery(dependencies?:Dependencies){
 const synthetic=dependencies!==undefined,d=synthetic?dependencies!:nativeDependencies();let stage:FailureStage='validate';let retained:Promise<{runId:string;status:'recovered';evidence:'native'|'synthetic';qualification:false}>|undefined;
 return{run(){return retained??=execute().catch(()=>{const failure=new Refusal();failureStages.set(failure,stage);throw failure;});}};
 async function execute(){
  requireValue(d&&Object.keys(d).sort().join(',')===KEYS.sort().join(',')&&d.clock&&['now','setTimeout','clearTimeout'].every(k=>typeof (d.clock as any)[k]==='function')&&KEYS.filter(k=>!['platform','argv','environment','root','temporaryRoot','clock'].includes(k)).every(k=>typeof (d as any)[k]==='function'));
  requireValue(d.platform==='win32'&&Array.isArray(d.argv)&&d.argv.length===4&&d.argv[0]==='--recover-run'&&d.argv[2]==='--ack'&&d.argv[3]===ACK);
  const selected=RUNS.find(item=>item.runId===d.argv[1]);requireValue(selected);const run:Run=selected;
  requireValue(!Object.entries(d.environment).some(([key,value])=>value!==undefined&&(/^(?:DOCKER_|MUSIC_C10_STANDALONE_POSTGRES_|(?:APPS|REPLATFORM)_E2E_)/i.test(key)||['DATABASE_URL','DATABASE_URL_TEST','NODE_OPTIONS','NODE_CHANNEL_FD','NODE_PATH'].includes(key)||key==='NODE_ENV'&&value==='production')));
  requireValue([d.root,d.temporaryRoot].every(file=>path.win32.isAbsolute(file)&&path.win32.resolve(file)===file&&!file.startsWith('\\\\')&&!/[\x00-\x1f\x7f]/.test(file)));
  const originals=new Set<Promise<unknown>>(),deadline=d.clock.now()+600000;
  async function bounded<T>(operation:()=>Promise<T>,budget=15000,destructive=false){const remaining=Math.floor(deadline-d.clock.now());requireValue(remaining>0&&(!destructive||remaining>=budget));const original=Promise.resolve().then(operation);originals.add(original);original.then(()=>originals.delete(original),()=>originals.delete(original));let timer:unknown;try{return await Promise.race([original,new Promise<never>((_,reject)=>{timer=d.clock.setTimeout(()=>reject(new Refusal()),Math.min(remaining,budget));})]);}finally{d.clock.clearTimeout(timer);}}
  stage='preflight';await bounded(()=>d.preflight(),60000);stage='inspect';const address=validateInspect(await bounded(()=>d.inspect(run)),run,d.root);
  stage='capture';const custody=await bounded(()=>d.capture(run),60000);stage='capture';await bounded(()=>custody.verify(),60000);
  stage='lease';const lease=await bounded(()=>d.lease(custody),15000,true);stage='capture';await bounded(()=>custody.verify(),60000);
  stage='admin';const admin=await bounded(()=>d.openAdmin(run));
  async function witness(){stage='witness';
   const result=await bounded(()=>admin.query("SELECT current_user AS role,current_database() AS maintenance,current_setting('server_version_num')::int AS version,current_setting('max_prepared_transactions')::int AS maxprepared,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser,(SELECT count(*)::int FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()) AS clients,(SELECT count(*)::int FROM pg_prepared_xacts) AS prepared,inet_server_addr()::text AS \"serverAddress\",inet_server_port() AS \"serverPort\""));
   const row=result.rows[0];requireValue(result.rows.length===1&&row.role==='music_migrator'&&row.maintenance==='postgres'&&row.superuser===true&&Number.isInteger(row.version)&&Number(row.version)>=150000&&Number(row.version)<160000&&row.maxprepared===0&&row.clients===0&&row.prepared===0&&row.serverPort===5432&&row.serverAddress===address);
   const oid=await bounded(()=>admin.query('SELECT oid::int AS oid FROM pg_database WHERE datname=$1',[database(run)]));requireValue(oid.rows.length===1&&Number.isSafeInteger(oid.rows[0].oid)&&Number(oid.rows[0].oid)>0);return oid.rows[0].oid;
  }
  const oid=await witness();stage='inspect';requireValue(validateInspect(await bounded(()=>d.inspect(run)),run,d.root)===address);stage='capture';await bounded(()=>custody.verify(),60000);requireValue(await witness()===oid);
  requireValue(originals.size===0);stage='drop';await bounded(()=>admin.query(`DROP DATABASE "${database(run)}"`),15000,true);
  stage='db-absence';const absent=await bounded(()=>admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database(run)]));requireValue(absent.rows.length===0);
  stage='admin-close';await bounded(()=>admin.end(),15000,true);
  stage='inspect';requireValue(validateInspect(await bounded(()=>d.inspect(run)),run,d.root)===address);stage='capture';await bounded(()=>custody.verify(),60000);stage='stop';await bounded(()=>d.stop(run),45000,true);
  stage='container-absence';if(!await bounded(()=>d.absent(run))){validateInspect(await bounded(()=>d.inspect(run)),run,d.root,false);await bounded(()=>d.remove(run),15000,true);requireValue(await bounded(()=>d.absent(run)));}
  requireValue(originals.size===0);stage='capture';await bounded(()=>custody.verify(),60000);stage='children';await bounded(()=>custody.removeChildren(),60000,true);stage='root';await bounded(()=>custody.removeRoot(),15000,true);stage='secret';await bounded(()=>custody.eraseSecret(),15000,true);stage='lease-release';await bounded(()=>lease.release(),15000,true);
  return{runId:run.runId,status:'recovered' as const,evidence:synthetic?'synthetic' as const:'native' as const,qualification:false as const};
 }
}

function nativeDependencies():Dependencies{
 const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),temporaryRoot=tmpdir();
 const ps='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',docker='C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',helper=path.join(root,'tunes/scripts/music-local-private-files.ps1');
 const states=new WeakMap<Custody,{run:Run;directory:string;verify():Promise<void>;remaining:Set<string>;identities:Map<string,string>;lease?:string}>();
 const fs=()=>import('node:fs/promises');let unknown=false;
 const environment=()=>Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA'].flatMap(key=>process.env[key]===undefined?[]:[[key,process.env[key]!]]));
 async function command(executable:string,args:string[],budget:number,input?:string,maxBytes=1048576){
  const {spawn}=await import('node:child_process');
  return await new Promise<string>((resolve,reject)=>{
   const child=spawn(executable,args,{shell:false,windowsHide:true,cwd:root,env:environment(),stdio:['pipe','pipe','pipe']});let output='',bad=false;
   const timer=setTimeout(()=>{unknown=true;bad=true;try{child.kill();}catch{}reject(new Refusal());},budget);
   child.once('error',()=>{unknown=true;bad=true;reject(new Refusal());});child.stdout.on('data',(bytes:Buffer)=>{if(Buffer.byteLength(output)+bytes.length>maxBytes){unknown=true;bad=true;try{child.kill();}catch{}}else output+=bytes.toString('utf8');});child.stderr.resume();child.stdin.on('error',()=>{unknown=true;bad=true;});child.stdin.end(input);
   child.once('close',(code,signal)=>{clearTimeout(timer);if(bad||code!==0||signal!==null){unknown=true;reject(new Refusal());}else resolve(output.trim());});
  });
 }
 async function privatePath(file:string){requireValue(await command(ps,['-NoLogo','-NoProfile','-NonInteractive','-File',helper,'inspect',file],10000,undefined,4096)==='{"ok":true}');}
 async function physical(file:string,directory:boolean,trustedExecutable=false){
  requireValue(path.isAbsolute(file)&&path.resolve(file)===file&&!file.startsWith('\\\\')&&!/[\x00-\x1f\x7f]/.test(file)&&!file.slice(path.parse(file).root.length).includes(':'));
  const f=await fs();for(let current=file;;current=path.dirname(current)){const stat=await f.lstat(current);requireValue(!stat.isSymbolicLink()&&await f.realpath(current)===current);if(current===path.dirname(current))break;}
  const stat=await f.lstat(file,{bigint:true});requireValue(directory?stat.isDirectory():stat.isFile()&&(stat.nlink===1n||(trustedExecutable&&[process.execPath,ps,docker].includes(file)&&stat.nlink>0n)));return stat;
 }
 async function identity(file:string,directory:boolean){const s=await physical(file,directory);return[s.dev,s.ino,s.mode,s.uid,s.gid,...(directory?[]:[s.size,s.nlink,s.mtimeNs,s.ctimeNs])].map(String).join(':');}
 const args=(tail:string[])=>['--host',ENDPOINT,...tail];
 return{platform:process.platform,argv:process.argv.slice(2),environment:process.env,root,temporaryRoot,clock:{now:()=>performance.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:timer=>clearTimeout(timer as ReturnType<typeof setTimeout>)},
  async preflight(){requireValue(process.versions.node==='24.21.0');for(const file of[process.execPath,ps,docker])await physical(file,false,true);await physical(helper,false);requireValue(createHash('sha256').update(await(await fs()).readFile(helper)).digest('hex')==='d35c7b8a92813890d5074a9088ff6d690610322deb0684d0c52b26774a5ff764');requireValue(/^5\.1\.\d+\.\d+$/.test(await command(ps,['-NoLogo','-NoProfile','-NonInteractive','-Command','$PSVersionTable.PSVersion.ToString()'],10000,undefined,4096)));},
  async inspect(run){const image=JSON.parse(await command(docker,args(['image','inspect','--format','{{json .}}',IMAGE]),15000));const container=JSON.parse(await command(docker,args(['inspect','--type','container','--format','{{json .}}',run.containerId]),15000));return{image,container};},
  async capture(run){
   const f=await fs(),directory=path.join(temporaryRoot,`explorers-profile-e2e-${run.runId}`),children=['apps-fixture-files','owned-media'],remaining=new Set<string>([directory,...children.map(name=>path.join(directory,name)),secret(root,run)]),identities=new Map<string,string>();
   requireValue(JSON.stringify((await f.readdir(directory)).sort())===JSON.stringify(children));
   for(const file of remaining){const isSecret=file===secret(root,run);await privatePath(file);identities.set(file,await identity(file,!isSecret));if(!isSecret&&file!==directory)requireValue((await f.readdir(file)).length===0);for(let parent=path.dirname(file);;parent=path.dirname(parent)){if(!identities.has(parent))identities.set(parent,await identity(parent,true));if(parent===path.dirname(parent))break;}}
   await privatePath(path.dirname(secret(root,run)));
   const verify=async()=>{
    requireValue(!unknown);for(const [file,old] of identities)requireValue(await identity(file,file!==secret(root,run)&&file!==state.lease)===old);
    for(const file of remaining)await privatePath(file);await privatePath(path.dirname(secret(root,run)));
    if(remaining.has(directory)){const expected=[...remaining].filter(file=>path.dirname(file)===directory).map(file=>path.basename(file)).sort();requireValue(JSON.stringify((await f.readdir(directory)).sort())===JSON.stringify(expected));}
    for(const file of remaining)if(file!==directory&&file!==secret(root,run)&&file!==state.lease)requireValue((await f.readdir(file)).length===0);
   };
   const state={run,directory,verify,remaining,identities,lease:undefined as string|undefined};
   const custody:Custody={verify,async removeChildren(){for(const name of children){const file=path.join(directory,name);await verify();await f.rmdir(file);remaining.delete(file);identities.delete(file);}},async removeRoot(){await verify();requireValue((await f.readdir(directory)).length===0);await f.rmdir(directory);remaining.delete(directory);identities.delete(directory);},async eraseSecret(){await verify();const {cleanupFixtureMusicTokenSecret}=await import('./music-fixture-secret');const before=await physical(secret(root,run),false);cleanupFixtureMusicTokenSecret(root,secret(root,run));const after=await physical(secret(root,run),false);requireValue(after.size===0n&&after.dev===before.dev&&after.ino===before.ino);identities.set(secret(root,run),await identity(secret(root,run),false));}};
   states.set(custody,state);return custody;
  },
  async lease(custody){const state=states.get(custody);requireValue(state);await state.verify();const file=path.join(path.dirname(secret(root,state.run)),'.apps-retained-recovery-'+state.run.runId+'.lock');const text=randomUUID();requireValue(await command(ps,['-NoLogo','-NoProfile','-NonInteractive','-File',helper,'create-file',file],10000,text,4096)==='{"ok":true}');state.lease=file;state.identities.set(file,await identity(file,false));state.remaining.add(file);await privatePath(file);const f=await fs(),handle=await f.open(file,'r');return{async release(){await state.verify();const stat=await handle.stat({bigint:true}),expected=await physical(file,false);requireValue(stat.dev===expected.dev&&stat.ino===expected.ino);await handle.close();await state.verify();await f.unlink(file);state.remaining.delete(file);state.identities.delete(file);}};},
  async openAdmin(run){const {readSecureMusicSecretFile}=await import('../server/config/secure-music-secret-file');await privatePath(secret(root,run));const password=await readSecureMusicSecretFile(secret(root,run),{mode:'fixture',maxBytes:512});const {default:pg}=await import('pg');const client=new pg.Client({host:'127.0.0.1',port:run.port,user:'music_migrator',database:'postgres',password,connectionTimeoutMillis:3000,statement_timeout:10000,query_timeout:12000,application_name:'apps_exact_retained_recovery'});await client.connect();return{async query(text,values){return await client.query({text,values});},async end(){await client.end();}};},
  async stop(run){requireValue(await command(docker,args(['stop','--time','10',run.containerId]),45000)===run.containerId);},
  async remove(run){requireValue(await command(docker,args(['rm',run.containerId]),15000)===run.containerId);},
  async absent(run){const id=await command(docker,args(['container','ls','--all','--no-trunc','--filter',`id=${run.containerId}`,'--format','{{.ID}}']),15000);const label=await command(docker,args(['container','ls','--all','--no-trunc','--filter',`label=com.explorers.music.uat-run=${run.runId}`,'--format','{{.ID}}']),15000);requireValue([id,label].every(value=>value===''||value===run.containerId));return id===''&&label==='';},
 };
}
// Direct failure terminates this process only; it does not attest descendant settlement or authorize retained-resource disposal.
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)void createAppsRetainedRecovery().run().then(result=>{process.stdout.write(JSON.stringify(result)+'\n');},failure=>{try{writeSync(2,'APPS_RETAINED_RECOVERY_FAILED '+(failureStages.get(failure)??'unknown')+'\n');}finally{process.exit(1);}});
