// @vitest-environment jsdom
import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,renderHook,act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {PlacePinsEditor} from './PlacePinsEditor';
// Finding 9. retirePins is part of the real usePlacesCommands surface (placesCommands.ts:46).
// The mock used to omit it, which is why the component had been softened to call
// `retirePins?.()`. The mock now matches the real hook and the optional calls are gone, so
// a future omission fails here instead of being absorbed by production code.
const seam=vi.hoisted(()=>({prepare:vi.fn(),save:vi.fn(),abort:vi.fn(),availability:vi.fn(),reload:vi.fn(),retire:vi.fn()}));
vi.mock('../api/placesCommands',()=>({usePlacesCommands:()=>({loading:false,preparePins:seam.prepare,savePins:seam.save,abortPins:seam.abort,pinsAvailability:seam.availability,retirePins:seam.retire})}));
const ids=Array.from({length:70},(_,i)=>`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`);
const listId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const owner={observation:{revision:'7',collections:[{id:listId,revision:2}]},view:{lists:[{documentId:listId,recommended_places:ids.map((id,i)=>({documentId:id,Place_Details:{Title:`Place ${i}`},Contact_Name:null,is_pinned:true,pin_order:i}))}]}} as any;
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
function mount(content=owner){seam.availability.mockResolvedValue({available:true,state:'configured',clientTransport:{}});seam.prepare.mockImplementation((_observed,_id,orderedIds)=>({orderedIds,canDiscard:true,hasDraft:false}));return render(<MemoryRouter><PlacePinsEditor owner={content} listId={listId} reload={seam.reload}/></MemoryRouter>);}
describe('complete owner Places pin editor',()=>{
 it('uses all 70 live membership pins and clears without truncating',async()=>{mount();fireEvent.click(screen.getByRole('button',{name:'Edit pinned places'}));await screen.findByRole('button',{name:'Save pins'});expect(screen.getAllByRole('button',{name:/Unpin Place/})).toHaveLength(70);fireEvent.click(screen.getByRole('button',{name:'Clear all pins'}));fireEvent.click(screen.getByRole('button',{name:'Save pins'}));await waitFor(()=>expect(seam.prepare).toHaveBeenCalledWith(owner.observation,listId,[]));});
 it('moves pins and saves the complete ordered sequence',async()=>{mount();fireEvent.click(screen.getByRole('button',{name:'Edit pinned places'}));await screen.findByRole('button',{name:'Save pins'});fireEvent.click(screen.getByRole('button',{name:'Move Place 1 up'}));fireEvent.click(screen.getByRole('button',{name:'Save pins'}));await waitFor(()=>expect(seam.prepare).toHaveBeenCalledWith(owner.observation,listId,[ids[1],ids[0],...ids.slice(2)]));});
 it('retains a conflicting draft until explicit discard and reload',async()=>{seam.save.mockRejectedValueOnce(Object.assign(Error('Content changed'),{status:409}));mount();fireEvent.click(screen.getByRole('button',{name:'Edit pinned places'}));await screen.findByRole('button',{name:'Save pins'});fireEvent.click(screen.getByRole('button',{name:'Unpin Place 0'}));fireEvent.click(screen.getByRole('button',{name:'Save pins'}));await screen.findByText(/Content changed/);expect(screen.getByText('69 pinned places')).toBeTruthy();expect(seam.reload).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Discard draft and reload'}));await waitFor(()=>expect(seam.reload).toHaveBeenCalledTimes(1));});
 it('shows unavailable policy without enabling saves',async()=>{mount();seam.availability.mockResolvedValueOnce({available:false,state:'unconfigured',reason:'STORAGE_UNAVAILABLE'});fireEvent.click(screen.getByRole('button',{name:'Edit pinned places'}));await screen.findByText(/Pinning is unavailable/);expect(screen.queryByRole('button',{name:'Save pins'})).toBeNull();expect(seam.prepare).not.toHaveBeenCalled();});
 // Added finding B. The old name claimed draft retention, but PlacePinsEditor's scope (:17)
 // excludes the observation, so no re-render could ever have reset the draft and the
 // assertion would have held even if the component ignored `owner` entirely after opening.
 // Renamed to what it genuinely pins, and given an assertion that CAN fail for that
 // reason: the draft must still carry the observation captured when it was opened, so a
 // save commits against the fences the user actually saw rather than a newer revision.
 it('saves against the observation captured when the draft opened, not a later refreshed one',async()=>{
  const mounted=mount();fireEvent.click(screen.getByRole('button',{name:'Edit pinned places'}));await screen.findByRole('button',{name:'Save pins'});
  fireEvent.click(screen.getByRole('button',{name:'Unpin Place 0'}));
  const refreshed={...owner,observation:{...owner.observation,revision:'8'}};
  mounted.rerender(<MemoryRouter><PlacePinsEditor owner={refreshed} listId={listId} reload={seam.reload}/></MemoryRouter>);
  expect(screen.getByText('69 pinned places')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Save pins'}));
  await waitFor(()=>expect(seam.prepare).toHaveBeenCalledWith(owner.observation,listId,ids.slice(1)));
  // The refreshed revision '8' must never reach preparePins from an already-open draft.
  expect(seam.prepare.mock.calls.every(call=>call[0].revision==='7')).toBe(true);
 });
 // Added finding B, the other half: the state transition that CAN clobber a draft is a
 // scope change, and when it happens the draft must be dropped rather than carried into a
 // different list. This fails if the [scope] reset at PlacePinsEditor.tsx:24 is removed.
 it('drops an open draft when the editor scope changes to another list',async()=>{
  const other='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const mounted=mount();fireEvent.click(screen.getByRole('button',{name:'Edit pinned places'}));await screen.findByRole('button',{name:'Save pins'});
  fireEvent.click(screen.getByRole('button',{name:'Unpin Place 0'}));expect(screen.getByText('69 pinned places')).toBeTruthy();
  mounted.rerender(<MemoryRouter><PlacePinsEditor owner={owner} listId={other} reload={seam.reload}/></MemoryRouter>);
  expect(screen.queryByRole('dialog')).toBeNull();
 });
 // Finding 9. Transport disposal was exercised by none of the 48. retirePins is what
 // releases the transport's popstate/hashchange listeners and aborts its controllers.
 it('retires the staged pin transport when the editor unmounts',async()=>{
  const captured={orderedIds:[ids[1]],canDiscard:false,hasDraft:true};
  // mount() installs its own preparePins implementation, so the captured intent is
  // substituted AFTER it.
  const mounted=mount();seam.prepare.mockReset();seam.prepare.mockReturnValue(captured);
  seam.save.mockRejectedValueOnce(Error('Lost acknowledgement'));
  fireEvent.click(screen.getByRole('button',{name:'Edit pinned places'}));await screen.findByRole('button',{name:'Save pins'});
  fireEvent.click(screen.getByRole('button',{name:'Save pins'}));await screen.findByText(/Lost acknowledgement/);
  expect(seam.retire).not.toHaveBeenCalled();
  mounted.unmount();
  expect(seam.retire).toHaveBeenCalledWith(captured);
 });
 it('retires the staged pin transport when the editor scope changes',async()=>{
  const other='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const captured={orderedIds:[ids[1]],canDiscard:false,hasDraft:true};
  const mounted=mount();seam.prepare.mockReset();seam.prepare.mockReturnValue(captured);
  seam.save.mockRejectedValueOnce(Error('Lost acknowledgement'));
  fireEvent.click(screen.getByRole('button',{name:'Edit pinned places'}));await screen.findByRole('button',{name:'Save pins'});
  fireEvent.click(screen.getByRole('button',{name:'Save pins'}));await screen.findByText(/Lost acknowledgement/);
  mounted.rerender(<MemoryRouter><PlacePinsEditor owner={owner} listId={other} reload={seam.reload}/></MemoryRouter>);
  expect(seam.retire).toHaveBeenCalledWith(captured);
 });
 // Finding 11. A role="dialog" aria-modal="true" with no Escape and no close control.
 it('closes the editor on Escape',async()=>{
  mount();fireEvent.click(screen.getByRole('button',{name:'Edit pinned places'}));await screen.findByRole('button',{name:'Save pins'});
  fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});
  expect(screen.queryByRole('dialog')).toBeNull();
 });
 it('closes the editor from the close control',async()=>{
  mount();fireEvent.click(screen.getByRole('button',{name:'Edit pinned places'}));await screen.findByRole('button',{name:'Save pins'});
  fireEvent.click(screen.getByRole('button',{name:'Close pinned places editor'}));
  expect(screen.queryByRole('dialog')).toBeNull();
 });
 // Escape must not silently drop a staged intent - the server may hold a draft for it.
 it('refuses to close on Escape while a staged intent is unresolved',async()=>{
  mount();seam.prepare.mockReset();seam.prepare.mockReturnValue({orderedIds:[ids[1]],canDiscard:false,hasDraft:true});
  seam.save.mockRejectedValueOnce(Error('Lost acknowledgement'));
  fireEvent.click(screen.getByRole('button',{name:'Edit pinned places'}));await screen.findByRole('button',{name:'Save pins'});
  fireEvent.click(screen.getByRole('button',{name:'Save pins'}));await screen.findByText(/Lost acknowledgement/);
  fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});
  expect(await screen.findByText(/Retry or abort the staged pin draft before closing/)).toBeTruthy();
  expect(screen.getByRole('dialog')).toBeTruthy();
 });
 // Finding 6. While the owner read is in flight the retained observation is behind the
 // server, so the editor stays mounted but cannot commit against it.
 it('disables pin mutation while the owner read is in flight',async()=>{
  seam.availability.mockResolvedValue({available:true,state:'configured',clientTransport:{}});
  seam.prepare.mockImplementation((_o,_i,orderedIds)=>({orderedIds,canDiscard:true,hasDraft:false}));
  const mounted=render(<MemoryRouter><PlacePinsEditor owner={owner} listId={listId} reload={seam.reload}/></MemoryRouter>);
  fireEvent.click(screen.getByRole('button',{name:'Edit pinned places'}));await screen.findByRole('button',{name:'Save pins'});
  mounted.rerender(<MemoryRouter><PlacePinsEditor owner={owner} listId={listId} reload={seam.reload} disabled/></MemoryRouter>);
  expect((screen.getByRole('button',{name:'Save pins'}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'Unpin Place 0'}) as HTMLButtonElement).disabled).toBe(true);
  seam.prepare.mockClear();
  fireEvent.click(screen.getByRole('button',{name:'Save pins'}));
  expect(seam.prepare).not.toHaveBeenCalled();
 });
 it('keeps keyboard focus inside the ordered editor',async()=>{mount();fireEvent.click(screen.getByRole('button',{name:'Edit pinned places'}));await screen.findByRole('button',{name:'Save pins'});const dialog=screen.getByRole('dialog');expect(document.activeElement).toBe(dialog);fireEvent.keyDown(dialog,{key:'Tab',shiftKey:true});expect(document.activeElement).toBe(screen.getByRole('button',{name:'Discard draft and reload'}));fireEvent.keyDown(document.activeElement!,{key:'Tab'});
  // Finding 11 added a Close control at the top of the dialog, so it is now the first
  // tabbable control. The trap itself is unchanged.
  expect(document.activeElement).toBe(screen.getByRole('button',{name:'Close pinned places editor'}));});
 it('retries the same captured intent after a lost acknowledgement and blocks discard',async()=>{seam.prepare.mockReset();mount();const captured={orderedIds:[ids[1]],canDiscard:false,hasDraft:true};seam.prepare.mockReturnValueOnce(captured);seam.save.mockRejectedValueOnce(Error('Lost acknowledgement')).mockResolvedValueOnce(undefined);fireEvent.click(screen.getByRole('button',{name:'Edit pinned places'}));await screen.findByRole('button',{name:'Save pins'});fireEvent.click(screen.getByRole('button',{name:'Save pins'}));await screen.findByText(/Lost acknowledgement/);expect((screen.getByRole('button',{name:'Discard draft and reload'}) as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Retry save'}));await waitFor(()=>expect(seam.save).toHaveBeenCalledTimes(2));expect(seam.save.mock.calls[0][0]).toBe(seam.save.mock.calls[1][0]);expect(seam.prepare).toHaveBeenCalledTimes(1);});
});

async function nativeWire(){
 const {explorersApiClient,createMyPlacePinsTransport}=await vi.importActual<typeof import('../../../lib/explorersApiClient')>('../../../lib/explorersApiClient');
 const {PlacesClient}=await vi.importActual<typeof import('../api/placesClient')>('../api/placesClient');
 const {default:auth}=await import('../../../store/store');
 const accountId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';auth.setState({generation:100,accountId,isAuthenticated:true,user:{id:accountId,documentId:accountId,username:'synthetic-owner',email:'fixture@example.test',blocked:false}});
 const expiresAt=Date.now()+600000,snapshot={version:'explorers-owner-content/v2',snapshotToken:'pin-ui-fixture',revision:'7',expiresAt,pinRevision:null};
 const collection={id:listId,accountId,category:'places',title:'Synthetic list',slug:'synthetic-list',visibility:'private',publicationState:'draft',revision:2,description:null,heading:null,coverMediaId:null,archived:false,displayOrder:0};
 const policy={policyId:'synthetic',policyVersion:1,replacementBytes:512,replacementIds:10,transportChunkBytes:256,transportChunkIds:5,ownerStagingBytes:20000,commitProcessingBytes:40000,commitProcessingMs:1000,commitWorkUnits:1000,draftExpiryMs:10000};
 const calls:{url:string;body?:string;key?:string;signal?:AbortSignal}[]=[];let lost=true;
 const fetcher=vi.fn(async(url:string,options?:RequestInit):Promise<Response>=>{const u=new URL(url,'http://localhost'),body=options?.body as string|undefined;calls.push({url:u.pathname,body,key:(options?.headers as Record<string,string>)?.['Idempotency-Key'],signal:options?.signal as AbortSignal});
  if(!u.pathname.includes('place-pins')){if(u.pathname.endsWith('content-snapshot')||u.pathname.endsWith('validate'))return new Response(JSON.stringify(snapshot));const stream=u.pathname.split('/').pop(),offset=Number(u.searchParams.get('cursor')?.split(':')[1]??0),items=stream==='collections'?[collection]:ids.slice(offset,offset+24).map((id,index)=>stream==='recommendations'?{id,accountId,category:'places',entityId:listId,userRating:null,publicationState:'draft',revision:1,mediaIds:[],archived:false,pin:null}:{recommendationId:id,collectionId:listId,collectionRevision:2,displayOrder:offset+index,collectionArchived:false,recommendationArchived:false,placePinPosition:offset+index});return new Response(JSON.stringify({version:snapshot.version,snapshotToken:snapshot.snapshotToken,snapshot:'7',expiresAt,items,nextCursor:stream!=='collections'&&offset+24<70?stream+':'+String(offset+24):null}));}
  if(u.pathname.endsWith('availability'))return new Response(JSON.stringify({placePinsAvailability:{available:true,state:'configured',clientTransport:policy}}));
  if(u.pathname.endsWith('/drafts'))return new Response(JSON.stringify({placePinsDraft:{collectionId:listId,draftId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',expectedCollectionRevision:2,expectedCategoryContentRevision:'7',expiresAt:new Date(Date.now()+10000).toISOString(),policyId:'synthetic',policyVersion:1,clientTransport:policy}}));
  if(options?.method==='DELETE')return new Response(JSON.stringify({placePinsDraftAbort:{draftId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',changed:true}}));
  if(u.pathname.includes('/chunks/')){const input=JSON.parse(body!);return new Response(JSON.stringify({placePinsChunk:{draftId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',chunkIndex:Number(u.pathname.split('/').pop()),chunkHash:input.chunkHash,acceptedCount:input.recommendationIds.length,changed:true}}));}
  if(u.pathname.endsWith('/commit')&&lost){lost=false;throw Error('Lost native commit acknowledgement');}
  return new Response(JSON.stringify({placePins:{collectionId:listId,collectionRevision:3,categoryContentRevision:'8',pinCount:u.pathname.endsWith('/commit')?70:JSON.parse(body!).orderedRecommendationIds.length,changed:true}}));
 });vi.stubGlobal('fetch',fetcher);
 const observation=await explorersApiClient.getCompleteMyCategoryContent({category:'places',status:'active'});
 return {PlacesClient,createMyPlacePinsTransport,observation:observation as import('../api/placesClient').CompletePlacesOwnerContent,calls,fetcher,auth,accountId};
}
describe('real Places client and command wiring with inert HTTP',()=>{
 it('uses the canonical complete 70 snapshot and exact commit replay without extra edit/publication calls',async()=>{const h=await nativeWire(),intent=h.PlacesClient.preparePinsIntent(h.observation,listId,[...ids].reverse());await expect(h.PlacesClient.savePins(intent)).rejects.toThrow('Lost');const originalCommit=h.calls.find(c=>c.url.endsWith('/commit'));await h.PlacesClient.savePins(intent);const commits=h.calls.filter(c=>c.url.endsWith('/commit'));expect(commits).toHaveLength(2);expect(commits[1].body).toBe(originalCommit?.body);expect(commits[1].key).toBe(originalCommit?.key);const chunks=h.calls.filter(c=>c.url.includes('/chunks/')).flatMap(c=>JSON.parse(c.body!).recommendationIds);expect(chunks).toEqual([...ids].reverse());expect(h.calls.filter(c=>c.body).every(c=>c.url.includes('/place-pins'))).toBe(true);expect(h.observation.memberships).toHaveLength(70);});
 it('refuses forged snapshot authority and nonmember pins before mutation',async()=>{const h=await nativeWire();expect(()=>h.PlacesClient.preparePinsIntent({...h.observation},listId,[])).toThrow();const transport=h.createMyPlacePinsTransport(h.observation,listId);await expect(transport.execute({operation:'replacePlacePins',collectionId:listId,body:{expectedCollectionRevision:2,expectedCategoryContentRevision:'7',orderedRecommendationIds:['dddddddd-dddd-4ddd-8ddd-dddddddddddd']}},crypto.randomUUID())).rejects.toMatchObject({status:422});expect(h.calls.some(c=>c.body)).toBe(false);});
 // Finding 8. The old test was named for A-B-A but never exercised it: it ended on
 // generation 102 against a captured 100, so the generation comparison alone explained the
 // refusal and the accountId round trip was decoration. Split into the two distinct
 // contracts, each named for what it actually pins.
 it('rejects a session whose generation advanced past the captured one',async()=>{const h=await nativeWire(),intent=h.PlacesClient.preparePinsIntent(h.observation,listId,[]);h.auth.setState({generation:101,accountId:listId});h.auth.setState({generation:102,accountId:h.accountId});await expect(h.PlacesClient.savePins(intent)).rejects.toMatchObject({code:'ABORTED'});expect(h.calls.some(c=>c.body)).toBe(false);});
 // The genuine A-B-A that was never tested: the account leaves and returns with BOTH the
 // captured accountId AND the captured generation restored. current() at
 // explorersApiClient.ts:103 accepts this, and that is the correct contract - generation is
 // monotonic per sign-in, so an identical (accountId, generation) pair cannot denote a
 // different session. Asserting acceptance pins that reasoning; if generation ever stops
 // being monotonic, this test is the one that has to be revisited.
 it('accepts a restored session when both captured accountId and generation are identical',async()=>{
  const h=await nativeWire(),intent=h.PlacesClient.preparePinsIntent(h.observation,listId,[]);
  h.auth.setState({generation:101,accountId:listId});
  h.auth.setState({generation:100,accountId:h.accountId,isAuthenticated:true});
  await expect(h.PlacesClient.savePins(intent)).resolves.toMatchObject({collectionId:listId,pinCount:0});
 });
 // Item 5. The A-B-A above drives generation 100 -> 101 -> 100 straight through setState,
 // which is a transition production forbids: store.ts has exactly three writers of
 // `generation` (beginVerification:68, login:106, logout:126) and every one of them assigns
 // `get().generation + 1`. The acceptance contract above is correct, but its premise - that
 // the real store can never hand back a generation it has already left - was asserted
 // nowhere. Pinned here, against the store, without editing it.
 it('never lets the auth store decrement the generation',async()=>{
  const {default:auth}=await import('../../../store/store');
  const seen:number[]=[auth.getState().generation];
  const unsubscribe=auth.subscribe(state=>seen.push(state.generation));
  try{
   const start=seen[0];
   const first=auth.getState().beginVerification();
   expect(first).toBe(start+1);
   // The two outcomes of a verification must not move it at all - neither forward nor back.
   auth.getState().verificationFailed(first,'signed-out');
   expect(auth.getState().generation).toBe(first);
   auth.getState().acceptVerified(first,{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',userId:'u',username:'premise',email:'premise@example.test',onboardingStatus:'complete',revision:1});
   expect(auth.getState().generation).toBe(first);
   // The other two writers each advance by exactly one.
   auth.getState().logout();
   expect(auth.getState().generation).toBe(first+1);
   auth.getState().login({id:'u',documentId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',username:'premise',email:'premise@example.test',blocked:false,token:'t'});
   expect(auth.getState().generation).toBe(first+2);
   expect(auth.getState().beginVerification()).toBe(first+3);
   // Nothing observed along the way went backwards, and nothing fell below the start.
   expect(seen.every((value,index)=>index===0||value>=seen[index-1])).toBe(true);
   expect(Math.min(...seen)).toBe(start);
  }finally{unsubscribe();}
 });
 // Item 1 / finding 4, SECOND site. placesClient.savePins' post-response
 // transport.assertCurrent() routes through fail() - a 409 - and used to throw before
 // placesCommands could publish the fences from the already-verified, server-confirmed
 // result. A user who reordered, saved and navigated away got a committed save whose read
 // fence floor was never raised and whose public profile was never invalidated, so a
 // lagging replica could serve pre-save content as current. The guard is unchanged and
 // still throws; the fences now go out FIRST.
 //
 // The authority loss has to land in a very specific window to reach this site: AFTER the
 // transport's own assertCurrentAfterResponse (which is 499-grade and keeps the outcome
 // uncertain) and AFTER placePinsIntent's post-response assert, so that verifyResult has
 // already cached a server-confirmed result. A pushState from inside the fetch mock lands
 // too early - the transport throws 499 and no result is ever cached. So the window is
 // entered by shadowing window.history.state with a getter that changes the route key on
 // the LAST authority read of the save, which is exactly placesClient.savePins' own
 // post-response assertCurrent. The read count is learned from a warm-up save over the
 // identical code path rather than hardcoded.
 it('publishes server-confirmed fences when authority is lost after the reply',async()=>{
  const h=await nativeWire();
  const descriptor=Object.getOwnPropertyDescriptor(window.history,'state');
  const captured=window.history.state;
  let reads=0,flipAt=Number.POSITIVE_INFINITY;
  Object.defineProperty(window.history,'state',{configurable:true,get(){reads++;return reads>=flipAt?{key:'moved-after-reply'}:captured;}});
  try{
   const warm=h.PlacesClient.preparePinsIntent(h.observation,listId,[ids[0]]);
   reads=0;await h.PlacesClient.savePins(warm);const total=reads;
   expect(total).toBeGreaterThan(1);
   const intent=h.PlacesClient.preparePinsIntent(h.observation,listId,[ids[0]]);
   const committed=vi.fn();
   reads=0;flipAt=total;
   const failure=await h.PlacesClient.savePins(intent,undefined,committed).catch(error=>error);
   // The guard is NOT dropped - the post-response authority loss is still raised, and still
   // as the transport's pre-request-grade 409.
   expect(failure).toMatchObject({status:409,code:'ABORTED'});
   // But the server-confirmed result reached the fence publisher FIRST, so placesCommands'
   // invalidatePlaces + publishPublicProfileInvalidation ran and the read fence floor was
   // raised. Before the fix this callback was never invoked at all on this path.
   expect(committed).toHaveBeenCalledTimes(1);
   expect(committed.mock.calls[0][0]).toMatchObject({collectionId:listId,collectionRevision:3,categoryContentRevision:'8',pinCount:1});
  }finally{flipAt=Number.POSITIVE_INFINITY;if(descriptor)Object.defineProperty(window.history,'state',descriptor);else delete (window.history as unknown as Record<string,unknown>).state;}
 });
 it('permanently retires original route authority after leaving and returning via history',async()=>{const h=await nativeWire(),intent=h.PlacesClient.preparePinsIntent(h.observation,listId,[]),previous=window.history.state,path=window.location.pathname+window.location.search+window.location.hash;window.history.pushState({key:'other-route'},'', '/other-place-list');window.dispatchEvent(new PopStateEvent('popstate'));window.history.pushState(previous,'',path);window.dispatchEvent(new PopStateEvent('popstate'));await expect(h.PlacesClient.savePins(intent)).rejects.toMatchObject({code:'ABORTED'});expect(h.calls.some(c=>c.body)).toBe(false);});
 it('permits explicit discard recovery when expired staging is already absent',async()=>{const h=await nativeWire(),original=h.fetcher.getMockImplementation()!,intent=h.PlacesClient.preparePinsIntent(h.observation,listId,ids);h.fetcher.mockImplementation(async(url,options)=>{if(String(url).includes('/chunks/'))return new Response(JSON.stringify({error:{code:'CONFLICT',message:'Stale fixture',requestId:crypto.randomUUID()}}),{status:409});if(options?.method==='DELETE')return new Response(JSON.stringify({error:{code:'NOT_FOUND',message:'Expired fixture',requestId:crypto.randomUUID()}}),{status:404});return original(url,options);});await expect(h.PlacesClient.savePins(intent)).rejects.toMatchObject({status:409});await expect(h.PlacesClient.abortPins(intent)).resolves.toBeUndefined();expect(intent.orderedIds).toEqual(ids);});
 it('rejects returned old response and does not invalidate public content after session replacement',async()=>{const h=await nativeWire(),{usePlacesCommands}=await vi.importActual<typeof import('../api/placesCommands')>('../api/placesCommands');let release!:(value:Response)=>void;const pending={promise:new Promise<Response>(resolve=>{release=resolve;}),resolve:(value:Response)=>release(value)};h.fetcher.mockImplementationOnce(()=>pending.promise);const hook=renderHook(()=>usePlacesCommands(listId),{wrapper:({children})=><MemoryRouter>{children}</MemoryRouter>});const intent=hook.result.current.preparePins(h.observation,listId,[]),events=vi.fn();window.addEventListener('explorers-public-profile-invalidation',events);let work!:Promise<unknown>;act(()=>{work=hook.result.current.savePins(intent);});const caught=work.catch(error=>error);act(()=>h.auth.setState({generation:103,accountId:h.accountId}));pending.resolve(new Response(JSON.stringify({placePinsAvailability:{available:false,state:'unconfigured',reason:'STORAGE_UNAVAILABLE'}})));await caught;expect(events).not.toHaveBeenCalled();expect(h.calls.some(c=>c.body)).toBe(false);window.removeEventListener('explorers-public-profile-invalidation',events);});
 it('uses returned fences for owner reload and excludes another owner invalidation',async()=>{const h=await nativeWire(),hooks=await import('../hooks/usePlacesOwner'),adapter=await import('../api/explorersAdapter'),{usePlacesCommands}=await vi.importActual<typeof import('../api/placesCommands')>('../api/placesCommands');const read=vi.spyOn(adapter,'readPlacesOwnerContent').mockResolvedValue({observation:h.observation,view:owner.view,lists:new Map(),details:new Map()});try{const hook=renderHook(()=>({owner:hooks.usePlacesOwner(listId),commands:usePlacesCommands(listId)}),{wrapper:({children})=><MemoryRouter>{children}</MemoryRouter>});await waitFor(()=>expect(hook.result.current.owner.content).toBeTruthy());const before=read.mock.calls.length;act(()=>hooks.invalidatePlaces({accountId:listId,generation:100,collectionId:listId,collectionRevision:3,categoryContentRevision:'8'}));expect(read.mock.calls.length).toBe(before);const intent=hook.result.current.commands.preparePins(h.observation,listId,[]);await act(async()=>{await hook.result.current.commands.savePins(intent);});await waitFor(()=>expect(hook.result.current.owner.error?.message).toContain('older than the saved pins'));expect(hook.result.current.owner.content).toBeUndefined();}finally{read.mockRestore();}});
 // Finding 4. A session/route change in the window AFTER the server replied must not be
 // reported as an authoritative server rejection. It used to throw 409, which
 // placePinsIntent buckets as "server rejected": uncertain went false, so a commit the
 // server DID apply was recorded as certainly-not-applied and discard was permitted.
 it('keeps a post-response abort uncertain instead of treating it as a server rejection',async()=>{
  const h=await nativeWire(),original=h.fetcher.getMockImplementation()!;
  const intent=h.PlacesClient.preparePinsIntent(h.observation,listId,[ids[0]]);
  h.fetcher.mockImplementation(async(url,options)=>{
   const reply=await original(url,options);
   // The reply exists, so the server has acted. The route is changed with pushState, which
   // fires no popstate/hashchange and does not touch the auth store - so nothing aborts
   // the in-flight request and the body parses normally. This is exactly the window the
   // finding describes: authority is lost strictly between a parsed response and the
   // post-response authority check.
   if(String(url).endsWith('/place-pins')&&options?.method==='PUT')window.history.pushState({key:'moved-after-reply'},'','/moved-after-reply');
   return reply;
  });
  const restore=window.location.pathname+window.location.search+window.location.hash,state=window.history.state;
  const failure=await h.PlacesClient.savePins(intent).catch(error=>error);
  window.history.pushState(state,'',restore);
  expect(failure).toMatchObject({code:'ABORTED'});
  // 499, not 409: outside placePinsIntent's authoritative-rejection bucket.
  expect(failure.status).toBe(499);
  // Therefore the outcome is still unknown, the draft is retained, and discard is blocked
  // until the original acknowledgement is recovered.
  expect(intent.canDiscard).toBe(false);
 });
});

// Blocking 2 and added finding A. These exist because the absence of such tests is why the
// widened fetch scope and the one-sided fence floor shipped. The nine other usePlacesOwner
// call sites are untouched by the focused suite, so this is the only thing standing between
// a re-widening and nine silent full re-reads.
describe('owner read scope and fence floor',()=>{
 const fence=(over:Partial<import('../hooks/usePlacesOwner').PlacesPinInvalidation>={}) =>
  ({accountId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',generation:100,collectionId:listId,collectionRevision:5,categoryContentRevision:'7',...over});
 it('keeps listId and location.key OUT of the fetch scope',async()=>{
  const hooks=await import('../hooks/usePlacesOwner');
  const a=hooks.usePlacesOwner.length;expect(a).toBeGreaterThan(0);
  const adapter=await import('../api/explorersAdapter');
  const read=vi.spyOn(adapter,'readPlacesOwnerContent').mockResolvedValue({observation:{revision:'7',collections:[{id:listId,revision:2}]},view:owner.view,lists:new Map(),details:new Map()} as any);
  const {default:auth}=await import('../../../store/store');
  const accountId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  auth.setState({generation:100,accountId,isAuthenticated:true});
  try{
   const hook=renderHook(({id}:{id?:string})=>hooks.usePlacesOwner(id),{initialProps:{id:listId as string|undefined},wrapper:({children})=><MemoryRouter>{children}</MemoryRouter>});
   await waitFor(()=>expect(hook.result.current.content).toBeTruthy());
   const first=hook.result.current.scope,reads=read.mock.calls.length;
   // A different list id must not change the fetch scope and must not re-read. This is the
   // exact regression: useAddRecommendation passes `fetchedListId || listId`, so the id
   // changes once the async fetch resolves.
   hook.rerender({id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'});
   await waitFor(()=>expect(hook.result.current.content).toBeTruthy());
   expect(hook.result.current.scope).toBe(first);
   expect(read.mock.calls.length).toBe(reads);
   // Content must survive the list change rather than flashing empty.
   expect(hook.result.current.content).toBeTruthy();
   // And the scope string itself must not mention either value.
   expect(first).not.toContain('dddddddd');
   expect(JSON.parse(first)).toEqual([100,accountId,'/']);
  }finally{read.mockRestore();}
 });
 it('never lowers either component of the fence floor, within OR across a collection',async()=>{
  const {advancePlacesFence}=await import('../hooks/usePlacesOwner');
  const other='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const base=advancePlacesFence(undefined,fence());
  expect(base.categoryContentRevision).toBe('7');
  expect(base.collections.get(listId)).toBe(5);
  // Equal category revision with a REGRESSED collection revision: the exact case the old
  // `>=` comparison let through, silently weakening the collection fence.
  const regressed=advancePlacesFence(base,fence({collectionRevision:2}));
  expect(regressed.collections.get(listId)).toBe(5);
  expect(regressed.categoryContentRevision).toBe('7');
  // A lower category revision cannot lower the floor either.
  const lower=advancePlacesFence(base,fence({categoryContentRevision:'3',collectionRevision:1}));
  expect(lower.categoryContentRevision).toBe('7');
  expect(lower.collections.get(listId)).toBe(5);
  // A genuine advance still moves both.
  const ahead=advancePlacesFence(base,fence({categoryContentRevision:'9',collectionRevision:8}));
  expect(ahead.categoryContentRevision).toBe('9');
  expect(ahead.collections.get(listId)).toBe(8);
  // Added finding A, second pass (item 2). ACROSS a collection: a different collection at an
  // EQUAL category revision must install its OWN floor while leaving this one exactly where
  // it was. The single-slot floor returned `previous` unchanged here, so the second
  // collection's collectionRevision floor was never installed at all.
  const across=advancePlacesFence(base,fence({collectionId:other,collectionRevision:4}));
  expect(across.collections.get(other)).toBe(4);
  expect(across.collections.get(listId)).toBe(5);
  expect(across.categoryContentRevision).toBe('7');
  // Coming back to the first collection with a regressed revision still cannot lower it,
  // and cannot drop the second collection's floor.
  const back=advancePlacesFence(across,fence({collectionRevision:1}));
  expect(back.collections.get(listId)).toBe(5);
  expect(back.collections.get(other)).toBe(4);
  // A different owner epoch replaces the floor outright - it is a different fence, so the
  // previous owner's per-collection floors must not survive into it.
  const epoch=advancePlacesFence(across,fence({generation:101,collectionRevision:1}));
  expect(epoch.generation).toBe(101);
  expect(epoch.collections.get(listId)).toBe(1);
  expect(epoch.collections.size).toBe(1);
 });
 // Confirmation-review finding 4. The floor test above proves advancePlacesFence INSTALLS
 // per-collection floors; nothing proved the read check CONSULTS them. Replacing the
 // read-side per-collection clause with `false` - deleting the whole read-side widening -
 // left the suite fully green, because the one fence-reload test passes on the
 // category-revision clause alone. This drives the case where ONLY the per-collection
 // clause can refuse: the category revision is EQUAL to the floor, so that clause is
 // silent, and the refusal must come from the collection row being behind its floor.
 // The row id is deliberately UPPERCASE (confirmation-review finding 1): the server may
 // emit uppercase UUIDs while committed ids arrive lowercased, so keying raw on one side
 // made the lookup miss and failed the collection component OPEN. This case therefore
 // fails if EITHER the normalisation or the read-side consult regresses.
 it('refuses a read whose collection is behind its floor when the category revision is equal',async()=>{
  const hooks=await import('../hooks/usePlacesOwner'),adapter=await import('../api/explorersAdapter');
  const {default:auth}=await import('../../../store/store');
  const behind={observation:{revision:'7',collections:[{id:listId.toUpperCase(),revision:2}]},view:owner.view,lists:new Map(),details:new Map()} as any;
  const read=vi.spyOn(adapter,'readPlacesOwnerContent').mockResolvedValue(behind);
  const previous=auth.getState();
  try{
   act(()=>{auth.setState({generation:100,accountId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',isAuthenticated:true} as any);});
   const hook=renderHook(()=>hooks.usePlacesOwner(listId),{wrapper:({children})=><MemoryRouter>{children}</MemoryRouter>});
   await waitFor(()=>expect(hook.result.current.content).toBeTruthy());
   // No floor yet, so the identical content was lawfully accepted a moment ago. Installing
   // the floor is the only thing that changes between that acceptance and this refusal.
   act(()=>hooks.invalidatePlaces(fence()));
   await waitFor(()=>expect(hook.result.current.error?.message).toContain('older than the saved pins'),{timeout:4000});
   expect(hook.result.current.content).toBeUndefined();
  }finally{read.mockRestore();act(()=>{auth.setState(previous as any);});}
 });
});

