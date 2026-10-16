import pg from 'pg';import {randomBytes,randomUUID} from 'node:crypto';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {PostgresPublicProfileGateway} from '../publicProfile/postgresPublicProfileGateway';
import {publicGamesProjection,discardGamePublicResult,gamePublicBudgetSnapshot,createGamePublicExecutor,runGamePublicRead} from '../publicProfile/publicGamesProjection';
import {PublicProfileService} from '../publicProfile/publicProfileService';
import {setupExplorersPublicProfileRoutes} from '../routes/explorersPublicProfileRoutes';
import express from 'express';import request from 'supertest';
import http from 'node:http';
import {provisionMusicRuntimeLogin} from '../db/music-runtime-role';
let admin:pg.Pool,runtime:pg.Pool;const role='games_public_'+randomBytes(8).toString('hex'),ownership='games-a3m:'+role,secret='games-public-test-'.repeat(4);
beforeAll(async()=>{
 if(process.env.MUSIC_C5_POSTGRES_TEST!=='1'||!process.env.DATABASE_URL_TEST)throw Error('Explicit owned Games PG authority required');
 const url=new URL(process.env.DATABASE_URL_TEST);if(url.hostname!=='127.0.0.1'||Number(url.port)<10240)throw Error('Disposable loopback Games PG required');
 admin=new pg.Pool({connectionString:url.toString(),max:4});const password=randomBytes(32).toString('base64url');
 await provisionMusicRuntimeLogin(admin,{loginRole:role,password},{ownershipComment:ownership});url.username=role;url.password=password;runtime=new pg.Pool({connectionString:url.toString(),max:4});
 expect((await runtime.query('SELECT current_user')).rows[0].current_user).toBe(role);
});
afterAll(async()=>{await runtime?.end();if(admin){const row=(await admin.query("SELECT shobj_description(oid,'pg_authid') AS ownership FROM pg_roles WHERE rolname=$1",[role])).rows[0];if(row?.ownership===ownership){await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);}await admin.end();}});
async function fixture(){
 const handle='games'+randomUUID().replaceAll('-','').slice(0,16);
 const account=(await admin.query("INSERT INTO creator_accounts(handle,display_name,account_type,onboarding_status,public_profile) VALUES($1,'Games owner','Creator','complete',true) RETURNING id",[handle])).rows[0].id;
 await admin.query('INSERT INTO account_presentation(account_id) VALUES($1)',[account]);
 await admin.query("INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,'games',true,0) ON CONFLICT(account_id,category) DO UPDATE SET is_public=true",[account]);
 await admin.query("INSERT INTO account_category_pin_state(account_id,category) VALUES($1,'games')",[account]);
 const lists=[];for(let index=0;index<2;index++)lists.push((await admin.query("INSERT INTO collections(account_id,category,title,slug,display_order,visibility,publication_state) VALUES($1,'games',$2,$3,$4,'public','published') RETURNING id,slug",[account,'Games '+index,'list-'+randomUUID(),index])).rows[0]);
 const recommendations=[];for(let index=0;index<3;index++){const entity=(await admin.query("INSERT INTO entities(kind,title,origin) VALUES('game','Same title','manual') RETURNING id")).rows[0].id;const rec=(await admin.query("INSERT INTO recommendations(account_id,category,entity_id,publication_state) VALUES($1,'games',$2,'published') RETURNING id",[account,entity])).rows[0].id;recommendations.push(rec);await admin.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'games',$4)",[lists[index===2?1:0].id,rec,account,index]);}
 await admin.query("INSERT INTO category_recommendation_pins(account_id,category,recommendation_id,collection_id,position) VALUES($1,'games',$2,$3,0)",[account,recommendations[2],lists[1].id]);return {account,handle,lists,recommendations};
}
it('registered native gateway exposes manual rows to a runtime-role anonymous read',async()=>{
 const f=await fixture(),gateway=new PostgresPublicProfileGateway(runtime,secret);const page=await gateway.resolveCategory(f.handle,'games',1) as any;
 try{expect(page).toMatchObject({version:'explorers-manual-games-page/v1',gameLists:[{id:f.lists[0].id}]});expect(page.gameLists[0].recommendations.map((row:any)=>row.id)).toEqual(f.recommendations.slice(0,2));}finally{discardGamePublicResult(page);}
});
it('category pins include position zero outside the first list page without provider facts',async()=>{
 const f=await fixture(),page=await publicGamesProjection(runtime,f.handle,1,undefined,undefined,secret) as any;
 try{expect(page.topPicks).toHaveLength(1);expect(page.topPicks[0]).toMatchObject({id:f.recommendations[2],pinPosition:0,gamePresentation:{origin:'manual',providerExternalId:null,providerFacts:null}});}finally{discardGamePublicResult(page);}
});
it('actual HTTP response finish releases the charged result after native serialization',async()=>{
 const f=await fixture(),service=new PublicProfileService(new PostgresPublicProfileGateway(runtime,secret),{ttlMs:0}),app=express();
 setupExplorersPublicProfileRoutes(app,{category:service.category.bind(service),detail:service.detail.bind(service)});
 const reply=await request(app).get(`/api/explorers/v1/profiles/${f.handle}/recommendations/games?limit=1`);
 expect(reply.status).toBe(200);expect(reply.body.gameLists[0].id).toBe(f.lists[0].id);
 expect(reply.headers['cache-control']).toBe('no-store');expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
});
it('actual overlapping category and detail HTTP reads queue FIFO then release all native and HTTP custody',async()=>{
 const f=await fixture(),gateway=new PostgresPublicProfileGateway(runtime,secret);let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);let initial=0;
 const service=new PublicProfileService({resolveAccount:async username=>{initial++;if(initial<=2)await held;return gateway.resolveAccount(username);},resolveCategory:gateway.resolveCategory.bind(gateway),resolveDetail:gateway.resolveDetail.bind(gateway)},{ttlMs:0}),app=express();
 setupExplorersPublicProfileRoutes(app,{category:service.category.bind(service),detail:service.detail.bind(service)});
 const base=`/api/explorers/v1/profiles/${f.handle}/recommendations/games`,reads=[request(app).get(base+'?limit=1'),request(app).get(base+'?limit=1'),request(app).get(base+'/'+f.lists[0].slug+'?limit=12')].map(read=>read.then(reply=>reply));
 try{for(let i=0;i<100&&gamePublicBudgetSnapshot().callers<3;i++)await new Promise(resolve=>setTimeout(resolve,5));
  expect(initial).toBe(2);expect(gamePublicBudgetSnapshot()).toEqual({active:2,callers:3,memory:48*1024*1024+8192});release();
  const replies=await Promise.all(reads);expect(replies.map(reply=>reply.status)).toEqual([200,200,200]);expect(replies[2].body.gameLists[0].recommendations).toHaveLength(2);
  expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
 }finally{release();await Promise.allSettled(reads);}
});
it('actual queued socket cancellation removes admission and HTTP lifetime listeners without starting authority',async()=>{
 const f=await fixture(),held=[await publicGamesProjection(runtime,f.handle,1,undefined,undefined,secret),await publicGamesProjection(runtime,f.handle,1,undefined,undefined,secret)];
 const gateway=new PostgresPublicProfileGateway(runtime,secret);let authorityCalls=0;const service=new PublicProfileService({...gateway,resolveAccount:async username=>{authorityCalls++;return gateway.resolveAccount(username);},resolveCategory:gateway.resolveCategory.bind(gateway),resolveDetail:gateway.resolveDetail.bind(gateway)},{ttlMs:0});
 const app=express();let observed:any;app.use((req,res,next)=>{observed={req,res,beforeAbort:req.listenerCount('aborted'),beforeClose:res.listenerCount('close')};next();});setupExplorersPublicProfileRoutes(app,{category:service.category.bind(service),detail:service.detail.bind(service)});
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('Owned HTTP listener required');
 const client=http.get(`http://127.0.0.1:${address.port}/api/explorers/v1/profiles/${f.handle}/recommendations/games?limit=1`);client.on('error',()=>{});
 try{for(let i=0;i<100&&gamePublicBudgetSnapshot().callers<3;i++)await new Promise(resolve=>setTimeout(resolve,5));expect(gamePublicBudgetSnapshot().callers).toBe(3);expect(authorityCalls).toBe(0);client.destroy();
  for(let i=0;i<100&&gamePublicBudgetSnapshot().callers!==2;i++)await new Promise(resolve=>setTimeout(resolve,5));
  expect(gamePublicBudgetSnapshot()).toEqual({active:2,callers:2,memory:48*1024*1024});expect(authorityCalls).toBe(0);expect(observed.req.listenerCount('aborted')).toBe(observed.beforeAbort);expect(observed.res.listenerCount('close')).toBe(observed.beforeClose);
 }finally{client.destroy();held.forEach(discardGamePublicResult);await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
 expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
});
it('queued activation observes newly hidden account ancestry rather than enqueue-time public eligibility',async()=>{
 const f=await fixture(),hidden=await fixture(),held=[await publicGamesProjection(runtime,f.handle,1,undefined,undefined,secret),await publicGamesProjection(runtime,f.handle,1,undefined,undefined,secret)],gateway=new PostgresPublicProfileGateway(runtime,secret);let authorityCalls=0;
 const service=new PublicProfileService({resolveAccount:async username=>{authorityCalls++;return gateway.resolveAccount(username);},resolveCategory:gateway.resolveCategory.bind(gateway),resolveDetail:gateway.resolveDetail.bind(gateway)},{ttlMs:0}),app=express();setupExplorersPublicProfileRoutes(app,{category:service.category.bind(service),detail:service.detail.bind(service)});
 const read=request(app).get(`/api/explorers/v1/profiles/${hidden.handle}/recommendations/games?limit=1`).then(reply=>reply);
 try{for(let i=0;i<100&&gamePublicBudgetSnapshot().callers<3;i++)await new Promise(resolve=>setTimeout(resolve,5));expect(authorityCalls).toBe(0);expect(gamePublicBudgetSnapshot().callers).toBe(3);
  await admin.query('UPDATE creator_accounts SET public_profile=false WHERE id=$1',[hidden.account]);held.forEach(discardGamePublicResult);const reply=await read;expect(reply.status).toBe(404);expect(reply.body.error.code).toBe('NOT_FOUND');expect(authorityCalls).toBe(1);expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
 }finally{held.forEach(discardGamePublicResult);await read;}
});
it('actual conditional304 rechecks native privacy and does not retain a result after finish',async()=>{
 const f=await fixture(),service=new PublicProfileService(new PostgresPublicProfileGateway(runtime,secret),{ttlMs:0}),app=express();setupExplorersPublicProfileRoutes(app,{category:service.category.bind(service),detail:service.detail.bind(service)});
 const path=`/api/explorers/v1/profiles/${f.handle}/recommendations/games?limit=12`,first=await request(app).get(path);expect(first.status).toBe(200);expect(first.headers.etag).toEqual(expect.any(String));
 expect((await request(app).get(path).set('If-None-Match',first.headers.etag)).status).toBe(304);expect(gamePublicBudgetSnapshot().memory).toBe(0);
 await admin.query("UPDATE account_category_settings SET is_public=false WHERE account_id=$1 AND category='games'",[f.account]);
 const denied=await request(app).get(path).set('If-None-Match',first.headers.etag);expect(denied.status).toBe(404);expect(denied.headers.etag).not.toBe(first.headers.etag);expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
});
it('actual socket close retains stalled native authority custody until its settlement then refunds exactly once',async()=>{
 const f=await fixture();let announce!:()=>void,release!:()=>void;const entered=new Promise<void>(resolve=>announce=resolve),gate=new Promise<void>(resolve=>release=resolve);
 const wrapper={connect:runtime.connect.bind(runtime),query:async(...args:any[])=>{const value=await(runtime.query as any)(...args);announce();await gate;return value;}};
 const service=new PublicProfileService(new PostgresPublicProfileGateway(wrapper as any,secret),{ttlMs:0}),app=express();setupExplorersPublicProfileRoutes(app,{category:service.category.bind(service),detail:service.detail.bind(service)});
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('Owned HTTP listener required');
 const client=http.get(`http://127.0.0.1:${address.port}/api/explorers/v1/profiles/${f.handle}/recommendations/games?limit=1`);client.on('error',()=>{});
 try{await entered;client.destroy();expect(gamePublicBudgetSnapshot()).toEqual({active:1,callers:1,memory:24*1024*1024});release();
  for(let index=0;index<100&&gamePublicBudgetSnapshot().active;index++)await new Promise(resolve=>setTimeout(resolve,5));
  expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
 }finally{release();client.destroy();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

it('native HTTP Games continuation binds its exact category limit and rejects invalid signed evidence as400',async()=>{
 const f=await fixture(),service=new PublicProfileService(new PostgresPublicProfileGateway(runtime,secret),{ttlMs:0}),app=express();
 setupExplorersPublicProfileRoutes(app,{category:service.category.bind(service),detail:service.detail.bind(service)});
 const path=`/api/explorers/v1/profiles/${f.handle}/recommendations/games`;
 const first=await request(app).get(path+'?limit=1');expect(first.status).toBe(200);expect(first.body.nextCursor).toEqual(expect.any(String));
 const second=await request(app).get(path).query({limit:1,cursor:first.body.nextCursor});expect(second.status).toBe(200);expect(second.body.gameLists[0].id).toBe(f.lists[1].id);
 const wrongLimit=await request(app).get(path).query({limit:2,cursor:first.body.nextCursor});expect(wrongLimit.status).toBe(400);expect(wrongLimit.body.error.code).toBe('BAD_REQUEST');
 const malformed=await request(app).get(path).query({limit:1,cursor:'o0'});expect(malformed.status).toBe(400);expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
});

it('denies a cumulative near-valid native note page before any note payload reaches the driver',async()=>{
 const f=await fixture();await admin.query('DELETE FROM category_recommendation_pins WHERE account_id=$1',[f.account]);
 const note={version:1,format:'quill-html',html:'<p>'+'x'.repeat(160000)+'</p>'};
 await admin.query('UPDATE recommendations SET note=$2 WHERE account_id=$1',[f.account,note]);
 for(let index=3;index<14;index++){
  const entity=(await admin.query("INSERT INTO entities(kind,title,origin) VALUES('game','Bounded manual','manual') RETURNING id")).rows[0].id;
  const id=(await admin.query("INSERT INTO recommendations(account_id,category,entity_id,publication_state,note) VALUES($1,'games',$2,'published',$3) RETURNING id",[f.account,entity,note])).rows[0].id;
  await admin.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'games',$4)",[f.lists[0].id,id,f.account,index]);
 }
 // The13th row is lookahead; all notes individually satisfy authoring bounds.
 let receivedNoteBytes=0;
 const wrapped={query:runtime.query.bind(runtime),connect:async()=>{const db=await runtime.connect();return{release:db.release.bind(db),query:async(...args:any[])=>{const reply=await (db.query as any)(...args);for(const row of reply.rows??[])receivedNoteBytes+=Buffer.byteLength(JSON.stringify(row.note??row.payload?.note??null));return reply;}};}};
 await expect(publicGamesProjection(wrapped as any,f.handle,1,undefined,undefined,secret)).rejects.toMatchObject({code:'READ_LIMIT'});
 expect(receivedNoteBytes).toBeLessThan(1024);expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
});

it('actual HTTP maps native admission exhaustion to503 READ_LIMIT without releasing held consumers',async()=>{
 const f=await fixture(),held=[],controllers:Array<AbortController>=[],queued:Array<Promise<unknown>>=[];try{
  held.push(await publicGamesProjection(runtime,f.handle,1,undefined,undefined,secret));held.push(await publicGamesProjection(runtime,f.handle,1,undefined,undefined,secret));
  const executor=createGamePublicExecutor(undefined,async()=>undefined);for(let i=0;i<30;i++){const controller=new AbortController();controllers.push(controller);const read=runGamePublicRead({username:f.handle,kind:'category',limit:1},executor,controller.signal);void read.catch(()=>{});queued.push(read);}
  const service=new PublicProfileService(new PostgresPublicProfileGateway(runtime,secret),{ttlMs:0}),app=express();setupExplorersPublicProfileRoutes(app,{category:service.category.bind(service),detail:service.detail.bind(service)});
  const reply=await request(app).get(`/api/explorers/v1/profiles/${f.handle}/recommendations/games?limit=1`);
  expect(reply.status).toBe(503);expect(reply.body).toEqual({version:'explorers-public-error/v1',error:{code:'READ_LIMIT',retryable:true}});expect(gamePublicBudgetSnapshot()).toEqual({active:2,callers:32,memory:48*1024*1024+30*8192});
 }finally{controllers.forEach(controller=>controller.abort());await Promise.allSettled(queued);held.forEach(discardGamePublicResult);}expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
});
it('SQL bounds oversized native collection metadata before its description reaches the driver',async()=>{
 const f=await fixture();await admin.query('UPDATE collections SET description=$2 WHERE id=$1',[f.lists[0].id,'x'.repeat(33000)]);let received=0;
 const wrapped={query:runtime.query.bind(runtime),connect:async()=>{const db=await runtime.connect();return{release:db.release.bind(db),query:async(...args:any[])=>{const reply=await (db.query as any)(...args);for(const row of reply.rows??[])received+=Buffer.byteLength(row.description??row.payload?.description??'');return reply;}};}};
 await expect(publicGamesProjection(wrapped as any,f.handle,1,undefined,undefined,secret)).rejects.toMatchObject({code:'READ_LIMIT'});expect(received).toBe(0);expect(gamePublicBudgetSnapshot().memory).toBe(0);
});
it('charges repeated hero representations cumulatively and suppresses the second oversized native batch',async()=>{
 const f=await fixture();await admin.query('DELETE FROM category_recommendation_pins WHERE account_id=$1',[f.account]);
 const note={version:1,format:'quill-html',html:'<p>'+'x'.repeat(240000)+'</p>'},ids=[...f.recommendations.slice(0,2)];
 for(let index=2;index<7;index++){
  const entity=(await admin.query("INSERT INTO entities(kind,title,origin) VALUES('game','Hero manual','manual') RETURNING id")).rows[0].id;
  const id=(await admin.query("INSERT INTO recommendations(account_id,category,entity_id,publication_state) VALUES($1,'games',$2,'published') RETURNING id",[f.account,entity])).rows[0].id;ids.push(id);
  await admin.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'games',$4)",[f.lists[0].id,id,f.account,index]);
 }
 await admin.query('UPDATE recommendations SET note=$2 WHERE id=ANY($1::uuid[])',[ids,note]);
 for(let position=0;position<ids.length;position++)await admin.query("INSERT INTO category_recommendation_pins(account_id,category,recommendation_id,collection_id,position) VALUES($1,'games',$2,$3,$4)",[f.account,ids[position],f.lists[0].id,position]);
 let received=0;const batches:number[]=[];
 const wrapped={query:runtime.query.bind(runtime),connect:async()=>{const db=await runtime.connect();return{release:db.release.bind(db),query:async(...args:any[])=>{const reply=await(db.query as any)(...args);let batch=0;for(const row of reply.rows??[])batch+=Buffer.byteLength(JSON.stringify(row.note??row.payload?.note??null));received+=batch;batches.push(batch);return reply;}};}};
 await expect(publicGamesProjection(wrapped as any,f.handle,1,undefined,undefined,secret)).rejects.toMatchObject({code:'READ_LIMIT'});
 expect(batches.some(bytes=>bytes>1600000)).toBe(true);expect(received).toBeLessThan(1800000);expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
});
