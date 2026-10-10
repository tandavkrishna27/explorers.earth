import {spawnSync,type ChildProcess} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,realpathSync,existsSync,openSync,fstatSync,readSync,closeSync,constants,type BigIntStats} from 'node:fs';
import {join,resolve,dirname,basename,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

export const supportsProtectedReceiptAdoption=true;

export function extractProtectedReceiptArguments(args:string[]){
 const position=args.indexOf('--receipt-directory');
 if(position===-1){if(args.some(a=>a.startsWith('--receipt')))throw new Error('Unknown protected receipt option');return {args};}
 if(position!==args.length-4||args[position+2]!=='--receipt-capability'||!/^[a-f0-9]{64}$/.test(args[position+3]))throw new Error('Invalid protected receipt arguments');
 return {args:args.slice(0,position),directory:args[position+1],capability:args[position+3]};
}
export async function createProtectedReceipt(root:string,laneName:string,options:ReturnType<typeof extractProtectedReceiptArguments>){
 if(!options.directory)return undefined;
 const directory=resolve(options.directory),parent=dirname(directory);
 if(!isAbsolute(options.directory)||basename(directory)!==laneName||dirname(parent)!==resolve(tmpdir())||!/^replatform-e2e-[A-Za-z0-9-]{8,64}$/.test(basename(parent))||lstatSync(directory).isSymbolicLink()||lstatSync(parent).isSymbolicLink()||realpathSync(directory)!==directory)throw new Error('Protected receipt directory escaped owned allocation');
 const marker=JSON.parse(readFileSync(join(directory,'.protected-owned.json'),'utf8'));
 if(marker.version!==1||marker.lane!==laneName||marker.capability!==options.capability)throw new Error('Protected receipt allocation authority mismatch');
 const contract=await import(pathToFileURL(join(root,'scripts/replatform-e2e.mjs')).href);
 const manifest=JSON.parse(readFileSync(join(root,'explorers-earth/e2e/replatform/suite-manifest.json'),'utf8'));
 contract.validateManifest(manifest);const lane=manifest.lanes.find((entry:{name:string})=>entry.name===laneName);
 if(JSON.stringify(contract.snapshotSource(root).provenance)!==JSON.stringify(marker.provenance))throw new Error('Protected receipt source changed');
 const startedAt=new Date().toISOString();let discovered:unknown[]|undefined,executed:unknown[]|undefined,playwright:string|undefined,child:{status:number|null;signal:string|null}|undefined;
 let artifactPolicy:{configFile:string;outputDir:string}|undefined;
 const configurationSource=(outputDir:string)=>`import base from ${JSON.stringify(pathToFileURL(join(root,lane.config)).href)};\nimport {protectedBrowserConfiguration} from ${JSON.stringify(pathToFileURL(join(root,'scripts/replatform-e2e.mjs')).href)};\nexport default protectedBrowserConfiguration(base,${JSON.stringify(root)},${JSON.stringify(lane.config)},${JSON.stringify(outputDir)});\n`;
 let diagnostics:unknown[]=[];
 let topology:unknown;
 const decode=(path:string,execution:boolean)=>{
  if(!artifactPolicy)throw new Error('Protected artifact allocation missing');
  const report=JSON.parse(readFileSync(path,'utf8'));
  const decoded=contract.decodeProtectedReport(report,lane,root,execution,artifactPolicy);
  if(execution)diagnostics=contract.decodeProtectedFailureDiagnostics(report,lane,root);
  if(playwright&&decoded.playwright!==playwright)throw new Error('Protected browser tool version changed');
  playwright=decoded.playwright;return decoded.results;
 };
 return {
  capability:options.capability,
  topology(record:unknown){
   if(laneName!=='music'||lstatSync(directory).isSymbolicLink()||realpathSync(directory)!==directory)throw new Error('Protected topology allocation mismatch');
   const input=record as {authority:unknown};contract.validateMusicTopology(record,marker.provenance,input?.authority);
   writeFileSync(join(directory,'topology.json'),JSON.stringify(record,null,2),{mode:0o600,flag:'wx'});
   topology=record;
  },
  arguments(args:string[],fixtureDirectory:string){
   if(artifactPolicy)throw new Error('Protected artifact allocation repeated');
   artifactPolicy={configFile:join(fixtureDirectory,'protected.playwright.config.mjs'),outputDir:join(fixtureDirectory,'browser-output')};
   const source=configurationSource(artifactPolicy.outputDir);
   writeFileSync(artifactPolicy.configFile,source,{mode:0o600,flag:'wx'});
   const selected=args.filter((arg,index)=>!arg.startsWith('--config=')&&arg!=='--config'&&args[index-1]!=='--config');
   return [...selected,'--config',artifactPolicy.configFile,'--trace=off','--output',artifactPolicy.outputDir];
  },
  adoptArguments(fixtureDirectory:string){
   const refuse=()=>{throw new Error('Protected Guides artifact adoption refused');};
   if(laneName!=='guides'||artifactPolicy||typeof fixtureDirectory!=='string'||!isAbsolute(fixtureDirectory)||resolve(fixtureDirectory)!==fixtureDirectory||fixtureDirectory.length>4096||fixtureDirectory.startsWith('\\\\')||/[\x00-\x1f\x7f]/.test(fixtureDirectory)||dirname(fixtureDirectory)!==resolve(tmpdir())||!/^explorers-profile-e2e-[a-f0-9]{32}$/.test(basename(fixtureDirectory)))refuse();
   const policy={configFile:join(fixtureDirectory,'protected.playwright.config.mjs'),outputDir:join(fixtureDirectory,'browser-output')};
   const identity=(stat:BigIntStats,file:boolean)=>[stat.dev,stat.ino,stat.mode,stat.uid,...(file?[stat.size,stat.mtimeNs,stat.ctimeNs,stat.nlink]:[])].map(String).join(':');
   const retained=new Map<string,{identity:string;file:boolean}>();
   const capture=(target:string,file=false)=>{
    const stat=lstatSync(target,{bigint:true});
    if(stat.isSymbolicLink()||realpathSync(target)!==target||(file?!stat.isFile()||stat.nlink!==1n:!stat.isDirectory()))refuse();
    retained.set(target,{identity:identity(stat,file),file});return stat;
   };
   // This proves config association only. The coordinator retains disposal custody.
   for(const target of [root,fixtureDirectory,directory])for(let current=target;;current=dirname(current)){
    capture(current);if(current===dirname(current))break;
   }
   if(existsSync(policy.outputDir))capture(policy.outputDir);
   const before=capture(policy.configFile,true),expected=Buffer.from(configurationSource(policy.outputDir),'utf8');
   const limit=16384;
   if(expected.length>limit||before.size!==BigInt(expected.length)||before.size>BigInt(limit))refuse();
   if(JSON.stringify(contract.snapshotSource(root).provenance)!==JSON.stringify(marker.provenance))refuse();
   const handle=openSync(policy.configFile,constants.O_RDONLY|constants.O_NOFOLLOW);
   try{
    const opened=fstatSync(handle,{bigint:true});
    if(!opened.isFile()||identity(opened,true)!==identity(before,true))refuse();
    const bytes=Buffer.alloc(limit+1);let length=0;
    for(let reads=0;reads<18;reads++){
     const count=readSync(handle,bytes,length,Math.min(1024,bytes.length-length),length);
     if(!Number.isInteger(count)||count<0||count>Math.min(1024,bytes.length-length))refuse();
     length+=count;if(length>limit)refuse();if(count===0)break;if(reads===17)refuse();
    }
    if(length!==expected.length||!bytes.subarray(0,length).equals(expected)||identity(fstatSync(handle,{bigint:true}),true)!==identity(before,true))refuse();
    for(const [target,record] of retained){
     const stat=lstatSync(target,{bigint:true});
     if(stat.isSymbolicLink()||realpathSync(target)!==target||(record.file?!stat.isFile():!stat.isDirectory())||identity(stat,record.file)!==record.identity)refuse();
    }
    if(!retained.has(policy.outputDir)&&existsSync(policy.outputDir))refuse();
    if(JSON.stringify(contract.snapshotSource(root).provenance)!==JSON.stringify(marker.provenance))refuse();
   }finally{closeSync(handle);}
   artifactPolicy=policy;
  },
  decodeExecution(report:unknown,code:number|null,signal:string|null){
   if(!artifactPolicy)throw new Error('Protected artifact allocation missing');
   const decoded=contract.decodeProtectedReport(report,lane,root,true,artifactPolicy);
   const failureDiagnostics=contract.decodeProtectedFailureDiagnostics(report,lane,root);
   if(playwright&&decoded.playwright!==playwright)throw new Error('Protected browser tool version changed');
   playwright=decoded.playwright;executed=decoded.results;diagnostics=failureDiagnostics;child={status:code,signal};
  },
  decodeDiscovery(report:unknown){
   if(!artifactPolicy)throw new Error('Protected artifact allocation missing');
   const decoded=contract.decodeProtectedReport(report,lane,root,false,artifactPolicy);
   if(playwright&&decoded.playwright!==playwright)throw new Error('Protected browser tool version changed');
   playwright=decoded.playwright;discovered=decoded.results;
  },
  discovery(frontend:string,args:string[],env:NodeJS.ProcessEnv,fixtureDirectory:string){
   const path=join(fixtureDirectory,'protected-discovery.json');
   const result=spawnSync(process.execPath,[join(frontend,'node_modules/@playwright/test/cli.js'),'test',...args,'--list','--reporter=json'],{cwd:frontend,env:{...env,PLAYWRIGHT_JSON_OUTPUT_NAME:path},windowsHide:true,encoding:'utf8',maxBuffer:8*1024*1024});
   if(result.status!==0||result.signal||result.error)throw new Error('Protected browser discovery child failed');
   discovered=decode(path,false);
  },
  executionEnvironment(env:NodeJS.ProcessEnv,fixtureDirectory:string){return {...env,PLAYWRIGHT_JSON_OUTPUT_NAME:join(fixtureDirectory,'protected-execution.json')};},
  execution(status:number|null,signal:string|null,fixtureDirectory:string){child={status,signal};executed=decode(join(fixtureDirectory,'protected-execution.json'),true);if(status!==0||signal)throw new Error('Protected browser execution child failed');},
  failure(phase:'startup'|'discovery'|'execution'|'cleanup',cleanupFailures:string[],interrupted:boolean){
   if(lstatSync(directory).isSymbolicLink()||lstatSync(parent).isSymbolicLink()||realpathSync(directory)!==directory||realpathSync(parent)!==parent)throw new Error('Protected failure directory ownership changed');
   let sourceIntact=false;try{sourceIntact=JSON.stringify(contract.snapshotSource(root).provenance)===JSON.stringify(marker.provenance);}catch{}
   const results=executed as {attempts:{status:string}[]}[]|undefined;
   const attempts=results?.flatMap(result=>result.attempts);
   const record={version:1,lane:laneName,provenance:marker.provenance,phase,interrupted,sourceIntact,
    cleanup:{status:cleanupFailures.length?'failed':'passed',failures:[...new Set(cleanupFailures)]},
    artifacts:{trace:'off',video:'off',screenshot:'off',cleanup:artifactPolicy&&(existsSync(artifactPolicy.configFile)||existsSync(artifactPolicy.outputDir))?'failed':'passed'},
    counts:{discovered:discovered?.length??null,executed:results?.length??null,passed:attempts?.filter(attempt=>attempt.status==='passed').length??null,failed:attempts?.filter(attempt=>['failed','timedOut','interrupted'].includes(attempt.status)).length??null,skipped:attempts?.filter(attempt=>attempt.status==='skipped').length??null,attempts:attempts?.length??null}};
   contract.validateLifecycleFailureRecord(lane,record,marker.provenance);
   writeFileSync(join(directory,'lifecycle-failure.json'),JSON.stringify(record,null,2),{mode:0o600,flag:'wx'});
  },
  finish(authority:{database:string;containerId:string;imageId:string},failures:string[],interrupted:boolean){
   if(!discovered||!executed||!child||interrupted||failures.length)throw new Error('Protected execution or owned cleanup did not qualify');
   const current=contract.snapshotSource(root).provenance;if(JSON.stringify(current)!==JSON.stringify(marker.provenance))throw new Error('Protected source changed during execution');
   if(!artifactPolicy||existsSync(artifactPolicy.configFile)||existsSync(artifactPolicy.outputDir)||lstatSync(directory).isSymbolicLink())throw new Error('Protected artifact ownership changed');
   if(child.status!==0||child.signal){const failure={version:1,lane:laneName,provenance:marker.provenance,results:executed,child,diagnostics,cleanup:{status:'passed'},artifacts:{trace:'off',video:'off',screenshot:'off',cleanup:'passed'}};contract.validateFailureRecord(lane,failure,marker.provenance,child);writeFileSync(join(directory,'failure.json'),JSON.stringify(failure,null,2),{mode:0o600,flag:'wx'});throw new Error('Protected execution failed after owned artifact cleanup');}
   const receipt={version:1,lane:laneName,provenance:marker.provenance,config:lane.config,spec:lane.spec,projects:lane.projects,discovery:discovered,results:executed,errors:[],cleanup:{status:'passed'},artifacts:{trace:'off',video:'off',screenshot:'off',cleanup:'passed'},authority:{owned:true,database:authority.database,containerId:authority.containerId,imageId:authority.imageId},child,startedAt,endedAt:new Date().toISOString(),playwright};
   contract.validateLaneReceipt(lane,{status:0,signal:null,error:null,receipt,topology},marker.provenance);
   writeFileSync(join(directory,'receipt.json'),JSON.stringify(receipt,null,2),{mode:0o600,flag:'wx'});
  }
 };
}
export async function waitProtectedChild(child:ChildProcess|undefined,timeoutMs=10000){
 if(!child||child.exitCode!==null||child.signalCode!==null)return;
 await new Promise<void>((done,reject)=>{
  const clean=()=>{clearTimeout(timer);child.off('exit',exited);child.off('error',errored);};
  const exited=()=>{clean();done();};
  const errored=()=>{clean();reject(new Error('Owned child exit failed'));};
  const timer=setTimeout(()=>{clean();reject(new Error('Owned child natural exit timed out'));},timeoutMs);
  child.once('exit',exited);child.once('error',errored);
 });
}
export async function stopProtectedChild(child:ChildProcess|undefined){
 if(!child||child.exitCode!==null||child.signalCode!==null)return;
 await new Promise<void>((done,reject)=>{const timer=setTimeout(()=>reject(new Error('Owned child did not exit')),5000);child.once('exit',()=>{clearTimeout(timer);done();});child.kill();});
}
