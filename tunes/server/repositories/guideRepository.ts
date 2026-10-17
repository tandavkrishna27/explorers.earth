import type {Pool,PoolClient} from 'pg';
import {
 GUIDE_SECTION_BLOCK_VERSION,GUIDE_SECTION_LIMIT,GUIDE_SECTION_PAGE_LIMIT,
 guideCollectionDetailsSchema,guideSectionBlocksSchema,guideSectionDtoSchema,
 type GuideCollectionDetails,type GuideSectionBlocks,type GuideSectionDto,
} from '../../shared/explorersGuideContract';
import {RecommendationFailure} from './explorersRecommendationRepository';

/**
 * Ticket 5.3. The guide aggregate: the parent's own fields and its ordered sections.
 *
 * Two things in here carry the weight, and neither is obvious from the signatures.
 *
 * The revision. Every write states the revision it was composed against and this layer
 * compares it under a row lock before touching anything, so eight separate micro editors
 * can edit one guide without overwriting each other. A stale revision is a 409 that
 * changes nothing - the caller keeps what the creator typed and re-reads.
 *
 * The photo registry. Section photo ids live inside the block JSON, and 0050 holds a
 * deferred trigger asserting that the registry table and the JSON name exactly the same
 * assets. So every blocks write must re-sync the registry in the SAME transaction, which
 * is what syncSectionPhotos does. Forgetting it does not corrupt anything - the
 * transaction is refused - but it does turn a save into an opaque 23514.
 */

/** 23514 is a CHECK or constraint-trigger violation; 23503 a foreign key. */
const CHECK_VIOLATION='23514';
const MISSING_REFERENCE='23503';

function mapWriteFailure(error:unknown):never{
 const code=(error as {code?:string}).code,message=(error as {message?:string}).message??'';
 if(code===CHECK_VIOLATION){
  // A registry/JSON mismatch is this layer failing to call syncSectionPhotos, not anything
  // the caller did, so it propagates as an unhandled error and becomes a 500 at the
  // boundary. Dressing a bug here as a client error would hide it behind a retry. Note it
  // will usually surface from the caller's COMMIT rather than here at all, because 0050's
  // trigger is deferred - which is exactly why the asset check in syncSectionPhotos is
  // explicit and immediate instead of relying on this mapping.
  if(/photo registry must match/.test(message))throw error;
  if(/ready owned guide image/.test(message))throw new RecommendationFailure(422,'Guide photo must be a ready owned guide image');
  throw new RecommendationFailure(422,'Invalid guide section');
 }
 if(code===MISSING_REFERENCE)throw new RecommendationFailure(422,'Invalid guide reference');
 throw error;
}

const DETAIL_COLUMNS=`guide_type,multi_city,number_of_days,estimated_budget::text AS estimated_budget,budget_currency,budget_type,
 best_time_to_visit,categories,tags,tips_notes,place_snapshot,location_entity_id`;

/**
 * The guide's own fields, or null when the collection has none yet.
 *
 * estimated_budget comes back as text, not a number: numeric(14,2) through a JavaScript
 * double is exactly the rounding the contract's decimal strings exist to avoid.
 */
export async function readGuideDetails(db:Pick<Pool,'query'>,collectionId:string,accountId:string):Promise<GuideCollectionDetails|null>{
 const row=(await db.query(`SELECT ${DETAIL_COLUMNS} FROM guide_collection_details WHERE collection_id=$1 AND account_id=$2`,[collectionId,accountId])).rows[0];
 if(!row)return null;
 const parsed=guideCollectionDetailsSchema.safeParse({
  guideType:row.guide_type,multiCity:row.multi_city,numberOfDays:row.number_of_days,
  estimatedBudget:row.estimated_budget,budgetCurrency:row.budget_currency,budgetType:row.budget_type,
  bestTimeToVisit:row.best_time_to_visit,categories:row.categories,tags:row.tags,tipsNotes:row.tips_notes,
  place:row.place_snapshot,locationEntityId:row.location_entity_id,
 });
 // Stored content that no longer satisfies the contract is a 422 rather than a silent
 // coercion: returning a half-understood guide is how an editor saves back a guide with
 // fields quietly emptied.
 if(!parsed.success)throw new RecommendationFailure(422,'Invalid stored guide details');
 return parsed.data;
}

export async function countGuideSections(db:Pick<Pool,'query'>,collectionId:string,accountId:string):Promise<number>{
 return Number((await db.query('SELECT count(*)::int AS count FROM guide_sections WHERE collection_id=$1 AND account_id=$2 AND archived_at IS NULL',
  [collectionId,accountId])).rows[0].count);
}

function toSectionDto(row:Record<string,unknown>):GuideSectionDto{
 const blocks=guideSectionBlocksSchema.safeParse(row.blocks);
 // The stored block_version is the gate. A row written by a newer schema is refused here
 // rather than parsed as a partially-understood object, which is the failure mode that
 // turns one save into data loss across every block the reader did not recognise.
 if(row.block_version!==GUIDE_SECTION_BLOCK_VERSION||!blocks.success)throw new RecommendationFailure(422,'Unsupported guide section block version');
 return guideSectionDtoSchema.parse({
  id:row.id,collectionId:row.collection_id,title:row.title,description:row.description,
  displayOrder:row.display_order,blocks:blocks.data,archived:row.archived_at!==null,
  createdAt:(row.created_at as Date).toISOString(),updatedAt:(row.updated_at as Date).toISOString(),
 });
}

/**
 * One page of sections in the owner's order.
 *
 * The cursor is the last display_order seen rather than an offset, so inserting a section
 * mid-walk cannot make the next page skip or repeat one.
 */
export async function readGuideSectionPage(db:Pick<Pool,'query'>,collectionId:string,accountId:string,
 options:{afterOrder?:number;limit?:number;includeArchived?:boolean}={}):Promise<{sections:GuideSectionDto[];nextCursor:number|null}>{
 const limit=Math.min(options.limit??GUIDE_SECTION_PAGE_LIMIT,GUIDE_SECTION_PAGE_LIMIT);
 const rows=(await db.query(`SELECT id,collection_id,title,description,display_order,block_version,blocks,archived_at,created_at,updated_at
   FROM guide_sections WHERE collection_id=$1 AND account_id=$2 AND display_order>$3
   ${options.includeArchived?'':'AND archived_at IS NULL'}
   ORDER BY display_order LIMIT $4`,[collectionId,accountId,options.afterOrder??-1,limit+1])).rows;
 const page=rows.slice(0,limit).map(toSectionDto);
 return {sections:page,nextCursor:rows.length>limit?page[page.length-1].displayOrder:null};
}

/**
 * Locks the guide and returns its current revision, refusing a write composed against an
 * older one.
 *
 * The lock is on the collection row, so two concurrent section writes to one guide
 * serialise rather than both reading the same revision and both believing they are
 * current. The revision itself is the category content revision that 0031 maintains, which
 * is what the owner surfaces already compare.
 */
async function lockGuideAtRevision(db:PoolClient,collectionId:string,accountId:string,expected:number):Promise<void>{
 const guide=(await db.query(`SELECT c.id FROM collections c WHERE c.id=$1 AND c.account_id=$2 AND c.category='guides' FOR UPDATE`,
  [collectionId,accountId])).rows[0];
 if(!guide)throw new RecommendationFailure(404,'Resource unavailable');
 const current=Number((await db.query("SELECT coalesce((SELECT revision FROM account_category_content_state WHERE account_id=$1 AND category='guides'),0) AS revision",
  [accountId])).rows[0].revision);
 if(current!==expected)throw new RecommendationFailure(409,'Guide changed; reload and retry');
}

/**
 * Replaces the registry rows for one section with exactly the asset ids its blocks name.
 *
 * Delete-then-insert rather than a diff: the set is at most ten per place and the
 * correctness that matters is that the end state equals the JSON, which 0050's deferred
 * trigger checks at COMMIT either way.
 */
async function syncSectionPhotos(db:PoolClient,sectionId:string,accountId:string,blocks:GuideSectionBlocks):Promise<void>{
 const ids=new Set<string>();
 for(const place of [...blocks.timeline.morning,...blocks.timeline.afternoon,...blocks.timeline.evening,
  ...blocks.activities.activities,...blocks.stay.accommodations])
  for(const photo of place.photos)ids.add(photo.mediaId);
 await db.query('DELETE FROM guide_section_photos WHERE section_id=$1 AND account_id=$2',[sectionId,accountId]);
 const unique=Array.from(ids);
 if(!unique.length)return;
 // FOR SHARE locks the rows, so a concurrent purpose or status change serialises against
 // this check rather than racing past it into the commit.
 const usable=(await db.query(`SELECT id FROM media_assets
   WHERE id=ANY($1::uuid[]) AND account_id=$2 AND status='ready' AND purpose='guide'
     AND mime_type IN ('image/png','image/jpeg','image/gif','image/webp') AND byte_size BETWEEN 1 AND 5242880
   FOR SHARE`,[unique,accountId])).rowCount;
 if(usable!==unique.length)throw new RecommendationFailure(422,'Guide photo must be a ready owned guide image');
 await db.query(`INSERT INTO guide_section_photos(section_id,account_id,media_id)
   SELECT $1,$2,id FROM unnest($3::uuid[]) id`,[sectionId,accountId,unique]);
}

export async function writeGuideDetails(db:PoolClient,collectionId:string,accountId:string,revision:number,details:GuideCollectionDetails):Promise<void>{
 await lockGuideAtRevision(db,collectionId,accountId,revision);
 try{
  await db.query(`INSERT INTO guide_collection_details(collection_id,account_id,guide_type,multi_city,number_of_days,
    estimated_budget,budget_currency,budget_type,best_time_to_visit,categories,tags,tips_notes,place_snapshot,location_entity_id)
   VALUES($1,$2,$3,$4,$5,$6::numeric,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14)
   ON CONFLICT(collection_id) DO UPDATE SET guide_type=excluded.guide_type,multi_city=excluded.multi_city,
    number_of_days=excluded.number_of_days,estimated_budget=excluded.estimated_budget,budget_currency=excluded.budget_currency,
    budget_type=excluded.budget_type,best_time_to_visit=excluded.best_time_to_visit,categories=excluded.categories,
    tags=excluded.tags,tips_notes=excluded.tips_notes,place_snapshot=excluded.place_snapshot,
    location_entity_id=excluded.location_entity_id`,
   [collectionId,accountId,details.guideType,details.multiCity,details.numberOfDays,details.estimatedBudget,
    details.budgetCurrency,details.budgetType,JSON.stringify(details.bestTimeToVisit),JSON.stringify(details.categories),
    JSON.stringify(details.tags),details.tipsNotes===null?null:JSON.stringify(details.tipsNotes),
    JSON.stringify(details.place),details.locationEntityId]);
 }catch(error){mapWriteFailure(error);}
}

/**
 * Inserts a section, optionally at a position, shifting the sections after it.
 *
 * The shift runs before the insert and both are in the caller's transaction, so the
 * deferrable unique on (collection_id,display_order) permits the moment in between where
 * two rows share a position.
 */
export async function createGuideSection(db:PoolClient,collectionId:string,accountId:string,revision:number,
 input:{title:string;description:string|null;blocks:GuideSectionBlocks;position?:number}):Promise<string>{
 await lockGuideAtRevision(db,collectionId,accountId,revision);
 const count=await countGuideSections(db,collectionId,accountId);
 if(count>=GUIDE_SECTION_LIMIT)throw new RecommendationFailure(422,'Guide already holds the maximum number of sections');
 const position=input.position===undefined?count:Math.min(input.position,count);
 try{
  if(position<count)await db.query('UPDATE guide_sections SET display_order=display_order+1 WHERE collection_id=$1 AND account_id=$2 AND display_order>=$3',
   [collectionId,accountId,position]);
  const id=(await db.query(`INSERT INTO guide_sections(collection_id,account_id,display_order,block_version,title,description,blocks)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id`,
   [collectionId,accountId,position,GUIDE_SECTION_BLOCK_VERSION,input.title,input.description,JSON.stringify(input.blocks)])).rows[0].id as string;
  await syncSectionPhotos(db,id,accountId,input.blocks);
  return id;
 }catch(error){mapWriteFailure(error);}
}

/**
 * Replaces one section's title, description and complete block state.
 *
 * There is no partial block patch on purpose. Each micro editor assembles the whole
 * validated block from its form, so a field the modal does not show cannot arrive as a
 * null that erases what another modal wrote.
 */
export async function updateGuideSection(db:PoolClient,collectionId:string,accountId:string,revision:number,
 sectionId:string,input:{title:string;description:string|null;blocks:GuideSectionBlocks}):Promise<void>{
 await lockGuideAtRevision(db,collectionId,accountId,revision);
 try{
  // The collection_id in the predicate is what makes a section id from another guide a
  // 404 rather than a cross-guide write.
  const result=await db.query(`UPDATE guide_sections SET title=$4,description=$5,blocks=$6::jsonb,block_version=$7,updated_at=now()
    WHERE id=$3 AND collection_id=$1 AND account_id=$2`,
   [collectionId,accountId,sectionId,input.title,input.description,JSON.stringify(input.blocks),GUIDE_SECTION_BLOCK_VERSION]);
  if(!result.rowCount)throw new RecommendationFailure(404,'Resource unavailable');
  await syncSectionPhotos(db,sectionId,accountId,input.blocks);
 }catch(error){
  if(error instanceof RecommendationFailure)throw error;
  mapWriteFailure(error);
 }
}

/**
 * Reorders every section in one transaction.
 *
 * The caller names the complete new order, and a list that is not exactly the guide's
 * current section set is refused: a reorder composed against a guide someone has since
 * added a section to fails loudly instead of dropping that section to the end. The
 * renumber passes through duplicate positions, which only the deferrable unique allows.
 */
export async function reorderGuideSections(db:PoolClient,collectionId:string,accountId:string,revision:number,sectionIds:string[]):Promise<void>{
 await lockGuideAtRevision(db,collectionId,accountId,revision);
 const present=(await db.query('SELECT id FROM guide_sections WHERE collection_id=$1 AND account_id=$2 ORDER BY display_order',
  [collectionId,accountId])).rows.map(row=>row.id as string);
 if(present.length!==sectionIds.length||present.some(id=>!sectionIds.includes(id)))
  throw new RecommendationFailure(409,'Guide sections changed; reload and retry');
 try{
  await db.query(`UPDATE guide_sections s SET display_order=ordered.ordinal-1,updated_at=now()
    FROM unnest($3::uuid[]) WITH ORDINALITY AS ordered(id,ordinal)
    WHERE s.id=ordered.id AND s.collection_id=$1 AND s.account_id=$2`,[collectionId,accountId,sectionIds]);
 }catch(error){mapWriteFailure(error);}
}

/**
 * Deletes a section and closes the gap it leaves.
 *
 * Its photo registry rows go with it by cascade, which releases their RESTRICT on the
 * assets; the assets themselves stay, because the creator deleted a day of the itinerary,
 * not their photographs.
 */
export async function deleteGuideSection(db:PoolClient,collectionId:string,accountId:string,revision:number,sectionId:string):Promise<void>{
 await lockGuideAtRevision(db,collectionId,accountId,revision);
 const row=(await db.query('SELECT display_order FROM guide_sections WHERE id=$1 AND collection_id=$2 AND account_id=$3',
  [sectionId,collectionId,accountId])).rows[0];
 if(!row)throw new RecommendationFailure(404,'Resource unavailable');
 await db.query('DELETE FROM guide_sections WHERE id=$1 AND collection_id=$2 AND account_id=$3',[sectionId,collectionId,accountId]);
 await db.query('UPDATE guide_sections SET display_order=display_order-1 WHERE collection_id=$1 AND account_id=$2 AND display_order>$3',
  [collectionId,accountId,row.display_order]);
}

/** The guide's cover, which is an ordinary collection cover in the 'cover' slot. */
export async function readGuideCoverMediaId(db:Pick<Pool,'query'>,collectionId:string,accountId:string):Promise<string|null>{
 const row=(await db.query("SELECT media_id FROM collection_media WHERE collection_id=$1 AND account_id=$2 AND slot='cover'",
  [collectionId,accountId])).rows[0];
 return row?row.media_id as string:null;
}

/**
 * Attaches a new cover, replacing any existing one.
 *
 * Two things make a failed replacement safe here, and it is worth being precise about
 * which does the work.
 *
 * What protects the original is that this is ONE transaction: an upsert that fails rolls
 * back and the existing cover row is untouched, still attached and still served. The
 * statement order is not what saves it - verified by mutation, since deleting the old row
 * first and then failing the insert leaves the original in place just the same.
 *
 * What this function never does is retire the old asset's bytes. It returns the previous
 * id and leaves the asset alone, so the decision to delete it happens later, outside this
 * transaction, once the new cover is committed. That is the real difference from the
 * Strapi path, where deletion was a separate HTTP call issued BEFORE the upload and
 * committed independently of it - so a failed upload left the guide with no image at all.
 */
export async function attachGuideCover(db:PoolClient,collectionId:string,accountId:string,revision:number,mediaId:string):Promise<string|null>{
 await lockGuideAtRevision(db,collectionId,accountId,revision);
 const previous=await readGuideCoverMediaId(db,collectionId,accountId);
 if(previous===mediaId)return null;
 try{
  await db.query(`INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)
   ON CONFLICT(collection_id,slot) DO UPDATE SET media_id=excluded.media_id`,[collectionId,accountId,mediaId]);
 }catch(error){mapWriteFailure(error);}
 return previous;
}
