import {readPersonEntity} from '../repositories/personCatalogRepository';
import {publicPlaceReadFailure,readPublicPlaceEligibility,placePinsReadInteger,publicPlaceSuppressionGate,publicPlaceRowsStillEligible,placePinJoin,placePinBucket,placeSortPosition,encodePlacePinsCursor,decodePlacePinsCursor,type PlacePinsCursorBinding} from '../application/placePinsRead';
import {publicPlacePinsReadSchema} from '../../shared/explorersPublicContentContract';
import {publicAssignedTaxonomy,publicCatalogFence,samePublicCatalog} from './publicTaxonomyProjection';
import type {Pool,PoolClient} from 'pg';
import {readPlaceEntity,readPlaceContext,readPlacePhotoMediaIds,readPlaceCollectionDetails,effectivePlaceDetails} from '../repositories/placeCatalogRepository';
import {emptyPlaceDetails,publicPlaceContact,legacyListNameDetails} from '../../shared/explorersPlaceContract';
import {displayOverridesReadSchema} from '../../shared/explorersContract';
import {normalizeRichNote} from '../application/richNote';
import {publicProfileCursorStart} from './publicProfileContract';
import {publicLinkedPeopleLists,publicPeopleScope,samePeopleScope,publicPeopleResultEligible} from './publicPeopleProjection';
import {publicLinkedProductsLists} from './publicProductsProjection';

/**
 * Ticket 5.1. Before this, the public Places read fell through to an empty page and
 * answered 200 with no items, as every other category did.
 *
 * Shaped to what the existing consumer reads: recommendationLists / recommended_places,
 * with the list's own location selection (List_Name_Details) and Instagram URL, and each
 * item carrying a reconstructed Place_Details object. The consumed keys are Place_Id,
 * Place_Name, Title, Place_Address, Geometry, Rating, Rating_Count and Photos, and all of
 * them are emitted - the ticket requires mapping that JSON "without dropping data used by
 * cards and maps".
 *
 * Photos are owned media served through the media route, concatenated with the owner's
 * own uploads exactly as PlaceOverview already concatenates them. Owner decision,
 * 2026-10-07: all photos and media are stored in S3, so no provider URL appears here and
 * no provider request is made to render a page.
 *
 * Contact details pass through publicPlaceContact and nothing else, so they appear only
 * when the creator chose to disclose them. A creator's private number is never emitted,
 * and the entity's public_phone - an approved provider fact - is separate from it.
 */
const gate=`a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public`;
const listGate=`c.archived_at IS NULL AND c.visibility='public' AND c.publication_state='published'`;
const recommendationGate=`r.archived_at IS NULL AND r.publication_state='published'`;
const membershipJoin=`FROM collection_items ci JOIN collections c ON c.id=ci.collection_id AND c.account_id=ci.account_id AND c.category=ci.category
 JOIN recommendations r ON r.id=ci.recommendation_id AND r.account_id=ci.account_id AND r.category=ci.category
 JOIN creator_accounts a ON a.id=c.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category`;

async function scope(db:Pick<Pool,'query'>,username:string){return (await db.query(`SELECT a.id,a.handle,a.revision::text AS account_revision,coalesce(cs.revision::text,'0') AS content_revision
 FROM creator_accounts a JOIN account_category_settings s ON s.account_id=a.id AND s.category='places'
 LEFT JOIN account_category_content_state cs ON cs.account_id=a.id AND cs.category='places'
 WHERE a.handle_key=lower($1) AND ${gate}`,[username])).rows[0];}
const sameScope=(a:any,b:any)=>!!a&&!!b&&a.id===b.id&&a.account_revision===b.account_revision&&a.content_revision===b.content_revision;

const mediaUrl=(id:string)=>`/api/explorers/v1/media/${id}/content`;

const projectedPlaceEntities=new WeakMap<object,string>();
async function publicPlaceEntity(db:PoolClient,row:any){
 if(row.entity_kind!=='person')return readPlaceEntity(db,row.entity_id);
 const person=await readPersonEntity(db,row.entity_id);
 if(person.suppressed)throw Error('Public Places person unavailable');
 return {title:person.title,details:emptyPlaceDetails()};
}
async function richPlace(db:PoolClient,row:any){
 if(Number(row.note_bytes)>8192||Number(row.override_bytes)>8192)throw new Error('Public Place exceeds read bound');
 const taxonomy=await publicAssignedTaxonomy(db,row.id,row.account_id,'places');
 const entity=await publicPlaceEntity(db,row);
 const overrides=displayOverridesReadSchema.parse(row.display_values??{}),facts=row.entity_kind==='person'?emptyPlaceDetails():effectivePlaceDetails(entity.details,overrides);
 const context=await readPlaceContext(db,row.id,row.account_id);
 const photos=await readPlacePhotoMediaIds(db,row.id,row.account_id);
 const title=(Object.hasOwn(overrides,'title')?overrides.title:entity.title)??'Unnamed place';
 const projected={documentId:row.id,
 // The reconstructed blob the cards and maps read, key for key.
 Place_Details:{
  Place_Id:row.provider_place_id??null,
  Place_Name:title,Title:title,
  Place_Address:facts.formattedAddress,
  // Absent coordinates stay absent rather than becoming (0,0); zero is a real point.
  Geometry:facts.latitude===null||facts.longitude===null?null:{lat:facts.latitude,lng:facts.longitude},
  Rating:facts.providerRating,Rating_Count:facts.ratingsCount,
  // Owned media, never a provider URL and never a provider request.
  Photos:photos.map(id=>({url:mediaUrl(id)})),
  Place_Types:facts.providerTypes.length?facts.providerTypes:null,
  Public_Phone:facts.publicPhone,Website:facts.websiteUrl,
  Price_Level:facts.priceLevel,Price_Range:facts.priceRange,
 },
 media_details:{imageDetails:photos.map(id=>({id,url:mediaUrl(id)}))},
 Media:photos.map(id=>({documentId:id,url:mediaUrl(id)})),
 user_rating:row.user_rating,google_rating:facts.providerRating,
 user_recommendation_note:normalizeRichNote(row.note)?.html??'',
 Users_Place_Note:context.legacyPlaceNote,
 Recommendation_Type:context.recommendationType,
 Source_Of_Recommendation:context.sourceOfRecommendation,
 place_social_url:context.placeSocialUrl,place_website_url:context.placeWebsiteUrl,
 creator_social_url:context.creatorSocialUrl,
 // The only path a creator's contact details reach a reader.
 ...publicPlaceContact(context),
 ...(context.recommendationType==='person'?{person_profile_url:context.personProfileUrl,person_address:context.personAddress}:{}),
 is_pinned:row.pin_order!==null,pin_order:row.pin_order===null?null:placePinsReadInteger(row.pin_order),display_order:row.display_order,
 recommendation_list:{documentId:row.collection_id,List_Name:row.collection_title,slug:row.collection_slug},
 // Taxonomy is deferred to its own ticket: the vocabulary is Strapi content and 5.1
 // forbids inventing production values.
 recommendation_category:taxonomy.root?{...taxonomy.root,Category_Name:taxonomy.root.Category_name}:null,recommendation_sub_category:taxonomy.child?{...taxonomy.child,Sub_Category_Name:taxonomy.child.Category_name}:null};
 projectedPlaceEntities.set(projected,row.entity_id);return projected;
}
async function projectRows(db:PoolClient,rows:any[]){const places=[];for(const row of rows)places.push(await richPlace(db,row));return places;}

async function children(db:PoolClient,account:string,collectionId:string,limit:number,cursor:string|undefined,secret:string,binding:Omit<PlacePinsCursorBinding,'eligibilityFingerprint'>){
 const observation=await readPublicPlaceEligibility(db,account,collectionId),fencedBinding={...binding,eligibilityFingerprint:observation.eligibilityFingerprint};
 const tuple=decodePlacePinsCursor(cursor,secret,fencedBinding),bucket=placePinBucket(),position=placeSortPosition('ci');
 const rows=(await db.query(`SELECT r.id,r.account_id,r.entity_id,e.kind AS entity_kind,r.user_rating,CASE WHEN octet_length(r.note::text)<=8192 THEN r.note END AS note,octet_length(r.note::text) AS note_bytes,CASE WHEN octet_length(o.display_values::text)<=8192 THEN o.display_values END AS display_values,octet_length(o.display_values::text) AS override_bytes,
 ci.display_order,c.id AS collection_id,c.title AS collection_title,c.slug AS collection_slug,
 ei.external_id AS provider_place_id,pp.position AS pin_order,${bucket} AS pin_bucket,${position} AS sort_position ${membershipJoin}
 ${placePinJoin('ci')} JOIN entities e ON e.id=r.entity_id
 LEFT JOIN recommendation_display_overrides o ON o.recommendation_id=r.id AND o.account_id=r.account_id
 LEFT JOIN entity_identifiers ei ON ei.entity_id=r.entity_id AND ei.provider='google_places'
 WHERE a.id=$1 AND c.id=$2 AND c.category='places' AND ${gate} AND ${listGate} AND ${recommendationGate} AND ${publicPlaceSuppressionGate}
 AND ($3::integer IS NULL OR (${bucket},${position},r.id)>($3,$4::bigint,$5::uuid))
 ORDER BY ${bucket},${position},r.id LIMIT $6`,[account,collectionId,tuple?.pinBucket??null,tuple?.sortPosition??null,tuple?.id??null,limit+1])).rows;
 const metadata=publicPlacePinsReadSchema.parse({collectionId,collectionRevision:binding.collectionRevision,categoryContentRevision:binding.categoryRevision,...observation});
 const hasMore=rows.length>limit,last=rows[Math.min(limit,rows.length)-1];
 return {places:await projectRows(db,rows.slice(0,limit)),nextCursor:hasMore?encodePlacePinsCursor(secret,fencedBinding,{pinBucket:last.pin_bucket,sortPosition:placePinsReadInteger(last.sort_position),id:last.id}):null,eligibleItemCount:metadata.eligibleItemCount,eligiblePinCount:metadata.eligiblePinCount,eligibilityFingerprint:metadata.eligibilityFingerprint};
}

/** Outer list ordering remains independent; child pages use authenticated pinned tuple seek. */
export async function publicPlacesProjection(pool:Pool,username:string,limit:number,cursor?:string,slug?:string,secret=""){
 const offset=slug?0:publicProfileCursorStart(cursor);if(!Number.isInteger(limit)||limit<1||limit>24)throw new Error('Invalid Places page size');
 const db=await pool.connect();let observed:any,result:any,catalog:any,peopleCatalog:any,peopleScope:any;
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='2000ms'");
  catalog=await publicCatalogFence(db,'places');peopleCatalog=await publicCatalogFence(db,'people');peopleScope=await publicPeopleScope(db,username);observed=await scope(db,username);if(!observed){await db.query('COMMIT');return undefined;}
  const rows=(await db.query(`SELECT c.id,c.revision::text AS collection_revision,c.title,c.description,c.slug,c.heading,c.display_order,cm.media_id AS cover_media_id FROM collections c
   JOIN creator_accounts a ON a.id=c.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category
   LEFT JOIN collection_media cm ON cm.collection_id=c.id AND cm.account_id=c.account_id AND cm.slot='cover' AND EXISTS(SELECT 1 FROM media_assets m WHERE m.id=cm.media_id AND m.account_id=cm.account_id AND m.status='ready')
   WHERE a.id=$1 AND c.category='places' AND ${gate} AND ${listGate} AND ($2::text IS NULL OR c.slug=$2)
   ORDER BY c.display_order,c.id LIMIT $3 OFFSET $4`,[observed.id,slug??null,slug?1:limit+1,slug?0:offset])).rows;
  if(slug&&!rows.length){await db.query('COMMIT');return undefined;}
  const lists=[];
  for(const row of rows.slice(0,slug?1:limit)){
   if(Buffer.byteLength(JSON.stringify(row),'utf8')>32768)throw new Error('Public list exceeds read bound');
   // The list's own location selection, which is what makes it a location list rather
   // than a bag of places.
   const location=await readPlaceCollectionDetails(db,row.id,observed.id);
   const childLimit=slug?limit:12;
   const binding:Omit<PlacePinsCursorBinding,'eligibilityFingerprint'>={account:observed.id,username:username.toLowerCase(),collection:row.id,slug:row.slug,limit:childLimit,collectionRevision:row.collection_revision,categoryRevision:observed.content_revision,accountRevision:observed.account_revision,catalogVersion:JSON.stringify(catalog)};
   const page=await children(db,observed.id,row.id,childLimit,slug?cursor:undefined,secret,binding);
   // Ticket 5.2. The lists linked to this location, each gated again by its own
   // projection: a private child under a public location is absent, and unpublishing
   // the People or Products category removes them without touching the links.
   const [personLists,productLists]=await Promise.all([
    publicLinkedPeopleLists(db,observed.id,row.id),
    publicLinkedProductsLists(db,observed.id,row.id),
   ]);
   lists.push({documentId:row.id,List_Name:row.title,list_description:row.description,slug:row.slug,Visibility:true,display_order:row.display_order,
    top_picks_heading:row.heading,
    // The blob the cards read, assembled from the snapshot, the list note and the
    // list's own cover media - never from a provider request.
    person_lists:personLists,product_lists:productLists,
    List_Name_Details:legacyListNameDetails(location.locationSnapshot,{note:row.description,thumbnailUrl:row.cover_media_id?mediaUrl(row.cover_media_id):null}),
    Instagram_Media_URL:location.instagramMediaUrl,
    cover_image:row.cover_media_id?{url:mediaUrl(row.cover_media_id),alternativeText:null}:null,
    account:{documentId:observed.id,username:observed.handle},recommended_places:page.places,recommended_places_next_cursor:page.nextCursor,collection_revision:row.collection_revision,category_content_revision:observed.content_revision,eligible_item_count:page.eligibleItemCount,eligible_pin_count:page.eligiblePinCount,eligibility_fingerprint:page.eligibilityFingerprint});
  }
  result={recommendationLists:lists};
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>4*1024*1024)throw new Error('Public Places page exceeds read bound');
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw publicPlaceReadFailure(e);}finally{db.release();}
 return sameScope(observed,await scope(pool,username))&&samePublicCatalog(catalog,await publicCatalogFence(pool,'places'))&&samePublicCatalog(peopleCatalog,await publicCatalogFence(pool,'people'))&&((!peopleScope&&!await publicPeopleScope(pool,username))||samePeopleScope(peopleScope,await publicPeopleScope(pool,username)))&&await publicPeopleResultEligible(pool,observed.id,result)&&await publicPlaceRowsStillEligible(pool,observed.id,result.recommendationLists.flatMap((list:any)=>list.recommended_places.map((place:any)=>{const entityId=projectedPlaceEntities.get(place);if(!entityId)throw Error('Public Places eligibility identity unavailable');return {id:place.documentId,entityId,collectionId:list.documentId};})),result.recommendationLists.map((list:any)=>({collectionId:list.documentId,collectionRevision:list.collection_revision,categoryContentRevision:list.category_content_revision,eligibleItemCount:list.eligible_item_count,eligiblePinCount:list.eligible_pin_count,eligibilityFingerprint:list.eligibility_fingerprint})))?result:undefined;
}
