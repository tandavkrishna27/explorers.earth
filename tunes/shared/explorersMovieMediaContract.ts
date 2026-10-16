import {z} from 'zod/v3';
import {bookCoverMediaSchema} from './explorersBookCoverContract';
const positive=z.number().int().positive().safe();
export const movieMediaSourceSchema=z.object({entityId:z.string().uuid(),provider:z.literal('tmdb'),externalKind:z.enum(['movie','tv']),externalId:z.string().regex(/^[1-9]\d{0,15}$/).refine(v=>Number.isSafeInteger(Number(v))),mappingVersion:z.literal(1),fetchedAt:z.number().int().nonnegative().safe()}).strict();
export const movieMediaSlotSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('poster')}).strict(),z.object({kind:z.literal('backdrop')}).strict(),
 z.object({kind:z.literal('cast'),ordinal:z.number().int().min(0).max(9),personId:positive,creditId:z.string().min(1).max(200).refine(v=>!/[\u0000-\u001f\u007f]/.test(v))}).strict()
]);
export type MovieMediaSlot=z.infer<typeof movieMediaSlotSchema>;
export const movieMediaSlotIndex=(slot:MovieMediaSlot):number=>slot.kind==='poster'?0:slot.kind==='backdrop'?1:slot.ordinal+2;
export const movieOwnedImageSchema=bookCoverMediaSchema;
const castSlot=movieMediaSlotSchema.options[2];
export const movieProviderMediaSchema=z.object({source:movieMediaSourceSchema,poster:movieOwnedImageSchema.nullable(),backdrop:movieOwnedImageSchema.nullable(),cast:z.array(z.object({slot:castSlot,media:movieOwnedImageSchema.nullable()}).strict()).max(10)}).strict().refine(v=>v.cast.every((x,i)=>i===0||v.cast[i-1].slot.ordinal<x.slot.ordinal));
export const importMovieMediaRequestSchema=z.object({expectedRevision:positive}).strict();
const copied=z.object({slot:movieMediaSlotSchema,status:z.literal('copied'),media:movieOwnedImageSchema}).strict();
const unavailable=z.object({slot:movieMediaSlotSchema,status:z.literal('unavailable')}).strict();
const absent=z.object({slot:movieMediaSlotSchema,status:z.literal('absent')}).strict();
export const movieMediaImportResultSchema=z.object({id:z.string().uuid(),revision:positive,source:movieMediaSourceSchema,slots:z.array(z.discriminatedUnion('status',[copied,unavailable,absent])).max(12)}).strict().refine(v=>v.slots.every((x,i)=>i===0||movieMediaSlotIndex(v.slots[i-1].slot)<movieMediaSlotIndex(x.slot)));
export type MovieMediaSource=z.infer<typeof movieMediaSourceSchema>;
export type MovieProviderMedia=z.infer<typeof movieProviderMediaSchema>;
export type MovieMediaImportResult=z.infer<typeof movieMediaImportResultSchema>;

export const movieGenreTermsResultSchema=z.object({version:z.literal('explorers-movie-genres/v1'),items:z.array(z.object({id:z.string().uuid(),slug:z.string().regex(/^[a-z][a-z0-9-]{0,99}$/),label:z.string().min(1).max(200),providerMappings:z.array(z.object({externalKind:z.enum(['movie','tv']),providerGenreId:positive}).strict()).min(1).max(2)}).strict()).max(27)}).strict().refine(v=>new Set(v.items.map(x=>x.id)).size===v.items.length&&new Set(v.items.map(x=>x.slug)).size===v.items.length);
