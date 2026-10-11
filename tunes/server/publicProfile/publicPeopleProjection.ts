import type {Pool,PoolClient} from 'pg';
import {publicAssignedTaxonomy,publicCatalogFence,samePublicCatalog,resolvePublicSector} from './publicTaxonomyProjection';
import {publicPeopleSectorPageSchema} from '../../shared/explorersPublicPeopleSectorContract';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {readPersonEntity,effectivePersonDetails} from '../repositories/personCatalogRepository';
import {displayOverridesReadSchema} from '../../shared/explorersContract';
import {normalizeRichNote} from '../application/richNote';
import {publicProfileCursorStart} from './publicProfileContract';

/**
 * Ticket 4.5. Before this, the public People read fell through to an empty page and
 * answered 200 with no items - the same defect Apps and Products had.
 *
 * Shaped to what the existing consumer reads: personLists / recommended_people, with
 * top_people_heading on the list, and the compatibility aliases the ticket requires kept
 * at this edge: full_name for the name, profile_url for the primary link, platform for
 * the stored primary_platform with twitter presented as x.
 *
 * Suppressed people are omitted here, in SQL, not filtered afterwards: a person who has
 * asked not to be listed must not appear in a page count, a cursor position or a byte
 * budget, and a later refactor that drops a post-filter would silently expose them.
 *
 * follower_count is presentation text. No Explorers follower relationship exists, which
 * is why it is never parsed or compared.
 */
const gate=`a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public`;
const listGate=`c.archived_at IS NULL AND c.visibility='public' AND c.publication_state='published'`;
const recommendationGate=`r.archived_at IS NULL AND r.publication_state='published'`;
// The suppression gate. Joined, so it bounds the page rather than trimming it.
const suppressionGate=`NOT EXISTS(SELECT 1 FROM person_entity_details pd WHERE pd.entity_id=r.entity_id AND pd.suppressed_at IS NOT NULL)`;
const membershipJoin=`FROM collection_items ci JOIN collections c ON c.id=ci.collection_id AND c.account_id=ci.account_id AND c.category=ci.category
 JOIN recommendations r ON r.id=ci.recommendation_id AND r.account_id=ci.account_id AND r.category=ci.category
 JOIN creator_accounts a ON a.id=c.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category`;

export async function publicPeopleScope(db:Pick<Pool,'query'>,username:string){return (await db.query(`SELECT a.id,a.handle,a.revision::text AS account_revision,coalesce(cs.revision::text,'0') AS content_revision
 FROM creator_accounts a JOIN account_category_settings s ON s.account_id=a.id AND s.category='people'
 LEFT JOIN account_category_content_state cs ON cs.account_id=a.id AND cs.category='people'
 WHERE a.handle_key=lower($1) AND ${gate}`,[username])).rows[0];}
export const samePeopleScope=(a:any,b:any)=>!!a&&!!b&&a.id===b.id&&a.account_revision===b.account_revision&&a.content_revision===b.content_revision;

const projectedPersonEntities=new WeakMap<object,string>();
/** twitter is stored; the frontend has always presented x. */
const presentedPlatform=(stored:string|null)=>stored===null?null:stored==='twitter'?'x':stored;

async function richPerson(db:PoolClient,row:any){
 if(Number(row.note_bytes)>8192||Number(row.override_bytes)>8192)throw new Error('Public Person exceeds read bound');
 const taxonomy=await publicAssignedTaxonomy(db,row.id,row.account_id,'people');
 const entity=await readPersonEntity(db,row.entity_id);
 const overrides=displayOverridesReadSchema.parse(row.display_values??{}),facts=effectivePersonDetails(entity.details,overrides);
 const name=(Object.hasOwn(overrides,'title')?overrides.title:entity.title)??'Unnamed person';
 const primary=facts.socialUrls.primary??(facts.primaryPlatform?facts.socialUrls[facts.primaryPlatform]:undefined)??null;
 const person={documentId:row.id,
 // Canonical plus the compatibility aliases the consuming components still read.
 title:name,full_name:name,
 username_handle:facts.usernameHandle,headline:facts.headline,location_text:facts.locationText,
 avatar_url:facts.avatarUrl,
 platform:presentedPlatform(facts.primaryPlatform),primary_platform:facts.primaryPlatform,
 profile_url:primary,social_urls:Object.keys(facts.socialUrls).length?facts.socialUrls:null,
 skills_tags:facts.skillsTags.length?facts.skillsTags:null,
 follower_count:facts.externalFollowerCountText,
 user_recommendation_note:normalizeRichNote(row.note)?.html??'',user_rating:row.user_rating,
 is_pinned:row.pin_order!==null,pin_order:row.pin_order,display_order:row.display_order,
 person_list:{documentId:row.collection_id,List_Name:row.collection_title,slug:row.collection_slug},
 // Public aliases share the canonical recommendation-local sector identity.
 person_category:taxonomy.root,people_category:taxonomy.root};
 projectedPersonEntities.set(person,row.entity_id);return person;
}
async function projectRows(db:PoolClient,rows:any[]){const people=[];for(const row of rows)people.push(await richPerson(db,row));return people;}

async function children(db:PoolClient,account:string,collectionId:string,limit:number,offset:number){
 const rows=(await db.query(`SELECT r.id,r.account_id,r.entity_id,r.user_rating,CASE WHEN octet_length(r.note::text)<=8192 THEN r.note END AS note,octet_length(r.note::text) AS note_bytes,CASE WHEN octet_length(o.display_values::text)<=8192 THEN o.display_values END AS display_values,octet_length(o.display_values::text) AS override_bytes,
 ci.display_order,c.id AS collection_id,c.title AS collection_title,c.slug AS collection_slug,
 CASE WHEN tp.collection_id=c.id THEN tp.position END AS pin_order ${membershipJoin}
 LEFT JOIN recommendation_display_overrides o ON o.recommendation_id=r.id AND o.account_id=r.account_id
 LEFT JOIN category_recommendation_pins tp ON tp.recommendation_id=r.id AND tp.account_id=r.account_id AND tp.category=r.category
 WHERE a.id=$1 AND c.id=$2 AND c.category='people' AND ${gate} AND ${listGate} AND ${recommendationGate} AND ${suppressionGate}
 ORDER BY ci.display_order,r.id LIMIT $3 OFFSET $4`,[account,collectionId,limit+1,offset])).rows;
 const hasMore=rows.length>limit;return {people:await projectRows(db,rows.slice(0,limit)),nextCursor:hasMore?`o${offset+limit}`:null};
}

/**
 * Ticket 5.2. The People lists linked to one location, for the location's public page.
 *
 * The gates are this projection's own, applied again rather than copied: the account must
 * be publicly eligible, the People category must be public, and the child list itself
 * must be public and published. So a private child under a public location is absent, and
 * unpublishing the People category removes every linked child from every location page
 * without touching the links.
 */
export async function publicLinkedPeopleLists(db:PoolClient,accountId:string,locationCollectionId:string,limit=12){
 const rows=(await db.query(`SELECT c.id,c.title,c.description,c.slug,c.heading,c.display_order,cm.media_id AS cover_media_id
  FROM collection_location_links l
  JOIN collections c ON c.id=l.child_collection_id AND c.account_id=l.account_id AND c.category=l.child_category
  JOIN creator_accounts a ON a.id=c.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category
  LEFT JOIN collection_media cm ON cm.collection_id=c.id AND cm.account_id=c.account_id AND cm.slot='cover' AND EXISTS(SELECT 1 FROM media_assets m WHERE m.id=cm.media_id AND m.account_id=cm.account_id AND m.status='ready')
  WHERE l.account_id=$1 AND l.location_collection_id=$2 AND l.child_category='people'
   AND ${gate} AND ${listGate}
  ORDER BY c.display_order,c.id LIMIT $3`,[accountId,locationCollectionId,limit])).rows;
 const lists=[];
 for(const row of rows){
  const page=await children(db,accountId,row.id,12,0);
  lists.push({documentId:row.id,List_Name:row.title,list_description:row.description,slug:row.slug,Visibility:true,display_order:row.display_order,
   cover_image:row.cover_media_id?{url:`/api/explorers/v1/media/${row.cover_media_id}/content`,alternativeText:null}:null,
   recommended_people:page.people,recommended_people_next_cursor:page.nextCursor});
 }
 return lists;
}

/** Live bounded offset compatibility for the existing public People routes. */
export async function publicPeopleProjection(pool:Pool,username:string,limit:number,cursor?:string,slug?:string){
 const offset=publicProfileCursorStart(cursor);if(!Number.isInteger(limit)||limit<1||limit>24)throw new Error('Invalid People page size');
 const db=await pool.connect();let observed:any,result:any,catalog:any;
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='2000ms'");
  catalog=await publicCatalogFence(db,'people');observed=await publicPeopleScope(db,username);if(!observed){await db.query('COMMIT');return undefined;}
  const rows=(await db.query(`SELECT c.id,c.title,c.description,c.slug,c.heading,c.display_order,cm.media_id AS cover_media_id FROM collections c
   JOIN creator_accounts a ON a.id=c.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category
   LEFT JOIN collection_media cm ON cm.collection_id=c.id AND cm.account_id=c.account_id AND cm.slot='cover' AND EXISTS(SELECT 1 FROM media_assets m WHERE m.id=cm.media_id AND m.account_id=cm.account_id AND m.status='ready')
   WHERE a.id=$1 AND c.category='people' AND ${gate} AND ${listGate} AND ($2::text IS NULL OR c.slug=$2)
   ORDER BY c.display_order,c.id LIMIT $3 OFFSET $4`,[observed.id,slug??null,slug?1:limit+1,slug?0:offset])).rows;
  if(slug&&!rows.length){await db.query('COMMIT');return undefined;}
  const lists=[];
  for(const row of rows.slice(0,slug?1:limit)){
   if(Buffer.byteLength(JSON.stringify(row),'utf8')>32768)throw new Error('Public list exceeds read bound');
   const page=await children(db,observed.id,row.id,slug?limit:12,slug?offset:0);
   lists.push({documentId:row.id,List_Name:row.title,list_description:row.description,slug:row.slug,Visibility:true,display_order:row.display_order,top_picks_heading:row.heading,top_people_heading:row.heading,
    cover_image:row.cover_media_id?{url:`/api/explorers/v1/media/${row.cover_media_id}/content`,alternativeText:null}:null,
    account:{documentId:observed.id,username:observed.handle},recommended_people:page.people,recommended_people_next_cursor:page.nextCursor});
  }
  result={personLists:lists};
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>4*1024*1024)throw new Error('Public People page exceeds read bound');
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 return samePeopleScope(observed,await publicPeopleScope(pool,username))&&samePublicCatalog(catalog,await publicCatalogFence(pool,'people'))&&await publicPeopleResultEligible(pool,observed.id,result)?result:undefined;
}

export class PublicPeopleCursorError extends Error {constructor(){super('Invalid People continuation');}}
const cursorDomain='explorers-public-people-sector/v1:';
type SectorAfter=[number,string,number,string];
function sectorCursor(secret:string,binding:Record<string,unknown>,after:SectorAfter){if(secret.length<32)throw Error('People continuation key unavailable');const part=Buffer.from(JSON.stringify({...binding,after})).toString('base64url');return part+'.'+createHmac('sha256',secret).update(cursorDomain+part).digest('base64url');}
function sectorAfter(secret:string,binding:Record<string,unknown>,cursor?:string):SectorAfter|null{
 if(!cursor)return null;if(secret.length<32||cursor.length>2048||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]{43}$/.test(cursor))throw new PublicPeopleCursorError();
 const [part,signature]=cursor.split('.');const actual=createHmac('sha256',secret).update(cursorDomain+part).digest(),supplied=Buffer.from(signature,'base64url');
 if(actual.length!==supplied.length||!timingSafeEqual(actual,supplied))throw new PublicPeopleCursorError();
 try{const bytes=Buffer.from(part,'base64url');if(bytes.toString('base64url')!==part)throw Error();const parsed=JSON.parse(bytes.toString('utf8'));const {after,...bound}=parsed;
  if(JSON.stringify(bound)!==JSON.stringify(binding)||!Array.isArray(after)||after.length!==4||!Number.isSafeInteger(after[0])||after[0]<0||!Number.isSafeInteger(after[2])||after[2]<0||![after[1],after[3]].every(v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)))throw Error();return after as SectorAfter;
 }catch{throw new PublicPeopleCursorError();}
}
/** Metadata, eligible memberships and entity projection share one owned repeatable snapshot. */
export async function publicPeopleSectorProjection(pool:Pool,username:string,sectorSlug:string,limit:number,cursor?:string,secret=''){
 if(!Number.isInteger(limit)||limit<1||limit>24)throw new PublicPeopleCursorError();
 const db=await pool.connect();let observed:any,resolved:any,result:any;
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='2000ms'");
  observed=await publicPeopleScope(db,username);resolved=await resolvePublicSector(db,sectorSlug);
  if(!observed||!resolved){await db.query('COMMIT');return undefined;}
  const binding={v:1,account:observed.id,username:username.toLowerCase(),category:'people',operation:'sector',term:resolved.sector.id,slug:resolved.sector.slug,catalogVersion:resolved.catalog.version,defaultLocale:resolved.catalog.default_locale,accountRevision:observed.account_revision,contentRevision:observed.content_revision,limit};
  const after=sectorAfter(secret,binding,cursor);
  const rows=(await db.query(`WITH eligible AS (
   SELECT r.id,r.account_id,r.entity_id,r.user_rating,CASE WHEN octet_length(r.note::text)<=8192 THEN r.note END AS note,octet_length(r.note::text) AS note_bytes,
   CASE WHEN octet_length(o.display_values::text)<=8192 THEN o.display_values END AS display_values,octet_length(o.display_values::text) AS override_bytes,
   ci.display_order,c.display_order AS collection_order,c.id AS collection_id,c.title AS collection_title,c.slug AS collection_slug,NULL::integer AS pin_order,
   row_number() OVER(PARTITION BY r.id ORDER BY c.display_order,c.id,ci.display_order,r.id) AS membership_rank ${membershipJoin}
   JOIN recommendation_taxonomy rt ON rt.recommendation_id=r.id AND rt.account_id=r.account_id AND rt.category=r.category
   LEFT JOIN recommendation_display_overrides o ON o.recommendation_id=r.id AND o.account_id=r.account_id
   WHERE a.id=$1 AND c.category='people' AND rt.term_id=$2 AND ${gate} AND ${listGate} AND ${recommendationGate} AND ${suppressionGate}
  ) SELECT * FROM eligible WHERE membership_rank=1 AND ($4::integer IS NULL OR (collection_order,collection_id,display_order,id)>($4::integer,$5::uuid,$6::integer,$7::uuid)) ORDER BY collection_order,collection_id,display_order,id LIMIT $3`,[observed.id,resolved.sector.id,limit+1,after?.[0]??null,after?.[1]??null,after?.[2]??null,after?.[3]??null])).rows;
  const {id,...sector}=resolved.sector;
  result=publicPeopleSectorPageSchema.parse({version:'explorers-public-people-sector/v1',sector,canonicalSlug:sector.slug,redirectSlug:sectorSlug===sector.slug?null:sector.slug,recommended_people:await projectRows(db,rows.slice(0,limit)),nextCursor:rows.length>limit?sectorCursor(secret,binding,[rows[limit-1].collection_order,rows[limit-1].collection_id,rows[limit-1].display_order,rows[limit-1].id]):null});
  result.recommended_people.forEach((person:object,index:number)=>projectedPersonEntities.set(person,rows[index].entity_id));
  if(Buffer.byteLength(JSON.stringify(result))>4*1024*1024)throw Error('Public People page exceeds read bound');
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 const current=await resolvePublicSector(pool,resolved.sector.slug);
 return samePeopleScope(observed,await publicPeopleScope(pool,username))&&current&&samePublicCatalog(resolved.catalog,current.catalog)&&JSON.stringify(resolved.sector)===JSON.stringify(current.sector)&&await publicPeopleResultEligible(pool,observed.id,result)?result:undefined;
}


/** Entity suppression has its own writer and is not covered by category revisions.
 * Check the returned owned recommendations again in a fresh bounded transaction. */
export async function publicPeopleResultEligible(pool:Pool,accountId:string,result:any){
 const ids=new Set<string>();const entities=new Map<string,string>();
 const add=(people:any[])=>{for(const person of people??[]){ids.add(person.documentId);const entity=projectedPersonEntities.get(person);if(!entity)throw Error('Public Person eligibility identity unavailable');entities.set(person.documentId,entity);}};
 add(result?.recommended_people);
 for(const list of result?.personLists??[])add(list.recommended_people);
 for(const location of result?.recommendationLists??[])for(const list of location.person_lists??[])add(list.recommended_people);
 if(!ids.size)return true;if(ids.size>24*12*12)throw Error('Public People eligibility read exceeds bound');
 const db=await pool.connect();
 try{
  await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='2000ms'");
  const rows=(await db.query(`/* public_people_current_eligibility */ SELECT DISTINCT r.id,r.entity_id ${membershipJoin}
   WHERE a.id=$1 AND r.id=ANY($2::uuid[]) AND r.category='people' AND c.category='people'
   AND ${gate} AND ${listGate} AND ${recommendationGate} AND ${suppressionGate}`,[accountId,[...ids]])).rows;
  await db.query('COMMIT');return rows.length===ids.size&&rows.every(row=>entities.get(row.id)===row.entity_id);
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
