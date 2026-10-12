import {placePinsAvailabilitySchema,placePinsDraftSchema,placePinsChunkSchema,placePinsResultSchema,placePinsDraftAbortSchema,placePinsIdSchema,type PlacePinsRequest} from '../../../../../tunes/shared/explorersPlacePinsContract';
import {planPlacePins,requirePinsTransport,type PinsFences,type PinsPlan} from './placePinsPlanner';
export type PlacePinsTransport={assertCurrent:()=>void;execute:(request:PlacePinsRequest,key?:string,signal?:AbortSignal)=>Promise<unknown>};
export function createPlacePinsIntent(collectionId:string,input:readonly string[],fences:PinsFences,transport:PlacePinsTransport){
 collectionId=placePinsIdSchema.parse(collectionId);
 const orderedIds=Object.freeze(Array.from(input,id=>placePinsIdSchema.parse(id))),original=Object.freeze({...fences});
 if(new Set(orderedIds).size!==orderedIds.length)throw new Error('Duplicate recommendation IDs');
 const keys={replace:crypto.randomUUID(),begin:crypto.randomUUID(),commit:crypto.randomUUID(),abort:crypto.randomUUID()},chunkKeys:string[]=[];
 let plan:PinsPlan|undefined,draft:ReturnType<typeof placePinsDraftSchema.parse>|undefined,nextChunk=0,busy=false,retired=false,commitAttempted=false,uncertain=false,result:ReturnType<typeof placePinsResultSchema.parse>|undefined;
 const assert=(signal?:AbortSignal)=>{transport.assertCurrent();if(signal?.aborted||retired)throw new Error('Places pin intent retired');};
 const execute=async(request:PlacePinsRequest,key?:string,signal?:AbortSignal)=>{assert(signal);const liveWrite=request.operation==='replacePlacePins'||request.operation==='commitPlacePinsDraft';if(liveWrite)uncertain=true;try{const reply=await transport.execute(request,key,signal);assert(signal);return reply;}catch(error){if(liveWrite){const status=error&&typeof error==='object'&&'status' in error?error.status:undefined;uncertain=!(typeof status==='number'&&[400,401,403,404,409,413,422].includes(status));}throw error;}};
 const verifyResult=(reply:unknown)=>{const parsed=placePinsResultSchema.parse(reply);if(parsed.collectionId!==collectionId||parsed.pinCount!==orderedIds.length)throw new Error('Invalid Places pin result identity');result=Object.freeze(parsed);uncertain=false;return result;};
 return {
  orderedIds,
  get hasDraft(){return Boolean(draft);},
  get canDiscard(){return !uncertain&&!busy;},
  async save(signal?:AbortSignal){
   assert(signal);if(busy)throw new Error('Places pins save already pending');if(result)return result;busy=true;
   try{
    if(!plan){const available=placePinsAvailabilitySchema.parse(await execute({operation:'placePinsAvailability',collectionId},undefined,signal));if(!available.available)throw new Error('CLIENT_PLANNER_UNAVAILABLE: Places pins are unavailable');plan=await planPlacePins(orderedIds,original,requirePinsTransport(available));assert(signal);}
    if(plan.kind==='replace')return verifyResult(await execute({operation:'replacePlacePins',collectionId,body:plan.body},keys.replace,signal));
    if(!draft){const candidate=placePinsDraftSchema.parse(await execute({operation:'beginPlacePinsDraft',collectionId,body:{...original}},keys.begin,signal));if(candidate.collectionId!==collectionId||candidate.expectedCollectionRevision!==original.expectedCollectionRevision||candidate.expectedCategoryContentRevision!==original.expectedCategoryContentRevision)throw new Error('Invalid Places draft fences');draft=Object.freeze(candidate);}
    // Replan once from the begin receipt's original policy. Availability may have changed.
    if(!chunkKeys.length){const captured=requirePinsTransport(draft);if(captured.policyId!==draft.policyId||captured.policyVersion!==draft.policyVersion)throw new Error('CLIENT_PLANNER_UNAVAILABLE: captured policy changed');plan=await planPlacePins(orderedIds,original,captured,true);assert(signal);if(plan.kind!=='staged')throw new Error('Invalid staged Places plan');for(const _chunk of plan.chunks)chunkKeys.push(crypto.randomUUID());}
    if(plan.kind!=='staged')throw new Error('Invalid staged Places plan');
    while(nextChunk<plan.chunks.length){if(Date.now()>=Date.parse(draft.expiresAt))throw Object.assign(new Error('Places draft expired; discard and reload'),{status:409});const chunk=plan.chunks[nextChunk],reply=placePinsChunkSchema.parse(await execute({operation:'appendPlacePinsChunk',collectionId,draftId:draft.draftId,chunkIndex:chunk.index,body:chunk.body},chunkKeys[nextChunk],signal));if(reply.draftId!==draft.draftId||reply.chunkIndex!==chunk.index||reply.chunkHash!==chunk.body.chunkHash||reply.acceptedCount!==chunk.body.recommendationIds.length)throw new Error('Invalid Places chunk acknowledgement');nextChunk++;}
    if(!commitAttempted&&Date.now()>=Date.parse(draft.expiresAt))throw Object.assign(new Error('Places draft expired; discard and reload'),{status:409});
    commitAttempted=true;return verifyResult(await execute({operation:'commitPlacePinsDraft',collectionId,draftId:draft.draftId,body:plan.commit},keys.commit,signal));
   }finally{busy=false;}
  },
  async abort(signal?:AbortSignal){assert(signal);if(busy)throw new Error('Places pins save already pending');if(uncertain)throw new Error('Retry the original save acknowledgement before discarding');busy=true;try{if(draft){const reply=placePinsDraftAbortSchema.parse(await execute({operation:'abortPlacePinsDraft',collectionId,draftId:draft.draftId,body:{}},keys.abort,signal));if(reply.draftId!==draft.draftId)throw new Error('Invalid Places abort acknowledgement');}retired=true;}finally{busy=false;}},
 };
}
export type PlacePinsIntent=ReturnType<typeof createPlacePinsIntent>;
