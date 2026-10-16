import type {Pool,PoolClient} from 'pg';
import {placeEntityDtoSchema,placeEntityDetailsSchema,placeRecommendationContextSchema,placeAddressComponentSchema,
 emptyPlaceDetails,emptyPlaceContext,emptyPlaceCollectionDetails,placeCollectionDetailsSchema,type PlaceEntityDetails,type PlaceRecommendationContext,type PlaceCollectionDetails} from '../../shared/explorersPlaceContract';
import {RecommendationFailure} from './explorersRecommendationRepository';

// Ticket 5.1. Two halves, read and written separately on purpose:
//
//  - place_entity_details is the provider's description of the place, shared.
//  - place_recommendation_context is one creator's recommendation of it, including their
//    own contact details, and is never read on another creator's behalf.
//
// Coordinates come back from PostgreSQL as text for numeric columns, so they are parsed
// here once. Zero is a coordinate; absent stays null. The paired-null invariant is
// enforced by the contract and by 0046, so a half-known pair cannot be stored or read.

/** numeric comes back as a string; null stays null and "0" becomes 0, not null. */
const decimal=(value:string|null)=>value===null?null:Number(value);

export async function insertPlaceDetails(db:PoolClient,entityId:string,d:PlaceEntityDetails){
 await db.query(`INSERT INTO place_entity_details(entity_id,formatted_address,address_components,latitude,longitude,provider_types,provider_rating,ratings_count,public_phone,public_phone_normalized,website_url,price_level,price_range)
   VALUES($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
  [entityId,d.formattedAddress,JSON.stringify(d.addressComponents),d.latitude,d.longitude,d.providerTypes,
   d.providerRating,d.ratingsCount,d.publicPhone,
   // The normalized form exists for lookup only and is derived, never supplied.
   d.publicPhone===null?null:(d.publicPhone.replace(/[^0-9]/g,'')||null),
   d.websiteUrl,d.priceLevel,d.priceRange===null?null:JSON.stringify(d.priceRange)]);
}

export async function readPlaceEntity(db:Pick<Pool,'query'>,id:string){
 const bounds=(await db.query('SELECT octet_length(to_json(d)::text) AS bytes FROM place_entity_details d WHERE entity_id=$1',[id])).rows[0];
 if(Number(bounds?.bytes??0)>16384)throw new RecommendationFailure(413,'Place facts exceed the read bound');
 const row=(await db.query(`SELECT e.id,e.kind,e.title,e.origin,d.*,d.latitude::text AS latitude_text,d.longitude::text AS longitude_text,d.provider_rating::text AS provider_rating_text,
   (SELECT external_id FROM entity_identifiers WHERE entity_id=e.id AND provider='google_places') AS provider_place_id
   FROM entities e LEFT JOIN place_entity_details d ON d.entity_id=e.id WHERE e.id=$1`,[id])).rows[0];
 if(!row)throw new Error('Place catalog unavailable');
 // Every column is nullable, so a place with nothing but a name is a legitimate record.
 const details=row.entity_id?placeEntityDetailsSchema.parse({
  formattedAddress:row.formatted_address,
  addressComponents:(row.address_components??[]).map((entry:unknown)=>placeAddressComponentSchema.parse(entry)),
  latitude:decimal(row.latitude_text),longitude:decimal(row.longitude_text),
  providerTypes:row.provider_types??[],providerRating:decimal(row.provider_rating_text),
  ratingsCount:row.ratings_count===null?null:Number(row.ratings_count),
  publicPhone:row.public_phone,websiteUrl:row.website_url,
  priceLevel:row.price_level===null?null:Number(row.price_level),priceRange:row.price_range,
 }):emptyPlaceDetails();
 return placeEntityDtoSchema.parse({id:row.id,kind:row.kind,title:row.title,origin:row.origin,providerPlaceId:row.provider_place_id??null,details});
}

/**
 * One creator's recommendation context. An absent row is a real state - a fresh
 * self-recommendation of a place with nothing disclosed - so this returns the empty
 * context rather than failing, and that empty context is private.
 */
export async function readPlaceContext(db:Pick<Pool,'query'>,recommendationId:string,accountId:string):Promise<PlaceRecommendationContext>{
 const row=(await db.query('SELECT * FROM place_recommendation_context WHERE recommendation_id=$1 AND account_id=$2',[recommendationId,accountId])).rows[0];
 if(!row)return emptyPlaceContext();
 return placeRecommendationContextSchema.parse({
  recommendationType:row.recommendation_type,sourceOfRecommendation:row.source_of_recommendation,
  contactName:row.contact_name,contactNumber:row.contact_number,contactVisibility:row.contact_visibility,
  placeSocialUrl:row.place_social_url,placeWebsiteUrl:row.place_website_url,creatorSocialUrl:row.creator_social_url,
  legacyPlaceNote:row.legacy_place_note,personProfileUrl:row.person_profile_url,personAddress:row.person_address,
 });
}

/**
 * Replaces the whole context in one statement, so a disclosure change and a contact
 * change can never be observed half-applied - which matters more here than elsewhere,
 * because the half-applied state could be a published number with visibility not yet set.
 */
export async function writePlaceContext(db:PoolClient,recommendationId:string,accountId:string,context:PlaceRecommendationContext){
 const parsed=placeRecommendationContextSchema.safeParse(context);
 if(!parsed.success)throw new RecommendationFailure(422,'Invalid place recommendation context');
 const value=parsed.data;
 await db.query(`INSERT INTO place_recommendation_context(recommendation_id,account_id,recommendation_type,source_of_recommendation,contact_name,contact_number,contact_visibility,place_social_url,place_website_url,creator_social_url,legacy_place_note,person_profile_url,person_address)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
   ON CONFLICT(recommendation_id) DO UPDATE SET recommendation_type=EXCLUDED.recommendation_type,source_of_recommendation=EXCLUDED.source_of_recommendation,
     contact_name=EXCLUDED.contact_name,contact_number=EXCLUDED.contact_number,contact_visibility=EXCLUDED.contact_visibility,
     place_social_url=EXCLUDED.place_social_url,place_website_url=EXCLUDED.place_website_url,creator_social_url=EXCLUDED.creator_social_url,
     legacy_place_note=EXCLUDED.legacy_place_note,person_profile_url=EXCLUDED.person_profile_url,person_address=EXCLUDED.person_address`,
  [recommendationId,accountId,value.recommendationType,value.sourceOfRecommendation,value.contactName,value.contactNumber,
   value.contactVisibility,value.placeSocialUrl,value.placeWebsiteUrl,value.creatorSocialUrl,
   value.legacyPlaceNote===null?null:JSON.stringify(value.legacyPlaceNote),value.personProfileUrl,value.personAddress]);
}

/** The list's location selection. An absent row means the list has no location yet. */
export async function readPlaceCollectionDetails(db:Pick<Pool,'query'>,collectionId:string,accountId:string):Promise<PlaceCollectionDetails>{
 const row=(await db.query('SELECT location_entity_id,location_snapshot,instagram_media_url FROM place_collection_details WHERE collection_id=$1 AND account_id=$2',[collectionId,accountId])).rows[0];
 if(!row)return emptyPlaceCollectionDetails();
 return placeCollectionDetailsSchema.parse({locationEntityId:row.location_entity_id,
  locationSnapshot:row.location_snapshot&&Object.keys(row.location_snapshot).length?row.location_snapshot:null,
  instagramMediaUrl:row.instagram_media_url});
}

export async function writePlaceCollectionDetails(db:PoolClient,collectionId:string,accountId:string,details:PlaceCollectionDetails){
 const parsed=placeCollectionDetailsSchema.safeParse(details);
 if(!parsed.success)throw new RecommendationFailure(422,'Invalid place list location');
 const value=parsed.data;
 await db.query(`INSERT INTO place_collection_details(collection_id,account_id,location_entity_id,location_snapshot,instagram_media_url)
   VALUES($1,$2,$3,$4::jsonb,$5)
   ON CONFLICT(collection_id) DO UPDATE SET location_entity_id=EXCLUDED.location_entity_id,location_snapshot=EXCLUDED.location_snapshot,instagram_media_url=EXCLUDED.instagram_media_url`,
  [collectionId,accountId,value.locationEntityId,JSON.stringify(value.locationSnapshot??{}),value.instagramMediaUrl]);
}

/**
 * Public claim lookup eligibility, as the direct canonical query the ticket specifies
 * rather than a separate claimable directory that could drift from it.
 *
 * A place is findable when at least one published recommendation of it belongs to a
 * publicly eligible account, list and category. The count is of **distinct creators**, so
 * two recommendations by one account contribute one, which is what the ticket asserts.
 */
export async function publicPlaceLookup(db:Pick<Pool,'query'>,entityId:string){
 const row=(await db.query<{creators:string}>(`SELECT count(DISTINCT r.account_id)::text AS creators
   FROM recommendations r
   JOIN collection_items ci ON ci.recommendation_id=r.id AND ci.account_id=r.account_id AND ci.category=r.category
   JOIN collections c ON c.id=ci.collection_id AND c.account_id=ci.account_id AND c.category=ci.category
   JOIN creator_accounts a ON a.id=r.account_id
   JOIN account_category_settings s ON s.account_id=a.id AND s.category=r.category
   WHERE r.entity_id=$1 AND r.category='places' AND r.archived_at IS NULL AND r.publication_state='published'
     AND c.archived_at IS NULL AND c.visibility='public' AND c.publication_state='published'
     AND a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public`,[entityId])).rows[0];
 const creators=Number(row?.creators??'0');
 return {found:creators>0,creators};
}

/**
 * The place gallery, as ordered owned media. Read by slot so the arrangement survives a
 * reload, and bounded at ten by 0047.
 */
export async function readPlacePhotoMediaIds(db:Pick<Pool,'query'>,recommendationId:string,accountId:string):Promise<string[]>{
 const rows=(await db.query<{media_id:string}>('SELECT media_id FROM recommendation_place_photos WHERE recommendation_id=$1 AND account_id=$2 ORDER BY slot_index',[recommendationId,accountId])).rows;
 if(rows.length>10)throw new RecommendationFailure(413,'Place photos exceed the read bound');
 return rows.map(row=>row.media_id);
}

/** Replaces the whole ordered set, so a reorder is never observed half-applied. */
export async function writePlacePhotos(db:PoolClient,recommendationId:string,accountId:string,mediaIds:readonly string[]){
 if(mediaIds.length>10)throw new RecommendationFailure(422,'Place photos exceed ten slots');
 if(new Set(mediaIds).size!==mediaIds.length)throw new RecommendationFailure(422,'Place photos must be distinct');
 await db.query('DELETE FROM recommendation_place_photos WHERE recommendation_id=$1 AND account_id=$2',[recommendationId,accountId]);
 if(!mediaIds.length)return;
 await db.query(`INSERT INTO recommendation_place_photos(recommendation_id,account_id,slot_index,media_id)
   SELECT $1,$2,ordinality-1,value FROM unnest($3::uuid[]) WITH ORDINALITY AS entry(value,ordinality)`,
  [recommendationId,accountId,[...mediaIds]]);
}

// An owner's display override re-presents a shared entity. The coordinates, address,
// components and provider facts are excluded from the vocabulary, so they can never be
// replaced here - one owner must not be able to move a place others recommend.
export function effectivePlaceDetails(details:PlaceEntityDetails,overrides:Record<string,unknown>){
 const immutable=new Set(['latitude','longitude','formattedAddress','addressComponents','providerRating','ratingsCount','providerTypes']);
 const result={...details};
 for(const key of Object.keys(details))if(!immutable.has(key)&&Object.hasOwn(overrides,key))(result as any)[key]=overrides[key];
 return placeEntityDetailsSchema.parse(result);
}
