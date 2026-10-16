import type {Pool,PoolClient} from 'pg';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod/v3';
import {gamesPublicPageSchema,publicGameRowSchema,type GamesPublicPage} from '../../shared/explorersGameOwnerContract';
import {readManualGamePresentation} from '../repositories/gameManualRepository';
import {displayOverridesReadSchema,catalogTitleSchema} from '../../shared/explorersContract';
import {normalizeRichNote} from '../application/richNote';
const accountGate="a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public";
async function scope(db:Pick<Pool,'query'>,username:string){return(await db.query(`SELECT a.id,a.handle,a.revision::text AS account_revision,coalesce(cs.revision::text,'0') AS content_revision FROM creator_accounts a JOIN account_category_settings s ON s.account_id=a.id AND s.category='games' LEFT JOIN account_category_content_state cs ON cs.account_id=a.id AND cs.category='games' WHERE a.handle_key=lower($1) AND ${accountGate}`,[username])).rows[0];}
const sameScope=(first:any,second:any)=>!!first&&!!second&&first.id===second.id&&first.account_revision===second.account_revision&&first.content_revision===second.content_revision;
const RESULT_RESERVATION=24*1024*1024;
let active=0,callers=0,memory=0;
const PENDING_RESERVATION=8192;
export type GamePublicReadInput=Readonly<{username:string;kind:'category'|'detail';limit:number;cursor?:string;slug?:string}>;
const executorBrand:unique symbol=Symbol('Games public executor');
export type GamePublicExecutor=Readonly<{[executorBrand]:true}>;
const executors=new WeakMap<GamePublicExecutor,{dependency:unknown;work:(dependency:any,input:GamePublicReadInput,operation:GamePublicOperation)=>Promise<GamesPublicPage|undefined>}>();
/** Construct once for a shared backend dependency, never from HTTP input. */
export function createGamePublicExecutor<T>(dependency:T,work:(dependency:T,input:GamePublicReadInput,operation:GamePublicOperation)=>Promise<GamesPublicPage|undefined>):GamePublicExecutor{
 const token=Object.freeze({[executorBrand]:true as const});executors.set(token,{dependency,work});return token;
}
type PendingRead={state:'queued'|'reserved'|'nativeStarted'|'resultHeld'|'released';input:GamePublicReadInput|undefined;executor:GamePublicExecutor|undefined;signal:AbortSignal|undefined;expiresAt:number;stopped:boolean;charge:number;operation:GamePublicOperation|undefined;result:GamesPublicPage|undefined;timer:ReturnType<typeof setTimeout>|undefined;stop:()=>void;resolve:(value:GamesPublicPage|undefined)=>void;reject:(error:unknown)=>void};
const pendingReads:PendingRead[]=[];
let draining=false;
function normalizedRead(input:GamePublicReadInput):GamePublicReadInput{
 if(!input||typeof input!=='object'||Object.keys(input).some(key=>!['username','kind','limit','cursor','slug'].includes(key))||typeof input.username!=='string'||input.username.length>64||!input.username.trim()||!['category','detail'].includes(input.kind)||!Number.isInteger(input.limit)||input.limit<1||input.limit>24||input.cursor!==undefined&&(typeof input.cursor!=='string'||input.cursor.length>2048||!input.cursor||!/^[A-Za-z0-9_.-]+$/.test(input.cursor))||input.slug!==undefined&&(typeof input.slug!=='string'||!input.slug||input.slug.length>256)||input.kind==='detail'&&!input.slug)throw new PublicGameReadLimit();
 const username=input.username.trim().toLowerCase();if(username.length>64)throw new PublicGameReadLimit();
 // One scalar copy, <=4736 UTF-16 bytes plus fixed record/callback state within
 // the conservative8KiB reservation. No req/res/body/rows or arbitrary work
 // closure is retained. Executor dependency is a shared service/pool reference.
 return Object.freeze({username,kind:input.kind,limit:input.limit,...(input.cursor===undefined?{}:{cursor:input.cursor}),...(input.slug===undefined?{}:{slug:input.slug})});
}
function releaseRead(read:PendingRead){
 if(read.state==='released')return;
 const wasActive=read.state!=='queued';read.state='released';
 const index=pendingReads.indexOf(read);if(index>=0)pendingReads.splice(index,1);
 if(read.operation)operations.delete(read.operation);
 if(read.timer)clearTimeout(read.timer);read.signal?.removeEventListener('abort',read.stop);
 memory-=read.charge;callers--;if(wasActive)active--;
 read.charge=0;read.input=undefined;read.executor=undefined;read.signal=undefined;read.operation=undefined;read.result=undefined;read.timer=undefined;
 drainReads();
}
function drainReads(){
 if(draining)return;draining=true;
 try{while(active<2&&pendingReads.length&&memory+RESULT_RESERVATION-PENDING_RESERVATION<=64*1024*1024){
  const read=pendingReads.shift()!;if(read.state!=='queued')continue;
  if(read.stopped||read.signal?.aborted||Date.now()>=read.expiresAt){read.stop();continue;}
  read.state='reserved';active++;memory+=RESULT_RESERVATION-read.charge;read.charge=RESULT_RESERVATION;
  const operation=Object.freeze({[operationBrand]:true as const});read.operation=operation;operations.set(operation,()=>read.state!=='released'&&!read.stopped&&Date.now()<read.expiresAt);
  void Promise.resolve().then(()=>{
   // Selection does not start native work. Cancellation at this promise
   // boundary must refund unstarted ownership before any fresh authority/PG.
   if(read.state==='released')return undefined;
   if(read.stopped||read.signal?.aborted||Date.now()>=read.expiresAt){read.stop();return undefined;}
   read.state='nativeStarted';assertGamePublicOperation(operation);
   const executor=executors.get(read.executor!);if(!executor)throw new PublicGameReadLimit();
   return executor.work(executor.dependency,read.input!,operation);
  }).then(result=>{
   if(read.state==='released')return;
   if(read.stopped||Date.now()>=read.expiresAt){read.stop();discardGamePublicResult(result);releaseRead(read);return;}
   if(!result){releaseRead(read);read.resolve(undefined);return;}
   if(Buffer.byteLength(JSON.stringify(result),'utf8')>4*1024*1024)throw new PublicGameReadLimit();
   const proof=resultProofs.get(result);if(!proof||proof.operation!==operation||resultLeases.has(result))throw new PublicGameReadLimit();
   read.state='resultHeld';read.result=result;
   resultLeases.set(result,{refs:1,expiresAt:read.expiresAt,release:()=>releaseRead(read),verify:proof.verify});read.resolve(result);
  }).catch(error=>{releaseRead(read);read.reject(error);});
 }}finally{draining=false;}
}
type ResultLease={refs:number;expiresAt:number;release:()=>void;verify:()=>Promise<boolean>};
const resultLeases=new WeakMap<object,ResultLease>();
const resultProofs=new WeakMap<object,{operation:GamePublicOperation;verify:()=>Promise<boolean>}>();
const operationBrand:unique symbol=Symbol('Games public operation');
export type GamePublicOperation=Readonly<{[operationBrand]:true}>;
const operations=new WeakMap<object,()=>boolean>();
export function assertGamePublicOperation(operation:GamePublicOperation){const current=operations.get(operation);if(!current||!current())throw new PublicGameReadLimit();}
export class PublicGameReadLimit extends Error{readonly status=503;readonly code='READ_LIMIT' as const;constructor(){super('Games public read limit');}}
function drop(lease:ResultLease){lease.refs--;if(lease.refs===0)lease.release();}
export function discardGamePublicResult(value:unknown):void{if(value&&typeof value==='object'){const lease=resultLeases.get(value);if(lease){resultLeases.delete(value);resultProofs.delete(value);drop(lease);}}}
export function gamePublicBudgetSnapshot(){return {active,callers,memory};}
export function isChargedGamePublicResult(value:unknown):boolean{return !!value&&typeof value==='object'&&resultLeases.has(value);}
/** Caller timeout/disconnect discards its result reference; actual authority
 * promise settlement alone drops the separate native reference. */
export async function gamePublicAuthority<T>(value:unknown,work:()=>Promise<T>):Promise<T>{
 const lease=value&&typeof value==='object'?resultLeases.get(value):undefined;if(!lease)throw new PublicGameReadLimit();
 lease.refs++;let timer:ReturnType<typeof setTimeout>|undefined;
 const native=Promise.resolve().then(work).finally(()=>{drop(lease);if(timer)clearTimeout(timer);});
 const deadline=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{discardGamePublicResult(value);reject(new PublicGameReadLimit());},Math.max(0,lease.expiresAt-Date.now()));timer.unref?.();});
 return Promise.race([native,deadline]);
}
export async function prepareGamePublicReply(value:unknown):Promise<string|undefined>{
 const lease=value&&typeof value==='object'?resultLeases.get(value):undefined;if(!lease)throw new PublicGameReadLimit();
 return gamePublicAuthority(value,async()=>{
  if(Date.now()>=lease.expiresAt||!await lease.verify()||!isChargedGamePublicResult(value)){discardGamePublicResult(value);return undefined;}
  const json=JSON.stringify(value);if(Buffer.byteLength(json,'utf8')>4*1024*1024)throw new PublicGameReadLimit();
  if(!await lease.verify()||Date.now()>=lease.expiresAt||!isChargedGamePublicResult(value)){discardGamePublicResult(value);return undefined;}
  return json;
 });
}
const listGate="c.archived_at IS NULL AND c.visibility='public' AND c.publication_state='published'";
const recommendationGate="r.archived_at IS NULL AND r.publication_state='published'";
export class PublicGameCursorError extends Error {constructor(){super('Invalid Games continuation');}}
const payloadSchema=z.object({v:z.literal(1),purpose:z.enum(['games-category','games-list']),category:z.literal('games'),username:z.string().max(64),accountId:z.string().uuid(),accountRevision:z.string().regex(/^\d+$/),categoryRevision:z.string().regex(/^\d+$/),listId:z.string().uuid().nullable(),listRevision:z.string().regex(/^\d+$/).nullable(),limit:z.number().int().min(1).max(24),expiresAt:z.number().int().positive().safe(),after:z.object({displayOrder:z.number().int().nonnegative().safe(),id:z.string().uuid()}).strict()}).strict();
type Cursor=z.infer<typeof payloadSchema>;
type Binding=Omit<Cursor,'after'|'expiresAt'>;
function binding(observed:any,username:string,limit:number,list?:any):Binding{return {v:1,purpose:list?'games-list':'games-category',category:'games',username:username.toLowerCase(),accountId:observed.id,accountRevision:observed.account_revision,categoryRevision:observed.content_revision,listId:list?.id??null,listRevision:list?.revision??null,limit};}
function key(secret:string){if(secret.length<32)throw new Error('Games continuation key unavailable');return createHash('sha256').update('explorers-public-games/v1\0').update(secret).digest();}
function sign(secret:string,value:Cursor){const part=Buffer.from(JSON.stringify(payloadSchema.parse(value))).toString('base64url');const token=part+'.'+createHmac('sha256',key(secret)).update(part).digest('base64url');if(Buffer.byteLength(token)>2048)throw new PublicGameCursorError();return token;}
function decode(cursor:string|undefined,secret:string,expected:Binding):Cursor|undefined{
 if(!cursor)return undefined;
 try{
  if(Buffer.byteLength(cursor)>2048||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]{43}$/.test(cursor))throw Error();
  const [part,signature]=cursor.split('.'),raw=Buffer.from(part,'base64url'),sig=Buffer.from(signature,'base64url');
  if(raw.toString('base64url')!==part||sig.toString('base64url')!==signature||sig.length!==32||!timingSafeEqual(sig,createHmac('sha256',key(secret)).update(part).digest()))throw Error();
  const value=payloadSchema.parse(JSON.parse(raw.toString('utf8')));
  if(raw.toString('utf8')!==JSON.stringify(value)||value.expiresAt<=Date.now()||value.expiresAt>Date.now()+300000)throw Error();
  const {after:_,expiresAt:__,...actual}=value;if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error();return value;
 }catch{throw new PublicGameCursorError();}
}
const membership=`FROM collection_items ci JOIN collections c ON c.id=ci.collection_id AND c.account_id=ci.account_id AND c.category=ci.category JOIN recommendations r ON r.id=ci.recommendation_id AND r.account_id=ci.account_id AND r.category=ci.category JOIN entities e ON e.id=r.entity_id JOIN creator_accounts a ON a.id=r.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=r.category LEFT JOIN recommendation_display_overrides o ON o.recommendation_id=r.id AND o.account_id=r.account_id`;
type PageBudget={output:number;representation:number};
function pageBudget():PageBudget{return {output:4*1024*1024-16384,representation:8*1024*1024-32768};}
/** Window totals are computed over the ordered, limited native page before
 * payload JSON leaves PostgreSQL. Lookahead and duplicate heroes are charged.
 * Four bytes per raw UTF8 byte conservatively cover raw+canonical UTF16;
 * bounded media/cursor/structural representation is reserved for every row. */
async function boundedRows(db:PoolClient,sql:string,args:unknown[],budget:PageBudget,overhead:number,invalid:string):Promise<any[]>{
 const n=args.length,reply=await db.query(`WITH candidate AS MATERIALIZED (${sql}), sized AS (SELECT candidate.*,sum(octet_length(to_jsonb(candidate)::text)) OVER ()::bigint AS batch_bytes,count(*) OVER ()::integer AS batch_count,bool_or(${invalid}) OVER () AS batch_invalid FROM candidate)
 SELECT batch_bytes::text,batch_count,batch_invalid,CASE WHEN NOT batch_invalid AND batch_bytes+batch_count*$${n+3} <= $${n+1} AND batch_bytes*4+batch_count*$${n+3}*2 <= $${n+2} THEN to_jsonb(sized)-'batch_bytes'-'batch_count'-'batch_invalid' END AS payload FROM sized`,[...args,budget.output,budget.representation,overhead]);
 if(!reply.rows.length)return [];
 const first=reply.rows[0],bytes=Number(first.batch_bytes),count=Number(first.batch_count);
 if(!Number.isSafeInteger(bytes)||bytes<0||!Number.isSafeInteger(count)||count!==reply.rows.length||first.batch_invalid||reply.rows.some(row=>!row.payload))throw new PublicGameReadLimit();
 const output=bytes+count*overhead,representation=bytes*4+count*overhead*2;
 if(output>budget.output||representation>budget.representation)throw new PublicGameReadLimit();
 budget.output-=output;budget.representation-=representation;return reply.rows.map(row=>row.payload);
}
async function projectRows(db:PoolClient,rows:any[]){const projected=[];
 for(const row of rows){
  if(Number(row.note_bytes)>1048576||Number(row.override_bytes)>1048576||Number(row.title_bytes)>1048576)throw new PublicGameReadLimit();
  const fields=displayOverridesReadSchema.parse(row.display_values??{});if(Object.keys(fields).some(field=>field!=='title'))throw Error('Invalid stored Games overrides');
  projected.push(publicGameRowSchema.parse({id:row.id,entityId:row.entity_id,kind:'game',collection:{id:row.collection_id,title:row.collection_title,slug:row.collection_slug},title:Object.hasOwn(fields,'title')?fields.title:catalogTitleSchema.parse(row.canonical_title),userRating:row.user_rating,note:normalizeRichNote(row.note),gamePresentation:await readManualGamePresentation(db,row.id,row.account_id),displayOrder:row.display_order,pinPosition:row.pin_order}));
 }return projected;
}
async function children(db:PoolClient,observed:any,username:string,list:any,limit:number,cursor:string|undefined,secret:string,budget:PageBudget){
 const bound=binding(observed,username,limit,list),state=decode(cursor,secret,bound);
 const rows=await boundedRows(db,`SELECT r.id,ci.collection_id,c.slug AS collection_slug,CASE WHEN octet_length(to_json(c.title)::text)<=32768 THEN c.title END AS collection_title,octet_length(to_json(c.title)::text) AS collection_title_bytes,r.account_id,r.entity_id,r.user_rating,CASE WHEN coalesce(octet_length(r.note::text),0)<=1048576 THEN r.note END AS note,coalesce(octet_length(r.note::text),0) AS note_bytes,CASE WHEN coalesce(octet_length(o.display_values::text),0)<=1048576 THEN o.display_values END AS display_values,coalesce(octet_length(o.display_values::text),0) AS override_bytes,CASE WHEN octet_length(to_json(e.title)::text)<=1048576 THEN e.title END AS canonical_title,octet_length(to_json(e.title)::text) AS title_bytes,ci.display_order,NULL::integer AS pin_order ${membership} WHERE a.id=$1 AND c.id=$2 AND c.category='games' AND ${accountGate} AND ${listGate} AND ${recommendationGate} AND ($4::integer IS NULL OR ci.display_order>$4 OR (ci.display_order=$4 AND r.id>$5::uuid)) ORDER BY ci.display_order,r.id LIMIT $3`,[observed.id,list.id,limit+1,state?.after.displayOrder??null,state?.after.id??null],budget,8192,'note_bytes>1048576 OR override_bytes>1048576 OR title_bytes>1048576 OR collection_title_bytes>32768');
 const selected=rows.slice(0,limit),last=selected.at(-1);
 return {recommendations:await projectRows(db,selected),nextCursor:rows.length>limit?sign(secret,{...bound,expiresAt:state?.expiresAt??Date.now()+300000,after:{displayOrder:last.display_order,id:last.id}}):null};
}
async function project(pool:Pool,username:string,limit:number,cursor:string|undefined,slug:string|undefined,secret:string,operation:GamePublicOperation):Promise<GamesPublicPage|undefined>{
 if(!Number.isInteger(limit)||limit<1||limit>24)throw new PublicGameCursorError();
 const budget=pageBudget(),native=await pool.connect();const db={query:(...args:any[])=>{assertGamePublicOperation(operation);return (native.query as any)(...args);}} as PoolClient;let observed,result:GamesPublicPage|undefined;
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='2000ms'");observed=await scope(db,username);
 if(observed){
 const bound=binding(observed,username,limit),state=slug?undefined:decode(cursor,secret,bound);
 const rows=await boundedRows(db,`SELECT c.id,CASE WHEN octet_length(to_json(c.title)::text)<=32768 THEN c.title END AS title,CASE WHEN coalesce(octet_length(to_json(c.description)::text),0)<=32768 THEN c.description END AS description,c.slug,CASE WHEN coalesce(octet_length(to_json(c.heading)::text),0)<=32768 THEN c.heading END AS heading,coalesce(octet_length(to_json(c.title)::text),0)+coalesce(octet_length(to_json(c.description)::text),0)+coalesce(octet_length(to_json(c.heading)::text),0) AS metadata_bytes,c.display_order,c.revision::text,cm.media_id AS cover_media_id FROM collections c JOIN creator_accounts a ON a.id=c.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category LEFT JOIN collection_media cm ON cm.collection_id=c.id AND cm.account_id=c.account_id AND cm.slot='cover' WHERE a.id=$1 AND c.category='games' AND ${accountGate} AND ${listGate} AND ($3::text IS NULL OR c.slug=$3) AND ($4::integer IS NULL OR c.display_order>$4 OR (c.display_order=$4 AND c.id>$5::uuid)) ORDER BY c.display_order,c.id LIMIT $2`,[observed.id,slug?2:limit+1,slug??null,state?.after.displayOrder??null,state?.after.id??null],budget,4096,'metadata_bytes>32768');
 if(slug&&rows.length!==1){await db.query('COMMIT');return undefined;}
 const selected=rows.slice(0,slug?1:limit),lists=[];
 for(const row of selected){const page=await children(db,observed,username,row,slug?limit:12,slug?cursor:undefined,secret,budget);lists.push({id:row.id,title:row.title,description:row.description,slug:row.slug,heading:row.heading,displayOrder:row.display_order,coverMediaId:row.cover_media_id,coverUrl:row.cover_media_id?`/api/explorers/v1/media/${row.cover_media_id}/content`:null,...page});}
 const last=selected.at(-1);
 const hero=slug?[]:await boundedRows(db,`SELECT tp.position AS pin_order,r.id,ci.collection_id,c.slug AS collection_slug,CASE WHEN octet_length(to_json(c.title)::text)<=32768 THEN c.title END AS collection_title,octet_length(to_json(c.title)::text) AS collection_title_bytes,r.account_id,r.entity_id,r.user_rating,CASE WHEN coalesce(octet_length(r.note::text),0)<=1048576 THEN r.note END AS note,coalesce(octet_length(r.note::text),0) AS note_bytes,CASE WHEN coalesce(octet_length(o.display_values::text),0)<=1048576 THEN o.display_values END AS display_values,coalesce(octet_length(o.display_values::text),0) AS override_bytes,CASE WHEN octet_length(to_json(e.title)::text)<=1048576 THEN e.title END AS canonical_title,octet_length(to_json(e.title)::text) AS title_bytes,ci.display_order ${membership} JOIN category_recommendation_pins tp ON tp.recommendation_id=r.id AND tp.account_id=r.account_id AND tp.category=r.category AND tp.collection_id=c.id WHERE a.id=$1 AND c.category='games' AND ${accountGate} AND ${listGate} AND ${recommendationGate} ORDER BY tp.position,r.id LIMIT 16`,[observed.id],budget,8192,'note_bytes>1048576 OR override_bytes>1048576 OR title_bytes>1048576 OR collection_title_bytes>32768');
 if(hero.length>15)throw new PublicGameReadLimit();
 result=gamesPublicPageSchema.parse({version:'explorers-manual-games-page/v1',gameLists:lists,topPicks:await projectRows(db,hero),nextCursor:!slug&&rows.length>limit?sign(secret,{...bound,expiresAt:state?.expiresAt??Date.now()+300000,after:{displayOrder:last.display_order,id:last.id}}):null});
 }await db.query('COMMIT');}
 catch(error){await native.query('ROLLBACK');throw error;}finally{native.release();}
 assertGamePublicOperation(operation);if(!observed||!sameScope(observed,await scope(pool,username)))return undefined;assertGamePublicOperation(operation);
 if(result)resultProofs.set(result,{operation,verify:()=>scope(pool,username).then(current=>sameScope(observed,current))});
 return result;
}
/** The deadline ends caller waiting, never native/result custody. A late result
 * is discarded only after all actual projection/authorization work settles. */
export async function runGamePublicRead(input:GamePublicReadInput,executor:GamePublicExecutor,signal?:AbortSignal):Promise<GamesPublicPage|undefined>{
 const normalized=normalizedRead(input);
 if(!executors.has(executor)||signal?.aborted||callers>=32||memory+PENDING_RESERVATION>64*1024*1024)throw new PublicGameReadLimit();
 callers++;memory+=PENDING_RESERVATION;
 return new Promise((resolve,reject)=>{
  const read:PendingRead={state:'queued',input:normalized,executor,signal,expiresAt:Date.now()+15000,stopped:false,charge:PENDING_RESERVATION,operation:undefined,result:undefined,timer:undefined,resolve,reject,stop:()=>{
   if(read.state==='released'||read.stopped)return;read.stopped=true;read.reject(new PublicGameReadLimit());
   if(read.state==='queued'||read.state==='reserved')releaseRead(read);
   else if(read.state==='resultHeld')discardGamePublicResult(read.result);
   // nativeStarted: actual work/authority settlement owns its24MiB refund.
  }};
  read.timer=setTimeout(read.stop,15000);read.timer.unref?.();read.signal?.addEventListener('abort',read.stop,{once:true});
  pendingReads.push(read);drainReads();
 });
}
const poolExecutors=new WeakMap<Pool,{secret:string;executor:GamePublicExecutor}>();
export async function publicGamesProjection(pool:Pool,username:string,limit:number,cursor?:string,slug?:string,secret='',operation?:GamePublicOperation):Promise<GamesPublicPage|undefined>{
 if(operation){assertGamePublicOperation(operation);return project(pool,username,limit,cursor,slug,secret,operation);}
 let registered=poolExecutors.get(pool);
 if(!registered){registered={secret,executor:createGamePublicExecutor({pool,secret},(dependency,input,operation)=>project(dependency.pool,input.username,input.limit,input.cursor,input.slug,dependency.secret,operation))};poolExecutors.set(pool,registered);}
 if(registered.secret!==secret)throw new PublicGameReadLimit();
 return runGamePublicRead({username,limit,kind:slug?'detail':'category',cursor,slug},registered.executor);
}
