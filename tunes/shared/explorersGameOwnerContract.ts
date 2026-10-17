import {z} from 'zod/v3';
import {gameSearchInputSchema} from './explorersGameContract';
import {richNoteSchema} from './explorersRichNoteContract';
import {collectionCoreDtoSchema,recommendationCoreDtoSchema} from './explorersContract';
export const gameMembershipCommandSchema=z.object({expectedCollectionRevision:z.number().int().positive().safe(),expectedRecommendationRevision:z.number().int().positive().safe()}).strict();
export const gameMembershipResultSchema=z.object({collection:collectionCoreDtoSchema,recommendation:recommendationCoreDtoSchema,attached:z.boolean()}).strict();
export const gameCatalogRequestSchema=gameSearchInputSchema.extend({limit:z.literal('24').default('24').transform(()=>24 as const)}).strict();
const uuid=z.string().uuid();
export const manualGamePresentationSchema=z.object({
 version:z.literal('explorers-manual-game/v1'),origin:z.literal('manual'),
 providerExternalId:z.null(),providerFacts:z.null(),
 images:z.array(z.object({mediaId:uuid,url:z.string().max(128)}).strict()).max(20),
 coverMediaId:uuid.nullable(),
}).strict().superRefine((value,ctx)=>{
 if(value.coverMediaId!==(value.images[0]?.mediaId??null)||new Set(value.images.map(image=>image.mediaId)).size!==value.images.length||value.images.some(image=>image.url!==`/api/explorers/v1/media/${image.mediaId}/content`))
  ctx.addIssue({code:'custom',message:'Inconsistent manual Game media'});
});
export type ManualGamePresentation=z.infer<typeof manualGamePresentationSchema>;
export const publicGameRowSchema=z.object({id:uuid,entityId:uuid,kind:z.literal('game'),collection:z.object({id:uuid,title:z.string().max(8192),slug:z.string().max(200)}).strict(),title:z.string().max(8192).nullable(),userRating:z.number().int().min(1).max(10).nullable(),note:richNoteSchema.nullable(),gamePresentation:manualGamePresentationSchema,displayOrder:z.number().int().nonnegative().safe(),pinPosition:z.number().int().nonnegative().max(14).nullable()}).strict();
export const publicGameListSchema=z.object({id:uuid,title:z.string().max(8192),description:z.string().max(32768).nullable(),slug:z.string().max(200),heading:z.string().max(32768).nullable(),displayOrder:z.number().int().nonnegative().safe(),coverMediaId:uuid.nullable(),coverUrl:z.string().max(128).nullable(),recommendations:z.array(publicGameRowSchema).max(24),nextCursor:z.string().max(2048).nullable()}).strict().refine(value=>value.coverUrl===(value.coverMediaId?`/api/explorers/v1/media/${value.coverMediaId}/content`:null));
export const gamesPublicPageSchema=z.object({version:z.literal('explorers-manual-games-page/v1'),gameLists:z.array(publicGameListSchema).max(24),topPicks:z.array(publicGameRowSchema).max(15),nextCursor:z.string().max(2048).nullable()}).strict();
export type GamePublicRow=z.infer<typeof publicGameRowSchema>;
export type GamePublicList=z.infer<typeof publicGameListSchema>;
export type GamesPublicPage=z.infer<typeof gamesPublicPageSchema>;
