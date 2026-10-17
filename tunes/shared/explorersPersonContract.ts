import {z} from 'zod/v3';
// Ticket 4.5. A recommended person is data, not an identity: there is no FK to users or
// accounts, no global unique handle or name, and matching an account handle confers no
// ownership or login linkage. Two "Alex Lee" records are two entities.
//
// The core entity title supplies the name. Everything here is the shared catalog's
// description of that person, and every field is nullable - unlike Apps and Products,
// whose URL columns are NOT NULL, a person record with nothing but a name is legitimate.
//
// Suppression: a recommended person has no account and therefore no way to ask for their
// own removal. suppressedAt is the answer - when set, public projections and search omit
// the person and their recommendations stop publishing, while the owner's own list keeps
// working. Owner decision, 2026-10-07: carry it from the start rather than needing a
// migration and a sweep of every projection the first time someone asks.

const text=(max:number)=>z.string().trim().max(max).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v),'Invalid text');
export const personNameSchema=text(1000).refine(v=>v.length>0&&Array.from(v).length<=500&&!/[\u0000-\u001f\u007f]/.test(v),'Invalid name');
// Identical to the other categories' URL rule: http(s) only, no embedded credentials, no
// explicit port. 0045 carries the scheme CHECK as well.
export const safePersonUrlSchema=z.string().max(2048).url().refine(v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.port;}catch{return false;}},'Invalid URL');

/**
 * The stored platform vocabulary. The frontend presents `x`; the stored value is
 * `twitter`, which the target schema states explicitly, so the normalisation lives here
 * rather than being re-derived at each edge.
 */
export const PERSON_PLATFORMS=['instagram','linkedin','twitter','github','youtube','website','other'] as const;
export const personPlatformSchema=z.enum(PERSON_PLATFORMS);
export type PersonPlatform=(typeof PERSON_PLATFORMS)[number];
export const storedPlatform=(value:string):PersonPlatform|undefined=>{
 const normalized=value.trim().toLowerCase();
 if(normalized==='x')return 'twitter';
 return (PERSON_PLATFORMS as readonly string[]).includes(normalized)?normalized as PersonPlatform:undefined;
};

// Social links are a closed key set with validated URL values - not an arbitrary bag.
// `primary` is permitted alongside the platforms, as the target schema states.
export const PERSON_SOCIAL_KEYS=['primary',...PERSON_PLATFORMS] as const;
export const personSocialUrlsSchema=z.object(Object.fromEntries(PERSON_SOCIAL_KEYS.map(key=>[key,safePersonUrlSchema.optional()])) as Record<(typeof PERSON_SOCIAL_KEYS)[number],z.ZodOptional<typeof safePersonUrlSchema>>).strict();

const fields={
 usernameHandle:text(200).nullable(),
 headline:text(500).nullable(),
 locationText:text(200).nullable(),
 avatarUrl:safePersonUrlSchema.nullable(),
 primaryPlatform:personPlatformSchema.nullable(),
 socialUrls:personSocialUrlsSchema,
 skillsTags:z.array(text(100).refine(v=>v.length>0,'Invalid tag')).max(32),
 // Presentation metadata only. No Explorers follower relationship is created or implied,
 // which is why this is free text and not a number to be summed or compared.
 externalFollowerCountText:text(50).nullable(),
};
export const personEntityDetailsSchema=z.object(fields).strict().refine(v=>new TextEncoder().encode(JSON.stringify(v)).length<=8192,'Person details too large');

// A display override re-presents a *shared* entity for one owner. usernameHandle is
// excluded: a handle is how a person is identified on a platform, so letting one owner
// replace it would re-point everyone else's recommendation at a different person - the
// same hazard as appUrl for Apps and productUrl for Products. The name is overridable
// through the core title, which is per-owner presentation already.
const {usernameHandle:_identity,...overridable}=fields;
export const personDisplayFieldsSchema=z.object(overridable).partial().strict();

export const personEntityDtoSchema=z.object({id:z.string().uuid(),kind:z.literal('person'),title:z.string().trim().refine(v=>v.length>0&&Array.from(v).length<=500),details:personEntityDetailsSchema,origin:z.literal('manual'),suppressed:z.boolean()}).strict();
export const resolveManualPersonSchema=z.object({kind:z.literal('manual'),category:z.literal('people'),details:z.object(fields).partial().extend({title:personNameSchema}).strict()}).strict();

export type PersonEntityDetails=z.infer<typeof personEntityDetailsSchema>;
export type PersonEntityDto=z.infer<typeof personEntityDtoSchema>;
export type PersonSocialUrls=z.infer<typeof personSocialUrlsSchema>;

// Every field is nullable, so an absent person record has a representable empty value -
// the Books shape rather than the Apps one.
export const emptyPersonDetails=():PersonEntityDetails=>({usernameHandle:null,headline:null,locationText:null,avatarUrl:null,primaryPlatform:null,socialUrls:{},skillsTags:[],externalFollowerCountText:null});
export const emptyPersonDisplayFields=():z.infer<typeof personDisplayFieldsSchema>=>({});
