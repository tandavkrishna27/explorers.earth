import type {PoolClient} from 'pg';
import type {PlacePinsPolicy} from '../application/placePinsPolicy';
import {PlacePinsFailure,createPlacePinsSequenceHasher} from '../application/placePinsBoundary';
export type PinDb=Pick<PoolClient,'query'>;
export function pinFailure(status:404|409|413|422,message:string):never {
 throw new PlacePinsFailure(status,status===404?'NOT_FOUND':status===409?'CONFLICT':status===413?'RESOURCE_TOO_LARGE':'INVALID_INPUT',message);
}
export function safeCounter(value:unknown):number {
 const n=Number(value);if(!Number.isSafeInteger(n)||n<0)pinFailure(413,'Places pin counter exceeds safe range');return n;
}
/** Every staged item is charged its fixed UUID/ordinal storage accounting (64 bytes),
 * in addition to the actual admitted request bytes. No estimate substitutes for body bytes. */
export function admittedStagingBytes(bodyBytes:number,itemCount:number):number {return safeCounter(bodyBytes+itemCount*64);}
export class PinWorkBudget {
 private bytes=0;private units=0;
 private deadline:number;
 constructor(private policy:PlacePinsPolicy,private readonly started=performance.now()){this.deadline=started+policy.commitProcessingMs;}
 configure(policy:PlacePinsPolicy){this.policy=policy;this.deadline=Math.min(this.deadline,this.started+policy.commitProcessingMs);this.charge(0,0);}
 get deadlineMs(){return this.deadline;}
 remainingMs(){const remaining=Math.floor(this.deadline-performance.now());if(remaining<1)pinFailure(413,'Places pin processing deadline exhausted');return remaining;}
 get pageSize(){return Math.max(1,Math.min(128,Math.floor(this.policy.commitProcessingBytes/64)));}
 charge(bytes:number,units:number){this.bytes=safeCounter(this.bytes+bytes);this.units=safeCounter(this.units+units);
  if(this.bytes>this.policy.commitProcessingBytes||this.units>this.policy.commitWorkUnits)pinFailure(413,'Places pin processing budget exhausted');this.remainingMs();}
}
/** One unit per SQL statement is charged by the controlled transaction. Sequence
 * passes additionally charge 64 bytes and one unit per row they inspect or mutate. */
export async function admitLivePinPass(db:PinDb,collectionId:string,budget:PinWorkBudget){
 const count=safeCounter((await db.query('SELECT count(*)::text AS count FROM collection_place_pins WHERE collection_id=$1',[collectionId])).rows[0].count);
 budget.charge(safeCounter(count*64),count);return count;
}
/** Fixed bounded keyset pages. Only one page is retained, including for whole-sequence hashing. */
export async function* streamDraftIds(db:PinDb,draftId:string,budget:PinWorkBudget):AsyncGenerator<{id:string;ordinal:number}> {
 let chunk=-1,item=-1,ordinal=0;
 for(;;){budget.charge(0,1);const result=await db.query(`SELECT chunk_index,item_index,recommendation_id FROM place_pin_draft_items
   WHERE draft_id=$1 AND (chunk_index,item_index)>($2::bigint,$3::bigint) ORDER BY chunk_index,item_index LIMIT $4`,[draftId,chunk,item,budget.pageSize]);
  if(!result.rows.length)return;
  for(const row of result.rows){budget.charge(64,1);chunk=safeCounter(row.chunk_index);item=safeCounter(row.item_index);yield {id:row.recommendation_id,ordinal:ordinal++};}
 }
}
export async function hashDraftSequence(db:PinDb,draftId:string,budget:PinWorkBudget){
 const hasher=createPlacePinsSequenceHasher();let count=0;
 for await(const row of streamDraftIds(db,draftId,budget)){hasher.append([row.id]);count=safeCounter(count+1);}
 return {count,hash:hasher.finish()};
}
export async function categoryRevision(db:PinDb,accountId:string){return String((await db.query("SELECT coalesce((SELECT revision::text FROM account_category_content_state WHERE account_id=$1 AND category='places'),'0') revision",[accountId])).rows[0].revision);}
export async function ownedPlaceCollection(db:PinDb,accountId:string,id:string){
 const row=(await db.query('SELECT id,category,revision,archived_at FROM collections WHERE id=$1 AND account_id=$2 FOR UPDATE',[id,accountId])).rows[0];
 if(!row||row.archived_at)pinFailure(404,'Collection unavailable');if(row.category!=='places')pinFailure(422,'Places collection required');safeCounter(row.revision);return row;
}
export async function checkPinFences(db:PinDb,accountId:string,row:{revision:unknown},expectedCollection:unknown,expectedCategory:unknown){
 if(String(row.revision)!==String(expectedCollection)||await categoryRevision(db,accountId)!==String(expectedCategory))pinFailure(409,'Stale Places pin revision');
}
export async function pinResult(db:PinDb,accountId:string,collectionId:string,changed:boolean){
 const row=(await db.query('SELECT revision FROM collections WHERE id=$1 AND account_id=$2',[collectionId,accountId])).rows[0];
 const count=(await db.query('SELECT count(*)::text AS count FROM collection_place_pins WHERE collection_id=$1',[collectionId])).rows[0].count;
 return {collectionId,collectionRevision:safeCounter(row.revision),categoryContentRevision:await categoryRevision(db,accountId),pinCount:safeCounter(count),changed};
}
