import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod/v3';
import type {Actor} from './actor';
import {authorizeOperation} from './authorization';
import {parseContent} from './recommendations';
import {commandKeySchema,contentIdSchema,type RequestContext} from '../../shared/explorersContract';
import {importMovieMediaRequestSchema,movieMediaSourceSchema,movieMediaSlotSchema,movieMediaSlotIndex,movieOwnedImageSchema,movieMediaImportResultSchema,type MovieMediaSource,type MovieMediaImportResult} from '../../shared/explorersMovieMediaContract';
import {RecommendationFailure} from '../repositories/explorersRecommendationRepository';
import {readMovieEntity} from '../repositories/movieCatalogRepository';
import {readMovieProviderMedia} from '../repositories/movieMedia';
import {MovieImageFetcher,MovieImageFailure,extractMovieImageSlots,canonicalMovieImageUrl} from '../services/movieImageFetch';
import {MediaService,MediaUnavailable} from './media';
import {lockContentCategories} from '../db/explorers-content-lock';
const IMAGE=5*1024*1024,LINEAGE=60*1024*1024,METADATA=256*1024;
const hash=(v:string)=>createHash('sha256').update(v).digest();
const n=z.number().int().nonnegative().safe();
const progressSchema=z.object({source:movieMediaSourceSchema,expectedRevision:z.number().int().positive().safe(),slots:z.array(z.object({slot:movieMediaSlotSchema,url:z.string().max(2048).nullable(),status:z.enum(['pending','copied','unavailable','absent']),media:movieOwnedImageSchema.optional(),reused:z.boolean()}).strict()).max(12),counters:z.object({received:n,reserved:n,download:n,put:n,dns:n,connect:n,body:n}).strict()}).strict().refine(p=>p.counters.received+p.counters.reserved<=LINEAGE&&p.counters.download+p.counters.put<=24&&p.counters.dns<=p.counters.download&&p.counters.connect<=p.counters.download&&p.counters.body<=p.counters.download&&p.slots.every((s,i)=>(s.status==='copied')===(s.media!==undefined)&&(i===0||movieMediaSlotIndex(p.slots[i-1].slot)<movieMediaSlotIndex(s.slot))));
type Progress=z.infer<typeof progressSchema>;
type AccountLease={running:boolean;admissions:number[];updated:number};
const leases=new Map<string,AccountLease>();let active=0;
function acquire(account:string,newCommand:boolean):()=>void {
 const now=Date.now();for(const [key,value] of Array.from(leases))if(!value.running&&now-value.updated>60000)leases.delete(key);
 let lease=leases.get(account);if(!lease){if(leases.size>=10000)throw new RecommendationFailure(409,'Movie import capacity unavailable');lease={running:false,admissions:[],updated:now};leases.set(account,lease);}
 lease.admissions=lease.admissions.filter(t=>now-t<60000);if(lease.running||active>=4||newCommand&&lease.admissions.length>=30)throw new RecommendationFailure(409,'Movie import admission unavailable');
 if(newCommand)lease.admissions.push(now);lease.updated=now;lease.running=true;active++;let released=false;
 return ()=>{if(released)return;released=true;lease!.running=false;lease!.updated=Date.now();active--;};
}
function encode(value:unknown):string {const s=JSON.stringify(value);if(Buffer.byteLength(s,'utf8')>METADATA)throw new RecommendationFailure(413,'Movie import progress too large');return s;}
const sameSource=(a:MovieMediaSource,b:MovieMediaSource)=>JSON.stringify(a)===JSON.stringify(b);
/** One source-bound finite receipt lineage; no remote I/O inside a transaction. */
export class MovieMediaImportService {
 constructor(private readonly pool:Pool,private readonly media:MediaService,private readonly fetcher=new MovieImageFetcher()){}
 async cleanupDetached(actor:Actor):Promise<void>{await authorizeOperation(this.pool,actor,'recommendations:write',actor.accountId);await this.media.retryPendingDeletes(actor.accountId);}
 private async transaction<T>(db:PoolClient,work:()=>Promise<T>):Promise<T>{try{await db.query('BEGIN');const result=await work();await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}}
 private async source(db:Pick<Pool,'query'>,actor:Actor,id:string,revision?:number):Promise<MovieMediaSource>{
  await authorizeOperation(db,actor,'recommendations:write',actor.accountId);
  const rec=(await db.query("SELECT entity_id,revision FROM recommendations WHERE id=$1 AND account_id=$2 AND category='movies' AND archived_at IS NULL",[id,actor.accountId])).rows[0];
  if(!rec)throw new RecommendationFailure(404,'Provider Movie unavailable');if(revision!==undefined&&Number(rec.revision)!==revision)throw new RecommendationFailure(409,'Stale recommendation revision');
  const entity=await readMovieEntity(db,rec.entity_id);if(!entity.provenance)throw new RecommendationFailure(404,'Provider Movie unavailable');
  return movieMediaSourceSchema.parse({entityId:entity.id,provider:entity.provenance.provider,externalKind:entity.provenance.externalKind,externalId:entity.provenance.externalId,fetchedAt:entity.provenance.fetchedAt,mappingVersion:entity.provenance.mappingVersion});
 }
 async import(actor:Actor,id:string,raw:unknown,context:RequestContext):Promise<MovieMediaImportResult>{
  await authorizeOperation(this.pool,actor,'recommendations:write',actor?.accountId);parseContent(contentIdSchema,id);
  const {expectedRevision}=parseContent(importMovieMediaRequestSchema,raw),key=parseContent(commandKeySchema,context.idempotencyKey),keyHash=hash(key),requestHash=hash(JSON.stringify([id,expectedRevision]));
  const prior=(await this.pool.query("SELECT request_hash,status,CASE WHEN octet_length(response::text)<=262144 THEN response ELSE NULL END response,replay_until>clock_timestamp() replayable FROM application_command_receipts WHERE account_id=$1 AND operation='importMovieMedia' AND idempotency_key_hash=$2",[actor.accountId,keyHash])).rows[0];
  if(prior){if(!prior.request_hash.equals(requestHash)||prior.status==='retired'||!prior.response||prior.status==='completed'&&!prior.replayable)throw new RecommendationFailure(409,'Idempotency conflict');if(prior.status==='completed'){const result=movieMediaImportResultSchema.parse(prior.response);if(result.id!==id||!sameSource(result.source,await this.source(this.pool,actor,id)))throw new RecommendationFailure(409,'Movie media source changed');return result;}}
  const release=acquire(actor.accountId,!prior),controller=new AbortController();let abortFetch:(()=>void)|undefined;let timer:ReturnType<typeof setTimeout>;
  const work=this.run(actor,id,expectedRevision,keyHash,requestHash,prior?.response,controller.signal,context,abort=>{abortFetch=abort;}).finally(release);
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();abortFetch?.();reject(new RecommendationFailure(409,'Movie import caller deadline exceeded'));},60000);});
  try{return await Promise.race([work,deadline]);}finally{clearTimeout(timer!);}
 }
 private async retireOwnedProgress(db:PoolClient,actor:Actor,keyHash:Buffer,requestHash:Buffer,progress:Progress,newlyOwned:Set<string>):Promise<void>{
  // Receipt custody is independent of the now-stale product source. Failed
  // validation preserves progress; retirement and durable intent commit together.
  await this.transaction(db,async()=>{
   const receipt=(await db.query("SELECT request_hash,status FROM application_command_receipts WHERE account_id=$1 AND operation='importMovieMedia' AND idempotency_key_hash=$2 FOR UPDATE",[actor.accountId,keyHash])).rows[0];
   if(receipt?.status!=='pending'||!receipt.request_hash.equals(requestHash))throw new RecommendationFailure(409,'Movie import receipt unavailable');
   const owned=new Map<string,z.infer<typeof movieOwnedImageSchema>|undefined>();
   for(const slot of progress.slots)if(slot.status==='copied'&&!slot.reused)owned.set(slot.media!.id,slot.media);
   for(const id of Array.from(newlyOwned))if(!owned.has(id))owned.set(id,undefined);
   for(const [id,record] of Array.from(owned)){
    const asset=(await db.query("SELECT mime_type,byte_size,status FROM media_assets WHERE id=$1 AND account_id=$2 AND purpose='recommendation' FOR UPDATE",[id,actor.accountId])).rows[0];
    if(!asset||record&&(asset.mime_type!==record.mimeType||Number(asset.byte_size)!==record.size))throw new RecommendationFailure(409,'Movie import receipt media unavailable');
    const refs=(await db.query(`SELECT ((SELECT count(*) FROM profile_media WHERE media_id=$1)+(SELECT count(*) FROM profile_feed_items WHERE media_id=$1)+(SELECT count(*) FROM collection_media WHERE media_id=$1)+(SELECT count(*) FROM recommendation_media WHERE media_id=$1)+(SELECT count(*) FROM recommendation_book_covers WHERE media_id=$1)+(SELECT count(*) FROM recommendation_movie_media WHERE media_id=$1))::text count`,[id])).rows[0];
    if(asset.status==='ready'&&Number(refs.count)===0)await db.query("UPDATE media_assets SET status='pending_delete',delete_requested_at=now(),updated_at=now() WHERE id=$1 AND account_id=$2",[id,actor.accountId]);
   }
   await db.query("UPDATE application_command_receipts SET status='retired',response=NULL WHERE account_id=$1 AND operation='importMovieMedia' AND idempotency_key_hash=$2 AND status='pending'",[actor.accountId,keyHash]);
  });
  await this.media.retryPendingDeletes(actor.accountId);
 }
 private async run(actor:Actor,id:string,expectedRevision:number,keyHash:Buffer,requestHash:Buffer,prior:unknown,signal:AbortSignal,context:RequestContext,setAbort:(abort:(()=>void)|undefined)=>void):Promise<MovieMediaImportResult>{
  const db=await this.pool.connect();let locked=false,progress!:Progress,completed=false;const newlyOwned=new Set<string>();
  const assertCurrent=async()=>{if(signal.aborted)throw new RecommendationFailure(409,'Movie import caller deadline exceeded');const current=await this.source(db,actor,id,expectedRevision);if(progress&&!sameSource(current,progress.source))throw new RecommendationFailure(409,'Movie media source changed');};
  const save=async(connection:Pick<Pool,'query'>,next:Progress)=>{const value=progressSchema.parse(next),json=encode(value);const result=await connection.query("UPDATE application_command_receipts SET response=$3 WHERE account_id=$1 AND operation='importMovieMedia' AND idempotency_key_hash=$2 AND status='pending' AND replay_until>clock_timestamp()",[actor.accountId,keyHash,json]);if(result.rowCount!==1)throw new RecommendationFailure(409,'Movie import receipt expired');};
  try {
   const gate=(await db.query('SELECT pg_try_advisory_lock(44038,hashtext($1)) locked',[actor.accountId])).rows[0];if(!gate.locked)throw new RecommendationFailure(409,'Movie import already pending');locked=true;
   if(prior){
    progress=progressSchema.parse(prior);
    const liveReceipt=(await db.query("SELECT replay_until>clock_timestamp() replayable FROM application_command_receipts WHERE account_id=$1 AND operation='importMovieMedia' AND idempotency_key_hash=$2",[actor.accountId,keyHash])).rows[0];if(!liveReceipt?.replayable)throw new RecommendationFailure(409,'Movie import receipt expired');
    const current=await this.source(db,actor,id,expectedRevision),entity=await readMovieEntity(db,current.entityId),canonical=extractMovieImageSlots(entity.details);
    if(progress.expectedRevision!==expectedRevision||!sameSource(current,progress.source)||canonical.length!==progress.slots.length||canonical.some((entry,index)=>JSON.stringify(entry.slot)!==JSON.stringify(progress.slots[index].slot)||entry.url!==progress.slots[index].url))throw new RecommendationFailure(409,'Movie import receipt source mismatch');
    const existing=await readMovieProviderMedia(db,id,actor.accountId),references=new Map<number,string>();
    if(existing){if(existing.poster)references.set(0,existing.poster.id);if(existing.backdrop)references.set(1,existing.backdrop.id);for(const cast of existing.cast)if(cast.media)references.set(cast.slot.ordinal+2,cast.media.id);}
    for(const slot of progress.slots)if(slot.status==='copied'){
     const asset=(await db.query("SELECT mime_type,byte_size FROM media_assets WHERE id=$1 AND account_id=$2 AND purpose='recommendation' AND status='ready'",[slot.media!.id,actor.accountId])).rows[0];
     if(!asset||asset.mime_type!==slot.media!.mimeType||Number(asset.byte_size)!==slot.media!.size||slot.reused&&references.get(movieMediaSlotIndex(slot.slot))!==slot.media!.id)throw new RecommendationFailure(409,'Movie import receipt media unavailable');
     if(!slot.reused)newlyOwned.add(slot.media!.id);
    }
   }
   else progress=await this.transaction(db,async()=>{
    const source=await this.source(db,actor,id,expectedRevision),entity=await readMovieEntity(db,source.entityId),existing=await readMovieProviderMedia(db,id,actor.accountId);
    const reused=new Map<number,z.infer<typeof movieOwnedImageSchema>>();if(existing){if(existing.poster)reused.set(0,existing.poster);if(existing.backdrop)reused.set(1,existing.backdrop);for(const c of existing.cast)if(c.media)reused.set(c.slot.ordinal+2,c.media);}
    const initial:Progress={source,expectedRevision,slots:extractMovieImageSlots(entity.details).map(({slot,url})=>{const media=reused.get(movieMediaSlotIndex(slot));return {slot,url,status:media?'copied':url?'pending':'absent',...(media?{media}:{}),reused:!!media};}),counters:{received:0,reserved:0,download:0,put:0,dns:0,connect:0,body:0}};
    await db.query("INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,status,response) VALUES($1,'importMovieMedia',$2,$3,'pending',$4)",[actor.accountId,keyHash,requestHash,encode(progressSchema.parse(initial))]);return initial;
   });
   await assertCurrent();
   for(let index=0;index<progress.slots.length;index++){
    const slot=progress.slots[index];if(slot.status!=='pending')continue;await assertCurrent();
    const alias=progress.slots.find(s=>s.url===slot.url&&s.status==='copied');
    if(alias?.media){const next={...progress,slots:progress.slots.map((s,i)=>i===index?{...s,status:'copied' as const,media:alias.media,reused:alias.reused}:s)};await save(db,next);progress=next;continue;}
    let copied:z.infer<typeof movieOwnedImageSchema>|undefined;
    try {
     canonicalMovieImageUrl(slot.url!,slot.slot.kind);
     if(progress.counters.download+progress.counters.put>=24||progress.counters.received+progress.counters.reserved+IMAGE>LINEAGE)throw new RecommendationFailure(413,'Movie import lineage exhausted');
     let next:Progress={...progress,counters:{...progress.counters,download:progress.counters.download+1,reserved:progress.counters.reserved+IMAGE}};await save(db,next);progress=next;
     const fetched=this.fetcher.fetchOwned(slot.url!,slot.slot.kind,async phase=>{await assertCurrent();const next={...progress!,counters:{...progress!.counters,[phase]:progress!.counters[phase]+1}};await save(db,next);progress=next;});setAbort(fetched.abort);
     let image:{bytes:Buffer;mimeType:string};try{image=await fetched.completion;}finally{await fetched.settlement;setAbort(undefined);}
     await assertCurrent();next={...progress,counters:{...progress.counters,reserved:progress.counters.reserved-IMAGE,received:progress.counters.received+image.bytes.length}};await save(db,next);progress=next;
     if(progress.counters.download+progress.counters.put>=24)throw new RecommendationFailure(413,'Movie import lineage exhausted');
     next={...progress,counters:{...progress.counters,put:progress.counters.put+1}};await save(db,next);progress=next;
     let staged:Progress|undefined;
     const put=this.media.createMediaOwned(actor,{purpose:'recommendation',filename:'movie-provider-image',mimeType:image.mimeType,length:image.bytes.length,bytes:image.bytes},context,async(connection,media)=>{
      await assertCurrent();staged={...progress!,slots:progress!.slots.map((s,i)=>i===index?{...s,status:'copied' as const,media:movieOwnedImageSchema.parse(media),reused:false}:s)};await save(connection,staged);
     });
     try{copied=movieOwnedImageSchema.parse(await put.completion);}finally{await put.settlement;}
     newlyOwned.add(copied.id);if(staged)progress=staged;
    }catch(error){if(!(error instanceof MovieImageFailure||error instanceof MediaUnavailable||error instanceof RecommendationFailure&&error.status===413))throw error;}
    if(!copied){const next={...progress,slots:progress.slots.map((s,i)=>i===index?{...s,status:'unavailable' as const}:s)};await save(db,next);progress=next;}
   }
   const response=await this.transaction(db,async()=>{
    const account=(await db.query("SELECT id FROM creator_accounts WHERE id=$1 AND status='active' FOR UPDATE",[actor.accountId])).rows[0];if(!account)throw new RecommendationFailure(404,'Account unavailable');
    await authorizeOperation(db,actor,'recommendations:write',actor.accountId);await lockContentCategories(db,actor.accountId,['movies']);
    await db.query('SELECT id FROM recommendations WHERE id=$1 AND account_id=$2 FOR UPDATE',[id,actor.accountId]);await assertCurrent();
    const receipt=(await db.query("SELECT status,replay_until>clock_timestamp() replayable FROM application_command_receipts WHERE account_id=$1 AND operation='importMovieMedia' AND idempotency_key_hash=$2 FOR UPDATE",[actor.accountId,keyHash])).rows[0];if(receipt?.status!=='pending'||!receipt.replayable)throw new RecommendationFailure(409,'Movie import receipt expired');
    for(const s of progress!.slots)if(s.status==='copied'){
     const source=progress!.source,cast=s.slot.kind==='cast'?s.slot:undefined;
     await db.query("INSERT INTO recommendation_movie_media(recommendation_id,account_id,source_entity_id,source_external_kind,source_external_id,source_fetched_at,source_mapping_version,slot,slot_index,cast_ordinal,person_id,credit_id,media_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(recommendation_id,slot_index) DO UPDATE SET media_id=excluded.media_id",[id,actor.accountId,source.entityId,source.externalKind,source.externalId,source.fetchedAt,source.mappingVersion,s.slot.kind,movieMediaSlotIndex(s.slot),cast?.ordinal??null,cast?.personId??null,cast?.creditId??null,s.media!.id]);
    }
    await db.query('UPDATE recommendations SET revision=revision+1,updated_at=now() WHERE id=$1',[id]);
    const result=movieMediaImportResultSchema.parse({id,revision:expectedRevision+1,source:progress!.source,slots:progress!.slots.map(s=>({slot:s.slot,status:s.status,...(s.media?{media:s.media}:{})}))});
    await db.query("UPDATE application_command_receipts SET status='completed',response=$3 WHERE account_id=$1 AND operation='importMovieMedia' AND idempotency_key_hash=$2",[actor.accountId,keyHash,encode(result)]);return result;
   });completed=true;
   if(!sameSource(response.source,await this.source(db,actor,id)))throw new RecommendationFailure(409,'Movie media source changed');
   return response;
  }catch(error){
   // Lost final COMMIT acknowledgement must not compensate committed/uncertain assets.
   let receipt;try{receipt=(await db.query("SELECT status,request_hash,CASE WHEN octet_length(response::text)<=262144 THEN response ELSE NULL END response,replay_until>clock_timestamp() replayable FROM application_command_receipts WHERE account_id=$1 AND operation='importMovieMedia' AND idempotency_key_hash=$2",[actor.accountId,keyHash])).rows[0];}catch{throw error;}
   if(receipt?.status==='completed'){
    completed=true;
    if(!receipt.request_hash.equals(requestHash)||!receipt.replayable||!receipt.response)throw new RecommendationFailure(409,'Movie import receipt unavailable');
    const result=movieMediaImportResultSchema.parse(receipt.response);
    if(result.id!==id||!sameSource(result.source,await this.source(db,actor,id)))throw new RecommendationFailure(409,'Movie media source changed');
    return result;
   }
   if(progress&&!completed)await this.retireOwnedProgress(db,actor,keyHash,requestHash,progress,newlyOwned).catch(()=>undefined);
   throw error;
  }finally{if(locked)await db.query('SELECT pg_advisory_unlock(44038,hashtext($1))',[actor.accountId]).catch(()=>undefined);db.release();}
 }
}
