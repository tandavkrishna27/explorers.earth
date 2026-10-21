import {expect,it,vi} from 'vitest';
import * as contract from '../../shared/explorersBookContract';
import * as provider from '../services/bookCatalog';
import * as shapes from './fixtures/book-provider-shapes';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
/** Routes by host so one fetch stub plays both providers; records every URL and init. */
function providers(google:()=>Response|Promise<Response>,openLibrary:(u:URL)=>Response=u=>u.pathname==='/search.json'?json(u.searchParams.get('q')?.startsWith('isbn:')?shapes.openLibraryIsbnSearch:shapes.openLibrarySearch):u.pathname.startsWith('/books/')?json(shapes.openLibraryEdition):u.pathname.startsWith('/works/')?json(shapes.openLibraryWork):json(shapes.openLibraryAuthor)){
 return vi.fn(async(raw:URL|RequestInfo,_init?:RequestInit)=>{const u=new URL(String(raw));return u.hostname==='www.googleapis.com'?google():openLibrary(u);});
}
const hosts=(fetch:ReturnType<typeof providers>)=>fetch.mock.calls.map(c=>new URL(String(c[0])).hostname);
const catalog=(fetch:ReturnType<typeof providers>,extra={})=>new provider.BookCatalog({apiKey:'test-only-key',secret:'cursor-secret',fetch,now:()=>1000,openLibraryIntervalMs:0,...extra});

it('keeps Google first when it answers',async()=>{
 const fetch=providers(()=>json({totalItems:1,items:[shapes.googleVolume()]}));
 const page=await catalog(fetch).search('a',{query:'dune',limit:2});
 expect(page.items[0]).toMatchObject({provider:'google_books',externalKind:'volume',externalId:'v_1'});expect(hosts(fetch)).toEqual(['www.googleapis.com']);
});
it.each([
 ['503 backendFailed',()=>json(shapes.googleBackendFailed,503)],
 ['500',()=>json({},500)],
 ['upstream quota 429',()=>new Response('',{status:429,headers:{'retry-after':'5'}})],
 ['network error',()=>{throw new TypeError('fetch failed');}],
])('falls back to Open Library when Google fails provider-side: %s',async(_name,google)=>{
 const fetch=providers(google);
 const page=await catalog(fetch).search('a',{query:'dune',limit:2});
 expect(hosts(fetch)).toEqual(['www.googleapis.com','openlibrary.org']);
 expect(page.items.map(x=>[x.provider,x.externalKind,x.externalId])).toEqual([['open_library','edition','OL7500941M'],['open_library','edition','OL7525229M']]);
 expect(page.items[0].preview).toMatchObject({authors:['Frank Herbert'],publisher:'Berkley',publishedDateText:'August 1, 1978',yearText:'1978',isbn13:'9780425038918',isbn10:'0425038912',pageCount:608,languageTag:'eng',coverUrl:'https://covers.openlibrary.org/b/id/9705237-M.jpg?default=false',coverLargeUrl:'https://covers.openlibrary.org/b/id/9705237-L.jpg?default=false'});
 expect(page.items[1].preview.subtitle).toBe('Dune Chronicles, Book 2');
 expect(page.items[0].provenance).toMatchObject({provider:'open_library',externalKind:'edition',externalId:'OL7500941M',sourceUrl:'https://openlibrary.org/books/OL7500941M.json'});
});
it('falls back on a Google timeout',async()=>{
 const fetch=providers(()=>new Promise<Response>(()=>{}));
 const google=vi.fn((_u:any,init?:RequestInit)=>new Promise<Response>((_,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('aborted')))));
 const routed=vi.fn(async(raw:any,init?:RequestInit)=>new URL(String(raw)).hostname==='www.googleapis.com'?google(raw,init):fetch(raw,init));
 const page=await new provider.BookCatalog({apiKey:'k',secret:'s',fetch:routed as any,deadlineMs:20,openLibraryIntervalMs:0}).search('a',{query:'dune'});
 expect(page.items[0].provider).toBe('open_library');
});
it('falls back when no Google key is configured, without calling Google',async()=>{
 const fetch=providers(()=>{throw new Error('must not call Google');});
 const page=await catalog(fetch,{apiKey:undefined}).search('a',{query:'dune'});
 expect(page.items[0].provider).toBe('open_library');expect(hosts(fetch)).toEqual(['openlibrary.org']);
});
it.each([
 ['400 invalid argument',()=>json(shapes.googleInvalidArgument,400),502],
 ['403 key rejected',()=>json({error:{code:403}},403),502],
 ['404',()=>json({},404),404],
 ['malformed body',()=>json({totalItems:'x'}),502],
])('does not fall back on a Google %s',async(_name,google,status)=>{
 const fetch=providers(google);
 await expect(catalog(fetch).search('a',{query:'dune'})).rejects.toMatchObject({status});expect(hosts(fetch)).toEqual(['www.googleapis.com']);
});
it('never falls back past local validation, the per-account limit or our own queue',async()=>{
 const fetch=providers(()=>json(shapes.googleBackendFailed,503));const service=catalog(fetch);
 await expect(service.search('a',{query:'isbn:1234567890'})).rejects.toMatchObject({status:422});expect(fetch).not.toHaveBeenCalled();
 for(let n=0;n<30;n++)await service.search('limited',{query:`q${n}`});fetch.mockClear();
 await expect(service.search('limited',{query:'again'})).rejects.toMatchObject({status:429});expect(fetch).not.toHaveBeenCalled();
});
it('skips Google for a cool-down after a provider-side failure, then tries it again',async()=>{
 let now=1000;let google=()=>json(shapes.googleBackendFailed,503);const fetch=providers(()=>google());
 const service=new provider.BookCatalog({apiKey:'k',secret:'s',fetch,now:()=>now,openLibraryIntervalMs:0});
 await service.search('a',{query:'one'});await service.search('a',{query:'two'});
 expect(hosts(fetch).filter(h=>h==='www.googleapis.com')).toHaveLength(1);
 now+=60001;google=()=>json({totalItems:1,items:[shapes.googleVolume()]});
 expect((await service.search('a',{query:'three'})).items[0].provider).toBe('google_books');
});
it('reports Open Library failure as provider unavailable when both providers are down',async()=>{
 const fetch=providers(()=>json(shapes.googleBackendFailed,503),()=>json({},503));
 await expect(catalog(fetch).search('a',{query:'dune'})).rejects.toMatchObject({status:503,code:'PROVIDER_UNAVAILABLE'});
});
it('binds the cursor to the provider that served page one',async()=>{
 const fetch=providers(()=>json(shapes.googleBackendFailed,503));const service=catalog(fetch);
 const first=await service.search('a',{query:'dune',limit:2});expect(first.nextCursor).toBeTypeOf('string');fetch.mockClear();
 const second=await service.search('a',{query:'dune',limit:2,cursor:first.nextCursor});
 expect(hosts(fetch)).toEqual(['openlibrary.org']);const u=new URL(String(fetch.mock.calls[0][0]));
 expect(u.searchParams.get('offset')).toBe('2');expect(second.items[0].provider).toBe('open_library');
});
it('sends ISBN queries to Open Library as isbn: and selects the matching ISBN',async()=>{
 const fetch=providers(()=>json(shapes.googleBackendFailed,503));
 const page=await catalog(fetch).search('a',{query:'isbn:9780441172719'});
 const u=new URL(String(fetch.mock.calls[1][0]));expect(u.searchParams.get('q')).toBe('isbn:9780441172719');
 expect(page.items[0]).toMatchObject({externalId:'OL24981555M',preview:{isbn13:'9780441172719',isbn10:'0441172660',publisher:'Ace Books',yearText:'1987'}});
});
it('sends a descriptive User-Agent without an email address and requests only bounded fields',async()=>{
 const fetch=providers(()=>json(shapes.googleBackendFailed,503));await catalog(fetch).search('a',{query:'dune',limit:2});
 const [raw,init]=fetch.mock.calls[1];const ua=new Headers(init?.headers).get('user-agent')!;
 expect(ua).toMatch(/^explorers\.earth\/\S+ \(\+https:\/\/\S+\)$/);expect(ua).not.toMatch(/@/);
 const u=new URL(String(raw));expect(u.origin).toBe('https://openlibrary.org');expect(u.searchParams.get('limit')).toBe('2');
 expect(u.searchParams.get('fields')).not.toMatch(/(^|,)edition_key(,|$)/);expect(init?.redirect).toBe('error');
});
it('truncates oversized Open Library lists instead of rejecting the response',async()=>{
 const doc=structuredClone(shapes.openLibrarySearch.docs[0]) as any;doc.author_name=Array.from({length:500},(_,n)=>`Author ${n}`);doc.editions.docs[0].isbn=Array.from({length:1500},()=>'9780425038918');doc.editions.docs[0].publisher=Array.from({length:500},(_,n)=>`P${n}`);
 const many={...shapes.openLibrarySearch,docs:Array.from({length:12},()=>doc)};
 const fetch=providers(()=>json(shapes.googleBackendFailed,503),()=>json(many));
 const page=await catalog(fetch).search('a',{query:'dune',limit:3});
 expect(page.items).toHaveLength(3);expect(page.items[0].preview.authors).toHaveLength(200);
});
it('skips unusable docs, rejects malformed Open Library bodies and oversized payloads',async()=>{
 const noEdition={...shapes.openLibrarySearch,docs:[{key:'/works/OL1W',title:'No edition'},{...shapes.openLibrarySearch.docs[0],editions:{docs:[{key:'/works/OL1W',title:'Wrong kind'}]}},{...shapes.openLibrarySearch.docs[0],title:'',editions:{docs:[{key:'/books/OL1M',title:' '}]}},shapes.openLibrarySearch.docs[1]]};
 const ok=await catalog(providers(()=>json(shapes.googleBackendFailed,503),()=>json(noEdition))).search('a',{query:'x'});
 expect(ok.items.map(x=>x.externalId)).toEqual(['OL7525229M']);
 await expect(catalog(providers(()=>json(shapes.googleBackendFailed,503),()=>json({docs:'nope'}))).search('a',{query:'x'})).rejects.toMatchObject({status:502});
 const huge=new Response('{"docs":['+'0,'.repeat(600000)+'0]}');
 await expect(catalog(providers(()=>json(shapes.googleBackendFailed,503),()=>huge)).search('a',{query:'x'})).rejects.toMatchObject({status:502});
});
it('resolves an Open Library edition again from its stable id with work description and author names',async()=>{
 const fetch=providers(()=>{throw new Error('must not call Google');});
 const book=await catalog(fetch).resolve('a','OL32848840M','open_library');
 expect(fetch.mock.calls.map(c=>new URL(String(c[0])).pathname)).toEqual(['/books/OL32848840M.json','/works/OL893414W.json','/authors/OL79034A.json']);
 expect(book).toMatchObject({provider:'open_library',externalKind:'edition',externalId:'OL32848840M',title:'Dune',preview:{authors:['Frank Herbert'],publisher:'Hodder',pageCount:604,isbn13:'9781444738209',isbn10:'1444738208',yearText:'2006',description:'Set on the desert planet Arrakis, Dune is the story of the boy Paul Atreides.',subjects:['Dune (Imaginary place)','Fiction','Science fiction'],coverUrl:'https://covers.openlibrary.org/b/id/11481354-M.jpg?default=false'}});
 expect(contract.bookCandidateSchema.parse(book)).toEqual(book);
});
it('keeps an edition when its work or authors cannot be read',async()=>{
 const fetch=providers(()=>json({}),u=>u.pathname.startsWith('/books/')?json(shapes.openLibraryEdition):u.pathname.startsWith('/works/')?json(shapes.openLibraryWorkRedirect):json({},503));
 const book=await catalog(fetch).resolve('a','OL32848840M','open_library');
 expect(book.preview).toMatchObject({description:null,authors:[]});
});
it('rejects a mismatched or malformed Open Library edition id',async()=>{
 const fetch=providers(()=>json({}));const service=catalog(fetch);
 await expect(service.resolve('a','OL1W','open_library')).rejects.toMatchObject({status:422});
 await expect(service.resolve('a','../x','open_library')).rejects.toMatchObject({status:422});expect(fetch).not.toHaveBeenCalled();
 await expect(catalog(providers(()=>json({}),()=>json({...shapes.openLibraryEdition,key:'/books/OL9M'}))).resolve('a','OL32848840M','open_library')).rejects.toMatchObject({status:502});
});
it('spaces Open Library requests to respect its rate limit',async()=>{
 let now=0;const sleeps:number[]=[];const fetch=providers(()=>json({}));
 const service=new provider.BookCatalog({secret:'s',fetch,now:()=>now,openLibraryIntervalMs:400,sleep:async(ms:number)=>{sleeps.push(ms);now+=ms;}});
 await service.resolve('a','OL32848840M','open_library');
 expect(sleeps).toEqual([400,400]);
});
it('accepts Open Library identity in the contract and refuses foreign cover hosts',()=>{
 expect(contract.resolveProviderBookSchema.safeParse({kind:'provider',category:'books',provider:'open_library',externalKind:'edition',externalId:'OL32848840M'}).success).toBe(true);
 expect(contract.resolveProviderBookSchema.safeParse({kind:'provider',category:'books',provider:'open_library',externalKind:'volume',externalId:'OL32848840M'}).success).toBe(false);
 expect(contract.resolveProviderBookSchema.safeParse({kind:'provider',category:'books',provider:'open_library',externalKind:'edition',externalId:'v_1'}).success).toBe(false);
 const details={...contract.emptyBookDetails(),coverUrl:'https://covers.openlibrary.org/b/id/1-M.jpg'};
 expect(contract.bookEntityDetailsSchema.safeParse(details).success).toBe(true);
 expect(contract.bookEntityDetailsSchema.safeParse({...details,coverUrl:'https://archive.org/x.jpg'}).success).toBe(false);
});
