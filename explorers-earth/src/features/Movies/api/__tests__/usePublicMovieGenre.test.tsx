import {describe,it,expect,vi,beforeEach} from 'vitest';
import {renderHook,waitFor,act} from '@testing-library/react';
import {publicProfileGatewayClient} from '../../../PublicHome/api/publicProfileGatewayClient';
import {usePublicMovieGenre} from '../usePublicMovieGenre';
vi.mock('../../../PublicHome/api/publicProfileGatewayClient',()=>({publicProfileGatewayClient:{movieGenrePage:vi.fn()}}));
describe('opaque Movie genre continuation',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it('uses returned authority only and stops on a full terminal page',async()=>{
  const rows=Array.from({length:12},(_,n)=>({documentId:'r'+n}));
  vi.mocked(publicProfileGatewayClient.movieGenrePage).mockResolvedValueOnce({genre:{documentId:'g',slug:'action',genre_name:'Action'},recommended_movies:rows,nextCursor:'opaque.authority'}).mockResolvedValueOnce({genre:{documentId:'g',slug:'action',genre_name:'Action'},recommended_movies:[{documentId:'second'}],nextCursor:null});
  const hook=renderHook(()=>usePublicMovieGenre('Reader','action'));
  await waitFor(()=>expect(hook.result.current.loading).toBe(false));expect(hook.result.current.hasMore).toBe(true);
  await act(()=>hook.result.current.loadMore());expect(publicProfileGatewayClient.movieGenrePage).toHaveBeenLastCalledWith('Reader','action',{limit:12,cursor:'opaque.authority'},expect.any(AbortSignal),false);expect(hook.result.current.hasMore).toBe(false);expect(hook.result.current.data?.recommended_movies).toHaveLength(13);hook.unmount();
 });
 it('does not invent another cursor for a full12 terminal response',async()=>{
  vi.mocked(publicProfileGatewayClient.movieGenrePage).mockResolvedValue({genre:{documentId:'g',slug:'action',genre_name:'Action'},recommended_movies:Array.from({length:12},(_,n)=>({documentId:'r'+n})),nextCursor:null});
  const hook=renderHook(()=>usePublicMovieGenre('Reader','action'));await waitFor(()=>expect(hook.result.current.loading).toBe(false));expect(hook.result.current.hasMore).toBe(false);await act(()=>hook.result.current.loadMore());expect(publicProfileGatewayClient.movieGenrePage).toHaveBeenCalledTimes(1);hook.unmount();
 });
});
