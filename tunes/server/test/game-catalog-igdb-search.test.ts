import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createGameProviderCoordinator} from '../services/gameProviderBudget';
import {createGameProviderTransport,type NativeTarget,type NativeResponse} from '../services/gameProviderTransport';
import {GameCatalog} from '../services/gameCatalog';
import {buildGameSearchQuery,parseGameProviderJson,parseGameSearchJson,GAME_SEARCH_BODY_BYTES,gameCoverUrl,toGameCandidate,mapGameProviderFacts} from '../services/gameCatalogContracts';
import {createGameCatalogFromEnv} from '../services/gameCatalogFactory';
import {CatalogService} from '../application/catalog';
import {gameCandidatePageSchema} from '../../shared/explorersGameContract';
import type {NativeOperation} from '../services/gameCatalogTypes';
import type {Actor} from '../application/actor';

// Recorded shape of an IGDB v4 /games answer to the search query below: expanded
// objects always carry their own id next to the requested fields.
const recorded=[
 {id:7346,cover:{id:172453,image_id:'co3p2d'},first_release_date:1488499200,genres:[{id:12,name:'Role-playing (RPG)'},{id:31,name:'Adventure'}],name:'The Legend of Zelda: Breath of the Wild',platforms:[{id:41,name:'Wii U'},{id:130,name:'Nintendo Switch'}],involved_companies:[{id:42391,company:{id:70,name:'Nintendo'},developer:false,publisher:true},{id:42390,company:{id:12761,name:'Nintendo EPD'},developer:true,publisher:false}],slug:'the-legend-of-zelda-breath-of-the-wild',total_rating:93.1,url:'https://www.igdb.com/games/the-legend-of-zelda-breath-of-the-wild'},
 {id:1025,cover:{id:91212,image_id:'co1x7d'},first_release_date:567993600,genres:[{id:31,name:'Adventure'}],name:'Zelda II: The Adventure of Link',platforms:[{id:18,name:'Nintendo Entertainment System'}],slug:'zelda-ii-the-adventure-of-link',url:'https://www.igdb.com/games/zelda-ii-the-adventure-of-link'},
 {id:233,name:'Zelda fan game',slug:'zelda-fan-game'},
];
const actor:Actor={userId:'u',accountId:'a',role:'owner',credential:{kind:'web-session',sessionId:'s',sessionVersion:1}};
const binding={accountId:'a',userId:'u',credentialKey:'web-session:s',authorizationEpoch:'1'};
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
// A big franchise: 24 rows, each with `companies` involved companies carrying nested ids.
const franchiseRow=(i:number,companies:number)=>({id:100000+i,cover:{id:200000+i,image_id:`co${(i*7919).toString(36)}xyz`},first_release_date:1488499200+i,genres:Array.from({length:6},(_,g)=>({id:g+1,name:`Role-playing (RPG) genre ${g}`})),name:`Super Franchise Game Title Number ${i}: Deluxe Anniversary Edition`,platforms:Array.from({length:12},(_,p)=>({id:p+1,name:`PlayStation Platform ${p} Pro`})),involved_companies:Array.from({length:companies},(_,c)=>({id:300000+i*100+c,company:{id:400000+c,name:`Long Studio Company Name Interactive Entertainment Studios International Holdings ${c} Ltd.`},developer:c<2,publisher:c>=companies-2})),slug:`super-franchise-game-title-number-${i}-deluxe-anniversary-edition`,total_rating:88.123456789,url:`https://www.igdb.com/games/super-franchise-game-title-number-${i}-deluxe-anniversary-edition`});
const franchisePage=(companies:number)=>bytes(Array.from({length:24},(_,i)=>franchiseRow(i,companies)));
const padded=(b:Uint8Array,size:number)=>{const out=new Uint8Array(size).fill(0x20);out.set(b);return out;};

describe('IGDB search contract',()=>{
 it('asks only for the fields a candidate shows, so 24 rows stay inside the body limit',()=>{
  const q=buildGameSearchQuery({query:'zelda',limit:24},0);
  for(const f of ['name','cover.image_id','first_release_date','platforms.name','genres.name','involved_companies.company.name','involved_companies.developer','involved_companies.publisher'])expect(q).toContain(f);
  for(const heavy of ['screenshots','storyline','release_dates','summary','involved_companies.company.id'])expect(q).not.toContain(heavy);
 });
 it('keeps a heavy 24-row page with involved companies inside the 64 KiB body limit',()=>{
  // Upper-end real rows: long names, 10 platforms, 6 genres and 12 involved companies each.
  const row=(i:number)=>({id:100000+i,cover:{id:200000+i,image_id:`co${(i*7919).toString(36)}xyz`},first_release_date:1488499200+i,genres:Array.from({length:6},(_,g)=>({id:g+1,name:`Role-playing (RPG) genre ${g}`})),name:`The Legend of a Very Long Game Title Number ${i}: Definitive Edition`,platforms:Array.from({length:10},(_,p)=>({id:p+1,name:`PlayStation Platform ${p} Pro`})),involved_companies:Array.from({length:12},(_,c)=>({id:300000+i*12+c,company:{id:400000+c,name:`Long Studio Company Name Interactive ${c} Ltd.`},developer:c<2,publisher:c>=10})),slug:`the-legend-of-a-very-long-game-title-number-${i}-definitive-edition`,total_rating:88.123456789,url:`https://www.igdb.com/games/the-legend-of-a-very-long-game-title-number-${i}-definitive-edition`});
  const body=bytes(Array.from({length:24},(_,i)=>row(i)));
  expect(body.byteLength).toBeLessThan(65536);
  const rows=parseGameProviderJson(body);expect(rows).toHaveLength(24);
  expect(toGameCandidate(mapGameProviderFacts(rows[0],String(rows[0].id),0)).developer).toBe('Long Studio Company Name Interactive 0 Ltd.');
 });
 it('parses a ~150 KiB search page of 24 rows x 30 companies under the 256 KiB search cap and refuses a larger one',()=>{
  const body=franchisePage(30);expect(body.byteLength).toBeGreaterThan(140*1024);expect(body.byteLength).toBeLessThan(GAME_SEARCH_BODY_BYTES);
  expect(GAME_SEARCH_BODY_BYTES).toBe(262144);
  const rows=parseGameSearchJson(body);expect(rows).toHaveLength(24);expect(rows[0].involved_companies).toHaveLength(30);
  expect(()=>parseGameSearchJson(padded(body,GAME_SEARCH_BODY_BYTES+1))).toThrow();
  expect(parseGameSearchJson(padded(body,GAME_SEARCH_BODY_BYTES))).toHaveLength(24);
  expect(()=>parseGameProviderJson(body)).toThrow();
 });
 it('a 24-row page of the contract fixture stays under 64 KiB and projects its first developer',()=>{
  const [first]=JSON.parse(readFileSync(new URL('./contracts/fixtures/igdb-contract/positive.json',import.meta.url),'utf8'));
  const page=Array.from({length:24},(_,i)=>({...first,id:first.id+i}));expect(JSON.stringify(page).length).toBeLessThan(65536);
  const rows=parseGameProviderJson(bytes(page));expect(toGameCandidate(mapGameProviderFacts(rows[0],'42',0)).developer).toBe('First fixture developer');
 });
 it('accepts the recorded provider shape, including ids on expanded cover objects',()=>{
  const rows=parseGameProviderJson(bytes(recorded));
  expect(rows.map(r=>r.id)).toEqual([7346,1025,233]);
  expect(rows[0].cover?.image_id).toBe('co3p2d');
 });
 it('truncates long lists the app does not show instead of rejecting the response',()=>{
  const platforms=Array.from({length:300},(_,i)=>({id:i+1,name:`Platform ${i+1}`}));
  const genres=Array.from({length:200},(_,i)=>({id:i+1,name:`G${i+1}`}));
  const [row]=parseGameProviderJson(bytes([{...recorded[0],platforms,genres}]));
  expect(row.platforms?.length).toBeLessThanOrEqual(128);expect(row.genres?.length).toBeLessThanOrEqual(128);
 });
 it('builds cover urls only on images.igdb.com from a vetted image id',()=>{
  expect(gameCoverUrl('co3p2d')).toBe('https://images.igdb.com/igdb/image/upload/t_cover_big/co3p2d.jpg');
  expect(gameCoverUrl(null)).toBeNull();
  for(const bad of ['../x','a/b','x.jpg?','']) expect(gameCoverUrl(bad)).toBeNull();
 });
});

const response=(json:unknown):NativeResponse=>({status:200,rawHeaders:['Content-Type','application/json'],body:(async function*(){yield Buffer.from(JSON.stringify(json));})(),complete:()=>true});
const op=(r:NativeResponse):NativeOperation<NativeResponse>=>({outcome:Promise.resolve(r),settled:Promise.resolve(),cancel:()=>{}});
function liveLike(catalogBody?:Uint8Array){
 const now=()=>Date.now();const coordinator=createGameProviderCoordinator({now});const targets:NativeTarget[]=[];
 const connect=vi.fn((t:NativeTarget)=>{targets.push(t);if(t.url.hostname!=='id.twitch.tv'&&catalogBody)return op({...response([]),body:(async function*(){yield catalogBody;})()});return op(response(t.url.hostname==='id.twitch.tv'?{access_token:'synthetic-token',token_type:'bearer',expires_in:3600}:recorded));});
 const transport=createGameProviderTransport({coordinator,credentials:{clientId:'fixture-id',clientSecret:'fixture-secret'},resolve:async()=>[{address:'8.8.8.8',family:4}],connect});
 const catalog=new GameCatalog({coordinator,transport,authorize:async(a:Actor)=>({...binding,accountId:a.accountId,userId:a.userId})});
 return {catalog,targets};
}

describe('IGDB search end to end over the native seam',()=>{
 it('fetches one app token, then POSTs the Apicalypse query with Client-ID and bearer',async()=>{
  const {catalog,targets}=liveLike();
  const first=await catalog.search(actor,{query:'zelda',limit:24});
  await catalog.search({...actor,accountId:'b'},{query:'zelda',limit:24}).catch(()=>undefined);
  expect(first.items.map(i=>i.title)).toContain('The Legend of Zelda: Breath of the Wild');
  expect(targets.filter(t=>t.url.hostname==='id.twitch.tv')).toHaveLength(1);
  const igdb=targets.find(t=>t.url.href==='https://api.igdb.com/v4/games')!;
  expect(igdb.headers['Client-ID']).toBe('fixture-id');expect(igdb.headers.Authorization).toBe('Bearer synthetic-token');
  expect(igdb.body).toContain('search "zelda"');
 });
 it('admits a big-franchise search page over 64 KiB but refuses one over 256 KiB, while resolve keeps 64 KiB',async()=>{
  const big=franchisePage(30);expect(big.byteLength).toBeGreaterThan(140*1024);expect(big.byteLength).toBeLessThan(GAME_SEARCH_BODY_BYTES);
  expect((await liveLike(big).catalog.search(actor,{query:'mario',limit:24})).items).toHaveLength(24);
  const huge=padded(franchisePage(30),GAME_SEARCH_BODY_BYTES+1);
  await expect(liveLike(huge).catalog.search(actor,{query:'mario',limit:24})).rejects.toMatchObject({code:'PROVIDER_INVALID_RESPONSE'});
  const resolveBody=padded(bytes([recorded[0]]),65537);
  await expect(liveLike(resolveBody).catalog.resolve(actor,'7346')).rejects.toMatchObject({code:'PROVIDER_INVALID_RESPONSE'});
 });
});

describe('Games search in the catalog service',()=>{
 const db={query:vi.fn(async()=>({rows:[{status:'active',role:'owner',session_version:'1',blocked_at:null}]}))};
 const owner={accountId:'00000000-0000-4000-8000-000000000001',userId:'user',role:'owner',credential:{kind:'oauth',grantId:'g',scopes:['entities:resolve']}} as Actor;
 it('projects provider facts to candidates the add-game page can fill from',async()=>{
  const {catalog}=liveLike();
  const service=new CatalogService(db as any,{} as any,{} as any,catalog);
  const page=gameCandidatePageSchema.parse(await service.searchGames(owner,{query:'zelda',limit:'24'}));
  expect(page.items[0]).toEqual({externalId:'7346',title:'The Legend of Zelda: Breath of the Wild',year:2017,coverUrl:'https://images.igdb.com/igdb/image/upload/t_cover_big/co3p2d.jpg',platforms:['Wii U','Nintendo Switch'],genres:['Role-playing (RPG)','Adventure'],developer:'Nintendo EPD'});
  expect(page.items[1].developer).toBeNull();
  expect(page.items[2]).toEqual({externalId:'233',title:'Zelda fan game',year:null,coverUrl:null,platforms:[],genres:[],developer:null});
 });
 it('candidate projection keeps short lists only',()=>{
  const c=toGameCandidate({externalId:'1',title:'x',firstReleaseDate:null,coverImageId:null,platforms:Array.from({length:40},(_,i)=>({id:i+1,name:`p${i}`})),genres:[]} as any);
  expect(c.platforms).toHaveLength(12);
 });
 it('says search is not configured, and validates input first, when IGDB credentials are absent',async()=>{
  const service=new CatalogService(db as any,{} as any,{} as any,undefined);
  await expect(service.searchGames(owner,{query:'  '})).rejects.toMatchObject({status:422});
  await expect(service.searchGames(owner,{query:'zelda',limit:'24'})).rejects.toMatchObject({status:503,code:'PROVIDER_NOT_CONFIGURED'});
 });
});

describe('IGDB configuration',()=>{
 it('builds no catalog unless both IGDB_CLIENT_ID and IGDB_CLIENT_SECRET are set',()=>{
  expect(createGameCatalogFromEnv({},async()=>binding)).toBeUndefined();
  expect(createGameCatalogFromEnv({IGDB_CLIENT_ID:'abc'},async()=>binding)).toBeUndefined();
  expect(createGameCatalogFromEnv({IGDB_CLIENT_SECRET:'abc'},async()=>binding)).toBeUndefined();
  expect(createGameCatalogFromEnv({IGDB_CLIENT_ID:'abc',IGDB_CLIENT_SECRET:'def'},async()=>binding)).toBeInstanceOf(GameCatalog);
 });
 it('never reads the retired VITE_IGDB_* names',()=>{
  expect(createGameCatalogFromEnv({VITE_IGDB_CLIENT_ID:'abc',VITE_IGDB_CLIENT_SECRET:'def'} as any,async()=>binding)).toBeUndefined();
 });
});
