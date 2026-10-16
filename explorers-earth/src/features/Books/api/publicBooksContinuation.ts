import type {PublicPagePayload} from '../../PublicHome/api/usePublicPagedResource';
export async function completeBooksPreviews(raw:unknown,read:(slug:string,cursor:string)=>Promise<unknown>):Promise<PublicPagePayload>{
 if(!raw||typeof raw!=='object'||!Array.isArray((raw as any).bookLists))throw new Error('PUBLIC_PROFILE_INVALID_RESPONSE');
 type PreviewList={documentId:string;slug:string;recommended_books:unknown[];recommended_books_next_cursor?:string|null};
 const data=raw as PublicPagePayload & {bookLists:PreviewList[]};let requests=0,bytes=new TextEncoder().encode(JSON.stringify(data)).length;
 const lists=[];
 for(const list of data.bookLists){
  if(!list||typeof list.documentId!=='string'||!Array.isArray(list.recommended_books))throw new Error('PUBLIC_PROFILE_INVALID_RESPONSE');
  const books=[...list.recommended_books],seen=new Set<string>();let cursor=list.recommended_books_next_cursor;
  while(cursor){
   if(typeof cursor!=='string'||seen.has(cursor)||++requests>1000)throw new Error('PUBLIC_PROFILE_PAGINATION_LIMIT');seen.add(cursor);
   const page=await read(list.slug,cursor) as PublicPagePayload & {bookLists:PreviewList[]};
   bytes+=new TextEncoder().encode(JSON.stringify(page)).length;if(bytes>64*1024*1024)throw new Error('PUBLIC_PROFILE_PAGINATION_LIMIT');
   const next=page?.bookLists?.[0];
   if(!next||page.bookLists.length!==1||next.documentId!==list.documentId||!Array.isArray(next.recommended_books)||!next.recommended_books.length&&next.recommended_books_next_cursor)throw new Error('PUBLIC_PROFILE_INVALID_RESPONSE');
   books.push(...next.recommended_books);cursor=next.recommended_books_next_cursor;
  }
  lists.push({...list,recommended_books:books,recommended_books_next_cursor:null});
 }
 return {...data,bookLists:lists};
}
