import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { category, categoryPage, peekCategory,detailPage } = vi.hoisted(() => ({ category: vi.fn(), categoryPage: vi.fn(), peekCategory: vi.fn(),detailPage:vi.fn() }));

vi.mock("../publicProfileGatewayClient", () => ({
  publicProfileGatewayClient: { category, categoryPage, peekCategory,detailPage },
}));

import { usePublicRecommendationCategory } from "../usePublicRecommendationCategory";
import { publishPublicProfileInvalidation } from "../publicProfileInvalidation";
it('completes every Places preview using the addressed list cursor before exposing the category',async()=>{
 const placeList=(name:string,start:number,count:number,cursor:string|null)=>({documentId:name,slug:name,collection_revision:'4',eligibility_fingerprint:'a'.repeat(64),category_content_revision:'9',eligible_item_count:26,eligible_pin_count:14,recommended_places:Array.from({length:count},(_,i)=>({documentId:`${name}-${start+i}`})),recommended_places_next_cursor:cursor});
 category.mockResolvedValueOnce({recommendationLists:[placeList('synthetic-one',0,12,'one.first'),placeList('synthetic-two',0,12,'two.first')]});
 detailPage.mockImplementation(async(_username,_category,slug,query)=>({recommendationLists:[placeList(slug,query.cursor.endsWith('first')?12:24,query.cursor.endsWith('first')?12:2,query.cursor.endsWith('first')?`${slug==='synthetic-one'?'one':'two'}.last`:null)]}));
 const {result}=renderHook(()=>usePublicRecommendationCategory('alice','places',true));
 await waitFor(()=>expect(result.current.loading).toBe(false));
 expect(result.current.error).toBeNull();expect(result.current.data?.recommendationLists).toHaveLength(2);
 for(const list of result.current.data!.recommendationLists as any[])expect(list.recommended_places).toHaveLength(26);
 expect(detailPage.mock.calls.map(call=>[call[2],call[3].cursor])).toEqual([['synthetic-one','one.first'],['synthetic-one','one.last'],['synthetic-two','two.first'],['synthetic-two','two.last']]);
});
it('uses the actual signed Games category cursor rather than fabricated offset authority',async()=>{
 category.mockResolvedValueOnce({gameLists:Array.from({length:12},(_,i)=>({documentId:'g'+i,slug:'g'+i,recommended_games:[],nextCursor:null})),topPicks:[],nextCursor:'signed.games'});
 categoryPage.mockImplementationOnce(async(_username,_category,query)=>{if(query.cursor!=='signed.games')throw Error('PUBLIC_PROFILE_400');return{gameLists:[{documentId:'last',slug:'last',recommended_games:[],nextCursor:null}],topPicks:[],nextCursor:null};});
 const {result}=renderHook(()=>usePublicRecommendationCategory('reader','games',true));await waitFor(()=>expect(result.current.loading).toBe(false));await act(()=>result.current.loadMore());
 expect(categoryPage).toHaveBeenLastCalledWith('reader','games',{limit:12,cursor:'signed.games'},expect.any(AbortSignal),false);expect(result.current.hasMore).toBe(false);
});

describe("usePublicRecommendationCategory", () => {
  beforeEach(() => {
    category.mockReset();
    categoryPage.mockReset();
    peekCategory.mockReset();
    detailPage.mockReset();
  });

  it("uses the server gateway only for an enabled public category", async () => {
    category.mockResolvedValueOnce({ appLists: [] });
    const { result } = renderHook(() => usePublicRecommendationCategory("tk2727", "apps", true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(category).toHaveBeenCalledWith("tk2727", "apps", expect.any(AbortSignal), false);
    expect(result.current.data).toEqual({ appLists: [] });
  });

  it("does not request disabled categories", async () => {
    renderHook(() => usePublicRecommendationCategory("tk2727", "apps", false));
    await Promise.resolve();
    expect(category).not.toHaveBeenCalled();
  });

  it("shows cached category data while it revalidates through the gateway", async () => {
    let settleRequest: ((value: { appLists: never[] }) => void) | undefined;
    peekCategory.mockReturnValue({ appLists: [] });
    category.mockImplementationOnce(() => new Promise((resolve) => { settleRequest = resolve; }));

    const { result } = renderHook(() => usePublicRecommendationCategory("tk2727", "apps", true));

    await waitFor(() => expect(category).toHaveBeenCalledTimes(1));
    expect(result.current.data).toEqual({ appLists: [] });
    expect(result.current.loading).toBe(true);

    await act(async () => { settleRequest?.({ appLists: [] }); });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("resolves refetch only after the replacement request settles", async () => {
    let completeRetry: ((value: { appLists: never[] }) => void) | undefined;
    category
      .mockResolvedValueOnce({ appLists: [] })
      .mockImplementationOnce(() => new Promise((resolve) => { completeRetry = resolve; }));
    const { result } = renderHook(() => usePublicRecommendationCategory("tk2727", "apps", true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let settled = false;
    let retry: Promise<void> = Promise.resolve();
    act(() => { retry = result.current.refetch().then(() => { settled = true; }); });
    await waitFor(() => expect(category).toHaveBeenCalledTimes(2));
    expect(settled).toBe(false);

    await act(async () => { completeRetry?.({ appLists: [] }); await retry; });
    expect(settled).toBe(true);
    expect(category).toHaveBeenLastCalledWith("tk2727", "apps", expect.any(AbortSignal), true);
  });

  it("refreshes only its matching category with bypass-cache after a matching profile event", async () => {
    category.mockResolvedValue({ appLists: [] });
    renderHook(() => usePublicRecommendationCategory("alice", "apps", true));
    await waitFor(() => expect(category).toHaveBeenCalledTimes(1));

    act(() => publishPublicProfileInvalidation({ accountDocumentId: "account-alice", username: "alice", category: "public_books", action: "pin", eventId: "other-category" }));
    await Promise.resolve();
    expect(category).toHaveBeenCalledTimes(1);

    act(() => publishPublicProfileInvalidation({ accountDocumentId: "account-alice", username: "alice", category: "public_apps", action: "publish", eventId: "matching-category" }));
    await waitFor(() => expect(category).toHaveBeenCalledTimes(2));
    expect(category).toHaveBeenLastCalledWith("alice", "apps", expect.any(AbortSignal), true);
  });

  it("retains a matching invalidation while hidden and bypasses cache when the shell enables the category", async () => {
    category.mockResolvedValue({ appLists: [] });
    const { rerender } = renderHook(({ enabled }) => usePublicRecommendationCategory("alice", "apps", enabled), {
      initialProps: { enabled: false },
    });
    await Promise.resolve();
    expect(category).not.toHaveBeenCalled();

    act(() => publishPublicProfileInvalidation({ accountDocumentId: "account-alice", username: "alice", category: "public_apps", action: "publish", eventId: "published-while-hidden" }));
    rerender({ enabled: true });

    await waitFor(() => expect(category).toHaveBeenCalledTimes(1));
    expect(category).toHaveBeenCalledWith("alice", "apps", expect.any(AbortSignal), true);
  });

  it("clears a deferred hidden invalidation when username or category changes", async () => {
    category.mockResolvedValue({ appLists: [] });
    const { rerender } = renderHook(
      ({ username, category: categoryName, enabled }) => usePublicRecommendationCategory(username, categoryName, enabled),
      { initialProps: { username: "alice", category: "apps" as "apps"|"books", enabled: false } },
    );

    act(() => publishPublicProfileInvalidation({ accountDocumentId: "account-alice", username: "alice", category: "public_apps", action: "publish", eventId: "alice-hidden-apps" }));
    rerender({ username: "bob", category: "apps", enabled: true });
    await waitFor(() => expect(category).toHaveBeenCalledTimes(1));
    expect(category).toHaveBeenLastCalledWith("bob", "apps", expect.any(AbortSignal), false);

    category.mockClear();
    rerender({ username: "alice", category: "books", enabled: true });
    await waitFor(() => expect(category).toHaveBeenCalledTimes(1));
    expect(category).toHaveBeenLastCalledWith("alice", "books", expect.any(AbortSignal), false);
  });

  it("does not let an older category response overwrite a matching invalidation response", async () => {
    let resolveOld!: (value: unknown) => void;
    category.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ appLists: [{ documentId: "fresh" }] });
    const { result } = renderHook(() => usePublicRecommendationCategory("alice", "apps", true));
    await waitFor(() => expect(category).toHaveBeenCalledTimes(1));

    act(() => publishPublicProfileInvalidation({ accountDocumentId: "account-alice", username: "alice", category: "public_apps", action: "pin", eventId: "fresh-category" }));
    await waitFor(() => expect(category).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.data).toEqual({ appLists: [{ documentId: "fresh" }] }));
    await act(async () => resolveOld({ appLists: [{ documentId: "stale" }] }));
    expect(result.current.data).toEqual({ appLists: [{ documentId: "fresh" }] });
  });

  it("invalidates cached continuation pages for the whole refreshed generation", async () => {
    const first = Array.from({ length: 12 }, (_, i) => ({ documentId: `first-${i}` }));
    category.mockResolvedValue({ appLists: first });
    categoryPage.mockImplementation(async (_username, _category, _page, _signal, bypass) => ({
      appLists: bypass ? Array.from({ length: 12 }, (_, i) => ({ documentId: `published-${i}` })) : [{ documentId: "unpublished" }],
    }));
    const { result } = renderHook(() => usePublicRecommendationCategory("alice", "apps", true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.data?.appLists).toContainEqual({ documentId: "unpublished" });
    act(() => publishPublicProfileInvalidation({ accountDocumentId: "alice", username: "alice", category: "public_apps", action: "publish", eventId: "pagination-invalidation" }));
    await waitFor(() => expect(result.current.data?.appLists).toHaveLength(12));
    await act(async () => { await result.current.loadMore(); await result.current.loadMore(); });
    expect(categoryPage).toHaveBeenNthCalledWith(2, "alice", "apps", { limit: 12, cursor: "o12" }, expect.any(AbortSignal), true);
    expect(categoryPage).toHaveBeenNthCalledWith(3, "alice", "apps", { limit: 12, cursor: "o24" }, expect.any(AbortSignal), true);
    expect(result.current.data?.appLists).not.toContainEqual({ documentId: "unpublished" });
  });
});
it('completes Games child previews with their independent signed limit12 cursor',async()=>{
 category.mockResolvedValueOnce({gameLists:[{documentId:'g',slug:'g',recommended_games:[{documentId:'first'}],nextCursor:'signed.child'}],topPicks:[],nextCursor:null});
 detailPage.mockResolvedValueOnce({gameLists:[{documentId:'g',slug:'g',recommended_games:[{documentId:'last'}],nextCursor:null}]});
 const {result}=renderHook(()=>usePublicRecommendationCategory('reader','games',true));await waitFor(()=>expect(result.current.loading).toBe(false));
 expect(detailPage).toHaveBeenCalledWith('reader','games','g',{limit:12,cursor:'signed.child'},expect.any(AbortSignal),false);
 expect((result.current.data as any).gameLists[0].recommended_games.map((row:any)=>row.documentId)).toEqual(['first','last']);expect(result.current.hasMore).toBe(false);
});
it('denies a Games child continuation crossing collection identity rather than appending it',async()=>{
 category.mockResolvedValueOnce({gameLists:[{documentId:'g',slug:'g',recommended_games:[],nextCursor:'signed.child'}],topPicks:[],nextCursor:null});
 detailPage.mockResolvedValueOnce({gameLists:[{documentId:'wrong',slug:'wrong',recommended_games:[{documentId:'bad'}],nextCursor:null}]});
 const {result}=renderHook(()=>usePublicRecommendationCategory('reader','games',true));await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.error).toBeTruthy();expect(result.current.data).toBeUndefined();
});

it('uses signed Movie category cursors and stops on authoritative null',async()=>{
 category.mockResolvedValueOnce({movieLists:Array.from({length:12},(_,i)=>({documentId:'l'+i,slug:'list'+i,recommended_movies:[],recommended_movies_next_cursor:null})),topPicks:[],nextCursor:'signed.category'});
 categoryPage.mockResolvedValueOnce({movieLists:[{documentId:'last',slug:'last',recommended_movies:[],recommended_movies_next_cursor:null}],topPicks:[],nextCursor:null});
 const {result}=renderHook(()=>usePublicRecommendationCategory('reader','movies',true));await waitFor(()=>expect(result.current.loading).toBe(false));await act(()=>result.current.loadMore());
 expect(categoryPage).toHaveBeenLastCalledWith('reader','movies',{limit:12,cursor:'signed.category'},expect.any(AbortSignal),false);expect(result.current.hasMore).toBe(false);
});
