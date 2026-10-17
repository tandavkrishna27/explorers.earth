import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod/v3';
import {catalogTitleSchema,displayOverridesReadSchema} from '../../shared/explorersContract';
import {SEARCH_PAGE_BYTES,ownerSearchItemSchema,publicSearchItemSchema,type SearchRequest} from '../../shared/explorersSearchContract';
export class SearchFailure extends Error {
 constructor(readonly status:400|404|409|413|422|503,message='Invalid search request'){super(message);}
}
const cursorSchema=z.object({v:z.literal(1),binding:z.string(),account:z.string().uuid().nullable(),revision:z.string().nullable(),snapshotToken:z.string().max(4096).optional(),issued:z.number().int(),expires:z.number().int(),created:z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/),id:z.string().uuid()}).strict();
export type SearchCursor=z.infer<typeof cursorSchema>;
export const publicAccountGate="a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public";
export const publicCollectionGate="c.archived_at IS NULL AND c.visibility='public' AND c.publication_state='published'";
const bytes='octet_length(to_json(e.title)::text)+coalesce(octet_length(o.display_values::text),0)';
// CASE, rather than predicate evaluation order, prevents invalid or oversized
// presentation from entering the text search function. Present null stays null.
const effective=`CASE WHEN ${bytes}<=8192 AND (o.display_values IS NULL OR (jsonb_typeof(o.display_values)='object' AND o.display_values-'title'='{}'::jsonb)) THEN
 CASE WHEN o.display_values ? 'title' THEN CASE WHEN jsonb_typeof(o.display_values->'title')='string' THEN o.display_values->>'title' END ELSE e.title END END`;
export class SearchQuery {
 private key:Buffer;
 constructor(secret:string){this.key=createHash('sha256').update('explorers-search/v1\0').update(secret).digest();}
 binding(input:SearchRequest,account:string|null){return createHash('sha256').update(JSON.stringify(['explorers-search/v1',input.scope,account,input.category,input.query,input.entityIds??null,input.collectionId??null,'creatorHandle' in input?input.creatorHandle??null:null,input.limit,'created_at,id/asc'])).digest('hex');}
 decode(token:string|undefined):SearchCursor|undefined{
  if(!token)return;
  try{if(token.length>4096)throw Error();const bytes=Buffer.from(token,'base64url');if(bytes.toString('base64url')!==token||bytes.length<29)throw Error();const c=createDecipheriv('aes-256-gcm',this.key,bytes.subarray(0,12));c.setAAD(Buffer.from('explorers-search/v1'));c.setAuthTag(bytes.subarray(12,28));return cursorSchema.parse(JSON.parse(Buffer.concat([c.update(bytes.subarray(28)),c.final()]).toString('utf8')));}catch{throw new SearchFailure(422,'Invalid continuation');}
 }
 encode(cursor:SearchCursor){const nonce=randomBytes(12),c=createCipheriv('aes-256-gcm',this.key,nonce);c.setAAD(Buffer.from('explorers-search/v1'));const encrypted=Buffer.concat([c.update(JSON.stringify(cursor),'utf8'),c.final()]);
  const result=Buffer.concat([nonce,c.getAuthTag(),encrypted]).toString('base64url');if(result.length>4096)throw new SearchFailure(413,'Continuation exceeds bound');return result;
 }
 validate(cursor:SearchCursor|undefined,binding:string,account:string|null,revision:string|null){if(!cursor)return;const now=Date.now();if(cursor.binding!==binding||cursor.account!==account||cursor.expires<=now||cursor.issued>now||cursor.expires-cursor.issued!==600000)throw new SearchFailure(422,'Invalid continuation');if(cursor.revision!==revision)throw new SearchFailure(409,'Content changed; restart pagination');}
 async rows(db:PoolClient,input:SearchRequest,account:string|null,cursor?:SearchCursor){
  const values:unknown[]=[input.category,account,input.entityIds??null,input.collectionId??null,input.query,cursor?.created??null,cursor?.id??null,input.limit+1];
  const authority=input.scope==='owner'?`r.account_id=$2::uuid AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM collection_items ci WHERE ci.recommendation_id=r.id AND ci.account_id=r.account_id AND ci.category=r.category AND ci.collection_id=$4))`:
   `${publicAccountGate} AND ($2::uuid IS NULL OR r.account_id=$2) AND r.publication_state='published' AND EXISTS(SELECT 1 FROM collection_items ci JOIN collections c ON c.id=ci.collection_id AND c.account_id=ci.account_id AND c.category=ci.category WHERE ci.recommendation_id=r.id AND ci.account_id=r.account_id AND ci.category=r.category AND ${publicCollectionGate} AND ($4::uuid IS NULL OR c.id=$4))`;
  return (await db.query(`SELECT r.id,r.account_id,r.category,r.entity_id,r.user_rating,r.publication_state,r.revision,e.kind,
   to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_key,${bytes} AS title_bytes,
   CASE WHEN ${bytes}<=8192 THEN e.title END AS canonical_title,CASE WHEN ${bytes}<=8192 THEN o.display_values END AS display_values
   FROM recommendations r JOIN entities e ON e.id=r.entity_id LEFT JOIN recommendation_display_overrides o ON o.recommendation_id=r.id AND o.account_id=r.account_id
   ${input.scope==='public'?'JOIN creator_accounts a ON a.id=r.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=r.category':''}
   WHERE r.category=$1 AND r.archived_at IS NULL AND ${authority} AND ($3::uuid[] IS NULL OR r.entity_id=ANY($3))
   AND ($5='' OR to_tsvector('simple',${effective}) @@ plainto_tsquery('simple',$5))
   AND ($6::timestamptz IS NULL OR (r.created_at,r.id)>($6::timestamptz,$7::uuid)) ORDER BY r.created_at,r.id LIMIT $8`,values)).rows;
 }
 page(rows:any[],input:SearchRequest,base:Record<string,unknown>,state:Omit<SearchCursor,'created'|'id'>){
  let result={...base,items:[] as unknown[],nextCursor:null as string|null};
  for(let n=0;n<Math.min(input.limit,rows.length);n++){
   const row=rows[n];if(Number(row.title_bytes)>8192)throw new SearchFailure(413,'Stored title exceeds bound');
   const canonical=catalogTitleSchema.safeParse(row.canonical_title),override=displayOverridesReadSchema.safeParse(row.display_values??{});
   if(!canonical.success||!override.success)throw new SearchFailure(input.scope==='owner'?422:400,'Invalid stored title');
   const title=Object.hasOwn(override.data,'title')?override.data.title:canonical.data;
   const publicItem={id:row.id,title,kind:row.kind,userRating:row.user_rating};
   const item=input.scope==='public'?publicSearchItemSchema.parse(publicItem):ownerSearchItemSchema.parse({...publicItem,accountId:row.account_id,category:row.category,entityId:row.entity_id,entity:{id:row.entity_id,title:canonical.data,kind:row.kind},publicationState:row.publication_state,revision:Number(row.revision)});
   const candidate={...base,items:[...result.items,item],nextCursor:rows.length>n+1?this.encode({...state,created:row.created_key,id:row.id}):null};
   if(Buffer.byteLength(JSON.stringify(candidate),'utf8')>SEARCH_PAGE_BYTES){if(!result.items.length)throw new SearchFailure(413,'Search exceeds response bound');break;}result=candidate;
  }return result;
 }
}
export function searchError(error:unknown):never{if((error as {code?:string}).code==='57014')throw new SearchFailure(503,'Search timed out; retry');throw error;}
