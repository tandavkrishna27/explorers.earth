import {explorersApiClient,assertCompleteMyCategoryContent,assertOwnerDetailObservation,ExplorersApiError,type CompleteMyCategoryContent,type CollectionObservation,type RecommendationObservation} from '../../../lib/explorersApiClient';
import {createRecommendationObjectSchema,type UpdateCollectionInput,type UpdateRecommendationInput} from '../../../../../tunes/shared/explorersContract';
import {resolveManualPersonSchema,personSocialUrlsSchema,type PersonPlatform,type PersonSocialUrls} from '../../../../../tunes/shared/explorersPersonContract';
import type {RichNote} from '../../../../../tunes/shared/explorersRichNoteContract';
import useAuthStore from '../../../store/store';

// Ticket 4.5. People has no provider, so every fact in a draft is owner-entered about a
// third party. Unlike Apps and Products there is no required URL: a person with nothing
// but a name is a legitimate record, so only the name is mandatory here.

export type CompletePeopleOwnerContent=CompleteMyCategoryContent&{readonly category:'people'};
export type ManualPersonDraft={
 title:string;usernameHandle:string|null;headline:string|null;locationText:string|null;
 avatarUrl:string|null;primaryPlatform:PersonPlatform|null;socialUrls:PersonSocialUrls;
 skillsTags:string[];externalFollowerCountText:string|null;
 note:RichNote|null;userRating:number|null;mediaIds:string[];
 peopleSectorTermId?:string|null;
};
export type ManualPersonIntent=Readonly<{entityKey:string;recommendationKey:string;parent:CollectionObservation;draft:Readonly<ManualPersonDraft>}>;
export type PersonMembershipIntent=Readonly<{parent:CollectionObservation;item:RecommendationObservation;attached:boolean;commandKey:string}>;

const intents=new WeakMap<object,{accountId:string|null;generation:number;route:string}>();
const membershipIntents=new WeakMap<object,{accountId:string|null;generation:number;route:string}>();
const route=()=>typeof window==='undefined'?'':window.location.pathname;
const key=()=>crypto.randomUUID();
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object'&&!Object.isFrozen(child))freeze(child);}return value;}
function fail():never{throw new ExplorersApiError(409,'CONFLICT','People owner changed. Refresh before saving.');}
function current(scope:{accountId:string|null;generation:number;route:string},signal?:AbortSignal){const state=useAuthStore.getState();if(signal?.aborted||!state.isAuthenticated||state.accountId!==scope.accountId||state.generation!==scope.generation||route()!==scope.route)fail();}
function collection(value:CollectionObservation){assertOwnerDetailObservation(value,'collection');if(value.detail.category!=='people')fail();}
function recommendation(value:RecommendationObservation){assertOwnerDetailObservation(value,'recommendation');if(value.detail.category!=='people')fail();}
function complete(value:CompleteMyCategoryContent):asserts value is CompletePeopleOwnerContent{assertCompleteMyCategoryContent(value);if(value.category!=='people')fail();}

export const PeopleClient={
 readSectorCatalog(signal?:AbortSignal){return explorersApiClient.getCompleteTaxonomyCatalog({category:'people'},signal);},
 prepareMembershipIntent(parent:CollectionObservation,item:RecommendationObservation,attached:boolean):PersonMembershipIntent{
  collection(parent);recommendation(item);if(parent.accountId!==item.accountId||parent.generation!==item.generation||typeof attached!=='boolean')fail();
  const intent=freeze({parent,item,attached,commandKey:key()}),state=useAuthStore.getState();
  membershipIntents.set(intent,{accountId:state.accountId,generation:state.generation,route:route()});return intent;
 },
 async saveMembership(intent:PersonMembershipIntent,signal?:AbortSignal){
  const scope=membershipIntents.get(intent);if(!scope)fail();current(scope,signal);collection(intent.parent);recommendation(intent.item);
  const result=await (intent.attached?explorersApiClient.attachMyPersonMembership:explorersApiClient.detachMyPersonMembership)(intent.parent,intent.item,intent.commandKey,signal);
  current(scope,signal);return result;
 },
 // Avatar and other imagery are owner media through the native route, never the Strapi
 // upload and never an address scraped from a third party's profile.
 async upload(file:File,_commandKey:string,signal?:AbortSignal){const state=useAuthStore.getState(),scope={accountId:state.accountId,generation:state.generation,route:route()};current(scope,signal);const media=await explorersApiClient.createMedia(file,'recommendation',signal);current(scope,signal);return media;},
 async readCompleteOwner(signal?:AbortSignal):Promise<CompletePeopleOwnerContent>{const value=await explorersApiClient.getCompleteMyCategoryContent({category:'people',status:'active'},signal,true);complete(value);return value;},
 async observeCollection(id:string,signal?:AbortSignal){const value=await explorersApiClient.getMyEditableCollection(id,signal);collection(value);return value;},
 async observeRecommendation(id:string,signal?:AbortSignal){const value=await explorersApiClient.getMyEditableRecommendation(id,signal);recommendation(value);return value;},
 prepareManualIntent(parent:CollectionObservation,draft:ManualPersonDraft):ManualPersonIntent{
  collection(parent);
  // Only the name is required: every other column is nullable in 0045.
  const details=resolveManualPersonSchema.parse({kind:'manual',category:'people',details:{
   title:draft.title,usernameHandle:draft.usernameHandle,headline:draft.headline,locationText:draft.locationText,
   avatarUrl:draft.avatarUrl,primaryPlatform:draft.primaryPlatform,
   socialUrls:personSocialUrlsSchema.parse(draft.socialUrls),skillsTags:draft.skillsTags,
   externalFollowerCountText:draft.externalFollowerCountText,
  }}).details;
  const normalized=createRecommendationObjectSchema.omit({collectionId:true,expectedCollectionRevision:true,category:true,entityId:true}).strict()
   .parse({note:draft.note,userRating:draft.userRating,mediaIds:draft.mediaIds,publicationState:'draft',...(draft.peopleSectorTermId===undefined?{}:{peopleSectorTermId:draft.peopleSectorTermId})});
  const intent=freeze({entityKey:key(),recommendationKey:key(),parent,draft:{
   ...draft,...details,note:normalized.note,userRating:normalized.userRating,mediaIds:[...normalized.mediaIds],...(normalized.peopleSectorTermId===undefined?{}:{peopleSectorTermId:normalized.peopleSectorTermId}),
  }});
  const state=useAuthStore.getState();intents.set(intent,{accountId:state.accountId,generation:state.generation,route:route()});return intent;
 },
 async createManual(intent:ManualPersonIntent,signal?:AbortSignal){
  const scope=intents.get(intent);if(!scope)fail();current(scope,signal);collection(intent.parent);
  const {title,usernameHandle,headline,locationText,avatarUrl,primaryPlatform,socialUrls,skillsTags,externalFollowerCountText}=intent.draft;
  const entity=await explorersApiClient.resolvePersonEntity({kind:'manual',category:'people',details:{title,usernameHandle,headline,locationText,avatarUrl,primaryPlatform,socialUrls:{...socialUrls},skillsTags:[...skillsTags],externalFollowerCountText}},intent.entityKey,signal);
  current(scope,signal);collection(intent.parent);
  const result=await explorersApiClient.createMyRecommendation(intent.parent,{entityId:entity.id,note:intent.draft.note,userRating:intent.draft.userRating,mediaIds:[...intent.draft.mediaIds],publicationState:'draft',...(intent.draft.peopleSectorTermId===undefined?{}:{peopleSectorTermId:intent.draft.peopleSectorTermId})},intent.recommendationKey,signal);
  current(scope,signal);return result;
 },
 // Ticket 5.2. A list created from a location is linked in the same command, so a
 // failed parent leaves no orphan list behind.
 createCollection(input:{title:string;slug:string;description?:string|null;parentLocationCollectionId?:string},commandKey:string,signal?:AbortSignal,parentObservation?:CollectionObservation){return explorersApiClient.createMyCollection({...input,category:'people',visibility:'private',publicationState:'draft'},commandKey,signal,parentObservation);},
 updateCollection(observed:CollectionObservation,patch:Omit<UpdateCollectionInput,'expectedRevision'>,commandKey:string,signal?:AbortSignal){collection(observed);return explorersApiClient.updateMyCollection(observed,patch,commandKey,signal);},
 archiveCollection(observed:CollectionObservation,commandKey:string,signal?:AbortSignal){collection(observed);return explorersApiClient.archiveMyCollection(observed,commandKey,signal);},
 updateRecommendation(observed:RecommendationObservation,patch:Omit<UpdateRecommendationInput,'expectedRevision'>,commandKey:string,signal?:AbortSignal){recommendation(observed);return explorersApiClient.updateMyRecommendation(observed,patch,commandKey,signal);},
 archiveRecommendation(observed:RecommendationObservation,commandKey:string,signal?:AbortSignal){recommendation(observed);return explorersApiClient.archiveMyRecommendation(observed,commandKey,signal);},
 reorderCollection(observed:CompletePeopleOwnerContent,id:string,ids:string[],commandKey:string,signal?:AbortSignal){complete(observed);return explorersApiClient.reorderMyCollection(observed,id,ids,commandKey,signal);},
 setTopPicks(observed:CompletePeopleOwnerContent,pins:Parameters<typeof explorersApiClient.setMyCategoryTopPicks>[1],commandKey:string,signal?:AbortSignal){complete(observed);return explorersApiClient.setMyCategoryTopPicks(observed,pins,commandKey,signal);},
};
