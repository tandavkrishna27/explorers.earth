/** Build-only trusted schema entry. The thread never imports TypeScript or a supplied validator. */
import {appSnapshotFieldsSchema,appSourceIdentitySchema} from '../../shared/explorersAppEnrichmentContract';
import {z} from 'zod/v3';
export const validateAppDecoderFields=(fields:unknown)=>appSnapshotFieldsSchema.parse(fields);
export const validateAppDecoderIdentity=(identity:unknown)=>appSourceIdentitySchema.parse(identity);
export const validateAppDecoderObservedAt=(observedAt:unknown)=>z.string().datetime({offset:true}).parse(observedAt);
