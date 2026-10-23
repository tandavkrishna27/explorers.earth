import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {MemoryRouter,useNavigate,type NavigateFunction} from 'react-router-dom';
import useAuthStore from '../../../../store/store';
import {usePlacesCommands} from '../placesCommands';
export const account='00000000-0000-4000-8000-000000000701';
export const locationId='00000000-0000-4000-8000-000000000702';
export const childId='00000000-0000-4000-8000-000000000703';
export function signIn(){const generation=useAuthStore.getState().beginVerification();useAuthStore.getState().acceptVerified(generation,{id:account,userId:'link-user',username:'links',email:'links@example.invalid',onboardingStatus:'complete',revision:1});}
export function core(id:string,category:string,revision:number){return {id,accountId:account,category,title:'List',slug:'list',visibility:'private',publicationState:'draft',revision,description:null,heading:null,coverMediaId:null,isSample:false};}
export function detail(id:string,category:string){return {...core(id,category,id===locationId?4:7),archived:false,displayOrder:0,pinOrder:null,categoryRevision:'9',...(category==='places'?{linkedChildren:[],placeLocation:{locationEntityId:null,locationSnapshot:null,instagramMediaUrl:null}}:category==='products'||category==='people'?{locationLink:null}:{})};}
export const reply=(value:unknown)=>new Response(JSON.stringify(value),{status:200});
function mount(){let navigate!:NavigateFunction;const hook=renderHook(()=>{navigate=useNavigate();return usePlacesCommands();},{wrapper:({children})=><MemoryRouter initialEntries={['/places']}>{children}</MemoryRouter>});return {...hook,navigate:(path:string)=>navigate(path)};}
describe('Places command native location links',()=>{
 beforeEach(()=>{vi.unstubAllGlobals();signIn();history.replaceState({},'','/places');});
 afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();useAuthStore.getState().logout();});
 function wire(category:string,write?:(options:RequestInit)=>Response|Promise<Response>,read?:(id:string)=>Promise<Response>){const reads:string[]=[],writes:RequestInit[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{if(options.method){writes.push(options);return write?write(options):reply({collection:core(childId,category,8)});}const id=url.includes(locationId)?locationId:childId;reads.push(id);return read?read(id):reply({collection:detail(id,id===locationId?'places':category)});}));return {reads,writes};}
 for(const testCase of [{title:'products attach reaches native write through real hook',category:'products',attached:true},{title:'products detach reaches native write through real hook',category:'products',attached:false},{title:'people attach reaches native write through real hook',category:'people',attached:true},{title:'people detach reaches native write through real hook',category:'people',attached:false}])it(testCase.title,async()=>{
  const {writes}=wire(testCase.category),hook=mount();let saved:unknown;
  await act(async()=>{saved=await hook.result.current.setLocationLink(locationId,childId,testCase.attached);});
  expect(saved).toMatchObject({id:childId,revision:8});expect(writes).toHaveLength(1);expect(writes[0].method).toBe(testCase.attached?'POST':'DELETE');expect(JSON.parse(writes[0].body as string)).toEqual(testCase.attached?{childCollectionId:childId,expectedChildRevision:7,locationCollectionId:locationId,expectedLocationRevision:4}:{childCollectionId:childId,expectedChildRevision:7});
 });
 for(const boundary of [{title:'owner generation change during child read fences native write',kind:'generation'},{title:'route change during child read fences native write',kind:'route'}])it(boundary.title,async()=>{
  let release!:(value:Response)=>void;const {writes}=wire('products',undefined,async id=>id===locationId?reply({collection:detail(id,'places')}):new Promise(resolve=>{release=resolve;}));const hook=mount();let outcome!:Promise<unknown>;
  act(()=>{outcome=hook.result.current.setLocationLink(locationId,childId,true).then(()=>({success:true}),error=>error);});await waitFor(()=>expect(release).toBeTypeOf('function'));
  act(()=>{if(boundary.kind==='generation')signIn();else hook.navigate('/places/other');});
  await act(async()=>{release(reply({collection:detail(childId,'products')}));expect(await outcome).toBeInstanceOf(Error);});expect(writes).toHaveLength(0);
 });
 it('same failed write intent preserves issued observations and idempotency key',async()=>{
  let count=0;const {reads,writes}=wire('products',()=>{if(++count===1)throw Error('lost acknowledgement');return reply({collection:core(childId,'products',8)});});const hook=mount();
  await act(async()=>{await expect(hook.result.current.setLocationLink(locationId,childId,true)).rejects.toMatchObject({status:503});});
  await act(async()=>{await hook.result.current.setLocationLink(locationId,childId,true);});
  expect(reads).toEqual([locationId,childId]);expect(writes).toHaveLength(2);expect(writes[0].body).toBe(writes[1].body);expect(new Headers(writes[0].headers).get('Idempotency-Key')).toBe(new Headers(writes[1].headers).get('Idempotency-Key'));
 });
 it('changed failed write intent obtains fresh child observation and key',async()=>{
  const {reads,writes}=wire('people',()=>{throw Error('lost acknowledgement');});const hook=mount();
  for(const attached of [true,false,true])await act(async()=>{await expect(hook.result.current.setLocationLink(locationId,childId,attached)).rejects.toMatchObject({status:503});});
  expect(reads.filter(id=>id===childId)).toHaveLength(3);expect(writes).toHaveLength(3);expect(new Set(writes.map(options=>new Headers(options.headers).get('Idempotency-Key'))).size).toBe(3);expect(writes.map(options=>options.method)).toEqual(['POST','DELETE','POST']);
 });
});
