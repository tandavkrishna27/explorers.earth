import {createHash} from 'node:crypto';
import {appSnapshotSchema,appSelectedFieldsSchema,appSelectableFields,appCompleteOverridesSchema,appBindingSchema,appGenerationSchema,appEntitlementSchema,acceptAppEnrichmentSchema,type AppSnapshot,type AppSnapshotFields,type AppSelectedField} from '../../shared/explorersAppEnrichmentContract';
// Canonical JSON v1: recursively sort object keys, preserve array order, omit absent optional keys.
// Hash validated snapshot identity/content, excluding snapshot ID and its self-referential contentHash.
export function canonicalAppJson(value:unknown):string {
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonicalAppJson).join(',')+']';
 return '{'+Object.keys(value).sort().filter(k=>(value as Record<string,unknown>)[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonicalAppJson((value as Record<string,unknown>)[k])).join(',')+'}';
}
export function hashAppSnapshot(input:unknown):string {
 const {snapshotId:_id,contentHash:_hash,...payload}=appSnapshotSchema.parse(input);
 return createHash('sha256').update(canonicalAppJson(payload),'utf8').digest('hex');
}
export function selectAppSnapshotFields(input:unknown,selection:unknown):{acceptedFields:AppSelectedField[];acceptedValues:AppSnapshotFields} {
 const snapshot=appSnapshotSchema.parse(input),selected=appSelectedFieldsSchema.parse(selection);
 const acceptedFields=appSelectableFields.filter(k=>selected.includes(k));
 const acceptedValues:Record<string,unknown>={};
 for(const field of acceptedFields){if(!Object.prototype.hasOwnProperty.call(snapshot.fields,field))throw new AppAcceptanceValidationError('INVALID_INPUT','Selected field is unavailable');acceptedValues[field]=snapshot.fields[field];}
 return {acceptedFields,acceptedValues:acceptedValues as AppSnapshotFields};
}
export function mergeAppSnapshot(current:unknown,snapshot:unknown,selection:unknown){
 const normalizedCurrent=appCompleteOverridesSchema.parse(current);
 const {acceptedFields,acceptedValues}=selectAppSnapshotFields(snapshot,selection);
 const mergedValues=appCompleteOverridesSchema.parse({...normalizedCurrent,...acceptedValues});
 return {mergedValues,acceptedFields,acceptedValues,changed:canonicalAppJson(mergedValues)!==canonicalAppJson(normalizedCurrent)};
}
export class AppAcceptanceValidationError extends Error {
 constructor(public readonly code:'NOT_FOUND'|'CONFLICT'|'INVALID_INPUT',message:string){super(message);this.name='AppAcceptanceValidationError';}
}
export type AppAcceptanceContext={accountId:string;recommendationId:string;appEntityId:string;recommendationRevision:number;binding:unknown;generation:unknown;entitlement:unknown;snapshot:unknown;generationRetired:boolean};
// Caller resolves an active owned Apps recommendation under transaction locks before this pure fence.
// Fetch opt-in/publication eligibility and historical observed revision are intentionally not acceptance gates.
export function validateAppAcceptance(context:AppAcceptanceContext,input:unknown):AppSnapshot {
 const command=acceptAppEnrichmentSchema.parse(input),binding=appBindingSchema.parse(context.binding),generation=appGenerationSchema.parse(context.generation),entitlement=appEntitlementSchema.parse(context.entitlement),snapshot=appSnapshotSchema.parse(context.snapshot);
 const fail=(code:'NOT_FOUND'|'CONFLICT'|'INVALID_INPUT',message:string):never=>{throw new AppAcceptanceValidationError(code,message);};
 for(const value of [binding,generation,entitlement])if(value.accountId!==context.accountId||value.recommendationId!==context.recommendationId)fail('NOT_FOUND','Owned suggestion unavailable');
 if(command.expectedRecommendationRevision!==context.recommendationRevision||command.expectedBindingRevision!==binding.bindingRevision)fail('CONFLICT','Revision conflict');
 if(context.generationRetired||binding.currentGenerationId!==generation.generationId||generation.bindingId!==binding.bindingId||entitlement.generationId!==generation.generationId)fail('CONFLICT','Generation conflict');
 if([binding,generation,entitlement,snapshot].some(v=>v.appEntityId!==context.appEntityId))fail('CONFLICT','Entity conflict');
 if(command.snapshotId!==snapshot.snapshotId||entitlement.snapshotId!==snapshot.snapshotId)fail('NOT_FOUND','Owned snapshot unavailable');
 for(const key of ['sourceId','sourceIdentity','sourceIdentityHash','canonicalizationVersion'] as const)if(generation[key]!==snapshot[key])fail('INVALID_INPUT','Source identity mismatch');
 selectAppSnapshotFields(snapshot,command.selectedFields);
 return snapshot;
}
