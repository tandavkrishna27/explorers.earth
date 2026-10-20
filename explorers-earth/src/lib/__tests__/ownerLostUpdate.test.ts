import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import useAuthStore from '../../store/store';
import {explorersApiClient} from '../explorersApiClient';
import {recordViewedAccount,recordViewedContent} from '../viewedRevisions';
import {toAccountUpdate} from '../../features/Profile/api/profileClient';
import {renameGuide,setGuidePublished} from '../../features/Guides/api/guideListWrites';
import {conflictEvents,itemId,listId,signIn,stubOwnerApi,viewed} from '../../test/revisionLockHarness';

beforeEach(()=>{vi.unstubAllGlobals();signIn();});
afterEach(()=>{vi.unstubAllGlobals();useAuthStore.getState().logout();});

describe('account saves',()=>{
 const account=(revision:number)=>({id:'acc',handle:'locks',revision});
 function stubAccount(){
  const sent:Array<Record<string,unknown>>=[];
  vi.stubGlobal('fetch',vi.fn(async(_url:string,options:RequestInit)=>{const body=JSON.parse(String(options.body));sent.push(body);return new Response(JSON.stringify({account:account(Number(body.expectedRevision)+1)}),{status:200});}));
  return sent;
 }
 it('sends the revision the form was built from',()=>{
  expect(toAccountUpdate({displayName:'A'} as never,{revision:5}).expectedRevision).toBe(5);
 });
 it('refuses a save based on a re-read that is newer than what the owner saw',async()=>{
  const sent=stubAccount(),seen=conflictEvents();recordViewedAccount(5);
  await expect(explorersApiClient.updateAccount({expectedRevision:6,locale:'fr'} as never)).rejects.toMatchObject({status:409,code:'CONFLICT'});
  expect(sent).toHaveLength(0);expect(seen).toHaveBeenCalled();
 });
 it('sends the viewed revision, then tracks the revision it saved',async()=>{
  const sent=stubAccount();recordViewedAccount(5);
  await explorersApiClient.updateAccount({expectedRevision:5,locale:'fr'} as never);
  await explorersApiClient.updateAccount({expectedRevision:6,locale:'de'} as never);
  expect(sent.map(body=>body.expectedRevision)).toEqual([5,6]);
 });
 it('announces a server-side lost race too',async()=>{
  recordViewedAccount(5);const seen=conflictEvents();
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:{code:'CONFLICT',message:'Account changed',requestId:'r'}}),{status:409})));
  await expect(explorersApiClient.updateAccount({expectedRevision:5,locale:'fr'} as never)).rejects.toMatchObject({status:409});
  expect(seen).toHaveBeenCalled();
 });
});

describe('guide list writes',()=>{
 it('compose against the observation the guide view holds, never a fresh read',async()=>{
  const writes=stubOwnerApi('places',{list:5,item:3});viewed(5,3);
  const held=await explorersApiClient.getMyEditableCollection(listId);
  // Another tab saves after the view loaded; the held observation still says 5.
  const reads=(fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
  await setGuidePublished(held,true);
  expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(reads+1);
  expect(writes.map(write=>write.body.expectedRevision)).toEqual([5]);
  // A second edit still holding the pre-save observation is stale, so it is refused.
  const stale=await explorersApiClient.getMyEditableCollection(listId);
  recordViewedContent({collections:[{id:listId,revision:6}],recommendations:[]});
  await expect(renameGuide(stale,'Renamed')).rejects.toMatchObject({status:409});
  expect(writes).toHaveLength(1);
 });
});

describe('membership changes',()=>{
 it('are refused when either side changed since the view',async()=>{
  const writes=stubOwnerApi('products',{list:5,item:3});recordViewedContent({collections:[{id:listId,revision:5}],recommendations:[{id:itemId,revision:3}]});
  const parent=await explorersApiClient.getMyEditableCollection(listId),item=await explorersApiClient.getMyEditableRecommendation(itemId);
  // The view moves on (a reload showed newer revisions) before the click is processed.
  recordViewedContent({collections:[{id:listId,revision:6}],recommendations:[{id:itemId,revision:3}]});
  await expect(explorersApiClient.attachMyProductMembership(parent,item,'key-1')).rejects.toMatchObject({status:409,code:'CONFLICT'});
  expect(writes).toHaveLength(0);
 });
});

describe('replay after a lost response',()=>{
 it('is left to the server even though the first attempt moved the revision past the viewed one',async()=>{
  const writes=stubOwnerApi('places',{list:5,item:3});viewed(5,3);
  const held=await explorersApiClient.getMyEditableCollection(listId);
  // The first attempt reaches the server (and, in life, commits) but its reply is lost.
  const send=(fetch as unknown as ReturnType<typeof vi.fn>).getMockImplementation()!;
  let lose=true;vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit={})=>{const result=await send(url,options);if(options.method&&lose){lose=false;throw new Error('reply lost');}return result;}));
  await expect(explorersApiClient.updateMyCollection(held,{title:'Renamed'},'replay-key')).rejects.toMatchObject({status:503});
  // The view reloads and now shows what the lost attempt committed.
  recordViewedContent({collections:[{id:listId,revision:6}],recommendations:[]});
  await explorersApiClient.updateMyCollection(held,{title:'Renamed'},'replay-key');
  expect(writes.map(write=>write.body.expectedRevision)).toEqual([5,5]);
  // A different command from the same stale observation is still refused.
  const stale=await explorersApiClient.getMyEditableCollection(listId);
  await expect(explorersApiClient.updateMyCollection(stale,{title:'Other'},'new-key')).rejects.toMatchObject({status:409});
 });
});

describe('observations the view itself holds',()=>{
 it('send their own revision and leave a stale save to the server lock',async()=>{
  const writes=stubOwnerApi('places',{list:5,item:3});
  const held=await explorersApiClient.getMyEditableCollection(listId);
  recordViewedContent({collections:[{id:listId,revision:5}],recommendations:[]},[held]);
  // The view reloaded and shows revision 6, but this form still holds (and sends) revision 5.
  recordViewedContent({collections:[{id:listId,revision:6}],recommendations:[]});
  await explorersApiClient.updateMyCollection(held,{title:'Held edit'},'held-key');
  expect(writes.map(write=>write.body.expectedRevision)).toEqual([5]);
 });
});
