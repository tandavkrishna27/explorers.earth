import {useState,useEffect,useCallback,useRef} from 'react';
import {explorersApiClient} from '../../../lib/explorersApiClient';
import type {MovieCandidate} from '../../../../../tunes/shared/explorersMovieContract';
import useAuthStore from '../../../store/store';
export function useTMDBSearch(query:string){
 const generation=useAuthStore(state=>state.generation);
 const [retryVersion,setRetryVersion]=useState(0);
 const [results,setResults]=useState<MovieCandidate[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null),[cursor,setCursor]=useState<string|null>(null),[loadingMore,setLoadingMore]=useState(false);
 const scope=useRef<{query:string;controller:AbortController;busy:boolean;seen:Set<string>}|null>(null);
 useEffect(()=>{const current={query:query.trim(),controller:new AbortController(),busy:false,seen:new Set<string>()};scope.current=current;setResults([]);setCursor(null);setError(null);setLoading(false);setLoadingMore(false);
  if(!current.query)return()=>current.controller.abort();
  const timer=setTimeout(()=>{setLoading(true);current.busy=true;void explorersApiClient.searchMovieCandidates({query:current.query,limit:24},current.controller.signal).then(page=>{if(scope.current!==current||current.controller.signal.aborted)return;setResults(page.items);setCursor(page.nextCursor);}).catch(reason=>{if(scope.current===current&&!current.controller.signal.aborted)setError(reason instanceof Error?reason.message:'Search failed. Please try again.');}).finally(()=>{current.busy=false;if(scope.current===current&&!current.controller.signal.aborted)setLoading(false);});},300);
  return()=>{clearTimeout(timer);current.controller.abort();};
 },[query,generation,retryVersion]);
 const loadMore=useCallback(async()=>{const current=scope.current;if(!current||current.busy||!cursor)return;current.busy=true;setLoadingMore(true);setError(null);
  try{if(current.seen.has(cursor))throw Error('Search continuation repeated. Search again.');const page=await explorersApiClient.searchMovieCandidates({query:current.query,limit:24,cursor},current.controller.signal);if(scope.current!==current||current.controller.signal.aborted)return;current.seen.add(cursor);setResults(previous=>{const ids=new Set(previous.map(item=>item.externalKind+':'+item.externalId));return [...previous,...page.items.filter(item=>!ids.has(item.externalKind+':'+item.externalId))];});setCursor(page.nextCursor);}
  catch(reason){if(scope.current===current&&!current.controller.signal.aborted)setError(reason instanceof Error?reason.message:'More results could not be loaded');}
  finally{current.busy=false;if(scope.current===current&&!current.controller.signal.aborted)setLoadingMore(false);}
 },[cursor]);
 const retry=useCallback(async()=>{const current=scope.current;
  if(!error||!current||current.busy||current.controller.signal.aborted||current.query!==query.trim()||!current.query)return;
  if(cursor){await loadMore();return;}
  // Only a user action starts another request; a busy upstream lease is never retried automatically.
  current.busy=true;setRetryVersion(previous=>previous+1);
 },[error,cursor,loadMore,query]);
 return {results,loading,error,hasMore:cursor!==null,loadingMore,loadMore,retry};
}
