import {StrictMode} from 'react';
import {act,cleanup,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,expect,it,vi} from 'vitest';
import {usePeopleOwner} from '../../../hooks/usePeopleOwner';
import store from '../../../../../store/store';
import {buildPublicParitySeedPlan,PUBLIC_PARITY_CASES} from '../../../../../../../tunes/scripts/public-parity-browser-support';
import * as dto from '../../../../../../../tunes/shared/explorersOwnerContentContract';
const ids=new Map<string,string>();
const id=(key:string)=>{if(!ids.has(key))ids.set(key,`00000000-0000-4000-8000-${String(ids.size+1).padStart(12,'0')}`);return ids.get(key)!;};
const plan=buildPublicParitySeedPlan(PUBLIC_PARITY_CASES[7]).categories.find(row=>row.category==='people')!;
type Owner='ownerA'|'ownerB';
const account=(owner:Owner)=>id(`${owner}-account`);
function Probe(){const {data,error,loading}=usePeopleOwner();return <><output>{loading?'loading':error?'failed':'ready'}</output>{data?.personLists.map(list=><div key={list.documentId} data-testid={list.documentId}>{list.List_Name}:{String(list.Visibility)}</div>)}</>;}
afterEach(()=>{cleanup();vi.unstubAllGlobals();const current=store.getState();current.verificationFailed(current.beginVerification(),'signed-out');});
it('returns full private A content after actual verified A/B/A transitions',async()=>{
 let privateTarget=false,serial=0;
 const expiresAt=Date.now()+600000,tokens=new Map<string,ReturnType<typeof dto.ownerSnapshotSchema.parse>>(),calls:{owner:Owner;path:string}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.signal?.aborted)throw new DOMException('cancelled','AbortError');
  const owner:Owner=store.getState().accountId===account('ownerA')?'ownerA':'ownerB';expect(store.getState().accountId).toBe(account(owner));
  const url=new URL(String(input),'https://fixture.invalid'),path=url.pathname.replace('/api/explorers/v1',''),revision=owner==='ownerA'&&privateTarget?'2':'1';calls.push({owner,path});
  const lists=plan.lists.filter(row=>row.owner===owner).map(row=>dto.ownerCollectionDtoSchema.parse({id:id(row.key),accountId:account(owner),category:'people',title:row.title,slug:row.slug,visibility:privateTarget&&row.key===plan.targetCollectionKey?'private':row.visibility,publicationState:row.publicationState,revision:privateTarget&&row.key===plan.targetCollectionKey?2:1,description:null,heading:null,coverMediaId:null,isSample:false,archived:row.archived,displayOrder:row.displayOrder}));
  const items=plan.items.filter(row=>row.owner===owner),recommendations=items.map(row=>dto.ownerRecommendationDtoSchema.parse({id:id(row.key),accountId:account(owner),entityId:id(row.entityKey!),category:'people',userRating:null,publicationState:row.publicationState,revision:1,mediaIds:[],archived:row.archived,pin:null}));
  const memberships=items.map(row=>{const parent=lists.find(list=>list.id===id(row.collectionKey))!;return dto.ownerMembershipDtoSchema.parse({recommendationId:id(row.key),collectionId:parent.id,collectionRevision:parent.revision,displayOrder:row.displayOrder,collectionArchived:parent.archived,recommendationArchived:row.archived});});
  let body:unknown;
  if(path==='/categories/people/content-snapshot'){const snapshot=dto.ownerSnapshotSchema.parse({version:'explorers-owner-content/v2',revision,snapshotToken:`${owner}-${++serial}`,expiresAt,pinRevision:null});tokens.set(snapshot.snapshotToken,snapshot);body=snapshot;}
  else if(path==='/categories/people/content-snapshot/validate')body=dto.ownerSnapshotSchema.parse(tokens.get(url.searchParams.get('snapshotToken')!));
  else if(path.endsWith('/editable')){const row=recommendations.find(row=>path===`/recommendations/${row.id}/editable`)!;expect(row).toBeDefined();const source=items.find(source=>id(source.key)===row.id)!,entity=plan.items.find(entry=>entry.entityKey===source.entityKey)!;body={recommendation:dto.editableOwnerRecommendationSchema.parse({...row,categoryRevision:revision,note:null,entity:{id:row.entityId,kind:'person',title:entity.title,details:entity.details,origin:'manual',suppressed:false},displayOverrides:{},displayTitle:entity.title,effectivePersonDetails:entity.details,peopleSector:{catalogState:'CONFIGURED',catalogVersion:1,defaultLocale:'en',sector:null,selectionUnavailable:false}})};}
  else {const snapshot=tokens.get(url.searchParams.get('snapshotToken')!)!;expect(snapshot).toBeDefined();const offset=Number(url.searchParams.get('cursor')?.split(':').at(-1)??0),rows=path==='/collections'?lists:path==='/recommendations'?recommendations:path==='/categories/people/memberships'?memberships:[],page={version:'explorers-owner-content/v2',snapshot:snapshot.revision,snapshotToken:snapshot.snapshotToken,expiresAt,nextCursor:offset+24<rows.length?`${path}:${offset+24}`:null,items:rows.slice(offset,offset+24)};body=path==='/collections'?dto.ownerCollectionPageSchema.parse(page):path==='/recommendations'?dto.ownerRecommendationPageSchema.parse(page):path==='/categories/people/memberships'?dto.ownerMembershipPageSchema.parse(page):dto.ownerTopPickPageSchema.parse({...page,pinRevision:null});}
  return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
 }));
 const verify=(owner:Owner)=>act(()=>{const current=store.getState(),generation=current.beginVerification();current.acceptVerified(generation,{id:account(owner),userId:id(`${owner}-user`),username:owner,email:`${owner}@fixture.invalid`,onboardingStatus:'complete',revision:1});});
 verify('ownerA');render(<StrictMode><MemoryRouter initialEntries={['/recommendations/people']}><Probe/></MemoryRouter></StrictMode>);
 const target=plan.lists[0].title,bTitle=plan.lists.at(-1)!.title;
 await waitFor(()=>expect(screen.getByTestId(id(plan.targetCollectionKey)).textContent).toBe(`${target}:true`));
 expect(screen.queryByText(`${bTitle}:true`)).toBeNull();
 act(()=>{const current=store.getState();current.verificationFailed(current.beginVerification(),'signed-out');});expect(screen.queryByTestId(id(plan.targetCollectionKey))).toBeNull();
 privateTarget=true;verify('ownerB');await waitFor(()=>expect(screen.getByText(`${bTitle}:true`)).toBeTruthy());expect(screen.queryByTestId(id(plan.targetCollectionKey))).toBeNull();
 verify('ownerA');await waitFor(()=>expect(screen.getByTestId(id(plan.targetCollectionKey)).textContent).toBe(`${target}:false`));expect(screen.queryByText(`${bTitle}:true`)).toBeNull();expect(screen.getByText('ready')).toBeTruthy();
 expect(plan.lists).toHaveLength(57);expect(plan.items).toHaveLength(58);// 56 ownerA lists, one archived: a deleted list is not shown to its owner.
 expect(screen.getAllByTestId(/00000000/)).toHaveLength(55);expect(calls.some(row=>row.owner==='ownerB'&&row.path.endsWith('/editable'))).toBe(true);
});
