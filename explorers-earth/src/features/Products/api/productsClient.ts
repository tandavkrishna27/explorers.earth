import {explorersApiClient,assertCompleteMyCategoryContent,assertOwnerDetailObservation,ExplorersApiError,type CompleteMyCategoryContent,type CollectionObservation,type RecommendationObservation} from '../../../lib/explorersApiClient';
import {createRecommendationObjectSchema,type UpdateCollectionInput,type UpdateRecommendationInput} from '../../../../../tunes/shared/explorersContract';
import {resolveManualProductSchema,productOfferSchema,type ProductOffer} from '../../../../../tunes/shared/explorersProductContract';
import type {RichNote} from '../../../../../tunes/shared/explorersRichNoteContract';
import useAuthStore from '../../../store/store';

// Ticket 4.4. Products has no provider: the retired scraper is not revived, so every fact
// in a draft is owner-entered. productUrl is required because 0044 declares
// product_url NOT NULL, and the offer travels as exact decimal strings.

export type CompleteProductsOwnerContent=CompleteMyCategoryContent&{readonly category:'products'};
export type ManualProductDraft={
 title:string;productUrl:string;brand:string|null;logoUrl:string|null;description:string|null;
 specifications:{key:string;value:string}[];imageUrls:string[];
 offer:ProductOffer;note:RichNote|null;userRating:number|null;mediaIds:string[];
};
export type ManualProductIntent=Readonly<{entityKey:string;recommendationKey:string;parent:CollectionObservation;draft:Readonly<ManualProductDraft>}>;
export type ProductMembershipIntent=Readonly<{parent:CollectionObservation;item:RecommendationObservation;attached:boolean;commandKey:string}>;

const intents=new WeakMap<object,{accountId:string|null;generation:number;route:string}>();
const membershipIntents=new WeakMap<object,{accountId:string|null;generation:number;route:string}>();
const route=()=>typeof window==='undefined'?'':window.location.pathname;
const key=()=>crypto.randomUUID();
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object'&&!Object.isFrozen(child))freeze(child);}return value;}
function fail():never{throw new ExplorersApiError(409,'CONFLICT','Products owner changed. Refresh before saving.');}
function current(scope:{accountId:string|null;generation:number;route:string},signal?:AbortSignal){const state=useAuthStore.getState();if(signal?.aborted||!state.isAuthenticated||state.accountId!==scope.accountId||state.generation!==scope.generation||route()!==scope.route)fail();}
function collection(value:CollectionObservation){assertOwnerDetailObservation(value,'collection');if(value.detail.category!=='products')fail();}
function recommendation(value:RecommendationObservation){assertOwnerDetailObservation(value,'recommendation');if(value.detail.category!=='products')fail();}
function complete(value:CompleteMyCategoryContent):asserts value is CompleteProductsOwnerContent{assertCompleteMyCategoryContent(value);if(value.category!=='products')fail();}

export const ProductsClient={
 prepareMembershipIntent(parent:CollectionObservation,item:RecommendationObservation,attached:boolean):ProductMembershipIntent{
  collection(parent);recommendation(item);if(parent.accountId!==item.accountId||parent.generation!==item.generation||typeof attached!=='boolean')fail();
  const intent=freeze({parent,item,attached,commandKey:key()}),state=useAuthStore.getState();
  membershipIntents.set(intent,{accountId:state.accountId,generation:state.generation,route:route()});return intent;
 },
 async saveMembership(intent:ProductMembershipIntent,signal?:AbortSignal){
  const scope=membershipIntents.get(intent);if(!scope)fail();current(scope,signal);collection(intent.parent);recommendation(intent.item);
  const result=await (intent.attached?explorersApiClient.attachMyProductMembership:explorersApiClient.detachMyProductMembership)(intent.parent,intent.item,intent.commandKey,signal);
  current(scope,signal);return result;
 },
 // Product imagery is owner media through the native media route, never the Strapi upload.
 async upload(file:File,_commandKey:string,signal?:AbortSignal){const state=useAuthStore.getState(),scope={accountId:state.accountId,generation:state.generation,route:route()};current(scope,signal);const media=await explorersApiClient.createMedia(file,'recommendation',signal);current(scope,signal);return media;},
 async readCompleteOwner(signal?:AbortSignal):Promise<CompleteProductsOwnerContent>{const value=await explorersApiClient.getCompleteMyCategoryContent({category:'products',status:'active'},signal,true);complete(value);return value;},
 async observeCollection(id:string,signal?:AbortSignal){const value=await explorersApiClient.getMyEditableCollection(id,signal);collection(value);return value;},
 async observeRecommendation(id:string,signal?:AbortSignal){const value=await explorersApiClient.getMyEditableRecommendation(id,signal);recommendation(value);return value;},
 prepareManualIntent(parent:CollectionObservation,draft:ManualProductDraft):ManualProductIntent{
  collection(parent);
  // The whole typed details object is validated here, not just the title: a product
  // entity cannot exist without its merchant URL.
  const details=resolveManualProductSchema.parse({kind:'manual',category:'products',details:{
   title:draft.title,productUrl:draft.productUrl,brand:draft.brand,logoUrl:draft.logoUrl,
   description:draft.description,specifications:draft.specifications,imageUrls:draft.imageUrls,
  }}).details;
  // The offer is validated separately because its rules are its own: a known currency
  // constrains the amount's precision, and an unknown currency is still legitimate.
  const offer=productOfferSchema.parse(draft.offer);
  const normalized=createRecommendationObjectSchema.omit({collectionId:true,expectedCollectionRevision:true,category:true,entityId:true}).strict()
   .parse({note:draft.note,userRating:draft.userRating,mediaIds:draft.mediaIds,publicationState:'draft',productOffer:offer});
  const intent=freeze({entityKey:key(),recommendationKey:key(),parent,draft:{
   ...draft,...details,offer,note:normalized.note,userRating:normalized.userRating,mediaIds:[...normalized.mediaIds],
  }});
  const state=useAuthStore.getState();intents.set(intent,{accountId:state.accountId,generation:state.generation,route:route()});return intent;
 },
 async createManual(intent:ManualProductIntent,signal?:AbortSignal){
  const scope=intents.get(intent);if(!scope)fail();current(scope,signal);collection(intent.parent);
  const {title,productUrl,brand,logoUrl,description,specifications,imageUrls}=intent.draft;
  const entity=await explorersApiClient.resolveProductEntity({kind:'manual',category:'products',details:{title,productUrl,brand,logoUrl,description,specifications:specifications.map(entry=>({key:entry.key,value:entry.value})),imageUrls:[...imageUrls]}},intent.entityKey,signal);
  current(scope,signal);collection(intent.parent);
  const result=await explorersApiClient.createMyRecommendation(intent.parent,{entityId:entity.id,note:intent.draft.note,userRating:intent.draft.userRating,mediaIds:[...intent.draft.mediaIds],publicationState:'draft',productOffer:intent.draft.offer},intent.recommendationKey,signal);
  current(scope,signal);return result;
 },
 // Ticket 5.2. A list created from a location is linked in the same command, so a
 // failed parent leaves no orphan list behind.
 createCollection(input:{title:string;slug:string;description?:string|null;parentLocationCollectionId?:string},commandKey:string,signal?:AbortSignal,parentObservation?:CollectionObservation){return explorersApiClient.createMyCollection({...input,category:'products',visibility:'private',publicationState:'draft'},commandKey,signal,parentObservation);},
 updateCollection(observed:CollectionObservation,patch:Omit<UpdateCollectionInput,'expectedRevision'>,commandKey:string,signal?:AbortSignal){collection(observed);return explorersApiClient.updateMyCollection(observed,patch,commandKey,signal);},
 archiveCollection(observed:CollectionObservation,commandKey:string,signal?:AbortSignal){collection(observed);return explorersApiClient.archiveMyCollection(observed,commandKey,signal);},
 updateRecommendation(observed:RecommendationObservation,patch:Omit<UpdateRecommendationInput,'expectedRevision'>,commandKey:string,signal?:AbortSignal){recommendation(observed);return explorersApiClient.updateMyRecommendation(observed,patch,commandKey,signal);},
 archiveRecommendation(observed:RecommendationObservation,commandKey:string,signal?:AbortSignal){recommendation(observed);return explorersApiClient.archiveMyRecommendation(observed,commandKey,signal);},
 reorderCollection(observed:CompleteProductsOwnerContent,id:string,ids:string[],commandKey:string,signal?:AbortSignal){complete(observed);return explorersApiClient.reorderMyCollection(observed,id,ids,commandKey,signal);},
 setTopPicks(observed:CompleteProductsOwnerContent,pins:Parameters<typeof explorersApiClient.setMyCategoryTopPicks>[1],commandKey:string,signal?:AbortSignal){complete(observed);return explorersApiClient.setMyCategoryTopPicks(observed,pins,commandKey,signal);},
};
