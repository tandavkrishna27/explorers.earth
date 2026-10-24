import type {Pool,PoolClient} from 'pg';
import {sampleSeedingReceiptDtoSchema,type SampleFixtureSet,type SampleSeedingReceiptDto} from '../../shared/explorersSampleContract';
import {RecommendationFailure} from './explorersRecommendationRepository';

export async function readSampleReceipts(db:Pick<Pool,'query'>,accountId:string):Promise<SampleSeedingReceiptDto[]>{
 return (await db.query(`SELECT sample_key,category,fixture_set,fixture_version,collection_id,seeded_at,claimed_at
  FROM sample_seeding_receipts WHERE account_id=$1 ORDER BY sample_key`,[accountId])).rows.map(r=>sampleSeedingReceiptDtoSchema.parse({
  sampleKey:r.sample_key,category:r.category,fixtureSet:r.fixture_set,fixtureVersion:r.fixture_version,collectionId:r.collection_id,
  seededAt:(r.seeded_at as Date).toISOString(),claimedAt:r.claimed_at?(r.claimed_at as Date).toISOString():null}));
}

/** false = this key was seeded for this account before; the caller rolls back the list it just created. */
export async function recordSampleSeeded(db:PoolClient,input:{accountId:string;sampleKey:string;category:string;fixtureSet:SampleFixtureSet;fixtureVersion:string;collectionId:string}):Promise<boolean>{
 const result=await db.query(`INSERT INTO sample_seeding_receipts(account_id,sample_key,category,fixture_set,fixture_version,collection_id)
  VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(account_id,sample_key) DO NOTHING`,
  [input.accountId,input.sampleKey,input.category,input.fixtureSet,input.fixtureVersion,input.collectionId]);
 return result.rowCount===1;
}

/** SMP-04 Make it mine: in place, no copy. Clears the flag on the list and its items. */
export async function claimSample(db:PoolClient,accountId:string,collectionId:string):Promise<void>{
 const row=(await db.query('UPDATE collections SET is_sample=false,updated_at=now() WHERE id=$1 AND account_id=$2 AND is_sample RETURNING id',[collectionId,accountId])).rows[0];
 if(!row)throw new RecommendationFailure(404,'Resource unavailable');
 await db.query(`UPDATE recommendations r SET is_sample=false FROM collection_items i
  WHERE i.collection_id=$1 AND i.account_id=$2 AND r.id=i.recommendation_id AND r.account_id=$2 AND r.is_sample`,[collectionId,accountId]);
 await db.query('UPDATE sample_seeding_receipts SET claimed_at=now() WHERE account_id=$1 AND collection_id=$2 AND claimed_at IS NULL',[accountId,collectionId]);
}

export async function isSampleCollection(db:Pick<Pool,'query'>,accountId:string,collectionId:string):Promise<boolean>{
 return (await db.query('SELECT 1 FROM collections WHERE id=$1 AND account_id=$2 AND is_sample',[collectionId,accountId])).rowCount===1;
}
