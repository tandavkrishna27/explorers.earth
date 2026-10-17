import {expect,it,vi} from 'vitest';
import * as contract from '../../shared/explorersBookContract';
import * as provider from '../services/bookCatalog';
const volume=(id='v_1',extra={})=>({id,volumeInfo:{title:' A title ',authors:['Author'],industryIdentifiers:[{type:'ISBN_10',identifier:'123456789X'}],description:'<p>Hello &amp; <b>world</b></p><script>bad()</script>',imageLinks:{thumbnail:'http://books.google.com/a',large:'https://books.google.com/b'},...extra}});
it('maps independent ISBN and cover sizes, strips executable markup, and omits unapproved URLs',()=>{
 expect(provider.mapBookVolume).toBeTypeOf('function');
 const mapped=provider.mapBookVolume(volume('v_1',{previewLink:'https://evil.invalid/a',averageRating:0}), 'v_1',123);
 expect(mapped.preview).toMatchObject({isbn10:'123456789X',isbn13:null,coverUrl:'https://books.google.com/a',coverLargeUrl:'https://books.google.com/b',description:'Hello & world',previewLink:null,providerRating:null});
 expect(mapped.title).toBe('A title');
 expect(()=>provider.mapBookVolume(volume('wrong'),'v_1',123)).toThrow();
});
it('strict details and context reject unknown fields, credentials, invalid counts and ISBN conflation',()=>{
 expect(contract.bookEntityDetailsSchema).toBeDefined();
 const details=provider.mapBookVolume(volume(),'v_1',123).preview;
 expect(contract.bookEntityDetailsSchema.safeParse({...details,pageCount:-1}).success).toBe(false);
 expect(contract.bookEntityDetailsSchema.safeParse({...details,accountId:'x'}).success).toBe(false);
 expect(contract.bookRecommendationContextSchema.safeParse({buyLinks:[{name:'Buy',url:'https://user:pass@books.google.com'}]}).success).toBe(false);
});
it('search validates bounds before I/O, binds cursor, caches successes and refetches selected identity',async()=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify({items:[volume()],totalItems:1})));
 const service=new provider.BookCatalog({apiKey:'test-only-key',secret:'cursor-test-secret',fetch,now:()=>1000});
 await expect(service.search('a',{query:' '})).rejects.toMatchObject({status:422});expect(fetch).not.toHaveBeenCalled();
 const page=await service.search('a',{query:'  title  ',limit:'1'});expect(page.items).toHaveLength(1);expect(page.nextCursor).toBeTypeOf('string');
 await service.search('b',{query:'title',limit:'1'});expect(fetch).toHaveBeenCalledTimes(1);
 await expect(service.search('a',{query:'different',limit:'1',cursor:page.nextCursor})).rejects.toMatchObject({status:409});expect(fetch).toHaveBeenCalledTimes(1);
 fetch.mockImplementation(async()=>new Response(JSON.stringify(volume())));
 await service.resolve('a','v_1');await service.resolve('a','v_1');expect(fetch).toHaveBeenCalledTimes(3);
 expect(String(fetch.mock.calls[1][0])).toContain('/volumes/v_1');
});
it('returns safe explicit errors for disabled, malformed, quota and missing volumes',async()=>{
 await expect(new provider.BookCatalog({secret:'secret'}).search('a',{query:'title'})).rejects.toMatchObject({status:503,code:'PROVIDER_UNAVAILABLE'});
 for(const [response,status,code] of [[new Response('{}'),502,'PROVIDER_INVALID_RESPONSE'],[new Response('secret',{status:429,headers:{'Retry-After':'999'}}),429,'RATE_LIMITED'],[new Response('secret',{status:404}),404,'NOT_FOUND']] as const){
  const service=new provider.BookCatalog({secret:'secret',apiKey:'private-key',fetch:async()=>response});
  await expect(service.search('a',{query:'title'})).rejects.toMatchObject({status,code});
 }
});
it('rejects invalid ISBN checksum and validates cursor expiry before provider I/O',async()=>{
 let now=1000;const fetch=vi.fn(async()=>new Response(JSON.stringify({items:[volume()],totalItems:1})));const service=new provider.BookCatalog({apiKey:'test-only',secret:'cursor',fetch,now:()=>now});
 await expect(service.search('a',{query:'isbn:1234567890'})).rejects.toMatchObject({status:422});expect(fetch).not.toHaveBeenCalled();
 const page=await service.search('a',{query:'isbn:9780306406157',limit:1});now+=600000;
 await expect(service.search('a',{query:'isbn:9780306406157',limit:1,cursor:page.nextCursor})).rejects.toMatchObject({status:409});expect(fetch).toHaveBeenCalledTimes(1);
});
it('times out the complete response stream and caps bytes without leaking provider messages',async()=>{
 const hung=new provider.BookCatalog({apiKey:'secret-key',secret:'cursor',deadlineMs:10,fetch:async()=>new Response(new ReadableStream({start(){}}))});
 await expect(hung.search('a',{query:'Book'})).rejects.toMatchObject({status:503,code:'PROVIDER_UNAVAILABLE',message:'Book provider unavailable'});
 const huge=new provider.BookCatalog({apiKey:'secret-key',secret:'cursor',fetch:async()=>new Response('x'.repeat(1048577))});await expect(huge.search('a',{query:'Book'})).rejects.toMatchObject({status:502});
});
it('coalesces requests, expires empty cache after30 seconds and rejects account burst',async()=>{
 let now=1000;const fetch=vi.fn(async()=>new Response(JSON.stringify({totalItems:0})));const service=new provider.BookCatalog({apiKey:'test',secret:'cursor',fetch,now:()=>now});
 const [a,b]=await Promise.all([service.search('a',{query:'none'}),service.search('b',{query:'none'})]);expect(a.items).toEqual([]);expect(b.items).toEqual([]);expect(fetch).toHaveBeenCalledTimes(1);
 now+=29999;await service.search('a',{query:'none'});expect(fetch).toHaveBeenCalledTimes(1);now++;await service.search('a',{query:'none'});expect(fetch).toHaveBeenCalledTimes(2);
 for(let n=0;n<27;n++)await service.search('a',{query:'none'});await expect(service.search('a',{query:'none'})).rejects.toMatchObject({status:429,code:'RATE_LIMITED'});
});
it('bounds queue concurrency and rejects overflow without calling provider',async()=>{
 const releases:Array<(r:Response)=>void>=[];const fetch=vi.fn(()=>new Promise<Response>(r=>releases.push(r)));const service=new provider.BookCatalog({apiKey:'test',secret:'cursor',fetch:fetch as any});
 const pending=Array.from({length:24},(_,n)=>service.search(`a${n}`,{query:`Book${n}`}));await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(4));
 await expect(service.search('overflow',{query:'Overflow'})).rejects.toMatchObject({status:429});
 for(let batch=0;batch<6;batch++){const current=releases.splice(0);for(const release of current)release(new Response(JSON.stringify({totalItems:0})));if(batch<5)await vi.waitFor(()=>expect(releases).toHaveLength(4));}await Promise.all(pending);expect(fetch).toHaveBeenCalledTimes(24);
});
it('rejects malformed successful lists, invalid UTF8 and deeply nested responses without caching failures',async()=>{
 const bodies=['{"items":"not-array"}','{"items":[{"id":123,"volumeInfo":{"title":"Title"}}]}','{"totalItems":1}',JSON.stringify({totalItems:0,extra:Array.from({length:40}).reduce(v=>({nested:v}),{})})];
 for(const body of bodies){const fetch=vi.fn(async()=>new Response(body)),service=new provider.BookCatalog({apiKey:'test',secret:'cursor',fetch});await expect(service.search('a',{query:'Title'})).rejects.toMatchObject({status:502});await expect(service.search('a',{query:'Title'})).rejects.toMatchObject({status:502});expect(fetch).toHaveBeenCalledTimes(2);}
 const malformedUtf8=Buffer.concat([Buffer.from('{"items":[{"id":"v_1","volumeInfo":{"title":"'),Buffer.from([255]),Buffer.from('"}}]}')]);
 await expect(new provider.BookCatalog({apiKey:'test',secret:'cursor',fetch:async()=>new Response(malformedUtf8)}).search('a',{query:'Title'})).rejects.toMatchObject({status:502});
});
it('evicts least recent successful search when entry count exceeds200',async()=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify({totalItems:0}))),service=new provider.BookCatalog({apiKey:'test',secret:'cursor',fetch});
 for(let n=0;n<201;n++)await service.search(`account${n}`,{query:`query${n}`});expect(fetch).toHaveBeenCalledTimes(201);
 await service.search('account-new',{query:'query0'});expect(fetch).toHaveBeenCalledTimes(202);
});

it('keeps provider counts within PostgreSQL integer bounds',()=>{
 const mapped=provider.mapBookVolume(volume('v_1',{pageCount:2147483648,ratingsCount:2147483648}),'v_1',123);
 expect(mapped.preview.pageCount).toBeNull();expect(mapped.preview.ratingsCount).toBeNull();
 expect(contract.bookEntityDetailsSchema.safeParse({...mapped.preview,pageCount:2147483648}).success).toBe(false);
});

it('rejects mismatched candidate and provenance identities',()=>{
 const candidate=provider.mapBookVolume(volume(),'v_1',123);
 expect(contract.bookCandidateSchema.safeParse({...candidate,externalId:'different'}).success).toBe(false);
 expect(contract.bookProvenanceSchema.safeParse({...candidate.provenance,sourceUrl:'https://www.googleapis.com/books/v1/volumes/different'}).success).toBe(false);
});

it.each([
 ['missing total',{items:[]}],
 ['string total',{items:[],totalItems:'oops'}],
 ['negative total',{items:[],totalItems:-1}],
 ['fractional total',{items:[],totalItems:0.5}],
 ['unsafe total',{items:[],totalItems:Number.MAX_SAFE_INTEGER+1}],
 ['null total',{items:[],totalItems:null}],
 ['positive initial empty total',{items:[],totalItems:1}],
 ['positive total without items',{totalItems:1}],
 ['zero total with results',{items:[volume()],totalItems:0}],
 ['fewer total than returned results',{items:[volume(),volume('v_2')],totalItems:1}],
])('rejects %s before caching a successful search',async(_label,body)=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify(body))),service=new provider.BookCatalog({apiKey:'injected-only',secret:'cursor',fetch});
 for(let n=0;n<2;n++)await expect(service.search('account',{query:'Book',limit:2})).rejects.toMatchObject({status:502,code:'PROVIDER_INVALID_RESPONSE'});
 expect(fetch).toHaveBeenCalledTimes(2);
});

it.each([0,1,99])('accepts a later explicit empty page with valid total %s without treating pagination as a snapshot',async totalItems=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify({items:[volume()],totalItems:1}))),service=new provider.BookCatalog({apiKey:'injected-only',secret:'cursor',fetch});
 const first=await service.search('account',{query:'Book',limit:1});expect(first.nextCursor).toBeTypeOf('string');
 fetch.mockImplementation(async()=>new Response(JSON.stringify({items:[],totalItems})));
 const query={query:'Book',limit:1,cursor:first.nextCursor};
 const next=await service.search('account',query);expect(next.items).toEqual([]);expect(next.nextCursor).toBeNull();
 await service.search('account',query);expect(fetch).toHaveBeenCalledTimes(2);
});

it('accepts a later result whose offset exceeds an updated valid total estimate',async()=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify({items:[volume()],totalItems:1}))),service=new provider.BookCatalog({apiKey:'injected-only',secret:'cursor',fetch});
 const first=await service.search('account',{query:'Book',limit:1});
 fetch.mockImplementation(async()=>new Response(JSON.stringify({items:[volume('v_2')],totalItems:1})));
 const next=await service.search('account',{query:'Book',limit:1,cursor:first.nextCursor});expect(next.items[0].externalId).toBe('v_2');expect(fetch).toHaveBeenCalledTimes(2);
});

it('rejects and never caches malformed totals on later cursor pages',async()=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify({items:[volume()],totalItems:1}))),service=new provider.BookCatalog({apiKey:'injected-only',secret:'cursor',fetch});
 const first=await service.search('account',{query:'Book',limit:1});
 fetch.mockImplementation(async()=>new Response(JSON.stringify({items:[],totalItems:'oops'})));
 for(let n=0;n<2;n++)await expect(service.search('account',{query:'Book',limit:1,cursor:first.nextCursor})).rejects.toMatchObject({status:502,code:'PROVIDER_INVALID_RESPONSE'});
 expect(fetch).toHaveBeenCalledTimes(3);
});
