import type {EditableOwnerRecommendation,OwnerCollectionDto,OwnerMembershipDto} from '../../../../../tunes/shared/explorersOwnerContentContract';
import {appEntityDetailsSchema} from '../../../../../tunes/shared/explorersAppContract';
import type {AppList,RecommendedApp} from '../types';
import type {CompleteAppsOwnerContent} from './appsClient';
import {ExplorersApiError,type RecommendationObservation,assertCompleteMyCategoryContent} from '../../../lib/explorersApiClient';

// Ticket 4.3. Pure canonical-DTO to feature-type mapping, kept in its own module so the
// assertions epic-04 asks for can test it directly. Movies puts hooks and commands in its
// adapter and Games stubs this layer out of its adapter test, so neither delivered package
// actually asserts the mapping the epic specifies; this one is asserted in the file the
// epic names.
//
// Canonical ids become documentId only here, at the compatibility edge.

type Pin={recommendationId:string;collectionId:string;position:number};

export function appViewModel(detail:Readonly<EditableOwnerRecommendation>,membership:Readonly<OwnerMembershipDto>,pin?:Readonly<Pin>):RecommendedApp{
 if(detail.category!=='apps'||detail.entity.kind!=='app'||detail.id!==membership.recommendationId)throw new ExplorersApiError(409,'CONFLICT','Apps detail identity changed');
 // appUrl is NOT NULL in 0043, so a missing details row is a broken state rather than an
 // empty default. Refusing here keeps a half-written app out of the view entirely.
 const parsed=appEntityDetailsSchema.safeParse(detail.effectiveAppDetails);
 if(!parsed.success)throw new ExplorersApiError(409,'CONFLICT','Apps details are unavailable');
 const facts=parsed.data;
 const selectedPin=pin?.recommendationId===membership.recommendationId&&pin.collectionId===membership.collectionId?pin:undefined;
 return {
  documentId:detail.id,
  app_url:facts.appUrl,
  title:detail.displayTitle??'Untitled app',
  description:facts.description,
  logo_url:facts.logoUrl,
  developer:facts.developer,
  // The legacy type models an absent list as null, not as an empty array.
  platforms:facts.platforms.length?[...facts.platforms]:null,
  price_tier:facts.priceTier,
  download_url:facts.downloadUrl,
  user_recommendation_note:detail.note,
  user_rating:detail.userRating,
  is_pinned:selectedPin!==undefined,
  pin_order:selectedPin?.position??null,
  display_order:membership.displayOrder,
  // Screenshots are owned media served through the media route, never an owner-typed URL.
  screenshots:detail.appScreenshots?.screenshotMediaIds.length
   ?detail.appScreenshots.screenshotMediaIds.map(id=>`/api/explorers/v1/media/${id}/content`)
   :null,
  app_list:null,
  // Taxonomy is out of 4.3's scope and has no seeded vocabulary, so this stays null
  // rather than inventing one.
  app_category:null,
 };
}

export function collectionViewModel(collection:Readonly<OwnerCollectionDto>,apps:RecommendedApp[],username=''):AppList{
 return {
  documentId:collection.id,
  List_Name:collection.title,
  list_description:collection.description,
  slug:collection.slug,
  Visibility:collection.visibility==='public'&&collection.publicationState==='published',
  cover_image:null,
  display_order:collection.displayOrder,
  top_apps_heading:collection.heading,
  recommended_apps:apps.map(app=>({...app,app_list:{documentId:collection.id,List_Name:collection.title,slug:collection.slug}})),
  account:{documentId:collection.accountId,username},
 };
}

export type AppOwnerView={lists:AppList[]};

export const appsViewModel={
 complete(observed:CompleteAppsOwnerContent,details:ReadonlyMap<string,RecommendationObservation>,username=''):Readonly<AppOwnerView>{
  assertCompleteMyCategoryContent(observed);
  if(observed.category!=='apps')throw new ExplorersApiError(409,'CONFLICT','Apps category required');
  return {lists:observed.collections.map(collection=>collectionViewModel(
   collection,
   observed.memberships
    .filter(member=>member.collectionId===collection.id&&!member.collectionArchived&&!member.recommendationArchived)
    .sort((a,b)=>a.displayOrder-b.displayOrder||a.recommendationId.localeCompare(b.recommendationId))
    .map(member=>{
     const observation=details.get(member.recommendationId);
     if(!observation)throw new ExplorersApiError(409,'CONFLICT','Apps detail missing while mapping');
     const pin=observed.topPicks?.find(entry=>entry.recommendationId===member.recommendationId);
     return appViewModel(observation.detail as Readonly<EditableOwnerRecommendation>,member,pin);
    }),
   username,
  ))};
 },
};
