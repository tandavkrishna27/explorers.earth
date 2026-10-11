import {placesTaxonomyReadSchema,peopleSectorReadSchema} from './explorersTaxonomyContract';
import {manualGamePresentationSchema} from './explorersGameOwnerContract';
import {movieProviderMediaSchema} from './explorersMovieMediaContract';
import {movieEntityDtoSchema,movieDetailsSchema,movieContextSchema,movieTermsSchema,movieDisplayFieldsSchema} from './explorersMovieContract';
import {bookCoversSchema} from './explorersBookCoverContract';
import {appEntityDtoSchema,appEntityDetailsSchema,appDisplayFieldsSchema,appScreenshotsSchema} from './explorersAppContract';
import {productEntityDtoSchema,productEntityDetailsSchema,productDisplayFieldsSchema,productOfferSchema} from './explorersProductContract';
import {personEntityDtoSchema,personEntityDetailsSchema,personDisplayFieldsSchema} from './explorersPersonContract';
import {placeEntityDtoSchema,placeEntityDetailsSchema,placeDisplayFieldsSchema,placeRecommendationContextSchema,placePhotosSchema,placeCollectionDetailsSchema} from './explorersPlaceContract';
import { z } from 'zod/v3';
import { collectionCoreDtoSchema, recommendationCoreDtoSchema, contentCategorySchema, contentIdSchema, topPickCategorySchema,entityCoreDtoSchema,displayOverridesReadSchema,catalogTitleSchema } from './explorersContract';
import { richNoteSchema } from './explorersRichNoteContract';
import {locationLinkDtoSchema} from './explorersPlaceLinkContract';
import {bookEntityDtoSchema,bookEntityDetailsSchema,bookRecommendationContextSchema,bookDisplayFieldsSchema} from './explorersBookContract';
const status=z.enum(['active','archived','all']).default('active');
const token=z.string().min(1).max(4096);
const limit=z.union([z.number().int().min(1).max(100),z.string().regex(/^[1-9][0-9]{0,2}$/).transform(Number).pipe(z.number().max(100))]).default(24);
export const ownerCollectionsRequestSchema=z.object({category:contentCategorySchema,status,limit,cursor:token.optional(),snapshotToken:token.optional()}).strict();
export const ownerRecommendationsRequestSchema=ownerCollectionsRequestSchema.extend({collectionId:contentIdSchema.optional()}).strict();
export const ownerDetailRequestSchema=z.object({status}).strict();
// pinOrder is the list's own pin position among its category's lists, which is not the
// same thing as the pinned recommendations inside it. Null means not pinned.
export const ownerCollectionDtoSchema=collectionCoreDtoSchema.extend({title:z.string().min(1).max(200),description:z.string().nullable(),heading:z.string().nullable(),archived:z.boolean(),displayOrder:z.number().int().nonnegative()}).strict();
export const ownerRecommendationDtoSchema=recommendationCoreDtoSchema.extend({archived:z.boolean(),pin:z.object({collectionId:contentIdSchema,position:z.number().int().nonnegative(),revision:z.number().int().positive().safe()}).strict().nullable()}).strict();
const revision=z.string().regex(/^(0|[1-9][0-9]{0,15})$/).refine(v=>Number.isSafeInteger(Number(v)));
// A Places list carries its own location selection. It travels on the editable read
// because the owner form edits the list and its location together, and it is absent for
// every other category rather than empty, so a reader cannot mistake "no location set"
// for "this category has locations".
// pinOrder is the list's own pin among its category's lists, which is not the same thing
// as the pinned recommendations inside it. Null means not pinned.
export const editableOwnerCollectionSchema=ownerCollectionDtoSchema.extend({categoryRevision:revision,pinOrder:z.number().int().nonnegative().nullable(),placeLocation:placeCollectionDetailsSchema.optional(),
 // Ticket 5.2. Where this list belongs, for a list that can belong somewhere; and for
 // a location list, the lists that belong to it. Absent where the question does not
 // apply, because an empty array would claim it does.
 locationLink:locationLinkDtoSchema.nullable().optional(),linkedChildren:z.array(locationLinkDtoSchema).max(200).optional()}).strict()
 .superRefine((v,ctx)=>{
  if((v.placeLocation!==undefined)!==(v.category==='places'))ctx.addIssue({code:'custom',message:'Inconsistent location aggregate'});
  if((v.linkedChildren!==undefined)!==(v.category==='places'))ctx.addIssue({code:'custom',message:'Inconsistent linked children'});
  if((v.locationLink!==undefined)!==(v.category==='products'||v.category==='people'))ctx.addIssue({code:'custom',message:'Inconsistent location link'});
  if(v.locationLink&&(v.locationLink.childCollectionId!==v.id||v.locationLink.childCategory!==v.category))ctx.addIssue({code:'custom',message:'Location link identity mismatch'});
  if(v.linkedChildren?.some(child=>child.locationCollectionId!==v.id))ctx.addIssue({code:'custom',message:'Linked child belongs to another location'});
 });
export const editableOwnerRecommendationSchema=ownerRecommendationDtoSchema.extend({categoryRevision:revision,gamePresentation:manualGamePresentationSchema.optional(),bookCovers:bookCoversSchema.optional(),note:richNoteSchema.nullable(),entity:z.union([entityCoreDtoSchema,bookEntityDtoSchema,movieEntityDtoSchema,appEntityDtoSchema,productEntityDtoSchema,personEntityDtoSchema,placeEntityDtoSchema]),displayOverrides:displayOverridesReadSchema,displayTitle:catalogTitleSchema.nullable(),bookContext:bookRecommendationContextSchema.optional(),effectiveBookDetails:bookEntityDetailsSchema.optional(),movieContext:movieContextSchema.optional(),effectiveMovieDetails:movieDetailsSchema.optional(),movieTerms:movieTermsSchema.optional(),providerMedia:movieProviderMediaSchema.nullable().optional(),appScreenshots:appScreenshotsSchema.optional(),effectiveAppDetails:appEntityDetailsSchema.optional(),productOffer:productOfferSchema.optional(),effectiveProductDetails:productEntityDetailsSchema.optional(),effectivePersonDetails:personEntityDetailsSchema.optional(),placeContext:placeRecommendationContextSchema.optional(),placePhotos:placePhotosSchema.optional(),effectivePlaceDetails:placeEntityDetailsSchema.optional(),placesTaxonomy:placesTaxonomyReadSchema.optional(),peopleSector:peopleSectorReadSchema.optional()}).strict().superRefine((v,ctx)=>{
 if((v.placesTaxonomy!==undefined)!==(v.category==='places')||(v.peopleSector!==undefined)!==(v.category==='people'))ctx.addIssue({code:'custom',message:'Inconsistent taxonomy assignment'});
 if(v.category==='games'?!v.gamePresentation||v.gamePresentation.images.length!==v.mediaIds.length||v.gamePresentation.images.some((image,index)=>image.mediaId!==v.mediaIds[index]):v.gamePresentation!==undefined)ctx.addIssue({code:'custom',message:'Inconsistent Game presentation'});
 const expected={places:['place','person'],movies:['movie'],books:['book'],games:['game'],apps:['app'],products:['product'],people:['person']};
 const title=Object.prototype.hasOwnProperty.call(v.displayOverrides,'title')?v.displayOverrides.title:v.entity.title;
 if(v.entity.id!==v.entityId||!expected[v.category].includes(v.entity.kind)||v.displayTitle!==title)ctx.addIssue({code:'custom',message:'Inconsistent catalog presentation'});
 if(v.category!=='books'&&(v.bookCovers!==undefined||v.bookContext!==undefined||v.effectiveBookDetails!==undefined))ctx.addIssue({code:'custom',message:'Inconsistent Book presentation'});
 if(v.category!=='movies'&&(v.movieContext!==undefined||v.effectiveMovieDetails!==undefined||v.movieTerms!==undefined||v.providerMedia!==undefined))ctx.addIssue({code:'custom',message:'Inconsistent Movie presentation'});
 if(v.category!=='apps'&&(v.appScreenshots!==undefined||v.effectiveAppDetails!==undefined))ctx.addIssue({code:'custom',message:'Inconsistent App presentation'});
 if(v.category!=='products'&&(v.productOffer!==undefined||v.effectiveProductDetails!==undefined))ctx.addIssue({code:'custom',message:'Inconsistent Product presentation'});
 if(v.category!=='people'&&v.effectivePersonDetails!==undefined)ctx.addIssue({code:'custom',message:'Inconsistent Person presentation'});
 if(v.category!=='places'&&(v.placeContext!==undefined||v.placePhotos!==undefined||v.effectivePlaceDetails!==undefined))ctx.addIssue({code:'custom',message:'Inconsistent Place presentation'});
 if(v.providerMedia){
  const media=v.providerMedia;
  if(v.entity.kind!=='movie'||!('details' in v.entity)||!('provenance' in v.entity)||!v.entity.provenance)ctx.addIssue({code:'custom',message:'Movie copies require canonical provider source'});
  else {
   const p=v.entity.provenance,source=media.source,facts=v.entity.details;
   if(source.entityId!==v.entityId||source.provider!==p.provider||source.externalKind!==p.externalKind||source.externalId!==p.externalId||source.fetchedAt!==p.fetchedAt||source.mappingVersion!==p.mappingVersion)ctx.addIssue({code:'custom',message:'Inconsistent Movie copy source'});
   if(media.poster&&!facts.posterUrl||media.backdrop&&!facts.backdropUrl||media.cast.length!==Math.min(10,facts.cast.length)||media.cast.some((entry,index)=>{const cast=facts.cast[index];return !cast||entry.slot.ordinal!==index||entry.slot.personId!==cast.personId||entry.slot.creditId!==cast.creditId||!!entry.media&&!cast.profileUrl;}))ctx.addIssue({code:'custom',message:'Inconsistent Movie copy slots'});
  }
 }
 const {title:_title,...fields}=v.displayOverrides;
 if(v.category==='books'?!bookDisplayFieldsSchema.safeParse(fields).success:v.category==='movies'?!movieDisplayFieldsSchema.safeParse(fields).success:v.category==='apps'?!appDisplayFieldsSchema.safeParse(fields).success:v.category==='products'?!productDisplayFieldsSchema.safeParse(fields).success:v.category==='people'?!personDisplayFieldsSchema.safeParse(fields).success:v.category==='places'?!placeDisplayFieldsSchema.safeParse(fields).success:Object.keys(fields).length>0)ctx.addIssue({code:'custom',message:'Inconsistent category overrides'});
 if('details' in v.entity){
  const effective=v.entity.kind==='book'?v.effectiveBookDetails:v.entity.kind==='app'?v.effectiveAppDetails:v.entity.kind==='product'?v.effectiveProductDetails:v.entity.kind==='person'?v.effectivePersonDetails:v.entity.kind==='place'?v.effectivePlaceDetails:v.effectiveMovieDetails;
  if(v.entity.kind==='book'?v.category!=='books'||!v.bookContext||!effective:v.entity.kind==='app'?v.category!=='apps'||!effective:v.entity.kind==='product'?v.category!=='products'||!effective||!v.productOffer:v.entity.kind==='person'?v.category==='places'?!v.placeContext:v.category!=='people'||!effective:v.entity.kind==='place'?v.category!=='places'||!effective||!v.placeContext:v.category!=='movies'||!v.movieContext||!v.movieTerms||!effective)ctx.addIssue({code:'custom',message:'Missing typed presentation'});
  else for(const [key,value] of Object.entries(v.entity.details))if(JSON.stringify((effective as any)[key])!==JSON.stringify(Object.prototype.hasOwnProperty.call(v.displayOverrides,key)?(v.displayOverrides as any)[key]:value))ctx.addIssue({code:'custom',message:'Inconsistent effective details'});
 }
});
export type EditableOwnerCollection=z.infer<typeof editableOwnerCollectionSchema>;
export type EditableOwnerRecommendation=z.infer<typeof editableOwnerRecommendationSchema>;
export const ownerSnapshotRequestSchema=z.object({category:contentCategorySchema,snapshotToken:token.optional()}).strict();
export const ownerSnapshotValidationRequestSchema=ownerSnapshotRequestSchema.extend({snapshotToken:token}).strict();
export const ownerSnapshotSchema=z.object({version:z.literal('explorers-owner-content/v2'),snapshotToken:token,revision,expiresAt:z.number().int().positive(),pinRevision:z.number().int().positive().safe().nullable()}).strict();
export const ownerMembershipsRequestSchema=z.object({category:contentCategorySchema,collectionStatus:status,recommendationStatus:status,recommendationId:contentIdSchema.optional(),limit,cursor:token.optional(),snapshotToken:token.optional()}).strict();
export const ownerMembershipDtoSchema=z.object({recommendationId:contentIdSchema,collectionId:contentIdSchema,collectionRevision:z.number().int().positive().safe(),displayOrder:z.number().int().nonnegative(),collectionArchived:z.boolean(),recommendationArchived:z.boolean()}).strict();
export const ownerCollectionPageSchema=z.object({version:z.literal('explorers-owner-content/v2'),snapshot:revision,snapshotToken:token,expiresAt:z.number().int().positive(),items:z.array(ownerCollectionDtoSchema).max(100),nextCursor:token.nullable()}).strict();
export const ownerRecommendationPageSchema=ownerCollectionPageSchema.extend({items:z.array(ownerRecommendationDtoSchema).max(100)}).strict();
export const ownerMembershipPageSchema=ownerCollectionPageSchema.extend({items:z.array(ownerMembershipDtoSchema).max(100)}).strict();
export const ownerTopPicksRequestSchema=z.object({category:topPickCategorySchema,limit,cursor:token.optional(),snapshotToken:token.optional()}).strict();
export const ownerTopPickDtoSchema=z.object({recommendationId:contentIdSchema,collectionId:contentIdSchema,position:z.number().int().nonnegative()}).strict();
export const ownerTopPickPageSchema=ownerCollectionPageSchema.extend({pinRevision:z.number().int().positive().safe().nullable(),items:z.array(ownerTopPickDtoSchema).max(100)}).strict();
export type OwnerTopPicksRequest=z.input<typeof ownerTopPicksRequestSchema>;
export type OwnerCollectionsRequest=z.input<typeof ownerCollectionsRequestSchema>;
export type OwnerRecommendationsRequest=z.input<typeof ownerRecommendationsRequestSchema>;
export type OwnerCollectionDto=z.infer<typeof ownerCollectionDtoSchema>;
export type OwnerRecommendationDto=z.infer<typeof ownerRecommendationDtoSchema>;
export type OwnerCollectionPage=z.infer<typeof ownerCollectionPageSchema>;
export type OwnerRecommendationPage=z.infer<typeof ownerRecommendationPageSchema>;
export type OwnerMembershipsRequest=z.input<typeof ownerMembershipsRequestSchema>;
export type OwnerMembershipDto=z.infer<typeof ownerMembershipDtoSchema>;
export type OwnerMembershipPage=z.infer<typeof ownerMembershipPageSchema>;
export type OwnerSnapshot=z.infer<typeof ownerSnapshotSchema>;
