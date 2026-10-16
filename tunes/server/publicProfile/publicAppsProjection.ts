import type {Pool,PoolClient} from 'pg';
import {readAppEntity,readAppScreenshotMediaIds,effectiveAppDetails} from '../repositories/appCatalogRepository';
import {displayOverridesReadSchema} from '../../shared/explorersContract';
import {normalizeRichNote} from '../application/richNote';
import {publicProfileCursorStart} from './publicProfileContract';

/**
 * Ticket 4.3. Before this, the public Apps read fell through to an empty page in
 * postgresPublicProfileGateway and answered 200 with no items - a published Apps tab that
 * looked legitimately empty rather than unimplemented, which is the worse failure.
 *
 * Shaped to what the existing consumer reads: appLists / recommended_apps, with
 * top_apps_heading on the list. There is no root hero key because nothing consumes one -
 * the Apps hero filters the recommendations by is_pinned, so pin state travels per row.
 *
 * Screenshots are owned media, so they are served as /api/explorers/v1/media URLs rather
 * than any address an owner typed. app_category is null: taxonomy is deliberately out of
 * 4.3's scope and has no seeded vocabulary.
 */
const gate=`a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public`;
const listGate=`c.archived_at IS NULL AND c.visibility='public' AND c.publication_state='published'`;
const recommendationGate=`r.archived_at IS NULL AND r.publication_state='published'`;
const membershipJoin=`FROM collection_items ci JOIN collections c ON c.id=ci.collection_id AND c.account_id=ci.account_id AND c.category=ci.category
 JOIN recommendations r ON r.id=ci.recommendation_id AND r.account_id=ci.account_id AND r.category=ci.category
 JOIN creator_accounts a ON a.id=c.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category`;

async function scope(db:Pick<Pool,'query'>,username:string){return (await db.query(`SELECT a.id,a.handle,a.revision::text AS account_revision,coalesce(cs.revision::text,'0') AS content_revision
 FROM creator_accounts a JOIN account_category_settings s ON s.account_id=a.id AND s.category='apps'
 LEFT JOIN account_category_content_state cs ON cs.account_id=a.id AND cs.category='apps'
 WHERE a.handle_key=lower($1) AND ${gate}`,[username])).rows[0];}
const sameScope=(a:any,b:any)=>!!a&&!!b&&a.id===b.id&&a.account_revision===b.account_revision&&a.content_revision===b.content_revision;

async function richApp(db:PoolClient,row:any){
 // Apps details are bounded at 8KB by the contract, so the note and override bounds here
 // match the 8192 the public title path applies to every non-Books/Movies category.
 if(Number(row.note_bytes)>8192||Number(row.override_bytes)>8192)throw new Error('Public App exceeds read bound');
 const entity=await readAppEntity(db,row.entity_id);
 const overrides=displayOverridesReadSchema.parse(row.display_values??{}),facts=effectiveAppDetails(entity.details,overrides);
 const screenshots=await readAppScreenshotMediaIds(db,row.id,row.account_id);
 return {documentId:row.id,app_url:facts.appUrl,
 title:(Object.hasOwn(overrides,'title')?overrides.title:entity.title)??'Untitled app',
 description:facts.description,logo_url:facts.logoUrl,developer:facts.developer,
 platforms:facts.platforms.length?facts.platforms:null,price_tier:facts.priceTier,download_url:facts.downloadUrl,
 user_recommendation_note:normalizeRichNote(row.note)?.html??'',user_rating:row.user_rating,
 is_pinned:row.pin_order!==null,pin_order:row.pin_order,display_order:row.display_order,
 screenshots:screenshots.length?screenshots.map(id=>`/api/explorers/v1/media/${id}/content`):null,
 app_list:{documentId:row.collection_id,List_Name:row.collection_title,slug:row.collection_slug},
 app_category:null};
}
async function projectRows(db:PoolClient,rows:any[]){const apps=[];for(const row of rows)apps.push(await richApp(db,row));return apps;}

async function children(db:PoolClient,account:string,collectionId:string,limit:number,offset:number){
 const rows=(await db.query(`SELECT r.id,r.account_id,r.entity_id,r.user_rating,CASE WHEN octet_length(r.note::text)<=8192 THEN r.note END AS note,octet_length(r.note::text) AS note_bytes,CASE WHEN octet_length(o.display_values::text)<=8192 THEN o.display_values END AS display_values,octet_length(o.display_values::text) AS override_bytes,
 ci.display_order,c.id AS collection_id,c.title AS collection_title,c.slug AS collection_slug,
 CASE WHEN tp.collection_id=c.id THEN tp.position END AS pin_order ${membershipJoin}
 LEFT JOIN recommendation_display_overrides o ON o.recommendation_id=r.id AND o.account_id=r.account_id
 LEFT JOIN category_recommendation_pins tp ON tp.recommendation_id=r.id AND tp.account_id=r.account_id AND tp.category=r.category
 WHERE a.id=$1 AND c.id=$2 AND c.category='apps' AND ${gate} AND ${listGate} AND ${recommendationGate}
 ORDER BY ci.display_order,r.id LIMIT $3 OFFSET $4`,[account,collectionId,limit+1,offset])).rows;
 const hasMore=rows.length>limit;return {apps:await projectRows(db,rows.slice(0,limit)),nextCursor:hasMore?`o${offset+limit}`:null};
}

/** Live bounded offset compatibility for the existing public Apps routes. */
export async function publicAppsProjection(pool:Pool,username:string,limit:number,cursor?:string,slug?:string){
 const offset=publicProfileCursorStart(cursor);if(!Number.isInteger(limit)||limit<1||limit>24)throw new Error('Invalid Apps page size');
 const db=await pool.connect();let observed:any,result:any;
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='2000ms'");
  observed=await scope(db,username);if(!observed){await db.query('COMMIT');return undefined;}
  const rows=(await db.query(`SELECT c.id,c.title,c.description,c.slug,c.heading,c.display_order,cm.media_id AS cover_media_id FROM collections c
   JOIN creator_accounts a ON a.id=c.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category
   LEFT JOIN collection_media cm ON cm.collection_id=c.id AND cm.account_id=c.account_id AND cm.slot='cover'
   WHERE a.id=$1 AND c.category='apps' AND ${gate} AND ${listGate} AND ($2::text IS NULL OR c.slug=$2)
   ORDER BY c.display_order,c.id LIMIT $3 OFFSET $4`,[observed.id,slug??null,slug?1:limit+1,slug?0:offset])).rows;
  if(slug&&!rows.length){await db.query('COMMIT');return undefined;}
  const lists=[];
  for(const row of rows.slice(0,slug?1:limit)){
   if(Buffer.byteLength(JSON.stringify(row),'utf8')>32768)throw new Error('Public list exceeds read bound');
   const page=await children(db,observed.id,row.id,slug?limit:12,slug?offset:0);
   lists.push({documentId:row.id,List_Name:row.title,list_description:row.description,slug:row.slug,Visibility:true,display_order:row.display_order,top_apps_heading:row.heading,
    cover_image:row.cover_media_id?{url:`/api/explorers/v1/media/${row.cover_media_id}/content`,alternativeText:null}:null,
    account:{documentId:observed.id,username:observed.handle},recommended_apps:page.apps,recommended_apps_next_cursor:page.nextCursor});
  }
  result={appLists:lists};
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>4*1024*1024)throw new Error('Public Apps page exceeds read bound');
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 // Fresh statement after the page snapshot, including list/content revision.
 return sameScope(observed,await scope(pool,username))?result:undefined;
}
