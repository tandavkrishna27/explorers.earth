import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { detail, detailPage } = vi.hoisted(() => ({ detail: vi.fn(), detailPage: vi.fn() }));
vi.mock("../publicProfileGatewayClient", () => ({ publicProfileGatewayClient: { detail, detailPage } }));
import { usePublicProfileDetail } from "../usePublicProfileDetail";
import { publishPublicProfileInvalidation } from "../publicProfileInvalidation";
it('uses the actual signed Games list cursor and honors a terminal full page',async()=>{
 detail.mockResolvedValueOnce({gameLists:[{documentId:'list',recommended_games:Array.from({length:12},(_,i)=>({documentId:'g'+i})),nextCursor:'signed.games.list'}]});
 detailPage.mockImplementationOnce(async(_username,_category,_slug,query)=>{if(query.cursor!=='signed.games.list')throw Error('PUBLIC_PROFILE_400');return{gameLists:[{documentId:'list',recommended_games:Array.from({length:12},(_,i)=>({documentId:'last'+i})),nextCursor:null}]};});
 const {result}=renderHook(()=>usePublicProfileDetail('reader','games','list'));await waitFor(()=>expect(result.current.loading).toBe(false));await act(()=>result.current.loadMore());
 expect(detailPage).toHaveBeenLastCalledWith('reader','games','list',{limit:12,cursor:'signed.games.list'},expect.any(AbortSignal),false);expect(result.current.hasMore).toBe(false);
});

const page = (start = 0, count = 12, parent = "parent") => ({ appLists: [{ documentId: parent, List_Name: "Original", recommended_apps: Array.from({ length: count }, (_, i) => ({ documentId: `app-${start + i}` })) }] });
const places=(start=0,count=12,cursor:string|null='signed.first',revision='1',total=30)=>({recommendationLists:[{documentId:'places-list',slug:'synthetic',collection_revision:revision,eligibility_fingerprint:'a'.repeat(64),category_content_revision:revision,eligible_item_count:total,eligible_pin_count:Math.min(14,total),recommended_places:Array.from({length:count},(_,i)=>({documentId:`place-${start+i}`})),recommended_places_next_cursor:cursor}]});
describe('Places scoped seek detail',()=>{
 beforeEach(()=>{detail.mockReset();detailPage.mockReset();});
 it('uses server child cursors beyond 24 rows and stops on the terminal page',async()=>{
  detail.mockResolvedValue(places());detailPage.mockResolvedValueOnce(places(12,12,'signed.second')).mockResolvedValueOnce(places(24,6,null));
  const {result}=renderHook(()=>usePublicProfileDetail('alice','places','synthetic'));
  await waitFor(()=>expect(result.current.loading).toBe(false));
  await act(()=>result.current.loadMore());await act(()=>result.current.loadMore());
  expect(detailPage.mock.calls.map(c=>c[3])).toEqual([{limit:12,cursor:'signed.first'},{limit:12,cursor:'signed.second'}]);
  expect((result.current.data?.recommendationLists[0] as any).recommended_places).toHaveLength(30);expect(result.current.hasMore).toBe(false);
 });
 it('restarts a stale continuation with cleared accumulated rows and a fresh cursor map',async()=>{
  detail.mockResolvedValueOnce(places()).mockResolvedValueOnce(places(100,12,'fresh.first','2',18));
  detailPage.mockRejectedValueOnce(Error('PUBLIC_PROFILE_409')).mockResolvedValueOnce(places(112,6,null,'2',18));
  const {result}=renderHook(()=>usePublicProfileDetail('alice','places','synthetic'));
  await waitFor(()=>expect(result.current.loading).toBe(false));await act(()=>result.current.loadMore());
  await waitFor(()=>expect((result.current.data?.recommendationLists[0] as any)?.collection_revision).toBe('2'));
  await act(()=>result.current.loadMore());
  expect(detailPage.mock.calls[1][3]).toEqual({limit:12,cursor:'fresh.first'});
  expect((result.current.data?.recommendationLists[0] as any).recommended_places.every((p:any)=>!/^place-[0-9]$/.test(p.documentId))).toBe(true);
 });
 it('surfaces a first-page conflict without retrying in a loop',async()=>{
  detail.mockRejectedValue(Error('PUBLIC_PROFILE_409'));
  const {result}=renderHook(()=>usePublicProfileDetail('alice','places','synthetic'));
  await waitFor(()=>expect(result.current.error).toEqual(Error('PUBLIC_PROFILE_409')));
  expect(detail).toHaveBeenCalledTimes(1);expect(result.current.data).toBeUndefined();
 });
 it('follows an actual cursor from a short transport page',async()=>{
  detail.mockResolvedValue(places(0,3,'signed.short','1',5));detailPage.mockResolvedValue(places(3,2,null,'1',5));
  const {result}=renderHook(()=>usePublicProfileDetail('alice','places','synthetic'));
  await waitFor(()=>expect(result.current.hasMore).toBe(true));await act(()=>result.current.loadMore());
  expect(detailPage.mock.calls[0][3].cursor).toBe('signed.short');expect((result.current.data?.recommendationLists[0] as any).recommended_places).toHaveLength(5);
 });
 it('clears accumulated rows immediately during invalidation and ignores an aborted old continuation',async()=>{
  let resolveOld!:(v:unknown)=>void,resolveFirst!:(v:unknown)=>void;
  detail.mockResolvedValueOnce(places()).mockImplementationOnce(()=>new Promise(resolve=>{resolveFirst=resolve;}));
  detailPage.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}));
  const {result}=renderHook(()=>usePublicProfileDetail('alice','places','synthetic'));
  await waitFor(()=>expect(result.current.loading).toBe(false));act(()=>{void result.current.loadMore();});
  const oldSignal=detailPage.mock.calls[0][4];
  act(()=>publishPublicProfileInvalidation({username:'alice',accountDocumentId:'alice',category:'public_recommendations',action:'content-changed',eventId:'places-detail-invalidation'}));
  expect(oldSignal.aborted).toBe(true);expect(result.current.data).toBeUndefined();
  await act(async()=>{resolveFirst(places(100,4,null,'2',4));resolveOld(places(12,12,'old.next'));});
  expect(result.current.hasMore).toBe(false);expect((result.current.data?.recommendationLists[0] as any).recommended_places[0].documentId).toBe('place-100');
 });
});
describe("usePublicProfileDetail", () => {
  beforeEach(() => { detail.mockReset(); detailPage.mockReset(); });
  it.each([24, 25])("uses explicit 24-item pages through the terminal request for %i children", async (total) => {
    detail.mockResolvedValue(page());
    detailPage.mockResolvedValueOnce(page(0, 24)).mockResolvedValueOnce(page(24, total - 24));
    const { result } = renderHook(() => usePublicProfileDetail("alice", "apps", "tools", { pageSize: 24 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect((result.current.data?.appLists[0] as any).recommended_apps).toHaveLength(24);
    await act(async () => { await result.current.loadMore(); });
    expect(detail).not.toHaveBeenCalled();
    expect(detailPage.mock.calls.map(call => call[3])).toEqual([{ limit: 24 }, { limit: 24, cursor: "o24" }]);
    expect((result.current.data?.appLists[0] as any).recommended_apps).toHaveLength(total);
    expect(result.current.hasMore).toBe(false);
  });

  it("aborts and hides stale continuation when page size changes", async () => {
    let resolve!: (value: unknown) => void;
    detail.mockResolvedValue(page());
    detailPage.mockImplementationOnce(() => new Promise(yes => { resolve = yes; })).mockResolvedValueOnce(page(100, 24));
    const snapshots: { size: number; data: unknown }[] = [];
    const { result, rerender } = renderHook(({ size }: { size: 12 | 24 }) => {
      const state = usePublicProfileDetail("alice", "apps", "tools", { pageSize: size });
      snapshots.push({ size, data: state.data });
      return state;
    }, { initialProps: { size: 12 as 12 | 24 } });
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    act(() => { void result.current.loadMore(); });
    const signal = detailPage.mock.calls[0][4] as AbortSignal;
    rerender({ size: 24 });
    expect(signal.aborted).toBe(true);
    expect(snapshots.find(snapshot => snapshot.size === 24)?.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toEqual(page(100, 24)));
    await act(async () => { resolve(page(12, 1)); });
    expect(result.current.data).toEqual(page(100, 24));
  });

  it("hides and disables a complete detail scope when access is disabled", async () => {
    detail.mockResolvedValue(page());
    const { result, rerender } = renderHook(({ enabled }) => usePublicProfileDetail("alice", "apps", "tools", { enabled }), { initialProps: { enabled: true } });
    await waitFor(() => expect(result.current.data).toEqual(page()));
    rerender({ enabled: false });
    expect(result.current.data).toBeUndefined();
    await act(async () => { await result.current.loadMore(); await result.current.refetch(); });
    expect(detail).toHaveBeenCalledTimes(1);
    expect(detailPage).not.toHaveBeenCalled();
  });
  it("appends bounded children, preserves parent fields, and stops after a short page", async () => {
    detail.mockResolvedValue(page());
    detailPage.mockResolvedValue({ appLists: [{ ...page(12, 1).appLists[0], List_Name: "Changed" }] });
    const { result } = renderHook(() => usePublicProfileDetail("alice", "apps", "tools"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.loadMore(); });
    expect(detail).toHaveBeenCalledWith("alice", "apps", "tools", expect.any(AbortSignal), false);
    expect(detailPage).toHaveBeenCalledWith("alice", "apps", "tools", { limit: 12, cursor: "o12" }, expect.any(AbortSignal), false);
    expect(result.current.data?.appLists[0]).toMatchObject({ List_Name: "Original", recommended_apps: expect.any(Array) });
    expect((result.current.data?.appLists[0] as any).recommended_apps).toHaveLength(13);
    expect(result.current.hasMore).toBe(false);
  });

  it.each(["initial", "refresh", "continuation"])("clears unavailable content for empty detail roots during %s", async (phase) => {
    detail.mockResolvedValueOnce(phase === "initial" ? { appLists: [] } : page()).mockResolvedValue({ appLists: [] });
    detailPage.mockResolvedValue({ appLists: [] });
    const { result } = renderHook(() => usePublicProfileDetail("alice", "apps", "tools"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    if (phase === "refresh") await act(async () => { await result.current.refetch(); });
    if (phase === "continuation") await act(async () => { await result.current.loadMore(); });
    expect(result.current.error).toEqual(new Error("PUBLIC_PROFILE_404"));
    expect(result.current.data).toBeUndefined();
    expect(result.current.hasMore).toBe(false);
  });

  it("retains content without initial loading during same-scope invalidation and bypasses subsequent pages", async () => {
    let resolve!: (value: unknown) => void;
    detail.mockResolvedValueOnce(page()).mockImplementationOnce(() => new Promise((yes) => { resolve = yes; }));
    detailPage.mockResolvedValue(page(12, 1));
    const { result } = renderHook(() => usePublicProfileDetail("alice", "apps", "tools"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => publishPublicProfileInvalidation({ accountDocumentId: "alice", username: "alice", category: "public_books", action: "pin", eventId: "detail-unrelated" }));
    expect(detail).toHaveBeenCalledTimes(1);
    act(() => publishPublicProfileInvalidation({ accountDocumentId: "alice", username: "alice", category: "public_apps", action: "publish", eventId: "detail-matching" }));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(page());
    await act(async () => { resolve(page()); });
    await act(async () => { await result.current.loadMore(); });
    expect(detail).toHaveBeenLastCalledWith("alice", "apps", "tools", expect.any(AbortSignal), true);
    expect(detailPage).toHaveBeenLastCalledWith("alice", "apps", "tools", { limit: 12, cursor: "o12" }, expect.any(AbortSignal), true);
  });

  it("clears old slug content in the first render and ignores its late continuation", async () => {
    let resolve!: (value: unknown) => void;
    detail.mockResolvedValueOnce(page()).mockResolvedValueOnce(page(100, 1, "other"));
    detailPage.mockImplementation(() => new Promise((yes) => { resolve = yes; }));
    const snapshots: { slug: string; data: unknown }[] = [];
    const { result, rerender } = renderHook(({ slug }) => {
      const state = usePublicProfileDetail("alice", "apps", slug);
      snapshots.push({ slug, data: state.data });
      return state;
    }, { initialProps: { slug: "tools" } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { void result.current.loadMore(); });
    rerender({ slug: "other" });
    expect(snapshots.find((item) => item.slug === "other")?.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toEqual(page(100, 1, "other")));
    await act(async () => { resolve(page(12, 1)); });
    expect(result.current.data).toEqual(page(100, 1, "other"));
  });

  it("does not request an incomplete detail scope", () => {
    const { result } = renderHook(() => usePublicProfileDetail("alice", "apps", undefined));
    expect(detail).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });
});

it('uses exact signed Movie list cursor and terminal null independently of child count',async()=>{
 detail.mockResolvedValueOnce({movieLists:[{documentId:'list',recommended_movies:Array.from({length:12},(_,i)=>({documentId:'m'+i})),recommended_movies_next_cursor:'signed.list'}]});
 detailPage.mockResolvedValueOnce({movieLists:[{documentId:'list',recommended_movies:[{documentId:'last'}],recommended_movies_next_cursor:null}]});
 const {result}=renderHook(()=>usePublicProfileDetail('reader','movies','list'));await waitFor(()=>expect(result.current.loading).toBe(false));await act(()=>result.current.loadMore());
 expect(detailPage).toHaveBeenLastCalledWith('reader','movies','list',{limit:12,cursor:'signed.list'},expect.any(AbortSignal),false);expect(result.current.hasMore).toBe(false);
});
