import {finiteCaseErrorMetadata,type CaseErrorMetadata} from './placesCaseErrorDiagnostic';
import {finiteBootstrapMetadata,type BootstrapMetadata} from './placesBootstrapDiagnostic';
import {isAbsolute,dirname,basename} from 'node:path';
import {writeFileSync} from 'node:fs';
export type GuardReason='identity'|'authority'|'binding'|'acquisition'|'gate'|'blocker'|'settlement'|'admin-timeout'|'cancel-failed'|'terminate-failed'|'transport'|'lease'|'guard';
export type GuardPhase='preflight'|'acquire'|'gate'|'observe'|'settle'|'cancel'|'terminate'|'teardown';
export type GuardFailure={caseId:string;reason:GuardReason;phase:GuardPhase;unsettledCount:number}&BootstrapMetadata&Partial<CaseErrorMetadata>;
type Options={env:Record<string,string|undefined>;caseIds:readonly string[];collection?:boolean;now?:()=>number;writeExclusive?:(path:string,bytes:string)=>void};
const reasons=['identity','authority','binding','acquisition','gate','blocker','settlement','admin-timeout','cancel-failed','terminate-failed','transport','lease','guard'];
const phases=['preflight','acquire','gate','observe','settle','cancel','terminate','teardown'];
// Import is inert, including collection. Bootstrap must precede every Pool/SQL call.
export function createWriterGuardTransport(options:Options){
 const env={...options.env},ids=new Set(options.caseIds),now=options.now??(()=>performance.now());
 const write=options.writeExclusive??((path,bytes)=>writeFileSync(path,bytes,{flag:'wx',encoding:'utf8'}));
 let closed=false,ready=false,bootstrapped=false,usable=false;
 const nonce=env.PLACE_PINS_GUARD_NONCE;
 const paths=['ENTERED','READY','FAILURE'].map(kind=>env[`PLACE_PINS_GUARD_${kind}_PATH`]);
 function reject(){closed=true;throw Error('Fixture guard transport');}
 function validateBinding(){
  if(!/^[a-f0-9]{32}$/.test(nonce??'')||paths.some((p,i)=>typeof p!=='string'||!isAbsolute(p)||basename(p)!==`writer-${['entered','ready','failure'][i]}.json`)||new Set(paths).size!==3||new Set(paths.map(p=>typeof p==='string'?dirname(p):'')).size!==1)reject();usable=true;
 }
 function failStop(event:GuardFailure){
  if(closed)return;closed=true;
  const caseKeys=['caseCategory','caseSqlState','sourceFile','sourceLine','sourceColumn'].filter(key=>Object.hasOwn(event,key));
  const caseMetadata=finiteCaseErrorMetadata(Object.fromEntries(caseKeys.map(k=>[k,(event as any)[k]])));
  const validCase=!caseKeys.length||event.caseId!=='suite-bootstrap'&&event.caseId!=='suite-teardown'&&!!caseMetadata;
  const metadataKeys=['setupStage','category','sqlState'].filter(key=>Object.hasOwn(event,key));
  const metadata=finiteBootstrapMetadata(event);
  const validMetadata=!metadataKeys.length||event.caseId==='suite-bootstrap'&&Object.hasOwn(event,'setupStage')&&Object.hasOwn(event,'category')&&metadataKeys.length===Object.keys(metadata).length&&metadataKeys.every(key=>(event as any)[key]===(metadata as any)[key]);
  if(!validCase||!validMetadata||Object.keys(event).length!==4+metadataKeys.length+caseKeys.length||!ids.has(event.caseId)||!reasons.includes(event.reason)||!phases.includes(event.phase)||!Number.isInteger(event.unsettledCount)||event.unsettledCount<0||event.unsettledCount>16)throw Error('Fixture guard frame');
  if(!usable)return;
  const bytes=JSON.stringify({version:1,nonce,kind:'failure',...event});if(Buffer.byteLength(bytes,'utf8')>512)throw Error('Fixture guard frame');
  try{write(paths[2]!,bytes);}catch{/* Closed admission is irreversible even for EEXIST or hung delivery. */}
 }
 function bootstrap(install:()=>void=()=>{}){
  if(options.collection)return;if(bootstrapped||closed)reject();bootstrapped=true;
  try{validateBinding();const began=now();write(paths[0]!,JSON.stringify({version:1,nonce,kind:'entered'}));install();if(now()-began>=1000)reject();const readyAt=now();write(paths[1]!,JSON.stringify({version:1,nonce,kind:'ready'}));if(now()-began>=1000)reject();ready=true;return readyAt;}
  catch{closed=true;throw Error('Fixture guard bootstrap');}
 }
 function admit(caseId:string){if(closed||!ready||!ids.has(caseId))reject();}
 return {bootstrap,admit,failStop,admitted:()=>ready&&!closed};
}
