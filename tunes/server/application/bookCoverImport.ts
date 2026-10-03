import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {Actor} from './actor';
import {authorizeOperation} from './authorization';
import {parseContent} from './recommendations';
import {contentIdSchema,commandKeySchema,type RequestContext} from '../../shared/explorersContract';
import {importBookCoversSchema,bookCoverImportResultSchema} from '../../shared/explorersBookCoverContract';
import {RecommendationFailure} from '../repositories/explorersRecommendationRepository';
import {BookCoverFetcher} from '../services/bookCoverFetch';
import {MediaService} from './media';
import {lockContentCategories} from '../db/explorers-content-lock';

const digest=(value:string)=>createHash('sha256').update(value).digest();
type Progress={entityId:string;coverUrl:string|null;thumbnailUrl:string|null;slots:Record<string,any>};
/** Named Books command. Canonical provider identity is the sole URL authority. */
export class BookCoverImportService {
 constructor(private readonly pool:Pool,private readonly media:MediaService,private readonly fetcher=new BookCoverFetcher()){}
 private async transaction<T>(db:PoolClient,work:()=>Promise<T>){try{await db.query('BEGIN');const value=await work();await db.query('COMMIT');return value;}catch(e){await db.query('ROLLBACK');throw e;}}
 async import(actor:Actor,id:string,raw:unknown,context:RequestContext){
  await authorizeOperation(this.pool,actor,'recommendations:write',actor.accountId);
  parseContent(contentIdSchema,id);const {expectedRevision}=parseContent(importBookCoversSchema,raw),key=parseContent(commandKeySchema,context.idempotencyKey);
  const keyHash=digest(key),requestHash=digest(JSON.stringify([id,expectedRevision])),db=await this.pool.connect(),media=this.media.usingConnection(db);let locked=false;let progress:Progress|undefined;let completed=false;
  try{
   // Session lock serializes receipts while each transaction stays short. Its
   // namespace is distinct from account/category/upload lifecycle locks.
   const gate=(await db.query('SELECT pg_try_advisory_lock(44035,hashtext($1)) locked',[`${actor.accountId}:${key}`])).rows[0];
   if(!gate.locked)throw new RecommendationFailure(409,'Cover import is already pending');locked=true;
   const prior=(await db.query("SELECT request_hash,status,response,replay_until>clock_timestamp() replayable FROM application_command_receipts WHERE account_id=$1 AND operation='importBookCovers' AND idempotency_key_hash=$2",[actor.accountId,keyHash])).rows[0];
   if(prior){if(!prior.request_hash.equals(requestHash)||!prior.replayable||prior.status==='retired')throw new RecommendationFailure(409,'Idempotency conflict');if(prior.status==='completed'){completed=true;return bookCoverImportResultSchema.parse(prior.response);}progress=prior.response;}
   if(!progress){progress=await this.transaction(db,async()=>{
    await authorizeOperation(db,actor,'recommendations:write',actor.accountId);
    const row=(await db.query(`SELECT r.entity_id,r.revision,d.cover_large_url,d.cover_url FROM recommendations r JOIN entities e ON e.id=r.entity_id AND e.kind='book' JOIN entity_identifiers i ON i.entity_id=e.id AND i.provider='google_books' AND i.external_kind='volume' JOIN book_entity_details d ON d.entity_id=e.id WHERE r.id=$1 AND r.account_id=$2 AND r.category='books' AND r.archived_at IS NULL`,[id,actor.accountId])).rows[0];
    if(!row)throw new RecommendationFailure(404,'Provider Book unavailable');if(Number(row.revision)!==expectedRevision)throw new RecommendationFailure(409,'Stale recommendation revision');
    const value={entityId:row.entity_id,coverUrl:row.cover_large_url,thumbnailUrl:row.cover_url,slots:{}};
    await db.query("INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,status,response) VALUES($1,'importBookCovers',$2,$3,'pending',$4)",[actor.accountId,keyHash,requestHash,JSON.stringify(value)]);return value;
   });}
   const urls={cover:progress.coverUrl,thumbnail:progress.thumbnailUrl};
   for(const slot of ['cover','thumbnail'] as const){
    if(progress.slots[slot])continue;const url=urls[slot],other=slot==='cover'?'thumbnail':'cover';let result:any={status:'fallback'};
    if(url&&urls[other]===url&&progress.slots[other])result=progress.slots[other];
    else if(url){try{const image=await this.fetcher.fetch(url);const asset=await media.createMedia(actor,{purpose:'recommendation',filename:'book-cover',mimeType:image.mimeType,length:image.bytes.length,bytes:image.bytes},context,async(db,asset)=>{
      const staged={...progress!,slots:{...progress!.slots,[slot]:{status:'copied',media:asset}}};
      const saved=await db.query("UPDATE application_command_receipts SET response=$3 WHERE account_id=$1 AND operation='importBookCovers' AND idempotency_key_hash=$2 AND status='pending' AND replay_until>clock_timestamp()",[actor.accountId,keyHash,JSON.stringify(staged)]);
      if(saved.rowCount!==1)throw new RecommendationFailure(409,'Cover import receipt expired');
     });result={status:'copied',media:asset};}catch{/* Optional copy failure is recorded and leaves provider fallback available. */}}
    progress.slots[slot]=result;
    const saved=await db.query("UPDATE application_command_receipts SET response=$3 WHERE account_id=$1 AND operation='importBookCovers' AND idempotency_key_hash=$2 AND status='pending' AND replay_until>clock_timestamp()",[actor.accountId,keyHash,JSON.stringify(progress)]);
    if(saved.rowCount!==1)throw new RecommendationFailure(409,'Cover import receipt expired');
   }
   const result=await this.transaction(db,async()=>{
    // Lifecycle/account -> category -> recommendation, then asset SHARE guards.
    const account=(await db.query("SELECT id FROM creator_accounts WHERE id=$1 AND status='active' FOR UPDATE",[actor.accountId])).rows[0];if(!account)throw new RecommendationFailure(404,'Account unavailable');
    await authorizeOperation(db,actor,'recommendations:write',actor.accountId);await lockContentCategories(db,actor.accountId,['books']);
    const row=(await db.query("SELECT revision,entity_id FROM recommendations WHERE id=$1 AND account_id=$2 AND category='books' AND archived_at IS NULL FOR UPDATE",[id,actor.accountId])).rows[0];
    if(!row)throw new RecommendationFailure(404,'Recommendation unavailable');if(Number(row.revision)!==expectedRevision||row.entity_id!==progress!.entityId)throw new RecommendationFailure(409,'Stale recommendation revision');
    const receipt=(await db.query("SELECT status,replay_until>clock_timestamp() replayable FROM application_command_receipts WHERE account_id=$1 AND operation='importBookCovers' AND idempotency_key_hash=$2 FOR UPDATE",[actor.accountId,keyHash])).rows[0];
    if(receipt?.status!=='pending'||!receipt.replayable)throw new RecommendationFailure(409,'Cover import receipt expired');
    for(const slot of ['cover','thumbnail']){const value=progress!.slots[slot];if(value.status==='copied')await db.query(`INSERT INTO recommendation_book_covers(recommendation_id,account_id,slot,media_id) VALUES($1,$2,$3,$4) ON CONFLICT(recommendation_id,slot) DO UPDATE SET media_id=excluded.media_id`,[id,actor.accountId,slot,value.media.id]);}
    await db.query('UPDATE recommendations SET revision=revision+1,updated_at=now() WHERE id=$1',[id]);
    const response=bookCoverImportResultSchema.parse({id,revision:expectedRevision+1,slots:progress!.slots});
    await db.query("UPDATE application_command_receipts SET status='completed',response=$3 WHERE account_id=$1 AND operation='importBookCovers' AND idempotency_key_hash=$2",[actor.accountId,keyHash,JSON.stringify(response)]);return response;
   });completed=true;return result;
  }catch(error){
   // Failed attachment keeps old covers. Retire progress before removing newly
   // uploaded bytes; media's durable pending_delete survives deletion failure.
   if(progress&&!completed){await db.query("UPDATE application_command_receipts SET status='retired',response=NULL WHERE account_id=$1 AND operation='importBookCovers' AND idempotency_key_hash=$2 AND status='pending'",[actor.accountId,keyHash]).catch(()=>{});for(const mediaId of Array.from(new Set(Object.values(progress.slots).filter((s:any)=>s.status==='copied').map((s:any)=>s.media.id))))await media.deleteMedia(actor,mediaId,context).catch(()=>{});}
   throw error;
  }finally{if(locked)await db.query('SELECT pg_advisory_unlock(44035,hashtext($1))',[`${actor.accountId}:${key}`]).catch(()=>{});db.release();}
 }
}
