import {z} from 'zod/v3';
// Ticket 5.1. Places has two halves and a redaction rule, and confusing any of the three
// is how private data leaks:
//
//  - placeEntityDetails are provider facts about the place, shared by everyone who
//    recommends it. public_phone is an approved public fact; a creator's own contact
//    details never populate it.
//  - placeRecommendationContext is one creator's recommendation of that place: their
//    contact fields, their links, their recommendation type. It is per recommendation,
//    so A's contact details can never appear through B's recommendation.
//  - contactVisibility gates disclosure and defaults to private. The public projection
//    reads it; nothing serialises the context wholesale.
//
// Coordinates are numbers, not the decimal strings money uses. A price needs exact
// decimal arithmetic; a coordinate is a measurement, and numeric(10,7) round-trips
// through a double losslessly at that precision. What must survive is the distinction
// the ticket names: zero is a real coordinate and absent stays null, never (0,0).

const text=(max:number)=>z.string().trim().max(max).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v),'Invalid text');
export const placeTitleSchema=text(1000).refine(v=>v.length>0&&Array.from(v).length<=500&&!/[\u0000-\u001f\u007f]/.test(v),'Invalid title');
export const safePlaceUrlSchema=z.string().max(2048).url().refine(v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.port;}catch{return false;}},'Invalid URL');

// numeric(10,7): at most seven fractional digits, and the database bounds the range.
const coordinate=(max:number)=>z.number().refine(Number.isFinite,'Invalid coordinate')
 .refine(v=>Math.abs(v)<=max,'Coordinate out of range')
 .refine(v=>Number.isInteger(Math.round(v*1e7))&&Math.abs(v*1e7-Math.round(v*1e7))<1e-6,'Coordinate exceeds stored precision');

export const placeAddressComponentSchema=z.object({
 longText:text(500).nullable(),shortText:text(200).nullable(),
 types:z.array(text(100).refine(v=>v.length>0,'Invalid type')).max(16),
}).strict();

const entityFields={
 formattedAddress:text(1000).nullable(),
 addressComponents:z.array(placeAddressComponentSchema).max(32),
 latitude:coordinate(90).nullable(),
 longitude:coordinate(180).nullable(),
 providerTypes:z.array(text(100).refine(v=>v.length>0,'Invalid type')).max(32),
 providerRating:z.number().min(0).max(5).nullable(),
 ratingsCount:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
 // An approved public fact from the provider. A creator's own number lives in their
 // recommendation context and never reaches this column.
 publicPhone:text(50).nullable(),
 websiteUrl:safePlaceUrlSchema.nullable(),
 priceLevel:z.number().int().min(0).max(4).nullable(),
 priceRange:z.union([z.record(z.unknown()),z.string().max(200)]).nullable(),
};
export const placeEntityDetailsSchema=z.object(entityFields).strict()
 // The database carries this as a CHECK too: a half-known coordinate is not a location.
 .refine(v=>(v.latitude===null)===(v.longitude===null),{message:'Coordinates must both be present or both absent',path:['latitude']})
 .refine(v=>new TextEncoder().encode(JSON.stringify(v)).length<=16384,'Place details too large');

// A display override re-presents a *shared* entity. The coordinates, the formatted
// address and the provider's own facts are what the place is, so they are excluded: one
// owner must not be able to move a place everyone else recommends, or restate its
// provider rating. Only the presentational remainder is overridable.
const {latitude:_lat,longitude:_lng,formattedAddress:_address,addressComponents:_components,
 providerRating:_rating,ratingsCount:_count,providerTypes:_types,...overridable}=entityFields;
export const placeDisplayFieldsSchema=z.object(overridable).partial().strict();

export const PLACE_RECOMMENDATION_TYPES=['place','person'] as const;
export const PLACE_RECOMMENDATION_SOURCES=['self','suggestion'] as const;
export const PLACE_CONTACT_VISIBILITY=['private','public'] as const;

const contextFields={
 recommendationType:z.enum(PLACE_RECOMMENDATION_TYPES),
 sourceOfRecommendation:z.enum(PLACE_RECOMMENDATION_SOURCES),
 contactName:text(200).nullable(),
 contactNumber:text(50).nullable(),
 // Private unless the creator chose otherwise. Fresh rows are private, and the adapter
 // must carry an existing selection forward explicitly rather than re-defaulting it.
 contactVisibility:z.enum(PLACE_CONTACT_VISIBILITY),
 placeSocialUrl:safePlaceUrlSchema.nullable(),
 placeWebsiteUrl:safePlaceUrlSchema.nullable(),
 creatorSocialUrl:safePlaceUrlSchema.nullable(),
 // Legacy Users_Place_Note, distinct from the core note while both are still consumed.
 legacyPlaceNote:z.union([z.record(z.unknown()),z.array(z.unknown())]).nullable(),
 personProfileUrl:safePlaceUrlSchema.nullable(),
 personAddress:text(1000).nullable(),
};
export const placeRecommendationContextSchema=z.object(contextFields).strict().superRefine((value,ctx)=>{
 // Recommendation_Type 'person' inside a Places list is preserved, but the person-only
 // fields belong to it alone; they do not leak onto an ordinary place.
 if(value.recommendationType!=='person'&&(value.personProfileUrl!==null||value.personAddress!==null))
  ctx.addIssue({code:z.ZodIssueCode.custom,path:['recommendationType'],message:'Person fields require a person recommendation'});
});

/**
 * The only path by which a creator's contact details may reach a public reader.
 *
 * Returns the disclosable fields when the creator chose public, and nulls otherwise. The
 * public projection calls this rather than spreading the context, so adding a field to
 * the context cannot silently publish it.
 */
export function publicPlaceContact(context:PlaceRecommendationContext){
 const disclosed=context.contactVisibility==='public';
 return {
  contact_name:disclosed?context.contactName:null,
  contact_number:disclosed?context.contactNumber:null,
 };
}

// Place photos are owned media in ordered slots, not provider URLs. Owner decision,
// 2026-10-07: all photos and media are stored in S3, so a provider photo is imported
// into an owned asset first - the same contract book covers and movie media use.
export const placePhotosSchema=z.object({photoMediaIds:z.array(z.string().uuid()).max(10)}).strict();
export type PlacePhotos=z.infer<typeof placePhotosSchema>;

/**
 * The list's own location selection, which is what keeps a location list distinct from
 * the place recommendations inside it. The snapshot is versioned display text; the
 * location's identity is the separately linked entity. Conflating them is how a renamed
 * city would silently rewrite history.
 */
export const placeLocationSnapshotSchema=z.object({
 version:z.literal(1),
 name:text(500).nullable(),address:text(1000).nullable(),
 providerPlaceId:text(200).nullable(),
 latitude:coordinate(90).nullable(),longitude:coordinate(180).nullable(),
}).strict().refine(v=>(v.latitude===null)===(v.longitude===null),{message:'Snapshot coordinates must both be present or both absent',path:['latitude']});
export const placeCollectionDetailsSchema=z.object({
 locationEntityId:z.string().uuid().nullable(),
 locationSnapshot:placeLocationSnapshotSchema.nullable(),
 instagramMediaUrl:safePlaceUrlSchema.nullable(),
}).strict();
export type PlaceLocationSnapshot=z.infer<typeof placeLocationSnapshotSchema>;
export type PlaceCollectionDetails=z.infer<typeof placeCollectionDetailsSchema>;
export const emptyPlaceCollectionDetails=():PlaceCollectionDetails=>({locationEntityId:null,locationSnapshot:null,instagramMediaUrl:null});

/**
 * The legacy List_Name_Details blob, assembled from the three places its parts now live.
 *
 * Consumers read four things from it: note, thumbnail, location.{latitude,longitude,address}
 * and place_id. Those are not one thing, so they are not stored as one:
 *
 *  - note is the list's own text, which is the collection's description column.
 *  - thumbnail is owned media, which is the collection's cover media.
 *  - the rest is the location snapshot.
 *
 * Assembled here, once, so the owner view and the public projection cannot drift into two
 * different shapes for the same consumed blob.
 *
 * location is null only when no location is set. When one is set the coordinates travel as
 * they are, including zero, and absent coordinates stay null rather than becoming (0,0).
 */
export function legacyListNameDetails(snapshot:PlaceLocationSnapshot|null,parts:{note:string|null;thumbnailUrl:string|null}){
 return {
  note:parts.note,thumbnail:parts.thumbnailUrl,
  location:snapshot===null?null:{latitude:snapshot.latitude,longitude:snapshot.longitude,address:snapshot.address},
  place_id:snapshot?.providerPlaceId??null,
  name:snapshot?.name??null,
 };
}

// providerPlaceId is the provider's own identifier for the place, which consumers use to
// deduplicate and to look a place up for claiming. It is identity, not a display fact, so
// it lives on the entity rather than in the overridable details and no owner can restate
// it. A manually entered place has none.
export const placeEntityDtoSchema=z.object({id:z.string().uuid(),kind:z.literal('place'),title:z.string().trim().refine(v=>v.length>0&&Array.from(v).length<=500),details:placeEntityDetailsSchema,origin:z.enum(['manual','provider']),providerPlaceId:z.string().min(1).max(200).nullable()}).strict();
export const resolveManualPlaceSchema=z.object({kind:z.literal('manual'),category:z.literal('places'),details:z.object(entityFields).partial().extend({title:placeTitleSchema}).strict()}).strict();

export type PlaceEntityDetails=z.infer<typeof placeEntityDetailsSchema>;
export type PlaceEntityDto=z.infer<typeof placeEntityDtoSchema>;
export type PlaceRecommendationContext=z.infer<typeof placeRecommendationContextSchema>;
export type PlaceAddressComponent=z.infer<typeof placeAddressComponentSchema>;

export const emptyPlaceDetails=():PlaceEntityDetails=>({formattedAddress:null,addressComponents:[],latitude:null,longitude:null,
 providerTypes:[],providerRating:null,ratingsCount:null,publicPhone:null,websiteUrl:null,priceLevel:null,priceRange:null});
// A fresh context is a self-recommendation of a place with nothing disclosed.
export const emptyPlaceContext=():PlaceRecommendationContext=>({recommendationType:'place',sourceOfRecommendation:'self',
 contactName:null,contactNumber:null,contactVisibility:'private',placeSocialUrl:null,placeWebsiteUrl:null,
 creatorSocialUrl:null,legacyPlaceNote:null,personProfileUrl:null,personAddress:null});
export const emptyPlaceDisplayFields=():z.infer<typeof placeDisplayFieldsSchema>=>({});
