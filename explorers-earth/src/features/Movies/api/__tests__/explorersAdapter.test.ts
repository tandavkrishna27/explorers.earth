import {describe,it,expect} from 'vitest';
import {completeMoviesPreviews,moviePageCursor,mergeMoviePage} from '../publicMoviesContinuation';
describe('server-authorized Movie public continuation',()=>{
 it('drains nested previews only with actual returned list tokens and preserves global pins',async()=>{
  const seen:string[]=[];const data=await completeMoviesPreviews({movieLists:[{documentId:'l',slug:'list',recommended_movies:[{documentId:'a'}],recommended_movies_next_cursor:'first'}],topPicks:[{documentId:'pin'}],nextCursor:null},async(slug,cursor)=>{seen.push(slug+':'+cursor);return {movieLists:[{documentId:'l',slug:'list',recommended_movies:[{documentId:'b'}],recommended_movies_next_cursor:null}]};});
  expect(seen).toEqual(['list:first']);expect((data.movieLists[0] as any).recommended_movies).toHaveLength(2);expect(data.topPicks).toEqual([{documentId:'pin'}]);
 });
 it('rejects repeated or cross-list continuation responses',async()=>{
  const start={movieLists:[{documentId:'l',slug:'list',recommended_movies:[],recommended_movies_next_cursor:'loop'}]};
  await expect(completeMoviesPreviews(start,async()=>start)).rejects.toThrow('PUBLIC_PROFILE_INVALID_RESPONSE');
  await expect(completeMoviesPreviews(start,async()=>({movieLists:[{documentId:'other',recommended_movies:[{documentId:'x'}],recommended_movies_next_cursor:null}]}))).rejects.toThrow();
 });
 it('keeps the newest backend cursor and distinct recommendation IDs with same provider identity',()=>{
  const merged=mergeMoviePage({movieLists:[{documentId:'a',recommended_movies:[]}],nextCursor:'one'} as any,{movieLists:[{documentId:'b',recommended_movies:[]}],nextCursor:null} as any,false,12);
  expect(merged.movieLists).toHaveLength(2);expect(moviePageCursor(merged,false)).toBeNull();
  expect(()=>moviePageCursor({movieLists:[],nextCursor:'x'.repeat(2049)},false)).toThrow();
 });
});
