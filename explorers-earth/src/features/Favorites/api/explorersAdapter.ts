import {PlacesClient,type CompletePlacesOwnerContent} from './placesClient';
import {placesViewModel,type PlacesOwnerView} from './placesViewModel';
import {ExplorersApiError,type RecommendationObservation,type CollectionObservation} from '../../../lib/explorersApiClient';
import useAuthStore from '../../../store/store';

// Ticket 5.1. Same orchestration contract as the Apps, Products, People, Movies and Games
// adapters: two bracketing category reads, a bounded fan-out of detail reads, and no
// partially hydrated view ever returned.
//
// Places needs one thing the others do not. A list carries its own location, and the
// location travels on the editable list read rather than in the category page, so the
// lists are hydrated too. Both fan-outs run inside the same bracket, so a location change
// during the read is caught by the closing revision check like any other change.
export type PlacesOwnerContent={
 observation:CompletePlacesOwnerContent;view:Readonly<PlacesOwnerView>;
 lists:ReadonlyMap<string,CollectionObservation>;details:ReadonlyMap<string,RecommendationObservation>;
};
export async function readPlacesOwnerContent(signal?:AbortSignal):Promise<PlacesOwnerContent>{
 const controller=new AbortController();let terminal=false,firstError:unknown;
 const forwardAbort=()=>controller.abort(signal?.reason);signal?.addEventListener('abort',forwardAbort,{once:true});if(signal?.aborted)forwardAbort();
 const fail=(error:unknown):never=>{if(!terminal){terminal=true;firstError=error;controller.abort(error);}throw firstError;};
 const checkTerminal=()=>{if(terminal)throw firstError;if(controller.signal.aborted)throw new DOMException('Owner read cancelled','AbortError');};
 try{checkTerminal();
 const initial=useAuthStore.getState(),assertCurrent=()=>{const state=useAuthStore.getState();if(signal?.aborted||state.accountId!==initial.accountId||state.generation!==initial.generation)throw new ExplorersApiError(409,'CONFLICT','Places owner changed while loading');};
 const first=await PlacesClient.readCompleteOwner(controller.signal);checkTerminal();assertCurrent();
 const details=new Map<string,RecommendationObservation>(),lists=new Map<string,CollectionObservation>();let index=0,listIndex=0,bytes=0;
 const budget=(value:unknown)=>{bytes+=new TextEncoder().encode(JSON.stringify(value)).byteLength;if(bytes>64*1024*1024)throw new ExplorersApiError(503,'READ_LIMIT','Places editable read limit exceeded');};
 await Promise.all([
  ...Array.from({length:Math.min(4,first.recommendations.length)},async()=>{try{while(index<first.recommendations.length){checkTerminal();assertCurrent();const row=first.recommendations[index++],detail=await PlacesClient.observeRecommendation(row.id,controller.signal);checkTerminal();assertCurrent();if(detail.detail.revision!==row.revision||detail.detail.categoryRevision!==first.revision)throw new ExplorersApiError(409,'CONFLICT','Places changed while loading');budget(detail.detail);details.set(row.id,detail);}}catch(error){fail(error);}}),
  ...Array.from({length:Math.min(4,first.collections.length)},async()=>{try{while(listIndex<first.collections.length){checkTerminal();assertCurrent();const row=first.collections[listIndex++],detail=await PlacesClient.observeCollection(row.id,controller.signal);checkTerminal();assertCurrent();if(detail.detail.revision!==row.revision||detail.detail.categoryRevision!==first.revision)throw new ExplorersApiError(409,'CONFLICT','Places lists changed while loading');budget(detail.detail);lists.set(row.id,detail);}}catch(error){fail(error);}}),
 ]);
 checkTerminal();const final=await PlacesClient.readCompleteOwner(controller.signal);checkTerminal();assertCurrent();if(first.revision!==final.revision||first.pinRevision!==final.pinRevision)throw new ExplorersApiError(409,'CONFLICT','Places changed while loading');
 return {observation:final,details,lists,view:placesViewModel.complete(final,lists,details,initial.user?.username??'')};
 }catch(error){return fail(error);}finally{signal?.removeEventListener('abort',forwardAbort);}
}
