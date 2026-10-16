import {describe,it,expect,vi} from 'vitest';
const {canonicalPage}=vi.hoisted(()=>({canonicalPage:vi.fn()}));
vi.mock('../../../../tunes/server/application/publicContent',async original=>({...await original() as object,PublicContentService:class{page=canonicalPage;}}));
import {setupExplorersPublicContentRoutes} from '../../../../tunes/server/routes/explorersPublicContentRoutes';
import {setupExplorersPublicProfileRoutes} from '../../../../tunes/server/routes/explorersPublicProfileRoutes';
import {PublicContentFailure} from '../../../../tunes/server/application/publicContent';
import {publicPlaceReadFailure,PublicPlaceReadLimit,placeEligibilityObservation,placePinsReadInteger,encodePlacePinsCursor,decodePlacePinsCursor,PublicPlaceCursorError,PublicPlaceRestartConflict} from '../../../../tunes/server/application/placePinsRead';
import {parsePublicProfileRequest,parsePublicProfileDetailRequest} from '../../../../tunes/server/publicProfile/publicProfileContract';
const binding={account:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',username:'alice',collection:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',slug:'synthetic',limit:12,collectionRevision:'4',categoryRevision:'9',accountRevision:'3',catalogVersion:'7',eligibilityFingerprint:'a'.repeat(64)};
const tuple={pinBucket:0 as const,sortPosition:13,id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'};
const secret='synthetic-test-only-secret-32-bytes';
describe('Places authenticated tuple continuation',()=>{
 it('compatibility HTTP adapter maps Places READ_LIMIT while retaining other-category error behavior without listening',async()=>{
  const handlers=new Map<string,(...args: unknown[]) => unknown>();
  setupExplorersPublicProfileRoutes({use:vi.fn(),get:(path:string,handler:(...args: unknown[]) => unknown)=>{handlers.set(path,handler);}} as never,{category:async()=>{throw new PublicPlaceReadLimit();},detail:async()=>{throw new PublicPlaceReadLimit();}});
  for(const [path,category,code] of [['/api/explorers/v1/profiles/:username/recommendations/:category','places','READ_LIMIT'],['/api/explorers/v1/profiles/:username/recommendations/:category/:slug','places','READ_LIMIT'],['/api/explorers/v1/profiles/:username/recommendations/:category','books','UNAVAILABLE']] as const){
   const response:any={status:vi.fn(()=>response),json:vi.fn(()=>response)};
   await handlers.get(path)!({params:{username:'alice',category,slug:'synthetic'},query:{},get:()=>''},response);
   expect(response.status).toHaveBeenCalledWith(503);expect(response.json.mock.calls[0][0].error.code).toBe(code);
  }
 });
 it('canonical HTTP adapter exposes only closed READ_LIMIT classification and preserves conflicts/other failures without listening',async()=>{
  const handlers=new Map<string,(...args: unknown[]) => unknown>();
  const router={use:vi.fn(),all:vi.fn(),post:vi.fn(),get:(path:string,handler:(...args: unknown[]) => unknown)=>{handlers.set(path,handler);}};
  setupExplorersPublicContentRoutes({use:vi.fn()} as never,{} as never,secret,(()=>router) as never);
  const read=handlers.get('/api/explorers/v1/public/profiles/:username/collections/:category/:slug/recommendations')!;
  for(const [category,failure,status,code] of [['places',new PublicPlaceReadLimit(),503,'READ_LIMIT'],['places',new PublicContentFailure(409),409,'PAGE_CHANGED'],['books',new PublicPlaceReadLimit(),503,'UNAVAILABLE'],['places',Error('synthetic private SQL detail'),503,'UNAVAILABLE']] as const){
   canonicalPage.mockRejectedValueOnce(failure);
   const response:any={status:vi.fn(()=>response),json:vi.fn(()=>response)};
   await read({params:{username:'alice',category,slug:'synthetic'},query:{}},response);
   expect(response.status).toHaveBeenCalledWith(status);expect(response.json.mock.calls[0][0].error.code).toBe(code);
   expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain('SQL detail');
  }
 });
 it('classifies database deadline exhaustion as recoverable READ_LIMIT without swallowing unrelated failures',()=>{expect(publicPlaceReadFailure(Object.assign(Error('synthetic deadline'),{code:'57014'}))).toBeInstanceOf(PublicPlaceReadLimit);const unrelated=Error('synthetic unrelated');expect(publicPlaceReadFailure(unrelated)).toBe(unrelated);});
 it('hashes exact signed numeric aggregate strings and rejects precision-loss or impossible aggregate values',()=>{const raw={item_count:'2',pin_count:'1',lane_0:'9223372036854775808',lane_1:'-9223372036854775809',lane_2:'3',lane_3:'0'};const first=placeEligibilityObservation(raw);expect(first.eligibleItemCount).toBe(2);expect(first.eligibilityFingerprint).toBe('e56151cb59925e5bc33ae4be656c98bbe00b3cf87104db61699345555599aa3c');expect(placeEligibilityObservation({...raw,lane_2:'4'}).eligibilityFingerprint).not.toBe(first.eligibilityFingerprint);for(const patch of [{lane_0:'01'},{lane_1:'-0'},{lane_2:'1e2'},{item_count:'9007199254740992'},{lane_0:'18446744073709551616'},{pin_count:'3'}])expect(()=>placeEligibilityObservation({...raw,...patch})).toThrow();});
 it('accepts actual pg int8 strings including zero and rejects unsafe coercion',()=>{expect(placePinsReadInteger('0')).toBe(0);expect(placePinsReadInteger('9007199254740990')).toBe(9007199254740990);for(const raw of [null,undefined,'9007199254740991','9007199254740992','-1','1.5',' 0','0x10','',NaN])expect(()=>placePinsReadInteger(raw)).toThrow();});
 it('round trips safe bigint positions past the legacy int32 rank boundary',()=>{const value={...tuple,sortPosition:2147483648};expect(decodePlacePinsCursor(encodePlacePinsCursor(secret,binding,value),secret,binding)).toEqual(value);});
 it('round trips a gap in eligible pin positions without converting it to an offset',()=>{
  const token=encodePlacePinsCursor(secret,binding,tuple);
  expect(decodePlacePinsCursor(token,secret,binding)).toEqual(tuple);
 });
 it('rejects old offsets, changed list/filter/page/account identity and tampering',()=>{
  const token=encodePlacePinsCursor(secret,binding,tuple);
  expect(()=>decodePlacePinsCursor('o12',secret,binding)).toThrow(PublicPlaceCursorError);
  for(const change of [{username:'bob'},{collection:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'},{slug:'other'},{limit:24},{account:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}])expect(()=>decodePlacePinsCursor(token,secret,{...binding,...change})).toThrow(PublicPlaceCursorError);
  expect(()=>decodePlacePinsCursor(token+'x',secret,binding)).toThrow(PublicPlaceCursorError);
 });
 it('reports explicit restart for collection/category/catalog/account revision changes',()=>{
  const token=encodePlacePinsCursor(secret,binding,tuple);
  for(const change of [{collectionRevision:'5'},{categoryRevision:'10'},{catalogVersion:'8'},{accountRevision:'4'},{eligibilityFingerprint:'b'.repeat(64)}])expect(()=>decodePlacePinsCursor(token,secret,{...binding,...change})).toThrow(PublicPlaceRestartConflict);
 });
 it('fails closed without the configured signing key',()=>{
  expect(()=>encodePlacePinsCursor('',binding,tuple)).toThrow();
 });
 it('keeps outer list offsets independent while allowing addressed Places seek tokens',()=>{
  const token=encodePlacePinsCursor(secret,binding,tuple);
  expect(parsePublicProfileDetailRequest({username:'alice',category:'places',slug:'synthetic',cursor:token}).cursor).toBe(token);
  expect(parsePublicProfileRequest({username:'alice',category:'places',cursor:'o12'}).cursor).toBe('o12');
  expect(parsePublicProfileDetailRequest({username:'alice',category:'books',slug:'synthetic',cursor:'o12'}).cursor).toBe('o12');
  expect(()=>parsePublicProfileDetailRequest({username:'alice',category:'books',slug:'synthetic',cursor:token})).toThrow();
 });
});
