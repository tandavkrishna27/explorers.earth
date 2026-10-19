import type { MoviesOwnerObserver } from './moviesOwnerDiagnostic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useAuthStore from '../../../store/store';
import { explorersApiClient } from '../../../lib/explorersApiClient';
import { readMoviesOwnerContent, moviesCommandKey, updateMovieList, type MoviesOwnerContent } from './moviesClient';
import type { MovieList } from '../types';

const invalidations = new EventTarget();
export const invalidateMovies = () => invalidations.dispatchEvent(new Event('change'));
/** `keep` retains the last read while a refresh of the same owner is in flight. */
export function useMoviesOwner(listId?: string, enabled = true, observer?: MoviesOwnerObserver, keep = false) {
 const generation=useAuthStore(state=>state.generation), accountId=useAuthStore(state=>state.accountId);
 const [receivedContent,setContent]=useState<MoviesOwnerContent>();
 const [receivedScope,setReceivedScope]=useState('');
 const scopeKey=JSON.stringify([generation,accountId]);
 const content=receivedScope===scopeKey?receivedContent:undefined;
 const [loading,setLoading]=useState(enabled),[error,setError]=useState<Error>();
 const [revision,setRevision]=useState(0);const active=useRef(0);
 const observerRef=useRef(observer);observerRef.current=observer;
 const refetch=useCallback(()=>setRevision(value=>value+1),[]);
 useEffect(()=>{invalidations.addEventListener('change',refetch);return()=>invalidations.removeEventListener('change',refetch);},[refetch]);
 useEffect(()=>{const controller=new AbortController(),attempt=++active.current;if(!keep)setContent(undefined);setError(undefined);
  const observe:MoviesOwnerObserver=event=>{const current=useAuthStore.getState();if(controller.signal.aborted||active.current!==attempt||current.generation!==generation||current.accountId!==accountId)return;try{observerRef.current?.(event);}catch{/* observational */}};
  if(!enabled||!accountId){observe({owner:!enabled?'disabled':'no-account'});setLoading(false);return()=>controller.abort();}
  setLoading(true);observe({owner:'pending'});void readMoviesOwnerContent(controller.signal,observe).then(value=>{if(!controller.signal.aborted&&active.current===attempt){setReceivedScope(scopeKey);setContent(value);observe({owner:'accepted'});}}).catch(value=>{if(!controller.signal.aborted&&active.current===attempt){setError(value instanceof Error?value:new Error('Movies could not be loaded'));observe({owner:'rejected'});}}).finally(()=>{if(!controller.signal.aborted&&active.current===attempt)setLoading(false);});
  return()=>controller.abort();
 },[generation,accountId,enabled,revision,scopeKey,keep]);
 const data=useMemo(()=>content?{movieLists:content.lists.filter(list=>!listId||list.documentId===listId) as MovieList[]}:undefined,[content,listId]);
 return {content,data,loading,error,refetch};
}
export function useMovieGenres(){
 const generation=useAuthStore(state=>state.generation);const [data,setData]=useState<{movieCategories:{documentId:string;genre_name:string}[]}>();const [error,setError]=useState<Error>();
 useEffect(()=>{const controller=new AbortController();setData(undefined);setError(undefined);void explorersApiClient.getMovieGenres(controller.signal).then(result=>{if(!controller.signal.aborted)setData({movieCategories:result.items.map(term=>({documentId:term.id,genre_name:term.label}))});}).catch(value=>{if(!controller.signal.aborted)setError(value instanceof Error?value:new Error('Genres unavailable'));});return()=>controller.abort();},[generation]);
 return {data,error};
}
export async function createMovieList(input:{List_Name:string;list_description?:string|null;slug:string}){
 const collection=await explorersApiClient.createMyCollection({category:'movies',title:input.List_Name,description:input.list_description??null,slug:input.slug,visibility:'private',publicationState:'draft'},moviesCommandKey());invalidateMovies();return collection;
}
export async function changeMovieList(id:string,patch:Parameters<typeof updateMovieList>[1]){const result=await updateMovieList(id,patch);invalidateMovies();return result;}
export async function archiveMovieList(id:string){const observed=await explorersApiClient.getMyEditableCollection(id);await explorersApiClient.archiveMyCollection(observed,moviesCommandKey());invalidateMovies();}
export async function archiveMovie(id:string){const observed=await explorersApiClient.getMyEditableRecommendation(id);await explorersApiClient.archiveMyRecommendation(observed,moviesCommandKey());invalidateMovies();}
export async function toggleMoviePin(id:string,pinned:boolean){const content=await readMoviesOwnerContent();const pins=content.observation.topPicks??[];const member=content.observation.memberships.find(value=>value.recommendationId===id&&!value.collectionArchived&&!value.recommendationArchived);if(!member)throw Error('Movie membership unavailable');const next=pins.filter(pin=>pin.recommendationId!==id).map(pin=>({recommendationId:pin.recommendationId,collectionId:pin.collectionId}));if(pinned)next.push({recommendationId:id,collectionId:member.collectionId});await explorersApiClient.setMyCategoryTopPicks(content.observation,next,moviesCommandKey());invalidateMovies();}
