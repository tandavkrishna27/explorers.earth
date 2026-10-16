import {createHmac,randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import pg from 'pg';
import request from 'supertest';
import {beforeAll,afterAll,expect,it,vi} from 'vitest';
import {createCanonicalApp} from '../auth/canonicalApp';
import {resolveExplorersAuthConfig} from '../auth/betterAuth';
import {OwnerContentService} from '../application/ownerContent';
import {PublicContentService} from '../application/publicContent';
const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51474',EXPLORERS_AUTH_SECRET:'search-test-secret-'.repeat(4),GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture'});
let pool:pg.Pool,composed:ReturnType<typeof createCanonicalApp>;
beforeAll(()=>{pool=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:4});composed=createCanonicalApp(pool,config);});
afterAll(async()=>{await pool.end();});
async function fixture(count=3,entityId?:string){
 const user=`search-${randomUUID()}`;
 await pool.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Search',$2)",[user,`${user}@example.invalid`]);
 await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$2,now())",[randomUUID(),user]);
 const context=await composed.auth.$context,session=await context.internalAdapter.createSession(user,false);
 const cookie=`${context.authCookies.sessionToken.name}=${session.token}.${createHmac('sha256',config.secret).update(session.token).digest('base64')}`;
 const me=await request(composed.app).get('/api/explorers/v1/me').set('cookie',cookie);expect(me.status).toBe(200);
 const account=me.body.account.id,handle=`s${randomUUID().replaceAll('-','').slice(0,20)}`;
 await pool.query("UPDATE creator_accounts SET display_name='Search',account_type='Personal',handle=$2,public_profile=true,onboarding_status='complete' WHERE id=$1",[account,handle]);
 await pool.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category IN ('books','guides')",[account]);
 const collection=(await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order,visibility,publication_state) VALUES($1,'books','Reading','reading',0,'public','published') RETURNING id",[account])).rows[0].id;
 const entity=entityId??(await pool.query("INSERT INTO entities(kind,title,origin) VALUES('book','Blue Moon','manual') RETURNING id")).rows[0].id;
 const ids:string[]=[];
 for(let n=0;n<count;n++){
  const id=(await pool.query("INSERT INTO recommendations(account_id,category,entity_id,publication_state,note,created_at) VALUES($1,'books',$2,'published','{\"private\":\"SECRET\"}', '2026-01-01 00:00:00.123456+00'::timestamptz+($3::int*interval '1 microsecond')) RETURNING id",[account,entity,n])).rows[0].id;
  await pool.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'books',$4)",[collection,id,account,n]);ids.push(id);
 }
 return {account,handle,collection,entity,ids,cookie,actor:{userId:user,accountId:account,role:'owner' as const,credential:{kind:'web-session' as const,sessionId:session.id,sessionVersion:1}}};
}
const owner=(f:{cookie:string},query:object={})=>request(composed.app).get('/api/explorers/v1/recommendations/search').set('cookie',f.cookie).query({category:'books',...query});
const pub=(query:object={})=>request(composed.app).get('/api/explorers/v1/public/recommendations/search').query({category:'books',...query});
it('searches effective titles per account, token AND, null/reset and safe public projection',async()=>{
 const a=await fixture(),b=await fixture(1,a.entity);
 await pool.query('INSERT INTO recommendation_display_overrides(recommendation_id,account_id,display_values) VALUES($1,$2,$3),($4,$2,$5)',[a.ids[0],a.account,{title:'Green Sun'},a.ids[1],{title:null}]);
 expect((await owner(a,{query:'moon blue'})).body.items.map((v:any)=>v.id)).toEqual([a.ids[2]]);
 expect((await owner(a,{query:'green sun'})).body.items.map((v:any)=>v.id)).toEqual([a.ids[0]]);
 expect((await owner(a,{query:'moon green'})).body.items).toEqual([]);
 expect((await owner(a,{query:'moo'})).body.items).toEqual([]);
 expect((await owner(b,{query:'blue'})).body.items.map((v:any)=>v.id)).toEqual(b.ids);
 expect((await owner(a,{query:'   '})).body.items.map((v:any)=>v.title)).toEqual(['Green Sun',null,'Blue Moon']);
 expect((await owner(a,{query:'!!!'})).body.items).toEqual([]);
 const publicPage=await pub({creatorHandle:a.handle,query:'green'});expect(publicPage.status).toBe(200);
 expect(Object.keys(publicPage.body.items[0]).sort()).toEqual(['id','kind','title','userRating']);expect(JSON.stringify(publicPage.body)).not.toMatch(/SECRET|display_values|accountId|entityId/);
 await pool.query('DELETE FROM recommendation_display_overrides WHERE recommendation_id=$1',[a.ids[0]]);
 expect((await owner(a,{query:'blue'})).body.items).toHaveLength(2);
});
it('preserves microseconds and all rows through limit+1, snapshot and filter binding',async()=>{
 const f=await fixture(103),first=await owner(f,{limit:100});expect(first.status).toBe(200);expect(first.body.items).toHaveLength(100);
 const second=await owner(f,{limit:100,cursor:first.body.nextCursor});expect(second.status).toBe(200);expect(second.body.items).toHaveLength(3);expect(second.body.nextCursor).toBeNull();
 expect([...first.body.items,...second.body.items].map((v:any)=>v.id)).toEqual(f.ids);
 for(const query of [{limit:99},{query:'blue'},{category:'games'},{cursor:first.body.nextCursor+'x'}]) expect((await owner(f,{limit:100,cursor:first.body.nextCursor,...query})).status).toBe(422);
 const other=await fixture();expect((await owner(other,{limit:100,cursor:first.body.nextCursor})).status).toBe(422);
 await pool.query('INSERT INTO recommendation_display_overrides(recommendation_id,account_id,display_values) VALUES($1,$2,$3)',[f.ids[0],f.account,{title:'Changed'}]);
 expect((await owner(f,{limit:100,cursor:first.body.nextCursor})).status).toBe(409);
});
it('uses UUID tie breaking, Unicode title tokens, parameterization and current authorization',async()=>{
 const f=await fixture(5);await pool.query("UPDATE recommendations SET created_at='2026-01-01 00:00:00.123456+00' WHERE account_id=$1",[f.account]);
 await pool.query('UPDATE entities SET title=$2 WHERE id=$1',[f.entity,'  Café Moon  ']);
 const first=await owner(f,{query:'café',limit:2}),second=await owner(f,{query:'café',limit:2,cursor:first.body.nextCursor}),third=await owner(f,{query:'café',limit:2,cursor:second.body.nextCursor});
 expect([...first.body.items,...second.body.items,...third.body.items].map((v:any)=>v.id)).toEqual([...f.ids].sort());expect(first.body.items[0].title).toBe('Café Moon');
 expect((await owner(f,{query:"moon'); DROP TABLE entities; --"})).body.items).toEqual([]);expect((await pool.query('SELECT id FROM entities WHERE id=$1',[f.entity])).rowCount).toBe(1);
 const service=new OwnerContentService(pool,config.secret),actor={...f.actor,credential:{kind:'oauth' as const,grantId:randomUUID(),scopes:['recommendations:read']}};
 await expect(service.searchRecommendations(actor,{scope:'owner',category:'books',collectionId:f.collection})).rejects.toMatchObject({status:403});
 await pool.query("UPDATE auth_session SET expires_at=now()-interval '1 second' WHERE id=$1",[f.actor.credential.sessionId]);expect((await owner(f,{query:'café',limit:2,cursor:first.body.nextCursor})).status).toBe(401);
});
it('applies every public ancestor gate and deduplicates public paths while owner reads drafts',async()=>{
 const f=await fixture(2);
 const parent=(await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order,visibility,publication_state) VALUES($1,'books','Other','other',1,'public','published') RETURNING id",[f.account])).rows[0].id;
 await pool.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'books',0)",[parent,f.ids[0],f.account]);
 expect((await pub({creatorHandle:f.handle})).body.items).toHaveLength(2);
 await pool.query("UPDATE collections SET visibility='private' WHERE id=$1",[parent]);expect((await pub({creatorHandle:f.handle})).body.items).toHaveLength(2);
 await pool.query("UPDATE recommendations SET publication_state='draft' WHERE id=$1",[f.ids[1]]);expect((await pub({creatorHandle:f.handle})).body.items).toHaveLength(1);expect((await owner(f)).body.items).toHaveLength(2);
 for(const change of ["UPDATE collections SET visibility='private' WHERE id=$1","UPDATE collections SET publication_state='draft' WHERE id=$1","UPDATE collections SET archived_at=now() WHERE id=$1"]){
  await pool.query(change,[f.collection]);expect((await pub({creatorHandle:f.handle})).body.items).toEqual([]);
  await pool.query("UPDATE collections SET visibility='public',publication_state='published',archived_at=NULL WHERE id=$1",[f.collection]);
 }
 for(const change of ["UPDATE creator_accounts SET public_profile=false WHERE id=$1","UPDATE creator_accounts SET onboarding_status='incomplete' WHERE id=$1","UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1"]){
  await pool.query(change,[f.account]);expect((await pub({creatorHandle:f.handle})).status).toBe(404);
  await pool.query("UPDATE creator_accounts SET public_profile=true,onboarding_status='complete',status='active',suspended_at=NULL WHERE id=$1",[f.account]);
 }
 await pool.query("UPDATE account_category_settings SET is_public=false WHERE account_id=$1 AND category='books'",[f.account]);expect((await pub({creatorHandle:f.handle})).status).toBe(404);
});
it('rejects raw unknown/array input and Music, authorizes guides and foreign selected parents',async()=>{
 const a=await fixture(),b=await fixture();
 expect((await request(composed.app).get('/api/explorers/v1/recommendations/search').query({category:'books'})).status).toBe(401);
 for(const query of [{scope:'public'},{accountId:a.account},{query:['blue','moon']},{limit:101},{entityIds:[a.entity,a.entity]},{query:'😀'.repeat(201)},{query:'blue\u0000moon'},{category:'music'},{creatorHandle:a.handle}])expect((await owner(a,query)).status).toBe(422);
 expect((await owner(a,{collectionId:b.collection})).status).toBe(404);expect((await owner(a,{category:'guides',collectionId:a.collection})).status).toBe(404);
 expect((await owner(a,{category:'guides'})).body.items).toEqual([]);
 expect((await pub({creatorHandle:a.handle,category:'guides'})).body.items).toEqual([]);
 const unreferenced=(await pool.query("INSERT INTO entities(kind,title,origin) VALUES('book','Unreferenced','manual') RETURNING id")).rows[0].id;
 expect((await pub({entityIds:unreferenced})).body.items).toEqual([]);
 expect((await request(composed.app).post('/api/explorers/v1/recommendations/search')).status).toBe(405);
 expect((await request(composed.app).post('/api/explorers/v1/public/recommendations/search')).status).toBe(405);
});
it('uses live global continuations and category fences for creator continuation',async()=>{
 const f=await fixture(3),q={entityIds:f.entity,limit:1},global=await pub(q),scoped=await pub({...q,creatorHandle:f.handle});expect(global.status).toBe(200);expect(scoped.status).toBe(200);
 expect(global.body.consistency).toBe('live');expect(scoped.body.consistency).toBe('category-fenced');
 await pool.query("UPDATE recommendations SET publication_state='draft' WHERE id=$1",[f.ids[1]]);
 expect((await pub({...q,cursor:global.body.nextCursor})).body.items.map((v:any)=>v.id)).toEqual([f.ids[2]]);
 expect((await pub({...q,creatorHandle:f.handle,cursor:scoped.body.nextCursor})).status).toBe(409);
 await pool.query("UPDATE collections SET visibility='private' WHERE id=$1",[f.collection]);expect((await pub({...q,cursor:global.body.nextCursor})).body.items).toEqual([]);
});
it('fails closed on malformed and oversized selected titles without scanning notes',async()=>{
 const f=await fixture(1);
 await pool.query('INSERT INTO recommendation_display_overrides(recommendation_id,account_id,display_values) VALUES($1,$2,$3)',[f.ids[0],f.account,{title:{bad:'SECRET'}}]);
 expect((await owner(f)).status).toBe(422);expect((await pub({creatorHandle:f.handle})).status).toBe(400);
 expect((await pub({creatorHandle:f.handle,query:'SECRET'})).body.items).toEqual([]);
 await pool.query('UPDATE recommendation_display_overrides SET display_values=$2 WHERE recommendation_id=$1',[f.ids[0],{title:'x'.repeat(9000)}]);
 expect((await owner(f)).status).toBe(413);expect((await pub({creatorHandle:f.handle})).status).toBe(413);
});
it('expires absolute ten-minute continuations and refuses cross-scope tokens',async()=>{
 const f=await fixture(3),first=await owner(f,{limit:1}),publicFirst=await pub({creatorHandle:f.handle,limit:1});
 const other=await fixture(1);
 for(const changed of [{query:'blue'},{limit:2},{creatorHandle:other.handle},{entityIds:randomUUID()},{collectionId:f.collection},{cursor:publicFirst.body.nextCursor+'x'}])expect((await pub({creatorHandle:f.handle,limit:1,cursor:publicFirst.body.nextCursor,...changed})).status).toBe(400);
 for(const changed of [{accountId:f.account},{scope:'owner'},{order:'title'},{query:['blue','moon']}])expect((await pub(changed)).status).toBe(400);
 expect((await pub({creatorHandle:f.handle,limit:1,cursor:first.body.nextCursor})).status).toBe(400);
 expect((await owner(f,{limit:1,cursor:publicFirst.body.nextCursor})).status).toBe(422);
 const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+600001);
 try{expect((await owner(f,{limit:1,cursor:first.body.nextCursor})).status).toBe(422);expect((await pub({creatorHandle:f.handle,limit:1,cursor:publicFirst.body.nextCursor})).status).toBe(400);}finally{vi.restoreAllMocks();}
});
it('rolls back actual transaction-local timeout and leaves pooled connections usable',async()=>{
 const f=await fixture(1),events:string[]=[];
 const delayed={query:pool.query.bind(pool),connect:async()=>{
  const db=await pool.connect();return {release:()=>db.release(),query:async(sql:string,values:unknown[])=>{
   events.push(sql);if(sql.includes('to_char(r.created_at'))await db.query('SELECT pg_sleep(3)');return db.query(sql,values);
  }};
 }} as unknown as pg.Pool;
 await expect(new OwnerContentService(delayed,config.secret).searchRecommendations(f.actor,{scope:'owner',category:'books'})).rejects.toMatchObject({status:503});
 expect(events).toContain("SET LOCAL statement_timeout = '2000ms'");expect(events).toContain('ROLLBACK');expect(events).not.toContain('COMMIT');
 expect((await owner(f)).status).toBe(200);
 events.length=0;await expect(new PublicContentService(delayed,config.secret).searchRecommendations({scope:'public',category:'books',creatorHandle:f.handle})).rejects.toMatchObject({status:503});expect(events).toContain('ROLLBACK');expect(events).not.toContain('COMMIT');
 const timedApp=createCanonicalApp(delayed,config).app;
 const publicTimeout=await request(timedApp).get('/api/explorers/v1/public/recommendations/search').query({category:'books',creatorHandle:f.handle});expect(publicTimeout.status).toBe(503);expect(publicTimeout.body.error).toMatchObject({code:'UNAVAILABLE',retryable:true});
 const ownerTimeout=await request(timedApp).get('/api/explorers/v1/recommendations/search').set('cookie',f.cookie).query({category:'books'});expect(ownerTimeout.status).toBe(503);expect(ownerTimeout.body.error).toMatchObject({code:'UNAVAILABLE',retryable:true});
});
it('rejects raw entity arrays and keeps selected guide collection authority',async()=>{
 const f=await fixture();
 expect((await owner(f,{entityIds:[f.entity,randomUUID()]})).status).toBe(422);
 expect((await pub({entityIds:[f.entity,randomUUID()]})).status).toBe(400);
 const guide=(await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order,visibility,publication_state) VALUES($1,'guides','Guide','guide',0,'public','published') RETURNING id",[f.account])).rows[0].id;
 expect((await owner(f,{category:'guides',collectionId:guide})).body.items).toEqual([]);expect((await pub({category:'guides',collectionId:guide})).body.items).toEqual([]);
 await pool.query("UPDATE collections SET visibility='private' WHERE id=$1",[guide]);expect((await pub({category:'guides',collectionId:guide})).status).toBe(404);
});
it('delegates named discovery operations and exact anonymous collection ID reads',async()=>{
 const {DiscoveryService}=await import('../application/discovery');const f=await fixture(1),service=new DiscoveryService(pool,config.secret);
 expect((await service.searchRecommendations(f.actor,{scope:'public',category:'books',creatorHandle:f.handle})).items).toHaveLength(1);
 expect((await service.listCreatorRecommendations(f.handle,{category:'books'})).items).toHaveLength(1);
 expect(await service.getCreatorProfile(f.handle)).toMatchObject({id:f.account,handle:f.handle,displayName:'Search'});
 expect(await service.getCollection(null,f.collection)).toMatchObject({id:f.collection,category:'books',title:'Reading'});
 expect(await service.getCollection(f.actor,f.collection)).toMatchObject({id:f.collection,accountId:f.account});
 await pool.query("UPDATE collections SET visibility='private' WHERE id=$1",[f.collection]);expect(await service.getCollection(null,f.collection)).toBeUndefined();
 await expect(service.searchRecommendations(null,{scope:'owner',category:'books'})).rejects.toMatchObject({status:401});
});
it('executes the read client against actual owner and public HTTP adapters without completion authority',async()=>{
 const f=await fixture(3),storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,v:string)=>storage.set(key,v),removeItem:(key:string)=>storage.delete(key)});
 const {default:store}=await import('../../../explorers-earth/src/store/store');const {explorersApiClient,assertCompleteMyCategoryContent}=await import('../../../explorers-earth/src/lib/explorersApiClient');
 store.setState({accountId:f.account,isAuthenticated:true,generation:777});
 vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{expect(init.cache).toBe('no-store');const call=request(composed.app).get(url);if(init.credentials==='include')call.set('cookie',f.cookie);const response=await call;return new Response(JSON.stringify(response.body),{status:response.status});});
 try{
  const first=await explorersApiClient.searchRecommendations({scope:'owner',category:'books',entityIds:[f.entity],query:'blue',limit:2});expect(first.items).toHaveLength(2);
  const second=await explorersApiClient.searchRecommendations({scope:'owner',category:'books',entityIds:[f.entity],query:'blue',limit:2,cursor:first.nextCursor!});expect(second.items).toHaveLength(1);
  expect(()=>assertCompleteMyCategoryContent(second as any)).toThrow();const publicPage=await explorersApiClient.searchRecommendations({scope:'public',category:'books',creatorHandle:f.handle,query:'blue'});expect(publicPage.items).toHaveLength(3);
 }finally{store.setState({accountId:null,isAuthenticated:false,generation:778});vi.unstubAllGlobals();}
});
it('measures actual selective/common/no-match title queries at 1k and 10k without a speculative index',async()=>{
 const evidence:unknown[]=[];
 for(const count of [1000,10000]){
  const f=await fixture(0),titleToken=`scale${f.handle}`;await pool.query('UPDATE entities SET title=$2 WHERE id=$1',[f.entity,`${titleToken} common`]);
  const fixtureDb=await pool.connect();try{
   await fixtureDb.query('BEGIN');
   // Same fixture-writer custom-plan setting as the existing owner scale test:
   // keep all kind/FK/revision guards while avoiding deferred generic CASE scans.
   await fixtureDb.query("SET LOCAL plan_cache_mode='force_custom_plan'");
   await fixtureDb.query("INSERT INTO recommendations(account_id,category,entity_id,publication_state) SELECT $1,'books',$2,'published' FROM generate_series(1,$3::int)",[f.account,f.entity,count]);
   await fixtureDb.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) SELECT $1,id,account_id,category,(row_number() OVER(ORDER BY id)-1)::int FROM recommendations WHERE account_id=$2",[f.collection,f.account]);
   await fixtureDb.query("INSERT INTO recommendation_display_overrides(recommendation_id,account_id,display_values) SELECT id,account_id,$2::jsonb FROM (SELECT id,account_id,row_number() OVER(ORDER BY id) n FROM recommendations WHERE account_id=$1) r WHERE n%100=0",[f.account,{title:`${titleToken} common selective`}]);
   await fixtureDb.query('COMMIT');
  }finally{await fixtureDb.query('ROLLBACK');fixtureDb.release();}
  await pool.query('ANALYZE recommendations');await pool.query('ANALYZE collection_items');await pool.query('ANALYZE recommendation_display_overrides');
  for(const scope of ['owner','public','public-global'] as const)for(const text of ['selective','common','absenttoken']){
   const measurements:{sql:string;values:unknown[]}[]=[];
   const observed={query:pool.query.bind(pool),connect:async()=>{const db=await pool.connect();return {release:()=>db.release(),query:async(sql:string,values:unknown[])=>{if(sql.includes('to_char(r.created_at'))measurements.push({sql,values});return db.query(sql,values);}};}} as unknown as pg.Pool;
   const started=performance.now();const result=scope==='owner'?await new OwnerContentService(observed,config.secret).searchRecommendations(f.actor,{scope,category:'books',query:`${text} ${titleToken}`,limit:24}):await new PublicContentService(observed,config.secret).searchRecommendations({scope:'public',category:'books',query:`${text} ${titleToken}`,...(scope==='public'?{entityIds:[f.entity]}:{}),limit:24});
   expect(result.items).toHaveLength(text==='absenttoken'?0:text==='selective'?Math.min(24,count/100):24);
   const elapsedMs=performance.now()-started,q=measurements[0],plan=(await pool.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${q.sql}`,q.values)).rows[0]['QUERY PLAN'];evidence.push({count,scope,query:text,elapsedMs,plan});
  }
 }
 mkdirSync('.superpowers/shared-search',{recursive:true});writeFileSync('.superpowers/shared-search/scale.json',JSON.stringify(evidence,null,2));
},60000);
