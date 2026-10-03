import { canonical, exactFields, identityKey, validatePlan } from './browser-shard-plan.mjs';
const fail = message => {throw new Error(message);};
/** Caller must obtain expectedProducer through trusted orchestration, not receipt claims.
 * Hashes bind contents but are not signatures; this pure function does not authenticate artifacts.
 */
export function validateReceipts(plan, receipts, expectedProducer) {
  validatePlan(plan);
  exactFields(expectedProducer,['repository','workflow','runId','attempt','event','ref','shardJobs'],'producer');
  if(['repository','workflow','runId','event','ref'].some(k=>typeof expectedProducer[k]!=='string'||!expectedProducer[k])||!Number.isSafeInteger(expectedProducer.attempt)||expectedProducer.attempt<1)fail('Invalid trusted producer');
  exactFields(expectedProducer.shardJobs,plan.shards.map(s=>String(s.index)),'trusted shard job mapping');
  if(Object.values(expectedProducer.shardJobs).some(j=>typeof j!=='string'||!j)||new Set(Object.values(expectedProducer.shardJobs)).size!==plan.shards.length)fail('Invalid trusted job mapping');
  if(!Array.isArray(receipts)||receipts.length!==plan.shards.length)fail('Missing/extra shard');
  const seen=new Set();let count=0;
  for(const receipt of receipts){
    exactFields(receipt,['schemaVersion','planHash','assignmentHash','shard','jobId','provenance','producer','conclusion','cleanup','results'],'receipt');
    if(receipt.schemaVersion!==plan.schemaVersion||!Number.isSafeInteger(receipt.shard)||receipt.shard<1||receipt.shard>plan.shards.length||seen.has(receipt.shard))fail('Invalid/duplicate shard');seen.add(receipt.shard);
    const assignment=plan.shards[receipt.shard-1];
    if(receipt.jobId!==expectedProducer.shardJobs[receipt.shard]||receipt.planHash!==plan.planHash||receipt.assignmentHash!==assignment.assignmentHash||canonical(receipt.provenance)!==canonical(plan.provenance)||canonical(receipt.producer)!==canonical(expectedProducer))fail('Receipt provenance mismatch');
    if(receipt.conclusion!=='success'||receipt.cleanup!=='passed')fail('Shard did not finish cleanly');
    if(!Array.isArray(receipt.results)||receipt.results.length!==assignment.identities.length)fail('Execution inventory mismatch');
    const expected=new Set(assignment.identities.map(identityKey)),actual=new Set();
    for(const result of receipt.results){
      exactFields(result,['identity','expectedStatus','status','attempts'],'result');const key=identityKey(result.identity);
      if(!expected.has(key)||actual.has(key))fail('Unknown/duplicate execution identity');actual.add(key);
      if(result.expectedStatus!=='passed'||result.status!=='passed'||!Array.isArray(result.attempts)||result.attempts.length!==1)fail('Skipped/failed/flaky/retried result');
      const attempt=result.attempts[0];exactFields(attempt,['retry','status'],'attempt');if(attempt.retry!==0||attempt.status!=='passed')fail('Not an attempt-zero pass');count++;
    }
  }
  return {passed:true,identities:count,shards:seen.size};
}
