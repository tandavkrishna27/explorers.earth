import {describe,it,expect,vi,beforeEach} from 'vitest';
import {renderHook,waitFor} from '@testing-library/react';
import useAuthStore from '../../../../store/store';
import {readBooksOwnerContent} from '../booksClient';
import {useBooksOwnerContent} from '../useBooksOwnerContent';
vi.mock('../booksClient',()=>({readBooksOwnerContent:vi.fn()}));
describe('canonical Books list observation',()=>{
 beforeEach(()=>{vi.clearAllMocks();useAuthStore.setState({generation:2,accountId:'owner'});});
 it('filters a fully observed category by canonical list id without a page-0 fake completeness window',async()=>{vi.mocked(readBooksOwnerContent).mockResolvedValue({lists:[{documentId:'list'},{documentId:'other'}],observation:{},details:new Map()} as never);const {result}=renderHook(()=>useBooksOwnerContent('list'));await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.data?.bookLists).toEqual([{documentId:'list'}]);expect(readBooksOwnerContent).toHaveBeenCalledWith(expect.any(AbortSignal));});
 it('shows failure without fabricating a complete empty list',async()=>{vi.mocked(readBooksOwnerContent).mockRejectedValue(new Error('Incomplete hydration'));const {result}=renderHook(()=>useBooksOwnerContent('list'));await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.error?.message).toBe('Incomplete hydration');expect(result.current.data).toBeUndefined();});
});
