import {movieSearchRequestSchema,movieCandidatesSchema,movieEntityDtoSchema,resolveProviderMovieSchema,resolveManualMovieSchema} from '../../../tunes/shared/explorersMovieContract';
import {importBookCoversSchema,bookCoverImportResultSchema} from '../../../tunes/shared/explorersBookCoverContract';
import type { AccountDto, MediaDto, RevisionInput, UpdateAccountInput } from "../../../tunes/shared/explorersContract";
import {searchRequestSchema,searchPageSchema,SEARCH_PAGE_BYTES,type SearchInput} from '../../../tunes/shared/explorersSearchContract';
import useAuthStore from "../store/store";
import {categoryTopPicksInputSchema,categoryTopPicksResultSchema,commandKeySchema,topPickCategorySchema,type CategoryTopPicksInput} from '../../../tunes/shared/explorersContract';
import { ownerCollectionPageSchema, ownerRecommendationPageSchema, ownerCollectionDtoSchema, ownerRecommendationDtoSchema,
  ownerCollectionsRequestSchema, ownerRecommendationsRequestSchema, ownerMembershipPageSchema, ownerSnapshotSchema,
  type OwnerSnapshot, type OwnerMembershipDto,
  type OwnerCollectionsRequest, type OwnerRecommendationsRequest, type OwnerCollectionDto, type OwnerRecommendationDto } from '../../../tunes/shared/explorersOwnerContentContract';
import {ownerTopPicksRequestSchema,ownerTopPickPageSchema,type OwnerTopPicksRequest} from '../../../tunes/shared/explorersOwnerContentContract';
import { z } from 'zod/v3';
import { createCollectionSchema,updateCollectionSchema,createRecommendationSchema,updateRecommendationSchema,reorderCollectionSchema,collectionCoreDtoSchema,recommendationCoreDtoSchema,apiErrorSchema,contentIdSchema,type CreateCollectionInput,type UpdateCollectionInput,type CreateRecommendationInput,type UpdateRecommendationInput } from '../../../tunes/shared/explorersContract';
import { editableOwnerCollectionSchema,editableOwnerRecommendationSchema,type EditableOwnerCollection,type EditableOwnerRecommendation } from '../../../tunes/shared/explorersOwnerContentContract';
import { resolveManualEntitySchema,entityCoreDtoSchema,type ResolveManualEntityInput } from '../../../tunes/shared/explorersContract';
import {bookCandidateRequestSchema,bookCandidatesSchema,bookEntityDtoSchema,resolveProviderBookSchema,resolveManualBookSchema,replaceRecommendationEntitySchema} from '../../../tunes/shared/explorersBookContract';

export type CompleteOwnerContent<T> = Readonly<{complete:true;items:readonly T[];snapshot:string;accountId:string;generation:number}>;
const completedSets=new WeakSet<object>();
/** Individual resource completeness only. Category-wide writers require assertCompleteMyCategoryContent instead. */
export function assertCompleteOwnerContent<T>(value:CompleteOwnerContent<T>):void {
  const current=useAuthStore.getState();
  if(!value||!completedSets.has(value)||!value.complete||!current.isAuthenticated||current.generation!==value.generation||current.accountId!==value.accountId)
    throw new ExplorersApiError(409,'CONFLICT','Reload the complete owner content before saving');
}
async function ownerRead<T>(path:string,query:Record<string,unknown>,schema:z.ZodType<T>,signal?:AbortSignal,strict=false):Promise<T> {
  const initial=useAuthStore.getState(),controller=new AbortController();
  const isCurrent=()=>{const now=useAuthStore.getState();return now.isAuthenticated&&now.generation===initial.generation&&now.accountId===initial.accountId;};
  if(!initial.isAuthenticated||!initial.accountId) throw new ExplorersApiError(401,'UNAUTHENTICATED','Sign in is required');
  const stop=()=>controller.abort();
  const unsubscribe=useAuthStore.subscribe(()=>{if(!isCurrent()) stop();});
  signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted) stop();
  try {
    if(controller.signal.aborted||!isCurrent())throw new DOMException('Owner changed','AbortError');
    const params=new URLSearchParams();for(const [key,value] of Object.entries(query)) if(value!==undefined) params.set(key,String(value));
    const response=await fetch(`/api/explorers/v1${path}?${params}`,{credentials:'include',cache:'no-store',signal:controller.signal});
    const body=strict?await strictOwnerResponse(response,initial.generation):await responseBody<unknown>(response,initial.generation);
    if(controller.signal.aborted||!isCurrent()) throw new DOMException('Owner changed','AbortError');
    const parsed=schema.safeParse(body);if(!parsed.success){if(strict)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid Book response');throw parsed.error;}return parsed.data;
  } finally {unsubscribe();signal?.removeEventListener('abort',stop);}
}
async function strictOwnerResponse(response:Response,generation:number):Promise<unknown>{
 const limit=4*1024*1024;if(Number(response.headers.get('Content-Length'))>limit){await response.body?.cancel();throw new ExplorersApiError(413,'RESOURCE_TOO_LARGE','Book response exceeds the byte bound');}
 const chunks:Uint8Array[]=[];let bytes=0;const reader=response.body?.getReader();
 try{if(reader)while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>limit)throw new ExplorersApiError(413,'RESOURCE_TOO_LARGE','Book response exceeds the byte bound');chunks.push(part.value);}}finally{await reader?.cancel().catch(()=>{});reader?.releaseLock();}
 const buffer=new Uint8Array(bytes);let offset=0;for(const part of chunks){buffer.set(part,offset);offset+=part.byteLength;}
 let body:unknown;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));}catch{throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid Book response');}
 handleExpiredSession(response,generation);if(!response.ok){const failure=apiErrorSchema.safeParse(body);if(!failure.success)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid Book error');throw new ExplorersApiError(response.status,failure.data.error.code,failure.data.error.message);}return body;
}
type OwnerPage<T>={items:T[];snapshot:string;nextCursor:string|null};
async function allOwnerContent<T extends {id:string;accountId:string}>(input:Record<string,unknown>,read:(input:Record<string,unknown>,signal?:AbortSignal)=>Promise<OwnerPage<T>>,signal?:AbortSignal):Promise<CompleteOwnerContent<T>> {
  const initial=useAuthStore.getState(),items:T[]=[],ids=new Set<string>(),cursors=new Set<string>();let cursor:string|undefined,snapshot:string|undefined;
  for(let n=0;n<1000;n++) {
    if(signal?.aborted||useAuthStore.getState().generation!==initial.generation||useAuthStore.getState().accountId!==initial.accountId) throw new DOMException('Owner changed','AbortError');
    const page=await read({...input,cursor},signal);
    if(snapshot&&page.snapshot!==snapshot) throw new ExplorersApiError(409,'CONFLICT','Content changed; restart pagination');snapshot=page.snapshot;
    for(const item of page.items) {
      if(item.accountId!==initial.accountId||ids.has(item.id)) throw new ExplorersApiError(409,'CONFLICT','Invalid owner content page');
      ids.add(item.id);items.push(item);
    }
    if(page.nextCursor===null) {
      const completed=Object.freeze({complete:true as const,items:Object.freeze(items),snapshot,accountId:initial.accountId!,generation:initial.generation});
      completedSets.add(completed);assertCompleteOwnerContent(completed);return completed;
    }
    if(page.items.length===0||cursors.has(page.nextCursor)) throw new ExplorersApiError(409,'CONFLICT','Invalid continuation');
    cursors.add(page.nextCursor);cursor=page.nextCursor;
  }
  throw new ExplorersApiError(409,'CONFLICT','Owner content exceeds the complete-set read bound');
}

export class ExplorersApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

type DeepReadonly<T> = T extends readonly (infer U)[] ? readonly DeepReadonly<U>[] : T extends object ? {readonly [K in keyof T]:DeepReadonly<T[K]>} : T;
export type CompleteMyCategoryContent = DeepReadonly<{
  complete:true;category:OwnerCollectionDto['category'];status:'active'|'archived'|'all';
  accountId:string;generation:number;revision:string;snapshotToken:string;expiresAt:number;pinRevision:number|null;
  collections:OwnerCollectionDto[];recommendations:OwnerRecommendationDto[];memberships:OwnerMembershipDto[];
  topPicks?:z.infer<typeof ownerTopPickPageSchema>['items'];
}>;
const completedCategories=new WeakSet<object>();
/** Call immediately before staging/saving. The server writer must also check expected category revision under its write lock. */
export function assertCompleteMyCategoryContent(value:CompleteMyCategoryContent):void {
  const current=useAuthStore.getState();
  if(!value||!completedCategories.has(value)||!current.isAuthenticated||current.accountId!==value.accountId||current.generation!==value.generation||Date.now()>=value.expiresAt)
    throw new ExplorersApiError(409,'CONFLICT','Reload the complete category before saving');
}
/** Mutable staging data is a copy; only the observed result carries completion authority. */
export function copyMyCategoryContentForStaging(value:CompleteMyCategoryContent):{collections:OwnerCollectionDto[];recommendations:OwnerRecommendationDto[];memberships:OwnerMembershipDto[]} {
  assertCompleteMyCategoryContent(value);
  return {collections:value.collections.map(item=>({...item})),recommendations:value.recommendations.map(item=>({...item,mediaIds:[...item.mediaIds],pin:item.pin?{...item.pin}:null})),memberships:value.memberships.map(item=>({...item}))};
}
function deepFreeze<T>(value:T):DeepReadonly<T> {
  if(value!==null&&typeof value==='object') {for(const child of Object.values(value)) deepFreeze(child);Object.freeze(value);}
  return value as DeepReadonly<T>;
}

// Transport safeguards only: exceeding one rejects the entire read, never truncates domain data.
const JOINT_PAGE_BYTES=4*1024*1024,JOINT_TOTAL_BYTES=64*1024*1024,JOINT_REQUESTS=1000,JOINT_STREAM_ROWS=100000;
async function completeCategory(input:Pick<OwnerCollectionsRequest,'category'|'status'>,signal?:AbortSignal,includeTopPicks=false):Promise<CompleteMyCategoryContent> {
  if(includeTopPicks&&(!topPickCategorySchema.safeParse(input?.category).success||input?.status==='archived'))throw new ExplorersApiError(422,'INVALID_INPUT','Top-picks require an active or all catalog category');
  const query=ownerCollectionsRequestSchema.pick({category:true,status:true}).parse(input),initial=useAuthStore.getState();
  if(!initial.isAuthenticated||!initial.accountId) throw new ExplorersApiError(401,'UNAUTHENTICATED','Sign in is required');
  const controller=new AbortController(),stop=()=>controller.abort();
  const isCurrent=()=>{const now=useAuthStore.getState();return now.isAuthenticated&&now.accountId===initial.accountId&&now.generation===initial.generation;};
  const unsubscribe=useAuthStore.subscribe(()=>{if(!isCurrent()) stop();});
  signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted) stop();
  let requests=0,bytes=0,snapshot:OwnerSnapshot|undefined;
  const fail=(code:string,message:string,status=409):never=>{throw new ExplorersApiError(status,code,message);};
  const check=()=>{
    if(controller.signal.aborted||!isCurrent()) {const error=new ExplorersApiError(409,'ABORTED','Category read cancelled');error.name='AbortError';throw error;}
    if(snapshot&&Date.now()>=snapshot.expiresAt) fail('SNAPSHOT_EXPIRED','Category snapshot expired',422);
  };
  const invalid=()=>fail('INVALID_OWNER_CONTENT','Invalid category content response',422);
  const read=async<T>(path:string,params:Record<string,unknown>,schema:z.ZodType<T>):Promise<T>=>{
    check();if(++requests>JOINT_REQUESTS) fail('READ_BUDGET_EXCEEDED','Category read exceeds the request budget',413);
    const search=new URLSearchParams();for(const [key,value] of Object.entries(params)) if(value!==undefined) search.set(key,String(value));
    const response=await fetch(`/api/explorers/v1${path}?${search}`,{credentials:'include',cache:'no-store',signal:controller.signal});
    if(response.status===401) {check();handleExpiredSession(response,initial.generation);await response.body?.cancel().catch(()=>{});fail('UNAUTHENTICATED','Sign in is required',401);}
    const declared=Number(response.headers.get('Content-Length'));
    if(Number.isFinite(declared)&&(declared>JOINT_PAGE_BYTES||bytes+declared>JOINT_TOTAL_BYTES)) {await response.body?.cancel();fail('READ_BUDGET_EXCEEDED','Category response exceeds the byte budget',413);}
    const reader=response.body?.getReader();if(!reader) return invalid();
    const chunks:Uint8Array[]= [];let length=0;
    try {
      for(;;) {
        check();const chunk=await reader.read();check();if(chunk.done) break;
        length+=chunk.value.byteLength;bytes+=chunk.value.byteLength;
        if(length>JOINT_PAGE_BYTES||bytes>JOINT_TOTAL_BYTES) fail('READ_BUDGET_EXCEEDED','Category response exceeds the byte budget',413);
        chunks.push(chunk.value);
      }
    } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
    const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks) {raw.set(chunk,offset);offset+=chunk.byteLength;}
    let body:any;try {body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));} catch {return invalid();}
    if(!response.ok) {handleExpiredSession(response,initial.generation);fail(typeof body?.error?.code==='string'?body.error.code:'UNAVAILABLE',typeof body?.error?.message==='string'?body.error.message:'Request failed',response.status);}
    const parsed=schema.safeParse(body);if(!parsed.success) return invalid();check();return parsed.data;
  };
  try {
    snapshot=await read(`/categories/${query.category}/content-snapshot`,{},ownerSnapshotSchema);check();
    const cursors=new Set<string>();
    const collect=async<T>(path:string,params:Record<string,unknown>,schema:z.ZodType<{items:T[];snapshot:string;snapshotToken:string;expiresAt:number;nextCursor:string|null}>):Promise<T[]>=>{
      const items:T[]=[];let cursor:string|undefined;
      for(;;) {
        const page=await read(path,{...params,limit:24,cursor,snapshotToken:snapshot!.snapshotToken},schema);
        if(page.items.length>24||page.snapshot!==snapshot!.revision||page.snapshotToken!==snapshot!.snapshotToken||page.expiresAt!==snapshot!.expiresAt) return invalid();
        if(items.length+page.items.length>JOINT_STREAM_ROWS) fail('READ_BUDGET_EXCEEDED','Category stream exceeds the row budget',413);
        items.push(...page.items);
        if(page.nextCursor===null) return items;
        if(!page.items.length||cursors.has(page.nextCursor)) return invalid();
        cursors.add(page.nextCursor);cursor=page.nextCursor;
      }
    };
    // All parents are needed even when recommendation status is narrower.
    const collections=await collect('/collections',{category:query.category,status:'all'},ownerCollectionPageSchema);
    const recommendations=await collect('/recommendations',{category:query.category,status:query.status},ownerRecommendationPageSchema);
    const memberships=await collect(`/categories/${query.category}/memberships`,{collectionStatus:'all',recommendationStatus:query.status},ownerMembershipPageSchema);
    const parents=new Map<string,OwnerCollectionDto>(),children=new Map<string,OwnerRecommendationDto>();
    for(const item of collections) {if(item.accountId!==initial.accountId||item.category!==query.category||parents.has(item.id)) return invalid();parents.set(item.id,item);}
    for(const item of recommendations) {
      if(item.accountId!==initial.accountId||item.category!==query.category||children.has(item.id)||(query.status!=='all'&&item.archived!==(query.status==='archived'))) return invalid();children.set(item.id,item);
    }
    const tuples=new Set<string>();
    for(const item of memberships) {
      const parent=parents.get(item.collectionId),child=children.get(item.recommendationId),key=`${item.recommendationId}:${item.collectionId}`;
      if(!parent||!child||tuples.has(key)||parent.revision!==item.collectionRevision||parent.archived!==item.collectionArchived||child.archived!==item.recommendationArchived) return invalid();tuples.add(key);
    }
    for(const child of recommendations) if(child.pin) {
      const parent=parents.get(child.pin.collectionId);
      if(child.archived||!parent||parent.archived||!tuples.has(`${child.id}:${parent.id}`)||child.pin.revision!==snapshot.pinRevision) return invalid();
    }
    let topPicks:z.infer<typeof ownerTopPickPageSchema>['items']|undefined;
    if(includeTopPicks) {
      if(query.status==='archived'||!topPickCategorySchema.safeParse(query.category).success) fail('INVALID_INPUT','Top-picks require an active or all catalog category',422);
      topPicks=await collect(`/categories/${query.category}/top-picks`,{},ownerTopPickPageSchema.superRefine((page,ctx)=>{if(page.pinRevision!==snapshot!.pinRevision)ctx.addIssue({code:'custom',message:'Pin revision changed'});}));
      const ids=new Set<string>();
      for(const [n,pin] of topPicks.entries()) {
        const child=children.get(pin.recommendationId),previous=topPicks[n-1];
        if(ids.has(pin.recommendationId)||!child?.pin||child.pin.collectionId!==pin.collectionId||child.pin.position!==pin.position||previous&&(pin.position<previous.position||pin.position===previous.position&&pin.recommendationId<=previous.recommendationId)) return invalid();ids.add(pin.recommendationId);
      }
      if(recommendations.filter(x=>x.pin!==null).length!==topPicks.length)return invalid();
    }
    const validated=await read(`/categories/${query.category}/content-snapshot/validate`,{snapshotToken:snapshot.snapshotToken},ownerSnapshotSchema);
    if(validated.snapshotToken!==snapshot.snapshotToken||validated.revision!==snapshot.revision||validated.expiresAt!==snapshot.expiresAt||validated.pinRevision!==snapshot.pinRevision) return invalid();check();
    const complete=deepFreeze({complete:true as const,category:query.category,status:query.status,accountId:initial.accountId,generation:initial.generation,...snapshot,collections,recommendations,memberships,...(includeTopPicks?{topPicks}: {})});
    completedCategories.add(complete);assertCompleteMyCategoryContent(complete);return complete;
  } catch(error) {
    if(error instanceof ExplorersApiError) throw error;
    check();throw new ExplorersApiError(503,'UNAVAILABLE','Unable to read complete category content');
  } finally {unsubscribe();signal?.removeEventListener('abort',stop);}
}

function handleExpiredSession(response: Response, generation: number) {
  if (response.status !== 401) return;
  const current = useAuthStore.getState();
  if (current.generation === generation && current.isAuthenticated) current.logout();
}

async function responseBody<T>(response: Response, generation: number): Promise<T> {
  handleExpiredSession(response, generation);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ExplorersApiError(response.status, body?.error?.code ?? "UNAVAILABLE",
    body?.error?.message ?? "Request failed");
  return body as T;
}

async function writeTopPicks(observed:CompleteMyCategoryContent,orderedPins:CategoryTopPicksInput['orderedPins'],key:string,replace:boolean,signal?:AbortSignal) {
  assertCompleteMyCategoryContent(observed);
  if(observed.status==='archived') throw new ExplorersApiError(409,'CONFLICT','Reload active or all category content before saving');
  const category=topPickCategorySchema.safeParse(observed.category),parsed=categoryTopPicksInputSchema.safeParse({orderedPins,expectedCategoryRevision:observed.revision,expectedPinRevision:observed.pinRevision});
  if(!category.success||!parsed.success||!commandKeySchema.safeParse(key).success) throw new ExplorersApiError(422,'INVALID_INPUT','Invalid top-pick command');
  for(const pin of parsed.data.orderedPins) {
    const child=observed.recommendations.find(x=>x.id===pin.recommendationId),parent=observed.collections.find(x=>x.id===pin.collectionId);
    if(!child||child.archived||!parent||parent.archived||!observed.memberships.some(x=>x.recommendationId===pin.recommendationId&&x.collectionId===pin.collectionId)) throw new ExplorersApiError(422,'INVALID_INPUT','Pin must select a current observed membership');
  }
  const controller=new AbortController(),stop=()=>controller.abort();
  const current=()=>{const state=useAuthStore.getState();return state.isAuthenticated&&state.generation===observed.generation&&state.accountId===observed.accountId;};
  const unsubscribe=useAuthStore.subscribe(()=>{if(!current())stop();});signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
  try {
    assertCompleteMyCategoryContent(observed);
    const response=await fetch(`/api/explorers/v1/categories/${category.data}/top-picks${replace?'':'/order'}`,{method:replace?'PUT':'PATCH',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(parsed.data),signal:controller.signal});
    const body=await responseBody<{topPicks:unknown}>(response,observed.generation);
    if(!current()||controller.signal.aborted) throw new ExplorersApiError(409,'CONFLICT','Owner changed before command completion');
    // A command reply cannot establish a new complete category observation.
    completedCategories.delete(observed);
    const result=categoryTopPicksResultSchema.safeParse(body?.topPicks);
    if(!result.success||result.data.operation!==(replace?'replace':'upsert-order')||result.data.pins.length!==parsed.data.orderedPins.length||result.data.pins.some((pin,n)=>pin.position!==n||pin.recommendationId!==parsed.data.orderedPins[n].recommendationId||pin.collectionId!==parsed.data.orderedPins[n].collectionId)) throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid top-pick command response');
    return deepFreeze(result.data);
  } catch(error) {
    if(error instanceof ExplorersApiError) {if(error.status===409)completedCategories.delete(observed);throw error;}
    if(controller.signal.aborted) throw new ExplorersApiError(409,'CONFLICT','Top-pick command cancelled');
    throw new ExplorersApiError(503,'UNAVAILABLE','Unable to save top-picks');
  } finally {unsubscribe();signal?.removeEventListener('abort',stop);}
}

export type OwnerDetailObservation<T> = Readonly<{kind:'collection'|'recommendation';accountId:string;generation:number;observedAt:number;resourceId:string;resourceRevision:number;categoryRevision:string;detail:T}>;
export type CollectionObservation=OwnerDetailObservation<EditableOwnerCollection>;
export type RecommendationObservation=OwnerDetailObservation<EditableOwnerRecommendation>;
const issuedDetails=new WeakSet<object>();
export function assertOwnerDetailObservation(value:OwnerDetailObservation<EditableOwnerCollection|EditableOwnerRecommendation>,kind?:'collection'|'recommendation'):void {
 const state=useAuthStore.getState();
 if(!value||!issuedDetails.has(value)||kind&&value.kind!==kind||!state.isAuthenticated||state.accountId!==value.accountId||state.generation!==value.generation||Date.now()-value.observedAt>=600000||value.detail.archived)throw new ExplorersApiError(409,'CONFLICT','Reload the owner detail before saving');
}
export function copyOwnerDetailForStaging<T>(value:OwnerDetailObservation<T>):T {
 if(!issuedDetails.has(value))throw new ExplorersApiError(409,'CONFLICT','Reload the owner detail before staging');
 return structuredClone(value.detail);
}
async function editableDetail<K extends 'collection'|'recommendation'>(kind:K,id:string,signal?:AbortSignal):Promise<K extends 'collection'?CollectionObservation:RecommendationObservation> {
 if(!contentIdSchema.safeParse(id).success)throw new ExplorersApiError(422,'INVALID_INPUT','Invalid resource ID');
 const state=useAuthStore.getState();
 try {
  const schema=kind==='collection'?z.object({collection:editableOwnerCollectionSchema}).strict():z.object({recommendation:editableOwnerRecommendationSchema}).strict();
  const body=await ownerRead(`/`+(kind==='collection'?'collections':'recommendations')+`/${encodeURIComponent(id)}/editable`,{status:'active'},schema as z.ZodType<any>,signal);
  const detail=body[kind] as EditableOwnerCollection|EditableOwnerRecommendation,current=useAuthStore.getState();
  if(!current.isAuthenticated||current.generation!==state.generation||current.accountId!==state.accountId||detail.accountId!==state.accountId||detail.id!==id.toLowerCase()||detail.archived)throw new ExplorersApiError(409,'CONFLICT','Invalid editable owner detail');
  const observed=deepFreeze({kind,accountId:detail.accountId,generation:state.generation,observedAt:Date.now(),resourceId:detail.id,resourceRevision:detail.revision,categoryRevision:detail.categoryRevision,detail});issuedDetails.add(observed);
  return observed as any;
 } catch(error) {
  if(error instanceof ExplorersApiError)throw error;
  if(error instanceof Error&&error.name==='AbortError')throw new ExplorersApiError(409,'ABORTED','Owner detail read cancelled');
  throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Unable to read editable owner detail');
 }
}
function commandInput<T>(schema:z.ZodType<T,any,any>,input:unknown):T {
 const result=schema.safeParse(input);if(!result.success)throw new ExplorersApiError(422,'INVALID_INPUT','Invalid content command');return result.data;
}
async function contentCommand<T extends {id:string}>(path:string,method:string,input:unknown,key:string,name:string,schema:z.ZodType<T>,signal?:AbortSignal,observed?:CollectionObservation|RecommendationObservation|CompleteMyCategoryContent,expectedId?:string,expectedRevision?:number):Promise<DeepReadonly<T>> {
 commandInput(commandKeySchema,key);
 const state=useAuthStore.getState(),controller=new AbortController(),stop=()=>controller.abort();
 if(!state.isAuthenticated||!state.accountId)throw new ExplorersApiError(401,'UNAUTHENTICATED','Sign in is required');
 const current=()=>{const now=useAuthStore.getState();return now.isAuthenticated&&now.accountId===state.accountId&&now.generation===state.generation;};
 const revoke=()=>{if(observed){issuedDetails.delete(observed);completedCategories.delete(observed);}};
 const body=JSON.stringify(input);if(new TextEncoder().encode(body).byteLength>1024*1024)throw new ExplorersApiError(413,'RESOURCE_TOO_LARGE','Content command exceeds the request byte bound');
 const unsubscribe=useAuthStore.subscribe(()=>{if(!current())stop();});signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
 try {
  if(controller.signal.aborted||!current())throw new ExplorersApiError(409,'ABORTED','Content command cancelled');
  const response=await fetch(`/api/explorers/v1${path}`,{method,credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json','Idempotency-Key':key},body,signal:controller.signal});
  const text=await response.text();
  if(controller.signal.aborted||!current())throw new ExplorersApiError(409,'CONFLICT','Owner changed before command completion');
  handleExpiredSession(response,state.generation);
  if(new TextEncoder().encode(text).byteLength>4*1024*1024)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Command response exceeds the byte bound');
  let raw:unknown;try {raw=JSON.parse(text);}catch{throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid command response');}
  if(!response.ok) {
   const failure=apiErrorSchema.safeParse(raw);if(!failure.success)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid command error');
   if([401,403,404,409].includes(response.status))revoke();
   throw new ExplorersApiError(response.status,failure.data.error.code,failure.data.error.message);
  }
  revoke();
  const result=z.object({[name]:schema}).strict().safeParse(raw);if(!result.success)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid command response');
  const dto=result.data[name] as T&{accountId?:string;revision?:number;category?:string;entityId?:string};
  const payload=input as {category?:string;entityId?:string};
  const detail=observed&&'detail' in observed?observed.detail:undefined;
  const expectedCategory=payload.category??detail?.category??(observed&&'category' in observed?observed.category:undefined);
  const expectedEntity=payload.entityId??(detail&&'entityId' in detail?detail.entityId:undefined);
  if(expectedId&&dto.id!==expectedId||dto.accountId!==undefined&&dto.accountId!==state.accountId||expectedRevision!==undefined&&dto.revision!==expectedRevision)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid command resource');
  if(dto.category!==undefined&&dto.category!==expectedCategory||dto.entityId!==undefined&&dto.entityId!==expectedEntity)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid command category or catalog identity');
  return deepFreeze(dto);
 } catch(error) {
  if(controller.signal.aborted||!current()){revoke();throw new ExplorersApiError(409,'CONFLICT','Content command cancelled or owner changed');}
  if(error instanceof ExplorersApiError)throw error;
  throw new ExplorersApiError(503,'UNAVAILABLE','Unable to save content');
 } finally {unsubscribe();signal?.removeEventListener('abort',stop);}
}
const archivedResult=z.object({id:contentIdSchema,archived:z.literal(true)}).strict();
export const explorersApiClient = {
  async searchMovieCandidates(input:z.input<typeof movieSearchRequestSchema>,signal?:AbortSignal){
   const parsed=commandInput(movieSearchRequestSchema,input);const result=await ownerRead('/catalog/movies',parsed,movieCandidatesSchema,signal,true);if(parsed.mediaType&&result.items.some(x=>x.externalKind!==parsed.mediaType))throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid Movie candidate kind');return result;
  },
  async resolveMovieEntity(input:z.input<typeof resolveProviderMovieSchema>|z.input<typeof resolveManualMovieSchema>,key:string,signal?:AbortSignal){
   const body=commandInput(z.union([resolveProviderMovieSchema,resolveManualMovieSchema]),input);const entity=await contentCommand('/entities/resolve','POST',body,key,'entity',movieEntityDtoSchema,signal);
   if(body.kind==='provider'?(entity.origin!=='provider'||entity.provenance?.externalKind!==body.externalKind||entity.provenance?.externalId!==body.externalId):(entity.origin!=='manual'||entity.provenance!==null||entity.title!==body.details.title||entity.details.mediaType!==body.details.mediaType))throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid resolved Movie identity');return entity;
  },
  async searchBookCandidates(input:{query:string;limit?:number;cursor?:string},signal?:AbortSignal){
   const parsed=commandInput(bookCandidateRequestSchema,input);return ownerRead('/catalog/books',parsed,bookCandidatesSchema,signal,true);
  },
  async resolveBookEntity(input:z.input<typeof resolveProviderBookSchema>|z.input<typeof resolveManualBookSchema>,key:string,signal?:AbortSignal){
   const body=commandInput(z.union([resolveProviderBookSchema,resolveManualBookSchema]),input);
   const schema=body.kind==='manual'&&Object.keys(body.details).length===1?entityCoreDtoSchema:bookEntityDtoSchema;
   const entity=await contentCommand('/entities/resolve','POST',body,key,'entity',schema as z.ZodType<any>,signal);
   if(entity.kind!=='book'||body.kind==='provider'&&entity.provenance?.externalId!==body.externalId||body.kind==='manual'&&entity.title!==body.details.title)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid resolved Book identity');
   return entity;
  },
  async importBookCovers(observed:RecommendationObservation,key:string,signal?:AbortSignal){
   assertOwnerDetailObservation(observed,'recommendation');
   if(observed.detail.category!=='books')throw new ExplorersApiError(422,'INVALID_INPUT','Book cover import requires Books');
   const body=commandInput(importBookCoversSchema,{expectedRevision:observed.resourceRevision});
   return contentCommand(`/recommendations/${observed.resourceId}/book-covers`,'POST',body,key,'coverImport',bookCoverImportResultSchema,signal,observed,observed.resourceId,observed.resourceRevision+1);
  },
  async replaceRecommendationEntity(observed:RecommendationObservation,entityId:string,key:string,signal?:AbortSignal){
   assertOwnerDetailObservation(observed,'recommendation');const body=commandInput(replaceRecommendationEntitySchema,{entityId,expectedRevision:observed.resourceRevision});
   return contentCommand(`/recommendations/${observed.resourceId}/entity`,'POST',body,key,'recommendation',recommendationCoreDtoSchema,signal,observed,observed.resourceId,observed.resourceRevision+1);
  },
  async searchRecommendations(raw:SearchInput,signal?:AbortSignal) {
   const input=searchRequestSchema.parse(raw),initial=useAuthStore.getState(),controller=new AbortController();
   const current=()=>input.scope==='public'||(useAuthStore.getState().isAuthenticated&&useAuthStore.getState().generation===initial.generation&&useAuthStore.getState().accountId===initial.accountId);
   if(input.scope==='owner'&&(!initial.isAuthenticated||!initial.accountId))throw new ExplorersApiError(401,'UNAUTHENTICATED','Sign in is required');
   const stop=()=>controller.abort(),check=()=>{if(controller.signal.aborted||!current())throw new DOMException('Search cancelled','AbortError');};
   const unsubscribe=input.scope==='owner'?useAuthStore.subscribe(()=>{if(!current())stop();}):()=>{};
   signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
   try{
    check();const params=new URLSearchParams();for(const [key,value] of Object.entries(input))if(key!=='scope'&&value!==undefined)params.set(key,Array.isArray(value)?value.join(','):String(value));
    const response=await fetch(`/api/explorers/v1${input.scope==='public'?'/public':''}/recommendations/search?${params}`,{credentials:input.scope==='public'?'omit':'include',cache:'no-store',signal:controller.signal});check();
    const declared=Number(response.headers.get('Content-Length'));if(Number.isFinite(declared)&&declared>SEARCH_PAGE_BYTES){await response.body?.cancel();throw new ExplorersApiError(413,'RESOURCE_TOO_LARGE','Search response exceeds byte bound');}
    let bytes=0;const chunks:Uint8Array[]=[],reader=response.body?.getReader();
    try{if(reader)while(true){check();const part=await reader.read();check();if(part.done)break;bytes+=part.value.byteLength;if(bytes>SEARCH_PAGE_BYTES)throw new ExplorersApiError(413,'RESOURCE_TOO_LARGE','Search response exceeds byte bound');chunks.push(part.value);}}finally{await reader?.cancel().catch(()=>{});reader?.releaseLock();}
    check();const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
    const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
    if(input.scope==='owner')handleExpiredSession(response,initial.generation);
    if(!response.ok)throw new ExplorersApiError(response.status,body?.error?.code??'UNAVAILABLE',body?.error?.message??'Search failed');
    const page=searchPageSchema.parse(body);if(page.scope!==input.scope||page.items.length>input.limit||(page.scope==='owner'&&page.items.some(v=>v.accountId!==initial.accountId||v.category!==input.category)))throw new ExplorersApiError(503,'UNAVAILABLE','Invalid search page');
    return page;
   }finally{unsubscribe();signal?.removeEventListener('abort',stop);}
  },
  async resolveManualEntity(input:ResolveManualEntityInput,key:string,signal?:AbortSignal) {
   const body=commandInput(resolveManualEntitySchema,input);
   const entity=await contentCommand('/entities/resolve','POST',body,key,'entity',entityCoreDtoSchema,signal);
   const kinds={books:'book',movies:'movie',games:'game',apps:'app',products:'product',people:'person'} as const;
   if(entity.kind!==kinds[body.category]||entity.title!==body.details.title)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid resolved catalog identity');
   return entity;
  },
  getMyEditableCollection:(id:string,signal?:AbortSignal)=>editableDetail('collection',id,signal),
  getMyEditableRecommendation:(id:string,signal?:AbortSignal)=>editableDetail('recommendation',id,signal),
  async createMyCollection(input:CreateCollectionInput,key:string,signal?:AbortSignal) {
   const body=commandInput(createCollectionSchema,input);return contentCommand('/collections','POST',body,key,'collection',collectionCoreDtoSchema,signal,undefined,undefined,1);
  },
  async updateMyCollection(observed:CollectionObservation,patch:Omit<UpdateCollectionInput,'expectedRevision'>,key:string,signal?:AbortSignal) {
   assertOwnerDetailObservation(observed,'collection');const editable=commandInput(updateCollectionSchema.innerType().omit({expectedRevision:true}).strict(),patch);
   const body=commandInput(updateCollectionSchema,{...editable,expectedRevision:observed.resourceRevision});return contentCommand(`/collections/${observed.resourceId}`,'PATCH',body,key,'collection',collectionCoreDtoSchema,signal,observed,observed.resourceId,observed.resourceRevision+1);
  },
  async archiveMyCollection(observed:CollectionObservation,key:string,signal?:AbortSignal) {
   assertOwnerDetailObservation(observed,'collection');return contentCommand(`/collections/${observed.resourceId}`,'DELETE',{expectedRevision:observed.resourceRevision},key,'collection',archivedResult,signal,observed,observed.resourceId);
  },
  async createMyRecommendation(parent:CollectionObservation,input:Omit<CreateRecommendationInput,'collectionId'|'expectedCollectionRevision'|'category'>,key:string,signal?:AbortSignal) {
   assertOwnerDetailObservation(parent,'collection');const editable=commandInput(createRecommendationSchema.innerType().omit({collectionId:true,expectedCollectionRevision:true,category:true}).strict(),input);
   const body=commandInput(createRecommendationSchema,{...editable,collectionId:parent.resourceId,category:parent.detail.category,expectedCollectionRevision:parent.resourceRevision});return contentCommand('/recommendations','POST',body,key,'recommendation',recommendationCoreDtoSchema,signal,parent,undefined,1);
  },
  async updateMyRecommendation(observed:RecommendationObservation,patch:Omit<UpdateRecommendationInput,'expectedRevision'>,key:string,signal?:AbortSignal) {
   assertOwnerDetailObservation(observed,'recommendation');const editable=commandInput(updateRecommendationSchema.innerType().omit({expectedRevision:true}).strict(),patch);
   const body=commandInput(updateRecommendationSchema,{...editable,expectedRevision:observed.resourceRevision});return contentCommand(`/recommendations/${observed.resourceId}`,'PATCH',body,key,'recommendation',recommendationCoreDtoSchema,signal,observed,observed.resourceId,observed.resourceRevision+1);
  },
  async archiveMyRecommendation(observed:RecommendationObservation,key:string,signal?:AbortSignal) {
   assertOwnerDetailObservation(observed,'recommendation');return contentCommand(`/recommendations/${observed.resourceId}`,'DELETE',{expectedRevision:observed.resourceRevision},key,'recommendation',archivedResult,signal,observed,observed.resourceId);
  },
  async reorderMyCollection(observed:CompleteMyCategoryContent,collectionId:string,orderedRecommendationIds:string[],key:string,signal?:AbortSignal) {
   assertCompleteMyCategoryContent(observed);const parent=observed.collections.find(x=>x.id===collectionId&&!x.archived);
   const members=observed.memberships.filter(x=>x.collectionId===collectionId&&!x.collectionArchived&&!x.recommendationArchived).map(x=>x.recommendationId);
   if(observed.status==='archived'||!parent||orderedRecommendationIds.length!==members.length||new Set(orderedRecommendationIds).size!==members.length||orderedRecommendationIds.some(id=>!members.includes(id)))throw new ExplorersApiError(422,'INVALID_INPUT','Order must contain the exact active observed membership');
   const body=commandInput(reorderCollectionSchema,{expectedRevision:parent.revision,orderedRecommendationIds});return contentCommand(`/collections/${parent.id}/order`,'PATCH',body,key,'collection',collectionCoreDtoSchema,signal,observed,parent.id,parent.revision+1);
  },
  getCompleteMyCategoryTopPicks:(input:Pick<OwnerCollectionsRequest,'category'|'status'>,signal?:AbortSignal)=>completeCategory(input,signal,true),
  async getMyCategoryTopPicks(input:OwnerTopPicksRequest,signal?:AbortSignal) {
   try {
    const query=ownerTopPicksRequestSchema.safeParse(input);if(!query.success)throw new ExplorersApiError(422,'INVALID_INPUT','Invalid top-pick read');
    const {category,...params}=query.data,page=await ownerRead(`/categories/${category}/top-picks`,params,ownerTopPickPageSchema,signal);
    if(page.items.length>query.data.limit||page.expiresAt<=Date.now()||page.items.length>0&&page.pinRevision===null||query.data.snapshotToken&&page.snapshotToken!==query.data.snapshotToken||new Set(page.items.map(x=>x.recommendationId)).size!==page.items.length||page.items.some((x,n)=>n>0&&(x.position<page.items[n-1].position||x.position===page.items[n-1].position&&x.recommendationId<=page.items[n-1].recommendationId))) throw new ExplorersApiError(409,'CONFLICT','Invalid top-pick page');return deepFreeze(page);
   } catch(error) {
     if(error instanceof ExplorersApiError)throw error;
     if(error instanceof z.ZodError)throw new ExplorersApiError(422,'INVALID_OWNER_CONTENT','Invalid top-pick page');
     if(error instanceof Error&&error.name==='AbortError'){const aborted=new ExplorersApiError(409,'ABORTED','Top-pick read cancelled');aborted.name='AbortError';throw aborted;}
     throw new ExplorersApiError(503,'UNAVAILABLE','Unable to read top-picks');
   }
  },
  setMyCategoryTopPicks:(observed:CompleteMyCategoryContent,pins:CategoryTopPicksInput['orderedPins'],key:string,signal?:AbortSignal)=>writeTopPicks(observed,pins,key,true,signal),
  upsertMyCategoryTopPickOrder:(observed:CompleteMyCategoryContent,pins:CategoryTopPicksInput['orderedPins'],key:string,signal?:AbortSignal)=>writeTopPicks(observed,pins,key,false,signal),
  getCompleteMyCategoryContent:completeCategory,
  async getMyCollections(input:OwnerCollectionsRequest,signal?:AbortSignal) {
    const query=ownerCollectionsRequestSchema.parse(input),page=await ownerRead('/collections',query,ownerCollectionPageSchema,signal);
    if(page.items.length>query.limit||page.items.some(x=>x.accountId!==useAuthStore.getState().accountId||x.category!==query.category||(query.status!=='all'&&x.archived!==(query.status==='archived')))) throw new ExplorersApiError(409,'CONFLICT','Invalid owner content page');return page;
  },
  async getMyRecommendations(input:OwnerRecommendationsRequest,signal?:AbortSignal) {
    const query=ownerRecommendationsRequestSchema.parse(input),page=await ownerRead('/recommendations',query,ownerRecommendationPageSchema,signal);
    if(page.items.length>query.limit||page.items.some(x=>x.accountId!==useAuthStore.getState().accountId||x.category!==query.category||(query.status!=='all'&&x.archived!==(query.status==='archived')))) throw new ExplorersApiError(409,'CONFLICT','Invalid owner content page');return page;
  },
  async getAllMyCollections(input:Omit<OwnerCollectionsRequest,'cursor'>,signal?:AbortSignal):Promise<CompleteOwnerContent<OwnerCollectionDto>> {
    return allOwnerContent(ownerCollectionsRequestSchema.omit({cursor:true}).parse(input),(q,s)=>explorersApiClient.getMyCollections(q as OwnerCollectionsRequest,s),signal);
  },
  async getAllMyRecommendations(input:Omit<OwnerRecommendationsRequest,'cursor'>,signal?:AbortSignal):Promise<CompleteOwnerContent<OwnerRecommendationDto>> {
    return allOwnerContent(ownerRecommendationsRequestSchema.omit({cursor:true}).parse(input),(q,s)=>explorersApiClient.getMyRecommendations(q as OwnerRecommendationsRequest,s),signal);
  },
  async getMyCollection(id:string,status:'active'|'archived'='active',signal?:AbortSignal) {
    const result=await ownerRead(`/collections/${encodeURIComponent(id)}`,{status},z.object({collection:ownerCollectionDtoSchema}).strict(),signal);
    if(result.collection.accountId!==useAuthStore.getState().accountId||result.collection.id!==id||result.collection.archived!==(status==='archived')) throw new ExplorersApiError(409,'CONFLICT','Invalid owner content detail');
    return result.collection;
  },
  async getMyRecommendation(id:string,status:'active'|'archived'='active',signal?:AbortSignal) {
    const result=await ownerRead(`/recommendations/${encodeURIComponent(id)}`,{status},z.object({recommendation:ownerRecommendationDtoSchema}).strict(),signal);
    if(result.recommendation.accountId!==useAuthStore.getState().accountId||result.recommendation.id!==id||result.recommendation.archived!==(status==='archived')) throw new ExplorersApiError(409,'CONFLICT','Invalid owner content detail');
    return result.recommendation;
  },
  async getMyProfile(signal?: AbortSignal): Promise<AccountDto> {
    const generation = useAuthStore.getState().generation;
    const response = await fetch("/api/explorers/v1/me", { credentials: "include", cache: "no-store", signal });
    return (await responseBody<{ account: AccountDto }>(response, generation)).account;
  },
  async updateAccount(input: UpdateAccountInput & RevisionInput, signal?: AbortSignal): Promise<AccountDto> {
    const generation = useAuthStore.getState().generation;
    const response = await fetch("/api/explorers/v1/account", { method: "PATCH", credentials: "include", signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    return (await responseBody<{ account: AccountDto }>(response, generation)).account;
  },
  async createMedia(file: File, purpose: "profile" | "background" | "feed" | "recommendation", signal?: AbortSignal): Promise<MediaDto> {
    const generation = useAuthStore.getState().generation;
    const response = await fetch("/api/explorers/v1/media", { method: "POST", credentials: "include", signal,
      headers: { "Content-Type": file.type, "X-Media-Purpose": purpose, "X-File-Name": file.name }, body: file });
    return (await responseBody<{ media: MediaDto }>(response, generation)).media;
  },
  async deleteMedia(id: string, signal?: AbortSignal): Promise<void> {
    const generation = useAuthStore.getState().generation;
    const response = await fetch(`/api/explorers/v1/media/${encodeURIComponent(id)}`, {
      method: "DELETE", credentials: "include", signal,
    });
    if (!response.ok) await responseBody<never>(response, generation);
  },
};
