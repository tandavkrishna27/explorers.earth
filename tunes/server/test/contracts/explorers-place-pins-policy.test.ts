import {describe,it,expect} from 'vitest';
import {resolvePlacePinsPolicy,placePinsPolicySchema} from '../../application/placePinsPolicy';
import {PlacePinsBoundary,PlacePinsFailure} from '../../application/placePinsBoundary';
import type {Actor} from '../../application/actor';
import {authorizeOperation} from '../../application/authorization';
// Synthetic contract inputs only; these values are not approved production policy.
export const syntheticPolicy={policyId:'synthetic-contract',policyVersion:1,transportChunkBytes:4096,transportChunkIds:32,replacementBytes:8192,replacementIds:64,ownerDraftQuota:2,ownerStagingBytes:32768,draftExpiryMs:1000,stagingRetentionMs:2000,receiptRetentionMs:4000,commitProcessingBytes:32768,commitProcessingMs:100,commitWorkUnits:1000,cleanupBatchSize:2,cleanupWorkUnits:10};
const actor:Actor={accountId:'a',userId:'u',role:'owner',credential:{kind:'oauth',grantId:'g',scopes:['collections:write','recommendations:write']}};
describe('Explicit unavailable Places pin policy',()=>{
 it('requires every field and rejects invalid finite safe positive bounds',()=>{
  expect(resolvePlacePinsPolicy(undefined).state).toBe('unconfigured');
  for(const key of Object.keys(syntheticPolicy)){const value={...syntheticPolicy};delete (value as any)[key];expect(resolvePlacePinsPolicy(value).state).toBe('unsupported');}
  for(const key of Object.keys(syntheticPolicy).filter(k=>k!=='policyId'))for(const bad of [0,-1,Infinity,NaN,2**53,0.5])expect(placePinsPolicySchema.safeParse({...syntheticPolicy,[key]:bad}).success).toBe(false);
  for(const change of [{replacementBytes:65537},{transportChunkBytes:9000},{ownerStagingBytes:100},{stagingRetentionMs:999},{receiptRetentionMs:1999},{commitProcessingBytes:100},{cleanupWorkUnits:1}])expect(resolvePlacePinsPolicy({...syntheticPolicy,...change}).state).toBe('unsupported');
  for(const change of [{policyId:''},{policyId:'contains whitespace'},{unexpected:true},{transportChunkIds:4096},{replacementIds:8192}])expect(resolvePlacePinsPolicy({...syntheticPolicy,...change}).state).toBe('unsupported');
 });
 it('valid configuration never enables absent storage and authorization precedes validation',async()=>{
  const scopes:string[]=[];const boundary=new PlacePinsBoundary(async(_a,s)=>{scopes.push(s);},syntheticPolicy);
  const request={operation:'replacePlacePins',collectionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',body:{expectedCollectionRevision:1,expectedCategoryContentRevision:'0',orderedRecommendationIds:[]}};
  await expect(boundary.execute(actor,request,{requestId:'r',idempotencyKey:'valid-key'},100)).rejects.toMatchObject({status:503,code:'UNAVAILABLE'});
  expect(scopes).toEqual(['collections:write','recommendations:write']);
  await expect(boundary.execute(actor,request,{requestId:'r'},100)).rejects.toMatchObject({status:422});
  await expect(boundary.execute(actor,request,{requestId:'r',idempotencyKey:'valid-key'},8193)).rejects.toMatchObject({status:413});
  const forbidden=new PlacePinsBoundary(async()=>{throw new PlacePinsFailure(403,'FORBIDDEN','denied');});
  await expect(forbidden.execute(actor,{}, {requestId:'r'},1)).rejects.toMatchObject({status:403});
 });
 it('reports stable configuration state without exposing quota values',async()=>{
  for(const [policy,state] of [[undefined,'unconfigured'],[{},'unsupported'],[syntheticPolicy,'configured']] as const){const boundary=new PlacePinsBoundary(async()=>{},policy);expect(await boundary.execute(actor,{operation:'placePinsAvailability',collectionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},{requestId:'r'},0)).toEqual({available:false,state,reason:'STORAGE_UNAVAILABLE'});}
 });
 it('treats synthetic request and chunk limits as resource budgets rather than a fifteen-pin cap',async()=>{
  const boundary=new PlacePinsBoundary(async()=>{},syntheticPolicy);
  const ids=(n:number)=>Array.from({length:n},(_,i)=>`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`);
  const replacement=(n:number)=>({operation:'replacePlacePins',collectionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',body:{expectedCollectionRevision:1,expectedCategoryContentRevision:'0',orderedRecommendationIds:ids(n)}});
  await expect(boundary.execute(actor,replacement(16),{requestId:'r',idempotencyKey:'valid-key'},1000)).rejects.toMatchObject({status:503,code:'UNAVAILABLE'});
  await expect(boundary.execute(actor,replacement(65),{requestId:'r',idempotencyKey:'valid-key'},3000)).rejects.toMatchObject({status:413});
  const chunk={operation:'appendPlacePinsChunk',collectionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',draftId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',chunkIndex:0,body:{recommendationIds:ids(33),chunkHash:'0'.repeat(64)}};
  await expect(boundary.execute(actor,chunk,{requestId:'r',idempotencyKey:'valid-key'},2000)).rejects.toMatchObject({status:413});
  await expect(boundary.execute(actor,{...chunk,body:{recommendationIds:[],chunkHash:'0'.repeat(64)}},{requestId:'r',idempotencyKey:'valid-key'},4097)).rejects.toMatchObject({status:413});
 });
 it('uses the actual operation authority to reject missing scopes and expired session epochs',async()=>{
  let queries=0;const db:any={query:async()=>{queries++;return {rows:[{status:'active',role:'owner',session_version:'2',blocked_at:null,valid:true}]};}};
  const boundary=new PlacePinsBoundary((a,scope)=>authorizeOperation(db,a,scope,a.accountId));
  const request={operation:'replacePlacePins',collectionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',body:{expectedCollectionRevision:1,expectedCategoryContentRevision:'0',orderedRecommendationIds:[]}};
  const limited:Actor={...actor,credential:{kind:'oauth',grantId:'g',scopes:['collections:write']}};
  await expect(boundary.execute(limited,request,{requestId:'r',idempotencyKey:'valid-key'},100)).rejects.toMatchObject({status:403});expect(queries).toBe(1);
  const expired:Actor={...actor,credential:{kind:'web-session',sessionId:'s',sessionVersion:1}};
  await expect(boundary.execute(expired,request,{requestId:'r',idempotencyKey:'valid-key'},100)).rejects.toMatchObject({status:401});expect(queries).toBe(2);
 });
});
