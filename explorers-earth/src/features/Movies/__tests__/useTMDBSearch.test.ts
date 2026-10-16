import {renderHook,act} from '@testing-library/react';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {useTMDBSearch} from '../hooks/useTMDBSearch';
import {explorersApiClient} from '../../../lib/explorersApiClient';
vi.mock('../../../lib/explorersApiClient',()=>({explorersApiClient:{searchMovieCandidates:vi.fn()}}));
const candidate={provider:'tmdb',externalKind:'movie',externalId:'7',title:'Movie',posterUrl:null,yearText:'2026'};
beforeEach(()=>{vi.useFakeTimers();vi.resetAllMocks();});afterEach(()=>vi.useRealTimers());
const tick=()=>act(async()=>{await vi.advanceTimersByTimeAsync(300);});
describe('authenticated Movie search continuation',()=>{
 it('explicitly retries a busy replacement query without appending its cancelled predecessor',async()=>{
  let finish:(value:unknown)=>void=()=>{};
  const search=vi.mocked(explorersApiClient.searchMovieCandidates);
  search.mockResolvedValueOnce({items:[candidate],nextCursor:'old-cursor'} as never)
   .mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve as typeof finish;}))
   .mockRejectedValueOnce(new Error('Search is busy. Please try again.'))
   .mockResolvedValueOnce({items:[{...candidate,title:'New'}],nextCursor:null} as never);
  const {result,rerender}=renderHook(({query})=>useTMDBSearch(query),{initialProps:{query:'old'}});
  await tick();let pending:Promise<void>;act(()=>{pending=result.current.loadMore();});
  const signal=search.mock.calls[1][1];rerender({query:'new'});await tick();
  expect(signal?.aborted).toBe(true);expect(result.current.error).toContain('busy');
  expect(search).toHaveBeenCalledTimes(3);
  await act(async()=>{await result.current.retry();});await tick();
  expect(search).toHaveBeenLastCalledWith({query:'new',limit:24},expect.any(AbortSignal));
  await act(async()=>{finish({items:[{...candidate,title:'Old continuation'}],nextCursor:null});await pending!;});
  expect(result.current.results.map(item=>item.title)).toEqual(['New']);expect(result.current.error).toBeNull();
 });
 it('retries a failed continuation explicitly with the same cursor and retained first page',async()=>{
  const search=vi.mocked(explorersApiClient.searchMovieCandidates);
  search.mockResolvedValueOnce({items:[candidate],nextCursor:'opaque'} as never).mockRejectedValueOnce(new Error('Search is busy'))
   .mockResolvedValueOnce({items:[{...candidate,externalId:'8'}],nextCursor:null} as never);
  const {result}=renderHook(()=>useTMDBSearch('Movie'));await tick();await act(async()=>result.current.loadMore());
  expect(result.current.results).toEqual([candidate]);expect(search).toHaveBeenCalledTimes(2);
  await act(async()=>result.current.retry());
  expect(search).toHaveBeenLastCalledWith({query:'Movie',limit:24,cursor:'opaque'},expect.any(AbortSignal));
  expect(result.current.results).toHaveLength(2);expect(result.current.error).toBeNull();
 });
 it('clears blank input and debounces the canonical request',async()=>{vi.mocked(explorersApiClient.searchMovieCandidates).mockResolvedValue({items:[candidate],nextCursor:null} as never);const {result,rerender}=renderHook(({query})=>useTMDBSearch(query),{initialProps:{query:' Movie '}});await tick();expect(explorersApiClient.searchMovieCandidates).toHaveBeenCalledWith({query:'Movie',limit:24},expect.any(AbortSignal));expect(result.current.results).toEqual([candidate]);rerender({query:''});expect(result.current.results).toEqual([]);expect(result.current.loading).toBe(false);});
 it('consumes actual opaque cursor and retains Movie/TV same-ID candidates',async()=>{vi.mocked(explorersApiClient.searchMovieCandidates).mockResolvedValueOnce({items:[candidate],nextCursor:'opaque'} as never).mockResolvedValueOnce({items:[{...candidate,externalKind:'tv'}],nextCursor:null} as never);const {result}=renderHook(()=>useTMDBSearch('Movie'));await tick();await act(async()=>result.current.loadMore());expect(explorersApiClient.searchMovieCandidates).toHaveBeenLastCalledWith({query:'Movie',limit:24,cursor:'opaque'},expect.any(AbortSignal));expect(result.current.results).toHaveLength(2);expect(result.current.hasMore).toBe(false);});
 it('ignores late old-scope responses after query changes',async()=>{let finish:(value:unknown)=>void=()=>{};vi.mocked(explorersApiClient.searchMovieCandidates).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve as typeof finish;})).mockResolvedValueOnce({items:[{...candidate,title:'New'}],nextCursor:null} as never);const {result,rerender}=renderHook(({query})=>useTMDBSearch(query),{initialProps:{query:'old'}});await tick();const signal=vi.mocked(explorersApiClient.searchMovieCandidates).mock.calls[0][1];rerender({query:'new'});expect(signal?.aborted).toBe(true);await tick();await act(async()=>finish({items:[candidate],nextCursor:null}));expect(result.current.results[0].title).toBe('New');});
});
