import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {renderHook,act,cleanup} from '@testing-library/react';
import useAuthStore from '../../../../store/store';
import {useMoviesOwner} from '../explorersAdapter';
import {readMoviesOwnerContent} from '../moviesClient';
vi.mock('../moviesClient',()=>({readMoviesOwnerContent:vi.fn(),moviesCommandKey:vi.fn(),updateMovieList:vi.fn()}));
const content={observation:{revision:'1'},lists:[],details:new Map()} as any;
function gate(){let resolve!:(v:any)=>void,reject!:(e:any)=>void;const promise=new Promise<any>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
describe('Movies observer hook acceptance fences',()=>{
 beforeEach(()=>{vi.resetAllMocks();useAuthStore.setState({accountId:'owner',generation:1});});afterEach(cleanup);
 it.each(['accepted','rejected'] as const)('publishes pending then %s only after the live completion',async state=>{
  const pending=gate(),observer=vi.fn();vi.mocked(readMoviesOwnerContent).mockReturnValue(pending.promise);
  const hook=renderHook(()=>useMoviesOwner(undefined,true,observer));
  try{expect(observer.mock.calls.map(c=>c[0])).toEqual([{owner:'pending'}]);expect(readMoviesOwnerContent).toHaveBeenCalledWith(expect.any(AbortSignal),expect.any(Function));
   await act(async()=>{if(state==='accepted')pending.resolve(content);else pending.reject(Error('synthetic'));await pending.promise.catch(()=>{});});
   expect(observer.mock.calls.map(c=>c[0])).toEqual([{owner:'pending'},{owner:state}]);expect(hook.result.current.loading).toBe(false);
   if(state==='accepted')expect(hook.result.current.content).toBe(content);else expect(hook.result.current.error?.message).toBe('synthetic');
  }finally{pending.resolve(content);await pending.promise.catch(()=>{});hook.unmount();}
 });
 it.each([['disabled',false,'owner'],['no-account',true,undefined]] as const)('observes %s without acquiring a request',async(state,enabled,accountId)=>{
  useAuthStore.setState({accountId});const observer=vi.fn();const hook=renderHook(()=>useMoviesOwner(undefined,enabled,observer));
  try{expect(observer).toHaveBeenCalledExactlyOnceWith({owner:state});expect(readMoviesOwnerContent).not.toHaveBeenCalled();expect(hook.result.current.loading).toBe(false);}finally{hook.unmount();}
 });
 it('rejects stale read phases and completions after refetch, changed scope and unmount',async()=>{
  const gates=[gate(),gate(),gate()],observer=vi.fn();let index=0;vi.mocked(readMoviesOwnerContent).mockImplementation(()=>gates[index++].promise);
  const hook=renderHook(()=>useMoviesOwner(undefined,true,observer));
  try{
   const old=vi.mocked(readMoviesOwnerContent).mock.calls[0][1]!;
   observer.mockClear();old({phase:'initial-category',cause:'none'});expect(observer.mock.calls.map(c=>c[0])).toEqual([{phase:'initial-category',cause:'none'}]);
   await act(async()=>hook.result.current.refetch());const second=vi.mocked(readMoviesOwnerContent).mock.calls[1][1]!;
   observer.mockClear();second({phase:'detail-fanout',cause:'unavailable'});expect(observer.mock.calls.map(c=>c[0])).toEqual([{phase:'detail-fanout',cause:'unavailable'}]);
   observer.mockClear();old({phase:'complete',cause:'none'});await act(async()=>{gates[0].resolve(content);await gates[0].promise;});expect(observer).not.toHaveBeenCalled();expect(hook.result.current.content).toBeUndefined();
   await act(async()=>useAuthStore.setState({accountId:'replacement',generation:2}));observer.mockClear();second({phase:'mapping',cause:'none'});await act(async()=>{gates[1].reject(Error('synthetic'));await gates[1].promise.catch(()=>{});});expect(observer).not.toHaveBeenCalled();
   const current=vi.mocked(readMoviesOwnerContent).mock.calls[2][1]!;current({phase:'final-category',cause:'none'});expect(observer).toHaveBeenCalledExactlyOnceWith({phase:'final-category',cause:'none'});hook.unmount();observer.mockClear();current({phase:'complete',cause:'none'});gates[2].resolve(content);await gates[2].promise;await Promise.resolve();expect(observer).not.toHaveBeenCalled();
  }finally{for(const g of gates)g.resolve(content);await Promise.all(gates.map(g=>g.promise.catch(()=>{})));hook.unmount();}
 });
 it('swallows observer failures while preserving accepted content and original rejected error',async()=>{
  const observer=vi.fn(()=>{throw Error('observer');}),failure=Error('application');vi.mocked(readMoviesOwnerContent).mockResolvedValueOnce(content).mockRejectedValueOnce(failure);
  const hook=renderHook(()=>useMoviesOwner(undefined,true,observer));
  try{const current=vi.mocked(readMoviesOwnerContent).mock.calls[0][1]!;observer.mockClear();expect(()=>current({phase:'mapping',cause:'none'})).not.toThrow();expect(observer).toHaveBeenCalledExactlyOnceWith({phase:'mapping',cause:'none'});await act(async()=>{await Promise.resolve();});expect(hook.result.current.content).toBe(content);await act(async()=>{hook.result.current.refetch();});expect(hook.result.current.error).toBe(failure);}finally{hook.unmount();}
 });
});
