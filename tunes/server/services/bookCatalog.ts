import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {parseFragment} from 'parse5';

import {bookCandidateRequestSchema,bookCandidateSchema,bookTitleSchema,bookCandidatesSchema,emptyBookDetails,type BookCandidate} from '../../shared/explorersBookContract';
export class BookProviderFailure extends Error {
 constructor(readonly status:404|409|422|429|502|503,readonly code:'NOT_FOUND'|'CONFLICT'|'INVALID_INPUT'|'RATE_LIMITED'|'PROVIDER_INVALID_RESPONSE'|'PROVIDER_UNAVAILABLE',readonly retryAfter?:number){super(status===422?'Invalid Book lookup':status===409?'Book cursor conflict':status===404?'Book unavailable':status===429?'Book lookup rate limited':'Book provider unavailable');}
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
type Options={apiKey?:string;secret?:string;fetch?:typeof fetch;now?:()=>number;deadlineMs?:number};
export class BookCatalog {
 private readonly fetcher:typeof fetch;private readonly now:()=>number;private readonly secret:string;private readonly cache=new Map<string,{expires:number;size:number;items:BookCandidate[]}>();private cacheBytes=0;private readonly flights=new Map<string,Promise<BookCandidate[]>>();private readonly rates=new Map<string,{since:number;count:number}>();private active=0;private readonly queue:Array<()=>void>=[];
 constructor(private readonly options:Options={apiKey:process.env.GOOGLE_BOOKS_API_KEY}){this.fetcher=options.fetch??fetch;this.now=options.now??Date.now;this.secret=options.secret??randomBytes(32).toString('hex');}
 private rate(account:string){const now=this.now();for(const [k,v] of Array.from(this.rates))if(now-v.since>=60000)this.rates.delete(k);const record=this.rates.get(account)??{since:now,count:0};if(record.count>=30||!this.rates.has(account)&&this.rates.size>=10000)throw new BookProviderFailure(429,'RATE_LIMITED',30);record.count++;this.rates.set(account,record);}
 private token(value:object){const body=Buffer.from(JSON.stringify(value)).toString('base64url');return `${body}.${createHmac('sha256',this.secret).update(body).digest('base64url')}`;}
 private cursor(token:string,q:string,limit:number):number{
 try{const parts=token.split('.');if(parts.length!==2)throw input();const expected=createHmac('sha256',this.secret).update(parts[0]).digest();const actual=Buffer.from(parts[1],'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw input();const v=JSON.parse(Buffer.from(parts[0],'base64url').toString());if(!v||Object.keys(v).sort().join(',')!=='expires,language,limit,offset,query'||!Number.isInteger(v.offset)||v.offset<0||v.offset>200||!Number.isSafeInteger(v.expires))throw input();if(v.query!==q||v.limit!==limit||v.language!=='en'||v.expires<=this.now())throw new BookProviderFailure(409,'CONFLICT');return v.offset;}catch(e){if(e instanceof BookProviderFailure)throw e;throw input();}}
 private async request(path:string,params?:URLSearchParams):Promise<any>{
 if(!this.options.apiKey)throw new BookProviderFailure(503,'PROVIDER_UNAVAILABLE');
 const controller=new AbortController();let acquired=false,queued:(()=>void)|undefined;const deadline=this.options.deadlineMs??5000;
 const timeout=new Promise<never>((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(new BookProviderFailure(503,'PROVIDER_UNAVAILABLE')),{once:true});});const timer=setTimeout(()=>controller.abort(),deadline);
 try{return await Promise.race([(async()=>{
 if(this.active>=4){if(this.queue.length>=20)throw new BookProviderFailure(429,'RATE_LIMITED',30);await new Promise<void>(resolve=>{queued=resolve;this.queue.push(resolve);});if(controller.signal.aborted)throw new BookProviderFailure(503,'PROVIDER_UNAVAILABLE');}
 this.active++;acquired=true;const u=new URL(`https://www.googleapis.com/books/v1/${path}`);if(params)u.search=params.toString();u.searchParams.set('key',this.options.apiKey!);
 const r=await this.fetcher(u,{redirect:'error',signal:controller.signal});
 if(r.status===429){const h=r.headers.get('retry-after');const n=h&&/^\d+$/.test(h)?Number(h):30;throw new BookProviderFailure(429,'RATE_LIMITED',Math.min(60,Math.max(1,n)));}if(r.status===404)throw new BookProviderFailure(404,'NOT_FOUND');if(r.status>=500)throw new BookProviderFailure(503,'PROVIDER_UNAVAILABLE');if(!r.ok)throw invalid();
 if(Number(r.headers.get('content-length'))>1048576)throw invalid();const reader=r.body?.getReader();if(!reader)throw invalid();const cancelBody=()=>{void reader.cancel().catch(()=>{});};controller.signal.addEventListener('abort',cancelBody,{once:true});const chunks:Uint8Array[]=[];let size=0;try{while(true){const part=await reader.read();if(controller.signal.aborted)throw new BookProviderFailure(503,'PROVIDER_UNAVAILABLE');if(part.done)break;size+=part.value.length;if(size>1048576){await reader.cancel();throw invalid();}chunks.push(part.value);}}finally{controller.signal.removeEventListener('abort',cancelBody);reader.releaseLock();}try{const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));const pending=[{value:parsed,depth:0}];while(pending.length){const {value,depth}=pending.pop()!;if(depth>32)throw invalid();if(value&&typeof value==='object')for(const child of Object.values(value))pending.push({value:child,depth:depth+1});}return parsed;}catch{throw invalid();}
 })(),timeout]);}catch(e){if(e instanceof BookProviderFailure)throw e;throw new BookProviderFailure(503,'PROVIDER_UNAVAILABLE');}finally{clearTimeout(timer);if(queued){const at=this.queue.indexOf(queued);if(at>=0)this.queue.splice(at,1);}if(acquired){this.active--;this.queue.shift()?.();}}
 }
 async search(account:string,raw:unknown){const parsed=querySchema.safeParse(raw);if(!parsed.success)throw input();let {query,limit,cursor}=parsed.data;if(/^isbn:/i.test(query)&&!isbnQuery(query.slice(5)))throw input();if(/^isbn:/i.test(query))query=`isbn:${query.slice(5).toUpperCase()}`;const offset=cursor?this.cursor(cursor,query,limit):0;this.rate(account);const key=JSON.stringify([query,limit,offset]);let items:BookCandidate[];const existing=this.cache.get(key);
 if(existing&&existing.expires>this.now()){this.cache.delete(key);this.cache.set(key,existing);items=existing.items;}else{if(existing){this.cache.delete(key);this.cacheBytes-=existing.size;}let flight=this.flights.get(key);if(!flight){flight=(async()=>{const body=await this.request('volumes',new URLSearchParams({q:query,langRestrict:'en',printType:'books',startIndex:String(offset),maxResults:String(limit)}));const results=volumeList(body,limit,offset).map(v=>mapBookVolume(v,undefined,this.now()));const size=Buffer.byteLength(key)+Buffer.byteLength(JSON.stringify(results));if(size<=4194304){this.cache.set(key,{items:results,size,expires:this.now()+(results.length?300000:30000)});this.cacheBytes+=size;while(this.cache.size>200||this.cacheBytes>4194304){const k=this.cache.keys().next().value!;this.cacheBytes-=this.cache.get(k)!.size;this.cache.delete(k);}}return results;})();this.flights.set(key,flight);}try{items=await flight;}finally{if(this.flights.get(key)===flight)this.flights.delete(key);}}
 const expiresAt=this.now()+600000;return bookCandidatesSchema.parse({version:'explorers-book-candidates/v1',items,nextCursor:items.length===limit&&offset+limit<=200?this.token({query,limit,offset:offset+limit,language:'en',expires:expiresAt}):null,expiresAt});
 }
 async resolve(account:string,id:string){if(!/^[A-Za-z0-9_-]{1,200}$/.test(id))throw input();this.rate(account);return mapBookVolume(await this.request(`volumes/${encodeURIComponent(id)}`,new URLSearchParams({projection:'full'})),id,this.now());}
}
