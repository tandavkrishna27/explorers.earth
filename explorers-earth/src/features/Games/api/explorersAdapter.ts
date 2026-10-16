import {GamesClient,type CompleteGamesOwnerContent} from './gamesClient';
import {gamesViewModel,type GameOwnerView} from './gamesViewModel';
import {ExplorersApiError,type RecommendationObservation} from '../../../lib/explorersApiClient';
import useAuthStore from '../../../store/store';
export type GamesOwnerContent={observation:CompleteGamesOwnerContent;view:Readonly<GameOwnerView>;details:ReadonlyMap<string,RecommendationObservation>};
export async function readGamesOwnerContent(signal?:AbortSignal):Promise<GamesOwnerContent>{
 const controller=new AbortController();let terminal=false,firstError:unknown;
 const forwardAbort=()=>controller.abort(signal?.reason);signal?.addEventListener('abort',forwardAbort,{once:true});if(signal?.aborted)forwardAbort();
 const fail=(error:unknown):never=>{if(!terminal){terminal=true;firstError=error;controller.abort(error);}throw firstError;};
 const checkTerminal=()=>{if(terminal)throw firstError;if(controller.signal.aborted)throw new DOMException('Owner read cancelled','AbortError');};
 try{checkTerminal();

 const initial=useAuthStore.getState(),assertCurrent=()=>{const state=useAuthStore.getState();if(signal?.aborted||state.accountId!==initial.accountId||state.generation!==initial.generation)throw new ExplorersApiError(409,'CONFLICT','Games owner changed while loading');};
 const first=await GamesClient.readCompleteOwner(controller.signal);checkTerminal();assertCurrent();const details=new Map<string,RecommendationObservation>();let index=0,bytes=0;
 await Promise.all(Array.from({length:Math.min(4,first.recommendations.length)},async()=>{try{while(index<first.recommendations.length){checkTerminal();assertCurrent();const row=first.recommendations[index++],detail=await GamesClient.observeRecommendation(row.id,controller.signal);checkTerminal();assertCurrent();if(detail.detail.revision!==row.revision||detail.detail.categoryRevision!==first.revision)throw new ExplorersApiError(409,'CONFLICT','Games changed while loading');bytes+=new TextEncoder().encode(JSON.stringify(detail.detail)).byteLength;if(bytes>64*1024*1024)throw new ExplorersApiError(503,'READ_LIMIT','Games editable read limit exceeded');details.set(row.id,detail);}}catch(error){fail(error);}}));
 checkTerminal();const final=await GamesClient.readCompleteOwner(controller.signal);checkTerminal();assertCurrent();if(first.revision!==final.revision||first.pinRevision!==final.pinRevision)throw new ExplorersApiError(409,'CONFLICT','Games changed while loading');
 return {observation:final,details,view:gamesViewModel.complete(final,details,initial.user?.username??'')};
 }catch(error){return fail(error);}finally{signal?.removeEventListener('abort',forwardAbort);}
}
