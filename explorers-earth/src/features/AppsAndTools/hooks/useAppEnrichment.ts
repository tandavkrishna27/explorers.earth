import {useEffect,useRef,useState} from 'react';
import useAuthStore from '../../../store/store';
import type {RecommendationObservation} from '../../../lib/explorersApiClient';
import {AppEnrichmentClient,type AppEnrichmentIntent} from '../api/appEnrichmentClient';
export function useAppEnrichment(observed:RecommendationObservation,onAccepted:()=>void){
 const generation=useAuthStore(s=>s.generation),accountId=useAuthStore(s=>s.accountId),authenticated=useAuthStore(s=>s.isAuthenticated);
 const scope=JSON.stringify([generation,accountId,authenticated,window.location.pathname,window.location.search,window.location.hash,observed.resourceId]),scopeRef=useRef(scope);scopeRef.current=scope;
 const [received,setReceived]=useState<{scope:string;data:Awaited<ReturnType<typeof AppEnrichmentClient.read>>}>(),[loading,setLoading]=useState(true),[error,setError]=useState(''),[readError,setReadError]=useState(''),[busy,setBusy]=useState(false),[conflict,setConflict]=useState(false),[revision,setRevision]=useState(0),[retry,setRetry]=useState<AppEnrichmentIntent>();
 const readController=useRef<AbortController>(),commandController=useRef<AbortController>(),commandScope=useRef(scope),busyRef=useRef(false);const mounted=useRef(true);
 const valid=(captured:string)=>{const state=useAuthStore.getState();return mounted.current&&scopeRef.current===captured&&state.isAuthenticated&&state.accountId===observed.accountId&&state.generation===observed.generation;};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;readController.current?.abort();commandController.current?.abort();};},[]);
 // A refreshed observation is read authority, never permission to discard an
 // unresolved command. Only leaving this owner/session/route/app releases it.
 useEffect(()=>{commandController.current?.abort();commandScope.current=scope;busyRef.current=false;setError('');setBusy(false);setRetry(undefined);setConflict(false);},[scope]);
 useEffect(()=>{const request=new AbortController();readController.current?.abort();readController.current=request;setReceived(undefined);setReadError('');setLoading(true);const captured=scope;
  if(!valid(captured)){setLoading(false);return()=>request.abort();}
  void AppEnrichmentClient.read(observed,request.signal).then(data=>{if(valid(captured)&&!request.signal.aborted)setReceived({scope:captured,data});}).catch(failure=>{if(valid(captured)&&!request.signal.aborted)setReadError(failure instanceof Error?failure.message:'Suggestions could not be loaded');}).finally(()=>{if(valid(captured)&&!request.signal.aborted)setLoading(false);});return()=>request.abort();
 },[scope,observed,revision]);
 const run=async(intent:AppEnrichmentIntent)=>{if(busyRef.current||conflict||!valid(scope))return;const captured=scope,request=new AbortController();commandController.current=request;commandScope.current=scope;busyRef.current=true;setBusy(true);setError('');setRetry(intent);
  try{await AppEnrichmentClient.execute(intent,request.signal);if(!valid(captured)||request.signal.aborted)return;setRetry(undefined);if(intent.operation==='acceptAppEnrichment')onAccepted();else setRevision(value=>value+1);}
  catch(failure){if(valid(captured)&&!request.signal.aborted){const status=(failure as {status?:number}).status;setConflict(status===409||status===422||status===404);setError(status===409?'The app or enrichment changed. Reload the editor before accepting again.':failure instanceof Error?failure.message:'Request failed. Retry the same request.');}}
  finally{if(valid(captured)&&!request.signal.aborted){busyRef.current=false;setBusy(false);}}
 };
 return {data:received?.scope===scope&&authenticated?received.data:undefined,loading,error:commandScope.current===scope?error||readError:readError,busy:commandScope.current===scope&&busy,conflict:commandScope.current===scope&&conflict,retry:commandScope.current===scope?retry:undefined,run,refresh:()=>setRevision(value=>value+1)};
}
