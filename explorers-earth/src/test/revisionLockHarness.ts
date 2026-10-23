import {vi} from 'vitest';
import useAuthStore from '../store/store';
import {recordViewedContent} from '../lib/viewedRevisions';
import {REVISION_CONFLICT_EVENT} from '../lib/revisionConflict';

// Shared by the per-module lost-update tests. It plays the owner API: editable reads answer
// with whatever revision the "server" holds now, and writes are recorded so a test can say
// which revision a command sent.
export const account='00000000-0000-4000-8000-000000000a01';
export const listId='00000000-0000-4000-8000-000000000a02';
export const itemId='00000000-0000-4000-8000-000000000a03';
const entityId='00000000-0000-4000-8000-000000000a04';
export type Category='places'|'products'|'people'|'apps'|'games'|'movies'|'books';
export type Write={url:string;method:string;body:Record<string,unknown>};

export function signIn(){
 const generation=useAuthStore.getState().beginVerification();
 useAuthStore.getState().acceptVerified(generation,{id:account,userId:'lock-user',username:'locks',email:'locks@example.invalid',onboardingStatus:'complete',revision:1});
}
const collectionCore=(category:Category,revision:number)=>({id:listId,accountId:account,category,title:'List',slug:'list',visibility:'private',publicationState:'draft',revision,description:null,heading:null,coverMediaId:null});
const collectionDetail=(category:Category,revision:number)=>({...collectionCore(category,revision),archived:false,displayOrder:0,pinOrder:null,categoryRevision:'9',
 ...(category==='places'?{placeLocation:{locationEntityId:null,locationSnapshot:null,instagramMediaUrl:null}}:{}),linkedLists:[]});
const kind:Record<Category,string>={places:'place',products:'product',people:'person',apps:'app',games:'game',movies:'movie',books:'book'};
const recommendationCore=(category:Category,revision:number)=>({id:itemId,accountId:account,category,entityId,userRating:null,publicationState:'draft',revision,mediaIds:[]});
const catalogRead={catalogState:'UNCONFIGURED',catalogVersion:0,defaultLocale:null};
const recommendationDetail=(category:Category,revision:number)=>({...recommendationCore(category,revision),archived:false,pin:null,note:null,categoryRevision:'9',entity:{id:entityId,kind:kind[category],title:'Canonical'},displayOverrides:{},displayTitle:'Canonical',
 ...(category==='places'?{placesTaxonomy:{...catalogRead,category:null,subcategory:null,selectionUnavailable:false}}:category==='people'?{peopleSector:{...catalogRead,sector:null,selectionUnavailable:false}}:category==='games'?{gamePresentation:{version:'explorers-manual-game/v1',origin:'manual',providerExternalId:null,providerFacts:null,images:[],coverMediaId:null}}:{})});

/** The server holds `server.list` / `server.item`; everything the SPA writes is captured. */
export function stubOwnerApi(category:Category,server:{list:number;item:number}){
 const writes:Write[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit={})=>{
  const method=options.method??'GET',json=(value:unknown)=>new Response(JSON.stringify(value),{status:200});
  if(method==='GET')return url.includes('/recommendations/')?json({recommendation:recommendationDetail(category,server.item)}):json({collection:collectionDetail(category,server.list)});
  const body=JSON.parse(String(options.body??'{}'));writes.push({url,method,body});
  if(method==='DELETE')return json({[url.includes('/recommendations/')?'recommendation':'collection']:{id:url.includes('/recommendations/')?itemId:listId,archived:true}});
  return url.includes('/recommendations/')?json({recommendation:{...recommendationCore(category,Number(body.expectedRevision)+1),...(body.publicationState?{publicationState:body.publicationState}:{})}}):json({collection:{...collectionCore(category,Number(body.expectedRevision)+1),...(body.publicationState?{publicationState:body.publicationState}:{}),...(body.visibility?{visibility:body.visibility}:{})}});
 }));
 return writes;
}
/** What the owner's screen displayed when the edit began. */
export function viewed(list:number,item:number){recordViewedContent({collections:[{id:listId,revision:list}],recommendations:[{id:itemId,revision:item}]});}
export function conflictEvents(){const seen=vi.fn();window.addEventListener(REVISION_CONFLICT_EVENT,seen);return seen;}
