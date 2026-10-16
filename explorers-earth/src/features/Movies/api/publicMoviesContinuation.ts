import {mergePublicPage,type PublicProfilePageSize} from '../../PublicHome/api/publicProfilePagination';
import type {PublicPagePayload} from '../../PublicHome/api/usePublicPagedResource';
export async function completeMoviesPreviews(raw:unknown,read:(slug:string,cursor:string)=>Promise<unknown>):Promise<PublicPagePayload>{
 if(!raw||typeof raw!=='object'||!Array.isArray((raw as any).movieLists))throw new Error('PUBLIC_PROFILE_INVALID_RESPONSE');
 type PreviewList={documentId:string;slug:string;recommended_movies:unknown[];recommended_movies_next_cursor?:string|null};
 const data=raw as PublicPagePayload & {movieLists:PreviewList[]};let requests=0,bytes=new TextEncoder().encode(JSON.stringify(data)).length;
 if(bytes>64*1024*1024||data.movieLists.length>24)throw new Error('PUBLIC_PROFILE_PAGINATION_LIMIT');
 const lists=[];
 for(const list of data.movieLists){
  if(!list||typeof list.documentId!=='string'||!Array.isArray(list.recommended_movies))throw new Error('PUBLIC_PROFILE_INVALID_RESPONSE');
  const movies=[...list.recommended_movies],seen=new Set<string>();let cursor=list.recommended_movies_next_cursor;
  while(cursor){
   if(typeof cursor!=='string'||new TextEncoder().encode(cursor).length>2048||seen.has(cursor)||++requests>1000)throw new Error('PUBLIC_PROFILE_PAGINATION_LIMIT');seen.add(cursor);
   const page=await read(list.slug,cursor) as PublicPagePayload & {movieLists:PreviewList[]};
   bytes+=new TextEncoder().encode(JSON.stringify(page)).length;if(bytes>64*1024*1024)throw new Error('PUBLIC_PROFILE_PAGINATION_LIMIT');
   const next=page?.movieLists?.[0];
   if(!next||page.movieLists.length!==1||next.documentId!==list.documentId||!Array.isArray(next.recommended_movies)||!next.recommended_movies.length&&next.recommended_movies_next_cursor)throw new Error('PUBLIC_PROFILE_INVALID_RESPONSE');
   movies.push(...next.recommended_movies);cursor=next.recommended_movies_next_cursor;
  }
  lists.push({...list,recommended_movies:movies,recommended_movies_next_cursor:null});
 }
 return {...data,movieLists:lists};
}

export function moviePageCursor(raw:unknown,detail:boolean):string|null{
 const data=raw as any,value=detail?data?.movieLists?.[0]?.recommended_movies_next_cursor:data?.nextCursor;
 if(value!==null&&(typeof value!=='string'||!value||new TextEncoder().encode(value).length>2048))throw Error('PUBLIC_PROFILE_INVALID_RESPONSE');return value;
}
export function mergeMoviePage(previous:PublicPagePayload,next:PublicPagePayload,detail:boolean,pageSize:PublicProfilePageSize):PublicPagePayload{
 const merged=mergePublicPage(previous,next,'movies',detail,pageSize),cursor=moviePageCursor(next,detail);
 if(detail)return {...merged,movieLists:[{...(merged.movieLists[0] as object),recommended_movies_next_cursor:cursor}]} as PublicPagePayload;
 return {...merged,nextCursor:cursor} as unknown as PublicPagePayload;
}
