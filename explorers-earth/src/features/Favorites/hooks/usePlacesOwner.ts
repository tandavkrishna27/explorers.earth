import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import useAuthStore from '../../../store/store';
import {readPlacesOwnerContent,type PlacesOwnerContent} from '../api/explorersAdapter';

// Ticket 5.1. The owner read for Places, replacing the Apollo/Strapi recommendationList
// queries. Same scoping rule as every other category: owner epoch and route are part of
// the cache key, so a signed-out or navigated-away read is never presented as the current
// owner's content.
export type PlacesPinInvalidation={accountId:string;generation:number;collectionId:string;collectionRevision:number;categoryContentRevision:string};
const changes=new EventTarget();export const invalidatePlaces=(fences?:PlacesPinInvalidation)=>changes.dispatchEvent(new CustomEvent('change',{detail:fences}));
// Added finding A. The read fence floor must be monotone in BOTH components. The original
// floor compared only categoryContentRevision with `>=`, so an event carrying an EQUAL
// categoryContentRevision and a LOWER collectionRevision replaced the floor wholesale and
// silently weakened the collection fence.
//
// Added finding A, second pass. "Monotone in both" was only true WITHIN one collection. The
// floor was a single slot, so when the incoming collectionId differed and the category
// revisions were EQUAL it kept the previous fence outright and collection B's own
// collectionRevision floor was never installed at all - two saves in quick succession whose
// category revisions happened to land equal left B fenced by the category floor only. That
// was strictly no worse than the pre-fix behaviour, not a regression, but it made the claim
// false. The floor is now PER COLLECTION: a Map keyed by collectionId, so switching
// collection can only add a floor, never move or drop one. Nothing is relaxed in any
// direction, and the floor is still permanent - only the existing explicit refresh() budget
// reset touches recovery, and nothing clears a floor.
export type PlacesFenceFloor=Readonly<{accountId:string;generation:number;categoryContentRevision:string;collections:ReadonlyMap<string,number>}>;
export function advancePlacesFence(previous:PlacesFenceFloor|undefined,next:PlacesPinInvalidation):PlacesFenceFloor{
 const fresh=!previous||previous.accountId!==next.accountId||previous.generation!==next.generation;
 const collections=new Map(fresh?[]:previous!.collections);
 // Floor keys are lowercased because the server may emit uppercase UUIDs while committed
 // ids come through placePinsIdSchema already lowercased. Keying raw on one side and
 // normalised on the other made the lookup miss, which failed the collection component OPEN.
 const key=next.collectionId.toLowerCase();
 const floor=collections.get(key);
 collections.set(key,floor===undefined?next.collectionRevision:Math.max(floor,next.collectionRevision));
 return {accountId:next.accountId,generation:next.generation,
  categoryContentRevision:fresh?next.categoryContentRevision:String(Math.max(Number(previous!.categoryContentRevision),Number(next.categoryContentRevision))),
  collections};
}
// Finding 7. A lagging replica trips the read fence. The fence stays, but the read gets a
// bounded number of automatic re-reads before the error is surfaced, and an explicit
// refresh() resets that budget so "Discard draft and reload" is a real recovery path
// rather than a guaranteed re-trip. This is local retry behaviour, not a server policy.
const STALE_READ_RETRIES=3,STALE_READ_BACKOFF_MS=50;
export class PlacesReadBehindError extends Error{constructor(){super('Places read is older than the saved pins. Reload the list.');this.name='PlacesReadBehindError';}}
/** `keep` retains the last read of the same owner and route while a refresh is in flight, so a screen that triggered the refresh is not replaced by its loading state. */
export function usePlacesOwner(listId?:string,enabled=true,keep=false){
 // Finding 2. The fetch scope is the abort/authority token AND the React cache key, so
 // anything added here clears content and re-runs the whole paginated owner read. It must
 // therefore carry owner epoch and route path ONLY.
 //
 // listId and location.key are deliberately absent. readPlacesOwnerContent does not take a
 // listId - it is a data memo filter (see `data` below) - so including it forced a full
 // re-read with an empty-state flash on every city switch and on every asynchronously
 // resolved fetchedListId, across nine call sites that never asked for one. location.key
 // additionally re-read on any same-path navigate(...,{replace:true}).
 //
 // This does not reopen a cross-list draft leak: PlacePinsEditor keeps listId in its OWN
 // scope and its [scope] effect clears the draft on list change.
 const generation=useAuthStore(state=>state.generation),accountId=useAuthStore(state=>state.accountId),location=useLocation(),scope=JSON.stringify([generation,accountId,location.pathname]);
 const [received,setReceived]=useState<{scope:string;content:PlacesOwnerContent}>(),[loading,setLoading]=useState(enabled),[error,setError]=useState<Error>(),[revision,setRevision]=useState(0);const attempt=useRef(0),minimum=useRef<PlacesFenceFloor>(),behind=useRef(0);
 // Finding 7. An explicit refresh resets the stale-read retry budget; an internal retry
 // does not, so the recovery path is always bounded.
 const retry=useCallback(()=>setRevision(value=>value+1),[]);
 const refresh=useCallback(()=>{behind.current=0;setRevision(value=>value+1);},[]);
 useEffect(()=>{const change=(event:Event)=>{const fences=(event as CustomEvent<PlacesPinInvalidation|undefined>).detail;if(fences&&(fences.accountId!==accountId||fences.generation!==generation))return;if(fences)minimum.current=advancePlacesFence(minimum.current?.accountId===accountId&&minimum.current?.generation===generation?minimum.current:undefined,fences);refresh();};changes.addEventListener('change',change);return()=>changes.removeEventListener('change',change);},[refresh,accountId,generation]);
 useEffect(()=>{
  const controller=new AbortController(),identity=++attempt.current;let timer:ReturnType<typeof setTimeout>|undefined;
  const live=()=>!controller.signal.aborted&&attempt.current===identity;
  setReceived(previous=>keep&&previous?.scope===scope?previous:undefined);setError(undefined);if(!enabled||!accountId){setLoading(false);return()=>controller.abort();}
  setLoading(true);
  void readPlacesOwnerContent(controller.signal).then(content=>{
   if(!live())return;
   const fence=minimum.current;
   // The fence itself is unchanged - a read behind the saved pins is still refused. It is
   // now checked against EVERY floored collection present in the read rather than against
   // one slot, which is the per-collection floor above being honoured, not a relaxation.
   if(fence&&fence.accountId===accountId&&fence.generation===generation
    &&(Number(content.observation.revision)<Number(fence.categoryContentRevision)
     ||content.observation.collections.some(row=>{const floor=fence.collections.get(row.id.toLowerCase());return floor!==undefined&&row.revision<floor;})))throw new PlacesReadBehindError();
   behind.current=0;setReceived({scope,content});
  }).catch(failure=>{
   if(!live())return;
   // Finding 7. A lagging replica gets a bounded set of automatic re-reads before the
   // error is surfaced, so the grid is not left permanently errored with no way back.
   if(failure instanceof PlacesReadBehindError&&behind.current<STALE_READ_RETRIES){behind.current++;timer=setTimeout(()=>{if(live())retry();},STALE_READ_BACKOFF_MS);return;}
   setError(failure instanceof Error?failure:new Error('Places could not be loaded'));
  }).finally(()=>{if(live()&&!timer)setLoading(false);});
  return()=>{controller.abort();if(timer)clearTimeout(timer);};
 },[scope,enabled,revision,accountId,generation,retry,keep]);
 const content=received?.scope===scope?received.content:undefined;
 // The legacy consumers read recommendationLists, and one of them reads a single list, so
 // both shapes come from the one read rather than from two different queries.
 const data=useMemo(()=>content?{recommendationLists:content.view.lists.filter(list=>!listId||list.documentId===listId)}:undefined,[content,listId]);
 return {scope,state:{content,data,loading,error},refresh,observations:content,content,data,loading,error,refetch:refresh};
}
