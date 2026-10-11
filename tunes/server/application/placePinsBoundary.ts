import {createHash} from 'node:crypto';
import {placePinsRequestSchema,placePinsIdSchema,placePinsHashDomain,type PlacePinsRequest} from '../../shared/explorersPlacePinsContract';
import {commandKeySchema,type RequestContext} from '../../shared/explorersContract';
import type {Actor} from './actor';
import {resolvePlacePinsPolicy,PLACE_PINS_PARSER_BYTES,type PlacePinsPolicy} from './placePinsPolicy';
export interface PlacePinsStorage {execute(accountId:string,request:PlacePinsRequest,context:RequestContext,bodyBytes:number,policy:PlacePinsPolicy):Promise<unknown>;}
export class PlacePinsFailure extends Error {constructor(readonly status:number,readonly code:string,message:string){super(message);}}
function invalid():never {throw new PlacePinsFailure(422,'INVALID_INPUT','Invalid Places pin fields');}
function canonical(value:unknown):string {
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 if(value!==null&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;
 return JSON.stringify(value);
}
/** Receipt payload includes operation and addressed IDs, excludes transport context.
 * P1 receipt namespace is account+operation+keyHash. Replay/retired receipts must
 * be checked before resource mutation; changed payload conflicts, never reexecutes.
 */
export function hashPlacePinsRequest(input:unknown):string {
 const parsed=placePinsRequestSchema.safeParse(input);if(!parsed.success)return invalid();
 return createHash('sha256').update(placePinsHashDomain+'receipt\n'+canonical(parsed.data),'utf8').digest('hex');
}
export function createPlacePinsSequenceHasher(){
 const hash=createHash('sha256').update(placePinsHashDomain+'sequence\n','utf8');let count=0,finished=false;
 return {append(ids:readonly string[]){if(finished)throw new Error('Sequence hash is finalized');
  for(const id of ids){if(count===Number.MAX_SAFE_INTEGER)throw new PlacePinsFailure(413,'RESOURCE_TOO_LARGE','Sequence count overflow');hash.update(placePinsIdSchema.parse(id)+'\n','utf8');count++;}},
  finish(){if(finished)throw new Error('Sequence hash is finalized');finished=true;return hash.update(`count:${count}\n`,'utf8').digest('hex');}};
}
export function hashPlacePinsChunk(index:number,ids:readonly string[]):string {
 if(!Number.isSafeInteger(index)||index<0)return invalid();
 const hash=createHash('sha256').update(placePinsHashDomain+`chunk\n${index}\n`,'utf8');
 for(const id of ids)hash.update(placePinsIdSchema.parse(id)+'\n','utf8');
 return hash.update(`count:${ids.length}\n`,'utf8').digest('hex');
}
export type PlacePinsAuthorizer=(actor:Actor,scope:'collections:read'|'collections:write'|'recommendations:write')=>Promise<void>;
/** Policy and an explicitly injected storage capability are both required.
 * The storage transaction retains original fences and durable receipt denial. */
export class PlacePinsBoundary {
 private readonly policy;
 constructor(private readonly authorize:PlacePinsAuthorizer,policyInput?:unknown,private readonly storage?:PlacePinsStorage){this.policy=resolvePlacePinsPolicy(policyInput);}
 async execute(actor:Actor,input:unknown,context:RequestContext,bodyBytes:number):Promise<unknown>{
  const read=!!input&&typeof input==='object'&&(input as {operation?:unknown}).operation==='placePinsAvailability';
  await this.authorize(actor,read?'collections:read':'collections:write');
  if(!read)await this.authorize(actor,'recommendations:write');
  const parsed=placePinsRequestSchema.safeParse(input);if(!parsed.success)return invalid();
  if(!Number.isSafeInteger(bodyBytes)||bodyBytes<0)return invalid();
  if(bodyBytes>PLACE_PINS_PARSER_BYTES)throw new PlacePinsFailure(413,'RESOURCE_TOO_LARGE','Places pin request exceeds byte bound');
  const request=parsed.data;
  if(request.operation==='placePinsAvailability')return this.policy.state==='configured'&&this.storage?this.storage.execute(actor.accountId,request,context,bodyBytes,this.policy.policy):{available:false,state:this.policy.state,reason:'STORAGE_UNAVAILABLE'};
  if(!commandKeySchema.safeParse(context.idempotencyKey).success)return invalid();
  if(this.policy.state==='configured'){
   const p=this.policy.policy;const chunk=request.operation==='appendPlacePinsChunk';
   if(bodyBytes>(chunk?p.transportChunkBytes:p.replacementBytes))throw new PlacePinsFailure(413,'RESOURCE_TOO_LARGE','Places pin request exceeds configured byte bound');
   const ids=request.operation==='replacePlacePins'?request.body.orderedRecommendationIds:chunk?request.body.recommendationIds:undefined;
   if(ids&&ids.length>(chunk?p.transportChunkIds:p.replacementIds))throw new PlacePinsFailure(413,'RESOURCE_TOO_LARGE','Places pin request exceeds configured item bound');
  }
  if(request.operation==='appendPlacePinsChunk'&&hashPlacePinsChunk(request.chunkIndex,request.body.recommendationIds)!==request.body.chunkHash)return invalid();
  if(this.policy.state==='configured'&&this.storage)return this.storage.execute(actor.accountId,request,context,bodyBytes,this.policy.policy);
  throw new PlacePinsFailure(503,'UNAVAILABLE','Places pin storage is unavailable');
 }
}
