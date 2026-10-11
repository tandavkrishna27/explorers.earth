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
