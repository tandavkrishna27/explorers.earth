import {AppsClient,type CompleteAppsOwnerContent} from './appsClient';
import {appsViewModel,type AppOwnerView} from './appsViewModel';
import {ExplorersApiError,type RecommendationObservation} from '../../../lib/explorersApiClient';
import useAuthStore from '../../../store/store';

// Ticket 4.3. Same orchestration contract as the Games adapter: two bracketing category
// reads, a bounded fan-out of detail reads, and no partially hydrated view ever returned.
// The category observation is re-read after the details so a concurrent edit cannot be
// mapped into a view that claims to be a consistent snapshot.
export type AppsOwnerContent={observation:CompleteAppsOwnerContent;view:Readonly<AppOwnerView>;details:ReadonlyMap<string,RecommendationObservation>};
export async function readAppsOwnerContent(signal?:AbortSignal):Promise<AppsOwnerContent>{
 const controller=new AbortController();let terminal=false,firstError:unknown;
 const forwardAbort=()=>controller.abort(signal?.reason);signal?.addEventListener('abort',forwardAbort,{once:true});if(signal?.aborted)forwardAbort();
 const fail=(error:unknown):never=>{if(!terminal){terminal=true;firstError=error;controller.abort(error);}throw firstError;};
 const checkTerminal=()=>{if(terminal)throw firstError;if(controller.signal.aborted)throw new DOMException('Owner read cancelled','AbortError');};
 try{checkTerminal();
 const initial=useAuthStore.getState(),assertCurrent=()=>{const state=useAuthStore.getState();if(signal?.aborted||state.accountId!==initial.accountId||state.generation!==initial.generation)throw new ExplorersApiError(409,'CONFLICT','Apps owner changed while loading');};
 const first=await AppsClient.readCompleteOwner(controller.signal);checkTerminal();assertCurrent();const details=new Map<string,RecommendationObservation>();let index=0,bytes=0;
 await Promise.all(Array.from({length:Math.min(4,first.recommendations.length)},async()=>{try{while(index<first.recommendations.length){checkTerminal();assertCurrent();const row=first.recommendations[index++],detail=await AppsClient.observeRecommendation(row.id,controller.signal);checkTerminal();assertCurrent();if(detail.detail.revision!==row.revision||detail.detail.categoryRevision!==first.revision)throw new ExplorersApiError(409,'CONFLICT','Apps changed while loading');bytes+=new TextEncoder().encode(JSON.stringify(detail.detail)).byteLength;if(bytes>64*1024*1024)throw new ExplorersApiError(503,'READ_LIMIT','Apps editable read limit exceeded');details.set(row.id,detail);}}catch(error){fail(error);}}));
 checkTerminal();const final=await AppsClient.readCompleteOwner(controller.signal);checkTerminal();assertCurrent();if(first.revision!==final.revision||first.pinRevision!==final.pinRevision)throw new ExplorersApiError(409,'CONFLICT','Apps changed while loading');
 return {observation:final,details,view:appsViewModel.complete(final,details,initial.user?.username??'')};
 }catch(error){return fail(error);}finally{signal?.removeEventListener('abort',forwardAbort);}
}
