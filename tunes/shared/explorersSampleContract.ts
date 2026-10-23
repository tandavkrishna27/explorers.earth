import {z} from 'zod/v3';
import {contentIdSchema} from './explorersContract';

// SMP-01..10. Samples are the account's own lists flagged is_sample (0071). Storage makes a
// sample unpublishable (CHECKs), receipts make seeding idempotent forever: a receipt for a key
// means that key is never seeded again, whether the list was kept, made mine or deleted.
export const SAMPLE_FIXTURE_SETS=['india','global'] as const;
export const SAMPLE_PUBLISH_REFUSAL="Samples can't be published";
export const sampleFixtureSetSchema=z.enum(SAMPLE_FIXTURE_SETS);
export const sampleFixtureVersionSchema=z.string().regex(/^v[0-9]{1,4}$/);
export const sampleCategorySchema=z.enum(['places','guides','movies','books','games','apps','products','people']);
export const sampleKeySchema=z.string().min(3).max(120).regex(/^[a-z]+\/[a-z0-9]+(-[a-z0-9]+)*$/)
 .refine(v=>sampleCategorySchema.safeParse(v.split('/')[0]).success,'Unknown sample category');
export const sampleSeedingReceiptDtoSchema=z.object({
 sampleKey:sampleKeySchema,category:sampleCategorySchema,fixtureSet:sampleFixtureSetSchema,fixtureVersion:sampleFixtureVersionSchema,
 collectionId:contentIdSchema.nullable(),seededAt:z.string().datetime(),claimedAt:z.string().datetime().nullable(),
}).strict();
export const makeSampleMineSchema=z.object({collectionId:contentIdSchema,expectedRevision:z.number().int().positive().safe()}).strict();
export function sampleCountryToFixtureSet(country:string|null|undefined):SampleFixtureSet{
 const c=country?.trim().toUpperCase();
 return c==='IN'||c==='IND'||c==='INDIA'||c==='BHARAT'?'india':'global';
}
export type SampleFixtureSet=z.infer<typeof sampleFixtureSetSchema>;
export type SampleKey=z.infer<typeof sampleKeySchema>;
export type SampleSeedingReceiptDto=z.infer<typeof sampleSeedingReceiptDtoSchema>;
export type MakeSampleMineInput=z.input<typeof makeSampleMineSchema>;
