import {placePinsBodies,placePinsClientTransportSchema,placePinsIdSchema,type PlacePinsClientTransport} from '../../../../../tunes/shared/explorersPlacePinsContract';
import {placePinsFramingBytes} from '../../../../../tunes/shared/explorersPlacePinsFraming';
import {hashPlacePinsSequence,hashPlacePinsChunk} from './placePinsBrowserHash';
export type PinsFences=ReturnType<typeof placePinsBodies.beginPlacePinsDraft.parse>;
export type PinsPlan={kind:'replace';body:ReturnType<typeof placePinsBodies.replacePlacePins.parse>}|{kind:'staged';chunks:{index:number;body:ReturnType<typeof placePinsBodies.appendPlacePinsChunk.parse>}[];commit:ReturnType<typeof placePinsBodies.commitPlacePinsDraft.parse>};
export const serializedBytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
export function requirePinsTransport(value:unknown):PlacePinsClientTransport{
 const parsed=placePinsClientTransportSchema.safeParse(value&&typeof value==='object'&&'clientTransport' in value?value.clientTransport:undefined);
 if(!parsed.success)throw new Error('CLIENT_PLANNER_UNAVAILABLE: Places pin policy is unavailable');return parsed.data;
}
const checked=(value:number)=>{if(!Number.isSafeInteger(value)||value<0)throw new RangeError('CLIENT_RESOURCE_FAILURE: Places arithmetic overflow');return value;};
const arrayBytes=(count:number)=>count===0?0:checked(checked(count*39)-1);
export async function planPlacePins(input:readonly string[],fences:PinsFences,rawPolicy:PlacePinsClientTransport,forceStaged=false):Promise<PinsPlan>{
 const policy=requirePinsTransport({clientTransport:rawPolicy}),normalized:PinsFences=placePinsBodies.beginPlacePinsDraft.parse(fences);
 const ids=Array.from(input,id=>placePinsIdSchema.parse(id));if(new Set(ids).size!==ids.length)throw new Error('Duplicate recommendation IDs');
 const replaceBytes=checked(serializedBytes({...normalized,orderedRecommendationIds:[]})+arrayBytes(ids.length));
 // Count exact fixed-width UUID array bytes before materializing any JSON body.
 if(!forceStaged&&ids.length<=policy.replacementIds&&replaceBytes<=policy.replacementBytes)return {kind:'replace',body:{...normalized,orderedRecommendationIds:ids}};
 const bound=Math.min(policy.ownerStagingBytes,policy.commitProcessingBytes);
 if(placePinsFramingBytes(ids.length)>bound||checked(ids.length*64)>policy.ownerStagingBytes||ids.length>policy.commitWorkUnits)throw new RangeError('CLIENT_RESOURCE_FAILURE: complete Places draft exceeds configured admission');
 const ranges:{start:number;end:number;index:number}[]=[];let stagingBytes=0;
 for(let start=0,index=0;start<ids.length;index++){
  const envelope=serializedBytes({recommendationIds:[],chunkHash:'0'.repeat(64)});let end=start;
  while(end<ids.length&&end-start<policy.transportChunkIds&&checked(envelope+arrayBytes(end-start+1))<=policy.transportChunkBytes&&placePinsFramingBytes(end-start+1,index)<=bound)end++;
  if(end===start)throw new RangeError('CLIENT_RESOURCE_FAILURE: configured chunk cannot hold one pin');
  stagingBytes=checked(stagingBytes+envelope+arrayBytes(end-start)+checked((end-start)*64));
  if(stagingBytes>policy.ownerStagingBytes||stagingBytes>policy.commitProcessingBytes)throw new RangeError('CLIENT_RESOURCE_FAILURE: complete Places staging exceeds configured admission');
  ranges.push({start,end,index});start=end;
 }
 const sequenceHash=await hashPlacePinsSequence(ids,bound),chunks:Extract<PinsPlan,{kind:'staged'}>['chunks']=[];
 for(const {start,end,index} of ranges){const recommendationIds=ids.slice(start,end),chunkHash=await hashPlacePinsChunk(index,recommendationIds,bound);chunks.push({index,body:{recommendationIds,chunkHash}});}
 const commit={totalCount:ids.length,sequenceHash};
 if(serializedBytes(commit)>policy.replacementBytes||serializedBytes(normalized)>policy.replacementBytes)throw new RangeError('CLIENT_RESOURCE_FAILURE: configured envelope is too small');
 return {kind:'staged',chunks,commit};
}
