import type {Pool,PoolClient} from 'pg';
import {readProductEntity,readProductOffer,effectiveProductDetails} from '../repositories/productCatalogRepository';
import {displayOverridesReadSchema} from '../../shared/explorersContract';
import {normalizeRichNote} from '../application/richNote';
import {publicProfileCursorStart} from './publicProfileContract';

/**
 * Ticket 4.4. Before this, the public Products read fell through to an empty page in
 * postgresPublicProfileGateway and answered 200 with no items - a published Products tab
 * that looked legitimately empty rather than unimplemented, the same defect Apps had.
 *
 * Shaped to what the existing consumer reads: productLists / recommended_products, with
 * top_products_heading on the list.
 *
 * price is emitted as a number here, not as the exact decimal string, because this is the
 * display edge: RecommendedProduct.price is `number | null` and formatPrice calls
 * Intl.NumberFormat and toFixed on it. The target schema's rule is that wire amounts are
 * decimal strings and "the adapter converts only for current display" - storage and the
 * owner command/read wire keep the exact decimal, and this projection is the one place
 * that converts. Zero and unknown stay distinct: 0 is a price, null is unrecorded.
 *
 * currency is whatever was stored, including null. There is no USD fallback in the data;
 * the formatter's own display fallback is presentation and is left alone.
 *
 * product_category is null: taxonomy is out of 4.4's scope and has no seeded vocabulary.
 */
const gate=`a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public`;
const listGate=`c.archived_at IS NULL AND c.visibility='public' AND c.publication_state='published'`;
const recommendationGate=`r.archived_at IS NULL AND r.publication_state='published'`;
const membershipJoin=`FROM collection_items ci JOIN collections c ON c.id=ci.collection_id AND c.account_id=ci.account_id AND c.category=ci.category
 JOIN recommendations r ON r.id=ci.recommendation_id AND r.account_id=ci.account_id AND r.category=ci.category
 JOIN creator_accounts a ON a.id=c.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category`;

async function scope(db:Pick<Pool,'query'>,username:string){return (await db.query(`SELECT a.id,a.handle,a.revision::text AS account_revision,coalesce(cs.revision::text,'0') AS content_revision
 FROM creator_accounts a JOIN account_category_settings s ON s.account_id=a.id AND s.category='products'
 LEFT JOIN account_category_content_state cs ON cs.account_id=a.id AND cs.category='products'
 WHERE a.handle_key=lower($1) AND ${gate}`,[username])).rows[0];}
const sameScope=(a:any,b:any)=>!!a&&!!b&&a.id===b.id&&a.account_revision===b.account_revision&&a.content_revision===b.content_revision;

async function richProduct(db:PoolClient,row:any){
 if(Number(row.note_bytes)>8192||Number(row.override_bytes)>8192)throw new Error('Public Product exceeds read bound');
 const entity=await readProductEntity(db,row.entity_id);
 const overrides=displayOverridesReadSchema.parse(row.display_values??{}),facts=effectiveProductDetails(entity.details,overrides);
 const offer=await readProductOffer(db,row.id,row.account_id);
 return {documentId:row.id,product_url:facts.productUrl,
 title:(Object.hasOwn(overrides,'title')?overrides.title:entity.title)??'Untitled product',
 brand:facts.brand,
 // Converted once, at the display edge. An exact decimal that cannot be represented as a
 // double would round here and nowhere else; storage and the owner wire keep the string.
 price:offer.price===null?null:Number(offer.price),
 currency:offer.currencyCode,buy_url:offer.buyUrl,
 logo_url:facts.logoUrl,description:facts.description,
 specifications:Object.keys(facts.specifications).length?facts.specifications:null,
 user_recommendation_note:normalizeRichNote(row.note)?.html??'',user_rating:row.user_rating,
 is_pinned:row.pin_order!==null,pin_order:row.pin_order,display_order:row.display_order,
 images:facts.imageUrls.length?facts.imageUrls:null,
 product_list:{documentId:row.collection_id,List_Name:row.collection_title,slug:row.collection_slug},
 product_category:null};
}
async function projectRows(db:PoolClient,rows:any[]){const products=[];for(const row of rows)products.push(await richProduct(db,row));return products;}

async function children(db:PoolClient,account:string,collectionId:string,limit:number,offset:number){
 const rows=(await db.query(`SELECT r.id,r.account_id,r.entity_id,r.user_rating,CASE WHEN octet_length(r.note::text)<=8192 THEN r.note END AS note,octet_length(r.note::text) AS note_bytes,CASE WHEN octet_length(o.display_values::text)<=8192 THEN o.display_values END AS display_values,octet_length(o.display_values::text) AS override_bytes,
 ci.display_order,c.id AS collection_id,c.title AS collection_title,c.slug AS collection_slug,
 CASE WHEN tp.collection_id=c.id THEN tp.position END AS pin_order ${membershipJoin}
 LEFT JOIN recommendation_display_overrides o ON o.recommendation_id=r.id AND o.account_id=r.account_id
 LEFT JOIN category_recommendation_pins tp ON tp.recommendation_id=r.id AND tp.account_id=r.account_id AND tp.category=r.category
 WHERE a.id=$1 AND c.id=$2 AND c.category='products' AND ${gate} AND ${listGate} AND ${recommendationGate}
 ORDER BY ci.display_order,r.id LIMIT $3 OFFSET $4`,[account,collectionId,limit+1,offset])).rows;
 const hasMore=rows.length>limit;return {products:await projectRows(db,rows.slice(0,limit)),nextCursor:hasMore?`o${offset+limit}`:null};
}

/**
 * Ticket 5.2. The Products lists linked to one location, for the location's public page.
 *
 * The gates are this projection's own, applied again rather than copied: the account must
 * be publicly eligible, the Products category must be public, and the child list itself
 * must be public and published. So a private child under a public location is absent, and
 * unpublishing the Products category removes every linked child from every location page
 * without touching the links.
 */
export async function publicLinkedProductsLists(db:PoolClient,accountId:string,locationCollectionId:string,limit=12){
 const rows=(await db.query(`SELECT c.id,c.title,c.description,c.slug,c.heading,c.display_order,cm.media_id AS cover_media_id
  FROM collection_location_links l
  JOIN collections c ON c.id=l.child_collection_id AND c.account_id=l.account_id AND c.category=l.child_category
  JOIN creator_accounts a ON a.id=c.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category
  LEFT JOIN collection_media cm ON cm.collection_id=c.id AND cm.account_id=c.account_id AND cm.slot='cover'
  WHERE l.account_id=$1 AND l.location_collection_id=$2 AND l.child_category='products'
   AND ${gate} AND ${listGate}
  ORDER BY c.display_order,c.id LIMIT $3`,[accountId,locationCollectionId,limit])).rows;
 const lists=[];
 for(const row of rows){
  const page=await children(db,accountId,row.id,12,0);
  lists.push({documentId:row.id,List_Name:row.title,list_description:row.description,slug:row.slug,Visibility:true,display_order:row.display_order,
   cover_image:row.cover_media_id?{url:`/api/explorers/v1/media/${row.cover_media_id}/content`,alternativeText:null}:null,
   recommended_products:page.products,recommended_products_next_cursor:page.nextCursor});
 }
 return lists;
}

/** Live bounded offset compatibility for the existing public Products routes. */
export async function publicProductsProjection(pool:Pool,username:string,limit:number,cursor?:string,slug?:string){
 const offset=publicProfileCursorStart(cursor);if(!Number.isInteger(limit)||limit<1||limit>24)throw new Error('Invalid Products page size');
 const db=await pool.connect();let observed:any,result:any;
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='2000ms'");
  observed=await scope(db,username);if(!observed){await db.query('COMMIT');return undefined;}
  const rows=(await db.query(`SELECT c.id,c.title,c.description,c.slug,c.heading,c.display_order,cm.media_id AS cover_media_id FROM collections c
   JOIN creator_accounts a ON a.id=c.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category
   LEFT JOIN collection_media cm ON cm.collection_id=c.id AND cm.account_id=c.account_id AND cm.slot='cover'
   WHERE a.id=$1 AND c.category='products' AND ${gate} AND ${listGate} AND ($2::text IS NULL OR c.slug=$2)
   ORDER BY c.display_order,c.id LIMIT $3 OFFSET $4`,[observed.id,slug??null,slug?1:limit+1,slug?0:offset])).rows;
  if(slug&&!rows.length){await db.query('COMMIT');return undefined;}
  const lists=[];
  for(const row of rows.slice(0,slug?1:limit)){
   if(Buffer.byteLength(JSON.stringify(row),'utf8')>32768)throw new Error('Public list exceeds read bound');
   const page=await children(db,observed.id,row.id,slug?limit:12,slug?offset:0);
   lists.push({documentId:row.id,List_Name:row.title,list_description:row.description,slug:row.slug,Visibility:true,display_order:row.display_order,top_products_heading:row.heading,
    cover_image:row.cover_media_id?{url:`/api/explorers/v1/media/${row.cover_media_id}/content`,alternativeText:null}:null,
    account:{documentId:observed.id,username:observed.handle},recommended_products:page.products,recommended_products_next_cursor:page.nextCursor});
  }
  result={productLists:lists};
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>4*1024*1024)throw new Error('Public Products page exceeds read bound');
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 return sameScope(observed,await scope(pool,username))?result:undefined;
}
