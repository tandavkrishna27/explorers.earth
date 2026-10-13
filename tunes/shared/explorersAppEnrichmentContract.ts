import {z} from 'zod/v3';
import {appDisplayFieldsSchema,appTitleSchema,safeAppUrlSchema} from './explorersAppContract';
import {contentIdSchema,categoryContentRevisionSchema,displayTitleWriteSchema,displayOverridesSchema} from './explorersContract';
export const appEnrichmentRevisionSchema=z.number().int().positive().safe();
const label=z.string().min(1).max(2048); // Exact configured identity: deliberately no trimming or provider canonicalization.
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const timestamp=z.string().datetime({offset:true});
export const appSourceIdentitySchema=z.object({sourceId:label,sourceIdentity:label,sourceIdentityHash:hash,canonicalizationVersion:label}).strict();
export const appSourceChoiceSchema=z.object({identity:appSourceIdentitySchema,label:z.string().min(1).max(120).refine(v=>v.trim()===v&&!/[<>]/.test(v)&&!/[\u0000-\u001f\u007f-\u009f]/.test(v)&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v),'Invalid source label'),sourceUrl:safeAppUrlSchema.refine(v=>{try{return new URL(v).protocol==='https:'&&new URL(v).href===v;}catch{return false;}},'Canonical HTTPS source required')}).strict();
export type AppSourceChoice=z.infer<typeof appSourceChoiceSchema>;
export const appSelectableFields=['title','description','priceTier','platforms'] as const;
export const appSelectableFieldMap={displayName:'title',description:'description',priceTier:'priceTier',platforms:'platforms'} as const;
export const appSelectedFieldsSchema=z.array(z.enum(appSelectableFields)).max(4).refine(v=>new Set(v).size===v.length,'Duplicate field');
export const appSnapshotFieldsSchema=appDisplayFieldsSchema.pick({description:true,priceTier:true,platforms:true}).extend({title:appTitleSchema.pipe(displayTitleWriteSchema).optional()}).strict();
export const appCompleteOverridesSchema=appDisplayFieldsSchema.extend({title:displayTitleWriteSchema.nullable().optional()}).strict().pipe(displayOverridesSchema);
export const appFieldProvenanceSchema=z.object({sourceUrl:safeAppUrlSchema,observedAt:timestamp}).strict();
const provenance=z.object({title:appFieldProvenanceSchema.optional(),description:appFieldProvenanceSchema.optional(),priceTier:appFieldProvenanceSchema.optional(),platforms:appFieldProvenanceSchema.optional()}).strict();
const own=(value:object,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
export const appSnapshotSchema=appSourceIdentitySchema.extend({snapshotId:contentIdSchema,appEntityId:contentIdSchema,adapterVersion:label,fetchedAt:timestamp,contentHash:hash,fields:appSnapshotFieldsSchema,fieldProvenance:provenance}).strict().superRefine((v,ctx)=>{
 for(const key of appSelectableFields){if(own(v.fields,key)!==own(v.fieldProvenance,key)||own(v.fields,key)&&v.fields[key]===undefined||own(v.fieldProvenance,key)&&v.fieldProvenance[key]===undefined)ctx.addIssue({code:z.ZodIssueCode.custom,path:['fieldProvenance',key],message:'Every supplied field requires exactly matching provenance'});}
});
const owned={accountId:contentIdSchema,recommendationId:contentIdSchema,appEntityId:contentIdSchema};
export const appBindingSchema=z.object({...owned,bindingId:contentIdSchema,optIn:z.boolean(),bindingRevision:appEnrichmentRevisionSchema,currentGenerationId:contentIdSchema.nullable()}).strict();
export const appOwnerBindingSchema=appBindingSchema.extend({currentSource:appSourceIdentitySchema.nullable()}).superRefine((value,context)=>{if((value.currentGenerationId===null)!==(value.currentSource===null))context.addIssue({code:z.ZodIssueCode.custom,message:'Current generation requires its authoritative source'});});
export const appGenerationSchema=appSourceIdentitySchema.extend({...owned,generationId:contentIdSchema,bindingId:contentIdSchema,createdAt:timestamp}).strict();
// Retirement is separate from immutable generation identity. A rebind must allocate a new UUID.
export const appGenerationRetirementSchema=z.object({generationId:contentIdSchema,retiredAt:timestamp}).strict();
export const appEntitlementSchema=z.object({...owned,snapshotId:contentIdSchema,generationId:contentIdSchema,observedBindingRevision:appEnrichmentRevisionSchema}).strict();
const revisions={expectedRecommendationRevision:appEnrichmentRevisionSchema,expectedBindingRevision:appEnrichmentRevisionSchema};
export const configureAppEnrichmentSchema=appSourceIdentitySchema.extend({...revisions,expectedBindingRevision:appEnrichmentRevisionSchema.nullable(),operation:z.literal('configureAppEnrichment'),optIn:z.boolean()}).strict();
export const rebindAppEnrichmentSchema=appSourceIdentitySchema.extend({...revisions,operation:z.literal('rebindAppEnrichment'),optIn:z.boolean()}).strict();
export const disableAppEnrichmentSchema=z.object({...revisions,operation:z.literal('disableAppEnrichment')}).strict();
export const acceptAppEnrichmentSchema=z.object({...revisions,operation:z.literal('acceptAppEnrichment'),snapshotId:contentIdSchema,selectedFields:appSelectedFieldsSchema}).strict();
export const appEnrichmentCommandSchema=z.discriminatedUnion('operation',[configureAppEnrichmentSchema,rebindAppEnrichmentSchema,disableAppEnrichmentSchema,acceptAppEnrichmentSchema]);
export const appBindingResultSchema=z.object({recommendationId:contentIdSchema,bindingId:contentIdSchema,bindingGenerationId:contentIdSchema.nullable(),optIn:z.boolean(),bindingRevision:appEnrichmentRevisionSchema,recommendationRevision:appEnrichmentRevisionSchema,categoryContentRevision:categoryContentRevisionSchema,changed:z.boolean(),receiptId:contentIdSchema}).strict();
export const appAcceptanceResultSchema=z.object({recommendationId:contentIdSchema,snapshotId:contentIdSchema,bindingGenerationId:contentIdSchema,acceptedFields:appSelectedFieldsSchema,changed:z.boolean(),recommendationRevision:appEnrichmentRevisionSchema,categoryContentRevision:categoryContentRevisionSchema,receiptId:contentIdSchema}).strict();
export const appAcceptanceRecordSchema=z.object({acceptanceId:contentIdSchema,accountId:contentIdSchema,recommendationId:contentIdSchema,snapshotId:contentIdSchema,generationId:contentIdSchema,selectedFields:appSelectedFieldsSchema,acceptedValues:appSnapshotFieldsSchema,actorUserId:contentIdSchema,receiptId:contentIdSchema,acceptedAt:timestamp}).strict().superRefine((v,ctx)=>{if(appSelectableFields.some(k=>v.selectedFields.includes(k)!==own(v.acceptedValues,k)||own(v.acceptedValues,k)&&v.acceptedValues[k]===undefined))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Accepted values must exactly match selected fields'});});
export type AppSnapshot=z.infer<typeof appSnapshotSchema>;
export type AppBinding=z.infer<typeof appBindingSchema>;
export type AppOwnerBinding=z.infer<typeof appOwnerBindingSchema>;
export type AppGeneration=z.infer<typeof appGenerationSchema>;
export type AppEntitlement=z.infer<typeof appEntitlementSchema>;
export type AppSelectedField=typeof appSelectableFields[number];
export type AppSnapshotFields=z.infer<typeof appSnapshotFieldsSchema>;
