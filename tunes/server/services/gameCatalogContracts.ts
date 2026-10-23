import {gameSearchInputSchema,gameExternalIdSchema,gameProviderRowSchema,gameCandidateSchema,type GameCandidate,type GameSearchInput,type GameProviderRow,type GameProviderFacts,type GamePrecision,type GameReleaseFact} from '../../shared/explorersGameContract';
import {parseStrictJson} from '../deployment/platform-release-contract';
export class GameContractFailure extends Error {readonly code='GAME_CONTRACT_INVALID';constructor(){super('Game contract invalid');this.name='GameContractFailure';}}
const invalid=():never=>{throw new GameContractFailure();};
const safe=<T>(work:()=>T):T=>{try{return work();}catch{return invalid();}};
/**
 * A search hit shows only these, which keeps 24 rows well inside the 64 KiB body limit.
 * involved_companies carries the developer name; publisher is requested too because the
 * strict company shape requires it (a boolean, a few bytes per company).
 */
const SEARCH_FIELDS='id,slug,name,cover.image_id,first_release_date,total_rating,genres.name,platforms.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,url';
const FIELDS='id,slug,name,cover.image_id,summary,first_release_date,total_rating,total_rating_count,genres.id,genres.name,platforms.id,platforms.name,involved_companies.id,involved_companies.company.id,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,game_modes.id,game_modes.name,screenshots.image_id,url';
export function buildGameSearchQuery(input:GameSearchInput,offset:number):string{return safe(()=>{const v=gameSearchInputSchema.parse(input);if(!Number.isSafeInteger(offset)||offset<0||offset>5976)invalid();return `fields ${SEARCH_FIELDS}; search ${JSON.stringify(v.query)}; limit 24; offset ${offset};`;});}
export function buildGameResolveQuery(id:string):string{return safe(()=>`fields ${FIELDS}; where id = ${gameExternalIdSchema.parse(id)}; limit 1;`);}
/** Allocation of native/concurrent representations is deliberately outside this pure64KiB profile. */
function bounded(raw:unknown):void{const stack:{value:unknown;depth:number}[]=[{value:raw,depth:0}];let nodes=0;while(stack.length){const {value,depth}=stack.pop()!;if(++nodes>20000||depth>8)invalid();if(value&&typeof value==='object'){const descriptors=Object.getOwnPropertyDescriptors(value);if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)invalid();const keys=Object.keys(descriptors);if(keys.length>20000-nodes)invalid();for(const key of keys){if(Array.isArray(value)&&key==='length')continue;const descriptor=descriptors[key];if(!('value' in descriptor))invalid();stack.push({value:descriptor.value,depth:depth+1});}}else if(typeof value==='number'&&!Number.isFinite(value))invalid();}}
export function parseGameProviderJson(bytes:Uint8Array):readonly GameProviderRow[]{return safe(()=>{if(!(bytes instanceof Uint8Array)||bytes.byteLength>65536)invalid();const raw=parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes));return parseGameProviderPage(raw);});}
export function parseGameProviderPage(raw:unknown):readonly GameProviderRow[]{return safe(()=>{bounded(raw);if(!Array.isArray(raw))return invalid();if(raw.length>24)return invalid();const dropped=new Set<string>();let rows=0;const page=raw.flatMap((v:unknown)=>{const row=normalizeGameProviderRow(v,dropped);if(!row)rows++;return row?[row]:[];});if(dropped.size||rows)console.warn(`IGDB response: dropped ${rows} row(s) without id/name; dropped fields ${[...dropped].sort().join(',')||'none'}`);return page;});}
const CONTROL=/[\u0000-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const clean=(v:unknown,max:number)=>typeof v==='string'?v.replace(CONTROL,'').replace(/\s+/g,' ').trim().slice(0,max):undefined;
const LISTS=['genres','platforms','game_modes','involved_companies','screenshots','release_dates'] as const;
/**
 * Real IGDB rows omit optional fields, answer some with ids instead of objects and carry
 * fields we never asked for. Only id and name are essential: a row without them is
 * dropped, and any other field that does not fit is dropped (list items one by one)
 * instead of rejecting the response. Field names go to `dropped`, never values.
 */
function normalizeGameProviderRow(raw:unknown,dropped:Set<string>):GameProviderRow|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;const r=raw as Record<string,unknown>;const name=clean(r.name,200);
 if(typeof r.id!=='number'||!Number.isSafeInteger(r.id)||r.id<1||!name)return null;
 const shape=gameProviderRowSchema.shape;const out:Record<string,unknown>={id:r.id,name};
 const keep=(key:keyof typeof shape,value:unknown)=>{if(value===undefined||value===null)return;const ok=shape[key].safeParse(value);if(ok.success&&ok.data!=null)out[key]=ok.data;else dropped.add(key);};
 keep('slug',r.slug);keep('summary',clean(r.summary,4000));keep('storyline',clean(r.storyline,4000));
 keep('first_release_date',r.first_release_date);keep('total_rating',r.total_rating);keep('total_rating_count',r.total_rating_count);keep('url',r.url);
 if(r.cover&&typeof r.cover==='object')keep('cover',{image_id:(r.cover as Record<string,unknown>).image_id});else keep('cover',r.cover);
 for(const key of LISTS){const list=r[key];if(list==null)continue;if(!Array.isArray(list)){dropped.add(key);continue;}
  const items:unknown[]=list.flatMap((item):unknown[]=>{const candidate=item&&typeof item==='object'&&!Array.isArray(item)?(key==='genres'||key==='platforms'||key==='game_modes'?{id:(item as Record<string,unknown>).id,name:clean((item as Record<string,unknown>).name,200)}:key==='screenshots'?{image_id:(item as Record<string,unknown>).image_id}:item):item;const ok=shape[key].safeParse([candidate]);if(!ok.success){dropped.add(key);return [];}return ok.data??[];});
  if(items.length)out[key]=shape[key].parse(items);}
 return gameProviderRowSchema.parse(out);
}
const formats:Record<string,GamePrecision>=Object.assign(Object.create(null),{YYYYMMMMDD:'day',YYYYMMMM:'month',YYYY:'year',YYYYQ1:'quarter',YYYYQ2:'quarter',YYYYQ3:'quarter',YYYYQ4:'quarter',TBD:'unknown'});
const legacy=['YYYYMMMMDD','YYYYMMMM','YYYY','YYYYQ1','YYYYQ2','YYYYQ3','YYYYQ4','TBD'];
const regions=['','europe','north_america','australia','new_zealand','japan','china','asia','worldwide','korea','brazil'];
function releaseFact(r:NonNullable<GameProviderRow['release_dates']>[number]):GameReleaseFact{const current=r.date_format??null;const old=r.category??null;if(current&&old!==null&&current.format!==legacy[old])invalid();if(r.release_region&&r.region!=null&&r.release_region.region.toLowerCase().replaceAll(' ','_')!==regions[r.region])invalid();const format=current?.format??(old!==null?legacy[old]:null);const precision=format?formats[format]??'unknown':'unknown';if(precision==='day'&&r.date!=null){const d=new Date(r.date*1000);if(r.y!=null&&r.y!==d.getUTCFullYear()||r.m!=null&&r.m!==d.getUTCMonth()+1||r.d!=null&&r.d!==d.getUTCDate())invalid();}return {id:r.id,date:r.date??null,year:r.y??null,month:r.m??null,day:r.d??null,human:r.human??null,platform:r.platform??null,dateFormat:current,releaseRegion:r.release_region??null,legacyCategory:old,legacyRegion:r.region??null,precision,precisionSource:current?'current':old!==null?'legacy':r.date!=null?'timestamp-only':'unknown'};}
export function mapGameProviderFacts(row:GameProviderRow,id:string,at:number):GameProviderFacts{return safe(()=>{bounded(row);const r=gameProviderRowSchema.parse(row);const expected=gameExternalIdSchema.parse(id);if(String(r.id)!==expected||!Number.isSafeInteger(at)||at<0)invalid();const companies=r.involved_companies??[];return {provider:'igdb',externalKind:'game',externalId:expected,mappingVersion:1,fetchedAt:at,title:r.name,slug:r.slug??null,summary:r.summary??null,storyline:r.storyline??null,firstReleaseDate:r.first_release_date??null,providerRating:r.total_rating??null,ratingsCount:r.total_rating_count??null,genres:r.genres??[],platforms:r.platforms??[],gameModes:r.game_modes??[],companies,developer:companies.find(c=>c.developer)?.company.name??null,publisher:companies.find(c=>c.publisher)?.company.name??null,coverImageId:r.cover?.image_id??null,screenshotIds:(r.screenshots??[]).map(s=>s.image_id),providerUrl:r.url??null,releases:(r.release_dates??[]).map(releaseFact)};});}
export function formatGameProviderRating(raw:number|null):string|null{if(raw===null)return null;if(!Number.isFinite(raw)||raw<0||raw>100)invalid();return (raw/10).toFixed(1);}
export function gameReleaseDisplay(facts:GameProviderFacts):{dateText:string|null;yearText:string|null}{return safe(()=>{const time=facts.firstReleaseDate;if(time===null){const release=facts.releases.find(r=>r.date===null);return {dateText:null,yearText:release?.year==null?null:String(release.year)};}if(!Number.isInteger(time)||time<0||time>253402300799)invalid();const date=new Date(time*1000),year=String(date.getUTCFullYear()),text=date.toISOString().slice(0,10);if(!facts.releases.length)return {dateText:text,yearText:year};const release=facts.releases.find(r=>r.date===time);if(!release)return {dateText:null,yearText:null};if(release.precisionSource==='timestamp-only')return {dateText:text,yearText:year};return {dateText:release.precision==='day'?text:null,yearText:release.precision==='unknown'?(release.year===null?null:String(release.year)):release.year===null?year:String(release.year)};});}

const COVER_ID=/^[A-Za-z0-9_-]{1,200}$/;
/** IGDB cover art; production CSP img-src admits any https origin. */
export function gameCoverUrl(imageId:string|null):string|null{return imageId&&COVER_ID.test(imageId)?`https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`:null;}
export function toGameCandidate(facts:Pick<GameProviderFacts,'externalId'|'title'|'firstReleaseDate'|'coverImageId'|'platforms'|'genres'>&Partial<Pick<GameProviderFacts,'developer'>>):GameCandidate{
 const year=facts.firstReleaseDate===null?null:new Date(facts.firstReleaseDate*1000).getUTCFullYear();
 return gameCandidateSchema.parse({externalId:facts.externalId,title:facts.title,year:year&&year>=1?year:null,coverUrl:gameCoverUrl(facts.coverImageId),platforms:facts.platforms.slice(0,12).map(p=>p.name),genres:facts.genres.slice(0,12).map(g=>g.name),developer:facts.developer??null});
}
