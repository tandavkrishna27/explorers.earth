import {describe,it,expect,vi,afterEach} from 'vitest';
import {createGameProviderCoordinator} from '../services/gameProviderBudget';
import {createGameProviderTransport,type NativeTarget,type NativeResponse} from '../services/gameProviderTransport';
import {parseGameProviderJson,parseGameProviderPage,mapGameProviderFacts,toGameCandidate} from '../services/gameCatalogContracts';
import type {NativeOperation} from '../services/gameCatalogTypes';

// Modelled on documented IGDB v4 /games answers (api-docs.igdb.com) for the fields we
// request. Real rows omit optional fields freely and carry more than we ask for.
const celeste={id:26226,name:'Celeste',slug:'celeste',cover:{id:85030,image_id:'co3byy'},first_release_date:1516665600,total_rating:89.62318840579711,genres:[{id:8,name:'Platform'},{id:31,name:'Adventure'},{id:32,name:'Indie'}],platforms:[{id:6,name:'PC (Microsoft Windows)'},{id:14,name:'Mac'},{id:48,name:'PlayStation 4'},{id:49,name:'Xbox One'},{id:130,name:'Nintendo Switch'},{id:170,name:'Google Stadia'},{id:3,name:'Linux'}],url:'https://www.igdb.com/games/celeste'};
const hades={id:113112,name:'Hades',slug:'hades--1',cover:{id:85467,image_id:'co39vc'},first_release_date:1600387200,total_rating:91.4,genres:[{id:12,name:'Role-playing (RPG)'},{id:25,name:"Hack and slash/Beat 'em up"},{id:31,name:'Adventure'},{id:32,name:'Indie'}],platforms:[{id:6,name:'PC (Microsoft Windows)'},{id:130,name:'Nintendo Switch'}],url:'https://www.igdb.com/games/hades--1'};
const noCover={id:305152,name:'Celeste Classic 2',slug:'celeste-classic-2',url:'https://www.igdb.com/games/celeste-classic-2'};
const messy={id:77,name:'  Messy\u0007 Game ',slug:'messy',checksum:'a6b1c3d4-0000-0000-0000-000000000000',cover:{image_id:'co1abc',alpha_channel:false,animated:false,height:1200,width:900},first_release_date:-5,total_rating:101,
 genres:[13,{id:5,name:'Shooter'}],platforms:[6,48],summary:`Bell\u0007 ${'x'.repeat(150000)}`,url:'http://igdb.com/x',release_dates:[{id:1,date:1,category:99,human:'TBD'}]};

const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
afterEach(()=>warn.mockClear());

describe('real IGDB rows',()=>{
 it('parses Celeste, Hades and a game with no cover as they come',()=>{
  const rows=parseGameProviderPage([celeste,hades,noCover]);
  expect(rows.map(r=>r.name)).toEqual(['Celeste','Hades','Celeste Classic 2']);
  expect(toGameCandidate(mapGameProviderFacts(rows[0],'26226',0))).toMatchObject({title:'Celeste',year:2018,coverUrl:'https://images.igdb.com/igdb/image/upload/t_cover_big/co3byy.jpg'});
  expect(toGameCandidate(mapGameProviderFacts(rows[2],'305152',0))).toMatchObject({coverUrl:null,year:null,platforms:[],genres:[]});
 });
 it('keeps only id and name strict: odd optional fields are dropped, never the response',()=>{
  const [row]=parseGameProviderPage([messy]);
  expect(row).toMatchObject({id:77,name:'Messy Game',cover:{image_id:'co1abc'}});
  expect(row.first_release_date ?? null).toBeNull();expect(row.total_rating ?? null).toBeNull();expect(row.url ?? null).toBeNull();
  expect(row.genres).toEqual([{id:5,name:'Shooter'}]);expect(row.platforms ?? []).toEqual([]);
  expect(row.summary!.length).toBeLessThanOrEqual(4000);expect(row.summary).not.toMatch(/\u0007/);
  expect(row.release_dates ?? []).toEqual([]);
  expect(()=>mapGameProviderFacts(row,'77',0)).not.toThrow();
 });
 it('drops a row without id or name and keeps the rest of the page',()=>{
  expect(parseGameProviderPage([{name:'no id'},{id:5},{id:6,name:'  '},celeste]).map(r=>r.id)).toEqual([26226]);
 });
 it('logs which fields were dropped, by name only, never the values',()=>{
  parseGameProviderPage([messy]);
  const logged=warn.mock.calls.map(c=>c.join(' ')).join('\n');
  for(const field of ['first_release_date','total_rating','url','release_dates'])expect(logged).toContain(field);
  expect(logged).not.toContain('Messy');expect(logged).not.toContain('igdb.com/x');
 });
 it('still refuses a body that is not a JSON array',()=>{
  expect(()=>parseGameProviderJson(new TextEncoder().encode('{"message":"x"}'))).toThrow();
 });
});

const response=(json:unknown,headers:string[]=[]):NativeResponse=>({status:200,rawHeaders:['Content-Type','application/json;charset=utf-8',...headers],body:(async function*(){yield Buffer.from(JSON.stringify(json));})(),complete:()=>true});
const op=(r:NativeResponse):NativeOperation<NativeResponse>=>({outcome:Promise.resolve(r),settled:Promise.resolve(),cancel:()=>{}});
// Twitch's documented client-credentials answer: app tokens live for about 58 days.
const twitchToken={access_token:'jostpf5q0uzmxmkba9iyug38kjtgh',expires_in:5011271,token_type:'bearer'};
function transport(catalogHeaders:string[]=[],token:unknown=twitchToken){
 let now=0;const coordinator=createGameProviderCoordinator({now:()=>now});const targets:NativeTarget[]=[];
 const connect=vi.fn((t:NativeTarget)=>{targets.push(t);return op(t.url.hostname==='id.twitch.tv'?response(token):response([celeste],catalogHeaders));});
 return {t:createGameProviderTransport({coordinator,credentials:{clientId:'fixtureid',clientSecret:'fixturesecret'},resolve:async()=>[{address:'8.8.8.8',family:4}],connect}),targets,clock:(n:number)=>now=n};
}
const run=async(f:ReturnType<typeof transport>)=>{const o=f.t.catalog('fields name; search "celeste"; limit 24;',new AbortController().signal);try{return await o.outcome;}finally{await o.settled;}};

describe('real Twitch token and IGDB headers',()=>{
 it('accepts a Twitch app token that lives for weeks, and refreshes it within a day',async()=>{
  const f=transport();
  expect((await run(f))[0].name).toBe('Celeste');
  f.clock(23*3600*1000);await run(f);
  expect(f.targets.filter(t=>t.url.hostname==='id.twitch.tv')).toHaveLength(1);
  f.clock(25*3600*1000);await run(f);
  expect(f.targets.filter(t=>t.url.hostname==='id.twitch.tv')).toHaveLength(2);
 });
 it('tolerates extra token fields and repeated harmless response headers',async()=>{
  const f=transport(['Set-Cookie','a=1','Set-Cookie','b=2','Vary','Origin','Vary','Accept-Encoding'],{...twitchToken,scope:[],extra:true});
  expect((await run(f))[0].id).toBe(26226);
 });
 it('still refuses a duplicated Content-Type or Content-Length',async()=>{
  await expect(run(transport(['Content-Type','text/html']))).rejects.toMatchObject({code:'PROVIDER_INVALID_RESPONSE'});
 });
});
