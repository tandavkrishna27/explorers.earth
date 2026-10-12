import {z} from 'zod/v3';
import {PLACE_PINS_PARSER_BYTES} from '../../shared/explorersPlacePinsContract';
export {PLACE_PINS_PARSER_BYTES};
// Existing full-app declared body ceiling. This is a supported transport ceiling,
// never an approved operational default or total product sequence limit.

const bound=z.number().int().positive().safe();
export const placePinsPolicySchema=z.object({policyId:z.string().regex(/^[A-Za-z0-9._~-]{1,128}$/),policyVersion:bound,
 transportChunkBytes:bound,transportChunkIds:bound,replacementBytes:bound,replacementIds:bound,
 ownerDraftQuota:bound,ownerStagingBytes:bound,draftExpiryMs:bound,stagingRetentionMs:bound,receiptRetentionMs:bound,
 commitProcessingBytes:bound,commitProcessingMs:bound,commitWorkUnits:bound,cleanupBatchSize:bound,cleanupWorkUnits:bound,
}).strict().superRefine((p,ctx)=>{
 const invalid=p.transportChunkBytes>p.replacementBytes||p.replacementBytes>PLACE_PINS_PARSER_BYTES||p.transportChunkIds>p.replacementIds||
  p.ownerStagingBytes<p.transportChunkBytes||p.ownerStagingBytes<p.replacementBytes||p.stagingRetentionMs<p.draftExpiryMs||p.receiptRetentionMs<p.stagingRetentionMs||
  p.commitProcessingBytes<p.ownerStagingBytes||p.cleanupWorkUnits<p.cleanupBatchSize||p.transportChunkIds>Math.floor(p.transportChunkBytes/39)||p.replacementIds>Math.floor(p.replacementBytes/39);
 if(invalid)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Policy bounds are incoherent or exceed supported transport'});
});
export type PlacePinsPolicy=z.infer<typeof placePinsPolicySchema>;
export type PlacePinsPolicyResolution={state:'configured';policy:PlacePinsPolicy}|{state:'unconfigured'|'unsupported'};
export function resolvePlacePinsPolicy(input:unknown):PlacePinsPolicyResolution {
 if(input===undefined||input===null)return {state:'unconfigured'};
 const result=placePinsPolicySchema.safeParse(input);
 return result.success?{state:'configured',policy:result.data}:{state:'unsupported'};
}
/** Explicit projection of configured values only; never remaining-capacity promises. */
export function clientPlacePinsTransport(policy:PlacePinsPolicy):import('../../shared/explorersPlacePinsContract').PlacePinsClientTransport {
 const {policyId,policyVersion,replacementBytes,replacementIds,transportChunkBytes,transportChunkIds,ownerStagingBytes,commitProcessingBytes,commitProcessingMs,commitWorkUnits,draftExpiryMs}=policy;
 return {policyId,policyVersion,replacementBytes,replacementIds,transportChunkBytes,transportChunkIds,ownerStagingBytes,commitProcessingBytes,commitProcessingMs,commitWorkUnits,draftExpiryMs};
}
