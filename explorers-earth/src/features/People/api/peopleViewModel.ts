import type {EditableOwnerRecommendation,OwnerCollectionDto,OwnerMembershipDto} from '../../../../../tunes/shared/explorersOwnerContentContract';
import {personEntityDetailsSchema} from '../../../../../tunes/shared/explorersPersonContract';
import type {PersonList,RecommendedPerson} from '../types';
import type {CompletePeopleOwnerContent} from './peopleClient';
import {ExplorersApiError,type RecommendationObservation,assertCompleteMyCategoryContent} from '../../../lib/explorersApiClient';

// Ticket 4.5. Pure canonical-DTO to feature-type mapping, in its own module so the alias
// comparisons the ticket asks for can be asserted directly.
//
// RecommendedPerson carries a documented block of compatibility fields alongside its
// canonical ones, and the ticket says to preserve them "at the adapter edge until
// consuming components no longer need them". So both are emitted here, from one source,
// rather than letting components re-derive an alias each and drift.
//
// twitter is stored; the frontend has always presented x. The canonical primary_platform
// keeps the stored value and the `platform` alias carries the presented one, so neither
// edge has to guess which it is holding.

type Pin={recommendationId:string;collectionId:string;position:number};

const presentedPlatform=(stored:RecommendedPerson['primary_platform']):NonNullable<RecommendedPerson['platform']>|null=>
 stored===null?null:stored==='twitter'?'x':stored;

export function personViewModel(detail:Readonly<EditableOwnerRecommendation>,membership:Readonly<OwnerMembershipDto>,pin?:Readonly<Pin>):RecommendedPerson{
 if(detail.category!=='people'||detail.entity.kind!=='person'||detail.id!==membership.recommendationId)throw new ExplorersApiError(409,'CONFLICT','People detail identity changed');
 const parsed=personEntityDetailsSchema.safeParse(detail.effectivePersonDetails);
 if(!parsed.success)throw new ExplorersApiError(409,'CONFLICT','Person details are unavailable');
 const facts=parsed.data;
 const sector=detail.peopleSector?.sector;
 const category=sector?{id:sector.id,documentId:sector.id,slug:sector.slug,Category_name:sector.label,unavailable:sector.unavailable}:null;
 const name=detail.displayTitle??'Unnamed person';
 const selectedPin=pin?.recommendationId===membership.recommendationId&&pin.collectionId===membership.collectionId?pin:undefined;
 // The primary link is the explicit primary, else the link for the stated platform.
 const primary=facts.socialUrls.primary??(facts.primaryPlatform?facts.socialUrls[facts.primaryPlatform]:undefined)??undefined;
 return {
  documentId:detail.id,
  name,
  username_handle:facts.usernameHandle,
  headline:facts.headline,
  location:facts.locationText,
  avatar_path:facts.avatarUrl,
  media_details:null,
  primary_platform:facts.primaryPlatform,
  social_urls:Object.keys(facts.socialUrls).length?{...facts.socialUrls}:{},
  // The legacy type models an absent list as null, not as an empty array.
  skills_tags:facts.skillsTags.length?[...facts.skillsTags]:null,
  user_recommendation_note:detail.note,
  user_rating:detail.userRating,
  is_pinned:selectedPin!==undefined,
  pin_order:selectedPin?.position??null,
  display_order:membership.displayOrder,
  person_list:null,
  // Compatibility aliases, from the same facts as the canonical fields above.
  full_name:name,
  handle:facts.usernameHandle,
  avatar_url:facts.avatarUrl,
  platform:presentedPlatform(facts.primaryPlatform),
  tags:facts.skillsTags.length?[...facts.skillsTags]:null,
  bio:facts.headline,
  follower_count:facts.externalFollowerCountText,
  ...(primary===undefined?{}:{profile_url:primary}),
  people_sector:detail.peopleSector,
  person_category:category,
  people_category:category,
  person_categories:category?[category]:null,
 };
}

export function collectionViewModel(collection:Readonly<OwnerCollectionDto>,people:RecommendedPerson[],username=''):PersonList{
 return {
  documentId:collection.id,
  List_Name:collection.title,
  list_description:collection.description,
  slug:collection.slug,
  Visibility:collection.visibility==='public'&&collection.publicationState==='published',
  cover_image:null,
  display_order:collection.displayOrder,
  top_picks_heading:collection.heading,
  // Compatibility alias, from the same source as the canonical field.
  top_people_heading:collection.heading,
  recommended_people:people.map(person=>({...person,person_list:{documentId:collection.id,List_Name:collection.title,slug:collection.slug}})),
  account:{documentId:collection.accountId,username},
 };
}

export type PersonOwnerView={lists:PersonList[]};

export const peopleViewModel={
 complete(observed:CompletePeopleOwnerContent,details:ReadonlyMap<string,RecommendationObservation>,username=''):Readonly<PersonOwnerView>{
  assertCompleteMyCategoryContent(observed);
  if(observed.category!=='people')throw new ExplorersApiError(409,'CONFLICT','People category required');
  return {lists:observed.collections.filter(collection=>!collection.archived).map(collection=>collectionViewModel(
   collection,
   observed.memberships
    .filter(member=>member.collectionId===collection.id&&!member.collectionArchived&&!member.recommendationArchived)
    .sort((a,b)=>a.displayOrder-b.displayOrder||a.recommendationId.localeCompare(b.recommendationId))
    .map(member=>{
     const observation=details.get(member.recommendationId);
     if(!observation)throw new ExplorersApiError(409,'CONFLICT','Person detail missing while mapping');
     const pin=observed.topPicks?.find(entry=>entry.recommendationId===member.recommendationId);
     return personViewModel(observation.detail as Readonly<EditableOwnerRecommendation>,member,pin);
    }),
   username,
  ))};
 },
};
