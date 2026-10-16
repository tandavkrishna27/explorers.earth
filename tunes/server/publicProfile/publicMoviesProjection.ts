import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod/v3';
import type {Pool,PoolClient} from 'pg';
import {readMovieEntity,readMovieContext,effectiveMovieDetails,readMovieTerms} from '../repositories/movieCatalogRepository';
import {readMovieProviderMedia} from '../repositories/movieMedia';
import {effectiveMovieWatchOffers} from '../explorers/categories/movies';
import {displayOverridesReadSchema} from '../../shared/explorersContract';
import {normalizeRichNote} from '../application/richNote';

const gate=`a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public`;
const listGate=`c.archived_at IS NULL AND c.visibility='public' AND c.publication_state='published'`;
const recommendationGate=`r.archived_at IS NULL AND r.publication_state='published'`;
const membershipJoin=`FROM collection_items ci JOIN collections c ON c.id=ci.collection_id AND c.account_id=ci.account_id AND c.category=ci.category
 JOIN recommendations r ON r.id=ci.recommendation_id AND r.account_id=ci.account_id AND r.category=ci.category
 JOIN creator_accounts a ON a.id=c.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category`;
async function scope(db:Pick<Pool,'query'>,username:string){return (await db.query(`SELECT a.id,a.handle,a.revision::text AS account_revision,coalesce(cs.revision::text,'0') AS content_revision
 FROM creator_accounts a JOIN account_category_settings s ON s.account_id=a.id AND s.category='movies'
 LEFT JOIN account_category_content_state cs ON cs.account_id=a.id AND cs.category='movies'
 WHERE a.handle_key=lower($1) AND ${gate}`,[username])).rows[0];}
const sameScope=(a:any,b:any)=>!!a&&!!b&&a.id===b.id&&a.account_revision===b.account_revision&&a.content_revision===b.content_revision;
export class PublicMovieCursorError extends Error {constructor(){super('Invalid Movie continuation');}}
const cursorPayload=z.object({v:z.literal(1),account:z.string().uuid(),username:z.string().max(64),category:z.literal('movies'),kind:z.enum(['category','list','genre']),slug:z.string().max(160).nullable(),accountRevision:z.string().regex(/^\d+$/),contentRevision:z.string().regex(/^\d+$/),offset:z.number().int().min(0).max(99999),limit:z.number().int().min(1).max(24)}).strict();
function binding(observed:any,username:string,kind:'category'|'list'|'genre',slug:string|null,limit:number){return {v:1 as const,account:observed.id,username:username.toLowerCase(),category:'movies' as const,kind,slug,accountRevision:observed.account_revision,contentRevision:observed.content_revision,limit};}
function signCursor(secret:string,payload:ReturnType<typeof binding>&{offset:number}){if(secret.length<32)throw new Error('Movie continuation key unavailable');const part=Buffer.from(JSON.stringify(cursorPayload.parse(payload))).toString('base64url');const token=part+'.'+createHmac('sha256',secret).update(part).digest('base64url');if(Buffer.byteLength(token)>2048)throw new PublicMovieCursorError();return token;}
function cursorOffset(cursor:string|undefined,secret:string,expected:ReturnType<typeof binding>){if(!cursor)return 0;if(secret.length<32||Buffer.byteLength(cursor)>2048||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]{43}$/.test(cursor))throw new PublicMovieCursorError();const [part,sig]=cursor.split('.');const supplied=Buffer.from(sig,'base64url'),actual=createHmac('sha256',secret).update(part).digest();if(supplied.length!==actual.length||!timingSafeEqual(supplied,actual))throw new PublicMovieCursorError();let payload;try{const bytes=Buffer.from(part,'base64url');if(bytes.toString('base64url')!==part)throw Error();payload=cursorPayload.parse(JSON.parse(bytes.toString('utf8')));}catch{throw new PublicMovieCursorError();}const {offset,...bound}=payload;if(JSON.stringify(bound)!==JSON.stringify(expected))throw new PublicMovieCursorError();return offset;}

async function richBook(db:PoolClient,row:any){
 if(Number(row.note_bytes)>1048576||Number(row.override_bytes)>1048576)throw new Error('Public Movie exceeds read bound');
 const entity=await readMovieEntity(db,row.entity_id),context=await readMovieContext(db,row.id,row.account_id),copies=await readMovieProviderMedia(db,row.id,row.account_id);
 const overrides=displayOverridesReadSchema.parse(row.display_values??{}),facts=effectiveMovieDetails(entity.details,overrides),terms=await readMovieTerms(db,row.id,row.account_id);
 const media=(await db.query(`SELECT m.id,m.alternative_text,m.caption FROM recommendation_media rm JOIN media_assets m ON m.id=rm.media_id AND m.account_id=rm.account_id
 WHERE rm.recommendation_id=$1 AND m.status='ready' ORDER BY rm.display_order,m.id LIMIT 21`,[row.id])).rows.map(m=>({documentId:m.id,url:`/api/explorers/v1/media/${m.id}/content`,alternativeText:m.alternative_text,caption:m.caption}));
 if(media.length>20)throw new Error('Public Movie exceeds media read bound');
 return {documentId:row.id,tmdb_id:entity.provenance?.externalId??'',media_type:facts.mediaType==='movie'?'Movie':'TV',title:(Object.hasOwn(overrides,'title')?overrides.title:entity.title)??'Untitled movie',
 original_title:facts.originalTitle,year:facts.yearText,poster_path:copies?.poster?.url??facts.posterUrl,backdrop_path:copies?.backdrop?.url??facts.backdropUrl,
 genres:facts.genres.map(g=>({id:g.providerGenreId,name:g.name})),director:facts.director,runtime:facts.runtimeMinutes,tmdb_rating:facts.providerRating,overview:facts.overview,season_count:facts.seasonCount,
 watch_providers:effectiveMovieWatchOffers(facts,context).map(p=>({provider_id:p.providerId,provider_name:p.name,logo_path:p.logoUrl,...(facts.watchProviders[context.region]?.link?{link:facts.watchProviders[context.region].link}:{})})),
 cast_details:facts.cast.slice(0,10).map((c,ordinal)=>({original_name:c.name,character:c.character,profile_url:copies?.cast.find(x=>x.slot.ordinal===ordinal)?.media?.url??c.profileUrl})),
 user_recommendation_note:normalizeRichNote(row.note)?.html??'',user_rating:row.user_rating,is_pinned:row.pin_order!==null,pin_order:row.pin_order,display_order:row.display_order,media_details:null,Media:media,
 movie_categories:terms.map(t=>({documentId:t.id,genre_name:t.label,slug:t.slug})),movie_list:{documentId:row.collection_id,List_Name:row.collection_title,slug:row.collection_slug}};
}
async function projectRows(db:PoolClient,rows:any[]){const books=[];for(const row of rows)books.push(await richBook(db,row));return books;}
async function children(db:PoolClient,account:string,collectionId:string,limit:number,offset:number,nextToken:(offset:number)=>string){
 const rows=(await db.query(`SELECT r.id,r.account_id,r.entity_id,r.user_rating,CASE WHEN octet_length(r.note::text)<=1048576 THEN r.note END AS note,octet_length(r.note::text) AS note_bytes,CASE WHEN octet_length(o.display_values::text)<=1048576 THEN o.display_values END AS display_values,octet_length(o.display_values::text) AS override_bytes,
 ci.display_order,c.id AS collection_id,c.title AS collection_title,c.slug AS collection_slug,
 CASE WHEN tp.collection_id=c.id THEN tp.position END AS pin_order ${membershipJoin}
 LEFT JOIN recommendation_display_overrides o ON o.recommendation_id=r.id AND o.account_id=r.account_id
 LEFT JOIN category_recommendation_pins tp ON tp.recommendation_id=r.id AND tp.account_id=r.account_id AND tp.category=r.category
 WHERE a.id=$1 AND c.id=$2 AND c.category='movies' AND ${gate} AND ${listGate} AND ${recommendationGate}
 ORDER BY ci.display_order,r.id LIMIT $3 OFFSET $4`,[account,collectionId,limit+1,offset])).rows;
 const hasMore=rows.length>limit;return {books:await projectRows(db,rows.slice(0,limit)),nextCursor:hasMore?nextToken(offset+limit):null};
}
/** Fresh bounded Movie projections with revision-bound opaque continuations. */
export async function publicMoviesProjection(pool:Pool,username:string,limit:number,cursor?:string,slug?:string,secret="",genreSlug?:string){
 let offset=0;if(!Number.isInteger(limit)||limit<1||limit>24)throw new Error('Invalid Movies page size');
 const db=await pool.connect();let observed:any,result:any;
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='2000ms'");
  observed=await scope(db,username);if(!observed){await db.query('COMMIT');return undefined;}
  const kind=genreSlug?'genre':slug?'list':'category',cursorBinding=binding(observed,username,kind,genreSlug??slug??null,limit);
  offset=cursorOffset(cursor,secret,cursorBinding);
  if(genreSlug){
   const term=(await db.query("SELECT t.id,x.label FROM taxonomy_terms t JOIN taxonomy_term_translations x ON x.term_id=t.id AND x.locale='en' WHERE t.category='movies' AND t.active AND t.slug=$1 LIMIT 2",[genreSlug])).rows;
   if(term.length!==1){await db.query('COMMIT');return undefined;}
   const rows=(await db.query(`SELECT r.id,r.account_id,r.entity_id,r.user_rating,CASE WHEN octet_length(r.note::text)<=1048576 THEN r.note END AS note,octet_length(r.note::text) AS note_bytes,CASE WHEN octet_length(o.display_values::text)<=1048576 THEN o.display_values END AS display_values,octet_length(o.display_values::text) AS override_bytes,
    ci.display_order,c.id AS collection_id,c.title AS collection_title,c.slug AS collection_slug,NULL::integer AS pin_order ${membershipJoin}
    JOIN recommendation_taxonomy rt ON rt.recommendation_id=r.id AND rt.account_id=r.account_id AND rt.category=r.category
    LEFT JOIN recommendation_display_overrides o ON o.recommendation_id=r.id AND o.account_id=r.account_id
    WHERE a.id=$1 AND c.category='movies' AND rt.term_id=$2 AND ${gate} AND ${listGate} AND ${recommendationGate}
     AND c.id=(SELECT c2.id FROM collection_items ci2 JOIN collections c2 ON c2.id=ci2.collection_id AND c2.account_id=ci2.account_id AND c2.category=ci2.category WHERE ci2.recommendation_id=r.id AND c2.archived_at IS NULL AND c2.visibility='public' AND c2.publication_state='published' ORDER BY c2.display_order,c2.id LIMIT 1)
    ORDER BY c.display_order,c.id,ci.display_order,r.id LIMIT $3 OFFSET $4`,[observed.id,term[0].id,limit+1,offset])).rows;
   result={genre:{documentId:term[0].id,slug:genreSlug,genre_name:term[0].label},recommended_movies:await projectRows(db,rows.slice(0,limit)),nextCursor:rows.length>limit?signCursor(secret,{...cursorBinding,offset:offset+limit}):null};
   if(Buffer.byteLength(JSON.stringify(result))>4*1024*1024)throw new Error('Public Movies page exceeds read bound');
   await db.query('COMMIT');
   return sameScope(observed,await scope(pool,username))?result:undefined;
  }

  const rows=(await db.query(`SELECT c.id,c.title,c.description,c.slug,c.heading,c.display_order,cm.media_id AS cover_media_id FROM collections c
   JOIN creator_accounts a ON a.id=c.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category
   LEFT JOIN collection_media cm ON cm.collection_id=c.id AND cm.account_id=c.account_id AND cm.slot='cover'
   WHERE a.id=$1 AND c.category='movies' AND ${gate} AND ${listGate} AND ($2::text IS NULL OR c.slug=$2)
   ORDER BY c.display_order,c.id LIMIT $3 OFFSET $4`,[observed.id,slug??null,slug?1:limit+1,slug?0:offset])).rows;
  if(slug&&!rows.length){await db.query('COMMIT');return undefined;}
  const lists=[];
  for(const row of rows.slice(0,slug?1:limit)){
   if(Buffer.byteLength(JSON.stringify(row),'utf8')>32768)throw new Error('Public list exceeds read bound');
   const page=await children(db,observed.id,row.id,slug?limit:12,slug?offset:0,next=>signCursor(secret,{...binding(observed,username,'list',row.slug,slug?limit:12),offset:next}));
   lists.push({documentId:row.id,List_Name:row.title,list_description:row.description,slug:row.slug,Visibility:true,display_order:row.display_order,top_picks_heading:row.heading,
    cover_image:row.cover_media_id?{documentId:row.cover_media_id,url:`/api/explorers/v1/media/${row.cover_media_id}/content`}:null,
    account:{documentId:observed.id,username:observed.handle},recommended_movies:page.books,recommended_movies_next_cursor:page.nextCursor});
  }
  const heroRows=slug?[]:(await db.query(`SELECT r.id,r.account_id,r.entity_id,r.user_rating,CASE WHEN octet_length(r.note::text)<=1048576 THEN r.note END AS note,octet_length(r.note::text) AS note_bytes,CASE WHEN octet_length(o.display_values::text)<=1048576 THEN o.display_values END AS display_values,octet_length(o.display_values::text) AS override_bytes,
   ci.display_order,c.id AS collection_id,c.title AS collection_title,c.slug AS collection_slug,tp.position AS pin_order ${membershipJoin}
   JOIN category_recommendation_pins tp ON tp.recommendation_id=r.id AND tp.account_id=r.account_id AND tp.category=r.category AND tp.collection_id=c.id
   LEFT JOIN recommendation_display_overrides o ON o.recommendation_id=r.id AND o.account_id=r.account_id
   WHERE a.id=$1 AND c.category='movies' AND ${gate} AND ${listGate} AND ${recommendationGate}
   ORDER BY tp.position,r.id LIMIT 16`,[observed.id])).rows;
  if(heroRows.length>15)throw new Error('Invalid public Movies pin bound');
  result={movieLists:lists,...(!slug?{topPicks:await projectRows(db,heroRows),nextCursor:rows.length>limit?signCursor(secret,{...cursorBinding,offset:offset+limit}):null}:{})};
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>4*1024*1024)throw new Error('Public Movies page exceeds read bound');
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 // Fresh statement after the page snapshot, including list/content revision.
 return sameScope(observed,await scope(pool,username))?result:undefined;
}
