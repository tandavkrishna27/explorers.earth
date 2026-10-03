import {describe,it,expect,vi} from 'vitest';
import {completeBooksPreviews} from '../publicBooksContinuation';
describe('public Books child continuation',()=>{
 it('reads all child pages without hiding later subject books',async()=>{
  const read=vi.fn().mockResolvedValue({bookLists:[{documentId:'list',recommended_books:[{documentId:'later'}],recommended_books_next_cursor:null}]});
  const result=await completeBooksPreviews({bookLists:[{documentId:'list',slug:'list',recommended_books:[{documentId:'first'}],recommended_books_next_cursor:'o12'}]},read);
  expect(result.bookLists[0].recommended_books.map((book:any)=>book.documentId)).toEqual(['first','later']);
  expect(read).toHaveBeenCalledWith('list','o12');
 });
 it('fails closed on looping continuation',async()=>{
  const read=vi.fn().mockResolvedValue({bookLists:[{documentId:'list',recommended_books:[{documentId:'later'}],recommended_books_next_cursor:'o12'}]});
  await expect(completeBooksPreviews({bookLists:[{documentId:'list',slug:'list',recommended_books:[],recommended_books_next_cursor:'o12'}]},read)).rejects.toThrow();
 });
});
