import {z} from 'zod/v3';
/** Pure facts/query profile. This module does not grant operational provider authority. */
const text=(max:number)=>z.string().max(max).refine(v=>!/[\u0000-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v));
const name=text(200).refine(v=>v.trim().length>0);
const positive=z.number().int().positive().safe();
const unix=z.number().int().min(0).max(253402300799);
export const gameExternalIdSchema=z.string().regex(/^[1-9]\d{0,15}$/).refine(v=>Number.isSafeInteger(Number(v)));
export const gameSearchInputSchema=z.object({query:text(200).transform(v=>v.trim()).refine(v=>v.length>0),limit:z.literal(24),cursor:z.string().regex(/^[A-Za-z0-9_-]{1,512}$/).optional()}).strict();
export type GameSearchInput=z.infer<typeof gameSearchInputSchema>;
const term=z.object({id:positive,name}).strict();
const imageId=z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);
// IGDB answers expanded image objects with their own id beside image_id.
const image=z.object({id:positive.optional(),image_id:imageId}).strict();
/** Long provider lists are cut to what the app keeps, never a reason to reject the row. */
const capped=<T extends z.ZodTypeAny>(item:T,max:number)=>z.preprocess(v=>Array.isArray(v)?v.slice(0,max):v,z.array(item));
const dateFormat=z.object({id:positive,format:name}).strict();
const releaseRegion=z.object({id:positive,region:name}).strict();
const release=z.object({id:positive,date:unix.nullish(),y:z.number().int().min(1).max(9999).nullish(),m:z.number().int().min(1).max(12).nullish(),d:z.number().int().min(1).max(31).nullish(),human:text(200).nullish(),platform:positive.nullish(),date_format:dateFormat.nullish(),release_region:releaseRegion.nullish(),category:z.number().int().min(0).max(7).nullish(),region:z.number().int().min(1).max(10).nullish()}).strict();
const company=z.object({id:positive,developer:z.boolean(),publisher:z.boolean(),company:term}).strict();
const gameUrl=z.string().max(2048).url().refine(v=>{const u=new URL(v);return !/[\u0000-\u001f\u007f]/.test(v)&&u.protocol==='https:'&&u.hostname==='www.igdb.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/games\/[a-z0-9-]+$/.test(u.pathname);});
export const gameProviderRowSchema=z.object({id:positive,name,slug:text(200).nullish(),cover:image.nullish(),summary:text(100000).nullish(),storyline:text(100000).nullish(),first_release_date:unix.nullish(),total_rating:z.number().finite().min(0).max(100).nullish(),total_rating_count:z.number().int().nonnegative().safe().nullish(),genres:capped(term,128).nullish(),platforms:capped(term,128).nullish(),game_modes:capped(term,32).nullish(),involved_companies:capped(company,100).nullish(),screenshots:capped(image,100).nullish(),url:gameUrl.nullish(),release_dates:capped(release,128).nullish()}).strict();
export type GameProviderRow=z.infer<typeof gameProviderRowSchema>;
export type GamePrecision='day'|'month'|'year'|'quarter'|'unknown';
export type GameReleaseFact={id:number;date:number|null;year:number|null;month:number|null;day:number|null;human:string|null;platform:number|null;dateFormat:{id:number;format:string}|null;releaseRegion:{id:number;region:string}|null;legacyCategory:number|null;legacyRegion:number|null;precision:GamePrecision;precisionSource:'current'|'legacy'|'timestamp-only'|'unknown'};
export type GameProviderFacts={provider:'igdb';externalKind:'game';externalId:string;mappingVersion:1;fetchedAt:number;title:string;slug:string|null;summary:string|null;storyline:string|null;firstReleaseDate:number|null;providerRating:number|null;ratingsCount:number|null;genres:{id:number;name:string}[];platforms:{id:number;name:string}[];gameModes:{id:number;name:string}[];companies:GameProviderRow['involved_companies'];developer:string|null;publisher:string|null;coverImageId:string|null;screenshotIds:string[];providerUrl:string|null;releases:GameReleaseFact[]};
/** What the add-game page shows for a search hit and fills its form from. */
export const gameCandidateSchema=z.object({externalId:gameExternalIdSchema,title:name,year:z.number().int().min(1).max(9999).nullable(),coverUrl:z.string().max(200).regex(/^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_cover_big\/[A-Za-z0-9_-]+\.jpg$/).nullable(),platforms:z.array(name).max(12),genres:z.array(name).max(12)}).strict();
export type GameCandidate=z.infer<typeof gameCandidateSchema>;
export const gameCandidatePageSchema=z.object({version:z.literal('explorers-game-candidates/v1'),items:z.array(gameCandidateSchema).max(24),nextCursor:z.string().regex(/^[A-Za-z0-9_-]{1,512}$/).nullable()}).strict();
export type GameCandidatePage=z.infer<typeof gameCandidatePageSchema>;
