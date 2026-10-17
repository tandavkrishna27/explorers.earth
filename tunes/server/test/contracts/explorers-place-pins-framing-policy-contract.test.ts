import type {Pool} from 'pg';
import {ExplorersPlacePinsRepository} from '../../repositories/explorersPlacePinsRepository';
import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import * as framing from '../../../shared/explorersPlacePinsFraming';
import {placePinsAvailabilitySchema,placePinsDraftSchema,placePinsClientTransportSchema} from '../../../shared/explorersPlacePinsContract';
import {clientPlacePinsTransport} from '../../application/placePinsPolicy';
import {hashPlacePinsRequest,PlacePinsBoundary,createPlacePinsSequenceHasher,hashPlacePinsChunk} from '../../application/placePinsBoundary';
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const transport={policyId:'synthetic',policyVersion:1,replacementBytes:4096,replacementIds:80,transportChunkBytes:1024,transportChunkIds:20,ownerStagingBytes:20000,commitProcessingBytes:40000,commitProcessingMs:1000,commitWorkUnits:1000,draftExpiryMs:1000};
const policy={...transport,ownerDraftQuota:5,receiptRetentionMs:2000,stagingRetentionMs:1000,cleanupBatchSize:5,cleanupWorkUnits:5};
const digest=(parts:Iterable<Uint8Array>)=>{const hash=createHash('sha256');for(const part of parts)hash.update(part);return hash.digest('hex');};
describe('portable Places framing and strict policy advertisement',()=>{
 it('preserves independently frozen existing v1 vectors',()=>{
  expect(digest(framing.placePinsSequenceFragments([]))).toBe('0a169203c8873dba692c90eab522d385f6e34829ac5920c0b1c258a3ade75c14');
  expect(digest(framing.placePinsSequenceFragments([a.toUpperCase(),b]))).toBe('86407931e8dacd393e6096bfa06bef16d3ceb57e695ec7b2a364ff9d52da04b7');
  expect(digest(framing.placePinsChunkFragments(0,[a,b]))).toBe('10992bc7c58b5b46821a94a44205f2ad844ea53dd85c5b3508ab3ee75cef1cf0');
 });
 it('binds order and chunk index and preserves 70-item partition independence',()=>{
  const ids=Array.from({length:70},(_,i)=>`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`);
  // Literal captured by original server adapter in RED, before framing refactor.
  const expected='073f9f30b3dec3a4ec54a242ecb5acd8136421b4de1a47d94c10fb2e98b29c63';
  expect(digest(framing.placePinsSequenceFragments(ids))).toBe(expected);
  for(const size of [1,7,20,70]){const hash=createPlacePinsSequenceHasher();for(let i=0;i<70;i+=size)hash.append(ids.slice(i,i+size));expect(hash.finish()).toBe(expected);}
  expect(digest(framing.placePinsSequenceFragments([b,a]))).not.toBe(digest(framing.placePinsSequenceFragments([a,b])));
  expect(digest(framing.placePinsChunkFragments(1,[a,b]))).toBe(hashPlacePinsChunk(1,[a,b]));
  expect(hashPlacePinsChunk(0,[a,b])).not.toBe(hashPlacePinsChunk(1,[a,b]));
  expect(framing.placePinsFramingBytes(70)).toBe([...framing.placePinsSequenceFragments(ids)].reduce((n,p)=>n+p.byteLength,0));
 });
 it('rejects malformed UUIDs, unsafe arithmetic and chunk indices',()=>{
  expect(()=>[...framing.placePinsSequenceFragments(['bad'])]).toThrow();
  for(const count of [-1,0.5,Number.MAX_SAFE_INTEGER])expect(()=>framing.placePinsFramingBytes(count)).toThrow();
  for(const index of [-1,0.5,Infinity])expect(()=>[...framing.placePinsChunkFragments(index,[])]).toThrow();
 });
 it('requires configured strict transport and exposes only client dimensions',()=>{
  expect(placePinsAvailabilitySchema.safeParse({available:true,state:'configured'}).success).toBe(false);
  expect(placePinsAvailabilitySchema.parse({available:true,state:'configured',clientTransport:transport})).toEqual({available:true,state:'configured',clientTransport:transport});
  for(const state of ['unconfigured','unsupported'])expect(placePinsAvailabilitySchema.safeParse({available:false,state,reason:'STORAGE_UNAVAILABLE',clientTransport:transport}).success).toBe(false);
  expect(placePinsAvailabilitySchema.safeParse({available:true,state:'configured',clientTransport:{...transport,ownerDraftQuota:5}}).success).toBe(false);
  expect(clientPlacePinsTransport({...transport,ownerDraftQuota:5,receiptRetentionMs:2000,stagingRetentionMs:1000,cleanupBatchSize:5,cleanupWorkUnits:5})).toEqual(transport);
 });
 it.each([{replacementBytes:65537},{transportChunkBytes:4097},{transportChunkIds:81},
  {ownerStagingBytes:4095},{commitProcessingBytes:19999},{transportChunkBytes:779},
  {replacementBytes:3119},{replacementIds:Number.MAX_SAFE_INTEGER}])('rejects incoherent advertised transport %j',change=>{
  expect(placePinsClientTransportSchema.safeParse({...transport,...change}).success).toBe(false);
 });
 it('accepts the exact parser ceiling when configured staging and processing are coherent',()=>{
  expect(placePinsClientTransportSchema.safeParse({...transport,replacementBytes:65536,ownerStagingBytes:65536,commitProcessingBytes:65536}).success).toBe(true);
 });
 it('unknown policy and missing storage expose no operational values',async()=>{
  const actor={userId:a,accountId:b,role:'owner' as const,credential:{kind:'web-session' as const,sessionId:a,sessionVersion:1}};
  const request={operation:'placePinsAvailability',collectionId:a};
  for(const [input,state] of [[undefined,'unconfigured'],[{policyId:'unknown'},'unsupported'],[policy,'configured']] as const){
   const boundary=new PlacePinsBoundary(async()=>{},input);
   expect(await boundary.execute(actor,request,{requestId:a},0)).toEqual({available:false,state,reason:'STORAGE_UNAVAILABLE'});
  }
  const boundary=new PlacePinsBoundary(async()=>{},policy,{execute:async()=>{throw new Error('Must not enter storage');}});
  await expect(boundary.execute(actor,request,{requestId:a},65537)).rejects.toMatchObject({status:413,code:'RESOURCE_TOO_LARGE'});
  await expect(boundary.execute(actor,{...request,ownerId:b},{requestId:a},0)).rejects.toMatchObject({status:422,code:'INVALID_INPUT'});
 });
 it('advertises fresh begin captured policy and replays original response unchanged',async()=>{
  // Inert SQL seam: only deterministic responses, no PG, locks, timers or resources.
  let captured:unknown,receipt:unknown,owned=true;
  const request={operation:'beginPlacePinsDraft' as const,collectionId:a,body:{expectedCollectionRevision:1,expectedCategoryContentRevision:'0'}};
  const db={release(){},async query(sql:string,args?:unknown[]){
   if(sql==='SELECT clock_timestamp() AS command_clock')return {rows:[{command_clock:new Date()}]};
   if(sql.startsWith('SELECT status FROM creator_accounts'))return {rows:[{status:'active'}]};
   if(sql.startsWith('SELECT request_hash,response,status'))return {rows:receipt?[{request_hash:createHash('sha256').update('unused').digest(),response:receipt,status:'completed',replayable:true}]:[]};
   if(sql.startsWith('SELECT id,category,revision,archived_at'))return {rows:owned?[{id:a,category:'places',revision:'1',archived_at:null}]:[]};
   if(sql.startsWith('SELECT coalesce((SELECT revision'))return {rows:[{revision:'0'}]};
   if(sql.startsWith('SELECT count(*) FILTER'))return {rows:[{drafts:'0',bytes:'0'}]};
   if(sql.startsWith('INSERT INTO place_pin_drafts')){captured=JSON.parse(String(args![7]));return {rows:[{expires_at:new Date('2026-10-12T10:00:00.000Z')}]};}
   if(sql.startsWith('INSERT INTO application_command_receipts'))receipt=JSON.parse(String(args![4]));
   return {rows:[]};
  }};
  const repository=new ExplorersPlacePinsRepository({connect:async()=>db} as unknown as Pool);
  expect(await repository.execute(b,{operation:'placePinsAvailability',collectionId:a},{requestId:a},0,policy)).toEqual({available:true,state:'configured',clientTransport:transport});
  const result=await repository.execute(b,request,{requestId:a,idempotencyKey:'synthetic-begin-1'},50,policy);
  expect(result).toMatchObject({collectionId:a,...request.body,expiresAt:'2026-10-12T10:00:00.000Z',policyId:'synthetic',policyVersion:1,clientTransport:transport});
  expect(captured).toEqual(policy);expect(receipt).toEqual(result);
  owned=false;
  await expect(repository.execute(b,{operation:'placePinsAvailability',collectionId:a},{requestId:a},0,policy)).rejects.toMatchObject({status:404});
  owned=true;
  // Replay must use the exact saved legacy JSON, even under a newer configured policy.
  const legacy={collectionId:a,draftId:b,...request.body,expiresAt:'2026-10-12T10:00:00.000Z',policyId:'synthetic',policyVersion:1};
  receipt=legacy;
  const replayDb={...db,async query(sql:string,args?:unknown[]){
   if(sql.startsWith('SELECT request_hash,response,status'))return {rows:[{request_hash:Buffer.from(hashPlacePinsRequest(request),'hex'),response:legacy,status:'completed',replayable:true}]};
   return db.query(sql,args);
  }};
  const replayRepository=new ExplorersPlacePinsRepository({connect:async()=>replayDb} as unknown as Pool);
  expect(await replayRepository.execute(b,request,{requestId:a,idempotencyKey:'synthetic-begin-1'},50,{...policy,policyVersion:2})).toBe(legacy);
 });
 it('preserves exact strict old draft receipt and validates new snapshot identity',()=>{
  const legacy={collectionId:a,draftId:b,expectedCollectionRevision:1,expectedCategoryContentRevision:'0',expiresAt:'2026-10-12T10:00:00.000Z',policyId:'synthetic',policyVersion:1};
  expect(placePinsDraftSchema.parse(legacy)).toEqual(legacy);
  expect(placePinsDraftSchema.parse({...legacy,clientTransport:transport})).toEqual({...legacy,clientTransport:transport});
  expect(placePinsDraftSchema.safeParse({...legacy,clientTransport:{...transport,policyVersion:2}}).success).toBe(false);
 });
});
