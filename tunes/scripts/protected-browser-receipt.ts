import {spawnSync,type ChildProcess} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {join,resolve,dirname,basename,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

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
 let diagnostics:unknown[]=[];
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
  arguments(args:string[],fixtureDirectory:string){
   if(artifactPolicy)throw new Error('Protected artifact allocation repeated');
   artifactPolicy={configFile:join(fixtureDirectory,'protected.playwright.config.mjs'),outputDir:join(fixtureDirectory,'browser-output')};
   const source=`import base from ${JSON.stringify(pathToFileURL(join(root,lane.config)).href)};\nimport {protectedBrowserConfiguration} from ${JSON.stringify(pathToFileURL(join(root,'scripts/replatform-e2e.mjs')).href)};\nexport default protectedBrowserConfiguration(base,${JSON.stringify(root)},${JSON.stringify(lane.config)},${JSON.stringify(artifactPolicy.outputDir)});\n`;
   writeFileSync(artifactPolicy.configFile,source,{mode:0o600,flag:'wx'});
   const selected=args.filter((arg,index)=>!arg.startsWith('--config=')&&arg!=='--config'&&args[index-1]!=='--config');
   return [...selected,'--config',artifactPolicy.configFile,'--trace=off','--output',artifactPolicy.outputDir];
  },
  discovery(frontend:string,args:string[],env:NodeJS.ProcessEnv,fixtureDirectory:string){
   const path=join(fixtureDirectory,'protected-discovery.json');
   const result=spawnSync(process.execPath,[join(frontend,'node_modules/@playwright/test/cli.js'),'test',...args,'--list','--reporter=json'],{cwd:frontend,env:{...env,PLAYWRIGHT_JSON_OUTPUT_NAME:path},windowsHide:true,encoding:'utf8',maxBuffer:8*1024*1024});
   if(result.status!==0||result.signal||result.error)throw new Error('Protected browser discovery child failed');
   discovered=decode(path,false);
  },
  executionEnvironment(env:NodeJS.ProcessEnv,fixtureDirectory:string){return {...env,PLAYWRIGHT_JSON_OUTPUT_NAME:join(fixtureDirectory,'protected-execution.json')};},
  execution(status:number|null,signal:string|null,fixtureDirectory:string){child={status,signal};executed=decode(join(fixtureDirectory,'protected-execution.json'),true);if(status!==0||signal)throw new Error('Protected browser execution child failed');},
  finish(authority:{database:string;containerId:string;imageId:string},failures:string[],interrupted:boolean){
   if(!discovered||!executed||!child||interrupted||failures.length)throw new Error('Protected execution or owned cleanup did not qualify');
   const current=contract.snapshotSource(root).provenance;if(JSON.stringify(current)!==JSON.stringify(marker.provenance))throw new Error('Protected source changed during execution');
   if(!artifactPolicy||existsSync(artifactPolicy.configFile)||existsSync(artifactPolicy.outputDir)||lstatSync(directory).isSymbolicLink())throw new Error('Protected artifact ownership changed');
   if(child.status!==0||child.signal){const failure={version:1,lane:laneName,provenance:marker.provenance,results:executed,child,diagnostics,cleanup:{status:'passed'},artifacts:{trace:'off',video:'off',screenshot:'off',cleanup:'passed'}};contract.validateFailureRecord(lane,failure,marker.provenance,child);writeFileSync(join(directory,'failure.json'),JSON.stringify(failure,null,2),{mode:0o600,flag:'wx'});throw new Error('Protected execution failed after owned artifact cleanup');}
   const receipt={version:1,lane:laneName,provenance:marker.provenance,config:lane.config,spec:lane.spec,projects:lane.projects,discovery:discovered,results:executed,errors:[],cleanup:{status:'passed'},artifacts:{trace:'off',video:'off',screenshot:'off',cleanup:'passed'},authority:{owned:true,database:authority.database,containerId:authority.containerId,imageId:authority.imageId},child,startedAt,endedAt:new Date().toISOString(),playwright};
   contract.validateLaneReceipt(lane,{status:0,signal:null,error:null,receipt},marker.provenance);
   writeFileSync(join(directory,'receipt.json'),JSON.stringify(receipt,null,2),{mode:0o600,flag:'wx'});
  }
 };
}
export async function stopProtectedChild(child:ChildProcess|undefined){
 if(!child||child.exitCode!==null||child.signalCode!==null)return;
 await new Promise<void>((done,reject)=>{const timer=setTimeout(()=>reject(new Error('Owned child did not exit')),5000);child.once('exit',()=>{clearTimeout(timer);done();});child.kill();});
}
