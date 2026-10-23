import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {PeopleClient,type ManualPersonDraft} from '../peopleClient';
import useAuthStore from '../../../../store/store';
import {emptyPersonDetails} from '../../../../../../tunes/shared/explorersPersonContract';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const account=id(1),list=id(2),entity=id(3),recommendation=id(4),sector=id(5);
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const collection={id:list,accountId:account,category:'people',title:'People',slug:'people',visibility:'private',publicationState:'draft',revision:4,description:null,heading:null,coverMediaId:null,archived:false,displayOrder:0,pinOrder:null,categoryRevision:'9',linkedLists:[]};
const core={id:recommendation,accountId:account,category:'people',entityId:entity,userRating:null,publicationState:'draft',revision:1,mediaIds:[]};
const detail={...core,archived:false,pin:null,categoryRevision:'9',note:null,entity:{id:entity,kind:'person',title:'Alex',details:emptyPersonDetails(),origin:'manual',suppressed:false},displayOverrides:{},displayTitle:'Alex',effectivePersonDetails:emptyPersonDetails(),peopleSector:{catalogState:'CONFIGURED',catalogVersion:1,defaultLocale:'en',sector:{id:sector,slug:'canonical-sector',label:'Approved',unavailable:false},selectionUnavailable:false}};
const draft=(assignment?:string|null):ManualPersonDraft=>({title:'Alex',...emptyPersonDetails(),note:null,userRating:null,mediaIds:[],...(assignment===undefined?{}:{peopleSectorTermId:assignment})});
const writes:RequestInit[]=[];
beforeEach(()=>{writes.length=0;useAuthStore.getState().login({id:'u',documentId:'u',username:'owner',email:'owner@example.invalid',blocked:false,token:'fixture'});useAuthStore.setState({accountId:account});history.replaceState({},'','/people');
 vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{if(!options.method)return reply(url.includes('/collections/')?{collection}:{recommendation:detail});writes.push(options);if(url.includes('/entities/'))return reply({entity:detail.entity});return reply({recommendation:{...core,revision:options.method==='PATCH'?2:1}});}));
});
afterEach(()=>{vi.unstubAllGlobals();useAuthStore.getState().logout();});
it.each([sector,null,undefined])('creates through strict schemas with sector %s, retaining exact retry bodies and keys',async assignment=>{
 const transport=vi.mocked(fetch);let firstRecommendation=true;const implementation=transport.getMockImplementation()!;
 transport.mockImplementation(async(...args)=>{if(String(args[0]).endsWith('/recommendations')&&firstRecommendation){firstRecommendation=false;writes.push(args[1]!);return new Response('{',{status:200});}return implementation(...args);});
 const parent=await PeopleClient.observeCollection(list),intent=PeopleClient.prepareManualIntent(parent,draft(assignment));
 await expect(PeopleClient.createManual(intent)).rejects.toThrow();await PeopleClient.createManual(intent);
 const body=JSON.parse(writes[1].body as string);if(assignment===undefined)expect(body).not.toHaveProperty('peopleSectorTermId');else expect(body).toHaveProperty('peopleSectorTermId',assignment);
 expect(writes[2].body).toBe(writes[0].body);expect(writes[3].body).toBe(writes[1].body);expect(new Headers(writes[3].headers).get('Idempotency-Key')).toBe(intent.recommendationKey);
 expect(body).toMatchObject({collectionId:list,expectedCollectionRevision:4,category:'people',entityId:entity,publicationState:'draft'});
});
it.each([sector,null,undefined])('updates sector %s with omission preserving and explicit null clearing',async assignment=>{
 const observed=await PeopleClient.observeRecommendation(recommendation);expect(observed.detail.peopleSector?.sector?.id).toBe(sector);
 await PeopleClient.updateRecommendation(observed,{note:null,...(assignment===undefined?{}:{peopleSectorTermId:assignment})},'sector-update');
 const body=JSON.parse(writes[0].body as string);if(assignment===undefined)expect(body).not.toHaveProperty('peopleSectorTermId');else expect(body).toHaveProperty('peopleSectorTermId',assignment);expect(body.expectedRevision).toBe(1);
});
it('does not dispatch a saved intent after owner replacement',async()=>{
 const intent=PeopleClient.prepareManualIntent(await PeopleClient.observeCollection(list),draft(sector));useAuthStore.getState().logout();await expect(PeopleClient.createManual(intent)).rejects.toThrow();expect(writes).toEqual([]);
});
