import {isProxy,isNativeError} from 'node:util/types';
import type {Page, Request, Response} from '@playwright/test';
import {ownerSnapshotSchema} from '../../../tunes/shared/explorersOwnerContentContract';

type OwnerOptions=Readonly<{origin:string;selectedGuideId:string;scope?:'owner-content'|'selected-guide'}>;
type PublicDetailOptions=Readonly<{origin:string;scope:'public-detail';publicPath:string}>;
type PublicCategoryOptions=Readonly<{origin:string;scope:'public-category';publicPath:string}>;
type Options=OwnerOptions|PublicDetailOptions|PublicCategoryOptions;
export type GuidesOwnerRead=Readonly<{url:URL;body:unknown}>;
type Proof=Readonly<{found:boolean;group:number|null;aborted:boolean}>;
type Attempt={url:URL;ordinal:number;response?:Response;finished:boolean;failed:boolean;work:Promise<GuidesOwnerRead>;proof?:Proof;failureStage?:'headers'|'status'|'body'|'bound'|'finished'|'terminal'|'json';disposition?:'completed'|'native-aborted'};
export const GUIDES_READ_ORACLE_SCOPES=Object.freeze(['owner-content','selected-guide','public-detail','public-category'] as const);
export const GUIDES_READ_ORACLE_CHECKS=Object.freeze(['observer-evaluation','witness-array','witness-shape','witness-missing','witness-group','census-bound','read-headers','read-status','read-body','read-bound','read-finished','read-terminal','read-json','supersession-signal','supersession-native-failure','supersession-member','supersession-read-failure','opening-count','validation-count','opening-schema','opening-token','validation-match','validation-schema','validation-equality','category-token'] as const);
export const GUIDES_READ_ORACLE_GUARDS=Object.freeze(['supersession-signal','supersession-native-failure','supersession-member','supersession-read-failure'] as const);
export type GuidesReadOracleGuard=Readonly<{check:typeof GUIDES_READ_ORACLE_GUARDS[number];attemptIndex:number|null;counts:Readonly<{attempts:number;responses:number;finished:number;nativeFailed:number;groups:number;unqualified:number}>}>;
export type GuidesReadOracle=Readonly<{scope:typeof GUIDES_READ_ORACLE_SCOPES[number];check:typeof GUIDES_READ_ORACLE_CHECKS[number];attemptIndex:number|null;counts:Readonly<{attempts:number;responses:number;finished:number;nativeFailed:number;groups:number;unqualified:number}>;guard?:GuidesReadOracleGuard}>;
const oracleFailures=new WeakMap<object,GuidesReadOracle>();
function validateReadOracleGuard(input:unknown):GuidesReadOracleGuard{const value=own(input),counts=own(value.counts);if(Object.keys(value).sort().join(',')!=='attemptIndex,check,counts'||!GUIDES_READ_ORACLE_GUARDS.includes(value.check as any)||value.attemptIndex!==null&&(!Number.isSafeInteger(value.attemptIndex)||(value.attemptIndex as number)<0||(value.attemptIndex as number)>511)||Object.keys(counts).sort().join(',')!=='attempts,finished,groups,nativeFailed,responses,unqualified'||Object.values(counts).some(n=>!Number.isSafeInteger(n)||(n as number)<0||(n as number)>512))throw refuse();return Object.freeze({check:value.check,attemptIndex:value.attemptIndex,counts:Object.freeze({attempts:counts.attempts,responses:counts.responses,finished:counts.finished,nativeFailed:counts.nativeFailed,groups:counts.groups,unqualified:counts.unqualified})}) as GuidesReadOracleGuard;}
export function validateGuidesReadOracle(input:unknown):GuidesReadOracle{const value=own(input),counts=own(value.counts),guard=Object.hasOwn(value,'guard');if(Object.keys(value).sort().join(',')!==(guard?'attemptIndex,check,counts,guard,scope':'attemptIndex,check,counts,scope')||!GUIDES_READ_ORACLE_SCOPES.includes(value.scope as any)||!GUIDES_READ_ORACLE_CHECKS.includes(value.check as any)||guard&&!['read-headers','read-status','read-body','read-bound','read-finished','read-terminal','read-json'].includes(value.check as any)||value.attemptIndex!==null&&(!Number.isSafeInteger(value.attemptIndex)||(value.attemptIndex as number)<0||(value.attemptIndex as number)>511)||Object.keys(counts).sort().join(',')!=='attempts,finished,groups,nativeFailed,responses,unqualified'||Object.values(counts).some(n=>!Number.isSafeInteger(n)||(n as number)<0||(n as number)>512))throw refuse();return Object.freeze({scope:value.scope,check:value.check,attemptIndex:value.attemptIndex,counts:Object.freeze({attempts:counts.attempts,responses:counts.responses,finished:counts.finished,nativeFailed:counts.nativeFailed,groups:counts.groups,unqualified:counts.unqualified}),...(guard?{guard:validateReadOracleGuard(value.guard)}:{})}) as GuidesReadOracle;}
export function extractGuidesReadOracleFailure(error:unknown):GuidesReadOracle|undefined{if(!error||typeof error!=='object'||isProxy(error)||!isNativeError(error))return;return oracleFailures.get(error);}
const refuse=()=>Error('Guides original owner read proof refused');
function own(input:unknown){if(!input||typeof input!=='object'||isProxy(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw refuse();const descriptors=Object.getOwnPropertyDescriptors(input);if(Reflect.ownKeys(descriptors).some(k=>typeof k!=='string')||Object.values(descriptors).some(d=>!d.enumerable||!Object.hasOwn(d,'value')))throw refuse();return Object.fromEntries(Object.entries(descriptors).map(([k,d])=>[k,d.value]));}
const proofKey='__guidesOriginalFetchSignalProofV1';
function admitted(raw:Options):Options{
 const input=own(raw) as unknown as Options;if(typeof input.origin!=='string'||!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(input.origin))throw refuse();
 if((input.scope==='public-detail'||input.scope==='public-category')){if(Object.keys(input).sort().join(',')!=='origin,publicPath,scope'||typeof input.publicPath!=='string'||!(input.scope==='public-detail'?/^\/api\/explorers\/v1\/profiles\/[a-z0-9][a-z0-9_-]{2,39}\/recommendations\/guides\/[a-z0-9][a-z0-9-]{0,199}$/:/^\/api\/explorers\/v1\/profiles\/[a-z0-9][a-z0-9_-]{2,39}\/recommendations\/guides$/).test(input.publicPath))throw refuse();}
 else{if(!['origin,selectedGuideId','origin,scope,selectedGuideId'].includes(Object.keys(input).sort().join(','))||Object.hasOwn(input,'scope')&&!['owner-content','selected-guide'].includes(input.scope!))throw refuse();if(typeof input.selectedGuideId!=='string'||!(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/).test(input.selectedGuideId))throw refuse();}
 return Object.freeze({...input});
}
function selected(url:URL,options:Options){
 if(url.origin!==options.origin)return false;if((options.scope==='public-detail'||options.scope==='public-category'))return url.pathname===options.publicPath;
 const base='/api/explorers/v1';
 if(url.pathname===`${base}/collections`||url.pathname===`${base}/recommendations`)return url.searchParams.get('category')==='guides';
 return [`${base}/categories/guides/content-snapshot`,`${base}/categories/guides/content-snapshot/validate`,`${base}/categories/guides/memberships`,`${base}/collections/${options.selectedGuideId}/guide`].includes(url.pathname);
}

/** Observe original signals; never replace fetch arguments or its returned Promise. */
export async function installGuidesOwnerFetchObserver(page:Page,input:Options):Promise<void>{
 const options=admitted(input);
 await page.addInitScript(({origin,selectedGuideId,publicPath})=>{
  const key='__guidesOriginalFetchSignalProofV1',original=globalThis.fetch,aborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!;
  const records=new Map<string,{group:number|null;signal:AbortSignal|null}>(),ordinals=new Map<string,number>(),signals=new WeakMap<AbortSignal,number>();let groups=0,overflow=false;

  Object.defineProperty(globalThis,key,{enumerable:false,configurable:false,writable:false,value:Object.freeze({read(queries:ReadonlyArray<{url:string;ordinal:number}>){
   if(overflow||queries.length>512)return queries.map(()=>({found:false,group:null,aborted:false}));
   return queries.map(query=>{const record=records.get(JSON.stringify([query.url,query.ordinal]));if(!record||record.signal===null)return {found:false,group:null,aborted:false};try{return {found:true,group:record.group,aborted:aborted.call(record.signal)===true};}catch{return {found:false,group:null,aborted:false};}});
  }})});
  globalThis.fetch=function(this:unknown,...args:Parameters<typeof fetch>):ReturnType<typeof fetch>{
   try{
    const [input,init]=args;if(typeof input==='string'&&(init===undefined||Object.getPrototypeOf(init)===Object.prototype)){
     const method=init?Object.getOwnPropertyDescriptor(init,'method'):undefined,signal=init?Object.getOwnPropertyDescriptor(init,'signal'):undefined;
     if((method===undefined||Object.hasOwn(method,'value')&&method.value==='GET')&&(!signal||Object.hasOwn(signal,'value'))){
      const url=new URL(input,location.origin),base='/api/explorers/v1';if(url.origin===origin&&(publicPath?url.pathname===publicPath:((url.pathname===`${base}/collections`||url.pathname===`${base}/recommendations`)?url.searchParams.get('category')==='guides':[`${base}/categories/guides/content-snapshot`,`${base}/categories/guides/content-snapshot/validate`,`${base}/categories/guides/memberships`,`${base}/collections/${selectedGuideId}/guide`].includes(url.pathname)))){
       const ordinal=ordinals.get(url.href)??0;ordinals.set(url.href,ordinal+1);if(records.size>=512)overflow=true;
       else{let native:AbortSignal|null=null,group:number|null=null;try{if(signal&&aborted.call(signal.value)===false){native=signal.value;group=signals.get(native!)??++groups;signals.set(native!,group!);}}catch{/* Best-effort instrumentation: its own failure must not replace the result under test. */}
        records.set(JSON.stringify([url.href,ordinal]),{group,signal:native});}
      }
     }
    }
   }catch{/* Unknown signals never grant cancellation admission. */}
   return Reflect.apply(original,this,args);
  };
 },{origin:options.origin,selectedGuideId:(options.scope==='public-detail'||options.scope==='public-category')?null:options.selectedGuideId,publicPath:(options.scope==='public-detail'||options.scope==='public-category')?options.publicPath:null});
}

/** All attempts remain owned until terminal observation; only proven aborts may be unqualified. */
export function createGuidesOwnerReadTracker(page:Page,input:Options){
 const options=admitted(input),attempts=new Map<Request,Attempt>(),ordinals=new Map<string,number>();let sealed=false,overflow=false;
 const latch=(error:unknown,check:GuidesReadOracle['check'],attemptIndex:number|null,groups=0)=>{try{if(!error||typeof error!=='object'||isProxy(error)||!isNativeError(error))return;const first=oracleFailures.get(error),scope=options.scope??'owner-content';if(first&&(first.guard||first.scope!==scope||!first.check.startsWith('read-')||!GUIDES_READ_ORACLE_GUARDS.includes(check as any)))return;const rows=[...attempts.values()],counts={attempts:rows.length,responses:rows.filter(a=>a.response).length,finished:rows.filter(a=>a.finished).length,nativeFailed:rows.filter(a=>a.failed).length,groups,unqualified:rows.filter(a=>a.disposition==='native-aborted').length};oracleFailures.set(error,validateGuidesReadOracle(first?{...first,guard:{check,attemptIndex,counts}}:{scope,check,attemptIndex,counts}));}catch{/* Passive custody never replaces the original failure. */}};
 const started=(request:Request)=>{
  const url=new URL(request.url());if(request.method()!=='GET'||!selected(url,options)||options.scope==='selected-guide'&&url.pathname!=='/api/explorers/v1/collections/'+options.selectedGuideId+'/guide')return;if(sealed||attempts.size>=512){overflow=true;return;}
  const ordinal=ordinals.get(url.href)??0;ordinals.set(url.href,ordinal+1);let headers!:(response:Response)=>void,headerFailure!:(error:unknown)=>void,terminal!:()=>void,terminalFailure!:(error:unknown)=>void;
  const response=new Promise<Response>((resolve,reject)=>{headers=resolve;headerFailure=reject;}),end=new Promise<void>((resolve,reject)=>{terminal=resolve;terminalFailure=reject;});void response.catch(()=>{});void end.catch(()=>{});
  let attempt!:Attempt;attempt={url,ordinal,finished:false,failed:false,work:(async()=>{let stage:NonNullable<Attempt['failureStage']>='headers';try{const original=await response;stage='status';if(original.status()!==200)throw refuse();stage='body';const bytes=await original.body();stage='bound';if(bytes.length>4*1024*1024)throw refuse();stage='finished';if(await original.finished()!==null)throw refuse();stage='terminal';await end;stage='json';return {url,body:JSON.parse(bytes.toString('utf8')) as unknown};}catch(error){attempt.failureStage=stage;latch(error,('read-'+stage) as GuidesReadOracle['check'],[...attempts.values()].indexOf(attempt));throw error;}})()};void attempt.work.catch(()=>{});
  Object.assign(attempt,{headers,headerFailure,terminal,terminalFailure});attempts.set(request,attempt);
 };
 const responded=(response:Response)=>{const a=attempts.get(response.request()) as (Attempt&{headers:(r:Response)=>void})|undefined;if(!a)return;a.response=response;a.headers(response);};
 const finished=(request:Request)=>{const a=attempts.get(request) as (Attempt&{terminal:()=>void;headerFailure:(e:unknown)=>void})|undefined;if(!a)return;a.finished=true;if(!a.response)a.headerFailure(refuse());a.terminal();};
 const failed=(request:Request)=>{const a=attempts.get(request) as (Attempt&{terminalFailure:(e:unknown)=>void;headerFailure:(e:unknown)=>void})|undefined;if(!a)return;a.failed=true;const error=refuse();a.headerFailure(error);a.terminalFailure(error);};
 page.on('request',started);page.on('response',responded);page.on('requestfinished',finished);page.on('requestfailed',failed);
 async function reads(_diagnostics?:unknown):Promise<GuidesOwnerRead[]>{
  let check:GuidesReadOracle['check']='census-bound',attemptIndex:number|null=null;const diagnosticGroups=new Set<number>();try{
  let records:Attempt[],settled:PromiseSettledResult<GuidesOwnerRead>[];do{records=[...attempts.values()];settled=await Promise.allSettled(records.map(a=>a.work));}while(records.length!==attempts.size);if(overflow)throw refuse();
  check='observer-evaluation';const witnesses=await page.evaluate(({key,queries})=>{const observer=(globalThis as unknown as Record<string,{read:(q:unknown)=>unknown}>)[key];return observer?.read(queries);},{key:proofKey,queries:records.map(a=>({url:a.url.href,ordinal:a.ordinal}))});
  check='witness-array';if(!Array.isArray(witnesses)||witnesses.length!==records.length)throw refuse();const groups=new Map<number,number[]>();
  records.forEach((record,i)=>{attemptIndex=i;check='witness-shape';const w=own(witnesses[i]) as Proof;if(Object.keys(w).sort().join(',')==='aborted,found,group'){if(w.found!==true)check='witness-missing';else if(typeof w.aborted==='boolean'&&(!Number.isSafeInteger(w.group)||w.group!<1||w.group!>512))check='witness-group';}if(!w||Object.keys(w).sort().join(',')!=='aborted,found,group'||w.found!==true||typeof w.aborted!=='boolean'||!Number.isSafeInteger(w.group)||w.group!<1||w.group!>512)throw refuse();record.proof=w;diagnosticGroups.add(w.group!);const members=groups.get(w.group!)??[];members.push(i);groups.set(w.group!,members);});
  attemptIndex=null;const qualified:GuidesOwnerRead[]=[];
  for(const members of groups.values()){
   const failedMembers=members.filter(i=>settled[i].status==='rejected'||records[i].failed||!records[i].finished);
   if(failedMembers.length){attemptIndex=failedMembers[0];check=!members.every(i=>records[i].proof!.aborted)?'supersession-signal':!members.some(i=>records[i].failed)?'supersession-native-failure':failedMembers.some(i=>!records[i].failed)?'supersession-member':'supersession-read-failure';if(!members.every(i=>records[i].proof!.aborted)||!members.some(i=>records[i].failed)||failedMembers.some(i=>!records[i].failed||['status','bound','json'].includes(records[i].failureStage!)))throw (settled[failedMembers[0]] as PromiseRejectedResult).reason??refuse();for(const i of members)records[i].disposition='native-aborted';continue;}
   // Aborting a signal after a completed group never erases its positive evidence.
   for(const i of members){records[i].disposition='completed';qualified.push((settled[i] as PromiseFulfilledResult<GuidesOwnerRead>).value);}
  }
  if(options.scope==='selected-guide'||(options.scope==='public-detail'||options.scope==='public-category'))return qualified.sort((a,b)=>records.findIndex(r=>r.url===a.url)-records.findIndex(r=>r.url===b.url));
  attemptIndex=null;const opening=qualified.filter(r=>r.url.pathname==='/api/explorers/v1/categories/guides/content-snapshot'),validations=qualified.filter(r=>r.url.pathname==='/api/explorers/v1/categories/guides/content-snapshot/validate');
  check=opening.length!==2?'opening-count':'validation-count';if(opening.length!==2||validations.length!==2)throw refuse();const tokens=new Set<string>();for(const row of opening){check='opening-schema';const snapshot=ownerSnapshotSchema.parse(row.body);check='opening-token';if(tokens.has(snapshot.snapshotToken))throw refuse();tokens.add(snapshot.snapshotToken);const closing=validations.filter(v=>v.url.searchParams.get('snapshotToken')===snapshot.snapshotToken);check=closing.length!==1?'validation-match':'validation-schema';if(closing.length!==1||JSON.stringify(ownerSnapshotSchema.parse(closing[0].body))!==JSON.stringify(snapshot)){if(closing.length===1)check='validation-equality';throw refuse();}}
  check='category-token';const category=qualified.filter(r=>r.url.pathname!=='/api/explorers/v1/collections/'+options.selectedGuideId+'/guide');if(category.some(r=>!r.url.pathname.endsWith('/content-snapshot')&&!tokens.has(r.url.searchParams.get('snapshotToken')??'')))throw refuse();
  return qualified.sort((a,b)=>records.findIndex(r=>r.url===a.url)-records.findIndex(r=>r.url===b.url));
  }catch(error){latch(error,check,attemptIndex,diagnosticGroups.size);throw error;}
 }
 return Object.freeze({reads,attempts:()=>Object.freeze([...attempts.values()].map(a=>Object.freeze({url:a.url,ordinal:a.ordinal,finished:a.finished,failed:a.failed,group:a.proof?.group??null,aborted:a.proof?.aborted??false,disposition:a.disposition??null}))),async close(){try{await reads();sealed=true;}finally{page.off('request',started);page.off('response',responded);page.off('requestfinished',finished);page.off('requestfailed',failed);}}});
}
