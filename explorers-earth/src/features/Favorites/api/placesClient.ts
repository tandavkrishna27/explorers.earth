import {explorersApiClient,assertCompleteMyCategoryContent,assertOwnerDetailObservation,ExplorersApiError,type CompleteMyCategoryContent,type CollectionObservation,type RecommendationObservation} from '../../../lib/explorersApiClient';
import {createRecommendationObjectSchema,type UpdateCollectionInput,type UpdateRecommendationInput} from '../../../../../tunes/shared/explorersContract';
import {resolveManualPlaceSchema,placeRecommendationContextSchema,placeCollectionDetailsSchema,emptyPlaceContext,emptyPlaceDetails,
 type PlaceEntityDetails,type PlaceRecommendationContext,type PlaceCollectionDetails} from '../../../../../tunes/shared/explorersPlaceContract';
import {resolveManualPersonSchema} from '../../../../../tunes/shared/explorersPersonContract';
import type {RichNote} from '../../../../../tunes/shared/explorersRichNoteContract';
import useAuthStore from '../../../store/store';
import {placesTaxonomyAssignmentSchema,type PlacesTaxonomyAssignment} from '../../../../../tunes/shared/explorersTaxonomyContract';

// Ticket 5.1. Places lives in the Favorites feature because it is the original
// "recommendations" category - its visibility flag is still public_recommendations.
//
// Two things are specific to Places. A list carries its own location selection, which is
// what keeps a location list distinct from the places inside it. And a recommendation
// carries the creator's own context, including contact details that stay private unless
// they choose otherwise - so the draft below starts from emptyPlaceContext rather than
// from whatever a form happened to leave set.

export type CompletePlacesOwnerContent=CompleteMyCategoryContent&{readonly category:'places'};
export type ManualPlaceDraft={
 title:string;details:Partial<PlaceEntityDetails>;
 context:PlaceRecommendationContext;
 note:RichNote|null;userRating:number|null;photoMediaIds:string[];
 placesTaxonomy?:PlacesTaxonomyAssignment;
};
export type ManualPlaceIntent=Readonly<{entityKey:string;recommendationKey:string;parent:CollectionObservation;draft:Readonly<ManualPlaceDraft>}>;
export type PlaceMembershipIntent=Readonly<{parent:CollectionObservation;item:RecommendationObservation;attached:boolean;commandKey:string}>;

const intents=new WeakMap<object,{accountId:string|null;generation:number;route:string}>();
const membershipIntents=new WeakMap<object,{accountId:string|null;generation:number;route:string}>();
// A person recommendation inside a Places list resolves a person entity rather than a
// place; the intent records which, so the resolve cannot be chosen at save time.
const personIntents=new WeakSet<object>();
const route=()=>typeof window==='undefined'?'':window.location.pathname;
const key=()=>crypto.randomUUID();
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object'&&!Object.isFrozen(child))freeze(child);}return value;}
function fail():never{throw new ExplorersApiError(409,'CONFLICT','Places owner changed. Refresh before saving.');}
function current(scope:{accountId:string|null;generation:number;route:string},signal?:AbortSignal){const state=useAuthStore.getState();if(signal?.aborted||!state.isAuthenticated||state.accountId!==scope.accountId||state.generation!==scope.generation||route()!==scope.route)fail();}
function collection(value:CollectionObservation){assertOwnerDetailObservation(value,'collection');if(value.detail.category!=='places')fail();}
function recommendation(value:RecommendationObservation){assertOwnerDetailObservation(value,'recommendation');if(value.detail.category!=='places')fail();}
function complete(value:CompleteMyCategoryContent):asserts value is CompletePlacesOwnerContent{assertCompleteMyCategoryContent(value);if(value.category!=='places')fail();}

export const PlacesClient={
 readTaxonomyCatalog(signal?:AbortSignal){return explorersApiClient.getCompleteTaxonomyCatalog({category:'places'},signal);},
 prepareMembershipIntent(parent:CollectionObservation,item:RecommendationObservation,attached:boolean):PlaceMembershipIntent{
  collection(parent);recommendation(item);if(parent.accountId!==item.accountId||parent.generation!==item.generation||typeof attached!=='boolean')fail();
  const intent=freeze({parent,item,attached,commandKey:key()}),state=useAuthStore.getState();
  membershipIntents.set(intent,{accountId:state.accountId,generation:state.generation,route:route()});return intent;
 },
 async saveMembership(intent:PlaceMembershipIntent,signal?:AbortSignal){
  const scope=membershipIntents.get(intent);if(!scope)fail();current(scope,signal);collection(intent.parent);recommendation(intent.item);
  const result=await (intent.attached?explorersApiClient.attachMyPlaceMembership:explorersApiClient.detachMyPlaceMembership)(intent.parent,intent.item,intent.commandKey,signal);
  current(scope,signal);return result;
 },
 // A place gallery is owned media in S3, so provider imagery is imported rather than
 // linked and nothing here references a provider URL.
 async upload(file:File,purpose:'recommendation'|'collection'='recommendation',signal?:AbortSignal){const state=useAuthStore.getState(),scope={accountId:state.accountId,generation:state.generation,route:route()};current(scope,signal);const media=await explorersApiClient.createMedia(file,purpose,signal);current(scope,signal);return media;},
 async importPlacePhoto(photoUri:string,purpose:'collection'|'recommendation'='collection',signal?:AbortSignal){const state=useAuthStore.getState(),scope={accountId:state.accountId,generation:state.generation,route:route()};current(scope,signal);const media=await explorersApiClient.importPlacePhoto(photoUri,purpose,signal);current(scope,signal);return media;},
 // Places is not a top-pick category (topPickCategorySchema covers books, movies,
 // games, apps, products and people), so this read asks for none. Requesting them
 // made the whole read throw 422 before a request went out.
 async readCompleteOwner(signal?:AbortSignal):Promise<CompletePlacesOwnerContent>{const value=await explorersApiClient.getCompleteMyCategoryContent({category:'places',status:'active'},signal);complete(value);return value;},
 async observeCollection(id:string,signal?:AbortSignal){const value=await explorersApiClient.getMyEditableCollection(id,signal);collection(value);return value;},
 async observeLocationChild(id:string,signal?:AbortSignal){
  const value=await explorersApiClient.getMyEditableCollection(id,signal);
  assertOwnerDetailObservation(value,'collection');
  if(value.detail.category!=='products'&&value.detail.category!=='people')fail();
  return value;
 },
 async observeRecommendation(id:string,signal?:AbortSignal){const value=await explorersApiClient.getMyEditableRecommendation(id,signal);recommendation(value);return value;},
 prepareManualIntent(parent:CollectionObservation,draft:ManualPlaceDraft):ManualPlaceIntent{
  collection(parent);
  const taxonomy=draft.placesTaxonomy===undefined?{}:{placesTaxonomy:placesTaxonomyAssignmentSchema.parse(draft.placesTaxonomy)};
  // Only the title is required: every place column is nullable, and a half-known
  // coordinate pair is refused by the contract rather than stored.
  const details=resolveManualPlaceSchema.parse({kind:'manual',category:'places',details:{title:draft.title,...draft.details}}).details;
  // The context is validated separately because its rules are its own: contact
  // disclosure, and person fields only on a person recommendation.
  const context=placeRecommendationContextSchema.parse({...emptyPlaceContext(),...draft.context});
  const normalized=createRecommendationObjectSchema.omit({collectionId:true,expectedCollectionRevision:true,category:true,entityId:true}).strict()
   .parse({note:draft.note,userRating:draft.userRating,publicationState:'published',placeContext:context,placePhotos:{photoMediaIds:draft.photoMediaIds}});
  const intent=freeze({entityKey:key(),recommendationKey:key(),parent,draft:{
   ...draft,...taxonomy,title:details.title,details,context,note:normalized.note,userRating:normalized.userRating,
   photoMediaIds:[...draft.photoMediaIds],
  }});
  const state=useAuthStore.getState();intents.set(intent,{accountId:state.accountId,generation:state.generation,route:route()});return intent;
 },
 async createManual(intent:ManualPlaceIntent,signal?:AbortSignal){
  const scope=intents.get(intent);if(!scope)fail();current(scope,signal);collection(intent.parent);
  const entity=personIntents.has(intent)
   ?await explorersApiClient.resolvePersonEntity({kind:'manual',category:'people',details:{title:intent.draft.title}},intent.entityKey,signal)
   :await explorersApiClient.resolvePlaceEntity({kind:'manual',category:'places',details:{...intent.draft.details,title:intent.draft.title}},intent.entityKey,signal);
  current(scope,signal);collection(intent.parent);
  const result=await explorersApiClient.createMyRecommendation(intent.parent,{entityId:entity.id,note:intent.draft.note,userRating:intent.draft.userRating,
   publicationState:'published',placeContext:intent.draft.context,placePhotos:{photoMediaIds:[...intent.draft.photoMediaIds]},...(intent.draft.placesTaxonomy===undefined?{}:{placesTaxonomy:intent.draft.placesTaxonomy})},intent.recommendationKey,signal);
  current(scope,signal);return result;
 },
 /**
  * A Places list may hold a person recommendation - the legacy Recommendation_Type
  * 'person'. The entity is a person, so the person resolve supplies it; the
  * recommendation stays in the Places list with a person context, and no place facts
  * are invented for it.
  */
 prepareManualPersonIntent(parent:CollectionObservation,draft:ManualPlaceDraft):ManualPlaceIntent{
  collection(parent);
  const taxonomy=draft.placesTaxonomy===undefined?{}:{placesTaxonomy:placesTaxonomyAssignmentSchema.parse(draft.placesTaxonomy)};
  const details=resolveManualPersonSchema.parse({kind:'manual',category:'people',details:{title:draft.title}}).details;
  const context=placeRecommendationContextSchema.parse({...emptyPlaceContext(),...draft.context,recommendationType:'person'});
  const normalized=createRecommendationObjectSchema.omit({collectionId:true,expectedCollectionRevision:true,category:true,entityId:true}).strict()
   .parse({note:draft.note,userRating:draft.userRating,publicationState:'published',placeContext:context,placePhotos:{photoMediaIds:draft.photoMediaIds}});
  const intent=freeze({entityKey:key(),recommendationKey:key(),parent,draft:{...draft,...taxonomy,title:details.title,details:{},context,note:normalized.note,userRating:normalized.userRating,
   photoMediaIds:[...draft.photoMediaIds]}});
  personIntents.add(intent);
  const state=useAuthStore.getState();intents.set(intent,{accountId:state.accountId,generation:state.generation,route:route()});return intent;
 },
 /**
  * Ticket 5.2. Links a Products or People list to this location list, or unlinks it.
  *
  * Both observations are checked here, because the pair is what the command links: the
  * parent must be one of the owner's location lists, and the child must not be.
  */
 async setLocationLink(location:CollectionObservation,child:CollectionObservation,attached:boolean,commandKey:string,signal?:AbortSignal){
  collection(location);
  assertOwnerDetailObservation(child,'collection');
  if(child.detail.category!=='products'&&child.detail.category!=='people')fail();
  if(child.accountId!==location.accountId||child.generation!==location.generation)fail();
  return explorersApiClient.setMyCollectionLocation(child,attached?location:null,commandKey,signal);
 },
 /**
  * Correct a shared place's provider facts for this owner alone.
  *
  * The facts belong to the entity, which everyone recommending that place shares, so
  * they are not overridable - one owner must not be able to move a place for everyone.
  * Instead the owner's recommendation is repointed at their own corrected place, which
  * leaves every other recommendation of the original untouched.
  */
 async correctFacts(observed:RecommendationObservation,title:string,details:Partial<PlaceEntityDetails>,entityKey:string,commandKey:string,signal?:AbortSignal){
  recommendation(observed);
  const resolved=resolveManualPlaceSchema.parse({kind:'manual',category:'places',details:{...emptyPlaceDetails(),...details,title}});
  const entity=await explorersApiClient.resolvePlaceEntity(resolved,entityKey,signal);
  recommendation(observed);
  return explorersApiClient.replaceRecommendationEntity(observed,entity.id,commandKey,signal);
 },
 // A location list is created with its location, so the list and its location never
 // exist in two different states.
 createCollection(input:{title:string;slug:string;description?:string|null;placeLocation?:PlaceCollectionDetails},commandKey:string,signal?:AbortSignal){
  const {placeLocation,...rest}=input;
  return explorersApiClient.createMyCollection({...rest,category:'places',visibility:'private',publicationState:'draft',
   ...(placeLocation===undefined?{}:{placeLocation:placeCollectionDetailsSchema.parse(placeLocation)})},commandKey,signal);
 },
 updateCollection(observed:CollectionObservation,patch:Omit<UpdateCollectionInput,'expectedRevision'>,commandKey:string,signal?:AbortSignal){collection(observed);return explorersApiClient.updateMyCollection(observed,patch,commandKey,signal);},
 archiveCollection(observed:CollectionObservation,commandKey:string,signal?:AbortSignal){collection(observed);return explorersApiClient.archiveMyCollection(observed,commandKey,signal);},
 updateRecommendation(observed:RecommendationObservation,patch:Omit<UpdateRecommendationInput,'expectedRevision'>,commandKey:string,signal?:AbortSignal){recommendation(observed);return explorersApiClient.updateMyRecommendation(observed,patch,commandKey,signal);},
 archiveRecommendation(observed:RecommendationObservation,commandKey:string,signal?:AbortSignal){recommendation(observed);return explorersApiClient.archiveMyRecommendation(observed,commandKey,signal);},
 reorderCollection(observed:CompletePlacesOwnerContent,id:string,ids:string[],commandKey:string,signal?:AbortSignal){complete(observed);return explorersApiClient.reorderMyCollection(observed,id,ids,commandKey,signal);},
 /**
  * Set or clear a list's location. Separate from updateCollection because changing where
  * a list is, is not the same edit as renaming it, and the snapshot must be replaced
  * wholesale rather than merged - a half-updated location is a different place.
  */
 setLocation(observed:CollectionObservation,details:PlaceCollectionDetails,commandKey:string,signal?:AbortSignal){
  collection(observed);
  return explorersApiClient.updateMyCollection(observed,{placeLocation:placeCollectionDetailsSchema.parse(details)},commandKey,signal);
 },
};
