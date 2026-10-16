import {explorersApiClient,assertCompleteMyCategoryContent,assertOwnerDetailObservation,ExplorersApiError,type CompleteMyCategoryContent,type CollectionObservation,type RecommendationObservation} from '../../../lib/explorersApiClient';
import {resolveManualEntitySchema,createRecommendationObjectSchema,type UpdateCollectionInput,type UpdateRecommendationInput} from '../../../../../tunes/shared/explorersContract';
import type {RichNote} from '../../../../../tunes/shared/explorersRichNoteContract';
import useAuthStore from '../../../store/store';
export type CompleteGamesOwnerContent=CompleteMyCategoryContent&{readonly category:'games'};
export type ManualGameDraft={title:string;note:RichNote|null;userRating:number|null;mediaIds:string[]};
export type ManualGameIntent=Readonly<{entityKey:string;recommendationKey:string;parent:CollectionObservation;draft:Readonly<ManualGameDraft>}>;
export type GameMembershipIntent=Readonly<{parent:CollectionObservation;item:RecommendationObservation;attached:boolean;commandKey:string}>;
const intents=new WeakMap<object,{accountId:string|null;generation:number;route:string}>();
const membershipIntents=new WeakMap<object,{accountId:string|null;generation:number;route:string}>();
const route=()=>typeof window==='undefined'?'':window.location.pathname;
const key=()=>crypto.randomUUID();
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object'&&!Object.isFrozen(child))freeze(child);}return value;}
function fail():never{throw new ExplorersApiError(409,'CONFLICT','Games owner changed. Refresh before saving.');}
function current(scope:{accountId:string|null;generation:number;route:string},signal?:AbortSignal){const state=useAuthStore.getState();if(signal?.aborted||!state.isAuthenticated||state.accountId!==scope.accountId||state.generation!==scope.generation||route()!==scope.route)fail();}
function collection(value:CollectionObservation){assertOwnerDetailObservation(value,'collection');if(value.detail.category!=='games')fail();}
function recommendation(value:RecommendationObservation){assertOwnerDetailObservation(value,'recommendation');if(value.detail.category!=='games')fail();}
function complete(value:CompleteMyCategoryContent):asserts value is CompleteGamesOwnerContent{assertCompleteMyCategoryContent(value);if(value.category!=='games')fail();}
export const GamesClient={
 prepareMembershipIntent(parent:CollectionObservation,item:RecommendationObservation,attached:boolean):GameMembershipIntent{
  collection(parent);recommendation(item);if(parent.accountId!==item.accountId||parent.generation!==item.generation||typeof attached!=='boolean')fail();
  const intent=freeze({parent,item,attached,commandKey:key()}),state=useAuthStore.getState();membershipIntents.set(intent,{accountId:state.accountId,generation:state.generation,route:route()});return intent;
 },
 async saveMembership(intent:GameMembershipIntent,signal?:AbortSignal){
  const scope=membershipIntents.get(intent);if(!scope)fail();current(scope,signal);collection(intent.parent);recommendation(intent.item);
  const result=await (intent.attached?explorersApiClient.attachMyGameMembership:explorersApiClient.detachMyGameMembership)(intent.parent,intent.item,intent.commandKey,signal);
  current(scope,signal);return result;
 },
 async readCompleteOwner(signal?:AbortSignal):Promise<CompleteGamesOwnerContent>{const value=await explorersApiClient.getCompleteMyCategoryContent({category:'games',status:'active'},signal,true);complete(value);return value;},
 async observeCollection(id:string,signal?:AbortSignal){const value=await explorersApiClient.getMyEditableCollection(id,signal);collection(value);return value;},
 async observeRecommendation(id:string,signal?:AbortSignal){const value=await explorersApiClient.getMyEditableRecommendation(id,signal);recommendation(value);return value;},
 prepareManualIntent(parent:CollectionObservation,draft:ManualGameDraft):ManualGameIntent{
  collection(parent);const title=resolveManualEntitySchema.parse({kind:'manual',category:'games',details:{title:draft.title}}).details.title;
  const normalized=createRecommendationObjectSchema.omit({collectionId:true,expectedCollectionRevision:true,category:true,entityId:true}).strict().parse({note:draft.note,userRating:draft.userRating,mediaIds:draft.mediaIds,publicationState:'draft'});
  const intent=freeze({entityKey:key(),recommendationKey:key(),parent,draft:{title,note:normalized.note,userRating:normalized.userRating,mediaIds:[...normalized.mediaIds]}});
  const state=useAuthStore.getState();intents.set(intent,{accountId:state.accountId,generation:state.generation,route:route()});return intent;
 },
 async createManual(intent:ManualGameIntent,signal?:AbortSignal){const scope=intents.get(intent);if(!scope)fail();current(scope,signal);collection(intent.parent);
  const entity=await explorersApiClient.resolveManualEntity({kind:'manual',category:'games',details:{title:intent.draft.title}},intent.entityKey,signal);
  current(scope,signal);collection(intent.parent);
  const result=await explorersApiClient.createMyRecommendation(intent.parent,{entityId:entity.id,note:intent.draft.note,userRating:intent.draft.userRating,mediaIds:[...intent.draft.mediaIds],publicationState:'draft'},intent.recommendationKey,signal);
  current(scope,signal);return result;
 },
 createCollection(input:{title:string;slug:string;description?:string|null},commandKey:string,signal?:AbortSignal){return explorersApiClient.createMyCollection({...input,category:'games',visibility:'private',publicationState:'draft'},commandKey,signal);},
 updateCollection(observed:CollectionObservation,patch:Omit<UpdateCollectionInput,'expectedRevision'>,commandKey:string,signal?:AbortSignal){collection(observed);return explorersApiClient.updateMyCollection(observed,patch,commandKey,signal);},
 archiveCollection(observed:CollectionObservation,commandKey:string,signal?:AbortSignal){collection(observed);return explorersApiClient.archiveMyCollection(observed,commandKey,signal);},
 updateRecommendation(observed:RecommendationObservation,patch:Omit<UpdateRecommendationInput,'expectedRevision'>,commandKey:string,signal?:AbortSignal){recommendation(observed);return explorersApiClient.updateMyRecommendation(observed,patch,commandKey,signal);},
 archiveRecommendation(observed:RecommendationObservation,commandKey:string,signal?:AbortSignal){recommendation(observed);return explorersApiClient.archiveMyRecommendation(observed,commandKey,signal);},
 reorderCollection(observed:CompleteGamesOwnerContent,id:string,ids:string[],commandKey:string,signal?:AbortSignal){complete(observed);return explorersApiClient.reorderMyCollection(observed,id,ids,commandKey,signal);},
 setTopPicks(observed:CompleteGamesOwnerContent,pins:Parameters<typeof explorersApiClient.setMyCategoryTopPicks>[1],commandKey:string,signal?:AbortSignal){complete(observed);return explorersApiClient.setMyCategoryTopPicks(observed,pins,commandKey,signal);},
 async upload(file:File,_commandKey:string,signal?:AbortSignal){const state=useAuthStore.getState(),scope={accountId:state.accountId,generation:state.generation,route:route()};current(scope,signal);const media=await explorersApiClient.createMedia(file,'recommendation',signal);current(scope,signal);return media;},
 search:explorersApiClient.searchGames,
 resolveProvider:explorersApiClient.resolveGameProvider,
};
