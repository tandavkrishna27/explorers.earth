import {useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import useAuthStore from '../../../store/store';
import type {CollectionObservation,RecommendationObservation} from '../../../lib/explorersApiClient';
import {PlacesClient,type CompletePlacesOwnerContent,type PlaceMembershipIntent,type ManualPlaceDraft} from './placesClient';
import type {PlaceCollectionDetails,PlaceEntityDetails} from '../../../../../tunes/shared/explorersPlaceContract';
import {invalidatePlaces} from '../hooks/usePlacesOwner';

// Ticket 5.1. Native Places commands, in their own module because api/query.ts is the
// retired Strapi consumer and Epic 8 removes it after checking callers.
//
// Every command keeps observation and route authority around each await, and each command
// intent is keyed so a retry of the same intent is the same command rather than a second
// one. setLocation is separate from updateList on purpose: moving a list is not the same
// edit as renaming it, and the two must not share a command key.
export function usePlacesCommands() {
 const generation=useAuthStore(state=>state.generation),accountId=useAuthStore(state=>state.accountId),location=useLocation();
 const scope=JSON.stringify([generation,accountId,location.pathname]);
 const current=useRef(scope);current.current=scope;
 const mounted=useRef(true),operation=useRef(0),controllers=useRef(new Set<AbortController>());
 const keys=useRef(new Map<string,string>()),memberships=useRef(new Map<string,PlaceMembershipIntent>());
 const collections=useRef(new Map<string,CollectionObservation>()),completeReads=useRef(new Map<string,CompletePlacesOwnerContent>());
 const recommendations=useRef(new Map<string,RecommendationObservation>()),choices=useRef(new Map<string,string>());
 const [pending,setPending]=useState(0);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controllers.current.forEach(controller=>controller.abort());};},[]);
 useEffect(()=>{controllers.current.forEach(controller=>controller.abort());keys.current.clear();memberships.current.clear();collections.current.clear();completeReads.current.clear();recommendations.current.clear();choices.current.clear();setPending(0);},[scope]);
 const forget=(signature:string)=>{keys.current.delete(signature);collections.current.delete(signature);completeReads.current.delete(signature);recommendations.current.delete(signature);};
 const begin=(group:string,signature:string)=>{const previous=choices.current.get(group);if(previous&&previous!==signature){forget(previous);memberships.current.delete(previous);}choices.current.set(group,signature);};
 const observeCollection=async(signature:string,id:string,assert:()=>void,signal:AbortSignal)=>{let observed=collections.current.get(signature);if(!observed){observed=await PlacesClient.observeCollection(id,signal);assert();collections.current.set(signature,observed);}return observed;};
 const observeLocationChild=async(signature:string,id:string,assert:()=>void,signal:AbortSignal)=>{let observed=collections.current.get(signature);if(!observed){observed=await PlacesClient.observeLocationChild(id,signal);assert();collections.current.set(signature,observed);}return observed;};
 const observeRecommendation=async(signature:string,id:string,assert:()=>void,signal:AbortSignal)=>{let observed=recommendations.current.get(signature);if(!observed){observed=await PlacesClient.observeRecommendation(id,signal);assert();recommendations.current.set(signature,observed);}return observed;};
 const observeComplete=async(signature:string,assert:()=>void,signal:AbortSignal)=>{let observed=completeReads.current.get(signature);if(!observed){observed=await PlacesClient.readCompleteOwner(signal);assert();completeReads.current.set(signature,observed);}return observed;};
 const key=(intent:string)=>{const existing=keys.current.get(intent);if(existing)return existing;const value=crypto.randomUUID();keys.current.set(intent,value);return value;};
 const run=async<T,>(action:(assert:()=>void,signal:AbortSignal)=>Promise<T>):Promise<T>=>{
  const captured=scope,token=++operation.current,controller=new AbortController();controllers.current.add(controller);setPending(value=>value+1);
  const assert=()=>{if(!mounted.current||current.current!==captured||operation.current!==token||controller.signal.aborted)throw new Error('Places owner or route changed');};
  try{assert();const result=await action(assert,controller.signal);assert();invalidatePlaces();return result;}
  finally{controllers.current.delete(controller);if(mounted.current&&current.current===captured)setPending(value=>Math.max(0,value-1));}
 };
 return {loading:pending>0,
  // A location list is created with its location in one command, so a list never exists
  // without the location it was created for.
  createList:(input:Parameters<typeof PlacesClient.createCollection>[0])=>run(async(assert,signal)=>{const signature=`create:${JSON.stringify(input)}`;begin('create',signature);assert();const result=await PlacesClient.createCollection(input,key(signature),signal);assert();forget(signature);return result;}),
  updateList:(id:string,patch:Parameters<typeof PlacesClient.updateCollection>[1])=>run(async(assert,signal)=>{const signature=`update:${id}:${JSON.stringify(patch)}`;begin(`collection:${id}`,signature);const observed=await observeCollection(signature,id,assert,signal);assert();const result=await PlacesClient.updateCollection(observed,patch,key(signature),signal);assert();forget(signature);return result;}),
  setLocation:(id:string,details:PlaceCollectionDetails)=>run(async(assert,signal)=>{const signature=`location:${id}:${JSON.stringify(details)}`;begin(`collection:${id}`,signature);const observed=await observeCollection(signature,id,assert,signal);assert();const result=await PlacesClient.setLocation(observed,details,key(signature),signal);assert();forget(signature);return result;}),
  // A list's own pin and its place in the order. Separate commands because pinning a
  // list and moving it are different decisions, and because a pin must not be lost by a
  // reorder that happened to carry a stale pin value.
  setListPin:(id:string,pinOrder:number|null)=>run(async(assert,signal)=>{const signature=`list-pin:${id}:${pinOrder}`;begin(`collection:${id}`,signature);const observed=await observeCollection(signature,id,assert,signal);assert();const result=await PlacesClient.updateCollection(observed,{pinOrder},key(signature),signal);assert();forget(signature);return result;}),
  setListOrder:(id:string,displayOrder:number)=>run(async(assert,signal)=>{const signature=`list-order:${id}:${displayOrder}`;begin(`collection:${id}`,signature);const observed=await observeCollection(signature,id,assert,signal);assert();const result=await PlacesClient.updateCollection(observed,{displayOrder},key(signature),signal);assert();forget(signature);return result;}),
  archiveList:(id:string)=>run(async(assert,signal)=>{const signature=`archive:${id}`;begin(`collection:${id}`,signature);const observed=await observeCollection(signature,id,assert,signal);assert();const result=await PlacesClient.archiveCollection(observed,key(signature),signal);assert();forget(signature);return result;}),
  // The legacy Visibility toggle is a list's public visibility and publication together,
  // because the public projection serves only published public lists.
  publishList:(id:string,visible:boolean)=>run(async(assert,signal)=>{const signature=`list-visibility:${id}:${visible}`;begin(`collection:${id}`,signature);const observed=await observeCollection(signature,id,assert,signal);assert();const result=await PlacesClient.updateCollection(observed,{visibility:visible?'public':'private',publicationState:visible?'published':'draft'},key(signature),signal);assert();forget(signature);return result;}),
  // The manual draft carries the typed Place facts and the creator's own context, so one
  // command both resolves the shared entity and files this account's recommendation.
  createPlace:(collectionId:string,draft:ManualPlaceDraft)=>run(async(assert,signal)=>{
   const signature=`create-place:${collectionId}:${JSON.stringify(draft)}`;begin(`collection:${collectionId}`,signature);
   const parent=await observeCollection(signature,collectionId,assert,signal);assert();
   const intent=PlacesClient.prepareManualIntent(parent,draft);assert();
   const result=await PlacesClient.createManual(intent,signal);assert();forget(signature);return result;
  }),
  // The legacy Recommendation_Type 'person' inside a Places list.
  createPerson:(collectionId:string,draft:ManualPlaceDraft)=>run(async(assert,signal)=>{
   const signature=`create-person:${collectionId}:${JSON.stringify(draft)}`;begin(`collection:${collectionId}`,signature);
   const parent=await observeCollection(signature,collectionId,assert,signal);assert();
   const intent=PlacesClient.prepareManualPersonIntent(parent,draft);assert();
   const result=await PlacesClient.createManual(intent,signal);assert();forget(signature);return result;
  }),
  // Ticket 5.2. Linking a Products or People list to a location, and unlinking it.
  // Keyed by both lists, so a retry of the same intent is the same command.
  setLocationLink:(locationId:string,childId:string,attached:boolean)=>run(async(assert,signal)=>{
   const signature=`location-link:${locationId}:${childId}:${attached}`;begin(`collection:${childId}`,signature);
   const location=await observeCollection(`${signature}:location`,locationId,assert,signal);assert();
   const child=await observeLocationChild(signature,childId,assert,signal);assert();
   const result=await PlacesClient.setLocationLink(location,child,attached,key(signature),signal);assert();
   forget(signature);forget(`${signature}:location`);return result;
  }),
  // Correcting the provider facts repoints this owner's recommendation at their own
  // corrected place rather than rewriting the shared one.
  correctFacts:(id:string,title:string,details:Partial<PlaceEntityDetails>)=>run(async(assert,signal)=>{
   const signature=`correct:${id}:${title}:${JSON.stringify(details)}`;begin(`recommendation:${id}`,signature);
   const observed=await observeRecommendation(signature,id,assert,signal);assert();
   const result=await PlacesClient.correctFacts(observed,title,details,key(`${signature}:entity`),key(signature),signal);assert();forget(signature);return result;
  }),
  updatePlace:(id:string,patch:Parameters<typeof PlacesClient.updateRecommendation>[1])=>run(async(assert,signal)=>{const signature=`update-place:${id}:${JSON.stringify(patch)}`;begin(`recommendation:${id}`,signature);const observed=await observeRecommendation(signature,id,assert,signal);assert();const result=await PlacesClient.updateRecommendation(observed,patch,key(signature),signal);assert();forget(signature);return result;}),
  archivePlace:(id:string)=>run(async(assert,signal)=>{const signature=`archive-place:${id}`;begin(`recommendation:${id}`,signature);const observed=await observeRecommendation(signature,id,assert,signal);assert();const result=await PlacesClient.archiveRecommendation(observed,key(signature),signal);assert();forget(signature);return result;}),
  publishPlace:(id:string,published:boolean)=>run(async(assert,signal)=>{const signature=`recommendation-publication:${id}:${published}`;begin(`recommendation:${id}`,signature);const observed=await observeRecommendation(signature,id,assert,signal);assert();const result=await PlacesClient.updateRecommendation(observed,{publicationState:published?'published':'draft'},key(signature),signal);assert();forget(signature);return result;}),
  reorderList:(id:string,orderedRecommendationIds:string[])=>run(async(assert,signal)=>{const signature=`reorder:${id}:${JSON.stringify(orderedRecommendationIds)}`;begin(`collection:${id}`,signature);const observed=await observeComplete(signature,assert,signal);assert();const result=await PlacesClient.reorderCollection(observed,id,orderedRecommendationIds,key(signature),signal);assert();forget(signature);return result;}),
  membership:(id:string,collectionId:string,attached:boolean)=>run(async(assert,signal)=>{
   const signature=JSON.stringify([scope,id,collectionId,attached]);begin(`membership:${id}:${collectionId}`,signature);let intent=memberships.current.get(signature);
   if(!intent){const parent=await PlacesClient.observeCollection(collectionId,signal);assert();const item=await PlacesClient.observeRecommendation(id,signal);assert();intent=PlacesClient.prepareMembershipIntent(parent,item,attached);memberships.current.set(signature,intent);}
   assert();const result=await PlacesClient.saveMembership(intent,signal);assert();memberships.current.delete(signature);return result;
  }),
  // No pin or top-picks commands: Places is not a top-pick category, so the endpoint
  // cannot accept it. A place's position is its order inside its list.
  // Provider imagery is imported into owned media before it is referenced, so a place
  // gallery never depends on a provider request to render.
  upload:(file:File,purpose:'recommendation'|'collection'='recommendation')=>run(async(assert,signal)=>{const signature=`upload:${purpose}:${file.name}:${file.size}:${file.lastModified}`;begin(`upload:${purpose}:${file.name}`,signature);assert();const result=await PlacesClient.upload(file,purpose,signal);assert();forget(signature);return result;}),
 };
}
