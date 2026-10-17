import {z} from 'zod/v3';

/** Places/People catalog contracts. Parsing grants neither import authority nor
 * provider provenance; the importer must also lock and validate existing rows. */
export const taxonomyCategorySchema=z.enum(['places','people']);
const identity=z.string().uuid().refine(v=>v===v.toLowerCase(),'Canonical lowercase UUID required');
const locale=z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/);
const text=(max:number)=>z.string().min(1).max(max).refine(v=>v.trim().length>0&&!/[\u0000-\u001f\u007f]/.test(v)&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v),'Invalid text');
const slug=text(100).refine(v=>v===v.trim()&&!/[/?#\s]/.test(v),'Invalid slug');
export const taxonomyTermSchema=z.object({
 id:identity,category:taxonomyCategorySchema,slug,parentId:identity.nullable(),
 position:z.number().int().nonnegative().safe(),active:z.boolean(),
 labels:z.record(locale,text(200)).refine(v=>Object.keys(v).length>0,'Missing labels'),
}).strict();
const sourceMappingSchema=z.object({
 sourceHost:z.string().max(253).regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),
 entityKind:text(200),documentId:text(500),termId:identity,
}).strict();
const legacyMappingSchema=z.object({legacySlug:slug,termId:identity}).strict();
export const taxonomyImportSchema=z.object({
 version:z.literal('explorers-taxonomy-import/v1'),catalogVersion:z.number().int().positive().safe(),
 category:taxonomyCategorySchema,defaultLocale:locale,
 terms:z.array(taxonomyTermSchema),sourceMappings:z.array(sourceMappingSchema),
 legacySlugMappings:z.array(legacyMappingSchema),
}).strict().superRefine((value,ctx)=>{
 const reject=(message:string)=>ctx.addIssue({code:z.ZodIssueCode.custom,message});
 const terms=new Map<string,z.infer<typeof taxonomyTermSchema>>();const slugs=new Set<string>();
 for(const term of value.terms){
  if(terms.has(term.id)||slugs.has(term.slug))reject('Duplicate term identity or slug');
  terms.set(term.id,term);slugs.add(term.slug);
  if(term.category!==value.category)reject('Category mismatch');
  if(!Object.prototype.hasOwnProperty.call(term.labels,value.defaultLocale))reject('Missing default label');
 }
 for(const term of value.terms){
  if(term.parentId===null)continue;
  const parent=terms.get(term.parentId);
  if(value.category==='people'||!parent||parent.id===term.id||parent.category!==term.category||parent.parentId!==null)
   reject('Unsupported parent hierarchy');
 }
 const mappings=new Set<string>();
 for(const mapping of value.sourceMappings){
  const key=JSON.stringify([mapping.sourceHost,mapping.entityKind,mapping.documentId]);
  if(mappings.has(key)||!terms.has(mapping.termId))reject('Duplicate or dangling source mapping');
  mappings.add(key);
 }
 const aliases=new Set<string>();
 for(const mapping of value.legacySlugMappings){
  if(aliases.has(mapping.legacySlug)||!terms.has(mapping.termId))reject('Duplicate or dangling legacy mapping');
  if(slugs.has(mapping.legacySlug)&&value.terms.find(t=>t.slug===mapping.legacySlug)?.id!==mapping.termId)
   reject('Legacy mapping conflicts with canonical slug');
  aliases.add(mapping.legacySlug);
 }
});
export const placesTaxonomyAssignmentSchema=z.object({categoryTermId:identity.nullable(),subcategoryTermId:identity.nullable()})
 .strict().refine(v=>(v.categoryTermId!==null||v.subcategoryTermId===null)&&(v.subcategoryTermId===null||v.categoryTermId!==v.subcategoryTermId),'Child requires distinct root');
export const peopleSectorAssignmentSchema=identity.nullable();
export type TaxonomyImport=z.infer<typeof taxonomyImportSchema>;
export type TaxonomyTerm=z.infer<typeof taxonomyTermSchema>;

export type PlacesTaxonomyAssignment=z.infer<typeof placesTaxonomyAssignmentSchema>;
export type TaxonomyAssignmentInput={placesTaxonomy?:PlacesTaxonomyAssignment;peopleSectorTermId?:string|null};
export const taxonomyCatalogQuerySchema=z.object({category:taxonomyCategorySchema,locale:locale.optional(),limit:z.string().regex(/^(?:[1-9]|1[0-9]|2[0-4])$/).transform(Number).optional().default('24'),cursor:z.string().min(1).max(4096).regex(/^[A-Za-z0-9_-]+$/).optional()}).strict();
export const taxonomyCatalogItemSchema=z.object({id:identity,category:taxonomyCategorySchema,slug,parentId:identity.nullable(),position:z.number().int().nonnegative().safe(),label:text(200),resolvedLocale:locale}).strict();
export const taxonomyCatalogPageSchema=z.object({version:z.literal('explorers-taxonomy-catalog/v1'),category:taxonomyCategorySchema,state:z.enum(['CONFIGURED','UNCONFIGURED']),catalogVersion:z.number().int().nonnegative().safe(),requestedLocale:locale.nullable(),defaultLocale:locale.nullable(),items:z.array(taxonomyCatalogItemSchema).max(24),nextCursor:z.string().min(1).max(4096).nullable()}).strict().superRefine((v,c)=>{if(v.state==='UNCONFIGURED'?(v.catalogVersion!==0||v.defaultLocale!==null||v.items.length!==0||v.nextCursor!==null):(v.catalogVersion===0||v.defaultLocale===null))c.addIssue({code:z.ZodIssueCode.custom,message:'Invalid catalog state'});if(v.items.some(i=>i.category!==v.category||i.resolvedLocale!==v.defaultLocale&&i.resolvedLocale!==v.requestedLocale))c.addIssue({code:z.ZodIssueCode.custom,message:'Invalid catalog item'});});
export type TaxonomyCatalogPage=z.infer<typeof taxonomyCatalogPageSchema>;
export const taxonomySelectionReadSchema=z.object({id:identity,slug,label:text(200).nullable(),unavailable:z.boolean()}).strict();
const catalogRead={catalogState:z.enum(['CONFIGURED','UNCONFIGURED']),catalogVersion:z.number().int().nonnegative().safe(),defaultLocale:locale.nullable()};
export const placesTaxonomyReadSchema=z.object({...catalogRead,category:taxonomySelectionReadSchema.nullable(),subcategory:taxonomySelectionReadSchema.nullable(),selectionUnavailable:z.boolean()}).strict();
export const peopleSectorReadSchema=z.object({...catalogRead,sector:taxonomySelectionReadSchema.nullable(),selectionUnavailable:z.boolean()}).strict();
