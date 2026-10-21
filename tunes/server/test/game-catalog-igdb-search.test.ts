import {describe,it,expect,vi} from 'vitest';
import {createGameProviderCoordinator} from '../services/gameProviderBudget';
import {createGameProviderTransport,type NativeTarget,type NativeResponse} from '../services/gameProviderTransport';
import {GameCatalog} from '../services/gameCatalog';
import {buildGameSearchQuery,parseGameProviderJson,gameCoverUrl,toGameCandidate} from '../services/gameCatalogContracts';
import {createGameCatalogFromEnv} from '../services/gameCatalogFactory';
import {CatalogService} from '../application/catalog';
import {gameCandidatePageSchema} from '../../shared/explorersGameContract';
import type {NativeOperation} from '../services/gameCatalogTypes';
import type {Actor} from '../application/actor';

// Recorded shape of an IGDB v4 /games answer to the search query below: expanded
// objects always carry their own id next to the requested fields.
const recorded=[
 {id:7346,cover:{id:172453,image_id:'co3p2d'},first_release_date:1488499200,genres:[{id:12,name:'Role-playing (RPG)'},{id:31,name:'Adventure'}],name:'The Legend of Zelda: Breath of the Wild',platforms:[{id:41,name:'Wii U'},{id:130,name:'Nintendo Switch'}],slug:'the-legend-of-zelda-breath-of-the-wild',total_rating:93.1,url:'https://www.igdb.com/games/the-legend-of-zelda-breath-of-the-wild'},
 {id:1025,cover:{id:91212,image_id:'co1x7d'},first_release_date:567993600,genres:[{id:31,name:'Adventure'}],name:'Zelda II: The Adventure of Link',platforms:[{id:18,name:'Nintendo Entertainment System'}],slug:'zelda-ii-the-adventure-of-link',url:'https://www.igdb.com/games/zelda-ii-the-adventure-of-link'},
 {id:233,name:'Zelda fan game',slug:'zelda-fan-game'},
];
const actor:Actor={userId:'u',accountId:'a',role:'owner',credential:{kind:'web-session',sessionId:'s',sessionVersion:1}};
const binding={accountId:'a',userId:'u',credentialKey:'web-session:s',authorizationEpoch:'1'};
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));

describe('IGDB search contract',()=>{
 it('asks only for the fields a candidate shows, so 24 rows stay inside the body limit',()=>{
  const q=buildGameSearchQuery({query:'zelda',limit:24},0);
  for(const f of ['name','cover.image_id','first_release_date','platforms.name','genres.name'])expect(q).toContain(f);
  for(const heavy of ['screenshots','storyline','release_dates','involved_companies'])expect(q).not.toContain(heavy);
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
function liveLike(){
 const now=()=>Date.now();const coordinator=createGameProviderCoordinator({now});const targets:NativeTarget[]=[];
 const connect=vi.fn((t:NativeTarget)=>{targets.push(t);return op(response(t.url.hostname==='id.twitch.tv'?{access_token:'synthetic-token',token_type:'bearer',expires_in:3600}:recorded));});
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
});

describe('Games search in the catalog service',()=>{
 const db={query:vi.fn(async()=>({rows:[{status:'active',role:'owner',session_version:'1',blocked_at:null}]}))};
 const owner={accountId:'00000000-0000-4000-8000-000000000001',userId:'user',role:'owner',credential:{kind:'oauth',grantId:'g',scopes:['entities:resolve']}} as Actor;
 it('projects provider facts to candidates the add-game page can fill from',async()=>{
  const {catalog}=liveLike();
  const service=new CatalogService(db as any,{} as any,{} as any,catalog);
  const page=gameCandidatePageSchema.parse(await service.searchGames(owner,{query:'zelda',limit:'24'}));
  expect(page.items[0]).toEqual({externalId:'7346',title:'The Legend of Zelda: Breath of the Wild',year:2017,coverUrl:'https://images.igdb.com/igdb/image/upload/t_cover_big/co3p2d.jpg',platforms:['Wii U','Nintendo Switch'],genres:['Role-playing (RPG)','Adventure']});
  expect(page.items[2]).toEqual({externalId:'233',title:'Zelda fan game',year:null,coverUrl:null,platforms:[],genres:[]});
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
