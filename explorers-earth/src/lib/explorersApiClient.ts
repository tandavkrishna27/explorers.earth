import { mediaUploadProblem, safeMediaFileName } from "../utils/mediaUploadCheck";
import {announceRevisionConflict} from './revisionConflict';
import {changedSinceViewed,isViewObservation,markCommandSent,settleViewedAccount,settleViewedRevision,viewedAccountRevision,wasCommandSent} from './viewedRevisions';
import {gameCatalogRequestSchema,gameMembershipCommandSchema,gameMembershipResultSchema} from '../../../tunes/shared/explorersGameOwnerContract';
import {gameCandidatePageSchema,type GameCandidatePage} from '../../../tunes/shared/explorersGameContract';
import {resolveProviderGameSchema} from '../../../tunes/shared/explorersContract';
import {movieGenreTermsResultSchema,importMovieMediaRequestSchema,movieMediaImportResultSchema} from '../../../tunes/shared/explorersMovieMediaContract';
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
import {ownerTopPicksRequestSchema,ownerTopPickPageSchema,ownerContentSummarySchema,type OwnerTopPicksRequest,type OwnerContentSummary} from '../../../tunes/shared/explorersOwnerContentContract';
import { z } from 'zod/v3';
import {taxonomyCatalogQuerySchema,taxonomyCatalogPageSchema,type TaxonomyCatalogPage,taxonomyCatalogCategorySchema} from '../../../tunes/shared/explorersTaxonomyContract';
type TaxonomyCatalogCategory=z.infer<typeof taxonomyCatalogCategorySchema>;
import { createCollectionSchema,createCollectionResultSchema,type CreateCollectionResult,updateCollectionSchema,createRecommendationObjectSchema,createRecommendationSchema,updateRecommendationSchema,reorderCollectionSchema,collectionCoreDtoSchema,contentRevisionSchema,recommendationCoreDtoSchema,apiErrorSchema,contentIdSchema,type CreateCollectionInput,type UpdateCollectionInput,type CreateRecommendationInput,type UpdateRecommendationInput } from '../../../tunes/shared/explorersContract';
import { editableOwnerCollectionSchema,editableOwnerRecommendationSchema,type EditableOwnerCollection,type EditableOwnerRecommendation } from '../../../tunes/shared/explorersOwnerContentContract';
import { resolveManualEntitySchema,resolveManualGameSchema,entityCoreDtoSchema,type ResolveManualEntityInput } from '../../../tunes/shared/explorersContract';
import {bookCandidateRequestSchema,bookCandidatesSchema,bookEntityDtoSchema,resolveProviderBookSchema,resolveManualBookSchema,replaceRecommendationEntitySchema} from '../../../tunes/shared/explorersBookContract';
import {attachLocationLinkSchema,detachLocationLinkSchema} from '../../../tunes/shared/explorersPlaceLinkContract';
import {appEntityDtoSchema,resolveManualAppSchema} from '../../../tunes/shared/explorersAppContract';
import {productEntityDtoSchema,resolveManualProductSchema} from '../../../tunes/shared/explorersProductContract';
import {personEntityDtoSchema,resolveManualPersonSchema} from '../../../tunes/shared/explorersPersonContract';
import {placeEntityDtoSchema,resolveManualPlaceSchema} from '../../../tunes/shared/explorersPlaceContract';
import {guideAggregateDtoSchema,attachGuideCoverSchema,createGuideSectionSchema,reorderGuideSectionsSchema,
 writeGuideDetailsSchema,writeGuideSectionSchema,guideRevisionSchema} from '../../../tunes/shared/explorersGuideContract';

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
  // `status` is an HTTP status where one was received, but it is ALSO client-minted
  // vocabulary where none was. One client-minted value is load-bearing and is emitted by
  // production code, not only by tests: 499 ('client closed request') means the command
  // reached the server and the server REPLIED, and only then did this client lose owner or
  // route authority - so the outcome is UNKNOWN-but-probably-applied and the command must
  // stay retryable/undiscardable (see appEnrichmentClient's current()). A future handler must not
  // bucket 499 with transport failures or with authoritative 4xx rejections.
  // `details` carries the typed extras of a few refusals (a handle change reports when it is next allowed).
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: Readonly<Record<string, unknown>>) { super(message); }
}

export type CompleteTaxonomyCatalog=Readonly<Omit<TaxonomyCatalogPage,'items'|'nextCursor'>&{complete:true;items:readonly TaxonomyCatalogPage['items'][number][];nextCursor:null;accountId:string;generation:number}>;
async function taxonomyPage(input:{category:TaxonomyCatalogCategory;locale?:string;limit?:number;cursor?:string},signal?:AbortSignal):Promise<TaxonomyCatalogPage>{
 const query=taxonomyCatalogQuerySchema.parse({...input,...(input.limit===undefined?{}:{limit:String(input.limit)})});
 let page:TaxonomyCatalogPage;
 try{page=await ownerRead('/catalog/taxonomy',query,taxonomyCatalogPageSchema,signal,true);}catch(error){
  if(error instanceof ExplorersApiError&&error.code==='INVALID_OWNER_CONTENT')throw new ExplorersApiError(error.status,error.code,'Invalid taxonomy catalog response; retry loading sectors');
  throw error;
 }
 if(page.category!==query.category||page.requestedLocale!==(query.locale??null))throw new ExplorersApiError(409,'CONFLICT','Catalog response changed; retry loading sectors');
 return page;
}
async function completeTaxonomyCatalog(input:{category:TaxonomyCatalogCategory;locale?:string},signal?:AbortSignal):Promise<CompleteTaxonomyCatalog>{
 const initial=useAuthStore.getState(),controller=new AbortController();
 const isCurrent=()=>{const now=useAuthStore.getState();return now.isAuthenticated&&now.accountId===initial.accountId&&now.generation===initial.generation;};
 const stop=()=>controller.abort(),check=()=>{if(controller.signal.aborted||!isCurrent())throw new DOMException('Catalog owner changed','AbortError');};
 const unsubscribe=useAuthStore.subscribe(()=>{if(!isCurrent())stop();});signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
 const items:TaxonomyCatalogPage['items']=[],ids=new Set<string>(),slugs=new Set<string>(),cursors=new Set<string>();let cursor:string|undefined,first:TaxonomyCatalogPage|undefined;
 const invalid=():never=>{throw new ExplorersApiError(409,'CONFLICT','Catalog changed; retry loading the complete catalog');};
 try{
  while(true){
   check();const page=await taxonomyPage({...input,cursor},controller.signal);check();
   if(first&&(page.catalogVersion!==first.catalogVersion||page.defaultLocale!==first.defaultLocale||page.state!==first.state||page.version!==first.version))invalid();first??=page;
   for(const item of page.items){const prior=items[items.length-1];if(ids.has(item.id)||slugs.has(item.slug)||prior&&(item.position<prior.position||item.position===prior.position&&item.id<=prior.id)||input.category==='people'&&item.parentId!==null)invalid();ids.add(item.id);slugs.add(item.slug);items.push(Object.freeze(item));}
   if(page.nextCursor===null){check();return Object.freeze({...first,complete:true,items:Object.freeze(items),nextCursor:null,accountId:initial.accountId!,generation:initial.generation});}
   if(!page.items.length||cursors.has(page.nextCursor))invalid();cursors.add(page.nextCursor);cursor=page.nextCursor;
  }
 }finally{unsubscribe();signal?.removeEventListener('abort',stop);}
}

export type GuardedParentCreateFailure = Readonly<
 | {kind:'server-refusal';status:number;code:string}
 | {kind:'uncertain'} | {kind:'local-rejection'} | {kind:'custody-lost'}>;
const validatedServerErrors=new WeakSet<object>();
const guardedParentCreateFailures=new WeakMap<object,GuardedParentCreateFailure>();
// Provenance survives consumption solely to recognize old custody; it grants no authority.
const guardedParentAuthorities=new WeakSet<object>();
export function getGuardedParentCreateFailure(error:unknown):GuardedParentCreateFailure|undefined {
 return error!==null&&(typeof error==='object'||typeof error==='function')?guardedParentCreateFailures.get(error):undefined;
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
    const tuples=new Set<string>(),placePinPositions=new Map<string,Set<number>>();
    for(const item of memberships) {
      const parent=parents.get(item.collectionId),child=children.get(item.recommendationId),key=`${item.recommendationId}:${item.collectionId}`;
      if((item.placePinPosition!==undefined)!==(query.category==='places'))return invalid();
      if(item.placePinPosition!=null){const positions=placePinPositions.get(item.collectionId)??new Set<number>();if(positions.has(item.placePinPosition)||item.collectionArchived||item.recommendationArchived)return invalid();positions.add(item.placePinPosition);placePinPositions.set(item.collectionId,positions);}
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

export function handleExpiredSession(response: Response, generation: number) {
  if (response.status !== 401) return;
  const current = useAuthStore.getState();
  if (current.generation === generation && current.isAuthenticated) current.logout();
}

async function responseBody<T>(response: Response, generation: number): Promise<T> {
  handleExpiredSession(response, generation);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ExplorersApiError(response.status, body?.error?.code ?? "UNAVAILABLE",
    body?.error?.message ?? "Request failed",
    typeof body?.error?.nextAllowedAt === "string" ? { nextAllowedAt: body.error.nextAllowedAt } : undefined);
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
// An archived detail is observed only to restore or permanently delete it (WP3B, LP-08):
// every other command refuses it, restore requires it, delete takes either.
export function assertOwnerDetailObservation(value:OwnerDetailObservation<EditableOwnerCollection|EditableOwnerRecommendation>,kind?:'collection'|'recommendation',archived:'refuse'|'allow'|'require'='refuse'):void {
 const state=useAuthStore.getState();
 if(!value||!issuedDetails.has(value)||kind&&value.kind!==kind||!state.isAuthenticated||state.accountId!==value.accountId||state.generation!==value.generation||Date.now()-value.observedAt>=600000||(archived==='refuse'&&value.detail.archived)||(archived==='require'&&!value.detail.archived))throw new ExplorersApiError(409,'CONFLICT','Reload the owner detail before saving');
}
/**
 * A command is composed against the version the owner's view showed. The re-read a command
 * does right before it writes must still be that version; if it is newer, the edit is based
 * on something that has changed and is refused as a conflict instead of overwriting it.
 */
function assertUnchangedSinceViewed(key:string,...observed:OwnerDetailObservation<unknown>[]):void {
 if(wasCommandSent(key))return;
 for(const value of observed)if(!isViewObservation(value)&&changedSinceViewed(value.kind,value.resourceId,value.resourceRevision))
  throw announceRevisionConflict(new ExplorersApiError(409,'CONFLICT','This changed in another tab or device. Reload to see the latest version'));
}
function settleObserved(observed:unknown,dto:{id?:string;revision?:number}|undefined):void {
 const value=observed as Partial<OwnerDetailObservation<unknown>>|undefined;
 if(!value||typeof value.resourceId!=='string'||(value.kind!=='collection'&&value.kind!=='recommendation'))return;
 settleViewedRevision(value.kind,value.resourceId,dto&&dto.id===value.resourceId&&typeof dto.revision==='number'?dto.revision:undefined);
}
export function copyOwnerDetailForStaging<T>(value:OwnerDetailObservation<T>):T {
 if(!issuedDetails.has(value))throw new ExplorersApiError(409,'CONFLICT','Reload the owner detail before staging');
 return structuredClone(value.detail);
}
async function editableDetail<K extends 'collection'|'recommendation'>(kind:K,id:string,signal?:AbortSignal,archived=false):Promise<K extends 'collection'?CollectionObservation:RecommendationObservation> {
 if(!contentIdSchema.safeParse(id).success)throw new ExplorersApiError(422,'INVALID_INPUT','Invalid resource ID');
 const state=useAuthStore.getState();
 try {
  const schema=kind==='collection'?z.object({collection:editableOwnerCollectionSchema}).strict():z.object({recommendation:editableOwnerRecommendationSchema}).strict();
  const body=await ownerRead(`/`+(kind==='collection'?'collections':'recommendations')+`/${encodeURIComponent(id)}/editable`,{status:archived?'archived':'active'},schema as z.ZodType<any>,signal);
  const detail=body[kind] as EditableOwnerCollection|EditableOwnerRecommendation,current=useAuthStore.getState();
  if(!current.isAuthenticated||current.generation!==state.generation||current.accountId!==state.accountId||detail.accountId!==state.accountId||detail.id!==id.toLowerCase()||detail.archived!==archived)throw new ExplorersApiError(409,'CONFLICT','Invalid editable owner detail');
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
async function membershipCommand(category:'games'|'apps'|'products'|'people'|'places',parent:CollectionObservation,item:RecommendationObservation,key:string,attached:boolean,signal?:AbortSignal){
 const label=category==='games'?'Games':category==='apps'?'Apps':category==='products'?'Products':category==='people'?'People':'Places';
 assertOwnerDetailObservation(parent,'collection');assertOwnerDetailObservation(item,'recommendation');assertUnchangedSinceViewed(key,parent,item);commandInput(commandKeySchema,key);
 if(parent.detail.category!==category||item.detail.category!==category||parent.accountId!==item.accountId||parent.generation!==item.generation)throw new ExplorersApiError(422,'INVALID_INPUT',`${label} membership observations required`);
 const input=commandInput(gameMembershipCommandSchema,{expectedCollectionRevision:parent.resourceRevision,expectedRecommendationRevision:item.resourceRevision});
 const controller=new AbortController(),stop=()=>controller.abort(),initial=useAuthStore.getState(),route=window.location.pathname,deadline=AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]);
 const current=()=>{const state=useAuthStore.getState();return state.isAuthenticated&&state.accountId===initial.accountId&&state.generation===initial.generation&&window.location.pathname===route;};
 const unsubscribe=useAuthStore.subscribe(()=>{if(!current())stop();});signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
 const revoke=()=>{issuedDetails.delete(parent);issuedDetails.delete(item);};
 try{
  if(controller.signal.aborted||!current())throw new ExplorersApiError(409,'ABORTED',`${label} membership cancelled`);
  markCommandSent(key);
  const fetching=fetch(`/api/explorers/v1/collections/${parent.resourceId}/memberships/${item.resourceId}`,{method:attached?'POST':'DELETE',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(input),signal:deadline});
  void fetching.then(reply=>{if(deadline.aborted)void reply.body?.cancel().catch(()=>{});},()=>{});
  const reply=await gameCommandAwait(fetching,deadline),raw=await gameMembershipBody(reply,initial.generation,deadline);
  if(controller.signal.aborted||!current())throw new ExplorersApiError(409,'ABORTED',`${label} owner changed`);
  const parsed=z.object({membership:gameMembershipResultSchema}).strict().safeParse(raw);revoke();
  if(!parsed.success)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT',`Invalid ${label} membership response`);
  const result=parsed.data.membership;
  if(result.attached!==attached||result.collection.id!==parent.resourceId||result.recommendation.id!==item.resourceId||result.collection.accountId!==initial.accountId||result.recommendation.accountId!==initial.accountId||result.collection.category!==category||result.recommendation.category!==category||result.collection.revision!==parent.resourceRevision+1||result.recommendation.revision!==item.resourceRevision+1||result.recommendation.entityId!==item.detail.entityId)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT',`Invalid ${label} membership identity`);
  settleViewedRevision('collection',parent.resourceId,result.collection.revision);settleViewedRevision('recommendation',item.resourceId,result.recommendation.revision);
  return deepFreeze(result);
 }catch(error){if(error instanceof ExplorersApiError){if([401,403,404,409].includes(error.status))revoke();throw announceRevisionConflict(error);}throw new ExplorersApiError(503,'UNAVAILABLE',`Unable to save ${label} membership`);}
 finally{unsubscribe();signal?.removeEventListener('abort',stop);}
}
async function gameCommandAwait<T>(work:Promise<T>,signal:AbortSignal):Promise<T>{
 void work.catch(()=>{});const failure=()=>signal.reason?.name==='TimeoutError'?new ExplorersApiError(503,'UNAVAILABLE','Games command deadline'):new ExplorersApiError(409,'ABORTED','Games command cancelled');
 if(signal.aborted)throw failure();let abort!:()=>void;const stopped=new Promise<never>((_resolve,reject)=>{abort=()=>reject(failure());signal.addEventListener('abort',abort,{once:true});});
 try{return await Promise.race([work,stopped]);}finally{signal.removeEventListener('abort',abort);}
}
async function gameMembershipBody(response:Response,generation:number,signal:AbortSignal):Promise<unknown>{
 const limit=65536,declared=response.headers.get('content-length');
 if(declared!==null&&(!/^\d{1,16}$/.test(declared)||Number(declared)>limit)){void response.body?.cancel().catch(()=>{});throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Games response bound');}
 const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 try{if(reader)while(true){const part=await gameCommandAwait(reader.read(),signal);if(part.done)break;bytes+=part.value.byteLength;if(bytes>limit)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Games response bound');chunks.push(part.value);}
  const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
  let raw:unknown;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));}catch{throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid Games response');}
  handleExpiredSession(response,generation);if(!response.ok){const error=apiErrorSchema.safeParse(raw);if(!error.success)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid Games error');throw new ExplorersApiError(response.status,error.data.error.code,error.data.error.message);}return raw;
 }finally{if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{/* Best-effort cleanup must not replace the command result or its original error/cancellation. */}}}
}
async function contentCommand<T extends {id:string}>(path:string,method:string,input:unknown,key:string,name:string,schema:z.ZodType<T,any,any>,signal?:AbortSignal,observed?:CollectionObservation|RecommendationObservation|CompleteMyCategoryContent,expectedId?:string,expectedRevision?:number):Promise<DeepReadonly<T>> {
 commandInput(commandKeySchema,key);
 const state=useAuthStore.getState(),controller=new AbortController(),stop=()=>controller.abort();
 if(!state.isAuthenticated||!state.accountId)throw new ExplorersApiError(401,'UNAUTHENTICATED','Sign in is required');
 const current=()=>{const now=useAuthStore.getState();return now.isAuthenticated&&now.accountId===state.accountId&&now.generation===state.generation;};
 const revoke=()=>{if(observed){issuedDetails.delete(observed);completedCategories.delete(observed);}};
 const body=JSON.stringify(input);if(new TextEncoder().encode(body).byteLength>1024*1024)throw new ExplorersApiError(413,'RESOURCE_TOO_LARGE','Content command exceeds the request byte bound');
 const unsubscribe=useAuthStore.subscribe(()=>{if(!current())stop();});signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
 try {
  if(controller.signal.aborted||!current())throw new ExplorersApiError(409,'ABORTED','Content command cancelled');
  markCommandSent(key);
  const response=await fetch(`/api/explorers/v1${path}`,{method,credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json','Idempotency-Key':key},body,signal:controller.signal});
  const text=await response.text();
  if(controller.signal.aborted||!current())throw new ExplorersApiError(409,'CONFLICT','Owner changed before command completion');
  handleExpiredSession(response,state.generation);
  if(new TextEncoder().encode(text).byteLength>4*1024*1024)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Command response exceeds the byte bound');
  let raw:unknown;try {raw=JSON.parse(text);}catch{throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid command response');}
  if(!response.ok) {
   const failure=apiErrorSchema.safeParse(raw);if(!failure.success)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid command error');
   if([401,403,404,409].includes(response.status))revoke();
   const error=new ExplorersApiError(response.status,failure.data.error.code,failure.data.error.message);
   validatedServerErrors.add(error);throw announceRevisionConflict(error);
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
  settleObserved(observed,dto);
  return deepFreeze(dto);
 } catch(error) {
  if(controller.signal.aborted||!current()){revoke();throw new ExplorersApiError(409,'CONFLICT','Content command cancelled or owner changed');}
  if(error instanceof ExplorersApiError)throw error;
  throw new ExplorersApiError(503,'UNAVAILABLE','Unable to save content');
 } finally {unsubscribe();signal?.removeEventListener('abort',stop);}
}
const archivedResult=z.object({id:contentIdSchema,archived:z.literal(true)}).strict();
const deletedResult=z.object({id:contentIdSchema,deleted:z.literal(true)}).strict();
// Mirrors the server's restore body; the slug rule is the collection DTO's own.
const restoreCollectionInputSchema=contentRevisionSchema.extend({slug:collectionCoreDtoSchema.shape.slug.optional()}).strict();
// Ticket 5.3. The aggregate, re-presented with `id` so contentCommand's identity check
// applies. The transform adds a field rather than renaming one, so nothing downstream has
// to know the adapter happened.
const guideCommandResult=guideAggregateDtoSchema.transform((guide)=>({...guide,id:guide.collectionId}));
async function guideCommand(collectionId:string,suffix:string,method:string,body:unknown,key:string,signal?:AbortSignal) {
 const id=commandInput(contentIdSchema,collectionId);
 const result=await contentCommand(`/collections/${encodeURIComponent(id)}/guide${suffix}`,method,body,key,'guide',
  guideCommandResult,signal,undefined,id);
 return result;
}
export const explorersApiClient = {
 getTaxonomyCatalogPage:taxonomyPage,
 getCompleteTaxonomyCatalog:completeTaxonomyCatalog,
  attachMyGameMembership:(parent:CollectionObservation,item:RecommendationObservation,key:string,signal?:AbortSignal)=>membershipCommand('games',parent,item,key,true,signal),
  attachMyAppMembership:(parent:CollectionObservation,item:RecommendationObservation,key:string,signal?:AbortSignal)=>membershipCommand('apps',parent,item,key,true,signal),
  detachMyGameMembership:(parent:CollectionObservation,item:RecommendationObservation,key:string,signal?:AbortSignal)=>membershipCommand('games',parent,item,key,false,signal),
  detachMyAppMembership:(parent:CollectionObservation,item:RecommendationObservation,key:string,signal?:AbortSignal)=>membershipCommand('apps',parent,item,key,false,signal),
  attachMyProductMembership:(parent:CollectionObservation,item:RecommendationObservation,key:string,signal?:AbortSignal)=>membershipCommand('products',parent,item,key,true,signal),
  detachMyProductMembership:(parent:CollectionObservation,item:RecommendationObservation,key:string,signal?:AbortSignal)=>membershipCommand('products',parent,item,key,false,signal),
  attachMyPersonMembership:(parent:CollectionObservation,item:RecommendationObservation,key:string,signal?:AbortSignal)=>membershipCommand('people',parent,item,key,true,signal),
  detachMyPersonMembership:(parent:CollectionObservation,item:RecommendationObservation,key:string,signal?:AbortSignal)=>membershipCommand('people',parent,item,key,false,signal),
  attachMyPlaceMembership:(parent:CollectionObservation,item:RecommendationObservation,key:string,signal?:AbortSignal)=>membershipCommand('places',parent,item,key,true,signal),
  detachMyPlaceMembership:(parent:CollectionObservation,item:RecommendationObservation,key:string,signal?:AbortSignal)=>membershipCommand('places',parent,item,key,false,signal),
  async getMovieGenres(signal?:AbortSignal){return ownerRead('/catalog/movie-genres',{},movieGenreTermsResultSchema,signal,true);},
  async importMovieMedia(observed:RecommendationObservation,key:string,signal?:AbortSignal){
   assertOwnerDetailObservation(observed,'recommendation');if(observed.detail.category!=='movies')throw new ExplorersApiError(422,'INVALID_INPUT','Movie import requires Movies');
   const body=commandInput(importMovieMediaRequestSchema,{expectedRevision:observed.resourceRevision});
   const result=await contentCommand(`/recommendations/${observed.resourceId}/movie-media/import`,'POST',body,key,'movieMediaImport',movieMediaImportResultSchema,signal,observed,observed.resourceId,observed.resourceRevision+1);
   if(result.source.entityId!==observed.detail.entityId)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid Movie source identity');return result;
  },
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
  // --- Ticket 5.3, guides -------------------------------------------------------------
  // Every guide command answers {guide:aggregate}. Re-presenting the aggregate with its
  // collectionId as `id` lets contentCommand do the identity check it already does for
  // every other resource, so a response describing a different guide is refused by
  // existing machinery rather than by a check each call site has to remember.
  //
  // expectedRevision is deliberately not passed: the aggregate reports the revision AFTER
  // the write, so comparing it with the one the caller composed against would always fail.
  async readMyGuide(collectionId:string,query:{after?:number;limit?:number}={},signal?:AbortSignal){
   const guide=await ownerRead(`/collections/${encodeURIComponent(commandInput(contentIdSchema,collectionId))}/guide`,
    query as Record<string,unknown>,z.object({guide:guideAggregateDtoSchema}).strict(),signal,true);
   if(guide.guide.collectionId!==collectionId)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid guide identity');
   return guide.guide;
  },
  async writeMyGuideDetails(collectionId:string,input:z.input<typeof writeGuideDetailsSchema>,key:string,signal?:AbortSignal){
   return guideCommand(collectionId,'','PUT',commandInput(writeGuideDetailsSchema,input),key,signal);
  },
  async addMyGuideSection(collectionId:string,input:z.input<typeof createGuideSectionSchema>,key:string,signal?:AbortSignal){
   return guideCommand(collectionId,'/sections','POST',commandInput(createGuideSectionSchema,input),key,signal);
  },
  async writeMyGuideSection(collectionId:string,sectionId:string,input:z.input<typeof writeGuideSectionSchema>,key:string,signal?:AbortSignal){
   return guideCommand(collectionId,`/sections/${encodeURIComponent(commandInput(contentIdSchema,sectionId))}`,'PATCH',
    commandInput(writeGuideSectionSchema,input),key,signal);
  },
  async removeMyGuideSection(collectionId:string,sectionId:string,revision:number,key:string,signal?:AbortSignal){
   return guideCommand(collectionId,`/sections/${encodeURIComponent(commandInput(contentIdSchema,sectionId))}`,'DELETE',
    commandInput(guideRevisionSchema,{revision}),key,signal);
  },
  async reorderMyGuideSections(collectionId:string,input:z.input<typeof reorderGuideSectionsSchema>,key:string,signal?:AbortSignal){
   return guideCommand(collectionId,'/sections/order','PATCH',commandInput(reorderGuideSectionsSchema,input),key,signal);
  },
  async attachMyGuideCover(collectionId:string,input:z.input<typeof attachGuideCoverSchema>,key:string,signal?:AbortSignal){
   return guideCommand(collectionId,'/cover','PUT',commandInput(attachGuideCoverSchema,input),key,signal);
  },
  async resolvePlaceEntity(input:z.input<typeof resolveManualPlaceSchema>,key:string,signal?:AbortSignal){
   const body=commandInput(resolveManualPlaceSchema,input);
   const entity=await contentCommand('/entities/resolve','POST',body,key,'entity',placeEntityDtoSchema,signal);
   if(entity.kind!=='place'||entity.title!==body.details.title)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid resolved Place identity');
   return entity;
  },
  async resolvePersonEntity(input:z.input<typeof resolveManualPersonSchema>,key:string,signal?:AbortSignal){
   const body=commandInput(resolveManualPersonSchema,input);
   const entity=await contentCommand('/entities/resolve','POST',body,key,'entity',personEntityDtoSchema,signal);
   if(entity.kind!=='person'||entity.title!==body.details.title)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid resolved Person identity');
   return entity;
  },
  async resolveProductEntity(input:z.input<typeof resolveManualProductSchema>,key:string,signal?:AbortSignal){
   const body=commandInput(resolveManualProductSchema,input);
   const entity=await contentCommand('/entities/resolve','POST',body,key,'entity',productEntityDtoSchema,signal);
   if(entity.kind!=='product'||entity.title!==body.details.title||entity.details.productUrl!==body.details.productUrl)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid resolved Product identity');
   return entity;
  },
  async resolveAppEntity(input:z.input<typeof resolveManualAppSchema>,key:string,signal?:AbortSignal){
   const body=commandInput(resolveManualAppSchema,input);
   const entity=await contentCommand('/entities/resolve','POST',body,key,'entity',appEntityDtoSchema,signal);
   if(entity.kind!=='app'||entity.title!==body.details.title||entity.details.appUrl!==body.details.appUrl)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid resolved App identity');
   return entity;
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
  /** IGDB search hits. A 503 PROVIDER_NOT_CONFIGURED means this deployment has no IGDB credentials. */
  async searchGames(input:{query:string;limit:24;cursor?:string},signal?:AbortSignal):Promise<GameCandidatePage> {
   const parsed=gameCatalogRequestSchema.parse({...input,limit:String(input.limit)}),query=new URLSearchParams({query:parsed.query,limit:String(parsed.limit)});if(parsed.cursor)query.set('cursor',parsed.cursor);
   const generation=useAuthStore.getState().generation,response=await fetch('/api/explorers/v1/catalog/games?'+query.toString(),{credentials:'include',cache:'no-store',signal});
   const page=gameCandidatePageSchema.safeParse(await responseBody<unknown>(response,generation));
   if(!page.success)throw new ExplorersApiError(502,'PROVIDER_INVALID_RESPONSE','Game search returned an unexpected answer');
   return page.data;
  },
  async resolveGameProvider(externalId:string,key:string,signal?:AbortSignal):Promise<never> {
   const input=commandInput(resolveProviderGameSchema,{kind:'provider',category:'games',provider:'igdb',externalKind:'game',externalId});commandInput(commandKeySchema,key);
   const generation=useAuthStore.getState().generation,response=await fetch('/api/explorers/v1/entities/resolve',{method:'POST',credentials:'include',signal,headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(input)});
   await responseBody<never>(response,generation);throw new ExplorersApiError(503,'PROVIDER_INVALID_RESPONSE','Games provider is unavailable');
  },
  /** A manual game with its year, platforms and genres (GMS-X01). */
  async resolveManualGame(details:{title:string;releaseYear:number|null;platforms:string[];genres:string[]},key:string,signal?:AbortSignal) {
   const body=commandInput(resolveManualGameSchema,{kind:'manual',category:'games',details});
   const entity=await contentCommand('/entities/resolve','POST',body,key,'entity',entityCoreDtoSchema,signal);
   if(entity.kind!=='game'||entity.title!==body.details.title)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid resolved catalog identity');
   return entity;
  },
  async resolveManualEntity(input:ResolveManualEntityInput,key:string,signal?:AbortSignal) {
   const body=commandInput(resolveManualEntitySchema,input);
   const entity=await contentCommand('/entities/resolve','POST',body,key,'entity',entityCoreDtoSchema,signal);
   const kinds={books:'book',movies:'movie',games:'game',apps:'app',products:'product',people:'person'} as const;
   if(entity.kind!==kinds[body.category]||entity.title!==body.details.title)throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid resolved catalog identity');
   return entity;
  },
  /** HUB-X02. Per-category counts for Home in one read. */
  getMyContentSummary:async(signal?:AbortSignal):Promise<OwnerContentSummary>=>(await ownerRead('/content-summary',{},z.object({summary:ownerContentSummarySchema}).strict(),signal)).summary,
  // options.archived reads an archived list, for restore or permanent delete only (WP3B).
  getMyEditableCollection:(id:string,signal?:AbortSignal,options:{archived?:boolean}={})=>editableDetail('collection',id,signal,options.archived===true),
  getMyEditableRecommendation:(id:string,signal?:AbortSignal)=>editableDetail('recommendation',id,signal),
  async createMyCollection(input:CreateCollectionInput,key:string,signal?:AbortSignal,parentObservation?:CollectionObservation):Promise<DeepReadonly<CreateCollectionResult>> {
   const initial=useAuthStore.getState(),parent=parentObservation;
   if(parent!==undefined&&issuedDetails.has(parent))guardedParentAuthorities.add(parent);
   const current=()=>{const now=useAuthStore.getState();return !signal?.aborted&&now.isAuthenticated&&now.accountId===initial.accountId&&now.generation===initial.generation;};
   // Only genuinely issued authority can establish an obsolete owner scope.
   const lost=()=>!current()||!!(parent!==undefined&&guardedParentAuthorities.has(parent)&&(parent.accountId!==initial.accountId||parent.generation!==initial.generation));
   let dispatched=false;
   try {
    if(parent!==undefined&&lost())throw new ExplorersApiError(409,'CONFLICT','Content command cancelled or owner changed');
    let enriched=input;
    if(parent!==undefined){
     assertOwnerDetailObservation(parent,'collection');
     if(parent.detail.category!=='places'||!['products','people'].includes(input?.category)||input?.parentExpectedRevision!==undefined||input?.parentLocationCollectionId!==undefined&&input.parentLocationCollectionId!==parent.resourceId)
      throw new ExplorersApiError(422,'INVALID_INPUT','Invalid guarded parent create');
     enriched={...input,parentLocationCollectionId:parent.resourceId,parentExpectedRevision:parent.resourceRevision};
    } else if(input?.parentLocationCollectionId!==undefined||input?.parentExpectedRevision!==undefined){
     throw new ExplorersApiError(422,'INVALID_INPUT','Issued parent authority is required');
    }
    const body=commandInput(createCollectionSchema,enriched);commandInput(commandKeySchema,key);
    dispatched=true;
    const result=await contentCommand('/collections','POST',body,key,'collection',createCollectionResultSchema,signal,undefined,undefined,1);
    if(parent!==undefined&&lost())throw new ExplorersApiError(409,'CONFLICT','Content command cancelled or owner changed');
    if(parent!==undefined?(!result.parentLocation||result.parentLocation.id!==parent.resourceId||result.parentLocation.revision!==parent.resourceRevision+1||result.id===parent.resourceId):result.parentLocation!==undefined)
     throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid created collection parent receipt');
    if(parent!==undefined)issuedDetails.delete(parent);
    return result;
   } catch(error){
    if(parent===undefined)throw error;
    // `thrown` rather than reassigning the caught binding (no-ex-assign): rebinding `error`
    // in place makes the original rejection unrecoverable for anything later in the block and
    // hides which value is actually being propagated. Behaviour is unchanged -- the
    // custody-lost branch still substitutes a 409 and that is what gets mapped and rethrown.
    let thrown:unknown=error;
    let failure:GuardedParentCreateFailure;
    if(lost()){
     issuedDetails.delete(parent);
     thrown=new ExplorersApiError(409,'CONFLICT','Content command cancelled or owner changed');failure={kind:'custody-lost'};
    } else if(!dispatched)failure={kind:'local-rejection'};
    else if(thrown instanceof ExplorersApiError&&validatedServerErrors.has(thrown)&&[401,403,404,409,422].includes(thrown.status)){
     issuedDetails.delete(parent);failure={kind:'server-refusal',status:thrown.status,code:thrown.code};
    } else failure={kind:'uncertain'};
    if(thrown!==null&&(typeof thrown==='object'||typeof thrown==='function'))guardedParentCreateFailures.set(thrown,Object.freeze(failure));
    throw thrown;
   }
  },
  async updateMyCollection(observed:CollectionObservation,patch:Omit<UpdateCollectionInput,'expectedRevision'>,key:string,signal?:AbortSignal) {
   assertOwnerDetailObservation(observed,'collection');assertUnchangedSinceViewed(key,observed);const editable=commandInput(updateCollectionSchema.innerType().omit({expectedRevision:true}).strict(),patch);
   const body=commandInput(updateCollectionSchema,{...editable,expectedRevision:observed.resourceRevision});return contentCommand(`/collections/${observed.resourceId}`,'PATCH',body,key,'collection',collectionCoreDtoSchema,signal,observed,observed.resourceId,observed.resourceRevision+1);
  },
  /**
   * Ticket 5.2. Links this list to one of the owner's location lists, or unlinks it.
   *
   * Both observations travel, because the command links a pair and a stale view of either
   * side would link the wrong one. The child's revision advances either way, so the
   * caller receives the list it just changed.
   */
  async setMyCollectionLocation(child:CollectionObservation,location:CollectionObservation|null,key:string,signal?:AbortSignal) {
   assertOwnerDetailObservation(child,'collection');assertUnchangedSinceViewed(key,child);
   if(location!==null){
    assertOwnerDetailObservation(location,'collection');assertUnchangedSinceViewed(key,location);
    if(location.detail.category!=='places')throw new ExplorersApiError(422,'INVALID_INPUT','A location list is required');
    if(location.accountId!==child.accountId||location.generation!==child.generation)throw new ExplorersApiError(409,'CONFLICT','Owner changed between the two lists');
   }
   const body=location===null
    ?commandInput(detachLocationLinkSchema,{childCollectionId:child.resourceId,expectedChildRevision:child.resourceRevision})
    :commandInput(attachLocationLinkSchema,{childCollectionId:child.resourceId,expectedChildRevision:child.resourceRevision,
      locationCollectionId:location.resourceId,expectedLocationRevision:location.resourceRevision});
   const saved=await contentCommand(`/collections/${child.resourceId}/location`,location===null?'DELETE':'POST',body,key,'collection',collectionCoreDtoSchema,signal,child,child.resourceId,child.resourceRevision+1);
   if(location!==null)settleObserved(location,undefined);return saved;
  },
  async archiveMyCollection(observed:CollectionObservation,key:string,signal?:AbortSignal) {
   assertOwnerDetailObservation(observed,'collection');assertUnchangedSinceViewed(key,observed);return contentCommand(`/collections/${observed.resourceId}`,'DELETE',{expectedRevision:observed.resourceRevision},key,'collection',archivedResult,signal,observed,observed.resourceId);
  },
  // WP3B (LP-08). Restore needs an archived observation (getMyEditableCollection(id,signal,{archived:true}));
  // a reused slug comes back as 409 CONFLICT 'List URL is taken; choose a new URL to restore'.
  async restoreMyCollection(observed:CollectionObservation,key:string,options:{slug?:string}={},signal?:AbortSignal) {
   assertOwnerDetailObservation(observed,'collection','require');assertUnchangedSinceViewed(key,observed);
   const body=commandInput(restoreCollectionInputSchema,{expectedRevision:observed.resourceRevision,...(options.slug===undefined?{}:{slug:options.slug})});
   return contentCommand(`/collections/${observed.resourceId}/restore`,'POST',body,key,'collection',collectionCoreDtoSchema,signal,observed,observed.resourceId,observed.resourceRevision+1);
  },
  // WP3B (LP-08). Permanent delete of a live or archived list.
  async purgeMyCollection(observed:CollectionObservation,key:string,signal?:AbortSignal) {
   assertOwnerDetailObservation(observed,'collection','allow');assertUnchangedSinceViewed(key,observed);
   return contentCommand(`/collections/${observed.resourceId}/purge`,'POST',{expectedRevision:observed.resourceRevision},key,'collection',deletedResult,signal,observed,observed.resourceId);
  },
  async createMyRecommendation(parent:CollectionObservation,input:Omit<CreateRecommendationInput,'collectionId'|'expectedCollectionRevision'|'category'>,key:string,signal?:AbortSignal) {
   assertOwnerDetailObservation(parent,'collection');const editable=commandInput(createRecommendationObjectSchema.omit({collectionId:true,expectedCollectionRevision:true,category:true}).strict(),input);
   const body=commandInput(createRecommendationSchema,{...editable,collectionId:parent.resourceId,category:parent.detail.category,expectedCollectionRevision:parent.resourceRevision});return contentCommand('/recommendations','POST',body,key,'recommendation',recommendationCoreDtoSchema,signal,parent,undefined,1);
  },
  async updateMyRecommendation(observed:RecommendationObservation,patch:Omit<UpdateRecommendationInput,'expectedRevision'>,key:string,signal?:AbortSignal) {
   assertOwnerDetailObservation(observed,'recommendation');assertUnchangedSinceViewed(key,observed);const editable=commandInput(updateRecommendationSchema.innerType().omit({expectedRevision:true}).strict(),patch);
   const body=commandInput(updateRecommendationSchema,{...editable,expectedRevision:observed.resourceRevision});return contentCommand(`/recommendations/${observed.resourceId}`,'PATCH',body,key,'recommendation',recommendationCoreDtoSchema,signal,observed,observed.resourceId,observed.resourceRevision+1);
  },
  async archiveMyRecommendation(observed:RecommendationObservation,key:string,signal?:AbortSignal) {
   assertOwnerDetailObservation(observed,'recommendation');assertUnchangedSinceViewed(key,observed);return contentCommand(`/recommendations/${observed.resourceId}`,'DELETE',{expectedRevision:observed.resourceRevision},key,'recommendation',archivedResult,signal,observed,observed.resourceId);
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
    // The revision must be the one the owner's view showed. A caller that re-read the
    // account right before saving would otherwise send the newest revision and defeat the lock.
    const viewedRevision = viewedAccountRevision();
    if (viewedRevision !== undefined && input.expectedRevision !== viewedRevision)
      throw announceRevisionConflict(new ExplorersApiError(409, "CONFLICT", "This changed in another tab or device. Reload to see the latest version"));
    const response = await fetch("/api/explorers/v1/account", { method: "PATCH", credentials: "include", signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    try {
      const { account } = await responseBody<{ account: AccountDto }>(response, generation);
      settleViewedAccount(account.revision);
      return account;
    } catch (error) { throw announceRevisionConflict(error); }
  },
  async createMedia(file: File, purpose: "profile" | "background" | "feed" | "recommendation" | "collection" | "guide", signal?: AbortSignal): Promise<MediaDto> {
    const problem = mediaUploadProblem(file, purpose);
    if (problem) throw new ExplorersApiError(422, problem.code, problem.message);
    const generation = useAuthStore.getState().generation;
    const response = await fetch("/api/explorers/v1/media", { method: "POST", credentials: "include", signal,
      headers: { "Content-Type": file.type, "X-Media-Purpose": purpose, "X-File-Name": safeMediaFileName(file.name) }, body: file });
    return (await responseBody<{ media: MediaDto }>(response, generation)).media;
  },
  /** A Google place photo, fetched and stored as owned list-cover media by the API. Only the
   * key-free photoUri is sent; the bytes never pass through the browser. */
  async importPlacePhoto(photoUri: string, purpose: "collection" | "recommendation" = "collection", signal?: AbortSignal): Promise<MediaDto> {
    const generation = useAuthStore.getState().generation;
    const response = await fetch("/api/explorers/v1/media/place-photo", { method: "POST", credentials: "include", signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(purpose === "collection" ? { photoUri } : { photoUri, purpose }) });
    return (await responseBody<{ media: MediaDto }>(response, generation)).media;
  },
  /** An IGDB search hit's cover, fetched by the API from images.igdb.com and stored as game snapshot media. */
  async importGameCover(imageId: string, signal?: AbortSignal): Promise<MediaDto> {
    const generation = useAuthStore.getState().generation;
    const response = await fetch("/api/explorers/v1/media/game-cover", { method: "POST", credentials: "include", signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageId }) });
    return (await responseBody<{ media: MediaDto }>(response, generation)).media;
  },
  /** Imports the signed-in user's Google profile photo as profile media; the server reads the URL from the session. */
  async importProviderAvatar(signal?: AbortSignal): Promise<MediaDto> {
    const generation = useAuthStore.getState().generation;
    const response = await fetch("/api/explorers/v1/media/provider-avatar", { method: "POST", credentials: "include", signal });
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
