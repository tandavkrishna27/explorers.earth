import type {EditableOwnerRecommendation,EditableOwnerCollection,OwnerMembershipDto} from '../../../../../tunes/shared/explorersOwnerContentContract';
import {placeEntityDetailsSchema,placeRecommendationContextSchema,emptyPlaceDetails,legacyListNameDetails} from '../../../../../tunes/shared/explorersPlaceContract';
import type {CompletePlacesOwnerContent} from './placesClient';
import {ExplorersApiError,type RecommendationObservation,type CollectionObservation,assertCompleteMyCategoryContent} from '../../../lib/explorersApiClient';
import {placesTaxonomyReadSchema,type taxonomySelectionReadSchema} from '../../../../../tunes/shared/explorersTaxonomyContract';
import type {z} from 'zod/v3';

// Ticket 5.1. Pure canonical-DTO to feature-shape mapping, in its own module so the
// mapping the ticket asks for ("without dropping data used by cards and maps") can be
// asserted directly rather than through a component.
//
// Two rules this file exists to keep:
//
//  1. Zero is a real coordinate. Geometry is emitted whenever both coordinates are
//     present, including 0, and is null when either is absent - never (0,0).
//  2. A Places list may hold a person recommendation. Those have no place entity, so the
//     provider facts are empty rather than missing, and the person fields travel from the
//     creator's own context.
//
// The owner sees their own contact details unconditionally: contactVisibility gates what
// a *reader* sees, and the public projection is the only thing that applies it.

const MEDIA=(id:string)=>`/api/explorers/v1/media/${id}/content`;

// Flat {lat,lng}, which is the shape every map and card in the app reads. Nesting it
// under `location` would typecheck and silently break every map.
export type PlaceGeometry={lat:number;lng:number};
export type OwnerPlaceDetails={
 Place_Id:string|null;Place_Name:string;Title:string;Place_Address:string|null;
 Geometry:PlaceGeometry|null;Rating:number|null;Rating_Count:number|null;
 Photos:{url:string}[];Place_Types:string[]|null;
 Public_Phone:string|null;Website:string|null;Price_Level:number|null;Price_Range:Record<string,unknown>|string|null;
};
export type RecommendedPlaceView={
 documentId:string;
 Place_Details:OwnerPlaceDetails;
 media_details:{thumbnail:{id?:string;url?:string};imageDetails:{id:string;url:string}[]}|null;
 Media:{documentId:string;url:string}[];
 Recommendation_Type:'place'|'person';
 Source_Of_Recommendation:'self'|'suggestion';
 Contact_Name:string|null;Contact_Number:string|null;Contact_Visibility:'private'|'public';
 Places_Social_Link:string|null;Places_Website:string|null;
 Users_Place_Note:Record<string,unknown>|unknown[]|null;Users_Social_URL:string|null;
 person_profile_url:string|null;person_address:string|null;
 user_recommendation_note:string;user_rating:number|null;google_rating:number|null;
 is_pinned:boolean;pin_order:number|null;display_order:number;
 recommendation_list:{documentId:string;List_Name:string;slug:string}|null;
 placesTaxonomy:z.infer<typeof placesTaxonomyReadSchema>;
 recommendation_category:(z.infer<typeof taxonomySelectionReadSchema>&{documentId:string;Category_Name:string|null})|null;
 recommendation_sub_category:(z.infer<typeof taxonomySelectionReadSchema>&{documentId:string;sub_category:string|null})|null;
};
export type RecommendationListView={
 documentId:string;List_Name:string;slug:string;Visibility:boolean;display_order:number;
 // The list's own pin among its category's lists, which is not the pinned
 // recommendations inside it.
 is_pinned:boolean;pin_order:number|null;
 List_Name_Details:ReturnType<typeof legacyListNameDetails>|null;
 Instagram_Media_URL:string|null;
 cover_image:{url:string;alternativeText:null}|null;
 top_picks_heading:string|null;
 account:{documentId:string;username:string};
 recommended_places:RecommendedPlaceView[];
 // OWN-19. Set when this list's own read failed: the list is shown with an error and a
 // retry instead of disappearing, and its places are not known (not empty).
 loadError?:true;
};

export function placeViewModel(detail:Readonly<EditableOwnerRecommendation>,membership:Readonly<OwnerMembershipDto>):RecommendedPlaceView{
 if(detail.category!=='places'||detail.id!==membership.recommendationId)throw new ExplorersApiError(409,'CONFLICT','Places detail identity changed');
 if(detail.entity.kind!=='place'&&detail.entity.kind!=='person')throw new ExplorersApiError(409,'CONFLICT','Unsupported Places entity kind');
 // A place recommendation must carry provider facts; a person recommendation inside a
 // Places list has none, and that absence is legitimate rather than a broken row.
 const parsed=detail.entity.kind==='place'?placeEntityDetailsSchema.safeParse(detail.effectivePlaceDetails):{success:true as const,data:emptyPlaceDetails()};
 if(!parsed.success)throw new ExplorersApiError(409,'CONFLICT','Place details are unavailable');
 const facts=parsed.data;
 const context=placeRecommendationContextSchema.safeParse(detail.placeContext);
 if(!context.success)throw new ExplorersApiError(409,'CONFLICT','Place recommendation context is unavailable');
 const own=context.data;
 const taxonomy=placesTaxonomyReadSchema.parse(detail.placesTaxonomy);
 if(own.recommendationType!==(detail.entity.kind==='person'?'person':own.recommendationType))throw new ExplorersApiError(409,'CONFLICT','Place recommendation type conflicts with its entity');
 // The typed place entity, when there is one. A core entity of kind place carries no
 // provider identity, and the internal entity id is never substituted for it.
 const entity='providerPlaceId' in detail.entity?detail.entity:null;
 const title=detail.displayTitle??'Unnamed place';
 // Membership-local metadata permits different pin positions in different lists.
 const selectedPin=membership.placePinPosition==null?undefined:{position:membership.placePinPosition};
 // One source. Creator and provider uploads are merged at upload time into the typed
 // recommendation_place_photos, so there is no second gallery to concatenate, and these
 // are the ids the edit path reads back to preserve existing photos.
 const photos=detail.placePhotos?.photoMediaIds??[];
 return {
  documentId:detail.id,
  Place_Details:{
   // The provider's own identifier, which consumers deduplicate and look places up by.
   // A manual place has none, and the internal entity id is never substituted for it.
   Place_Id:entity?.providerPlaceId??null,
   Place_Name:title,Title:title,
   Place_Address:facts.formattedAddress,
   // Zero is a real point; an absent pair stays null rather than becoming (0,0).
   Geometry:facts.latitude===null||facts.longitude===null?null:{lat:facts.latitude,lng:facts.longitude},
   Rating:facts.providerRating,Rating_Count:facts.ratingsCount,
   Photos:photos.map(id=>({url:MEDIA(id)})),
   Place_Types:facts.providerTypes.length?[...facts.providerTypes]:null,
   Public_Phone:facts.publicPhone,Website:facts.websiteUrl,
   Price_Level:facts.priceLevel,Price_Range:facts.priceRange,
  },
  media_details:photos.length?{thumbnail:{id:photos[0],url:MEDIA(photos[0])},imageDetails:photos.map(id=>({id,url:MEDIA(id)}))}:null,
  Media:photos.map(id=>({documentId:id,url:MEDIA(id)})),
  Recommendation_Type:own.recommendationType,
  Source_Of_Recommendation:own.sourceOfRecommendation,
  // The owner's own contact details, which is why no visibility gate applies here. The
  // selection itself travels so the form can show and change it.
  Contact_Name:own.contactName,Contact_Number:own.contactNumber,Contact_Visibility:own.contactVisibility,
  Places_Social_Link:own.placeSocialUrl,Places_Website:own.placeWebsiteUrl,
  Users_Place_Note:own.legacyPlaceNote,Users_Social_URL:own.creatorSocialUrl,
  person_profile_url:own.personProfileUrl,person_address:own.personAddress,
  user_recommendation_note:detail.note?.html??'',
  user_rating:detail.userRating,google_rating:facts.providerRating,
  is_pinned:selectedPin!==undefined,
  pin_order:selectedPin?.position??null,
  display_order:membership.displayOrder,
  recommendation_list:null,
  placesTaxonomy:taxonomy,
  recommendation_category:taxonomy.category?{...taxonomy.category,documentId:taxonomy.category.id,Category_Name:taxonomy.category.label}:null,
  recommendation_sub_category:taxonomy.subcategory?{...taxonomy.subcategory,documentId:taxonomy.subcategory.id,sub_category:taxonomy.subcategory.label}:null,
 };
}

export function collectionViewModel(collection:Readonly<EditableOwnerCollection>,places:RecommendedPlaceView[],username=''):RecommendationListView{
 if(collection.category!=='places'||collection.placeLocation===undefined)throw new ExplorersApiError(409,'CONFLICT','Places list identity changed');
 const cover=collection.coverMediaId===null?null:{url:MEDIA(collection.coverMediaId),alternativeText:null};
 return {
  documentId:collection.id,
  List_Name:collection.title,
  slug:collection.slug,
  Visibility:collection.visibility==='public'&&collection.publicationState==='published',
  display_order:collection.displayOrder,
  is_pinned:collection.pinOrder!==null,
  pin_order:collection.pinOrder,
  // The list's own location, assembled from the same shared mapper the public projection
  // uses, so the owner and the reader never see two different shapes.
  List_Name_Details:collection.placeLocation.locationSnapshot===null&&collection.description===null&&cover===null
   ?null
   :legacyListNameDetails(collection.placeLocation.locationSnapshot,{note:collection.description,thumbnailUrl:cover?.url??null}),
  Instagram_Media_URL:collection.placeLocation.instagramMediaUrl,
  cover_image:cover,
  top_picks_heading:collection.heading,
  account:{documentId:collection.accountId,username},
  recommended_places:places.map(place=>({...place,recommendation_list:{documentId:collection.id,List_Name:collection.title,slug:collection.slug}})),
 };
}

/** A list whose detail read failed, built from the category row alone (OWN-19). */
function unavailableListViewModel(collection:CompletePlacesOwnerContent['collections'][number],username:string):RecommendationListView{
 return {
  documentId:collection.id,List_Name:collection.title,slug:collection.slug,
  Visibility:collection.visibility==='public'&&collection.publicationState==='published',
  display_order:collection.displayOrder,
  // The list's own pin travels on the detail read, which is what failed.
  is_pinned:false,pin_order:null,
  List_Name_Details:null,Instagram_Media_URL:null,
  cover_image:collection.coverMediaId===null?null:{url:MEDIA(collection.coverMediaId),alternativeText:null},
  top_picks_heading:collection.heading,
  account:{documentId:collection.accountId,username},
  recommended_places:[],
  loadError:true,
 };
}

export type PlacesOwnerView={lists:RecommendationListView[]};

export const placesViewModel={
 complete(observed:CompletePlacesOwnerContent,lists:ReadonlyMap<string,CollectionObservation>,details:ReadonlyMap<string,RecommendationObservation>,username='',unavailable:ReadonlySet<string>=new Set()):Readonly<PlacesOwnerView>{
  assertCompleteMyCategoryContent(observed);
  if(observed.category!=='places')throw new ExplorersApiError(409,'CONFLICT','Places category required');
  const visible=observed.collections.filter(collection=>!collection.archived);
  return {lists:visible.flatMap(collection=>{
   const observation=lists.get(collection.id);
   // A list whose detail read failed (reported by the adapter) stays visible as an error
   // row instead of disappearing (OWN-19) or failing the whole owner view; any other
   // missing detail is still an error.
   if(!observation&&unavailable.has(collection.id))return [unavailableListViewModel(collection,username)];
   if(!observation)throw new ExplorersApiError(409,'CONFLICT','Places list detail missing while mapping');
   return [collectionViewModel(
    observation.detail as Readonly<EditableOwnerCollection>,
    observed.memberships
     .filter(member=>member.collectionId===collection.id&&!member.collectionArchived&&!member.recommendationArchived)
     .sort((a,b)=>Number(a.placePinPosition==null)-Number(b.placePinPosition==null)||(a.placePinPosition??a.displayOrder)-(b.placePinPosition??b.displayOrder)||a.recommendationId.localeCompare(b.recommendationId))
     .map(member=>{
      const detail=details.get(member.recommendationId);
      if(!detail)throw new ExplorersApiError(409,'CONFLICT','Place detail missing while mapping');
      return placeViewModel(detail.detail as Readonly<EditableOwnerRecommendation>,member);
     }),
    username,
   )];
  })};
 },
};
