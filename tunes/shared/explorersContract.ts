import {movieContextSchema,movieDisplayFieldsSchema,resolveProviderMovieSchema,resolveManualMovieSchema} from './explorersMovieContract';
import { z } from "zod/v3";
import { richNoteSchema } from './explorersRichNoteContract';
import {bookDisplayFieldsSchema,bookRecommendationContextSchema,resolveProviderBookSchema,resolveManualBookSchema} from './explorersBookContract';

export const categoryKeys = [
  "places", "guides", "music", "movies", "books", "games", "apps", "products", "people",
] as const;
export const categoryKeySchema = z.enum(categoryKeys);
export type CategoryKey = z.infer<typeof categoryKeySchema>;

const analyticsInstant=z.string().datetime({offset:true}).refine(value=>Number.isFinite(Date.parse(value)));
export const analyticsQuerySchema=z.object({from:analyticsInstant,to:analyticsInstant,category:categoryKeySchema.optional(),collectionId:z.string().uuid().optional(),recommendationId:z.string().uuid().optional()}).strict().refine(input=>Date.parse(input.to)>Date.parse(input.from)&&Date.parse(input.to)-Date.parse(input.from)<=366*86400000);
export type AnalyticsQuery=z.infer<typeof analyticsQuerySchema>;
export type AnalyticsCounts={views:number;clicks:number;interactions:number};
export type AnalyticsBucket=AnalyticsCounts&{key:string};
export type AnalyticsDimension={buckets:AnalyticsBucket[];truncated:boolean;other:AnalyticsCounts};
export type AnalyticsDimensionKey='page'|'category'|'country'|'trafficSource'|'element'|'platform'|'collection'|'recommendation';
export type AnalyticsSummary={version:1;from:string;to:string;totals:AnalyticsCounts;daily:(AnalyticsCounts&{day:string})[];dimensions:Record<AnalyticsDimensionKey,AnalyticsDimension>};

// Bounded recommendation core. Rich notes, category facts and display overrides have
// separate typed adapters; this boundary intentionally has no arbitrary JSON field.
export const contentCategorySchema = z.enum(['places','guides','movies','books','games','apps','products','people']);
export const recommendationCategorySchema = z.enum(['places','movies','books','games','apps','products','people']);
export const catalogKindSchema = z.enum(['place','movie','book','game','app','product','person']);
const contentRevision = z.number().int().positive().safe();
const contentTitle = z.string().trim().min(1).max(200);
const contentSlug = z.string().max(200).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const publicationState = z.enum(['draft','published']);
const contentVisibility = z.enum(['private','public']);
const userRating = z.number().int().min(1).max(10).nullable();
export const contentIdSchema = z.string().uuid();
export const commandKeySchema = z.string().regex(/^[A-Za-z0-9._~-]{8,200}$/);
export const topPickCategorySchema = z.enum(['books','movies','games','apps','products','people']);
export const categoryContentRevisionSchema = z.string().regex(/^(0|[1-9][0-9]{0,15})$/).refine(v=>Number.isSafeInteger(Number(v)));
const topPickMembershipSchema = z.object({recommendationId:contentIdSchema.transform(v=>v.toLowerCase()),collectionId:contentIdSchema.transform(v=>v.toLowerCase())}).strict();
export const categoryTopPicksInputSchema = z.object({expectedCategoryRevision:categoryContentRevisionSchema,
  expectedPinRevision:contentRevision.nullable(),orderedPins:z.array(topPickMembershipSchema).max(15)
    .refine(pins=>new Set(pins.map(p=>p.recommendationId)).size===pins.length,'Duplicate recommendation')}).strict();
// replace returns the complete replaced set; upsert-order returns supplied rows
// only. Neither response is a category content snapshot or grants completeness.
export const categoryTopPicksResultSchema = z.object({operation:z.enum(['replace','upsert-order']),
  categoryRevision:categoryContentRevisionSchema,pinRevision:contentRevision,
  pins:z.array(topPickMembershipSchema.extend({position:z.number().int().nonnegative()})).max(15)}).strict();
export type TopPickCategory = z.infer<typeof topPickCategorySchema>;
export type CategoryTopPicksInput = z.infer<typeof categoryTopPicksInputSchema>;
export type CategoryTopPicksResult = z.infer<typeof categoryTopPicksResultSchema>;
const collectionPlainText = z.string().max(5000).nullable();
const collectionHeading = z.string().trim().max(200).nullable();
const recommendationMediaIds = z.array(contentIdSchema).max(20).refine(ids=>new Set(ids).size===ids.length,'Duplicate media');
// Read bounds preserve previously accepted canonical/provider text. New writes
// normalize boundary whitespace and reject controls and malformed Unicode.
export const catalogTitleSchema=z.string().trim().refine(v=>v.length>0&&Array.from(v).length<=500,'Invalid title length');
export const displayTitleWriteSchema=z.string().trim().pipe(catalogTitleSchema).refine(v=>!/[\u0000-\u001f\u007f]/.test(v)&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v),'Invalid title characters');
export const displayOverridesSchema=bookDisplayFieldsSchema.extend(movieDisplayFieldsSchema.shape).extend({title:displayTitleWriteSchema.nullable().optional()}).strict();
export const displayOverridesReadSchema=bookDisplayFieldsSchema.extend(movieDisplayFieldsSchema.shape).extend({title:z.string().refine(v=>v===v.trim(),'Unnormalized stored title').pipe(displayTitleWriteSchema).nullable().optional()}).strict();
export type DisplayOverrides=z.infer<typeof displayOverridesSchema>;
export const contentRevisionSchema = z.object({expectedRevision:contentRevision}).strict();
export const createCollectionSchema = z.object({category:contentCategorySchema,title:contentTitle,slug:contentSlug,
  visibility:contentVisibility.default('private'),publicationState:publicationState.default('draft'),
  description:collectionPlainText.default(null),heading:collectionHeading.default(null),coverMediaId:contentIdSchema.nullable().default(null)}).strict();
export const updateCollectionSchema = z.object({expectedRevision:contentRevision,title:contentTitle.optional(),
  visibility:contentVisibility.optional(),publicationState:publicationState.optional(),description:collectionPlainText.optional(),
  heading:collectionHeading.optional(),coverMediaId:contentIdSchema.nullable().optional()}).strict()
  .refine(value=>Object.keys(value).length>1,'At least one editable field required');
export const createRecommendationSchema = z.object({category:recommendationCategorySchema,entityId:contentIdSchema,
  collectionId:contentIdSchema,expectedCollectionRevision:contentRevision,userRating:userRating.default(null),
  publicationState:publicationState.default('draft'),mediaIds:recommendationMediaIds.default([]),note:richNoteSchema.nullable().default(null),displayOverrides:displayOverridesSchema.optional(),bookContext:bookRecommendationContextSchema.optional(),movieContext:movieContextSchema.optional(),movieTermIds:z.array(contentIdSchema).max(32).refine(v=>new Set(v).size===v.length).optional()}).strict().refine(v=>(v.category==='books'?v.movieContext===undefined&&v.movieTermIds===undefined&&bookDisplayFieldsSchema.extend({title:displayTitleWriteSchema.nullable().optional()}).safeParse(v.displayOverrides??{}).success:v.category==='movies'?v.bookContext===undefined&&movieDisplayFieldsSchema.extend({title:displayTitleWriteSchema.nullable().optional()}).safeParse(v.displayOverrides??{}).success:v.bookContext===undefined&&v.movieContext===undefined&&v.movieTermIds===undefined&&Object.keys(v.displayOverrides??{}).every(k=>k==='title')),'Book values require books category');
export const updateRecommendationSchema = z.object({expectedRevision:contentRevision,userRating:userRating.optional(),
  publicationState:publicationState.optional(),mediaIds:recommendationMediaIds.optional(),note:richNoteSchema.nullable().optional(),displayOverrides:displayOverridesSchema.optional(),bookContext:bookRecommendationContextSchema.optional(),movieContext:movieContextSchema.optional(),movieTermIds:z.array(contentIdSchema).max(32).refine(v=>new Set(v).size===v.length).optional()}).strict().refine(value=>Object.keys(value).length>1,'At least one editable field required');
export const reorderCollectionSchema = z.object({expectedRevision:contentRevision,
  orderedRecommendationIds:z.array(contentIdSchema).max(10000)}).strict();
export const collectionCoreDtoSchema = z.object({id:contentIdSchema,accountId:contentIdSchema,category:contentCategorySchema,
  title:contentTitle,slug:contentSlug,visibility:contentVisibility,publicationState,revision:contentRevision,
  description:collectionPlainText,heading:collectionHeading,coverMediaId:contentIdSchema.nullable()}).strict();
export const recommendationCoreDtoSchema = z.object({id:contentIdSchema,accountId:contentIdSchema,entityId:contentIdSchema,
  category:recommendationCategorySchema,userRating,publicationState,revision:contentRevision,mediaIds:recommendationMediaIds}).strict();
export type CreateCollectionInput = z.input<typeof createCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;
export type CreateRecommendationInput = z.input<typeof createRecommendationSchema>;
export type UpdateRecommendationInput = z.infer<typeof updateRecommendationSchema>;
export type CollectionCoreDto = z.infer<typeof collectionCoreDtoSchema>;
export type RecommendationCoreDto = z.infer<typeof recommendationCoreDtoSchema>;
export const resolveExistingEntitySchema = z.object({entityId:contentIdSchema,category:recommendationCategorySchema}).strict();
export const entityCoreDtoSchema = z.object({id:contentIdSchema,kind:catalogKindSchema,title:catalogTitleSchema}).strict();
export const resolveManualEntitySchema=z.object({kind:z.literal('manual'),category:topPickCategorySchema,details:z.object({title:displayTitleWriteSchema}).strict()}).strict();
export const resolveEntitySchema=z.union([resolveExistingEntitySchema,resolveManualEntitySchema,resolveProviderBookSchema,resolveManualBookSchema,resolveProviderMovieSchema,resolveManualMovieSchema]);
export type ResolveManualEntityInput=z.input<typeof resolveManualEntitySchema>;

export const apiErrorCodes = ["UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "INVALID_INPUT", "RATE_LIMITED", "RESOURCE_TOO_LARGE", "CONTINUATION_LIMIT", "CURSOR_EXPIRED", "PROVIDER_UNAVAILABLE", "PROVIDER_INVALID_RESPONSE"] as const;
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(apiErrorCodes),
    message: z.string(),
    requestId: z.string(),
  }).strict(),
}).strict();
export type ApiError = z.infer<typeof apiErrorSchema>;

export const mediaDtoSchema = z.object({
  id: z.string().uuid(),
  url: z.string().startsWith("/api/explorers/v1/media/"),
  mimeType: z.string(),
  size: z.number().int().nonnegative().safe(),
  alternativeText: z.string().nullable(),
  caption: z.string().nullable(),
}).strict();
export type MediaDto = z.infer<typeof mediaDtoSchema>;

const shortText = z.string().trim().max(500);
const addressSchema = z.object({
  address: shortText.optional(), streetNumber: shortText.optional(), streetName: shortText.optional(),
  postalCode: shortText.optional(), state: shortText.optional(), city: shortText.optional(),
  country: shortText.optional(), title: shortText.optional(), businessTitle: shortText.optional(),
  businessAddress: shortText.optional(), contact: shortText.optional(), businessContact: shortText.optional(),
  website: z.string().url().startsWith("https://").max(2048).optional(),
  businessWebsite: z.string().url().startsWith("https://").max(2048).optional(),
  about: z.string().max(5000).optional(), businessDescription: z.string().max(5000).optional(),
}).strict();
const publicAddressSchema = addressSchema.extend({
  placeId: shortText.optional(),
  places: z.null().optional(),
}).strict();
const placeDetailsSchema = z.object({ placeId: shortText.optional(), name: shortText.optional(),
  formattedAddress: shortText.optional(), lat: z.number().finite().optional(), lng: z.number().finite().optional() }).strict();
const richTextSchema = z.object({ blocks: z.array(z.object({ text: z.string().max(5000) }).strict()).max(100) }).strict();
const themeSettingsSchema = z.object({
  preset: z.enum(["cinematic-dark", "glassmorphism", "sunset-glow", "minimal-light", "emerald-nature", "neon-cyber"]).optional(),
  wallpaperMode: z.enum(["banner-top", "full-wallpaper-image", "ambient-gradient", "solid-color"]).optional(),
  wallpaperUrl: z.string().regex(/^\/api\/explorers\/v1\/media\/[0-9a-f-]{36}\/content$/i).optional(),
  accentColor: z.string().regex(/^#[0-9a-f]{3,8}$/i).optional(),
  customTextColor: z.string().regex(/^#[0-9a-f]{3,8}$/i).optional(),
  landingTab: z.enum(["all-recommendations", "places", "movies", "books", "games", "guides", "apps", "products", "people", "gallery", "business", "music"]).optional(),
  visibleTabs: z.object({ recommendations: z.boolean().optional(), gallery: z.boolean().optional(), business: z.boolean().optional() }).strict().optional(),
  footerBranding: z.enum(["enabled", "minimal", "disabled"]).optional(),
  recommendations: z.object({ layout: z.enum(["shelves", "grid", "featured"]).optional(),
    categoryOrder: z.array(categoryKeySchema).max(9).optional() }).strict().optional(),
}).strict();
const socialLinkSchema = z.object({ platform: z.enum(["instagram", "youtube", "whatsapp", "website", "facebook",
  "linkedin", "snapchat", "tiktok", "email", "gmail", "X", "spotify", "youtubeMusic", "appleMusic", "localTunes"]),
  url: z.string().max(2048), visible: z.boolean() }).strict();
const businessDetailsSchema = z.object({ category: shortText.optional(), description: z.string().max(5000).optional() }).strict();
const feedDetailsSchema = z.object({ fileName: shortText.optional(), aspectRatio: z.enum(["1:1", "4:5", "1.91:1", "9:16"]).optional(),
  width: z.number().int().positive().max(20000).optional(), height: z.number().int().positive().max(20000).optional() }).strict();

export const profileFeedItemSchema = z.object({
  id: z.string().uuid(),
  mediaId: z.string().uuid().nullable(),
  url: z.string().url().or(z.string().startsWith("/api/explorers/v1/media/")),
  source: z.enum(["manual", "google", "instagram"]),
  type: z.enum(["image", "video"]),
  caption: z.string().nullable(),
  details: feedDetailsSchema,
}).strict();
export type ProfileFeedItem = z.infer<typeof profileFeedItemSchema>;
export const profileFeedInputSchema = profileFeedItemSchema.omit({ id: true, url: true }).extend({
  externalUrl: z.string().url().startsWith("https://").nullable(),
}).strict();

export const accountDtoSchema = z.object({
  id: z.string().uuid(),
  handle: z.string().nullable(),
  displayName: z.string().nullable(),
  accountType: z.enum(["Personal", "Creator", "Business"]).nullable(),
  onboardingStatus: z.enum(["incomplete", "complete"]),
  status: z.enum(["active", "suspended", "pending_deletion", "deleted"]),
  revision: z.number().int().positive().safe(),
  publicProfile: z.boolean(),
  autoPinning: z.boolean(),
  locale: z.string(),
  mobileNumber: z.string().nullable(),
  mobileNumberVisible: z.boolean(),
  bioPlain: z.string().nullable(),
  bioRich: richTextSchema.nullable(),
  primaryAddress: addressSchema.nullable(),
  additionalAddresses: z.array(addressSchema).max(20),
  publicAddress: publicAddressSchema.nullable(),
  profilePlaceDetails: placeDetailsSchema.nullable(),
  categories: z.array(z.object({ category: categoryKeySchema, isPublic: z.boolean(), displayOrder: z.number().int().nonnegative(), pinnedOrder: z.number().int().nonnegative().nullable() }).strict()),
  themeSettings: themeSettingsSchema,
  socialLinks: z.array(socialLinkSchema).max(20),
  businessDetails: businessDetailsSchema,
  profileImage: mediaDtoSchema.optional(),
  backgroundImage: mediaDtoSchema.optional(),
  feedItems: z.array(profileFeedItemSchema),
}).strict();
export type AccountDto = z.infer<typeof accountDtoSchema>;

const nullableText = z.string().trim().max(5000).nullable();
export const updateAccountInputSchema = z.object({
  handle: z.string().trim().min(3).max(30).nullable().optional(),
  displayName: z.string().trim().min(1).max(200).nullable().optional(),
  accountType: z.enum(["Personal", "Creator", "Business"]).nullable().optional(),
  onboardingStatus: z.enum(["complete"]).optional(),
  publicProfile: z.boolean().optional(),
  autoPinning: z.boolean().optional(),
  locale: z.enum(["en", "hi"]).optional(),
  mobileNumber: nullableText.optional(),
  mobileNumberVisible: z.boolean().optional(),
  bioPlain: nullableText.optional(),
  bioRich: richTextSchema.nullable().optional(),
  primaryAddress: addressSchema.nullable().optional(),
  additionalAddresses: z.array(addressSchema).max(20).optional(),
  publicAddress: publicAddressSchema.nullable().optional(),
  profilePlaceDetails: placeDetailsSchema.nullable().optional(),
  categories: z.array(z.object({ category: categoryKeySchema, isPublic: z.boolean(), displayOrder: z.number().int().nonnegative(), pinnedOrder: z.number().int().nonnegative().nullable() }).strict()).optional(),
  themeSettings: themeSettingsSchema.optional(),
  socialLinks: z.array(socialLinkSchema).max(20).optional(),
  businessDetails: businessDetailsSchema.optional(),
  profileImageId: z.string().uuid().nullable().optional(),
  backgroundImageId: z.string().uuid().nullable().optional(),
  feedItems: z.array(profileFeedInputSchema).max(100).optional(),
}).strict();
export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;
export const updateAccountRequestSchema = updateAccountInputSchema.extend({ expectedRevision: z.number().int().positive().safe() }).strict();

export type Page<T> = { items: T[]; nextCursor: string | null };
export type RevisionInput = { expectedRevision: number };
export type RequestContext = { requestId: string; idempotencyKey?: string };
