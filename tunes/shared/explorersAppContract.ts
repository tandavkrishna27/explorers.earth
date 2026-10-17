import {z} from 'zod/v3';
// Ticket 4.3. Apps has no provider: /itunes-api/search was retired, so every field here
// is owner-entered and there are no provider candidate, provenance or search schemas to
// mirror from Books or Movies. The two consequences worth knowing:
//
// 1. Every detail field is editable, so appDisplayFieldsSchema is the whole set rather
//    than a subset with provider-owned facts stripped out, as Books does with its rating.
// 2. appUrl is required, not nullable. 0043 declares app_url NOT NULL because the legacy
//    type and the target schema both do - an app without a link is not a recommendation
//    of an app - so the manual resolve schema requires it alongside the title. That is a
//    deliberate departure from the Books manual shape, where every detail is optional.
//
// platforms is bounded free text rather than a closed enum, matching book subjects. The
// add form offers a fixed list, but pinning that vocabulary in the contract would reject
// a platform the product adds later, and the database agrees: 0043 bounds the array
// length and leaves the members to the application.
const text=(max:number)=>z.string().trim().max(max).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v),'Invalid text');
export const appTitleSchema=text(1000).refine(v=>v.length>0&&Array.from(v).length<=500&&!/[\u0000-\u001f\u007f]/.test(v),'Invalid title');
// Matches safeBookUrlSchema exactly: http(s) only, no embedded credentials, no explicit
// port. 0043 carries the scheme CHECK as well, so an unsafe scheme is refused at both the
// API boundary and the storage layer.
export const safeAppUrlSchema=z.string().max(2048).url().refine(v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.port;}catch{return false;}},'Invalid URL');
export const appPriceTierSchema=z.enum(['Free','Freemium','Paid','Subscription']);
const fields={
 appUrl:safeAppUrlSchema,
 developer:text(200).nullable(),
 logoUrl:safeAppUrlSchema.nullable(),
 description:text(8192).nullable(),
 downloadUrl:safeAppUrlSchema.nullable(),
 priceTier:appPriceTierSchema.nullable(),
 platforms:z.array(text(100).refine(v=>v.length>0,'Invalid platform')).max(16),
};
export const appEntityDetailsSchema=z.object(fields).strict().refine(v=>new TextEncoder().encode(JSON.stringify(v)).length<=8192,'App details too large');
// A display override re-presents a *shared* entity for one owner, so appUrl is excluded:
// it is the app's identity, and letting one owner point a shared entity at a different URL
// would change what the thing is rather than how it reads. Books strips its provider-owned
// rating and ratings count for the same reason. Everything else is presentational and
// patchable, and the fields stay optional because an override patches rather than replaces.
const {appUrl:_identity,...overridable}=fields;
export const appDisplayFieldsSchema=z.object(overridable).partial().strict();
export const appEntityDtoSchema=z.object({id:z.string().uuid(),kind:z.literal('app'),title:z.string().trim().refine(v=>v.length>0&&Array.from(v).length<=500),details:appEntityDetailsSchema,origin:z.literal('manual')}).strict();
export const resolveManualAppSchema=z.object({kind:z.literal('manual'),category:z.literal('apps'),details:z.object(fields).partial().extend({title:appTitleSchema,appUrl:safeAppUrlSchema}).strict()}).strict();
// Screenshots are owned media, so the command carries media IDs rather than URLs. 0043
// bounds the relation at ten ordered slots and refuses anything that is not a ready owned
// recommendation image, which is the same contract book covers and movie media use.
export const appScreenshotsSchema=z.object({screenshotMediaIds:z.array(z.string().uuid()).max(10)}).strict();
export type AppEntityDetails=z.infer<typeof appEntityDetailsSchema>;
export type AppEntityDto=z.infer<typeof appEntityDtoSchema>;
export type AppPriceTier=z.infer<typeof appPriceTierSchema>;
export type AppScreenshots=z.infer<typeof appScreenshotsSchema>;
// appUrl has no empty value, so an absent App has no representable details row at all -
// unlike Books, whose emptyBookDetails() is all nulls. Callers compose details only once
// they hold a URL, which is what 0043's NOT NULL enforces.
export const emptyAppDisplayFields=():z.infer<typeof appDisplayFieldsSchema>=>({});
