import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Explicitly synthetic transport fixtures exercise the actual owner read, adapter,
// client and catalog traversal. Provider/media child surfaces remain contained.
vi.mock("@apollo/client", () => ({
  gql: (strings: TemplateStringsArray) => ({ loc: { source: { body: strings.join("") } } }),
  useQuery: () => ({ data: undefined, loading: false, refetch: vi.fn() }),
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }) }));

// Linked People and Products reads are outside this Places consumer slice.
vi.mock("../../../People/hooks/usePeopleOwner", () => ({ usePeopleOwner: () => ({ data: { personLists: [] }, loading: false, refetch: vi.fn() }) }));
vi.mock("../../../Products/hooks/useProductsOwner", () => ({ useProductsOwner: () => ({ data: { productLists: [] }, loading: false, refetch: vi.fn() }) }));
vi.mock("../../hooks/useMenuItems", () => ({ useMenuItems: () => ({ isPublished: false }) }));
vi.mock("../../../../hooks/useRecommendationsWalkthrough", () => ({
  useRecommendationsWalkthrough: () => ({ advanceToNextStep: vi.fn(), advanceToNextStepRef: { current: null } }),
}));

vi.mock("../../../../store/useSetupStore", () => ({
  default: () => ({ isProfileComplete: true, isRecommendationsComplete: true }),
}));

// Heavy children are not under test here.
vi.mock("../TopPlacesByCategory", () => ({ default: () => null }));
vi.mock("../AddPlaceOverlay", () => ({ default: () => null }));
vi.mock("../InstagramPostImport", () => ({ default: () => null }));
vi.mock("../../../PublicHome/components/PlaceDetails/PlaceOverview", () => ({ default: () => null }));
vi.mock("../../../Products/components/public/ProductDetailModal", () => ({ default: () => null }));
vi.mock("../../../People/components/public/PersonDetailModal", () => ({ default: () => null }));


import {MemoryRouter, useNavigate} from 'react-router-dom';
import Recommendations from '../Recommendations';
import useAuthStore from '../../../../store/store';
import {useCityStore} from '../../../../store/useCityStore';
import {emptyPlaceContext,emptyPlaceDetails} from '../../../../../../tunes/shared/explorersPlaceContract';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const term=(n:number,label=`Synthetic root ${n}`)=>({id:id(n),category:'places',slug:`root-${n}`,parentId:null,position:n,label,resolvedLocale:'fr'});
const catalog=(items:unknown[],nextCursor:string|null=null)=>({version:'explorers-taxonomy-catalog/v1',category:'places',state:'CONFIGURED',catalogVersion:3,requestedLocale:null,defaultLocale:'fr',items,nextCursor});
const coreList={id:id(100),accountId:id(90),category:'places',title:'Synthetic location',slug:'synthetic-location',visibility:'private',publicationState:'draft',revision:1,description:null,heading:null,coverMediaId:null,archived:false,displayOrder:0};
const list={...coreList,categoryRevision:'1',pinOrder:null,placeLocation:{locationEntityId:null,locationSnapshot:null,instagramMediaUrl:null},linkedLists:[]};
const coreRow=(n:number)=>({id:id(100+n),accountId:id(90),entityId:id(200+n),category:'places',userRating:null,publicationState:'draft',revision:1,mediaIds:[],archived:false,pin:null});
const row=(n:number,root=25,unavailable=false)=>({...coreRow(n),categoryRevision:'1',note:null,entity:{id:id(200+n),kind:'place',title:`Synthetic place ${n}`,origin:'manual',providerPlaceId:null,details:emptyPlaceDetails()},displayOverrides:{},displayTitle:`Synthetic place ${n}`,effectivePlaceDetails:emptyPlaceDetails(),placeContext:emptyPlaceContext(),placePhotos:{photoMediaIds:[]},placesTaxonomy:{catalogState:'CONFIGURED',catalogVersion:3,defaultLocale:'fr',category:{id:id(root),slug:`root-${root}`,label:unavailable?null:`Old root ${root}`,unavailable},subcategory:null,selectionUnavailable:unavailable}});
let rows=[row(1),row(2,1),row(3,99,true)];
let catalogReply:(url:URL,signal:AbortSignal)=>Promise<Response>;
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
let fetcher:ReturnType<typeof vi.fn>;
function RouteControl(){const navigate=useNavigate();return <button onClick={()=>navigate('/another/recommendations')}>Change route</button>;}
function mount(){return render(<MemoryRouter initialEntries={['/location/recommendations']}><RouteControl /><Recommendations /></MemoryRouter>);}
beforeEach(()=>{
 vi.stubGlobal('IntersectionObserver',Observer);
 useAuthStore.getState().login({id:'u',documentId:'u',username:'owner',email:'owner@example.invalid',blocked:false,token:'synthetic'});useAuthStore.setState({accountId:id(90)});
 useCityStore.getState().setSelectedCity({documentId:id(100),List_Name:'Synthetic location'});
 rows=[row(1),row(2,1),row(3,99,true)];
 catalogReply=async url=>reply(url.searchParams.has('cursor')?catalog([term(25),{...term(26,'Synthetic direct child'),parentId:id(25)}]):catalog(Array.from({length:24},(_,n)=>term(n+1)),'next'));
 const expiresAt=Date.now()+600000;
 fetcher=vi.fn(async (input:string,init:RequestInit)=>{
  const url=new URL(input,'http://localhost'),path=url.pathname;
  if(path.endsWith('/catalog/taxonomy'))return catalogReply(url,init.signal as AbortSignal);
  const snapshot={version:'explorers-owner-content/v2',snapshotToken:'synthetic-snapshot',revision:'1',expiresAt,pinRevision:null};
  if(path.includes('content-snapshot'))return reply(snapshot);
  if(path.endsWith('/editable'))return path.includes('/collections/')?reply({collection:list}):reply({recommendation:rows.find(r=>path.includes(r.id))});
  const items=path.endsWith('/collections')?[coreList]:path.endsWith('/recommendations')?rows.map(r=>coreRow(Number(r.id.slice(-12))-100)):path.endsWith('/memberships')?rows.map((r,n)=>({recommendationId:r.id,collectionId:id(100),collectionRevision:1,displayOrder:n,collectionArchived:false,recommendationArchived:false,placePinPosition:null})):[];
  return reply({version:'explorers-owner-content/v2',snapshot:'1',snapshotToken:'synthetic-snapshot',expiresAt,items,nextCursor:null});
 });vi.stubGlobal('fetch',fetcher);
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();useAuthStore.getState().logout();});
class Observer{observe(){} disconnect(){}}
vi.stubGlobal('IntersectionObserver',Observer);
describe('native Recommendations taxonomy transport',()=>{
 it('loads the complete default-locale catalog and filters hydrated rows by later-page UUID',async()=>{
  mount();await screen.findByText('Synthetic place 1');
  fireEvent.click(await screen.findByRole('button',{name:'Synthetic root 25'}));
  expect(screen.queryByRole('button',{name:'Synthetic direct child'})).toBeNull();
  expect(screen.queryByText('Synthetic place 2')).toBeNull();expect(screen.getByText('Synthetic place 1')).toBeTruthy();
  expect(fetcher.mock.calls.filter(([url])=>String(url).includes('/catalog/taxonomy')).every(([url])=>!String(url).includes('locale='))).toBe(true);
 });
 it('keeps unavailable assigned rows honestly visible without fabricating a label',async()=>{
  mount();await screen.findByText('Synthetic place 3');await screen.findByText(`Category unavailable (${id(99)})`);
 });
 it.each(['empty','unconfigured','error'])('distinguishes %s catalog state',async state=>{
  catalogReply=async()=>state==='error'?reply({error:{code:'UNAVAILABLE',message:'Synthetic catalog failed'}},503):reply(state==='empty'?catalog([]):{...catalog([]),state:'UNCONFIGURED',catalogVersion:0,defaultLocale:null});
  mount();await screen.findByText(state==='error'?'Categories could not be loaded.':state==='empty'?'No categories are configured.':'Category catalog is not configured.');
  if(state==='error')expect(screen.getByRole('button',{name:'Retry loading categories'})).toBeTruthy();
 });
 it.each(['unknown','duplicate','cross-category','version','conflict'])('never offers partial choices after %s continuation and restarts on explicit retry',async failure=>{
  let finish!:(value:Response)=>void;
  catalogReply=async url=>url.searchParams.has('cursor')?new Promise(resolve=>{finish=resolve;}):reply(catalog([term(1)],'next'));
  mount();await screen.findByText('Loading categories\u2026');await waitFor(()=>expect(finish).toBeTypeOf('function'));
  expect(screen.queryByRole('button',{name:'Synthetic root 1'})).toBeNull();
  const bad=failure==='unknown'?{...catalog([term(25)]),unexpected:true}:failure==='duplicate'?catalog([term(1)]):failure==='cross-category'?catalog([{...term(25),category:'people'}]):failure==='version'?{...catalog([term(25)]),catalogVersion:4}:{error:{code:'CONFLICT',message:'Synthetic catalog changed'}};
  await act(async()=>finish(reply(bad,failure==='conflict'?409:200)));await screen.findByText('Categories could not be loaded.');
  catalogReply=async()=>reply(catalog([term(25,'Renamed synthetic root')]));fireEvent.click(screen.getByRole('button',{name:'Retry loading categories'}));fireEvent.click(await screen.findByRole('button',{name:'Renamed synthetic root'}));
  expect(screen.getByText('Synthetic place 1')).toBeTruthy();expect(screen.queryByText('Synthetic place 2')).toBeNull();
 });
 it.each(['generation','account','route','unmount'])('aborts %s reads and suppresses late old catalog choices',async change=>{
  let finish!:(value:Response)=>void;let oldSignal!:AbortSignal;
  catalogReply=async(_url,signal)=>{oldSignal=signal;return new Promise(resolve=>{finish=resolve;});};
  const mounted=mount();await waitFor(()=>expect(finish).toBeTypeOf('function'));
  catalogReply=async()=>reply({...catalog([]),state:'UNCONFIGURED',catalogVersion:0,defaultLocale:null});
  if(change==='unmount')mounted.unmount();
  else if(change==='route')fireEvent.click(screen.getByRole('button',{name:'Change route'}));
  else act(()=>useAuthStore.setState(change==='account'?{accountId:id(91)}:{generation:useAuthStore.getState().generation+1}));
  if(change!=='unmount')await screen.findByText('Category catalog is not configured.');expect(oldSignal.aborted).toBe(true);
  await act(async()=>finish(reply(catalog([term(25)]))));expect(screen.queryByRole('button',{name:'Synthetic root 25'})).toBeNull();
 });
});
