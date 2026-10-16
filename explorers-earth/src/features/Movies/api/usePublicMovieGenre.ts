import {useEffect,useRef} from 'react';
import {publicProfileGatewayClient} from '../../PublicHome/api/publicProfileGatewayClient';
import {usePublicPagedResource,type PublicPagedState,type PublicPagePayload} from '../../PublicHome/api/usePublicPagedResource';
import {subscribePublicProfileInvalidation} from '../../PublicHome/api/publicProfileInvalidation';
import type {PublicProfilePageSize} from '../../PublicHome/api/publicProfilePagination';
function invalid():never{throw Error('PUBLIC_PROFILE_INVALID_RESPONSE');}
export function usePublicMovieGenre(username:string|undefined,genreSlug:string|undefined,options:{pageSize?:PublicProfilePageSize;enabled?:boolean}={}):PublicPagedState{
 const pageSize=options.pageSize??12,normalized=username?.trim().toLowerCase(),scope=normalized&&genreSlug?`${normalized}\u0000movies\u0000genre\u0000${genreSlug}`:undefined;
 const cursors=useRef(new Map<number,string|null>());
 const cursor=(data:any):string|null=>{const value=data?.nextCursor;if(value!==null&&(typeof value!=='string'||!value||new TextEncoder().encode(value).length>2048))return invalid();return value;};
 const rows=(data:any):unknown[]=>{if(!data?.genre||data.genre.slug!==genreSlug||typeof data.genre.documentId!=='string'||!Array.isArray(data.recommended_movies))return invalid();const seen=new Set<string>();for(const r of data.recommended_movies){if(!r||typeof r.documentId!=='string'||!r.documentId||seen.has(r.documentId))return invalid();seen.add(r.documentId);}cursor(data);return data.recommended_movies;};
 const read=async(offset:number,token:string|undefined,signal:AbortSignal,bypass:boolean)=>{const data=await publicProfileGatewayClient.movieGenrePage(username!,genreSlug!,{limit:pageSize,...(token?{cursor:token}:{})},signal,bypass);const selected=rows(data);if(selected.length>pageSize||cursor(data)!==null&&selected.length!==pageSize)return invalid();if(!signal.aborted){if(cursors.current.size>=1000)throw Error('PUBLIC_PROFILE_PAGINATION_LIMIT');cursors.current.set(offset+selected.length,cursor(data));}return data;};
 const state=usePublicPagedResource({scope,pageSize,enabled:Boolean(scope)&&(options.enabled??true),showLoadingOnRevalidation:false,
  readFirst:(signal,bypass)=>{cursors.current.clear();return read(0,undefined,signal,bypass);},
  readNext:(offset,signal,bypass)=>{const token=cursors.current.get(offset);if(!token)throw Error('PUBLIC_PROFILE_PAGINATION_LIMIT');return read(offset,token,signal,bypass);},
  readRows:rows,merge:(previous,next)=>{rows(previous);rows(next);if((previous as any).genre.documentId!==(next as any).genre.documentId)return invalid();const seen=new Set<string>();return {...next,recommended_movies:[...(previous as any).recommended_movies,...(next as any).recommended_movies].filter(r=>{if(seen.has(r.documentId))return false;seen.add(r.documentId);return true;})} as PublicPagePayload;}
 });
 useEffect(()=>{if(!scope)return;return subscribePublicProfileInvalidation(event=>{if(event.username.trim().toLowerCase()===normalized&&event.category==='public_movie')void state.refetch();});},[scope,normalized,state.refetch]);
 const hasMore=Boolean(state.data)&&cursor(state.data)!==null;
 return {...state,hasMore,loadMore:()=>hasMore?state.loadMore():Promise.resolve()};
}
