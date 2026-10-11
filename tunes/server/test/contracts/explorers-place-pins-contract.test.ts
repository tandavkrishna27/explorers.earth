import {describe,it,expect} from 'vitest';
import {placePinsBodies,placePinsRequestSchema,placePinsResultSchema,placePinsAvailabilitySchema} from '../../../shared/explorersPlacePinsContract';
import {hashPlacePinsRequest,hashPlacePinsChunk,createPlacePinsSequenceHasher} from '../../application/placePinsBoundary';
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const fences={expectedCollectionRevision:1,expectedCategoryContentRevision:'0'};
describe('Places pin syntax and canonical digests',()=>{
 it('preserves unavailable results and permits only strict configured storage availability',()=>{
  for(const state of ['configured','unconfigured','unsupported'])expect(placePinsAvailabilitySchema.safeParse({available:false,state,reason:'STORAGE_UNAVAILABLE'}).success).toBe(true);
  expect(placePinsAvailabilitySchema.parse({available:true,state:'configured'})).toEqual({available:true,state:'configured'});
  for(const result of [{available:true,state:'unconfigured'},{available:true,state:'configured',reason:'STORAGE_UNAVAILABLE'},{available:false,state:'configured'}])expect(placePinsAvailabilitySchema.safeParse(result).success).toBe(false);
 });
 it('accepts empty clear and more than fifteen without a product cap',()=>{
  expect(placePinsBodies.replacePlacePins.parse({...fences,orderedRecommendationIds:[]}).orderedRecommendationIds).toEqual([]);
  const ids=Array.from({length:16},(_,i)=>`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`);
  expect(placePinsBodies.replacePlacePins.parse({...fences,orderedRecommendationIds:ids}).orderedRecommendationIds).toHaveLength(16);
 });
 it('rejects duplicate normalized IDs, unknown fields, malformed fences, counts and hashes',()=>{
  for(const input of [{...fences,orderedRecommendationIds:[a,a.toUpperCase()]},{...fences,orderedRecommendationIds:[],category:'places'},{...fences,expectedCollectionRevision:0,orderedRecommendationIds:[]},{...fences,expectedCategoryContentRevision:'01',orderedRecommendationIds:[]}])expect(placePinsBodies.replacePlacePins.safeParse(input).success).toBe(false);
  for(const input of [{totalCount:-1,sequenceHash:'0'.repeat(64)},{totalCount:2**53,sequenceHash:'0'.repeat(64)},{totalCount:0,sequenceHash:'A'.repeat(64)}])expect(placePinsBodies.commitPlacePinsDraft.safeParse(input).success).toBe(false);
  expect(placePinsRequestSchema.safeParse({operation:'appendPlacePinsChunk',collectionId:a,draftId:b,chunkIndex:-1,body:{recommendationIds:[],chunkHash:'0'.repeat(64)}}).success).toBe(false);
  expect(placePinsResultSchema.safeParse({collectionId:a,collectionRevision:1,categoryContentRevision:'0',pinCount:0,changed:false,extra:true}).success).toBe(false);
  for(const body of [{recommendationIds:[a,a.toUpperCase()],chunkHash:'0'.repeat(64)},{recommendationIds:[],chunkHash:'g'.repeat(64)},{recommendationIds:[],chunkHash:'0'.repeat(64),ownerId:a}])expect(placePinsBodies.appendPlacePinsChunk.safeParse(body).success).toBe(false);
  const valid={operation:'abortPlacePinsDraft',collectionId:a,draftId:b,body:{}};
  expect(placePinsRequestSchema.parse(valid)).toEqual(valid);
  expect(placePinsRequestSchema.safeParse({...valid,operation:'wrong'}).success).toBe(false);expect(placePinsRequestSchema.safeParse({...valid,requestId:'ignored'}).success).toBe(false);
  for(const revision of ['-1','1.1','9007199254740992',1])expect(placePinsBodies.beginPlacePinsDraft.safeParse({...fences,expectedCategoryContentRevision:revision}).success).toBe(false);
 });
 it('binds receipt operations and addressed resources with canonical UUIDs and key order',()=>{
  const input={operation:'replacePlacePins',collectionId:a,body:{...fences,orderedRecommendationIds:[b]}};
  // Independent .NET SHA256 of the documented receipt prefix plus canonical JSON.
  expect(hashPlacePinsRequest(input)).toBe('3e8fea9cf419349457b3d27148f22ad5e68cf1ef8e5c79d9e98e0093e30fca52');
  expect(hashPlacePinsRequest(input)).toBe(hashPlacePinsRequest({body:{orderedRecommendationIds:[b.toUpperCase()],expectedCategoryContentRevision:'0',expectedCollectionRevision:1},collectionId:a.toUpperCase(),operation:'replacePlacePins'}));
  expect(hashPlacePinsRequest(input)).not.toBe(hashPlacePinsRequest({...input,collectionId:b}));
  expect(hashPlacePinsRequest({...input,body:{...fences,orderedRecommendationIds:[a,b]}})).not.toBe(hashPlacePinsRequest({...input,body:{...fences,orderedRecommendationIds:[b,a]}}));
  const append={operation:'appendPlacePinsChunk',collectionId:a,draftId:b,chunkIndex:0,body:{recommendationIds:[a],chunkHash:'0'.repeat(64)}};
  for(const change of [{draftId:a},{chunkIndex:1},{collectionId:b}])expect(hashPlacePinsRequest(append)).not.toBe(hashPlacePinsRequest({...append,...change}));
  expect(hashPlacePinsRequest({operation:'abortPlacePinsDraft',collectionId:a,draftId:b,body:{}})).not.toBe(hashPlacePinsRequest({operation:'placePinsAvailability',collectionId:a}));
 });
 it('uses independently fixed domain-separated vectors and partition-independent streaming',()=>{
  expect(hashPlacePinsChunk(0,[a,b])).toBe('10992bc7c58b5b46821a94a44205f2ad844ea53dd85c5b3508ab3ee75cef1cf0');
  const one=createPlacePinsSequenceHasher();one.append([a,b]);
  const split=createPlacePinsSequenceHasher();split.append([a.toUpperCase()]);split.append([b]);
  expect(one.finish()).toBe('86407931e8dacd393e6096bfa06bef16d3ceb57e695ec7b2a364ff9d52da04b7');expect(split.finish()).toBe('86407931e8dacd393e6096bfa06bef16d3ceb57e695ec7b2a364ff9d52da04b7');
  expect(hashPlacePinsChunk(1,[a,b])).not.toBe(hashPlacePinsChunk(0,[a,b]));expect(hashPlacePinsChunk(0,[b,a])).not.toBe(hashPlacePinsChunk(0,[a,b]));
  const empty=createPlacePinsSequenceHasher();expect(empty.finish()).toBe('0a169203c8873dba692c90eab522d385f6e34829ac5920c0b1c258a3ade75c14');
 });
});
