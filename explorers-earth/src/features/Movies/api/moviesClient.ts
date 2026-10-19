import type { MoviesOwnerObserver, MoviesProducerSnapshot } from './moviesOwnerDiagnostic';
import { explorersApiClient, assertCompleteMyCategoryContent, ExplorersApiError, type CompleteMyCategoryContent, type RecommendationObservation } from '../../../lib/explorersApiClient';
import { movieViewModel, collectionViewModel } from './moviesViewModel';
import type { MovieList } from '../types';
import useAuthStore from '../../../store/store';

export type MoviesOwnerContent={observation:CompleteMyCategoryContent;lists:MovieList[];details:ReadonlyMap<string,RecommendationObservation>};
export const moviesCommandKey=()=>crypto.randomUUID();
export async function readMoviesOwnerContent(signal?:AbortSignal,observer?:MoviesOwnerObserver):Promise<MoviesOwnerContent> {
 const controller=new AbortController();let terminal=false,firstError:unknown;
 let phase:MoviesProducerSnapshot['phase']='unavailable',localCause:MoviesProducerSnapshot['cause']|undefined;
 const emit=(cause:MoviesProducerSnapshot['cause']='none')=>{try{observer?.({phase,cause});}catch{/* observational */}};
 const boundary=(value:MoviesProducerSnapshot['phase'])=>{phase=value;emit();};
 const causeFor=(error:unknown):MoviesProducerSnapshot['cause']=>{
  if(localCause)return localCause;
  try{
  if(error instanceof DOMException&&error.name==='AbortError')return 'aborted';
  if(error instanceof ExplorersApiError){switch(error.code){case 'ABORTED':return 'aborted';case 'UNAUTHENTICATED':return 'unauthenticated';case 'CONFLICT':return 'conflict';case 'READ_LIMIT':case 'READ_BUDGET_EXCEEDED':return 'read-limit';case 'SNAPSHOT_EXPIRED':return 'snapshot-expired';case 'INVALID_OWNER_CONTENT':return 'invalid-owner-content';case 'UNAVAILABLE':return 'unavailable';}}
  }catch{/* classification must preserve the original error */}
  return 'other';
 };
 const forwardAbort=()=>controller.abort(signal?.reason);signal?.addEventListener('abort',forwardAbort,{once:true});if(signal?.aborted)forwardAbort();
 const fail=(error:unknown):never=>{if(!terminal){terminal=true;firstError=error;emit(causeFor(error));controller.abort(error);}throw firstError;};
 const checkTerminal=()=>{if(terminal)throw firstError;if(controller.signal.aborted)throw new DOMException('Owner read cancelled','AbortError');};
 try{checkTerminal();

  const initial=useAuthStore.getState(),username=initial.user?.username??'';
  const assertCurrent=()=>{const current=useAuthStore.getState();if(signal?.aborted||current.generation!==initial.generation||current.accountId!==initial.accountId){localCause='scope-changed';throw new ExplorersApiError(409,'CONFLICT','Movie owner changed while loading. Refresh to try again.');}};

  boundary('initial-category');
  const observation=await explorersApiClient.getCompleteMyCategoryTopPicks({category:'movies',status:'active'},controller.signal);
  assertCurrent();
  checkTerminal();const details=new Map<string,RecommendationObservation>();let index=0,detailBytes=0;
  // Bounded detail fanout; fail the entire observation on any missing resource.
  boundary('detail-fanout');
  await Promise.all(Array.from({length:Math.min(4,observation.recommendations.length)},async()=>{try{
    while(index<observation.recommendations.length){
      checkTerminal();
      assertCurrent();const item=observation.recommendations[index++];
      const observed=await explorersApiClient.getMyEditableRecommendation(item.id,controller.signal);
      checkTerminal();
      assertCurrent();if(observed.detail.revision!==item.revision||observed.detail.categoryRevision!==observation.revision){
        localCause='revision-conflict';throw new ExplorersApiError(409,'CONFLICT','Movies changed while loading. Refresh to try again.');}
      detailBytes+=new TextEncoder().encode(JSON.stringify(observed.detail)).length;
      if(detailBytes>64*1024*1024){localCause='read-limit';throw new ExplorersApiError(422,'READ_LIMIT','Movies exceed the complete editable read limit.');}
      details.set(item.id,observed);
    }
  }catch(error){fail(error);}}));
  checkTerminal();boundary('final-category');const final=await explorersApiClient.getCompleteMyCategoryTopPicks({category:'movies',status:'active'},controller.signal);
  checkTerminal();assertCurrent();if(final.revision!==observation.revision||final.pinRevision!==observation.pinRevision){
    localCause='revision-conflict';throw new ExplorersApiError(409,'CONFLICT','Movies changed while loading. Refresh to try again.');}
  assertCompleteMyCategoryContent(final);
  boundary('mapping');
  const lists=final.collections.filter(collection=>!collection.archived).map(collection=>collectionViewModel(collection,final.memberships
    .filter(member=>member.collectionId===collection.id&&!member.collectionArchived&&!member.recommendationArchived)
    .sort((a,b)=>a.displayOrder-b.displayOrder||a.recommendationId.localeCompare(b.recommendationId))
    .map(member=>{
      const detail=details.get(member.recommendationId);
      if(!detail){localCause='missing-detail';throw new ExplorersApiError(409,'CONFLICT','Missing editable Movie detail');}
      return movieViewModel(detail.detail,member,final.topPicks?.find(pin=>pin.recommendationId===member.recommendationId));
    }),username));
  boundary('complete');
  return {observation:final,lists,details};
 }catch(error){return fail(error);}finally{signal?.removeEventListener('abort',forwardAbort);}
}
export async function updateMovieList(id:string,patch:{title?:string;description?:string|null;heading?:string|null;slug?:string;visibility?:boolean},signal?:AbortSignal) {
  const observed=await explorersApiClient.getMyEditableCollection(id,signal);
  const {visibility,...fields}=patch;
  return explorersApiClient.updateMyCollection(observed,{...fields,...(visibility===undefined?{}:{visibility:visibility?'public':'private',publicationState:visibility?'published':'draft'})},moviesCommandKey(),signal);
}
