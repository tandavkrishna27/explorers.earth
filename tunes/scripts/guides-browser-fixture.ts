import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import type {createGuidesParentSupervisor} from './guides-parent-supervision';
type Input=Parameters<typeof createGuidesParentSupervisor>[0];
type Supervisor=ReturnType<typeof createGuidesParentSupervisor>;
type Authority=Awaited<ReturnType<Input['acquisition']['create']>>;
type Receipt={adoptArguments(directory:string):void|Promise<void>;decodeDiscovery(report:unknown):void|Promise<void>;decodeExecution(report:unknown,code:number,signal:null):void|Promise<void>;finish(authority:Authority,failures:string[],interrupted:boolean):void|Promise<void>;failure(phase:'startup'|'discovery'|'execution'|'cleanup',failures:string[],interrupted:boolean):void|Promise<void>};
type Dependencies={clock:{setTimeout(fn:()=>void,ms:number):unknown;clearTimeout(timer:unknown):void};platform:string;argv:string[];environment:Record<string,string|undefined>;preflight():Promise<{receipt:Receipt}>;prepare():Promise<Input>;cleanupSetup():Promise<void>;createSupervisor(input:Input):Supervisor|Promise<Supervisor>;readReport(directory:string,execution:boolean):Promise<unknown>;installSignals(callback:()=>void):()=>void};
class Refusal extends Error{constructor(){super('GUIDES_ROOT_FAILED');}}
const ACK='TASK4_FIXTURE_OWNED_DISPOSABLE_PG15';
const LABELS=['browser','vite','service-children','control','runtime-pool','migrator-pool','owned-database','private-directory','artifacts','receipt'];
function external(argv:string[],env:Dependencies['environment'],platform:string){
 if(platform!=='win32'||argv.length!==8||argv[0]!=='--suite'||argv[1]!=='guides'||argv[2]!=='--ack'||argv[3]!==ACK||argv[4]!=='--receipt-directory'||!path.win32.isAbsolute(argv[5])||argv[6]!=='--receipt-capability'||! /^[a-f0-9]{64}$/.test(argv[7]))throw new Refusal();
 for(const [key,value]of Object.entries(env))if(value!==undefined&&(/^(?:GUIDES_PRIVATE_|(?:AUTH|PROFILE|BOOKS|LIFECYCLE|MOVIES|GAMES|MUSIC|PLACES|PLACE_LINKS|APPS|GUIDES|REPLATFORM)_E2E_|DOCKER_|MUSIC_C10_STANDALONE_POSTGRES_)/i.test(key)||['DATABASE_URL','DATABASE_URL_TEST','NODE_OPTIONS','NODE_CHANNEL_FD','NODE_PATH','GATE_PROD','MUSIC_DEPLOY_PRODUCTION','MUSIC_DEPLOY_PROD','PLAYWRIGHT_EXTERNAL_BASE_URL'].includes(key)||key==='NODE_ENV'&&value==='production'))throw new Refusal();
}
function evidence(value:Awaited<ReturnType<Supervisor['run']>>){if(!value||Object.keys(value).sort().join(',')!=='activeProcesses,completedEpochs,databaseOid,fixtureExitCode,handlesClosed,launcherExitCode'||value.completedEpochs!==16||value.activeProcesses!==0||value.fixtureExitCode!==0||value.launcherExitCode!==0||value.handlesClosed!==true||!Number.isInteger(value.databaseOid)||value.databaseOid<1)throw new Refusal();}
export function createGuidesBrowserFixture(dependencies?:Dependencies):{run():Promise<void>}{
 const d=dependencies??nativeDependencies();
 if(!d||!d.clock||typeof d.clock.setTimeout!=='function'||typeof d.clock.clearTimeout!=='function'||['preflight','prepare','cleanupSetup','createSupervisor','readReport','installSignals'].some(key=>typeof(d as any)[key]!=='function')||typeof d.platform!=='string'||!Array.isArray(d.argv)||!d.environment)throw new Refusal();
 let retained:Promise<void>|undefined;
 return{run(){return retained??=execute();}};
 async function execute(){
  let parent:Supervisor|undefined,receipt:Receipt|undefined,authority:Authority|undefined,input:Input|undefined,interrupted=false,abortIssued=false,startedSetup=false,primary:unknown,phase:'startup'|'discovery'|'execution'|'cleanup'='startup';const failures:string[]=[];
  let uninstall=()=>{};
  const originals=new Set<Promise<unknown>>();
  async function bounded<T>(factory:()=>T|Promise<T>,ms=60000):Promise<T>{const original=Promise.resolve().then(factory);originals.add(original);original.then(()=>originals.delete(original),()=>originals.delete(original));let timer:unknown;try{return await Promise.race([original,new Promise<never>((_,reject)=>{timer=d.clock.setTimeout(()=>reject(new Refusal()),ms);})]);}finally{d.clock.clearTimeout(timer);}}
  const abort=()=>{interrupted=true;if(parent&&!abortIssued){abortIssued=true;try{parent.abort('interrupt');}catch(error){primary??=error;failures.push('service-children');}}};
  try{
   external(d.argv,d.environment,d.platform);uninstall=d.installSignals(abort);
   ({receipt}=await bounded(()=>d.preflight()));if(!receipt||['adoptArguments','decodeDiscovery','decodeExecution','finish','failure'].some(key=>typeof(receipt as any)[key]!=='function'))throw new Refusal();
   if(interrupted)throw new Refusal();startedSetup=true;input=await bounded(()=>d.prepare());if(interrupted)throw new Refusal();
   const owned=input.acquisition;
   const acquisition:Input['acquisition']={intent:owned.intent,async create(){const result=await owned.create();authority=result;if(result.runId!==owned.intent.runId||result.commit!==owned.intent.commit||result.database!==owned.intent.database||result.port!==owned.intent.port||result.owned!==true||! /^[a-f0-9]{64}$/.test(result.containerId)||! /^sha256:[a-f0-9]{64}$/.test(result.imageId))throw new Refusal();return result;},dispose:drop=>owned.dispose(drop)};
   parent=await bounded(()=>d.createSupervisor({...input!,acquisition}));if(interrupted){abort();throw new Refusal();}
   phase='execution';evidence(await parent.run());if(interrupted||!authority)throw new Refusal();
   phase='discovery';const discovery=await bounded(()=>d.readReport(input!.disposableDirectory,false),15000);phase='execution';const execution=await bounded(()=>d.readReport(input!.disposableDirectory,true),15000);
   await bounded(()=>receipt!.adoptArguments(input!.disposableDirectory),15000);await bounded(()=>receipt!.decodeDiscovery(discovery),15000);await bounded(()=>receipt!.decodeExecution(execution,0,null),15000);if(interrupted)throw new Refusal();
  }catch(error){primary=error;}
  try{
   if(parent&&primary&&!abortIssued){abortIssued=true;try{parent.abort(interrupted?'interrupt':'failure');}catch(error){primary??=error;failures.push('service-children');}}
   if(originals.size)throw new Refusal();
   if(parent){const disposed=await bounded(()=>parent!.dispose(),300000);if(!disposed||Object.keys(disposed).sort().join(',')!=='disposed,failures'||disposed.disposed!==true||!Array.isArray(disposed.failures)||disposed.failures.length){for(const label of disposed?.failures??[])if(LABELS.includes(label))failures.push(label);if(!failures.length)failures.push('private-directory');throw new Refusal();}}
   else if(startedSetup)await bounded(()=>d.cleanupSetup(),300000);
  }catch(error){primary??=error;phase='cleanup';if(!failures.length)failures.push('private-directory');}
  let finishing=false;
  try{
   if(!primary&&!interrupted&&authority&&receipt){phase='cleanup';finishing=true;await bounded(()=>receipt!.finish(authority!,[],false),15000);}
   else if(receipt)await bounded(()=>receipt!.failure(phase,failures,interrupted),15000);
  }catch(error){primary??=error;if(receipt&&finishing&&!originals.size){try{await bounded(()=>receipt!.failure('cleanup',[...new Set([...failures,'receipt'])],interrupted),15000);}catch{}}}
  finally{try{uninstall();}catch(error){primary??=error;}}
  if(primary||interrupted)throw new Refusal();
 }
}

// Direct job child is the host, never a recursively allocating root driver.
export async function runGuidesFixtureEntry(environment:Record<string,string|undefined>,host?:()=>Promise<void>):Promise<void>{
 const pipe=environment.GUIDES_PRIVATE_PIPE,token=environment.GUIDES_PRIVATE_TOKEN;
 if(typeof pipe!=='string'||!/^\\\\\.\\pipe\\explorers-guides-[a-f0-9]{32}-[a-f0-9]{32}$/.test(pipe)||typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token)||environment.GUIDES_PRIVATE_EPOCH!=='0'||Object.keys(environment).some(key=>/^GUIDES_PRIVATE_/i.test(key)&&!['GUIDES_PRIVATE_PIPE','GUIDES_PRIVATE_TOKEN','GUIDES_PRIVATE_EPOCH'].includes(key)))throw new Refusal();
 if(host)await host();else await(await import('./guides-fixture-host')).createGuidesFixtureHost().run();
}

function nativeDependencies():Dependencies{
 const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),frontend=path.join(root,'explorers-earth'),temporary=tmpdir();
 let receipt:Receipt|undefined,commit='',runId='',secret:string|undefined,unknown=false;const created:Input['custody'][number][]=[];const ancestors:Input['custody'][number][]=[];
 const fs=()=>import('node:fs/promises');
 async function physical(file:string,directory:boolean){if(!path.isAbsolute(file)||path.resolve(file)!==file||file.startsWith('\\\\')||file.length>4096||/[\x00-\x1f\x7f]/.test(file)||file.slice(path.parse(file).root.length).includes(':'))throw new Refusal();const f=await fs();for(let candidate=directory?file:path.dirname(file);;candidate=path.dirname(candidate)){const stat=await f.lstat(candidate,{bigint:true});if(!stat.isDirectory()||stat.isSymbolicLink()||await f.realpath(candidate)!==candidate)throw new Refusal();if(candidate===path.dirname(candidate))break;}const stat=await f.lstat(file,{bigint:true});if(stat.isSymbolicLink()||(directory?!stat.isDirectory():!stat.isFile()))throw new Refusal();if(await f.realpath(file)!==file)throw new Refusal();return stat;}
 async function row(kind:Input['custody'][number]['kind'],file:string){const stat=await physical(file,kind!=='secret');return{kind,path:file,dev:String(stat.dev),ino:String(stat.ino)};}
 async function exact(item:Input['custody'][number]){const current=await row(item.kind,item.path);if(current.dev!==item.dev||current.ino!==item.ino)throw new Refusal();}
 async function rememberAncestors(file:string){for(let ancestor=path.dirname(file);;ancestor=path.dirname(ancestor)){if(!ancestors.some(item=>item.path===ancestor)&&!created.some(item=>item.path===ancestor))ancestors.push(await row('ancestor',ancestor));if(ancestor===path.dirname(ancestor))break;}}
 async function verifyCustody(){for(const item of[...ancestors,...created])await exact(item);}
 async function boundedJson(file:string,cap:number){
  const f=await fs();const before=await physical(file,false);if(before.size>BigInt(cap))throw new Refusal();let handle:Awaited<ReturnType<typeof f.open>>|undefined;
  const unchanged=(stat:typeof before)=>stat.isFile()&&stat.dev===before.dev&&stat.ino===before.ino&&stat.size===before.size&&stat.mtimeMs===before.mtimeMs&&stat.ctimeMs===before.ctimeMs;
  try{handle=await f.open(file,'r');if(!unchanged(await handle.stat({bigint:true})))throw new Refusal();const bytes=Buffer.alloc(Number(before.size)+1);let read=0;while(read<bytes.length){const result=await handle.read(bytes,read,Math.min(65536,bytes.length-read),read);if(!result.bytesRead)break;read+=result.bytesRead;}if(BigInt(read)!==before.size)throw new Refusal();if(!unchanged(await handle.stat({bigint:true}))||!unchanged(await physical(file,false)))throw new Refusal();const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,read));return strictJson(text);}finally{if(handle)await handle.close();}
 }
 async function report(directory:string,execution:boolean){
  if(!created.some(item=>item.kind==='root'&&item.path===directory))throw new Refusal();await verifyCustody();const result=await boundedJson(path.join(directory,execution?'protected-execution.json':'protected-discovery.json'),8*1024*1024);await verifyCustody();return result;
 }
 return{clock:{setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:timer=>clearTimeout(timer as ReturnType<typeof setTimeout>)},platform:process.platform,argv:process.argv.slice(2),environment:process.env,
  installSignals(fn){process.on('SIGINT',fn);process.on('SIGTERM',fn);const timer=setTimeout(fn,21600000);return()=>{clearTimeout(timer);process.off('SIGINT',fn);process.off('SIGTERM',fn);};},
  async preflight(){
   if(process.versions.node!=='24.21.0')throw new Refusal();
   for(const file of[process.execPath,path.join(root,'tunes/node_modules/tsx/dist/loader.mjs'),path.join(root,'tunes/scripts/guides-windows-job.ps1'),path.join(root,'tunes/scripts/guides-resource-worker.ts'),path.join(root,'tunes/scripts/guides-fixture-host.ts'),path.join(root,'tunes/scripts/music-local-private-files.ps1'),path.join(frontend,'e2e/replatform/guides.spec.ts'),path.join(frontend,'e2e/replatform/guides.playwright.config.ts'),path.join(frontend,'e2e/replatform/guides.vite.config.ts'),path.join(frontend,'node_modules/@playwright/test/cli.js'),path.join(frontend,'node_modules/vite/bin/vite.js'),'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'])await physical(file,false);
   const contract=await import(pathToFileURL(path.join(root,'scripts/replatform-e2e.mjs')).href);const manifest=await boundedJson(path.join(frontend,'e2e/replatform/suite-manifest.json'),1024*1024) as any;contract.validateManifest(manifest);
   const {GUIDES_CASES,GUIDES_PROJECTS}=await import('./guides-browser-support');const lane=manifest.lanes.find((value:any)=>value.name==='guides');
   const expected=GUIDES_PROJECTS.flatMap(project=>GUIDES_CASES.map(title=>JSON.stringify({file:'explorers-earth/e2e/replatform/guides.spec.ts',titlePath:[title],project,repeat:0}))).sort();
   if(!lane||lane.runner!=='tunes/scripts/profile-browser-fixture.ts'||lane.config!=='explorers-earth/e2e/replatform/guides.playwright.config.ts'||lane.spec!=='explorers-earth/e2e/replatform/guides.spec.ts'||JSON.stringify(lane.projects)!==JSON.stringify(GUIDES_PROJECTS)||lane.identities.length!==expected.length||JSON.stringify(lane.identities.map((value:any)=>JSON.stringify(value)).sort())!==JSON.stringify(expected))throw new Refusal();
   const source=contract.snapshotSource(root);if(source.provenance.dirty||! /^[a-f0-9]{40}$/.test(source.provenance.commit))throw new Refusal();commit=source.provenance.commit;
   const receipts=await import('./protected-browser-receipt');if((receipts as unknown as {supportsProtectedReceiptAdoption?:unknown}).supportsProtectedReceiptAdoption!==true)throw new Refusal();const candidate=await receipts.createProtectedReceipt(root,'guides',receipts.extractProtectedReceiptArguments(process.argv.slice(2))) as unknown as Receipt|undefined;
   // This reviewed additive receipt seam is intentionally absent today. There is
   // no caller JSON proof, file rewriting or weaker fallback that opens this gate.
   if(!candidate||typeof candidate.adoptArguments!=='function')throw new Refusal();receipt=candidate;return{receipt};
  },
  async prepare(){
   if(!receipt||!commit)throw new Refusal();runId=randomBytes(16).toString('hex');const directory=path.join(temporary,`explorers-profile-e2e-${runId}`),storage=path.join(directory,'owned-media');const local=await import('./music-local-state');
   const tokenDirectory=path.join(root,'.artifacts','music-token-secrets');
   if(process.platform==='win32'){
    await physical(tokenDirectory,true);
    await rememberAncestors(path.join(tokenDirectory,'current-preflight'));
    await local.assertLocalPrivatePath(tokenDirectory);
    await verifyCustody();
   }
   for(const target of[directory,storage]){await rememberAncestors(target);unknown=true;await local.createLocalPrivateDirectory(target);await local.assertLocalPrivatePath(target);created.push(await row(target===directory?'root':'storage',target));unknown=false;}
   unknown=true;
   if(process.platform==='win32'){
    secret=path.join(tokenDirectory,`current-${randomBytes(16).toString('hex')}`);
    await verifyCustody();await local.assertLocalPrivatePath(tokenDirectory);
    await local.createLocalPrivateFile(secret,randomBytes(32).toString('base64url'));
    await verifyCustody();await local.assertLocalPrivatePath(tokenDirectory);
   }else{const secrets=await import('./music-fixture-secret');secret=secrets.prepareFixtureMusicTokenSecret(root);}
   await local.assertLocalPrivatePath(secret);await rememberAncestors(secret);created.push(await row('secret',secret));unknown=false;
   const {readSecureMusicSecretFile}=await import('../server/config/secure-music-secret-file');const password=await readSecureMusicSecretFile(secret,{mode:'fixture'});
   const custody=[...created,...ancestors];await verifyCustody();
   const {prepareOwnedUatDatabaseAcquisition}=await import('./music-uat-database');const acquisition=await prepareOwnedUatDatabaseAcquisition({runId,commit,database:`music_uat_${runId}`,port:57001,passwordFile:secret});
   const {GUIDES_CASES,GUIDES_PROJECTS}=await import('./guides-browser-support');const environment=(await import('./music-local-state')).localMusicOsEnvironment(process.env) as Record<string,string>;
   return{runId,commit,acquisition,inventory:GUIDES_PROJECTS.flatMap(project=>GUIDES_CASES.map(caseId=>({caseId,project,repeat:0 as const}))),configure:{nodeExecutable:process.execPath,loaderPath:path.join(root,'tunes/node_modules/tsx/dist/loader.mjs'),fixtureEntrypoint:fileURLToPath(import.meta.url),workerEntrypoint:path.join(root,'tunes/scripts/guides-resource-worker.ts'),cwd:root,environment,receiptArguments:process.argv.slice(2)},powershellExecutable:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',jobScript:path.join(root,'tunes/scripts/guides-windows-job.ps1'),disposableDirectory:directory,storageDirectory:storage,origin:'http://127.0.0.1:53001',apiOrigin:'http://127.0.0.1:55001',frontendPort:53002,harnessPort:53003,apiPort:55001,controlPort:55002,personas:Object.fromEntries(['ownerA','ownerB','ownerC'].map((owner,index)=>[owner,{userId:`guides-${runId}-${owner}`,handle:`guides${index}-${runId.slice(0,12)}`}])) as Input['personas'],databasePassword:password,authSecret:randomBytes(32).toString('hex'),custody};
  },
  async cleanupSetup(){if(unknown)throw new Refusal();const f=await fs();for(const item of [...created].reverse()){for(const ancestor of ancestors)await exact(ancestor);await exact(item);if(item.kind==='secret'){const {cleanupFixtureMusicTokenSecret}=await import('./music-fixture-secret');cleanupFixtureMusicTokenSecret(root,item.path);}else await f.rmdir(item.path);}},
  async createSupervisor(input){return(await import('./guides-parent-supervision')).createGuidesParentSupervisor(input);},readReport:report};
}
// Strict duplicate-key JSON, used only for bounded manifests/reports.
function strictJson(text:string):unknown{
 let at=0,nodes=0;const white=()=>{while(/[\t\n\r ]/.test(text[at]??'!'))at++;};
 function string(){const start=at++;while(at<text.length){const c=text[at++];if(c==='"')return JSON.parse(text.slice(start,at)) as string;if(c==='\\')at++;}throw new Refusal();}
 function value(depth:number):unknown{if(depth>64||++nodes>1000000)throw new Refusal();white();if(text[at]==='"')return string();if(text[at]==='{'){at++;const out:Record<string,unknown>=Object.create(null),keys=new Set<string>();white();if(text[at]==='}'){at++;return out;}for(;;){white();if(text[at]!=='"')throw new Refusal();const key=string();if(keys.has(key))throw new Refusal();keys.add(key);white();if(text[at++]!==':')throw new Refusal();out[key]=value(depth+1);white();const c=text[at++];if(c==='}')return out;if(c!==',')throw new Refusal();}}if(text[at]==='['){at++;const out:unknown[]=[];white();if(text[at]===']'){at++;return out;}for(;;){out.push(value(depth+1));white();const c=text[at++];if(c===']')return out;if(c!==',')throw new Refusal();}}const match=/^(?:null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at));if(!match)throw new Refusal();at+=match[0].length;const out=JSON.parse(match[0]);if(typeof out==='number'&&!Number.isFinite(out))throw new Refusal();return out;}
 const result=value(0);white();if(at!==text.length)throw new Refusal();return result;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)void runGuidesFixtureEntry(process.env).catch(()=>{process.exitCode=1;process.stderr.write('Guides owned fixture failed\n');});
