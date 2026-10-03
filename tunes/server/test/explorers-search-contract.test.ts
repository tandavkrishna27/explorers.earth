import { expect,it } from 'vitest';
import * as search from '../../shared/explorersSearchContract';
it('exposes strict explicit scopes, normalized filters and finite Unicode bounds',()=>{
 expect(search.searchRequestSchema.parse({scope:'owner',category:'books',query:'  blue moon  '}).query).toBe('blue moon');
 expect(search.searchRequestSchema.parse({scope:'public',category:'guides'}).limit).toBe(24);
 for(const input of [{scope:'owner',category:'books',creatorHandle:'alice'},{scope:'public',category:'music'},{scope:'owner',category:'books',query:'a\u0000b'},{scope:'owner',category:'books',query:'😀'.repeat(201)},{scope:'owner',category:'books',query:'\ud800'},{scope:'owner',category:'books',accountId:'secret'},{scope:'public',category:'books',snapshotToken:'secret'}]) expect(search.searchRequestSchema.safeParse(input).success).toBe(false);
});
it('rejects duplicate entity selectors and public owner fields',()=>{
 const id='12345678-1234-4234-8234-123456789abc';
 expect(search.searchRequestSchema.safeParse({scope:'owner',category:'books',entityIds:[id,id]}).success).toBe(false);
 expect(search.publicSearchItemSchema.safeParse({id,title:null,kind:'book',userRating:null}).success).toBe(true);
 expect(search.publicSearchItemSchema.safeParse({id,title:null,kind:'book',userRating:null,accountId:id}).success).toBe(false);
});
it('types retryable owner and public timeout envelopes',()=>{
 expect(search.ownerSearchErrorSchema.safeParse({error:{code:'UNAVAILABLE',message:'retry',requestId:'request',retryable:true}}).success).toBe(true);
 expect(search.publicSearchErrorSchema.safeParse({version:'explorers-public-error/v1',error:{code:'UNAVAILABLE',retryable:true}}).success).toBe(true);
});
it('bounds owner snapshot revisions in the read DTO',()=>{
 expect(search.ownerSearchPageSchema.safeParse({version:'explorers-search/v1',scope:'owner',expiresAt:1,nextCursor:null,items:[],snapshotToken:'opaque',snapshot:'not-a-revision'}).success).toBe(false);
});
