import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,Route,Routes,useLocation,useNavigate} from 'react-router-dom';
import {toast} from 'sonner';
import AddLinkedProductsPage from '../AddLinkedProductsPage';
import AddLinkedPeoplePage from '../AddLinkedPeoplePage';
import useAuthStore from '../../../../store/store';

vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn(),warning:vi.fn()}}));
const animation=vi.hoisted(()=>({holdExit:false}));
// Keep the exiting real form mounted to exercise immediate Cancel custody, independently
// of physical removal. Commands, form event handlers and every other component stay real.
vi.mock('framer-motion',async original=>{const actual=await original<typeof import('framer-motion')>();return {...actual,AnimatePresence:({children}:{children:React.ReactElement})=>{const previous=React.useRef<React.ReactElement>();if(children.props.locationId)previous.current=children;return <>{React.cloneElement(children,{key:children.props.locationId?'create-form':'trigger'})}{animation.holdExit&&!children.props.locationId&&previous.current?React.cloneElement(previous.current,{key:'create-form'}):null}</>;}};});
const account='00000000-0000-4000-8000-000000000101',parent='00000000-0000-4000-8000-000000000102',child='00000000-0000-4000-8000-000000000103',other='00000000-0000-4000-8000-000000000104';
const rows=[{category:'products',Page:AddLinkedProductsPage,open:'Create a New Product List',submit:'Create & Add Products',title:'e.g. Paris Essentials, Travel Gear',description:"Describe what's in this product collection"},{category:'people',Page:AddLinkedPeoplePage,open:'Create a New People List',submit:'Create & Add People',title:'e.g. Local Creators, Inspiring Founders',description:'Describe the people in this collection'}] as const;
type Row=typeof rows[number];
const core=(category:string,id=child,rev=1)=>({id,accountId:account,category,title:id===parent?'Location':'Entered draft',slug:id===parent?'location':'entered-draft',description:'Preserved description',heading:null,coverMediaId:null,visibility:'private',publicationState:'draft',revision:rev});
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const receipt=(category:string)=>({collection:{...core(category),parentLocation:{id:parent,revision:revision+1}}});
const refusal=()=>reply({error:{code:'CONFLICT',message:'Refused',requestId:other}},409);
function signIn(id=account){const generation=useAuthStore.getState().beginVerification();useAuthStore.getState().acceptVerified(generation,{id,userId:other,username:'owner',email:'owner@example.invalid',onboardingStatus:'complete',revision:1});}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
const posts:RequestInit[]=[],detailReads:string[]=[];let revision=4,expires:number,respond:(category:string,options:RequestInit)=>Response|Promise<Response>,navigate!:ReturnType<typeof useNavigate>;
function transport(){vi.stubGlobal('fetch',async(url:string,options:RequestInit={})=>{
 const parsed=new URL(url,'https://example.invalid'),path=parsed.pathname,category=parsed.searchParams.get('category')??path.match(/\/categories\/([^/]+)\//)?.[1]??'places';
 if(options.method==='POST'){posts.push(options);return respond(JSON.parse(options.body as string).category,options);}
 if(path===`/api/explorers/v1/collections/${parent}/editable`){detailReads.push(url);return reply({collection:{...core('places',parent,revision),archived:false,displayOrder:0,pinOrder:null,categoryRevision:'9',linkedChildren:[],placeLocation:{locationEntityId:null,locationSnapshot:null,instagramMediaUrl:null}}});}
 const snapshot={version:'explorers-owner-content/v2',snapshotToken:`snapshot-${category}`,revision:'9',expiresAt:expires,pinRevision:category==='places'?null:1};
 if(path.includes('/content-snapshot'))return reply(snapshot);
 const items=path.endsWith('/collections')&&category==='places'?[{...core('places',parent,revision),archived:false,displayOrder:0}]:[];
 return reply({version:snapshot.version,snapshot:'9',snapshotToken:snapshot.snapshotToken,expiresAt:expires,items,nextCursor:null,...(path.endsWith('/top-picks')?{pinRevision:1}:{})});
 });}
function Probe(){const location=useLocation();navigate=useNavigate();return <output data-testid="route">{location.pathname}{location.search}</output>;}
async function mount(row:Row){const Page=row.Page;const mounted=render(<MemoryRouter initialEntries={[`/recommendations/places/${parent}/add-${row.category}`]}><Probe/><Routes><Route path="/recommendations/places/:locationId/*" element={<Page/>}/><Route path="*" element={<div>Destination</div>}/></Routes></MemoryRouter>);await screen.findByRole('button',{name:new RegExp(row.open)});fireEvent.click(screen.getByRole('button',{name:new RegExp(row.open)}));fireEvent.change(screen.getByPlaceholderText(row.title),{target:{value:'Entered draft'}});fireEvent.change(screen.getByPlaceholderText(row.description),{target:{value:'Preserved description'}});await waitFor(()=>expect(screen.getByPlaceholderText('my-list-url')).toHaveValue('entered-draft'));return mounted;}
async function submit(row:Row){fireEvent.submit(screen.getByRole('button',{name:row.submit}).closest('form')!);await act(async()=>{await Promise.resolve();await Promise.resolve();});}
function retained(row:Row){expect(screen.getByPlaceholderText(row.title)).toHaveValue('Entered draft');expect(screen.getByPlaceholderText(row.description)).toHaveValue('Preserved description');expect(screen.getByPlaceholderText('my-list-url')).toHaveValue('entered-draft');}
function key(i=0){return new Headers(posts[i].headers).get('Idempotency-Key');}
function destination(row:Row){const url=new URL(screen.getByTestId('route').textContent!,'https://example.invalid');expect(url.pathname).toBe(`/recommendations/${row.category}/${child}/add`);expect(url.searchParams.getAll('redirectBack')).toEqual([`/recommendations/places?list=${parent}`]);expect([...url.searchParams.keys()]).toEqual(['redirectBack']);}
function reset(){cleanup();vi.clearAllMocks();signIn();revision=4;expires=Date.now()+3600000;posts.length=0;detailReads.length=0;animation.holdExit=false;respond=category=>reply(receipt(category));transport();}
beforeEach(reset);
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();useAuthStore.getState().logout();});

it('creates both linked list kinds and navigates using the validated child receipt',async()=>{
 for(const row of rows){reset();await mount(row);const baseline=detailReads.length;await submit(row);await waitFor(()=>expect(posts).toHaveLength(1));expect(JSON.parse(posts[0].body as string)).toEqual({category:row.category,title:'Entered draft',slug:'entered-draft',description:'Preserved description',visibility:'private',publicationState:'draft',heading:null,coverMediaId:null,parentLocationCollectionId:parent,parentExpectedRevision:4});expect(detailReads.length).toBeGreaterThan(baseline);await waitFor(()=>destination(row));expect(toast.success).toHaveBeenCalledTimes(1);expect(toast.error).not.toHaveBeenCalled();}
});
it('preserves entered draft on stale refusal and refreshes only on deliberate recovery',async()=>{
 for(const row of rows){reset();await mount(row);const baseline=detailReads.length;respond=()=>refusal();await submit(row);await waitFor(()=>expect(posts).toHaveLength(1));await waitFor(()=>expect(screen.getByRole('button',{name:/Refresh location and retry/i})).toBeEnabled());retained(row);expect(screen.getByTestId('route')).toHaveTextContent(`/places/${parent}/add-${row.category}`);const readCount=detailReads.length;expect(readCount).toBe(baseline+1);await act(async()=>{await Promise.resolve();});expect(posts).toHaveLength(1);expect(detailReads).toHaveLength(readCount);revision=8;respond=category=>reply(receipt(category));fireEvent.click(screen.getByRole('button',{name:/Refresh location and retry/i}));await waitFor(()=>destination(row));expect(posts).toHaveLength(2);expect(key(1)).not.toBe(key());expect(JSON.parse(posts[1].body as string)).toMatchObject({title:'Entered draft',slug:'entered-draft',description:'Preserved description',parentExpectedRevision:8});}
});
it('retries uncertainty with the original command and blocks expired recovery',async()=>{
 for(const row of rows){reset();await mount(row);const beforeLocal=detailReads.length;fireEvent.change(screen.getByPlaceholderText('my-list-url'),{target:{value:'bad slug'}});await submit(row);await waitFor(()=>expect(toast.error).toHaveBeenCalledTimes(1));expect(posts).toHaveLength(0);expect(detailReads).toHaveLength(beforeLocal+1);expect(screen.getByPlaceholderText(row.title)).toHaveValue('Entered draft');expect(screen.getByPlaceholderText(row.description)).toHaveValue('Preserved description');expect(screen.getByPlaceholderText('my-list-url')).toHaveValue('bad slug');expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/invalid|validation/i);expect(vi.mocked(toast.error).mock.calls[0][0]).not.toMatch(/uncertain|may have completed|needs checking/i);await submit(row);await waitFor(()=>expect(toast.error).toHaveBeenCalledTimes(2));expect(vi.mocked(toast.error).mock.calls[1][0]).toMatch(/invalid|validation/i);expect(vi.mocked(toast.error).mock.calls[1][0]).not.toMatch(/uncertain|may have completed|needs checking/i);expect(posts).toHaveLength(0);expect(detailReads).toHaveLength(beforeLocal+1);expect(screen.getByPlaceholderText('my-list-url')).toHaveValue('bad slug');expect(toast.success).not.toHaveBeenCalled();}
 for(const row of rows)for(const failure of ['network','malformed'])for(const next of ['success','conflict','expired']){reset();await mount(row);respond=()=>{if(failure==='network')throw Error('Lost acknowledgement');return new Response('{',{status:200});};await submit(row);await waitFor(()=>expect(posts).toHaveLength(1));await waitFor(()=>expect(screen.getByRole('button',{name:row.submit})).toBeEnabled());retained(row);const count=detailReads.length,firstBody=posts[0].body,firstKey=key(),clock=next==='expired'?vi.spyOn(Date,'now').mockReturnValue(Date.now()+600001):undefined;try{respond=next==='conflict'?()=>refusal():category=>reply(receipt(category));await submit(row);if(next==='success'){await waitFor(()=>destination(row));expect(posts).toHaveLength(2);expect(posts[1].body).toBe(firstBody);expect(key(1)).toBe(firstKey);}else{if(next==='conflict')await waitFor(()=>expect(posts).toHaveLength(2));await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});retained(row);expect(screen.queryByRole('button',{name:/Refresh location and retry/i})).not.toBeInTheDocument();await submit(row);expect(posts).toHaveLength(next==='expired'?1:2);expect(detailReads).toHaveLength(count);expect(toast.success).not.toHaveBeenCalled();}}finally{clock?.mockRestore();}}
});
it('keeps Products and People uncertainty and blocked recovery inline while preserving local and conflict notifications',async()=>{
 const uncertain='The create outcome is uncertain and needs checking. A retry uses the original command while available.';
 for(const row of rows){
 for(const failure of ['network','malformed']){
  reset();await mount(row);respond=()=>{if(failure==='network')throw Error('Lost acknowledgement');return new Response('{',{status:200});};await submit(row);
  await waitFor(()=>expect(screen.getByText(uncertain,{exact:true})).toHaveAttribute('role','status'));await waitFor(()=>expect(screen.getByRole('button',{name:row.submit})).toBeEnabled());retained(row);expect(toast.error).not.toHaveBeenCalled();expect(toast.success).not.toHaveBeenCalled();
  const originalBody=posts[0].body,originalKey=key(),reads=detailReads.length;respond=()=>refusal();await submit(row);await waitFor(()=>expect(posts).toHaveLength(2));await waitFor(()=>expect(screen.getByRole('button',{name:row.submit})).toBeEnabled());
  expect(posts[1].body).toBe(originalBody);expect(key(1)).toBe(originalKey);expect(detailReads).toHaveLength(reads);retained(row);expect(screen.getByText(uncertain,{exact:true})).toHaveAttribute('role','status');expect(screen.queryByRole('button',{name:/Refresh location and retry/i})).not.toBeInTheDocument();expect(toast.error).not.toHaveBeenCalled();
  await submit(row);retained(row);expect(posts).toHaveLength(2);expect(screen.getByText(uncertain,{exact:true})).toHaveAttribute('role','status');expect(toast.error).not.toHaveBeenCalled();expect(toast.success).not.toHaveBeenCalled();
 }
 reset();await mount(row);fireEvent.change(screen.getByPlaceholderText('my-list-url'),{target:{value:'bad slug'}});await submit(row);await waitFor(()=>expect(toast.error).toHaveBeenCalledExactlyOnceWith('The list details are invalid. Check your entries before retrying.'));expect(posts).toHaveLength(0);expect(screen.getByPlaceholderText('my-list-url')).toHaveValue('bad slug');expect(screen.getByText('The list details are invalid. Check your entries before retrying.',{exact:true})).toHaveAttribute('role','status');
 reset();await mount(row);respond=()=>refusal();await submit(row);await waitFor(()=>expect(toast.error).toHaveBeenCalledExactlyOnceWith('The location command conflicted. Refresh the location and retry.'));retained(row);expect(screen.getByRole('button',{name:/Refresh location and retry/i})).toBeEnabled();expect(screen.getByText('The location command conflicted. Refresh the location and retry.',{exact:true})).toHaveAttribute('role','status');
 }
});
async function custodyMatrix(row:Row){
 // A rejected start of retained local B must not replace custody of real pending A.
 reset();
 const edgeMount=await mount(row),edgeA=deferred<Response>(),edgeC=deferred<Response>(),edgeReadBaseline=detailReads.length;
 const edgeReceipt=(title:string,slug:string)=>reply({collection:{...receipt(row.category).collection,title,slug}});
 try {
  fireEvent.change(screen.getByPlaceholderText('my-list-url'),{target:{value:'bad slug'}});
  await submit(row);await waitFor(()=>expect(toast.error).toHaveBeenCalledTimes(1));
  expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/invalid|validation/i);
  expect(posts).toHaveLength(0);expect(detailReads).toHaveLength(edgeReadBaseline+1);
  fireEvent.change(screen.getByPlaceholderText(row.title),{target:{value:'Valid A'}});
  await waitFor(()=>expect(screen.getByPlaceholderText('my-list-url')).toHaveValue('valid-a'));
  respond=()=>edgeA.promise;await submit(row);await waitFor(()=>expect(posts).toHaveLength(1));
  const activeA=posts[0];expect(JSON.parse(activeA.body as string)).toMatchObject({title:'Valid A',slug:'valid-a',parentLocationCollectionId:parent,parentExpectedRevision:4});
  expect(detailReads).toHaveLength(edgeReadBaseline+2);expect(activeA.signal?.aborted).toBe(false);
  fireEvent.change(screen.getByPlaceholderText(row.title),{target:{value:'Entered draft'}});
  await waitFor(()=>expect(screen.getByPlaceholderText('my-list-url')).toHaveValue('entered-draft'));
  fireEvent.change(screen.getByPlaceholderText('my-list-url'),{target:{value:'bad slug'}});
  await submit(row);await waitFor(()=>expect(toast.error).toHaveBeenCalledTimes(2));
  expect(vi.mocked(toast.error).mock.calls[1][0]).toMatch(/invalid|validation/i);
  expect(posts).toHaveLength(1);expect(detailReads).toHaveLength(edgeReadBaseline+2);
  expect(activeA.signal?.aborted).toBe(false);expect(toast.warning).not.toHaveBeenCalled();
  fireEvent.change(screen.getByPlaceholderText(row.title),{target:{value:'Valid C'}});
  await waitFor(()=>expect(screen.getByPlaceholderText('my-list-url')).toHaveValue('valid-c'));
  respond=()=>edgeC.promise;await submit(row);await waitFor(()=>expect(posts).toHaveLength(2));
  expect(activeA.signal?.aborted).toBe(true);expect(key(1)).not.toBe(key());
  expect(JSON.parse(posts[1].body as string)).toEqual({category:row.category,title:'Valid C',slug:'valid-c',description:'Preserved description',visibility:'private',publicationState:'draft',heading:null,coverMediaId:null,parentLocationCollectionId:parent,parentExpectedRevision:4});
  expect(detailReads).toHaveLength(edgeReadBaseline+3);
  expect(toast.warning).toHaveBeenCalledExactlyOnceWith('An earlier create may have completed. Check your lists before creating it again.',{duration:Infinity});
  expect(toast.success).not.toHaveBeenCalled();expect(screen.getByTestId('route').textContent).not.toContain('/'+child+'/add');
  edgeC.resolve(edgeReceipt('Valid C','valid-c'));await waitFor(()=>destination(row));
  expect(toast.success).toHaveBeenCalledTimes(1);expect(toast.error).toHaveBeenCalledTimes(2);
  const acceptedRoute=screen.getByTestId('route').textContent;
  edgeA.resolve(edgeReceipt('Valid A','valid-a'));await act(async()=>{await edgeA.promise;await new Promise(resolve=>setTimeout(resolve,0));});
  destination(row);expect(screen.getByTestId('route').textContent).toBe(acceptedRoute);
  expect(toast.warning).toHaveBeenCalledExactlyOnceWith('An earlier create may have completed. Check your lists before creating it again.',{duration:Infinity});
  expect(toast.success).toHaveBeenCalledTimes(1);expect(toast.error).toHaveBeenCalledTimes(2);
 } finally {
  edgeA.resolve(edgeReceipt('Valid A','valid-a'));edgeC.resolve(edgeReceipt('Valid C','valid-c'));
  await act(async()=>{await Promise.all([edgeA.promise,edgeC.promise]);await new Promise(resolve=>setTimeout(resolve,0));});edgeMount.unmount();
 }
 for(const loss of ['distinct','account','generation','route','cancel','unmount','duplicate'])for(const completion of ['success','refusal'])for(const phase of ['fetch','body']){reset();const mounted=await mount(row),gate=deferred<Response>(),text=deferred<string>(),replacementGate=deferred<Response>();respond=()=>{const response=reply(completion==='success'?receipt(row.category):{error:{code:'CONFLICT',message:'Refused',requestId:other}},completion==='success'?200:409);response.text=()=>text.promise;return phase==='fetch'?gate.promise.then(()=>response):response;};await submit(row);try{await waitFor(()=>expect(posts).toHaveLength(1));const first=posts[0];await act(async()=>{if(loss==='account')signIn(other);if(loss==='generation')signIn();if(loss==='route')navigate('/away');if(loss==='cancel'){animation.holdExit=true;fireEvent.click(screen.getByRole('button',{name:'Cancel'}));}if(loss==='unmount')mounted.unmount();});if(loss==='route')await act(async()=>navigate(`/recommendations/places/${parent}/add-${row.category}`));if(loss==='duplicate')await submit(row);if(loss==='distinct'){const beforeReplacementRead=detailReads.length;fireEvent.change(screen.getByPlaceholderText(row.title),{target:{value:'Replacement'}});await waitFor(()=>expect(screen.getByPlaceholderText('my-list-url')).toHaveValue('replacement'));respond=()=>replacementGate.promise;await submit(row);await waitFor(()=>expect(posts).toHaveLength(2));expect(key(1)).not.toBe(key());expect(JSON.parse(posts[1].body as string)).toEqual({category:row.category,title:'Replacement',slug:'replacement',description:'Preserved description',visibility:'private',publicationState:'draft',heading:null,coverMediaId:null,parentLocationCollectionId:parent,parentExpectedRevision:4});expect(detailReads.length).toBeGreaterThan(beforeReplacementRead);expect(toast.warning).toHaveBeenCalledExactlyOnceWith('An earlier create may have completed. Check your lists before creating it again.',{duration:Infinity});expect(screen.getByTestId('route').textContent).not.toContain('/'+child+'/add');replacementGate.resolve(reply({collection:{...receipt(row.category).collection,title:'Replacement',slug:'replacement'}}));await waitFor(()=>destination(row));expect(toast.warning).toHaveBeenCalledTimes(1);expect(toast.success).toHaveBeenCalledTimes(1);expect(toast.error).not.toHaveBeenCalled();}
 if(loss==='cancel')expect(screen.getByPlaceholderText(row.title)).toBeInTheDocument();if(loss==='duplicate'){expect(toast.warning).not.toHaveBeenCalled();expect(posts).toHaveLength(1);expect(first.signal?.aborted).toBe(false);}else expect(first.signal?.aborted).toBe(true);
 const successes=vi.mocked(toast.success).mock.calls.length,errors=vi.mocked(toast.error).mock.calls.length,replacementRoute=loss==='distinct'?screen.getByTestId('route').textContent:null;gate.resolve(reply({}));text.resolve(JSON.stringify(completion==='success'?receipt(row.category):{error:{code:'CONFLICT',message:'Refused',requestId:other}}));await act(async()=>{await gate.promise;await text.promise;await new Promise(resolve=>setTimeout(resolve,0));});if(loss==='duplicate'&&completion==='success'){await waitFor(()=>destination(row));expect(toast.success).toHaveBeenCalledTimes(1);}else if(loss==='duplicate'){await waitFor(()=>expect(toast.error).toHaveBeenCalledTimes(1));expect(toast.success).not.toHaveBeenCalled();}else if(loss!=='duplicate'){expect(screen.queryByRole('button',{name:/Refresh location and retry/i})).not.toBeInTheDocument();expect(toast.success).toHaveBeenCalledTimes(successes);expect(toast.error).toHaveBeenCalledTimes(errors);if(loss==='distinct'){expect(toast.warning).toHaveBeenCalledExactlyOnceWith('An earlier create may have completed. Check your lists before creating it again.',{duration:Infinity});destination(row);expect(screen.getByTestId('route').textContent).toBe(replacementRoute);expect(toast.success).toHaveBeenCalledTimes(1);expect(toast.error).not.toHaveBeenCalled();}else if(loss!=='unmount')expect(screen.getByTestId('route').textContent).not.toContain(`/${child}/add`);}
 if(loss!=='duplicate'&&loss!=='distinct'){mounted.unmount();animation.holdExit=false;await act(async()=>signIn());respond=category=>reply(receipt(category));const beforeFresh=posts.length,fresh=await mount(row);try{await submit(row);await waitFor(()=>destination(row));expect(posts).toHaveLength(beforeFresh+1);expect(JSON.parse(posts[beforeFresh].body as string)).toMatchObject({category:row.category,title:'Entered draft',slug:'entered-draft',parentLocationCollectionId:parent,parentExpectedRevision:4});expect(toast.success).toHaveBeenCalledTimes(successes+1);expect(toast.error).toHaveBeenCalledTimes(errors);}finally{fresh.unmount();}}
 if(loss==='duplicate')expect(toast.warning).not.toHaveBeenCalled();
 }finally{replacementGate.resolve(reply({collection:{...receipt(row.category).collection,title:'Replacement',slug:'replacement'}}));gate.resolve(reply({}));text.resolve(JSON.stringify(receipt(row.category)));await act(async()=>{await gate.promise;await text.promise;await new Promise(resolve=>setTimeout(resolve,0));});mounted.unmount();}}
}

// Both custody-matrix cases drive the full create+refusal+recovery sequence and measured
// 3.9s of a 5s default under full-lane load, i.e. they sat ~1s from a false failure. The
// budget is raised; the assertions are unchanged.
it('suppresses obsolete success error and navigation after custody changes',async()=>{await custodyMatrix(rows[0]);},20000);
it('suppresses obsolete People success error and navigation after custody changes',async()=>{await custodyMatrix(rows[1]);},20000);
