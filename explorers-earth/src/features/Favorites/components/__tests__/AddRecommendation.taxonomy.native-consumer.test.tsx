import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {MemoryRouter,Routes,Route,useNavigate} from 'react-router-dom';
import AddRecommendation from '../AddRecommendation';
import useAuthStore from '../../../../store/store';
import {emptyPlaceContext,emptyPlaceDetails} from '../../../../../../tunes/shared/explorersPlaceContract';
import {emptyPersonDetails} from '../../../../../../tunes/shared/explorersPersonContract';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('sonner',()=>({toast:Object.assign(vi.fn(),{success:vi.fn(),error:vi.fn(),warning:vi.fn()})}));
vi.mock('../TiptapEditor',()=>({default:()=>null}));
vi.mock('../../../Profile/components/AddressInput',()=>({default:()=>null}));
vi.mock('../../../../components/GoogleMapsProvider',()=>({withGoogleMapsProvider:(component:unknown)=>component}));
vi.mock('@vis.gl/react-google-maps',()=>({Map:()=>null,AdvancedMarker:()=>null,Pin:()=>null}));
vi.mock('axios',()=>({default:{get:vi.fn().mockResolvedValue({data:{}})}}));
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const account=id(90),list=id(91),entity=id(92),recommendation=id(93);
const item=(n:number,parentId:string|null=null)=>({id:id(n),category:'places',slug:`synthetic-${n}`,parentId,position:n,label:`Synthetic term ${n}`,resolvedLocale:'en'});
const page=(items:unknown[],nextCursor:string|null=null)=>({version:'explorers-taxonomy-catalog/v1',category:'places',state:'CONFIGURED',catalogVersion:3,requestedLocale:null,defaultLocale:'en',items,nextCursor});
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const writes:{url:string;options:RequestInit}[]=[];
let editing=false,currentRevision=1,categoryRevision='9',expiresAt=Date.now()+60000;
let storedCoordinates:{latitude:number|null;longitude:number|null}={latitude:null,longitude:null},storedContext=emptyPlaceContext(),storedMedia:string[]=[];
let assignment={categoryTermId:id(25) as string|null,subcategoryTermId:id(26) as string|null};
const collection={id:list,accountId:account,category:'places',title:'Synthetic list',slug:'synthetic-list',visibility:'private',publicationState:'draft',revision:4,description:null,heading:null,coverMediaId:null,archived:false,displayOrder:0,pinOrder:null,categoryRevision:'9',linkedChildren:[],placeLocation:{locationEntityId:null,locationSnapshot:null,instagramMediaUrl:null}};
beforeEach(()=>{
 editing=false;currentRevision=1;categoryRevision='9';expiresAt=Date.now()+60000;assignment={categoryTermId:id(25),subcategoryTermId:id(26)};
 storedCoordinates={latitude:null,longitude:null};storedContext=emptyPlaceContext();storedMedia=[];
 writes.length=0;useAuthStore.getState().login({id:'u',documentId:'u',username:'owner',email:'owner@example.invalid',blocked:false,token:'fixture'});useAuthStore.setState({accountId:account});history.replaceState({},'','/recommendations');
 vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{
  if(url.includes('/catalog/taxonomy'))return reply(page(url.includes('cursor=')?[item(25),item(26,id(25))]:Array.from({length:24},(_,n)=>item(n+1)),'cursor' in Object.fromEntries(new URL(url,'https://example.invalid').searchParams)?null:'next'));
  if(!options.method){
   if(url.includes('content-snapshot'))return reply({version:'explorers-owner-content/v2',revision:categoryRevision,snapshotToken:'synthetic-token',expiresAt,pinRevision:null});
   const core={id:recommendation,accountId:account,category:'places',entityId:entity,userRating:null,publicationState:'draft',revision:currentRevision,mediaIds:[],archived:false,pin:null};
   if(url.includes('/editable'))return reply(url.includes('/recommendations/')?{recommendation:{...core,note:null,categoryRevision,entity:{id:entity,kind:'place',title:'Draft title',details:{...emptyPlaceDetails(),formattedAddress:'Synthetic address',...storedCoordinates},origin:'manual',providerPlaceId:null},displayOverrides:{},displayTitle:'Draft title',effectivePlaceDetails:{...emptyPlaceDetails(),formattedAddress:'Synthetic address',...storedCoordinates},placeContext:storedContext,placePhotos:{photoMediaIds:storedMedia},placesTaxonomy:{catalogState:'CONFIGURED',catalogVersion:3,defaultLocale:'en',category:assignment.categoryTermId?{id:assignment.categoryTermId,slug:`synthetic-${Number(assignment.categoryTermId.slice(-12))}`,label:`Synthetic term ${Number(assignment.categoryTermId.slice(-12))}`,unavailable:false}:null,subcategory:assignment.subcategoryTermId?{id:assignment.subcategoryTermId,slug:`synthetic-${Number(assignment.subcategoryTermId.slice(-12))}`,label:`Synthetic term ${Number(assignment.subcategoryTermId.slice(-12))}`,unavailable:false}:null,selectionUnavailable:false}}}:{collection:{...collection,categoryRevision}});
   const {pinOrder:_,categoryRevision:__,linkedChildren:___,placeLocation:____,...row}=collection;
   const items=!editing?[]:url.includes('/memberships?')?[{collectionId:list,recommendationId:recommendation,collectionRevision:4,displayOrder:0,collectionArchived:false,recommendationArchived:false,placePinPosition:null}]:url.includes('/recommendations?')?[core]:[{...row}];
   return reply({version:'explorers-owner-content/v2',snapshot:categoryRevision,snapshotToken:'synthetic-token',expiresAt,items,nextCursor:null});
  }
  writes.push({url,options});if(url.includes('/entities/')){const input=JSON.parse(options.body as string);return reply({entity:input.category==='people'?{id:entity,kind:'person',title:input.details.title,details:emptyPersonDetails(),origin:'manual',suppressed:false}:{id:entity,kind:'place',title:'Draft title',details:emptyPlaceDetails(),origin:'manual',providerPlaceId:null}});}
  if(url.endsWith('/media'))return reply({media:{id:id(800),url:`/api/explorers/v1/media/${id(800)}/content`,mimeType:'image/png',size:4,alternativeText:null,caption:null}});
  if(options.method==='PATCH'){
   const body=JSON.parse(options.body as string);
   if(body.expectedRevision!==currentRevision)return reply({error:{code:'CONFLICT',message:'Recommendation changed. Refresh and review before saving.',requestId:'synthetic-conflict'}},409);
   if(body.placesTaxonomy)assignment=body.placesTaxonomy;currentRevision++;categoryRevision=String(Number(categoryRevision)+1);
  }
  return reply({recommendation:{id:recommendation,accountId:account,category:'places',entityId:entity,userRating:null,publicationState:'draft',revision:currentRevision,mediaIds:[]}});
 }));
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();useAuthStore.getState().logout();});
function NavigateProbe(){const navigate=useNavigate();return <button onClick={()=>navigate('/other')}>Leave form</button>;}
function mount(query=''){return render(<MemoryRouter initialEntries={[`/places/${list}/add${query}`]}><NavigateProbe/><Routes><Route path='/places/:listId/add' element={<AddRecommendation/>}/><Route path='/recommendations/places' element={<p>Saved</p>}/><Route path='/other' element={<p>Other route</p>}/></Routes></MemoryRouter>);}
function mountEdit(){editing=true;render(<MemoryRouter initialEntries={[`/places/${list}/edit/${recommendation}`]}><Routes><Route path='/places/:listId/edit/:placeId' element={<AddRecommendation type='edit'/>}/><Route path='/recommendations/places' element={<p>Saved</p>}/></Routes></MemoryRouter>);}
it('offers all complete canonical roots and only direct children through the real form',async()=>{
 mount();await screen.findByRole('option',{name:'Synthetic term 25'});await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:id(25)}}));expect(screen.getByRole('option',{name:'Synthetic term 26'})).toBeInTheDocument();expect(screen.getByLabelText('Subcategory')).toHaveValue('');
});
it('binds first edit submit to its hydrating observation and preserves draft for explicit refreshed review',async()=>{
 mountEdit();await screen.findByRole('option',{name:'Synthetic term 26'});expect(screen.getByLabelText('Category')).toHaveValue(id(25));
 await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:id(24)}}));currentRevision=2;assignment={categoryTermId:id(1),subcategoryTermId:null};
 await act(async()=>fireEvent.submit(document.querySelector('form')!));
 await screen.findByRole('button',{name:'Refresh and review'});
 const failed=writes.find(w=>w.options.method==='PATCH')!;expect(JSON.parse(failed.options.body as string).expectedRevision).toBe(1);expect(screen.getByLabelText('Category')).toHaveValue(id(24));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Refresh and review'})));
 await screen.findByText('Current revision loaded. Review your draft, then save again.');expect(screen.getByText('Current saved category').nextSibling).toHaveTextContent('Synthetic term 1');expect(screen.getByLabelText('Category')).toHaveValue(id(24));
 await act(async()=>fireEvent.submit(document.querySelector('form')!));await screen.findByText('Saved');
 const retried=writes.filter(w=>w.options.method==='PATCH')[1];expect(JSON.parse(retried.options.body as string).expectedRevision).toBe(2);expect(new Headers(retried.options.headers).get('Idempotency-Key')).not.toBe(new Headers(failed.options.headers).get('Idempotency-Key'));
});
it('keeps root-only and unassigned forms optional without provider inferred taxonomy',async()=>{
 mount();await screen.findByLabelText('Category');expect(screen.getByLabelText('Category')).toHaveValue('');expect(screen.getByLabelText('Subcategory')).toHaveValue('');
});
async function submitDraft(){
 for(const name of ['title','address']){fireEvent.click(screen.getByRole('button',{name:`dashboard.recommendations.addRecommendationForm.taggableFields.${name}`}));await act(async()=>fireEvent.change(document.querySelector(`[name="${name}"]`)!,{target:{value:name==='title'?'Draft title':'Synthetic address'}}));}
 await act(async()=>fireEvent.submit(document.querySelector('form')!));
}
it.each(['root','child','clear','omitted'])('creates a %s canonical assignment through the actual submit and command chain',async choice=>{
 mount();await screen.findByRole('option',{name:'Synthetic term 25'});
 if(choice!=='omitted')await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:id(25)}}));
 if(choice==='child')await act(async()=>fireEvent.change(screen.getByLabelText('Subcategory'),{target:{value:id(26)}}));
 if(choice==='clear')await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:''}}));
 await submitDraft();await screen.findByText('Saved');
 const command=writes.find(w=>w.url.endsWith('/recommendations'))!;expect(command).toBeDefined();const body=JSON.parse(command.options.body as string);
 expect(body).toMatchObject({category:'places',collectionId:list,expectedCollectionRevision:4});
 if(choice==='omitted')expect(body).not.toHaveProperty('placesTaxonomy');else expect(body.placesTaxonomy).toEqual({categoryTermId:choice==='clear'?null:id(25),subcategoryTermId:choice==='child'?id(26):null});
});
it('reuses both frozen create keys on exact failed retry and retires keys on a changed draft',async()=>{
 const transport=vi.mocked(fetch),implementation=transport.getMockImplementation()!;let failures=2;
 transport.mockImplementation(async(...args)=>{if(String(args[0]).endsWith('/recommendations')&&failures-->0){writes.push({url:String(args[0]),options:args[1]!});return reply({error:{code:'UNAVAILABLE',message:'Synthetic outage',requestId:'synthetic'}},503);}return implementation(...args);});
 mount();await screen.findByRole('option',{name:'Synthetic term 25'});await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:id(25)}}));await submitDraft();
 await waitFor(()=>expect(writes.filter(w=>w.url.endsWith('/recommendations'))).toHaveLength(1));await act(async()=>fireEvent.submit(document.querySelector('form')!));await waitFor(()=>expect(writes.filter(w=>w.url.endsWith('/recommendations'))).toHaveLength(2));
 const resolves=writes.filter(w=>w.url.includes('/entities/')),creates=writes.filter(w=>w.url.endsWith('/recommendations'));
 expect(new Headers(resolves[1].options.headers).get('Idempotency-Key')).toBe(new Headers(resolves[0].options.headers).get('Idempotency-Key'));expect(new Headers(creates[1].options.headers).get('Idempotency-Key')).toBe(new Headers(creates[0].options.headers).get('Idempotency-Key'));expect(creates[1].options.body).toBe(creates[0].options.body);
 await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:id(24)}}));await act(async()=>fireEvent.submit(document.querySelector('form')!));await screen.findByText('Saved');
 const changed=writes.filter(w=>w.url.endsWith('/recommendations'))[2];expect(new Headers(changed.options.headers).get('Idempotency-Key')).not.toBe(new Headers(creates[0].options.headers).get('Idempotency-Key'));
});
it.each(['root','child','clear','untouched'])('edits and reloads %s while preserving canonical observation and unrelated assignment omission',async choice=>{
 mountEdit();await screen.findByRole('option',{name:'Synthetic term 26'});
 if(choice==='root')await act(async()=>fireEvent.change(screen.getByLabelText('Subcategory'),{target:{value:''}}));
 if(choice==='child'){await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:id(24)}}));await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:id(25)}}));await act(async()=>fireEvent.change(screen.getByLabelText('Subcategory'),{target:{value:id(26)}}));}
 if(choice==='clear')await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:''}}));
 await act(async()=>fireEvent.submit(document.querySelector('form')!));await screen.findByText('Saved');
 const patches=writes.filter(w=>w.options.method==='PATCH');expect(patches).toHaveLength(1);const body=JSON.parse(patches[0].options.body as string);expect(body.expectedRevision).toBe(1);
 if(choice==='untouched')expect(body).not.toHaveProperty('placesTaxonomy');else expect(body.placesTaxonomy).toEqual({categoryTermId:choice==='clear'?null:id(25),subcategoryTermId:choice==='child'?id(26):null});
 const fresh=await (await import('../../api/explorersAdapter')).readPlacesOwnerContent();expect(fresh.view.lists[0].recommended_places[0].placesTaxonomy.category?.id ?? null).toBe(choice==='clear'?null:id(25));expect(fresh.view.lists[0].recommended_places[0].placesTaxonomy.subcategory?.id ?? null).toBe(choice==='child'||choice==='untouched'?id(26):null);
});
it('replays a failed edit with the exact original observation and key without creating again',async()=>{
 const transport=vi.mocked(fetch),implementation=transport.getMockImplementation()!;let failure=true;
 transport.mockImplementation(async(...args)=>{if(args[1]?.method==='PATCH'&&failure){failure=false;writes.push({url:String(args[0]),options:args[1]});return reply({error:{code:'UNAVAILABLE',message:'Synthetic unavailable',requestId:'synthetic'}},503);}return implementation(...args);});
 mountEdit();await screen.findByRole('option',{name:'Synthetic term 26'});await act(async()=>fireEvent.change(screen.getByLabelText('Subcategory'),{target:{value:''}}));await act(async()=>fireEvent.submit(document.querySelector('form')!));await waitFor(()=>expect(writes).toHaveLength(1));
 await act(async()=>fireEvent.submit(document.querySelector('form')!));await screen.findByText('Saved');expect(writes).toHaveLength(2);expect(writes[1].options.body).toBe(writes[0].options.body);expect(new Headers(writes[1].options.headers).get('Idempotency-Key')).toBe(new Headers(writes[0].options.headers).get('Idempotency-Key'));expect(writes.every(w=>w.options.method==='PATCH')).toBe(true);
});
it('creates a person entity inside Places with Places taxonomy through the actual consumer',async()=>{
 mount('?recommendationType=person');await screen.findByRole('option',{name:'Synthetic term 25'});await act(async()=>fireEvent.change(document.querySelector('[name="recommendation"]')!,{target:{value:'https://instagram.com/synthetic'}}));await act(async()=>fireEvent.change(document.querySelector('[name="contactName"]')!,{target:{value:'Synthetic person'}}));await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:id(25)}}));await act(async()=>fireEvent.submit(document.querySelector('form')!));await screen.findByText('Saved');
 expect(JSON.parse(writes.find(w=>w.url.includes('/entities/'))!.options.body as string).category).toBe('people');const body=JSON.parse(writes.find(w=>w.url.endsWith('/recommendations'))!.options.body as string);expect(body.category).toBe('places');expect(body.placesTaxonomy).toEqual({categoryTermId:id(25),subcategoryTermId:null});expect(body).not.toHaveProperty('peopleSectorTermId');
});
it.each(['empty','unconfigured','error','loading'])('distinguishes %s catalog without clearing an untouched edit assignment',async state=>{
 const transport=vi.mocked(fetch),implementation=transport.getMockImplementation()!;
 transport.mockImplementation(async(...args)=>String(args[0]).includes('/catalog/taxonomy')?state==='loading'?new Promise<Response>(()=>{}):state==='error'?reply({error:{code:'UNAVAILABLE',message:'Synthetic unavailable',requestId:'synthetic'}},503):reply(state==='empty'?page([]):{...page([]),state:'UNCONFIGURED',catalogVersion:0,defaultLocale:null}):implementation(...args));
 mountEdit();await screen.findByLabelText('Category');await screen.findByText(state==='empty'?'No Places categories are available.':state==='unconfigured'?'Places taxonomy is not configured.':state==='loading'?'Loading Places taxonomy…':/Synthetic unavailable/);expect(screen.getByLabelText('Category')).toHaveValue(id(25));
 // Finding 6a. An indeterminate catalog must not tell the owner their valid stored term is
 // unavailable; only a catalog that actually landed without the term may say that.
 const stored=Array.from((screen.getByLabelText('Category') as HTMLSelectElement).options).find(option=>option.value===id(25))!;
 expect(stored.textContent).toMatch(state==='loading'?/ \(catalog loading\)$/:state==='error'?/ \(catalog unavailable\)$/:/ \(unavailable\)$/);
 await act(async()=>fireEvent.submit(document.querySelector('form')!));await screen.findByText('Saved');expect(JSON.parse(writes[0].options.body as string)).not.toHaveProperty('placesTaxonomy');
});
it.each(['clear','replace'])('retains and permits explicit %s of unavailable canonical selections',async action=>{
 const transport=vi.mocked(fetch),implementation=transport.getMockImplementation()!;
 transport.mockImplementation(async(...args)=>{const response=await implementation(...args);if(String(args[0]).includes(`/recommendations/${recommendation}/editable`)){const body=await response.json();body.recommendation.placesTaxonomy.category={id:id(700),slug:'stored-root',label:null,unavailable:true};body.recommendation.placesTaxonomy.subcategory={id:id(701),slug:'stored-child',label:null,unavailable:true};body.recommendation.placesTaxonomy.selectionUnavailable=true;return reply(body);}return response;});
 mountEdit();await screen.findByText('Existing taxonomy selection is unavailable.');expect(screen.getByLabelText('Category')).toHaveValue(id(700));expect(screen.getByLabelText('Subcategory')).toHaveValue(id(701));expect(screen.getByRole('option',{name:`${id(700)} (unavailable)`})).toBeInTheDocument();await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:action==='clear'?'':id(25)}}));await act(async()=>fireEvent.submit(document.querySelector('form')!));await screen.findByText('Saved');expect(JSON.parse(writes[0].options.body as string).placesTaxonomy).toEqual({categoryTermId:action==='clear'?null:id(25),subcategoryTermId:null});
});
it('rejects a forged cross-parent child before dispatch and keeps the complete draft',async()=>{
 mount();await screen.findByRole('option',{name:'Synthetic term 25'});await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:id(25)}}));
 const control=screen.getByLabelText('Subcategory') as HTMLSelectElement,forged=document.createElement('option');forged.value=id(1);forged.text='Forged';control.add(forged);await act(async()=>fireEvent.change(control,{target:{value:id(1)}}));await submitDraft();await screen.findByText('Reload taxonomy and choose an available category and direct child before saving');expect(writes).toEqual([]);expect(document.querySelector('[name="title"]')).toHaveValue('Draft title');
});
it('rejects an orphan catalog hierarchy without presenting partial selectable roots',async()=>{
 const transport=vi.mocked(fetch),implementation=transport.getMockImplementation()!;transport.mockImplementation(async(...args)=>String(args[0]).includes('/catalog/taxonomy')?reply(page([item(25),item(26,id(999))])):implementation(...args));
 mount();await screen.findByRole('alert');expect(screen.queryByRole('option',{name:'Synthetic term 25'})).not.toBeInTheDocument();
});
it('exposes no first-page choices during traversal and retries a version conflict from the first page retaining fields',async()=>{
 const transport=vi.mocked(fetch),implementation=transport.getMockImplementation()!;let finish!:(response:Response)=>void,conflict=true;
 transport.mockImplementation(async(...args)=>{if(String(args[0]).includes('/catalog/taxonomy')&&String(args[0]).includes('cursor=')){if(conflict){conflict=false;return new Promise<Response>(resolve=>{finish=resolve;});}}return implementation(...args);});
 mount();await waitFor(()=>expect(finish).toBeDefined());expect(screen.getByRole('status')).toHaveTextContent('Loading Places taxonomy');expect(screen.queryByRole('option',{name:'Synthetic term 1'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'dashboard.recommendations.addRecommendationForm.taggableFields.title'}));await act(async()=>fireEvent.change(document.querySelector('[name="title"]')!,{target:{value:'Retained draft'}}));
 await act(async()=>finish(reply({...page([item(25)]),catalogVersion:4})));await screen.findByRole('button',{name:'Retry loading taxonomy'});expect(screen.queryByRole('option',{name:'Synthetic term 1'})).not.toBeInTheDocument();await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Retry loading taxonomy'})));await screen.findByRole('option',{name:'Synthetic term 25'});expect(document.querySelector('[name="title"]')).toHaveValue('Retained draft');
});
it.each(['account','generation','route','unmount'])('cancels %s authority and suppresses a late catalog response',async change=>{
 const transport=vi.mocked(fetch),implementation=transport.getMockImplementation()!;let finish!:(response:Response)=>void,signal:AbortSignal|undefined,first=true;
 transport.mockImplementation(async(...args)=>{if(String(args[0]).includes('/catalog/taxonomy')){if(first){first=false;signal=args[1]?.signal as AbortSignal;return new Promise<Response>(resolve=>{finish=resolve;});}return reply({...page([]),state:'UNCONFIGURED',catalogVersion:0,defaultLocale:null});}return implementation(...args);});
 const mounted=mount();await waitFor(()=>expect(finish).toBeDefined());
 await act(async()=>{if(change==='account')useAuthStore.setState({accountId:id(999),generation:useAuthStore.getState().generation+1});else if(change==='generation')useAuthStore.setState({generation:useAuthStore.getState().generation+1});else if(change==='route')fireEvent.click(screen.getByRole('button',{name:'Leave form'}));else mounted.unmount();});expect(signal?.aborted).toBe(true);
 await act(async()=>finish(reply(page([item(25)]))));expect(screen.queryByRole('option',{name:'Synthetic term 25'})).not.toBeInTheDocument();if(change==='account'||change==='generation')await screen.findByText('Places taxonomy is not configured.');
});
it('retains UUID identity when catalog labels change on reload',async()=>{
 const transport=vi.mocked(fetch),implementation=transport.getMockImplementation()!;let fail=true;
 transport.mockImplementation(async(...args)=>{if(String(args[0]).includes('/catalog/taxonomy')){if(fail){fail=false;return reply({});}return reply(page([{...item(25),label:'Renamed synthetic root'},item(26,id(25))]));}return implementation(...args);});
 mountEdit();await screen.findByRole('button',{name:'Retry loading taxonomy'});expect(screen.getByLabelText('Category')).toHaveValue(id(25));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Retry loading taxonomy'})));await screen.findByRole('option',{name:'Renamed synthetic root'});expect(screen.getByLabelText('Category')).toHaveValue(id(25));expect(screen.getByLabelText('Subcategory')).toHaveValue(id(26));
});
it('retires a conflict key after explicit refresh even if the new observed revision and time are identical',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(Date.now());const transport=vi.mocked(fetch),implementation=transport.getMockImplementation()!;let failure=true;
 transport.mockImplementation(async(...args)=>{if(args[1]?.method==='PATCH'&&failure){failure=false;writes.push({url:String(args[0]),options:args[1]});return reply({error:{code:'CONFLICT',message:'Synthetic catalog conflict',requestId:'synthetic'}},409);}return implementation(...args);});
 mountEdit();await screen.findByRole('option',{name:'Synthetic term 26'});await act(async()=>fireEvent.change(screen.getByLabelText('Subcategory'),{target:{value:''}}));await act(async()=>fireEvent.submit(document.querySelector('form')!));await screen.findByRole('button',{name:'Refresh and review'});await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Refresh and review'})));await screen.findByText('Current revision loaded. Review your draft, then save again.');await act(async()=>fireEvent.submit(document.querySelector('form')!));await screen.findByText('Saved');expect(new Headers(writes[1].options.headers).get('Idempotency-Key')).not.toBe(new Headers(writes[0].options.headers).get('Idempotency-Key'));
});
it.each(['create','edit'])('retires failed %s intent when a draft changes and is then restored before submitting',async kind=>{
 const transport=vi.mocked(fetch),implementation=transport.getMockImplementation()!;let failure=true;
 transport.mockImplementation(async(...args)=>{if((kind==='edit'?args[1]?.method==='PATCH':String(args[0]).endsWith('/recommendations'))&&failure){failure=false;writes.push({url:String(args[0]),options:args[1]!});return reply({},503);}return implementation(...args);});
 if(kind==='edit')mountEdit();else mount();await screen.findByRole('option',{name:'Synthetic term 25'});await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:id(25)}}));
 if(kind==='edit')await act(async()=>fireEvent.submit(document.querySelector('form')!));else await submitDraft();await waitFor(()=>expect(writes.filter(w=>kind==='edit'?w.options.method==='PATCH':w.url.endsWith('/recommendations'))).toHaveLength(1));
 await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:id(24)}}));await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:id(25)}}));await act(async()=>fireEvent.submit(document.querySelector('form')!));await screen.findByText('Saved');const commands=writes.filter(w=>kind==='edit'?w.options.method==='PATCH':w.url.endsWith('/recommendations'));expect(new Headers(commands[1].options.headers).get('Idempotency-Key')).not.toBe(new Headers(commands[0].options.headers).get('Idempotency-Key'));
});
it('attaches uploaded media with a separate patch that omits taxonomy after canonical create',async()=>{
 vi.stubGlobal('URL',class extends URL{static createObjectURL(){return 'blob:synthetic-preview';}static revokeObjectURL(){}});
 mount();await screen.findByRole('option',{name:'Synthetic term 25'});await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:id(25)}}));const boxes=screen.getAllByRole('checkbox');await act(async()=>fireEvent.click(boxes[boxes.length-1]));await act(async()=>fireEvent.change(document.querySelector('input[type="file"]')!,{target:{files:[new File(['data'],'synthetic.png',{type:'image/png'})]}}));await submitDraft();await screen.findByText('Saved');
 const create=JSON.parse(writes.find(w=>w.url.endsWith('/recommendations'))!.options.body as string);expect(create.placesTaxonomy).toEqual({categoryTermId:id(25),subcategoryTermId:null});const patches=writes.filter(w=>w.options.method==='PATCH');expect(patches).toHaveLength(1);const patch=JSON.parse(patches[0].options.body as string);expect(patch).not.toHaveProperty('placesTaxonomy');expect(patch.placePhotos).toEqual({photoMediaIds:[id(800)]});expect(writes.filter(w=>w.url.endsWith('/recommendations'))).toHaveLength(1);
});
it.each([{latitude:null,longitude:null},{latitude:0,longitude:0},{latitude:12.5,longitude:77.5}])('preserves original edit wrapper context, media and untouched coordinates %j',async coordinates=>{
 storedCoordinates=coordinates;storedContext={...emptyPlaceContext(),contactVisibility:'public',legacyPlaceNote:{stored:'Synthetic original note'}};storedMedia=[id(801)];mountEdit();await screen.findByRole('option',{name:'Synthetic term 26'});await act(async()=>fireEvent.submit(document.querySelector('form')!));await screen.findByText('Saved');expect(writes).toHaveLength(1);const body=JSON.parse(writes[0].options.body as string);expect(body.placeContext).toMatchObject({contactVisibility:'public',legacyPlaceNote:{stored:'Synthetic original note'},creatorSocialUrl:null});expect(body.placePhotos).toEqual({photoMediaIds:[id(801)]});expect(body).not.toHaveProperty('placesTaxonomy');
});
it('edits a person entity in Places using its stored profile and Places taxonomy',async()=>{
 const transport=vi.mocked(fetch),implementation=transport.getMockImplementation()!;transport.mockImplementation(async(...args)=>{const response=await implementation(...args);if(String(args[0]).includes(`/recommendations/${recommendation}/editable`)){const body=await response.json();body.recommendation.entity={id:entity,kind:'person',title:'Draft title'};delete body.recommendation.effectivePlaceDetails;body.recommendation.placeContext={...emptyPlaceContext(),recommendationType:'person',contactName:'Synthetic person',personProfileUrl:'https://instagram.com/synthetic',personAddress:'Synthetic address'};return reply(body);}return response;});
 mountEdit();await screen.findByRole('option',{name:'Synthetic term 26'});await waitFor(()=>expect(document.querySelector('[name="recommendation"]')).toHaveValue('https://instagram.com/synthetic'));await act(async()=>fireEvent.change(screen.getByLabelText('Subcategory'),{target:{value:''}}));await act(async()=>fireEvent.submit(document.querySelector('form')!));await screen.findByText('Saved');expect(writes).toHaveLength(1);const body=JSON.parse(writes[0].options.body as string);expect(body.placeContext).toMatchObject({recommendationType:'person',personProfileUrl:'https://instagram.com/synthetic'});expect(body.placesTaxonomy).toEqual({categoryTermId:id(25),subcategoryTermId:null});expect(body).not.toHaveProperty('peopleSectorTermId');
});

it.each([409,503])('retains mounted draft while deferred edit failure %s commits loading',async status=>{
 const transport=vi.mocked(fetch),implementation=transport.getMockImplementation()!;let release!:(response:Response)=>void;
 transport.mockImplementation(async(...args)=>{if(args[1]?.method==='PATCH'){writes.push({url:String(args[0]),options:args[1]});return new Promise<Response>(resolve=>{release=resolve;});}return implementation(...args);});
 mountEdit();await screen.findByRole('option',{name:'Synthetic term 26'});await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:''}}));const form=document.querySelector('form');
 await act(async()=>fireEvent.submit(form!));await waitFor(()=>expect(writes).toHaveLength(1));expect(document.querySelector('form')).toBe(form);expect(screen.getByLabelText('Category')).toHaveValue('');
 await act(async()=>release(reply({error:{code:status===409?'CONFLICT':'UNAVAILABLE',message:'Deferred failure',requestId:'synthetic'}},status)));expect(screen.getByLabelText('Category')).toHaveValue('');
 if(status===409){await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Refresh and review'})));await screen.findByText('Current revision loaded. Review your draft, then save again.');expect(screen.getByLabelText('Category')).toHaveValue('');}
});
it.each(['unchanged','changed','refresh'])('replays staged edit media after lost response with %s draft authority',async mode=>{
 vi.stubGlobal('URL',class extends URL{static createObjectURL(){return 'blob:synthetic-preview';}static revokeObjectURL(){}});
 const transport=vi.mocked(fetch),implementation=transport.getMockImplementation()!;let uploads=0,release!:(response:Response)=>void;let first=true;let committed:Response;
 transport.mockImplementation(async(...args)=>{
  if(String(args[0]).endsWith('/media')){uploads++;writes.push({url:String(args[0]),options:args[1]!});return reply({media:{id:id(800+uploads),url:`/api/explorers/v1/media/${id(800+uploads)}/content`,mimeType:'image/png',size:4,alternativeText:null,caption:null}});}
  if(args[1]?.method==='PATCH'){
   if(first){first=false;committed=await implementation(...args);return new Promise<Response>(resolve=>{release=resolve;});}
   const prior=writes.find(w=>w.options.method==='PATCH')!;if(mode==='unchanged'&&new Headers(args[1].headers).get('Idempotency-Key')===new Headers(prior.options.headers).get('Idempotency-Key')){writes.push({url:String(args[0]),options:args[1]});return committed!.clone();}
  }return implementation(...args);
 });
 mountEdit();await screen.findByRole('option',{name:'Synthetic term 26'});const boxes=screen.getAllByRole('checkbox');await act(async()=>fireEvent.click(boxes[boxes.length-1]));await act(async()=>fireEvent.change(document.querySelector('input[type="file"]')!,{target:{files:[new File(['data'],'synthetic.png',{type:'image/png'})]}}));
 await act(async()=>fireEvent.submit(document.querySelector('form')!));await waitFor(()=>expect(uploads).toBe(1));await waitFor(()=>expect(writes.filter(w=>w.options.method==='PATCH')).toHaveLength(1));await act(async()=>release(reply({error:{code:mode==='refresh'?'CONFLICT':'UNAVAILABLE',message:'Response lost after commit',requestId:'synthetic'}},mode==='refresh'?409:503)));
 // Finding 4. No revision rewind: the first PATCH really committed before its response was
 // lost, so the stored revision is genuinely 2 while the frozen draft still carries 1.
 if(mode==='changed')await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:id(24)}}));
 if(mode==='refresh'){await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Refresh and review'})));await screen.findByText('Current revision loaded. Review your draft, then save again.');}
 await act(async()=>fireEvent.submit(document.querySelector('form')!));
 // A changed draft retires the frozen key and replays against the stale expected revision,
 // so the genuine post-commit outcome is a real conflict the owner must review, not a save.
 if(mode==='changed')await screen.findByRole('button',{name:'Refresh and review'});else await screen.findByText('Saved');
 const patches=writes.filter(w=>w.options.method==='PATCH');expect(uploads).toBe(mode==='unchanged'?1:2);
 if(mode==='changed')expect(JSON.parse(patches[1].options.body as string).expectedRevision).toBe(1);
 if(mode==='unchanged'){expect(patches[1].options.body).toBe(patches[0].options.body);expect(new Headers(patches[1].options.headers).get('Idempotency-Key')).toBe(new Headers(patches[0].options.headers).get('Idempotency-Key'));}else expect(new Headers(patches[1].options.headers).get('Idempotency-Key')).not.toBe(new Headers(patches[0].options.headers).get('Idempotency-Key'));
});

it('retains mounted create draft through a deferred 503 and retries exact frozen command',async()=>{
 const transport=vi.mocked(fetch),implementation=transport.getMockImplementation()!;let release!:(response:Response)=>void;let first=true;
 transport.mockImplementation(async(...args)=>{if(String(args[0]).endsWith('/recommendations')&&first){first=false;writes.push({url:String(args[0]),options:args[1]!});return new Promise<Response>(resolve=>{release=resolve;});}return implementation(...args);});
 mount();await screen.findByRole('option',{name:'Synthetic term 25'});await act(async()=>fireEvent.change(screen.getByLabelText('Category'),{target:{value:id(25)}}));await submitDraft();const form=document.querySelector('form');await waitFor(()=>expect(writes.filter(w=>w.url.endsWith('/recommendations'))).toHaveLength(1));expect(form).not.toBeNull();expect(screen.getByLabelText('Category')).toHaveValue(id(25));
 await act(async()=>release(reply({error:{code:'UNAVAILABLE',message:'Deferred failure',requestId:'synthetic'}},503)));expect(document.querySelector('[name="title"]')).toHaveValue('Draft title');expect(screen.getByLabelText('Category')).toHaveValue(id(25));await act(async()=>fireEvent.submit(document.querySelector('form')!));await screen.findByText('Saved');const creates=writes.filter(w=>w.url.endsWith('/recommendations'));expect(creates[1].options.body).toBe(creates[0].options.body);expect(new Headers(creates[1].options.headers).get('Idempotency-Key')).toBe(new Headers(creates[0].options.headers).get('Idempotency-Key'));
});
it('offers no Instagram fetch for a person and ignores the retired fromInstagram import',async()=>{
 // Instagram import called /api/instagram, which the canonical backend does not serve.
 sessionStorage.setItem('instagram_post_data',JSON.stringify({_type:'person',fullName:'Synthetic',username:'synthetic'}));
 mount('?recommendationType=person&fromInstagram=true');await screen.findByRole('option',{name:'Synthetic term 25'});
 await act(async()=>fireEvent.change(document.querySelector('[name="recommendation"]')!,{target:{value:'https://instagram.com/synthetic'}}));
 expect(screen.queryByRole('button',{name:/Fetch/})).toBeNull();expect(screen.queryByText(/powered by Instagram/)).toBeNull();
 expect(sessionStorage.getItem('instagram_post_data')).not.toBeNull();
 expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('/api/instagram'))).toBe(false);
 sessionStorage.removeItem('instagram_post_data');
});
