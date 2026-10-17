import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import useAuthStore from '../../../../store/store';
import {explorersApiClient,type CollectionObservation} from '../../../../lib/explorersApiClient';
import {PlacesClient} from '../placesClient';

const account='00000000-0000-4000-8000-000000000701';
const locationId='00000000-0000-4000-8000-000000000702';
const childId='00000000-0000-4000-8000-000000000703';
function signIn(){const generation=useAuthStore.getState().beginVerification();useAuthStore.getState().acceptVerified(generation,{id:account,userId:'link-user',username:'links',email:'links@example.invalid',onboardingStatus:'complete',revision:1});}
function core(id:string,category:string,revision:number){return {id,accountId:account,category,title:'List',slug:'list',visibility:'private',publicationState:'draft',revision,description:null,heading:null,coverMediaId:null};}
function detail(id:string,category:string){return {...core(id,category,id===locationId?4:7),archived:false,displayOrder:0,pinOrder:null,categoryRevision:'9',...(category==='places'?{linkedChildren:[],placeLocation:{locationEntityId:null,locationSnapshot:null,instagramMediaUrl:null}}:category==='products'||category==='people'?{locationLink:null}:{})};}
const reply=(value:unknown)=>new Response(JSON.stringify(value),{status:200});
const observeChild=(id:string)=> (PlacesClient as typeof PlacesClient & {observeLocationChild:(id:string)=>Promise<CollectionObservation>}).observeLocationChild(id);

describe('Places native location child observation',()=>{
 beforeEach(()=>{vi.unstubAllGlobals();signIn();history.replaceState({},'','/places');});
 afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();useAuthStore.getState().logout();});
 const cases=[{title:'products link sends paired observed revisions',category:'products',attached:true},{title:'products unlink sends observed child revision',category:'products',attached:false},{title:'people link sends paired observed revisions',category:'people',attached:true},{title:'people unlink sends observed child revision',category:'people',attached:false}];
 for(const {title,category,attached} of cases)it(title,async()=>{
  const writes:{url:string,options:RequestInit}[]=[];
  vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{if(options.method){writes.push({url,options});return reply({collection:core(childId,category,8)});}return reply({collection:detail(url.includes(locationId)?locationId:childId,url.includes(locationId)?'places':category)});}));
  const location=await PlacesClient.observeCollection(locationId),child=await observeChild(childId);
  expect(await PlacesClient.setLocationLink(location,child,attached,'location-key')).toMatchObject({id:childId,revision:8});
  expect(writes).toHaveLength(1);expect(writes[0].url.endsWith(`/collections/${childId}/location`)).toBe(true);expect(writes[0].options.method).toBe(attached?'POST':'DELETE');
  expect(JSON.parse(writes[0].options.body as string)).toEqual(attached?{childCollectionId:childId,expectedChildRevision:7,locationCollectionId:locationId,expectedLocationRevision:4}:{childCollectionId:childId,expectedChildRevision:7});
  expect(new Headers(writes[0].options.headers).get('Idempotency-Key')).toBe('location-key');
 });
 it('issued native Products observations reach existing downstream link adapter',async()=>{
  const writes:RequestInit[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{if(options.method){writes.push(options);return reply({collection:core(childId,'products',8)});}return reply({collection:detail(url.includes(locationId)?locationId:childId,url.includes(locationId)?'places':'products')});}));
  const location=await PlacesClient.observeCollection(locationId),child=await explorersApiClient.getMyEditableCollection(childId);
  expect(await PlacesClient.setLocationLink(location,child,true,'fixture-control')).toMatchObject({id:childId,revision:8});expect(writes).toHaveLength(1);
 });
 it('generic Places observation still rejects products and people',async()=>{for(const category of ['products','people']){vi.stubGlobal('fetch',vi.fn(async()=>reply({collection:detail(childId,category)})));await expect(PlacesClient.observeCollection(childId)).rejects.toMatchObject({status:409,code:'CONFLICT'});}});
 it('child observation rejects every unsupported collection category',async()=>{for(const category of ['places','books','movies','games','apps','guides']){vi.stubGlobal('fetch',vi.fn(async()=>reply({collection:detail(childId,category)})));await expect(observeChild(childId)).rejects.toMatchObject({status:409,code:'CONFLICT'});}});
 it('child observation rejects copied unissued and old generation observations',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>reply({collection:detail(childId,'products')})));
  const issued=await explorersApiClient.getMyEditableCollection(childId);
  const read=vi.spyOn(explorersApiClient,'getMyEditableCollection').mockResolvedValue({...issued});
  await expect(observeChild(childId)).rejects.toMatchObject({status:409,code:'CONFLICT'});
  read.mockResolvedValue(issued);signIn();await expect(observeChild(childId)).rejects.toMatchObject({status:409,code:'CONFLICT'});
 });
});

