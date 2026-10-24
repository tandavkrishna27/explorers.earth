import {explorersApiClient,assertCompleteMyCategoryContent,assertOwnerDetailObservation,ExplorersApiError,type CompleteMyCategoryContent,type CollectionObservation,type RecommendationObservation} from '../../../lib/explorersApiClient';
import {createRecommendationObjectSchema,type UpdateCollectionInput,type UpdateRecommendationInput} from '../../../../../tunes/shared/explorersContract';
import {resolveManualAppSchema,appScreenshotsSchema,type AppOtherLink} from '../../../../../tunes/shared/explorersAppContract';
import type {RichNote} from '../../../../../tunes/shared/explorersRichNoteContract';
import useAuthStore from '../../../store/store';

// Ticket 4.3 / WP8. The App Store search lives in linkPreviewClient.searchApps (catalog
// route); a picked hit only prefills the form, so every fact in a draft is still
// owner-confirmed and resolved manually here. appUrl is required because 0043 declares
// app_url NOT NULL; otherLinks (0068) carries up to four other platform links.

export type CompleteAppsOwnerContent=CompleteMyCategoryContent&{readonly category:'apps'};
export type ManualAppDraft={
 title:string;appUrl:string;developer:string|null;logoUrl:string|null;description:string|null;
 downloadUrl:string|null;priceTier:'Free'|'Freemium'|'Paid'|'Subscription'|null;platforms:string[];
 otherLinks:AppOtherLink[];
 /** WP7 curated category. Absent leaves the assignment alone; null clears it. */
 curatedTermId?:string|null;
 note:RichNote|null;userRating:number|null;mediaIds:string[];screenshotMediaIds:string[];
};
export type ManualAppIntent=Readonly<{entityKey:string;recommendationKey:string;parent:CollectionObservation;draft:Readonly<ManualAppDraft>}>;
export type AppMembershipIntent=Readonly<{parent:CollectionObservation;item:RecommendationObservation;attached:boolean;commandKey:string}>;

const intents=new WeakMap<object,{accountId:string|null;generation:number;route:string}>();
const membershipIntents=new WeakMap<object,{accountId:string|null;generation:number;route:string}>();
const route=()=>typeof window==='undefined'?'':window.location.pathname;
const key=()=>crypto.randomUUID();
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object'&&!Object.isFrozen(child))freeze(child);}return value;}
function fail():never{throw new ExplorersApiError(409,'CONFLICT','Apps owner changed. Refresh before saving.');}
function current(scope:{accountId:string|null;generation:number;route:string},signal?:AbortSignal){const state=useAuthStore.getState();if(signal?.aborted||!state.isAuthenticated||state.accountId!==scope.accountId||state.generation!==scope.generation||route()!==scope.route)fail();}
function collection(value:CollectionObservation){assertOwnerDetailObservation(value,'collection');if(value.detail.category!=='apps')fail();}
function recommendation(value:RecommendationObservation){assertOwnerDetailObservation(value,'recommendation');if(value.detail.category!=='apps')fail();}
function complete(value:CompleteMyCategoryContent):asserts value is CompleteAppsOwnerContent{assertCompleteMyCategoryContent(value);if(value.category!=='apps')fail();}

export const AppsClient={
 prepareMembershipIntent(parent:CollectionObservation,item:RecommendationObservation,attached:boolean):AppMembershipIntent{
  collection(parent);recommendation(item);if(parent.accountId!==item.accountId||parent.generation!==item.generation||typeof attached!=='boolean')fail();
  const intent=freeze({parent,item,attached,commandKey:key()}),state=useAuthStore.getState();
  membershipIntents.set(intent,{accountId:state.accountId,generation:state.generation,route:route()});return intent;
 },
 async saveMembership(intent:AppMembershipIntent,signal?:AbortSignal){
  const scope=membershipIntents.get(intent);if(!scope)fail();current(scope,signal);collection(intent.parent);recommendation(intent.item);
  const result=await (intent.attached?explorersApiClient.attachMyAppMembership:explorersApiClient.detachMyAppMembership)(intent.parent,intent.item,intent.commandKey,signal);
  current(scope,signal);return result;
 },
 // Screenshots are owner uploads stored as media assets, so they go through the native
 // media route rather than the Strapi /upload the add page used to post to.
 async upload(file:File,_commandKey:string,signal?:AbortSignal){const state=useAuthStore.getState(),scope={accountId:state.accountId,generation:state.generation,route:route()};current(scope,signal);const media=await explorersApiClient.createMedia(file,'recommendation',signal);current(scope,signal);return media;},
 async readCompleteOwner(signal?:AbortSignal):Promise<CompleteAppsOwnerContent>{const value=await explorersApiClient.getCompleteMyCategoryContent({category:'apps',status:'active'},signal,true);complete(value);return value;},
 async observeCollection(id:string,signal?:AbortSignal){const value=await explorersApiClient.getMyEditableCollection(id,signal);collection(value);return value;},
 async observeRecommendation(id:string,signal?:AbortSignal){const value=await explorersApiClient.getMyEditableRecommendation(id,signal);recommendation(value);return value;},
 prepareManualIntent(parent:CollectionObservation,draft:ManualAppDraft):ManualAppIntent{
  collection(parent);
  // The whole typed details object is validated here, not just the title, because an App
  // entity cannot exist without its URL.
  const details=resolveManualAppSchema.parse({kind:'manual',category:'apps',details:{
   title:draft.title,appUrl:draft.appUrl,developer:draft.developer,logoUrl:draft.logoUrl,
   description:draft.description,downloadUrl:draft.downloadUrl,priceTier:draft.priceTier,platforms:draft.platforms,otherLinks:draft.otherLinks,
  }}).details;
  const normalized=createRecommendationObjectSchema.omit({collectionId:true,expectedCollectionRevision:true,category:true,entityId:true}).strict()
   .parse({note:draft.note,userRating:draft.userRating,mediaIds:draft.mediaIds,publicationState:'draft',appScreenshots:{screenshotMediaIds:draft.screenshotMediaIds},...(draft.curatedTermId===undefined?{}:{curatedTermId:draft.curatedTermId})});
  const screenshots=appScreenshotsSchema.parse({screenshotMediaIds:draft.screenshotMediaIds});
  const intent=freeze({entityKey:key(),recommendationKey:key(),parent,draft:{
   ...draft,...details,note:normalized.note,userRating:normalized.userRating,
   mediaIds:[...normalized.mediaIds],screenshotMediaIds:[...screenshots.screenshotMediaIds],
  }});
  const state=useAuthStore.getState();intents.set(intent,{accountId:state.accountId,generation:state.generation,route:route()});return intent;
 },
 async createManual(intent:ManualAppIntent,signal?:AbortSignal){
  const scope=intents.get(intent);if(!scope)fail();current(scope,signal);collection(intent.parent);
  const {title,appUrl,developer,logoUrl,description,downloadUrl,priceTier,platforms,otherLinks}=intent.draft;
  const entity=await explorersApiClient.resolveAppEntity({kind:'manual',category:'apps',details:{title,appUrl,developer,logoUrl,description,downloadUrl,priceTier,platforms:[...platforms],otherLinks:otherLinks.map(link=>({...link}))}},intent.entityKey,signal);
  current(scope,signal);collection(intent.parent);
  const result=await explorersApiClient.createMyRecommendation(intent.parent,{entityId:entity.id,note:intent.draft.note,userRating:intent.draft.userRating,mediaIds:[...intent.draft.mediaIds],publicationState:'draft',appScreenshots:{screenshotMediaIds:[...intent.draft.screenshotMediaIds]},...(intent.draft.curatedTermId===undefined?{}:{curatedTermId:intent.draft.curatedTermId})},intent.recommendationKey,signal);
  current(scope,signal);return result;
 },
 createCollection(input:{title:string;slug:string;description?:string|null},commandKey:string,signal?:AbortSignal){return explorersApiClient.createMyCollection({...input,category:'apps',visibility:'private',publicationState:'draft'},commandKey,signal);},
 updateCollection(observed:CollectionObservation,patch:Omit<UpdateCollectionInput,'expectedRevision'>,commandKey:string,signal?:AbortSignal){collection(observed);return explorersApiClient.updateMyCollection(observed,patch,commandKey,signal);},
 archiveCollection(observed:CollectionObservation,commandKey:string,signal?:AbortSignal){collection(observed);return explorersApiClient.archiveMyCollection(observed,commandKey,signal);},
 updateRecommendation(observed:RecommendationObservation,patch:Omit<UpdateRecommendationInput,'expectedRevision'>,commandKey:string,signal?:AbortSignal){recommendation(observed);return explorersApiClient.updateMyRecommendation(observed,patch,commandKey,signal);},
 archiveRecommendation(observed:RecommendationObservation,commandKey:string,signal?:AbortSignal){recommendation(observed);return explorersApiClient.archiveMyRecommendation(observed,commandKey,signal);},
 reorderCollection(observed:CompleteAppsOwnerContent,id:string,ids:string[],commandKey:string,signal?:AbortSignal){complete(observed);return explorersApiClient.reorderMyCollection(observed,id,ids,commandKey,signal);},
 setTopPicks(observed:CompleteAppsOwnerContent,pins:Parameters<typeof explorersApiClient.setMyCategoryTopPicks>[1],commandKey:string,signal?:AbortSignal){complete(observed);return explorersApiClient.setMyCategoryTopPicks(observed,pins,commandKey,signal);},
};
