import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {PlacesClient,type ManualPlaceDraft} from '../placesClient';
import useAuthStore from '../../../../store/store';
import {emptyPersonDetails} from '../../../../../../tunes/shared/explorersPersonContract';
import {emptyPlaceContext,emptyPlaceDetails} from '../../../../../../tunes/shared/explorersPlaceContract';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const account=id(1),list=id(2),entity=id(3),recommendation=id(4),root=id(5),child=id(6);
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const collection={id:list,accountId:account,category:'places',title:'Places',slug:'places',visibility:'private',publicationState:'draft',revision:4,description:null,heading:null,coverMediaId:null,archived:false,displayOrder:0,pinOrder:null,categoryRevision:'9',linkedChildren:[],placeLocation:{locationEntityId:null,locationSnapshot:null,instagramMediaUrl:null}};
const core={id:recommendation,accountId:account,category:'places',entityId:entity,userRating:null,publicationState:'draft',revision:1,mediaIds:[]};
const placeEntity={id:entity,kind:'place',title:'Synthetic place',details:emptyPlaceDetails(),origin:'manual',providerPlaceId:null};
const detail={...core,archived:false,pin:null,categoryRevision:'9',note:null,entity:placeEntity,displayOverrides:{},displayTitle:'Synthetic place',effectivePlaceDetails:emptyPlaceDetails(),placeContext:emptyPlaceContext(),placePhotos:{photoMediaIds:[]},placesTaxonomy:{catalogState:'CONFIGURED',catalogVersion:1,defaultLocale:'en',category:{id:root,slug:'synthetic-root',label:'Synthetic root',unavailable:false},subcategory:null,selectionUnavailable:false}};
const writes:RequestInit[]=[];
const draft=(assignment?:{categoryTermId:string|null;subcategoryTermId:string|null}):ManualPlaceDraft=>({title:'Synthetic place',details:{},context:emptyPlaceContext(),note:null,userRating:null,mediaIds:[],photoMediaIds:[],...(assignment===undefined?{}:{placesTaxonomy:assignment})});
beforeEach(()=>{writes.length=0;useAuthStore.getState().login({id:'u',documentId:'u',username:'owner',email:'owner@example.invalid',blocked:false,token:'fixture'});useAuthStore.setState({accountId:account});history.replaceState({},'','/recommendations');vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{if(!options.method)return reply(url.includes('/collections/')?{collection}:{recommendation:detail});writes.push(options);if(url.includes('/entities/'))return reply({entity:JSON.parse(options.body as string).category==='people'?{id:entity,kind:'person',title:'Synthetic place',origin:'manual',suppressed:false,details:emptyPersonDetails()}:placeEntity});return reply({recommendation:{...core,revision:options.method==='PATCH'?2:1}});}));});
afterEach(()=>{vi.unstubAllGlobals();useAuthStore.getState().logout();});
it.each([undefined,{categoryTermId:root,subcategoryTermId:null},{categoryTermId:root,subcategoryTermId:child},{categoryTermId:null,subcategoryTermId:null}])('forwards strict Places assignment %j in a frozen place intent',async assignment=>{
 const intent=PlacesClient.prepareManualIntent(await PlacesClient.observeCollection(list),draft(assignment));await PlacesClient.createManual(intent);const body=JSON.parse(writes[1].body as string);if(assignment===undefined)expect(body).not.toHaveProperty('placesTaxonomy');else expect(body.placesTaxonomy).toEqual(assignment);expect(body).toMatchObject({collectionId:list,expectedCollectionRevision:4,category:'places'});
});
it('validates the person variant as a Places assignment before transport',async()=>{
 const parent=await PlacesClient.observeCollection(list);
 expect(()=>PlacesClient.prepareManualPersonIntent(parent,draft({categoryTermId:null,subcategoryTermId:child}))).toThrow();
 expect(writes).toEqual([]);
});
it('forwards Places taxonomy for a person entity and replays exact frozen keys',async()=>{
 const named=draft({categoryTermId:root,subcategoryTermId:child});const intent=PlacesClient.prepareManualPersonIntent(await PlacesClient.observeCollection(list),{...named,context:{...named.context,contactName:'Synthetic person'}});
 const transport=vi.mocked(fetch),implementation=transport.getMockImplementation()!;let fail=true;transport.mockImplementation(async(...args)=>{if(String(args[0]).endsWith('/recommendations')&&fail){fail=false;writes.push(args[1]!);return new Response('{',{status:200});}return implementation(...args);});await expect(PlacesClient.createManual(intent)).rejects.toThrow();await PlacesClient.createManual(intent);
 expect(JSON.parse(writes[1].body as string).placesTaxonomy).toEqual({categoryTermId:root,subcategoryTermId:child});
 expect(writes[3].body).toBe(writes[1].body);expect(new Headers(writes[3].headers).get('Idempotency-Key')).toBe(intent.recommendationKey);
});
it.each([undefined,{categoryTermId:root,subcategoryTermId:null},{categoryTermId:root,subcategoryTermId:child},{categoryTermId:null,subcategoryTermId:null}])('updates %j with canonical hydration, preserving omission and explicit clear',async assignment=>{
 const observed=await PlacesClient.observeRecommendation(recommendation);expect(observed.detail.placesTaxonomy?.category?.id).toBe(root);await PlacesClient.updateRecommendation(observed,{note:null,...(assignment===undefined?{}:{placesTaxonomy:assignment})},'synthetic-update');const body=JSON.parse(writes[0].body as string);expect(body.expectedRevision).toBe(1);if(assignment===undefined)expect(body).not.toHaveProperty('placesTaxonomy');else expect(body.placesTaxonomy).toEqual(assignment);
});
it.each(['place','person'])('rejects invalid strict %s assignments and recommendation metadata before preparing an intent',async kind=>{
 const parent=await PlacesClient.observeCollection(list),prepare=kind==='place'?PlacesClient.prepareManualIntent:PlacesClient.prepareManualPersonIntent;
 for(const assignment of [{categoryTermId:null,subcategoryTermId:child},{categoryTermId:root},{categoryTermId:root,subcategoryTermId:root},{categoryTermId:root,subcategoryTermId:null,unknown:true},{categoryTermId:'synthetic-name',subcategoryTermId:null}])expect(()=>prepare(parent,draft(assignment as never))).toThrow();
 expect(()=>prepare(parent,{...draft(),userRating:100})).toThrow();expect(()=>prepare(parent,{...draft(),photoMediaIds:['not-a-native-id']})).toThrow();expect(writes).toEqual([]);
});
it('refuses scoped frozen create authority after account replacement',async()=>{
 const intent=PlacesClient.prepareManualIntent(await PlacesClient.observeCollection(list),draft({categoryTermId:root,subcategoryTermId:null}));useAuthStore.setState({accountId:id(900),generation:useAuthStore.getState().generation+1});await expect(PlacesClient.createManual(intent)).rejects.toThrow();expect(writes).toEqual([]);
});
it.each(['duplicate','category','invalid'])('rejects %s catalog data and omits locale to use configured default',async invalid=>{
 const term={id:root,category:'places',slug:'synthetic',parentId:null,position:0,label:'Synthetic',resolvedLocale:'fr'};
 const fetcher=vi.fn().mockResolvedValue(reply({version:'explorers-taxonomy-catalog/v1',category:'places',state:'CONFIGURED',catalogVersion:1,requestedLocale:null,defaultLocale:'fr',items:invalid==='duplicate'?[term,term]:[{...term,...(invalid==='category'?{category:'people'}:{unknown:true})}],nextCursor:null}));vi.stubGlobal('fetch',fetcher);await expect(PlacesClient.readTaxonomyCatalog()).rejects.toThrow();expect(fetcher.mock.calls[0][0]).not.toContain('locale=');
});
