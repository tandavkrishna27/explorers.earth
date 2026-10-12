import {manualGamePresentationSchema} from './explorersGameOwnerContract';
import {movieProviderMediaSchema} from './explorersMovieMediaContract';
import {appEntityDetailsSchema} from './explorersAppContract';
import {movieDetailsSchema,movieContextSchema,movieTermsSchema} from './explorersMovieContract';
import {bookCoversSchema} from './explorersBookCoverContract';
import { z } from 'zod/v3';
import { richNoteSchema } from './explorersRichNoteContract';
import { catalogTitleSchema } from './explorersContract';
import {bookEntityDetailsSchema,bookRecommendationContextSchema} from './explorersBookContract';
export const publicContentRequestSchema=z.object({
  username:z.string().regex(/^[a-z][a-z0-9-]{2,29}$/),
  category:z.enum(['places','guides','movies','books','games','apps','products','people']),
  slug:z.string().max(200).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).optional(),
  limit:z.string().regex(/^(?:[1-9]|1[0-9]|2[0-4])$/).default('12').transform(Number),
  cursor:z.string().min(40).max(2048).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();
export type PublicContentRequest=z.infer<typeof publicContentRequestSchema>;
export const publicRecommendationDetailRequestSchema=publicContentRequestSchema.omit({limit:true,cursor:true}).extend({slug:z.string().max(200).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),id:z.string().uuid()}).strict();
// v1 is an unadopted internal checkpoint: coordinated nullable presentation
// change precedes released consumer adoption. Null explicitly clears the title.
export const publicRecommendationSummarySchema=z.object({id:z.string().uuid(),title:catalogTitleSchema.nullable(),kind:z.enum(['place','movie','book','game','app','product','person']),userRating:z.number().int().min(1).max(10).nullable()}).strict();
export const publicRecommendationDetailSchema=z.object({version:z.literal('explorers-public-content/v1'),recommendation:publicRecommendationSummarySchema.extend({note:richNoteSchema.nullable(),gamePresentation:manualGamePresentationSchema.optional(),bookCovers:bookCoversSchema.optional(),bookDetails:bookEntityDetailsSchema.optional(),bookContext:bookRecommendationContextSchema.optional(),movieDetails:movieDetailsSchema.optional(),movieContext:movieContextSchema.optional(),movieTerms:movieTermsSchema.optional(),providerMedia:movieProviderMediaSchema.nullable().optional(),appDetails:appEntityDetailsSchema.optional(),appScreenshotUrls:z.array(z.string().startsWith('/api/explorers/v1/media/')).max(10).optional()}).strict().refine(v=>v.kind==='game'?v.gamePresentation!==undefined:v.gamePresentation===undefined).refine(v=>v.kind==='book'||v.bookDetails===undefined&&v.bookContext===undefined&&v.bookCovers===undefined).refine(v=>v.kind==='movie'||v.movieDetails===undefined&&v.movieContext===undefined&&v.movieTerms===undefined&&v.providerMedia===undefined).refine(v=>v.kind==='app'||v.appDetails===undefined&&v.appScreenshotUrls===undefined)}).strict();
export type PublicCollectionSummary={id:string;title:string;slug:string;description:string|null;heading:string|null};
export type PublicRecommendationSummary=z.infer<typeof publicRecommendationSummarySchema>;
export const publicPlacePinsReadSchema=z.object({collectionId:z.string().uuid(),collectionRevision:z.string().regex(/^\d+$/),categoryContentRevision:z.string().regex(/^\d+$/),eligibilityFingerprint:z.string().regex(/^[a-f0-9]{64}$/),eligibleItemCount:z.number().int().nonnegative().safe(),eligiblePinCount:z.number().int().nonnegative().safe()}).strict().refine(v=>v.eligiblePinCount<=v.eligibleItemCount);
export type PublicContentPage<T>={version:'explorers-public-content/v1';items:T[];nextCursor:string|null;placePins?:z.infer<typeof publicPlacePinsReadSchema>};
