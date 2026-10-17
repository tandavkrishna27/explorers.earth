import {useLayoutEffect} from 'react';
import {act,cleanup,render,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import useAuthStore from '../../../../store/store';
import {readBooksOwnerContent,type BooksOwnerContent} from '../booksClient';
import {useBooksOwnerContent} from '../useBooksOwnerContent';

vi.mock('../booksClient',()=>({readBooksOwnerContent:vi.fn()}));
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(failure:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function owner(name:string):BooksOwnerContent{return {observation:{accountId:name},lists:[{documentId:'shared-list',List_Name:`${name} private title`},{documentId:'other-list',List_Name:`${name} other title`}],details:new Map([['private', {detail:{accountId:name}}]])} as unknown as BooksOwnerContent;}
function select(accountId:string|null,generation:number){useAuthStore.setState({accountId,generation,isAuthenticated:accountId!==null,status:accountId?'active-complete':'signed-out'});}
type Sample={account:string|null;generation:number;content:BooksOwnerContent|undefined;data:ReturnType<typeof useBooksOwnerContent>['data'];loading:boolean;error:Error|undefined};
function probe(samples:Sample[],listId?:string){return function Probe(){const state=useBooksOwnerContent(listId),account=useAuthStore(s=>s.accountId),generation=useAuthStore(s=>s.generation);useLayoutEffect(()=>{samples.push({account,generation,content:state.content,data:state.data,loading:state.loading,error:state.error});});return null;};}

describe('Books owner render authority',()=>{
 beforeEach(()=>{vi.clearAllMocks();select('A',1);});afterEach(cleanup);
 it('never exposes settled A content in ANY B layout frame before passive cleanup',async()=>{
  const a=owner('A'),b=deferred<BooksOwnerContent>(),samples:Sample[]=[];vi.mocked(readBooksOwnerContent).mockResolvedValueOnce(a).mockReturnValueOnce(b.promise);
  const Probe=probe(samples,'shared-list');render(<Probe/>);await waitFor(()=>expect(samples.at(-1)?.content).toBe(a));
  act(()=>select('B',2));await waitFor(()=>expect(readBooksOwnerContent).toHaveBeenCalledTimes(2));
  const current=samples.filter(x=>x.account==='B');expect(current.length).toBeGreaterThan(0);for(const s of current){expect(s.content).toBeUndefined();expect(s.data).toBeUndefined();expect(s.error).toBeUndefined();expect(s.loading).toBe(true);}
  const fresh=owner('B');await act(async()=>b.resolve(fresh));expect(samples.at(-1)?.content).toBe(fresh);
 });
 it('sign-out immediately hides prior private data and stale error',async()=>{
  const a=owner('A'),samples:Sample[]=[];vi.mocked(readBooksOwnerContent).mockResolvedValueOnce(a);const Probe=probe(samples);render(<Probe/>);await waitFor(()=>expect(samples.at(-1)?.content).toBe(a));
  act(()=>select(null,2));for(const s of samples.filter(x=>x.account===null)){expect(s.content).toBeUndefined();expect(s.data).toBeUndefined();expect(s.error).toBeUndefined();expect(s.loading).toBe(false);}
  expect(readBooksOwnerContent).toHaveBeenCalledTimes(1);
 });
 it('A to B to A cannot reuse an earlier A generation',async()=>{
  const a=owner('A'),b=deferred<BooksOwnerContent>(),newA=deferred<BooksOwnerContent>(),samples:Sample[]=[];vi.mocked(readBooksOwnerContent).mockResolvedValueOnce(a).mockReturnValueOnce(b.promise).mockReturnValueOnce(newA.promise);const Probe=probe(samples);render(<Probe/>);await waitFor(()=>expect(samples.at(-1)?.content).toBe(a));
  act(()=>select('B',2));act(()=>select('A',3));for(const s of samples.filter(x=>x.generation===3)){expect(s.content).toBeUndefined();expect(s.data).toBeUndefined();expect(s.loading).toBe(true);}
  const fresh=owner('fresh A');await act(async()=>newA.resolve(fresh));expect(samples.at(-1)?.content).toBe(fresh);await act(async()=>b.resolve(owner('late B')));expect(samples.at(-1)?.content).toBe(fresh);
 });
 it.each(['success','error'])('late obsolete %s and finally never overwrite B pending status',async kind=>{
  const old=deferred<BooksOwnerContent>(),next=deferred<BooksOwnerContent>();vi.mocked(readBooksOwnerContent).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);const {result}=renderHook(()=>useBooksOwnerContent());act(()=>select('B',2));
  await act(async()=>{if(kind==='success')old.resolve(owner('A'));else old.reject(new Error('A failure'));});expect(result.current.content).toBeUndefined();expect(result.current.error).toBeUndefined();expect(result.current.loading).toBe(true);
  const b=owner('B');await act(async()=>next.resolve(b));expect(result.current.content).toBe(b);expect(result.current.loading).toBe(false);
 });
 it('a saved obsolete refetch cannot start work or abort the fresh owner attempt',async()=>{
  const a=owner('A'),b=deferred<BooksOwnerContent>();vi.mocked(readBooksOwnerContent).mockResolvedValueOnce(a).mockReturnValueOnce(b.promise);const {result}=renderHook(()=>useBooksOwnerContent());await waitFor(()=>expect(result.current.content).toBe(a));const oldRefetch=result.current.refetch;act(()=>select('B',2));const signal=vi.mocked(readBooksOwnerContent).mock.calls[1][0];let oldResult:unknown;
  await act(async()=>{oldResult=await oldRefetch();});expect(oldResult).toBeUndefined();expect(readBooksOwnerContent).toHaveBeenCalledTimes(2);expect(signal?.aborted).toBe(false);expect(result.current.loading).toBe(true);await act(async()=>b.resolve(owner('B')));
 });
 it('same-account refresh retains current content and surfaces a real current error',async()=>{
  const a=owner('A'),refresh=deferred<BooksOwnerContent>();vi.mocked(readBooksOwnerContent).mockResolvedValueOnce(a).mockReturnValueOnce(refresh.promise);const {result}=renderHook(()=>useBooksOwnerContent());await waitFor(()=>expect(result.current.content).toBe(a));let pending!:ReturnType<typeof result.current.refetch>;
  act(()=>{pending=result.current.refetch();});expect(result.current.content).toBe(a);expect(result.current.loading).toBe(true);await act(async()=>{refresh.reject(new Error('Current failure'));await pending;});expect(result.current.content).toBe(a);expect(result.current.error?.message).toBe('Current failure');expect(result.current.loading).toBe(false);
 });
 it('current list selection filters immediately without reacquiring complete account content',async()=>{
  const a=owner('A');vi.mocked(readBooksOwnerContent).mockResolvedValueOnce(a);const {result,rerender}=renderHook(({id})=>useBooksOwnerContent(id),{initialProps:{id:'shared-list'}});await waitFor(()=>expect(result.current.content).toBe(a));rerender({id:'other-list'});expect(result.current.data?.bookLists.map(x=>x.documentId)).toEqual(['other-list']);expect(result.current.content).toBe(a);expect(readBooksOwnerContent).toHaveBeenCalledTimes(1);
 });
 it('unmounted noncooperative success cannot publish or return a current observation',async()=>{
  const first=owner('A'),late=deferred<BooksOwnerContent>();vi.mocked(readBooksOwnerContent).mockResolvedValueOnce(first).mockReturnValueOnce(late.promise);const {result,unmount}=renderHook(()=>useBooksOwnerContent());await waitFor(()=>expect(result.current.content).toBe(first));let pending!:ReturnType<typeof result.current.refetch>;act(()=>{pending=result.current.refetch();});const signal=vi.mocked(readBooksOwnerContent).mock.calls[1][0];unmount();expect(signal?.aborted).toBe(true);let value:unknown;await act(async()=>{late.resolve(owner('late'));value=await pending;});expect(value).toBeUndefined();
 });
});
