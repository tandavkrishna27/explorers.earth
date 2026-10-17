import {placePinsHashDomain,placePinsIdSchema} from './explorersPlacePinsContract';
const utf8=new TextEncoder();
function checkedCount(value:number):number {if(!Number.isSafeInteger(value)||value<0)throw new RangeError('Invalid Places framing count');return value;}
export function placePinsFrameStart(index?:number):Uint8Array {
 if(index!==undefined)checkedCount(index);
 return utf8.encode(placePinsHashDomain+(index===undefined?'sequence\n':`chunk\n${index}\n`));
}
export function placePinsFrameId(id:string):Uint8Array {return utf8.encode(placePinsIdSchema.parse(id)+'\n');}
export function placePinsFrameEnd(count:number):Uint8Array {return utf8.encode(`count:${checkedCount(count)}\n`);}
/** Exact byte admission arithmetic; these bytes are hash framing, not an HTTP body. */
export function placePinsFramingBytes(count:number,index?:number):number {
 checkedCount(count);const bytes=placePinsFrameStart(index).byteLength+count*37+placePinsFrameEnd(count).byteLength;
 if(!Number.isSafeInteger(bytes))throw new RangeError('Places framing byte overflow');return bytes;
}
function* fragments(ids:Iterable<string>,index?:number):Generator<Uint8Array>{
 yield placePinsFrameStart(index);let count=0;
 for(const id of ids){if(count===Number.MAX_SAFE_INTEGER)throw new RangeError('Places framing count overflow');yield placePinsFrameId(id);count++;}
 yield placePinsFrameEnd(count);
}
export function placePinsSequenceFragments(ids:Iterable<string>):Generator<Uint8Array>{return fragments(ids);}
export function placePinsChunkFragments(index:number,ids:Iterable<string>):Generator<Uint8Array>{return fragments(ids,index);}
