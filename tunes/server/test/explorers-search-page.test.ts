import {expect,it} from 'vitest';
import {SearchQuery} from '../application/searchQuery';
import {publicSearchRequestSchema,SEARCH_PAGE_BYTES} from '../../shared/explorersSearchContract';
it('keeps the continuation on the last actually emitted row at the actual byte budget',()=>{
 const query=new SearchQuery('page-budget-test'),input=publicSearchRequestSchema.parse({scope:'public',category:'books',limit:3}),now=Date.now();
 const rows=[1,2,3].map(n=>({id:`12345678-1234-4234-8234-123456789ab${n}`,created_key:`2026-01-01T00:00:00.12345${n}Z`,title_bytes:402,canonical_title:'a'.repeat(400),display_values:null,kind:'book',user_rating:null}));
 const state={v:1 as const,binding:query.binding(input,null),account:null,revision:null,issued:now,expires:now+600000};
 // The lean wire's own tighter title/row caps normally fit well below 4MiB.
 // A synthetic reserved envelope exercises packing without lowering its cap
 // or loosening the production DTO/stored-title validators.
 const base={version:'explorers-search/v1',scope:'public',consistency:'live',expiresAt:state.expires,reserved:''};
 const first={...base,items:[{id:rows[0].id,title:rows[0].canonical_title,kind:'book',userRating:null}],nextCursor:query.encode({...state,created:rows[0].created_key,id:rows[0].id})};
 base.reserved='x'.repeat(SEARCH_PAGE_BYTES-Buffer.byteLength(JSON.stringify(first),'utf8'));
 const page=query.page(rows,input,base,state);expect(page.items).toHaveLength(1);expect(Buffer.byteLength(JSON.stringify(page),'utf8')).toBe(SEARCH_PAGE_BYTES);
 const cursor=query.decode(page.nextCursor!);expect(cursor?.id).toBe(rows[0].id);expect(cursor?.created).toBe(rows[0].created_key);
});
