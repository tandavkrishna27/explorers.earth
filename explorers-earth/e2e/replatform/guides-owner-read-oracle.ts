import {isProxy} from 'node:util/types';
import type {Page, Request, Response} from '@playwright/test';
import {ownerSnapshotSchema} from '../../../tunes/shared/explorersOwnerContentContract';

type Options=Readonly<{origin:string;selectedGuideId:string;scope?:'owner-content'|'selected-guide'}>;
export type GuidesOwnerRead=Readonly<{url:URL;body:unknown}>;
type Proof=Readonly<{found:boolean;group:number|null;aborted:boolean}>;
type Attempt={url:URL;ordinal:number;response?:Response;finished:boolean;failed:boolean;work:Promise<GuidesOwnerRead>;proof?:Proof;failureStage?:'headers'|'status'|'body'|'bound'|'finished'|'terminal'|'json';disposition?:'completed'|'native-aborted'};
const refuse=()=>Error('Guides original owner read proof refused');
function own(input:unknown){if(!input||typeof input!=='object'||isProxy(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw refuse();const descriptors=Object.getOwnPropertyDescriptors(input);if(Reflect.ownKeys(descriptors).some(k=>typeof k!=='string')||Object.values(descriptors).some(d=>!d.enumerable||!Object.hasOwn(d,'value')))throw refuse();return Object.fromEntries(Object.entries(descriptors).map(([k,d])=>[k,d.value]));}
const proofKey='__guidesOriginalFetchSignalProofV1';
function admitted(raw:Options):Options{
 const input=own(raw) as unknown as Options;if(!['origin,selectedGuideId','origin,scope,selectedGuideId'].includes(Object.keys(input).sort().join(','))||Object.hasOwn(input,'scope')&&!['owner-content','selected-guide'].includes(input.scope!))throw refuse();
 if(typeof input.origin!=='string'||typeof input.selectedGuideId!=='string')throw refuse();
 if(!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(input.origin)||!(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/).test(input.selectedGuideId))throw refuse();
 return Object.freeze({...input});
}
function selected(url:URL,options:Options){
 if(url.origin!==options.origin)return false;
 const base='/api/explorers/v1';
 if(url.pathname===`${base}/collections`||url.pathname===`${base}/recommendations`)return url.searchParams.get('category')==='guides';
 return [`${base}/categories/guides/content-snapshot`,`${base}/categories/guides/content-snapshot/validate`,`${base}/categories/guides/memberships`,`${base}/collections/${options.selectedGuideId}/guide`].includes(url.pathname);
}

/** Observe original signals; never replace fetch arguments or its returned Promise. */
export async function installGuidesOwnerFetchObserver(page:Page,input:Options):Promise<void>{
 const options=admitted(input);
 await page.addInitScript(({origin,selectedGuideId})=>{
  const key='__guidesOriginalFetchSignalProofV1',original=globalThis.fetch,aborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!;
  const records=new Map<string,{group:number|null;signal:AbortSignal|null}>(),ordinals=new Map<string,number>(),signals=new WeakMap<AbortSignal,number>();let groups=0,overflow=false;
  const eligible=(url:URL)=>{const base='/api/explorers/v1';return url.origin===origin&&((url.pathname===`${base}/collections`||url.pathname===`${base}/recommendations`)?url.searchParams.get('category')==='guides':[`${base}/categories/guides/content-snapshot`,`${base}/categories/guides/content-snapshot/validate`,`${base}/categories/guides/memberships`,`${base}/collections/${selectedGuideId}/guide`].includes(url.pathname));};
  Object.defineProperty(globalThis,key,{enumerable:false,configurable:false,writable:false,value:Object.freeze({read(queries:ReadonlyArray<{url:string;ordinal:number}>){
   if(overflow||queries.length>512)return queries.map(()=>({found:false,group:null,aborted:false}));
   return queries.map(query=>{const record=records.get(JSON.stringify([query.url,query.ordinal]));if(!record||record.signal===null)return {found:false,group:null,aborted:false};try{return {found:true,group:record.group,aborted:aborted.call(record.signal)===true};}catch{return {found:false,group:null,aborted:false};}});
  }})});
  globalThis.fetch=function(this:unknown,...args:Parameters<typeof fetch>):ReturnType<typeof fetch>{
   try{
    const [input,init]=args;if(typeof input==='string'&&(init===undefined||Object.getPrototypeOf(init)===Object.prototype)){
     const method=init?Object.getOwnPropertyDescriptor(init,'method'):undefined,signal=init?Object.getOwnPropertyDescriptor(init,'signal'):undefined;
     if((method===undefined||Object.hasOwn(method,'value')&&method.value==='GET')&&(!signal||Object.hasOwn(signal,'value'))){
      const url=new URL(input,location.origin);if(eligible(url)){
       const ordinal=ordinals.get(url.href)??0;ordinals.set(url.href,ordinal+1);if(records.size>=512)overflow=true;
       else{let native:AbortSignal|null=null,group:number|null=null;try{if(signal&&aborted.call(signal.value)===false){native=signal.value;group=signals.get(native!)??++groups;signals.set(native!,group!);}}catch{}
        records.set(JSON.stringify([url.href,ordinal]),{group,signal:native});}
      }
     }
    }
   }catch{/* Unknown signals never grant cancellation admission. */}
   return Reflect.apply(original,this,args);
  };
 },options);
}

/** All attempts remain owned until terminal observation; only proven aborts may be unqualified. */
export function createGuidesOwnerReadTracker(page:Page,input:Options){
 const options=admitted(input),attempts=new Map<Request,Attempt>(),ordinals=new Map<string,number>();let sealed=false,overflow=false;
 const started=(request:Request)=>{
  const url=new URL(request.url());if(request.method()!=='GET'||!selected(url,options)||options.scope==='selected-guide'&&url.pathname!=='/api/explorers/v1/collections/'+options.selectedGuideId+'/guide')return;if(sealed||attempts.size>=512){overflow=true;return;}
  const ordinal=ordinals.get(url.href)??0;ordinals.set(url.href,ordinal+1);let headers!:(response:Response)=>void,headerFailure!:(error:unknown)=>void,terminal!:()=>void,terminalFailure!:(error:unknown)=>void;
  const response=new Promise<Response>((resolve,reject)=>{headers=resolve;headerFailure=reject;}),end=new Promise<void>((resolve,reject)=>{terminal=resolve;terminalFailure=reject;});void response.catch(()=>{});void end.catch(()=>{});
  let attempt!:Attempt;attempt={url,ordinal,finished:false,failed:false,work:(async()=>{let stage:NonNullable<Attempt['failureStage']>='headers';try{const original=await response;stage='status';if(original.status()!==200)throw refuse();stage='body';const bytes=await original.body();stage='bound';if(bytes.length>4*1024*1024)throw refuse();stage='finished';if(await original.finished()!==null)throw refuse();stage='terminal';await end;stage='json';return {url,body:JSON.parse(bytes.toString('utf8')) as unknown};}catch(error){attempt.failureStage=stage;throw error;}})()};void attempt.work.catch(()=>{});
  Object.assign(attempt,{headers,headerFailure,terminal,terminalFailure});attempts.set(request,attempt);
 };
 const responded=(response:Response)=>{const a=attempts.get(response.request()) as (Attempt&{headers:(r:Response)=>void})|undefined;if(!a)return;a.response=response;a.headers(response);};
 const finished=(request:Request)=>{const a=attempts.get(request) as (Attempt&{terminal:()=>void;headerFailure:(e:unknown)=>void})|undefined;if(!a)return;a.finished=true;if(!a.response)a.headerFailure(refuse());a.terminal();};
 const failed=(request:Request)=>{const a=attempts.get(request) as (Attempt&{terminalFailure:(e:unknown)=>void;headerFailure:(e:unknown)=>void})|undefined;if(!a)return;a.failed=true;const error=refuse();a.headerFailure(error);a.terminalFailure(error);};
 page.on('request',started);page.on('response',responded);page.on('requestfinished',finished);page.on('requestfailed',failed);
 async function reads(_diagnostics?:unknown):Promise<GuidesOwnerRead[]>{
  let records:Attempt[],settled:PromiseSettledResult<GuidesOwnerRead>[];do{records=[...attempts.values()];settled=await Promise.allSettled(records.map(a=>a.work));}while(records.length!==attempts.size);if(overflow)throw refuse();
  const witnesses=await page.evaluate(({key,queries})=>{const observer=(globalThis as unknown as Record<string,{read:(q:unknown)=>unknown}>)[key];return observer?.read(queries);},{key:proofKey,queries:records.map(a=>({url:a.url.href,ordinal:a.ordinal}))});
  if(!Array.isArray(witnesses)||witnesses.length!==records.length)throw refuse();const groups=new Map<number,number[]>();
  records.forEach((record,i)=>{const w=own(witnesses[i]) as Proof;if(!w||Object.keys(w).sort().join(',')!=='aborted,found,group'||w.found!==true||typeof w.aborted!=='boolean'||!Number.isSafeInteger(w.group)||w.group!<1||w.group!>512)throw refuse();record.proof=w;const members=groups.get(w.group!)??[];members.push(i);groups.set(w.group!,members);});
  const qualified:GuidesOwnerRead[]=[];
  for(const members of groups.values()){
   const failedMembers=members.filter(i=>settled[i].status==='rejected'||records[i].failed||!records[i].finished);
   if(failedMembers.length){if(!members.every(i=>records[i].proof!.aborted)||!members.some(i=>records[i].failed)||failedMembers.some(i=>!records[i].failed||['status','bound','json'].includes(records[i].failureStage!)))throw (settled[failedMembers[0]] as PromiseRejectedResult).reason??refuse();for(const i of members)records[i].disposition='native-aborted';continue;}
   // Aborting a signal after a completed group never erases its positive evidence.
   for(const i of members){records[i].disposition='completed';qualified.push((settled[i] as PromiseFulfilledResult<GuidesOwnerRead>).value);}
  }
  if(options.scope==='selected-guide')return qualified.sort((a,b)=>records.findIndex(r=>r.url===a.url)-records.findIndex(r=>r.url===b.url));
  const opening=qualified.filter(r=>r.url.pathname==='/api/explorers/v1/categories/guides/content-snapshot'),validations=qualified.filter(r=>r.url.pathname==='/api/explorers/v1/categories/guides/content-snapshot/validate');
  if(opening.length!==2||validations.length!==2)throw refuse();const tokens=new Set<string>();for(const row of opening){const snapshot=ownerSnapshotSchema.parse(row.body);if(tokens.has(snapshot.snapshotToken))throw refuse();tokens.add(snapshot.snapshotToken);const closing=validations.filter(v=>v.url.searchParams.get('snapshotToken')===snapshot.snapshotToken);if(closing.length!==1||JSON.stringify(ownerSnapshotSchema.parse(closing[0].body))!==JSON.stringify(snapshot))throw refuse();}
  const category=qualified.filter(r=>r.url.pathname!=='/api/explorers/v1/collections/'+options.selectedGuideId+'/guide');if(category.some(r=>!r.url.pathname.endsWith('/content-snapshot')&&!tokens.has(r.url.searchParams.get('snapshotToken')??'')))throw refuse();
  return qualified.sort((a,b)=>records.findIndex(r=>r.url===a.url)-records.findIndex(r=>r.url===b.url));
 }
 return Object.freeze({reads,attempts:()=>Object.freeze([...attempts.values()].map(a=>Object.freeze({url:a.url,ordinal:a.ordinal,finished:a.finished,failed:a.failed,group:a.proof?.group??null,aborted:a.proof?.aborted??false,disposition:a.disposition??null}))),async close(){try{await reads();sealed=true;}finally{page.off('request',started);page.off('response',responded);page.off('requestfinished',finished);page.off('requestfailed',failed);}}});
}
