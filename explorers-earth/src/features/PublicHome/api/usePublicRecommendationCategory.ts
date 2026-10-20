import {completeGamesPreviews,gamePageCursor,mergeGamePage} from '../utils/publicProfileContent';
import {completeMoviesPreviews,moviePageCursor,mergeMoviePage} from '../../Movies/api/publicMoviesContinuation';
import { useEffect, useRef, useState } from "react";
import {completeBooksPreviews} from '../../Books/api/publicBooksContinuation';
import {completePeoplePreviews} from '../../People/api/publicPeopleSectorViewModel';
import { publicProfileGatewayClient, type PublicCategory } from "./publicProfileGatewayClient";
import { subscribePublicProfileInvalidation } from "./publicProfileInvalidation";
import { completePlacesPreviews, mergePublicPage, PUBLIC_PROFILE_PAGE_SIZE, readPublicPageRows } from "./publicProfilePagination";
import { usePublicPagedResource, type PublicPagedState, type PublicPagePayload } from "./usePublicPagedResource";

export type PublicCategoryGatewayState = PublicPagedState;

export function usePublicRecommendationCategory(
  username: string | undefined,
  category: PublicCategory,
  enabled: boolean,
  { revalidate = true }: { revalidate?: boolean } = {},
): PublicPagedState {
  const normalizedUsername = username?.trim().toLowerCase();
  const [peopleRevision,setPeopleRevision]=useState(0);
  const scope = normalizedUsername ? `${normalizedUsername}\u0000${category}${category==='people'?`\u0000${peopleRevision}`:''}` : undefined;
  const deferredInvalidation = useRef<string>();
  const movieCursors=useRef(new Map<number,string|null>());
  const peopleBudget=useRef({bytes:0});
  const richPage=async(value:Promise<unknown>,signal:AbortSignal,bypass:boolean,offset=0,budget=peopleBudget.current)=>{
    const page=await value;
    if(category==='places')return completePlacesPreviews(page,(slug,cursor)=>publicProfileGatewayClient.detailPage(username!,category,slug,{limit:12,cursor},signal,bypass),signal);
    if(category==='people')return completePeoplePreviews(page,(slug,cursor)=>publicProfileGatewayClient.detailPage(username!,category,slug,{limit:24,cursor},signal,bypass),signal,budget);
    if(category==='books')return completeBooksPreviews(page,(slug,cursor)=>publicProfileGatewayClient.detailPage(username!,category,slug,{limit:24,cursor},signal,bypass));
    if(category!=='movies'&&category!=='games')return page;
    const complete=await (category==='games'?completeGamesPreviews:completeMoviesPreviews)(page,(slug,cursor)=>publicProfileGatewayClient.detailPage(username!,category,slug,{limit:12,cursor},signal,bypass));
    const rows=readPublicPageRows(complete,category,false),cursor=(category==='games'?gamePageCursor:moviePageCursor)(complete,false);
    if(cursor!==null&&rows.length!==PUBLIC_PROFILE_PAGE_SIZE)throw Error('PUBLIC_PROFILE_INVALID_RESPONSE');
    if(!signal.aborted){if(movieCursors.current.size>=1000)throw Error('PUBLIC_PROFILE_PAGINATION_LIMIT');movieCursors.current.set(offset+rows.length,cursor);}return complete;
  };
  const state = usePublicPagedResource({
    scope, enabled, retainOnFirst:category!=='places',restartOnConflict:category==='places', bypassFirst: Boolean(scope && deferredInvalidation.current === scope),
    readFirst: (signal, bypass) => {movieCursors.current.clear();peopleBudget.current={bytes:0};return richPage(publicProfileGatewayClient.category(username!, category, signal, bypass),signal,bypass);},
    readNext: (offset, signal, bypass) => {const cursor=(category==='movies'||category==='games')?movieCursors.current.get(offset):`o${offset}`;if(!cursor)throw Error('PUBLIC_PROFILE_PAGINATION_LIMIT');return richPage(publicProfileGatewayClient.categoryPage(username!, category, { limit: PUBLIC_PROFILE_PAGE_SIZE, cursor }, signal, bypass),signal,bypass,offset);},
    peek: () => category==='places'?undefined:publicProfileGatewayClient.peekCategory(username!, category) as PublicPagePayload | undefined,
    readRows: (data) => readPublicPageRows(data, category, false),
    merge: (previous, next) => category==='games'?mergeGamePage(previous,next,false,PUBLIC_PROFILE_PAGE_SIZE):category==='movies'?mergeMoviePage(previous,next,false,PUBLIC_PROFILE_PAGE_SIZE):mergePublicPage(previous, next, category, false),
    showLoadingOnRevalidation: true, revalidate,
  });

  useEffect(() => {
    if (enabled || deferredInvalidation.current !== scope) deferredInvalidation.current = undefined;
    const eventCategory = {
      places: "public_recommendations", movies: "public_movie", books: "public_books", games: "public_games",
      guides: "public_guides", apps: "public_apps", products: "public_products", people: "public_people",
    }[category];
    if (!normalizedUsername) return;
    return subscribePublicProfileInvalidation((event) => {
      if (event.username.trim().toLowerCase() !== normalizedUsername || (event.category !== eventCategory && !(category==='people'&&event.category==='public_profile'))) return;
      // The listener stays mounted while hidden; only this scope can consume it.
      if(category==='people')setPeopleRevision(value=>value+1);
      else if (enabled) void state.refetch();
      else deferredInvalidation.current = scope;
    });
  }, [category, enabled, normalizedUsername, scope, state.refetch]);

  if(category!=='movies'&&category!=='games')return state;const hasMore=Boolean(state.data)&&(category==='games'?gamePageCursor:moviePageCursor)(state.data,false)!==null;return {...state,hasMore,loadMore:()=>hasMore?state.loadMore():Promise.resolve()};
}
