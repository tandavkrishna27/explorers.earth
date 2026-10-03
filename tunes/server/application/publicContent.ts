import {movieDisplayFieldsSchema} from '../../shared/explorersMovieContract';
import {readMovieEntity,readMovieContext,readMovieTerms,effectiveMovieDetails} from '../repositories/movieCatalogRepository';
import {readBookCovers} from '../repositories/bookCovers';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod/v3';
import { publicContentRequestSchema, type PublicContentPage, type PublicContentRequest,
  type PublicCollectionSummary, type PublicRecommendationSummary } from '../../shared/explorersPublicContentContract';
import { publicRecommendationDetailRequestSchema,publicRecommendationDetailSchema,publicRecommendationSummarySchema } from '../../shared/explorersPublicContentContract';
import { displayOverridesReadSchema,catalogTitleSchema } from '../../shared/explorersContract';
import { normalizeRichNote } from './richNote';
import {publicSearchRequestSchema,publicSearchPageSchema,publicCollectionByIdSchema} from '../../shared/explorersSearchContract';
import {contentIdSchema} from '../../shared/explorersContract';
import {readBookEntity,readBookContext,effectiveBookDetails} from '../repositories/bookCatalogRepository';
import {SearchQuery,SearchFailure,searchError,publicAccountGate,publicCollectionGate} from './searchQuery';

export class PublicContentFailure extends Error {
  constructor(readonly status:400|409|413) {super(status===400?'Invalid public content request':status===413?'Public detail exceeds the response bound':'Collection changed; restart pagination');}
}
const cursorSchema=z.object({version:z.literal(1),binding:z.string(),account:z.string().uuid(),
  revision:z.string().nullable(),order:z.number().int().nonnegative().max(2147483647),id:z.string().uuid()}).strict();
type Cursor=z.infer<typeof cursorSchema>;
const overrideJoin='LEFT JOIN recommendation_display_overrides o ON o.recommendation_id=r.id AND o.account_id=r.account_id';
const titleBytes='octet_length(to_json(e.title)::text)+coalesce(octet_length(o.display_values::text),0)';
const boundedTitle=`CASE WHEN ${titleBytes}<=CASE WHEN r.category IN('books','movies') THEN 1048576 ELSE 8192 END THEN e.title END AS canonical_title,CASE WHEN ${titleBytes}<=CASE WHEN r.category IN('books','movies') THEN 1048576 ELSE 8192 END THEN o.display_values END AS display_values,${titleBytes} AS title_bytes,r.category AS content_category,o.schema_version AS override_schema_version`;
function effectiveTitle(row:any) {
 if(Number(row.title_bytes)>(['books','movies'].includes(row.content_category)?1048576:8192))throw new PublicContentFailure(413);
 if(row.override_schema_version!==null&&row.override_schema_version!==undefined&&row.override_schema_version!==1)throw new PublicContentFailure(400);
 const title=catalogTitleSchema.safeParse(row.canonical_title),overrides=displayOverridesReadSchema.safeParse(row.display_values??{});
 if(!title.success||!overrides.success)throw new PublicContentFailure(400);
 if(row.content_category==='movies'){const {title:_,...fields}=overrides.data;if(!movieDisplayFieldsSchema.safeParse(fields).success)throw new PublicContentFailure(400);}
 else if(row.content_category!=='books'&&Object.keys(overrides.data).some(k=>k!=='title'))throw new PublicContentFailure(400);
 return Object.hasOwn(overrides.data,'title')?overrides.data.title:title.data;
}
/** Live public pages, never a complete-set owner read. Each page has one consistent database snapshot. */
export class PublicContentService {
  private readonly key:Buffer;
  constructor(private readonly pool:Pool,secret:string) {this.key=createHash('sha256').update('explorers-public-content-cursor/v1\0').update(secret).digest();}
  async getCollectionById(raw:unknown){
   const parsed=contentIdSchema.safeParse(raw);if(!parsed.success)throw new SearchFailure(400);
   const db=await this.pool.connect();try{
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout = '2000ms'");
    const size="octet_length(to_json(c.title)::text)+octet_length(to_json(c.slug)::text)+coalesce(octet_length(to_json(c.description)::text),4)+coalesce(octet_length(to_json(c.heading)::text),4)";
    const row=(await db.query(`SELECT c.id,c.category,${size} AS item_bytes,
     CASE WHEN ${size}<=32768 THEN c.title END AS title,CASE WHEN ${size}<=32768 THEN c.slug END AS slug,
     CASE WHEN ${size}<=32768 THEN c.description END AS description,CASE WHEN ${size}<=32768 THEN c.heading END AS heading
     FROM collections c JOIN creator_accounts a ON a.id=c.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category
     WHERE c.id=$1 AND ${publicAccountGate} AND ${publicCollectionGate}`,[parsed.data])).rows[0];
    if(row&&Number(row.item_bytes)>32768)throw new SearchFailure(413,'Collection exceeds read bound');
    const result=row?publicCollectionByIdSchema.parse({id:row.id,category:row.category,title:row.title,slug:row.slug,description:row.description,heading:row.heading}):undefined;
    await db.query('COMMIT');return result;
   }catch(error){await db.query('ROLLBACK');searchError(error);}finally{db.release();}
  }
  async searchRecommendations(raw:unknown){
   const parsed=publicSearchRequestSchema.safeParse(raw);if(!parsed.success)throw new SearchFailure(400);
   const input=parsed.data,query=new SearchQuery(this.key.toString('hex')),db=await this.pool.connect();
   try{
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout = '2000ms'");
    let account:string|null=null,revision:string|null=null;
    if(input.creatorHandle){const row=(await db.query(`SELECT a.id FROM creator_accounts a JOIN account_category_settings s ON s.account_id=a.id AND s.category=$2 WHERE a.handle_key=$1 AND ${publicAccountGate}`,[input.creatorHandle,input.category])).rows[0];if(!row)throw new SearchFailure(404,'Resource unavailable');account=row.id;
     revision=(await db.query("SELECT coalesce((SELECT revision::text FROM account_category_content_state WHERE account_id=$1 AND category=$2),'0') AS revision",[account,input.category])).rows[0].revision;
    }
    if(input.collectionId&&!(await db.query(`SELECT c.id FROM collections c JOIN creator_accounts a ON a.id=c.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category WHERE c.id=$1 AND c.category=$2 AND ($3::uuid IS NULL OR c.account_id=$3) AND ${publicAccountGate} AND ${publicCollectionGate}`,[input.collectionId,input.category,account])).rows.length)throw new SearchFailure(404,'Resource unavailable');
    const binding=query.binding(input,account),cursor=query.decode(input.cursor);query.validate(cursor,binding,account,revision);
    const issued=cursor?.issued??Date.now(),expires=cursor?.expires??issued+600000;
    const result=publicSearchPageSchema.parse(query.page(await query.rows(db,input,account,cursor),input,{version:'explorers-search/v1',scope:'public',consistency:account?'category-fenced':'live',expiresAt:expires},{v:1,binding,account,revision,issued,expires}));
    await db.query('COMMIT');return result;
   }catch(error){await db.query('ROLLBACK');if(error instanceof SearchFailure&&error.status===422)throw new SearchFailure(400,error.message);searchError(error);}finally{db.release();}
  }
  private binding(input:PublicContentRequest) {return JSON.stringify([input.username,input.category,input.slug??null,input.limit,'display_order,id/v1']);}
  private decode(value:string|undefined,binding:string):Cursor|undefined {
    if(!value) return undefined;
    try {
      const bytes=Buffer.from(value,'base64url');if(bytes.toString('base64url')!==value||bytes.length<29) throw new Error();
      const cipher=createDecipheriv('aes-256-gcm',this.key,bytes.subarray(0,12));cipher.setAAD(Buffer.from('explorers-public-content/v1'));cipher.setAuthTag(bytes.subarray(12,28));
      const cursor=cursorSchema.parse(JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8')));
      if(cursor.binding!==binding) throw new Error();return cursor;
    } catch {throw new PublicContentFailure(400);}
  }
  private encode(cursor:Cursor) {
    const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,nonce);cipher.setAAD(Buffer.from('explorers-public-content/v1'));
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(cursor),'utf8'),cipher.final()]);return Buffer.concat([nonce,cipher.getAuthTag(),encrypted]).toString('base64url');
  }
  async detail(raw:unknown) {
    const parsed=publicRecommendationDetailRequestSchema.safeParse(raw);if(!parsed.success)throw new PublicContentFailure(400);
    const input=parsed.data,db=await this.pool.connect();
    try {
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const eligible=`FROM recommendations r JOIN collection_items ci ON ci.recommendation_id=r.id AND ci.account_id=r.account_id AND ci.category=r.category
        JOIN collections c ON c.id=ci.collection_id AND c.account_id=ci.account_id AND c.category=ci.category
        JOIN creator_accounts a ON a.id=r.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=r.category
        JOIN entities e ON e.id=r.entity_id ${overrideJoin} WHERE a.handle_key=$1 AND r.category=$2 AND c.slug=$3 AND r.id=$4
        AND a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public
        AND c.archived_at IS NULL AND c.visibility='public' AND c.publication_state='published'
        AND r.archived_at IS NULL AND r.publication_state='published'`;
      const values=[input.username,input.category,input.slug,input.id];
      const size=(await db.query(`SELECT coalesce(octet_length(r.note::text),0) AS bytes,${titleBytes} AS title_bytes ${eligible}`,values)).rows[0];
      if(!size){await db.query('COMMIT');return undefined;}
      if(Number(size.bytes)>1024*1024||Number(size.title_bytes)>(['books','movies'].includes(input.category)?1048576:8192)||Number(size.bytes)+Number(size.title_bytes)+1024>4*1024*1024)throw new PublicContentFailure(413);
      const row=(await db.query(`SELECT r.id,r.account_id,r.entity_id,${boundedTitle},e.kind,r.user_rating,r.note ${eligible}`,values)).rows[0];
      const book=row.kind==='book'?await readBookEntity(db,row.entity_id):undefined;const movie=row.kind==='movie'&&(await db.query('SELECT 1 FROM movie_entity_details WHERE entity_id=$1',[row.entity_id])).rowCount?await readMovieEntity(db,row.entity_id):undefined;
      const value=publicRecommendationDetailSchema.parse({version:'explorers-public-content/v1',recommendation:{id:row.id,title:effectiveTitle(row),kind:row.kind,userRating:row.user_rating,note:normalizeRichNote(row.note),...(book?{bookCovers:await readBookCovers(db,row.id),bookDetails:effectiveBookDetails(book.details,displayOverridesReadSchema.parse(row.display_values??{})),bookContext:await readBookContext(db,row.id,row.account_id)}:{}),...(movie?{movieDetails:effectiveMovieDetails(movie.details,displayOverridesReadSchema.parse(row.display_values??{})),movieContext:await readMovieContext(db,row.id,row.account_id),movieTerms:await readMovieTerms(db,row.id,row.account_id)}:{})}});
      if(Buffer.byteLength(JSON.stringify(value))>4*1024*1024)throw new PublicContentFailure(413);
      await db.query('COMMIT');return value;
    }catch(error){await db.query('ROLLBACK');if((error as {status?:number}).status===413)throw new PublicContentFailure(413);throw error;}finally{db.release();}
  }
  async page(raw:unknown):Promise<PublicContentPage<PublicCollectionSummary|PublicRecommendationSummary>|undefined> {
    const parsed=publicContentRequestSchema.safeParse(raw);if(!parsed.success) throw new PublicContentFailure(400);
    const input=parsed.data,binding=this.binding(input),cursor=this.decode(input.cursor,binding);
    const db=await this.pool.connect();
    try {
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const account=(await db.query(`SELECT a.id FROM creator_accounts a JOIN account_category_settings s ON s.account_id=a.id AND s.category=$2
        WHERE a.handle_key=$1 AND a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public`,[input.username,input.category])).rows[0];
      if(!account) {await db.query('COMMIT');return undefined;}
      if(cursor&&cursor.account!==account.id) throw new PublicContentFailure(400);
      let revision:string|null=null,rows:any[];
      if(input.slug!==undefined) {
        const collection=(await db.query(`SELECT id,revision::text FROM collections WHERE account_id=$1 AND category=$2 AND slug=$3
          AND archived_at IS NULL AND visibility='public' AND publication_state='published'`,[account.id,input.category,input.slug])).rows[0];
        if(!collection) {await db.query('COMMIT');return undefined;}
        const categoryState=(await db.query("SELECT coalesce((SELECT revision::text FROM account_category_content_state WHERE account_id=$1 AND category=$2),'0') revision",[account.id,input.category])).rows[0];
        revision=`${collection.revision}:${categoryState.revision}`;if(cursor&&cursor.revision!==revision) throw new PublicContentFailure(409);
        rows=(await db.query(`SELECT r.id,${boundedTitle},e.kind,r.user_rating,ci.display_order FROM collection_items ci
          JOIN recommendations r ON r.id=ci.recommendation_id AND r.account_id=ci.account_id AND r.category=ci.category
          JOIN entities e ON e.id=r.entity_id ${overrideJoin}
          WHERE ci.collection_id=$1 AND ci.account_id=$2 AND ci.category=$3 AND r.archived_at IS NULL AND r.publication_state='published'
          AND ($4::integer IS NULL OR (ci.display_order,r.id)>($4,$5::uuid)) ORDER BY ci.display_order,r.id LIMIT $6`,
          [collection.id,account.id,input.category,cursor?.order??null,cursor?.id??null,input.limit+1])).rows;
      } else {
        if(cursor&&cursor.revision!==null) throw new PublicContentFailure(400);
        rows=(await db.query(`SELECT id,title,slug,description,heading,display_order FROM collections WHERE account_id=$1 AND category=$2
          AND archived_at IS NULL AND visibility='public' AND publication_state='published'
          AND ($3::integer IS NULL OR (display_order,id)>($3,$4::uuid)) ORDER BY display_order,id LIMIT $5`,
          [account.id,input.category,cursor?.order??null,cursor?.id??null,input.limit+1])).rows;
      }
      const hasMore=rows.length>input.limit;rows=rows.slice(0,input.limit);const last=rows.at(-1);
      const result:PublicContentPage<PublicCollectionSummary|PublicRecommendationSummary>={version:'explorers-public-content/v1',
        items:rows.map(row=>input.slug!==undefined?publicRecommendationSummarySchema.parse({id:row.id,title:effectiveTitle(row),kind:row.kind,userRating:row.user_rating}):
          {id:row.id,title:row.title,slug:row.slug,description:row.description,heading:row.heading}),
        nextCursor:hasMore?this.encode({version:1,binding,account:account.id,revision,order:last.display_order,id:last.id}):null};
      await db.query('COMMIT');return result;
    } catch(error) {await db.query('ROLLBACK');throw error;} finally {db.release();}
  }
}
