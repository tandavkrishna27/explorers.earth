import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {parseFragment} from 'parse5';

import {bookCandidateRequestSchema,bookCandidateSchema,bookTitleSchema,bookCandidatesSchema,emptyBookDetails,type BookCandidate} from '../../shared/explorersBookContract';
export class BookProviderFailure extends Error {
 constructor(readonly status:404|409|422|429|502|503,readonly code:'NOT_FOUND'|'CONFLICT'|'INVALID_INPUT'|'RATE_LIMITED'|'PROVIDER_INVALID_RESPONSE'|'PROVIDER_UNAVAILABLE',readonly retryAfter?:number,readonly upstream=false){super(status===422?'Invalid Book lookup':status===409?'Book cursor conflict':status===404?'Book unavailable':status===429?'Book lookup rate limited':'Book provider unavailable');}
}
const invalid=()=>new BookProviderFailure(502,'PROVIDER_INVALID_RESPONSE');
const input=()=>new BookProviderFailure(422,'INVALID_INPUT');
function isbnQuery(value:string){
 if(/^\d{13}$/.test(value))return Array.from(value).reduce((sum,x,n)=>sum+Number(x)*(n%2?3:1),0)%10===0;
 if(/^\d{9}[\dX]$/i.test(value))return Array.from(value.toUpperCase()).reduce((sum,x,n)=>sum+(x==='X'?10:Number(x))*(10-n),0)%11===0;
 return false;
}
const url=(raw:unknown):string|null=>{if(typeof raw!=='string'||raw.length>2048)return null;try{const u=new URL(raw);if(u.hostname!=='books.google.com'||u.username||u.password||u.port||!['http:','https:'].includes(u.protocol))return null;u.protocol='https:';return u.toString();}catch{return null;}};
const cleanText=(raw:unknown,max=1000):string|null=>typeof raw==='string'&&raw.trim().length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(raw)&&raw.isWellFormed()?raw.trim():null;
function plainDescription(raw:unknown):string|null{
 const value=cleanText(raw,100000);if(value===null)return null;
 const root=parseFragment(value);const stack=[{node:root as any,depth:0}];let output='';
 while(stack.length){const {node,depth}=stack.pop()!;if(depth>32)return null;if(['script','style','template'].includes(node.nodeName))continue;if(node.nodeName==='#text')output+=node.value;else if(node.childNodes){if(['p','br','div','li'].includes(node.nodeName))output+=' ';for(let i=node.childNodes.length-1;i>=0;i--)stack.push({node:node.childNodes[i],depth:depth+1});}}
 return output.replace(/\s+/g,' ').trim();
}
/** Only server-refetched Volume identity and approved metadata become catalog facts. */
export function mapBookVolume(raw:unknown,expectedId:string|undefined,fetchedAt:number):BookCandidate{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw invalid();const v=raw as any;
 if(typeof v.id!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(v.id)||expectedId!==undefined&&v.id!==expectedId||!v.volumeInfo||typeof v.volumeInfo!=='object')throw invalid();
 const title=bookTitleSchema.safeParse(v.volumeInfo.title);if(!title.success)throw invalid();const i=v.volumeInfo,d=emptyBookDetails();
 for(const [target,source] of [['subtitle','subtitle'],['publisher','publisher'],['publishedDateText','publishedDate'],['languageTag','language']] as const)d[target]=cleanText(i[source],target==='publishedDateText'||target==='languageTag'?100:1000);
 d.yearText=d.publishedDateText?.match(/^\d{4}/)?.[0]??null;d.description=plainDescription(i.description);
 for(const k of ['authors','subjects'] as const){const values=i[k==='subjects'?'categories':k];d[k]=Array.isArray(values)?values.slice(0,200).map(x=>cleanText(x)).filter((x):x is string=>x!==null):[];}
 for(const k of ['pageCount','ratingsCount'] as const)d[k]=Number.isSafeInteger(i[k])&&i[k]>=0&&i[k]<=2147483647?i[k]:null;
 d.providerRating=typeof i.averageRating==='number'&&Number.isFinite(i.averageRating)&&i.averageRating>=1&&i.averageRating<=5?i.averageRating:null;
 for(const id of Array.isArray(i.industryIdentifiers)?i.industryIdentifiers:[]){if(id?.type==='ISBN_13'&&/^\d{13}$/.test(id.identifier))d.isbn13=id.identifier;if(id?.type==='ISBN_10'&&/^\d{9}[\dX]$/.test(id.identifier))d.isbn10=id.identifier;}
 const images=i.imageLinks??{};d.coverUrl=['thumbnail','smallThumbnail','small','medium','large','extraLarge'].map(k=>url(images[k])).find(Boolean)??null;d.coverLargeUrl=['extraLarge','large','medium','small','thumbnail','smallThumbnail'].map(k=>url(images[k])).find(Boolean)??null;d.previewLink=url(i.previewLink);
 return bookCandidateSchema.parse({provider:'google_books',externalKind:'volume',externalId:v.id,title:title.data,preview:d,provenance:{provider:'google_books',externalKind:'volume',externalId:v.id,fetchedAt,sourceUrl:`https://www.googleapis.com/books/v1/volumes/${v.id}`,mappingVersion:1},buyLinkSuggestion:url(v.saleInfo?.buyLink)});
}
const querySchema=bookCandidateRequestSchema;
function volumeList(body:unknown,limit:number,offset:number):unknown[]{
 if(!body||typeof body!=='object'||Array.isArray(body))throw invalid();
 const list=body as {totalItems?:unknown;items?:unknown};
 if(!Number.isSafeInteger(list.totalItems)||(list.totalItems as number)<0)throw invalid();
 const total=list.totalItems as number;
 if(list.items===undefined){if(total!==0)throw invalid();return [];}
 if(!Array.isArray(list.items)||list.items.length>limit||list.items.length>total)throw invalid();
 if(offset===0&&list.items.length===0&&total>0)throw invalid();
 // Later pages may empty or extend past an updated total: offsets are not snapshots.
 return list.items;
}
// Open Library: keyless fallback. Lists are truncated, not rejected: works carry
// thousands of ISBNs and editions, and only the leading entries are ever shown.
const OPEN_LIBRARY='https://openlibrary.org';
export const OPEN_LIBRARY_USER_AGENT='explorers.earth/1.0 (+https://github.com/tandavkrishna27/explorers.earth)';
const OPEN_LIBRARY_FIELDS='key,title,subtitle,author_name,first_publish_year,cover_i,number_of_pages_median,editions,editions.key,editions.title,editions.subtitle,editions.isbn,editions.publisher,editions.publish_date,editions.cover_i,editions.language';
const editionId=/^OL[1-9]\d{0,11}M$/;
const strings=(raw:unknown,max=200):string[]=>Array.isArray(raw)?raw.slice(0,max).map(x=>cleanText(x)).filter((x):x is string=>x!==null&&x.length>0):[];
const first=(raw:unknown,max=1000)=>Array.isArray(raw)?cleanText(raw[0],max):cleanText(raw,max);
const cover=(raw:unknown,size:'M'|'L')=>Number.isSafeInteger(raw)&&(raw as number)>0?`https://covers.openlibrary.org/b/id/${raw}-${size}.jpg?default=false`:null;
const year=(date:string|null,fallback?:unknown)=>date?.match(/\b(\d{4})\b/)?.[1]??(Number.isSafeInteger(fallback)&&(fallback as number)>0&&(fallback as number)<10000?String(fallback):null);
const isbnPick=(values:string[],length:10|13,preferred?:string)=>{const valid=values.map(x=>x.toUpperCase()).filter(x=>x.length===length&&isbnQuery(x));return preferred&&valid.includes(preferred)?preferred:valid[0]??null;};
function openLibraryCandidate(id:string,rawTitle:unknown,d:ReturnType<typeof emptyBookDetails>,fetchedAt:number):BookCandidate{
 const title=bookTitleSchema.safeParse(rawTitle);if(!title.success)throw invalid();
 return bookCandidateSchema.parse({provider:'open_library',externalKind:'edition',externalId:id,title:title.data,preview:d,provenance:{provider:'open_library',externalKind:'edition',externalId:id,fetchedAt,sourceUrl:`${OPEN_LIBRARY}/books/${id}.json`,mappingVersion:1},buyLinkSuggestion:null});
}
/** One search.json work doc becomes its best-matching edition; docs without a usable edition are skipped. */
export function mapOpenLibraryDoc(raw:unknown,fetchedAt:number,isbn?:string):BookCandidate|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;const w=raw as any;const e=Array.isArray(w.editions?.docs)?w.editions.docs[0]:undefined;
 const id=typeof e?.key==='string'?e.key.match(/^\/books\/([^/]+)$/)?.[1]:undefined;if(!id||!editionId.test(id))return null;
 try{const d=emptyBookDetails(),isbns=strings(e.isbn,1000);
  d.subtitle=cleanText(e.subtitle??w.subtitle);d.publisher=first(e.publisher);d.publishedDateText=first(e.publish_date,100);d.yearText=year(d.publishedDateText,w.first_publish_year);d.languageTag=first(e.language,100);
  d.authors=strings(w.author_name);d.pageCount=Number.isSafeInteger(w.number_of_pages_median)&&w.number_of_pages_median>0&&w.number_of_pages_median<=2147483647?w.number_of_pages_median:null;
  d.isbn13=isbnPick(isbns,13,isbn);d.isbn10=isbnPick(isbns,10,isbn);const c=Number.isSafeInteger(e.cover_i)&&e.cover_i>0?e.cover_i:w.cover_i;d.coverUrl=cover(c,'M');d.coverLargeUrl=cover(c,'L');
  return openLibraryCandidate(id,typeof e.title==='string'&&e.title.trim()?e.title:w.title,d,fetchedAt);
 }catch{return null;}
}
const textValue=(raw:unknown)=>raw&&typeof raw==='object'&&!Array.isArray(raw)?(raw as {value?:unknown}).value:raw;
/** A refetched edition, enriched best-effort with its work (description, subjects) and author names. */
export function mapOpenLibraryEdition(raw:unknown,expectedId:string,work:any,authors:string[],fetchedAt:number):BookCandidate{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw invalid();const e=raw as any;if(e.key!==`/books/${expectedId}`)throw invalid();
 const d=emptyBookDetails(),isbns=[...strings(e.isbn_13,1000),...strings(e.isbn_10,1000)];
 d.subtitle=cleanText(e.subtitle);d.publisher=first(e.publishers);d.publishedDateText=first(e.publish_date,100);d.yearText=year(d.publishedDateText);
 d.languageTag=cleanText(typeof e.languages?.[0]?.key==='string'?e.languages[0].key.replace(/^\/languages\//,''):null,100);
 d.pageCount=Number.isSafeInteger(e.number_of_pages)&&e.number_of_pages>0&&e.number_of_pages<=2147483647?e.number_of_pages:null;
 d.isbn13=isbnPick(isbns,13);d.isbn10=isbnPick(isbns,10);d.authors=authors.slice(0,200);d.subjects=strings(work?.subjects);
 d.description=plainDescription(textValue(e.description)??textValue(work?.description));
 const c=Array.isArray(e.covers)?e.covers.find((x:unknown)=>Number.isSafeInteger(x)&&(x as number)>0):undefined;d.coverUrl=cover(c,'M');d.coverLargeUrl=cover(c,'L');
 return openLibraryCandidate(expectedId,e.title,d,fetchedAt);
}
function openLibraryDocs(body:unknown,limit:number):unknown[]{
 if(!body||typeof body!=='object'||Array.isArray(body)||!Array.isArray((body as any).docs))throw invalid();
 return (body as any).docs.slice(0,limit);
}
type BookProvider='google_books'|'open_library';
type Options={apiKey?:string;secret?:string;fetch?:typeof fetch;now?:()=>number;deadlineMs?:number;openLibraryIntervalMs?:number;sleep?:(ms:number)=>Promise<void>};
type Lane={active:number;max:number;queue:Array<()=>void>};
type Page={items:BookCandidate[];full:boolean};
/** Google Books first; Open Library only when Google is unconfigured or failing provider-side. */
export class BookCatalog {
 private readonly fetcher:typeof fetch;private readonly now:()=>number;private readonly secret:string;private readonly cache=new Map<string,{expires:number;size:number;page:Page}>();private cacheBytes=0;private readonly flights=new Map<string,Promise<Page>>();private readonly rates=new Map<string,{since:number;count:number}>();
 private readonly lanes:Record<BookProvider,Lane>={google_books:{active:0,max:4,queue:[]},open_library:{active:0,max:2,queue:[]}};
 // Open Library asks identified clients to stay near 3 requests/second.
 private openLibraryNext=0;private googleDownUntil=0;
 constructor(private readonly options:Options={apiKey:process.env.GOOGLE_BOOKS_API_KEY}){this.fetcher=options.fetch??fetch;this.now=options.now??Date.now;this.secret=options.secret??randomBytes(32).toString('hex');}
 private rate(account:string){const now=this.now();for(const [k,v] of Array.from(this.rates))if(now-v.since>=60000)this.rates.delete(k);const record=this.rates.get(account)??{since:now,count:0};if(record.count>=30||!this.rates.has(account)&&this.rates.size>=10000)throw new BookProviderFailure(429,'RATE_LIMITED',30);record.count++;this.rates.set(account,record);}
 private token(value:object){const body=Buffer.from(JSON.stringify(value)).toString('base64url');return `${body}.${createHmac('sha256',this.secret).update(body).digest('base64url')}`;}
 private cursor(token:string,q:string,limit:number):{offset:number;provider:BookProvider}{
 try{const parts=token.split('.');if(parts.length!==2)throw input();const expected=createHmac('sha256',this.secret).update(parts[0]).digest();const actual=Buffer.from(parts[1],'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw input();const v=JSON.parse(Buffer.from(parts[0],'base64url').toString());
 // Cursors minted before the fallback carry no provider and always meant Google.
 if(!v||!['expires,language,limit,offset,query','expires,language,limit,offset,provider,query'].includes(Object.keys(v).sort().join(','))||!Number.isInteger(v.offset)||v.offset<0||v.offset>200||!Number.isSafeInteger(v.expires)||v.provider!==undefined&&!['google_books','open_library'].includes(v.provider))throw input();if(v.query!==q||v.limit!==limit||v.language!=='en'||v.expires<=this.now())throw new BookProviderFailure(409,'CONFLICT');return {offset:v.offset,provider:v.provider??'google_books'};}catch(e){if(e instanceof BookProviderFailure)throw e;throw input();}}
 private async request(provider:BookProvider,u:URL):Promise<any>{
 const lane=this.lanes[provider],google=provider==='google_books';
 const unavailable=()=>new BookProviderFailure(503,'PROVIDER_UNAVAILABLE',undefined,true);
 const controller=new AbortController();let acquired=false,queued:(()=>void)|undefined;const deadline=this.options.deadlineMs??5000;
 const timeout=new Promise<never>((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(unavailable()),{once:true});});const timer=setTimeout(()=>controller.abort(),deadline);
 try{return await Promise.race([(async()=>{
 if(lane.active>=lane.max){if(lane.queue.length>=20)throw new BookProviderFailure(429,'RATE_LIMITED',30);await new Promise<void>(resolve=>{queued=resolve;lane.queue.push(resolve);});if(controller.signal.aborted)throw unavailable();}
 lane.active++;acquired=true;
 if(!google){const interval=this.options.openLibraryIntervalMs??350,now=this.now(),wait=this.openLibraryNext-now;this.openLibraryNext=Math.max(now,this.openLibraryNext)+interval;if(wait>0)await (this.options.sleep??(ms=>new Promise<void>(resolve=>setTimeout(resolve,ms))))(wait);if(controller.signal.aborted)throw unavailable();}
 else u.searchParams.set('key',this.options.apiKey!);
 const r=await this.fetcher(u,{redirect:'error',signal:controller.signal,...google?{}:{headers:{'User-Agent':OPEN_LIBRARY_USER_AGENT,Accept:'application/json'}}});
 if(r.status===429){const h=r.headers.get('retry-after');const n=h&&/^\d+$/.test(h)?Number(h):30;throw new BookProviderFailure(429,'RATE_LIMITED',Math.min(60,Math.max(1,n)),true);}if(r.status===404)throw new BookProviderFailure(404,'NOT_FOUND');if(r.status>=500)throw unavailable();if(!r.ok)throw invalid();
 if(Number(r.headers.get('content-length'))>1048576)throw invalid();const reader=r.body?.getReader();if(!reader)throw invalid();const cancelBody=()=>{void reader.cancel().catch(()=>{});};controller.signal.addEventListener('abort',cancelBody,{once:true});const chunks:Uint8Array[]=[];let size=0;try{while(true){const part=await reader.read();if(controller.signal.aborted)throw unavailable();if(part.done)break;size+=part.value.length;if(size>1048576){await reader.cancel();throw invalid();}chunks.push(part.value);}}finally{controller.signal.removeEventListener('abort',cancelBody);reader.releaseLock();}try{const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));const pending=[{value:parsed,depth:0}];while(pending.length){const {value,depth}=pending.pop()!;if(depth>32)throw invalid();if(value&&typeof value==='object')for(const child of Object.values(value))pending.push({value:child,depth:depth+1});}return parsed;}catch{throw invalid();}
 })(),timeout]);}catch(e){if(e instanceof BookProviderFailure)throw e;throw unavailable();}finally{clearTimeout(timer);if(queued){const at=lane.queue.indexOf(queued);if(at>=0)lane.queue.splice(at,1);}if(acquired){lane.active--;lane.queue.shift()?.();}}
 }
 private async fetchPage(provider:BookProvider,query:string,limit:number,offset:number):Promise<Page>{
 if(provider==='google_books'){const u=new URL('https://www.googleapis.com/books/v1/volumes');u.search=new URLSearchParams({q:query,langRestrict:'en',printType:'books',startIndex:String(offset),maxResults:String(limit)}).toString();const items=volumeList(await this.request(provider,u),limit,offset).map(v=>mapBookVolume(v,undefined,this.now()));return {items,full:items.length===limit};}
 const u=new URL(`${OPEN_LIBRARY}/search.json`);u.search=new URLSearchParams({q:query,fields:OPEN_LIBRARY_FIELDS,lang:'en',limit:String(limit),offset:String(offset)}).toString();
 const docs=openLibraryDocs(await this.request(provider,u),limit),isbn=/^isbn:/i.test(query)?query.slice(5):undefined;
 return {items:docs.map(doc=>mapOpenLibraryDoc(doc,this.now(),isbn)).filter((x):x is BookCandidate=>x!==null),full:docs.length===limit};
 }
 private async page(provider:BookProvider,query:string,limit:number,offset:number):Promise<Page>{
 const key=JSON.stringify([provider,query,limit,offset]);const existing=this.cache.get(key);
 if(existing&&existing.expires>this.now()){this.cache.delete(key);this.cache.set(key,existing);return existing.page;}
 if(existing){this.cache.delete(key);this.cacheBytes-=existing.size;}
 let flight=this.flights.get(key);if(!flight){flight=(async()=>{const page=await this.fetchPage(provider,query,limit,offset);const size=Buffer.byteLength(key)+Buffer.byteLength(JSON.stringify(page));if(size<=4194304){this.cache.set(key,{page,size,expires:this.now()+(page.items.length?300000:30000)});this.cacheBytes+=size;while(this.cache.size>200||this.cacheBytes>4194304){const k=this.cache.keys().next().value!;this.cacheBytes-=this.cache.get(k)!.size;this.cache.delete(k);}}return page;})();this.flights.set(key,flight);}
 try{return await flight;}finally{if(this.flights.get(key)===flight)this.flights.delete(key);}
 }
 /** Google failed provider-side (5xx, timeout, network, upstream quota): never local validation, 4xx or our own limits. */
 private googleFailed(e:unknown){return e instanceof BookProviderFailure&&e.upstream;}
 async search(account:string,raw:unknown){const parsed=querySchema.safeParse(raw);if(!parsed.success)throw input();let {query,limit,cursor}=parsed.data;if(/^isbn:/i.test(query)&&!isbnQuery(query.slice(5)))throw input();if(/^isbn:/i.test(query))query=`isbn:${query.slice(5).toUpperCase()}`;
 const position=cursor?this.cursor(cursor,query,limit):undefined,offset=position?.offset??0;this.rate(account);let provider:BookProvider;let page:Page;
 if(position){provider=position.provider;page=await this.page(provider,query,limit,offset);}
 else if(this.options.apiKey&&this.googleDownUntil<=this.now()){try{provider='google_books';page=await this.page(provider,query,limit,offset);}catch(e){if(!this.googleFailed(e))throw e;this.googleDownUntil=this.now()+60000;provider='open_library';page=await this.page(provider,query,limit,offset);}}
 else{provider='open_library';page=await this.page(provider,query,limit,offset);}
 const expiresAt=this.now()+600000;return bookCandidatesSchema.parse({version:'explorers-book-candidates/v1',items:page.items,nextCursor:page.full&&offset+limit<=200?this.token({query,limit,offset:offset+limit,language:'en',provider,expires:expiresAt}):null,expiresAt});
 }
 async resolve(account:string,id:string,provider:BookProvider='google_books'){
 if(provider==='open_library')return this.resolveOpenLibrary(account,id);
 if(!/^[A-Za-z0-9_-]{1,200}$/.test(id))throw input();this.rate(account);if(!this.options.apiKey)throw new BookProviderFailure(503,'PROVIDER_UNAVAILABLE');
 const u=new URL(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}`);u.searchParams.set('projection','full');return mapBookVolume(await this.request(provider,u),id,this.now());
 }
 private async resolveOpenLibrary(account:string,id:string){
 if(!editionId.test(id))throw input();this.rate(account);
 const edition=await this.request('open_library',new URL(`${OPEN_LIBRARY}/books/${id}.json`));if(!edition||typeof edition!=='object'||edition.key!==`/books/${id}`)throw invalid();
 const optional=async(path:string,kind:string)=>{try{const v=await this.request('open_library',new URL(`${OPEN_LIBRARY}${path}.json`));return v?.type?.key===kind&&v.key===path?v:null;}catch{return null;}};
 const workKey=typeof edition.works?.[0]?.key==='string'&&/^\/works\/OL[1-9]\d{0,11}W$/.test(edition.works[0].key)?edition.works[0].key:null;const work=workKey?await optional(workKey,'/type/work'):null;
 const keys=(Array.isArray(edition.authors)&&edition.authors.length?edition.authors.map((a:any)=>a?.key):Array.isArray(work?.authors)?work.authors.map((a:any)=>a?.author?.key):[]).filter((k:unknown):k is string=>typeof k==='string'&&/^\/authors\/OL[1-9]\d{0,11}A$/.test(k)).slice(0,3);
 const authors:string[]=[];for(const key of keys){const name=cleanText((await optional(key,'/type/author'))?.name);if(name)authors.push(name);}
 return mapOpenLibraryEdition(edition,id,work,authors,this.now());
 }
}
