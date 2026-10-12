import {placePinsFramingBytes,placePinsSequenceFragments,placePinsChunkFragments} from '../../../../../tunes/shared/explorersPlacePinsFraming';
import {placePinsIdSchema} from '../../../../../tunes/shared/explorersPlacePinsContract';
async function hash(ids:readonly string[],bound:number,index?:number):Promise<string>{
 const bytes=placePinsFramingBytes(ids.length,index);
 if(!Number.isSafeInteger(bound)||bound<1||bytes>bound)throw new RangeError('CLIENT_RESOURCE_FAILURE: Places hash buffer exceeds configured admission');
 const normalized=Array.from(ids,id=>placePinsIdSchema.parse(id));
 let buffer:Uint8Array;try{buffer=new Uint8Array(bytes);}catch{throw new RangeError('CLIENT_RESOURCE_FAILURE: browser cannot allocate the bounded Places hash buffer');}let offset=0;
 for(const fragment of index===undefined?placePinsSequenceFragments(normalized):placePinsChunkFragments(index,normalized)){buffer.set(fragment,offset);offset+=fragment.byteLength;}
 if(offset!==bytes)throw new RangeError('Places framing size changed');
 let result:ArrayBuffer;try{result=await crypto.subtle.digest('SHA-256',buffer);}catch{throw new RangeError('CLIENT_RESOURCE_FAILURE: browser cannot digest the bounded Places hash buffer');}
 return Array.from(new Uint8Array(result),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export const hashPlacePinsSequence=(ids:readonly string[],bound:number)=>hash(ids,bound);
export const hashPlacePinsChunk=(index:number,ids:readonly string[],bound:number)=>hash(ids,bound,index);
