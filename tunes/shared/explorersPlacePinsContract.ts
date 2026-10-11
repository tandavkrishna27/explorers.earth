import {z} from 'zod/v3';
import {contentIdSchema,categoryContentRevisionSchema} from './explorersContract';
export const placePinsIdSchema=contentIdSchema.transform(value=>value.toLowerCase());
const count=z.number().int().nonnegative().safe();
const revision=z.number().int().positive().safe();
export const placePinsHashSchema=z.string().regex(/^[0-9a-f]{64}$/);
const ids=z.array(placePinsIdSchema).refine(value=>new Set(value).size===value.length,'Duplicate recommendation IDs');
const fences={expectedCollectionRevision:revision,expectedCategoryContentRevision:categoryContentRevisionSchema};
export const placePinsBodies={
 replacePlacePins:z.object({...fences,orderedRecommendationIds:ids}).strict(),
 beginPlacePinsDraft:z.object(fences).strict(),
 appendPlacePinsChunk:z.object({recommendationIds:ids,chunkHash:placePinsHashSchema}).strict(),
 commitPlacePinsDraft:z.object({totalCount:count,sequenceHash:placePinsHashSchema}).strict(),
 abortPlacePinsDraft:z.object({}).strict(),
};
const address={collectionId:placePinsIdSchema};
const draft={...address,draftId:placePinsIdSchema};
export const placePinsRequestSchema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('placePinsAvailability'),...address}).strict(),
 z.object({operation:z.literal('replacePlacePins'),...address,body:placePinsBodies.replacePlacePins}).strict(),
 z.object({operation:z.literal('beginPlacePinsDraft'),...address,body:placePinsBodies.beginPlacePinsDraft}).strict(),
 z.object({operation:z.literal('appendPlacePinsChunk'),...draft,chunkIndex:count,body:placePinsBodies.appendPlacePinsChunk}).strict(),
 z.object({operation:z.literal('commitPlacePinsDraft'),...draft,body:placePinsBodies.commitPlacePinsDraft}).strict(),
 z.object({operation:z.literal('abortPlacePinsDraft'),...draft,body:placePinsBodies.abortPlacePinsDraft}).strict(),
]);
export type PlacePinsRequest=z.infer<typeof placePinsRequestSchema>;
export type PlacePinsOperation=PlacePinsRequest['operation'];
export const placePinsResultSchema=z.object({collectionId:placePinsIdSchema,collectionRevision:revision,categoryContentRevision:categoryContentRevisionSchema,pinCount:count,changed:z.boolean()}).strict();
export const placePinsDraftSchema=z.object({...draft,...fences,expiresAt:z.string().datetime({offset:true}),policyId:z.string().min(1).max(128),policyVersion:revision}).strict();
export const placePinsChunkSchema=z.object({draftId:placePinsIdSchema,chunkIndex:count,chunkHash:placePinsHashSchema,acceptedCount:count,changed:z.boolean()}).strict();
export const placePinsDraftAbortSchema=z.object({draftId:placePinsIdSchema,changed:z.boolean()}).strict();
export const placePinsAvailabilitySchema=z.union([z.object({available:z.literal(false),state:z.enum(['configured','unconfigured','unsupported']),reason:z.literal('STORAGE_UNAVAILABLE')}).strict(),z.object({available:z.literal(true),state:z.literal('configured')}).strict()]);
export const placePinsResults={placePinsAvailability:placePinsAvailabilitySchema,replacePlacePins:placePinsResultSchema,beginPlacePinsDraft:placePinsDraftSchema,appendPlacePinsChunk:placePinsChunkSchema,commitPlacePinsDraft:placePinsResultSchema,abortPlacePinsDraft:placePinsDraftAbortSchema};
/** UTF8 framing: version/domain LF, normalized UUID LF per item, count:N LF.
 * Chunk additionally prefixes its canonical decimal index LF. UUID fixed width
 * makes framing unambiguous; sequence framing never includes chunk boundaries.
 */
export const placePinsHashDomain='explorers-place-pins/v1\n';
