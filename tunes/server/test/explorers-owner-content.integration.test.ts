import { createHmac, randomUUID } from 'node:crypto';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import request from 'supertest';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { createCanonicalApp } from '../auth/canonicalApp';
import { resolveExplorersAuthConfig } from '../auth/betterAuth';
import { OwnerContentService } from '../application/ownerContent';
import type { Actor } from '../application/actor';
import { apiErrorSchema } from '../../shared/explorersContract';
import { assertSelectedCollectionPlan } from './owner-content-plan-assertion';
const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51474',EXPLORERS_AUTH_SECRET:'owner-read-secret-'.repeat(4),GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture'});
let pool:pg.Pool, composed:ReturnType<typeof createCanonicalApp>;
beforeAll(()=>{pool=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:4});composed=createCanonicalApp(pool,config);});
afterAll(async()=>{await pool.end();});
async function fixture(lists=27,children=53) {
  const userId=`owner-read-${randomUUID()}`;
  await pool.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Owner',$2)",[userId,`${userId}@example.invalid`]);
  await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())",[randomUUID(),userId,userId]);
  const context=await composed.auth.$context,session=await context.internalAdapter.createSession(userId,false);
  const cookie=`${context.authCookies.sessionToken.name}=${session.token}.${createHmac('sha256',config.secret).update(session.token).digest('base64')}`;
  const me=await request(composed.app).get('/api/explorers/v1/me').set('cookie',cookie);expect(me.status).toBe(200);
  const accountId=me.body.account.id,ids:string[]=[],recommendations:string[]=[];
  for(let n=0;n<lists;n++) ids.push((await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'books',$2,$3,$4) RETURNING id",[accountId,`List ${n}`,`list-${n}`,n])).rows[0].id);
  const entity=(await pool.query("INSERT INTO entities(kind,title,origin) VALUES('book','Shared','manual') RETURNING id")).rows[0].id;
  for(let n=0;n<children;n++) {
    const id=(await pool.query("INSERT INTO recommendations(account_id,category,entity_id,note) VALUES($1,'books',$2,'{\"private\":\"not-core\"}') RETURNING id",[accountId,entity])).rows[0].id;
    await pool.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'books',$4)",[ids.at(-1),id,accountId,n]);recommendations.push(id);
  }
  return {userId,accountId,cookie,ids,recommendations,sessionId:session.id};
}
const get=(f:{cookie:string},path:string,query:object={})=>request(composed.app).get(`/api/explorers/v1${path}`).set('cookie',f.cookie).query(query);
it('pages the top-pick union beyond fifteen, preserves ties and rejects stale continuation',async()=>{
 const f=await fixture(1,17);
 await pool.query("INSERT INTO account_category_pin_state(account_id,category,revision) VALUES($1,'books',1)",[f.accountId]);
 for(const id of f.recommendations) await pool.query("INSERT INTO category_recommendation_pins(account_id,category,recommendation_id,collection_id,position) VALUES($1,'books',$2,$3,0)",[f.accountId,id,f.ids[0]]);
 const path='/categories/books/top-picks',first=await get(f,path,{limit:8});expect(first.status).toBe(200);expect(first.body.items).toHaveLength(8);expect(first.body.pinRevision).toBe(1);
 const second=await get(f,path,{limit:8,cursor:first.body.nextCursor,snapshotToken:first.body.snapshotToken});expect(second.status).toBe(200);
 const third=await get(f,path,{limit:8,cursor:second.body.nextCursor});expect(third.status).toBe(200);expect(third.body.nextCursor).toBeNull();
 expect([...first.body.items,...second.body.items,...third.body.items].map(x=>x.recommendationId)).toEqual([...f.recommendations].sort());
 expect((await get(f,path,{limit:9,cursor:first.body.nextCursor})).status).toBe(422);
 expect((await get(f,'/categories/games/top-picks',{limit:8,cursor:first.body.nextCursor})).status).toBe(422);
 await pool.query('UPDATE collections SET title=$2 WHERE id=$1',[f.ids[0],'Changed']);expect((await get(f,path,{limit:8,cursor:first.body.nextCursor})).status).toBe(409);
});
it('reads strict owner top-picks and leaves absent pin state null',async()=>{
 const f=await fixture(1,0),path='/categories/books/top-picks';
 expect((await request(composed.app).get(`/api/explorers/v1${path}`)).status).toBe(401);
 const empty=await get(f,path);expect(empty.status).toBe(200);expect(empty.body.items).toEqual([]);expect(empty.body.pinRevision).toBeNull();
 expect((await pool.query('SELECT 1 FROM account_category_pin_state WHERE account_id=$1',[f.accountId])).rowCount).toBe(0);
 for(const query of [{accountId:f.accountId},{category:'games'},{limit:'01'},{limit:101},{status:'all'}]) expect((await get(f,path,query)).status).toBe(422);
 expect((await get(f,'/categories/places/top-picks')).status).toBe(422);
 await pool.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1",[f.accountId]);expect((await get(f,path)).status).toBe(403);
});
it.each(['complete','recommendations','validate'])('executes the real joint client against guarded owner HTTP: %s',async(race)=>{
  const f=await fixture(),storage=new Map<string,string>();
  if(race==='complete') {
    await pool.query("INSERT INTO account_category_pin_state(account_id,category) VALUES($1,'books')",[f.accountId]);
    await pool.query("INSERT INTO category_recommendation_pins(account_id,category,recommendation_id,collection_id,position) VALUES($1,'books',$2,$4,0),($1,'books',$3,$4,0)",[f.accountId,f.recommendations[51],f.recommendations[52],f.ids[26]]);
  }
  vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
  const {default:store}=await import('../../../explorers-earth/src/store/store');
  const {explorersApiClient,assertCompleteMyCategoryContent,copyMyCategoryContentForStaging}=await import('../../../explorers-earth/src/lib/explorersApiClient');
  store.setState({accountId:f.accountId,generation:101,isAuthenticated:true});let changed=false,validated=false;
  vi.stubGlobal('fetch',async(url:string,options:RequestInit)=>{
    expect(options.credentials).toBe('include');expect(options.cache).toBe('no-store');
    if(!changed&&race!=='complete'&&new URL(url,'http://fixture').pathname.endsWith(`/${race}`)) {
      await pool.query('UPDATE collections SET title=$2 WHERE id=$1',[f.ids[0],'Committed between reads']);changed=true;
    }
    if(url.includes('/validate?')) validated=true;
    const result=await request(composed.app).get(url).set('cookie',f.cookie);
    return new Response(JSON.stringify(result.body),{status:result.status,headers:{'Content-Type':'application/json'}});
  });
  try {
    const result=explorersApiClient.getCompleteMyCategoryContent({category:'books'});
    if(race==='complete') {const content=await result;assertCompleteMyCategoryContent(content);expect(content.collections).toHaveLength(27);expect(content.recommendations).toHaveLength(53);expect(content.memberships).toHaveLength(53);expect(validated).toBe(true);
      const pins=content.recommendations.filter(x=>x.pin);expect(pins.map(x=>x.id).sort()).toEqual(f.recommendations.slice(51).sort());expect(pins.map(x=>x.pin?.position)).toEqual([0,0]);expect(pins.every(x=>Object.isFrozen(x.pin))).toBe(true);
      const draft=copyMyCategoryContentForStaging(content);expect(draft.recommendations.filter(x=>x.pin).map(x=>x.pin?.position)).toEqual([0,0]);draft.recommendations.find(x=>x.pin)!.pin!.position=7;expect(pins.map(x=>x.pin?.position)).toEqual([0,0]);
      expect((await pool.query('SELECT position FROM category_recommendation_pins WHERE account_id=$1 ORDER BY position,recommendation_id',[f.accountId])).rows.map(x=>x.position)).toEqual([0,0]);
    }
    else {await expect(result).rejects.toMatchObject({status:409,code:'CONFLICT'});expect(changed).toBe(true);expect(validated).toBe(race==='validate');}
  } finally {store.setState({accountId:null,isAuthenticated:false,generation:102});vi.unstubAllGlobals();}
});
const actorFor=(f:{userId:string;accountId:string;sessionId:string}):Actor=>({userId:f.userId,accountId:f.accountId,role:'owner',credential:{kind:'web-session',sessionId:f.sessionId,sessionVersion:1}});
function observedPool(observe:(sql:string,values:any[],result:pg.QueryResult)=>Promise<void>|void):pg.Pool {
  return {query:pool.query.bind(pool),connect:async()=>{
    const db=await pool.connect();return {release:()=>db.release(),query:async(sql:string,values:any[]=[])=>{
      const result=await db.query(sql,values);await observe(sql,values,result);return result;
    }};
  }} as unknown as pg.Pool;
}
it('keeps revision and payload in one repeatable read and final validation catches a committed race',async()=>{
  const f=await fixture(1,0);let changed=false;
  const service=new OwnerContentService(observedPool(async sql=>{
    if(!changed&&sql.includes('FROM account_category_content_state')) {changed=true;await pool.query('UPDATE collections SET title=$2 WHERE id=$1',[f.ids[0],'Concurrent committed title']);}
  }),config.secret);
  const page=await service.listCollections(actorFor(f),{category:'books'});expect(changed).toBe(true);expect(page.items[0].title).toBe('List 0');
  await expect(service.validateSnapshot(actorFor(f),{category:'books',snapshotToken:page.snapshotToken})).rejects.toMatchObject({status:409});
});
it('fresh post-COMMIT authorization denies a session expired while the page was read',async()=>{
  const f=await fixture(1,0);let revoked=false;
  const service=new OwnerContentService(observedPool(async sql=>{
    if(sql==='COMMIT') {revoked=true;await pool.query("UPDATE auth_session SET expires_at=now()-interval '1 second' WHERE id=$1",[f.sessionId]);}
  }),config.secret);
  await expect(service.listCollections(actorFor(f),{category:'books'})).rejects.toMatchObject({status:401});expect(revoked).toBe(true);
});
it('bounds every emitted database rowset and excludes rich JSON and nested membership queries',async()=>{
  const f=await fixture(4,4),queries:{sql:string;values:any[];rows:number}[]=[];
  const service=new OwnerContentService(observedPool((sql,values,result)=>{queries.push({sql,values,rows:result.rows.length});}),config.secret);
  await service.listCollections(actorFor(f),{category:'books',limit:2});await service.listRecommendations(actorFor(f),{category:'books',limit:2});await service.listMemberships(actorFor(f),{category:'books',limit:2});
  for(const q of queries) {expect(q.sql).not.toMatch(/SELECT\s+(?:[a-z]+\.)?\*/i);expect(q.sql).not.toMatch(/description_rich|\br\.note\b|jsonb_agg|sha256/);}
  const locators=queries.filter(q=>q.sql.includes('LIMIT $'));expect(locators).toHaveLength(3);
  for(const q of locators) {expect(q.values.at(-1)).toBe(3);expect(q.rows).toBeLessThanOrEqual(3);}
  expect(queries.filter(q=>q.sql.includes('LIMIT 21'))).toHaveLength(1);
  expect(queries.filter(q=>q.sql.includes('FROM collection_items i'))).toHaveLength(1);
  const text=queries.find(q=>q.sql.includes('c.description,c.heading'));expect(text?.values[1]).toHaveLength(2);expect(text?.rows).toBe(2);
});
it('shares one opaque revision snapshot across all three streams and validates completion',async()=>{
  const f=await fixture(3,3),s=await get(f,'/categories/books/content-snapshot');expect(s.status).toBe(200);
  expect(s.body.version).toBe('explorers-owner-content/v2');
  for(const path of ['/collections','/recommendations','/categories/books/memberships']) {
    const p=await get(f,path,{...(path.includes('categories')?{}:{category:'books'}),snapshotToken:s.body.snapshotToken,limit:2});
    expect(p.status).toBe(200);expect(p.body.snapshotToken).toBe(s.body.snapshotToken);expect(p.body.snapshot).toBe(s.body.revision);
  }
  expect((await get(f,'/categories/books/content-snapshot/validate',{snapshotToken:s.body.snapshotToken})).status).toBe(200);
  await pool.query('UPDATE collections SET title=$2 WHERE id=$1',[f.ids[0],'Snapshot invalidation']);
  for(const path of ['/collections','/recommendations','/categories/books/memberships','/categories/books/content-snapshot/validate'])
    expect((await get(f,path,{...(path==='/collections'||path==='/recommendations'?{category:'books'}:{}),snapshotToken:s.body.snapshotToken})).status).toBe(409);
});
it('reads untouched revision zero without creating state and invalidates on the first write',async()=>{
  const f=await fixture(0,0),before=(await pool.query('SELECT count(*)::int n FROM account_category_content_state WHERE account_id=$1',[f.accountId])).rows[0].n;
  const s=await get(f,'/categories/books/content-snapshot');expect(s.status).toBe(200);expect(s.body.revision).toBe('0');
  const p=await get(f,'/collections',{category:'books',snapshotToken:s.body.snapshotToken});expect(p.status).toBe(200);expect(p.body.items).toEqual([]);expect(p.body.nextCursor).toBeNull();
  expect((await pool.query('SELECT count(*)::int n FROM account_category_content_state WHERE account_id=$1',[f.accountId])).rows[0].n).toBe(before);
  await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'books','First write','first',0)",[f.accountId]);
  expect((await get(f,'/categories/books/content-snapshot/validate',{snapshotToken:s.body.snapshotToken})).status).toBe(409);
});
it('denies foreign, tampered, expired and cross-operation shared tokens and membership cursors',async()=>{
  const a=await fixture(3,3),b=await fixture(1,1),s=await get(a,'/categories/books/content-snapshot'),token=s.body.snapshotToken;
  for(const [owner,path,query] of [
    [b,'/categories/books/memberships',{snapshotToken:token}],
    [a,'/categories/movies/memberships',{snapshotToken:token}],
    [a,'/categories/books/content-snapshot/validate',{snapshotToken:token+'a'}],
    [a,'/categories/books/memberships',{accountId:b.accountId}],
    [a,'/categories/books/memberships',{recommendationId:b.recommendations[0]}],
  ] as const) expect((await get(owner,path,query)).status).toBe(path.includes('memberships')&&'recommendationId' in query?404:422);
  const p=await get(a,'/categories/books/memberships',{limit:1,snapshotToken:token});expect(p.status).toBe(200);
  for(const q of [{collectionStatus:'all'},{recommendationStatus:'all'},{recommendationId:a.recommendations[0]},{limit:2}]) expect((await get(a,'/categories/books/memberships',{limit:1,cursor:p.body.nextCursor,...q})).status).toBe(422);
  expect((await get(a,'/collections',{category:'books',limit:1,cursor:p.body.nextCursor})).status).toBe(422);
  expect((await get(a,'/categories/books/content-snapshot/validate',{snapshotToken:p.body.nextCursor})).status).toBe(422);
  const now=Date.now(),spy=vi.spyOn(Date,'now').mockReturnValue(now+600001);
  try {expect((await get(a,'/categories/books/memberships',{snapshotToken:token})).status).toBe(422);expect((await get(a,'/categories/books/content-snapshot/validate',{snapshotToken:token})).status).toBe(422);} finally {spy.mockRestore();}
  await pool.query('UPDATE user_security_state SET session_version=session_version+1 WHERE user_id=$1',[a.userId]);
  expect((await get(a,'/categories/books/content-snapshot/validate',{snapshotToken:token})).status).toBe(401);
});
it('joins explicit archive filters consistently across complete membership pages',async()=>{
  const f=await fixture(2,2);await pool.query('UPDATE collections SET archived_at=now() WHERE id=$1',[f.ids[1]]);
  await pool.query('UPDATE recommendations SET archived_at=now() WHERE id=$1',[f.recommendations[1]]);
  const active=await get(f,'/categories/books/memberships');expect(active.body.items).toEqual([]);
  const all=await get(f,'/categories/books/memberships',{collectionStatus:'all',recommendationStatus:'all'});expect(all.body.items).toHaveLength(2);
  const archived=await get(f,'/categories/books/memberships',{collectionStatus:'archived',recommendationStatus:'archived'});expect(archived.body.items).toHaveLength(1);expect(archived.body.items[0]).toMatchObject({collectionArchived:true,recommendationArchived:true});
});
it('rejects overflowing stored media while bounded enrichment emits exactly twenty IDs',async()=>{
  const f=await fixture(1,1),assets=(await pool.query(`INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,ready_at,content_sha256) SELECT $1,'recommendation','ready','image/png',1,now(),decode(repeat('00',32),'hex') FROM generate_series(1,21) RETURNING id`,[f.accountId])).rows;
  await pool.query(`INSERT INTO recommendation_media(recommendation_id,account_id,media_id,display_order) SELECT $1,$2,id,(row_number() over(order by id)-1)::int FROM media_assets WHERE id=ANY($3::uuid[])`,[f.recommendations[0],f.accountId,assets.slice(0,20).map(x=>x.id)]);
  expect((await get(f,'/recommendations',{category:'books'})).body.items[0].mediaIds).toHaveLength(20);
  await pool.query('INSERT INTO recommendation_media(recommendation_id,account_id,media_id,display_order) VALUES($1,$2,$3,20)',[f.recommendations[0],f.accountId,assets[20].id]);
  for(const path of ['/recommendations',`/recommendations/${f.recommendations[0]}`]) {const p=await get(f,path,path==='/recommendations'?{category:'books'}:{});expect(p.status).toBe(413);expect(p.body.error.code).toBe('RESOURCE_TOO_LARGE');expect(p.body.items).toBeUndefined();}
});
it('fails closed on oversized legal stored text without trimming whitespace',async()=>{
  const f=await fixture(1,0);await pool.query('UPDATE collections SET description=$2 WHERE id=$1',[f.ids[0],' '.repeat(4*1024*1024)]);
  const p=await get(f,'/collections',{category:'books'});expect(p.status).toBe(413);expect(p.body.error.code).toBe('RESOURCE_TOO_LARGE');expect(p.body.items).toBeUndefined();expect(apiErrorSchema.safeParse(p.body).success).toBe(true);
});
it('accepts a legal item near the byte limit and splits escaped UTF8 items with correct continuation',async()=>{
  const f=await fixture(8,0),near=' '.repeat(4*1024*1024-2500);
  await pool.query('UPDATE collections SET description=$2,heading=$3 WHERE id=$1',[f.ids[0],near,'  heading  ']);
  const first=await get(f,'/collections',{category:'books',limit:8});expect(first.status).toBe(200);expect(first.body.items[0].description).toBe(near);expect(first.body.items[0].heading).toBe('  heading  ');
  const text='😀\t'.repeat(160000);await pool.query('UPDATE collections SET description=$2 WHERE account_id=$1',[f.accountId,text]);
  const seen:string[]=[];let cursor:string|null=null,pages=0;
  do {const p=await get(f,'/collections',{category:'books',limit:8,...(cursor?{cursor}:{})});expect(p.status).toBe(200);expect(Buffer.byteLength(p.text,'utf8')).toBeLessThanOrEqual(4*1024*1024);expect(p.body.items.length).toBeGreaterThan(0);seen.push(...p.body.items.map((x:any)=>x.id));cursor=p.body.nextCursor;pages++;} while(cursor);
  expect(seen).toEqual(f.ids);expect(pages).toBeGreaterThan(1);
});
it('preserves every membership above 1001 and fails page two after a revision change',async()=>{
  const f=await fixture(1,1);
  await pool.query(`INSERT INTO collections(account_id,category,title,slug,display_order) SELECT $1,'books','Large membership','large-'||n,n FROM generate_series(1,1001) n`,[f.accountId]);
  await pool.query(`INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) SELECT id,$2,$1,'books',0 FROM collections WHERE account_id=$1 AND slug LIKE 'large-%'`,[f.accountId,f.recommendations[0]]);
  const snapshot=await get(f,'/categories/books/content-snapshot'),query={snapshotToken:snapshot.body.snapshotToken,limit:100,collectionStatus:'all',recommendationStatus:'all'};
  let cursor:string|null=null;const seen:string[]=[];
  do {const p=await get(f,'/categories/books/memberships',{...query,...(cursor?{cursor}:{})});expect(p.status).toBe(200);expect(p.body.items.length).toBeLessThanOrEqual(100);seen.push(...p.body.items.map((x:any)=>x.collectionId));cursor=p.body.nextCursor;} while(cursor);
  expect(seen).toHaveLength(1002);expect(new Set(seen).size).toBe(1002);
  const first=await get(f,'/categories/books/memberships',query);await pool.query('DELETE FROM collection_items WHERE collection_id=$1',[f.ids[0]]);
  const second=await get(f,'/categories/books/memberships',{...query,cursor:first.body.nextCursor});expect(second.status).toBe(409);expect(second.body.items).toBeUndefined();
});
it('uses matching index seeks for actual 1k and 10k owner page queries',async()=>{
  const evidence:unknown[]=[];
  for(const count of [1000,10000]) {
    const f=await fixture(1,1);
    const fixtureDb=await pool.connect();try {
    await fixtureDb.query('BEGIN');
    // Existing deferred kind guard contains a CASE on TG_TABLE_NAME. Its cached
    // generic plan scans all accumulated recommendations for every inserted row.
    // Custom fixture-writer plans retain all guards and avoid that unrelated cost.
    await fixtureDb.query("SET LOCAL plan_cache_mode='force_custom_plan'");
    await fixtureDb.query(`INSERT INTO collections(account_id,category,title,slug,display_order) SELECT $1,'books','Plan fixture','plan-'||n,n FROM generate_series(1,$2::int) n`,[f.accountId,count]);
    await fixtureDb.query(`INSERT INTO recommendations(account_id,category,entity_id) SELECT $1,'books',entity_id FROM recommendations CROSS JOIN generate_series(1,$3::int) WHERE id=$2`,[f.accountId,f.recommendations[0],count]);
    await fixtureDb.query(`INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order)
      WITH parents AS (SELECT id,row_number() over(order by id) n FROM collections WHERE account_id=$1 AND slug LIKE 'plan-%'),
      children AS (SELECT id,row_number() over(order by id) n FROM recommendations WHERE account_id=$1 AND id<>$2)
      SELECT p.id,r.id,$1,'books',0 FROM parents p JOIN children r USING(n)`,[f.accountId,f.recommendations[0]]);
    await fixtureDb.query(`INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order)
      SELECT $2,id,$1,'books',row_number() over(order by id)::int FROM (SELECT id FROM recommendations WHERE account_id=$1 AND id<>$3 ORDER BY id LIMIT 1000) r`,[f.accountId,f.ids[0],f.recommendations[0]]);
    await fixtureDb.query('COMMIT');
    } finally {await fixtureDb.query('ROLLBACK');fixtureDb.release();}
    await pool.query('ANALYZE collections');await pool.query('ANALYZE recommendations');await pool.query('ANALYZE collection_items');
    const queries:{sql:string;values:any[]}[]=[],service=new OwnerContentService(observedPool((sql,values)=>{if(sql.includes('LIMIT $')) queries.push({sql,values});}),config.secret);
    await service.listCollections(actorFor(f),{category:'books',status:'all'});
    await service.listRecommendations(actorFor(f),{category:'books',status:'all'});
    await service.listMemberships(actorFor(f),{category:'books',collectionStatus:'all',recommendationStatus:'all'});
    await service.listRecommendations(actorFor(f),{category:'books',status:'all',collectionId:f.ids[0]});
    for(const [n,index] of ['collections_owner_order_idx','recommendations_owner_id_idx','collection_items_owner_page_idx','collection_items_owner_collection_order_idx'].entries()) {
      const {sql,values}=queries[n],plan=(await pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,values)).rows[0]['QUERY PLAN'];
      evidence.push({fixture:count,index,rows:plan[0].Plan['Actual Rows'],blocks:plan[0].Plan['Shared Hit Blocks'],executionMs:plan[0]['Execution Time'],sql,parameters:values,plan:plan[0].Plan});
      mkdirSync(resolve('.superpowers'),{recursive:true});writeFileSync(resolve('.superpowers/task3.1-owner-explain.json'),JSON.stringify(evidence,null,2));
      console.info(`Owner query plan: fixture=${count}, query=${index}`);
      if(index==='collection_items_owner_collection_order_idx'&&!JSON.stringify(plan).includes(index)) {
        assertSelectedCollectionPlan(plan[0].Plan,{accountId:f.accountId,category:'books',collectionId:f.ids[0]});
      } else if(index==='recommendations_owner_id_idx'&&!JSON.stringify(plan).includes(index)) {
        // A fixture owning nearly the entire table can prefer the narrower PK.
        // Accept only the observed bounded seek, never a full scan/sort fallback.
        expect(plan[0].Plan.Plans[0]['Index Name']).toBe('recommendations_pkey');
        expect(plan[0].Plan.Plans[0]['Rows Removed by Filter']).toBeLessThanOrEqual(25);
      } else expect(JSON.stringify(plan)).toContain(index);
      expect(plan[0].Plan['Actual Rows']).toBe(25);
    }
  }
  mkdirSync(resolve('.superpowers'),{recursive:true});writeFileSync(resolve('.superpowers/task3.1-owner-explain.json'),JSON.stringify(evidence,null,2));
},120000);
it('reads all 27 private lists and 53 ordered children with complete memberships beyond the first page',async()=>{
  const f=await fixture();let cursor:string|null=null;const lists:any[]=[];
  await pool.query("INSERT INTO account_category_pin_state(account_id,category) VALUES($1,'books') ON CONFLICT DO NOTHING",[f.accountId]);
  await pool.query("INSERT INTO category_recommendation_pins(account_id,category,recommendation_id,collection_id,position) VALUES($1,'books',$2,$3,0)",[f.accountId,f.recommendations[52],f.ids[26]]);
  do {const page=await get(f,'/collections',{category:'books',limit:24,...(cursor?{cursor}:{})});expect(page.status).toBe(200);expect(page.headers['cache-control']).toBe('no-store');lists.push(...page.body.items);cursor=page.body.nextCursor;} while(cursor);
  expect(lists.map(x=>x.id)).toEqual(f.ids);expect(lists[26]).toMatchObject({archived:false,displayOrder:26,visibility:'private'});
  cursor=null;const children:any[]=[];
  do {const page=await get(f,'/recommendations',{category:'books',collectionId:f.ids[26],limit:24,...(cursor?{cursor}:{})});expect(page.status).toBe(200);children.push(...page.body.items);cursor=page.body.nextCursor;} while(cursor);
  expect(children.map(x=>x.id)).toEqual(f.recommendations);
  expect(children[52].memberships).toBeUndefined();
  expect((await get(f,'/categories/books/memberships',{recommendationId:f.recommendations[52]})).body.items).toEqual([{recommendationId:f.recommendations[52],collectionId:f.ids[26],collectionRevision:1,displayOrder:52,collectionArchived:false,recommendationArchived:false}]);
  expect(children[52].pin).toEqual({collectionId:f.ids[26],position:0,revision:1});
  expect(JSON.stringify(children)).not.toContain('not-core');expect(JSON.stringify(children)).not.toContain('request_hash');
});
it('binds opaque cursors to owner, operation, category, archive status, collection, and limit',async()=>{
  const a=await fixture(3,3),b=await fixture(3,0),first=await get(a,'/collections',{category:'books',limit:2});expect(first.status).toBe(200);
  const cursor=first.body.nextCursor;expect(cursor).toEqual(expect.any(String));expect(cursor).not.toContain(a.accountId);
  for(const [owner,path,query] of [[b,'/collections',{category:'books',limit:2,cursor}],[a,'/recommendations',{category:'books',limit:2,cursor}],[a,'/collections',{category:'movies',limit:2,cursor}],[a,'/collections',{category:'books',status:'archived',limit:2,cursor}],[a,'/collections',{category:'books',limit:3,cursor}],[a,'/collections',{category:'books',limit:2,cursor:cursor+'a'}]] as const) expect((await get(owner,path,query)).status).toBe(422);
  const children=await get(a,'/recommendations',{category:'books',collectionId:a.ids[2],limit:2});expect(children.status).toBe(200);
  expect((await get(a,'/recommendations',{category:'books',collectionId:a.ids[1],limit:2,cursor:children.body.nextCursor})).status).toBe(422);
  for(const query of [{accountId:b.accountId},{userId:b.userId},{limit:101},{limit:'01'},{category:'music'},{order:'title'}]) expect((await get(a,'/collections',{category:'books',...query})).status).toBe(422);
});
it('foreign and missing details have indistinguishable responses and archived lists require explicit selection',async()=>{
  const a=await fixture(1,1),b=await fixture(1,1);
  for(const path of [`/collections/${b.ids[0]}`,`/recommendations/${b.recommendations[0]}`]) {const foreign=await get(a,path),missing=await get(a,path.replace(path.split('/').at(-1)!,randomUUID()));expect(foreign.status).toBe(404);expect(foreign.body.error.message).toBe(missing.body.error.message);}
  await pool.query('UPDATE collections SET archived_at=now(),revision=revision+1 WHERE id=$1',[a.ids[0]]);
  expect((await get(a,`/collections/${a.ids[0]}`)).status).toBe(404);
  expect((await get(a,`/collections/${a.ids[0]}`,{status:'archived'})).body.collection).toMatchObject({archived:true,revision:2});
  expect((await get(a,'/collections',{category:'books'})).body.items).toEqual([]);
  expect((await get(a,'/collections',{category:'books',status:'archived'})).body.items.map((x:any)=>x.id)).toEqual(a.ids);
  expect((await get(a,'/categories/books/memberships',{collectionStatus:'archived'})).body.items[0]).toMatchObject({collectionArchived:true,collectionRevision:2});
});
it('rejects continuation after membership or content revision changes with restart conflict',async()=>{
  const f=await fixture(3,3),query={category:'books',limit:2};
  const first=await get(f,'/collections',query);expect(first.status).toBe(200);
  await pool.query('UPDATE collections SET revision=revision+1,title=$2 WHERE id=$1',[f.ids[2],'Changed']);
  expect((await get(f,'/collections',{...query,cursor:first.body.nextCursor})).status).toBe(409);
  const childQuery={...query,collectionId:f.ids[2]},children=await get(f,'/recommendations',childQuery);expect(children.status).toBe(200);
  await pool.query('DELETE FROM collection_items WHERE recommendation_id=$1',[f.recommendations[2]]);
  expect((await get(f,'/recommendations',{...childQuery,cursor:children.body.nextCursor})).status).toBe(409);
});
it('rechecks session expiry, generation, membership and account lifecycle on every page',async()=>{
  const f=await fixture(3,0),query={category:'books',limit:2},first=await get(f,'/collections',query);expect(first.status).toBe(200);
  expect((await request(composed.app).get('/api/explorers/v1/collections').query(query)).status).toBe(401);
  expect((await get(f,'/collections',query).set('x-account-id',f.accountId)).status).toBe(401);
  await pool.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1",[f.accountId]);const failedSecond=await get(f,'/collections',{...query,cursor:first.body.nextCursor});expect(failedSecond.status).toBe(403);expect(failedSecond.body.items).toBeUndefined();
  await pool.query("UPDATE creator_accounts SET status='active',suspended_at=NULL WHERE id=$1",[f.accountId]);
  await pool.query("UPDATE auth_session SET expires_at=now()-interval '1 second' WHERE id=$1",[f.sessionId]);expect((await get(f,'/collections',{...query,cursor:first.body.nextCursor})).status).toBe(401);
  const g=await fixture(1,0);await pool.query('UPDATE user_security_state SET session_version=session_version+1 WHERE user_id=$1',[g.userId]);expect((await get(g,'/collections',query)).status).toBe(401);
  const h=await fixture(1,0);await pool.query('DELETE FROM initial_account_bindings WHERE user_id=$1',[h.userId]);await pool.query('DELETE FROM account_memberships WHERE account_id=$1 AND user_id=$2',[h.accountId,h.userId]);expect((await get(h,'/collections',query)).status).toBe(401);
});
it('enforces named read scopes and current non-initial membership through the shared application boundary',async()=>{
  const owner=await fixture(1,1),member=await fixture(1,0),service=new OwnerContentService(pool,config.secret);
  const actor:Actor={userId:member.userId,accountId:owner.accountId,role:'owner',credential:{kind:'oauth',grantId:'trusted-adapter-fixture',scopes:['collections:read']}};
  await expect(service.listCollections(actor,{category:'books'})).rejects.toMatchObject({status:404});
  await pool.query('INSERT INTO account_memberships(account_id,user_id) VALUES($1,$2)',[owner.accountId,member.userId]);
  expect((await service.listCollections(actor,{category:'books'})).items.map(x=>x.id)).toEqual(owner.ids);
  await expect(service.getSnapshot(actor,{category:'books'})).rejects.toMatchObject({status:403});
  await expect(service.listMemberships(actor,{category:'books'})).rejects.toMatchObject({status:403});
  await expect(service.listRecommendations(actor,{category:'books'})).rejects.toMatchObject({status:403});
  await expect(service.getRecommendation(actor,owner.recommendations[0])).rejects.toMatchObject({status:403});
  actor.credential={kind:'oauth',grantId:'trusted-adapter-fixture',scopes:['recommendations:read']};
  expect((await service.listRecommendations(actor,{category:'books'})).items.map(x=>x.id)).toEqual(owner.recommendations);
  await expect(service.getCollection(actor,owner.ids[0])).rejects.toMatchObject({status:403});
  await pool.query('DELETE FROM account_memberships WHERE account_id=$1 AND user_id=$2',[owner.accountId,member.userId]);
  await expect(service.listRecommendations(actor,{category:'books'})).rejects.toMatchObject({status:404});
});
it('requires a restart after cursor expiry and ties a complete membership write to its observed revision',async()=>{
  const f=await fixture(3,3),query={category:'books',limit:2},first=await get(f,'/collections',query);expect(first.status).toBe(200);
  const now=Date.now(),spy=vi.spyOn(Date,'now').mockReturnValue(now+600001);
  try {expect((await get(f,'/collections',{...query,cursor:first.body.nextCursor})).status).toBe(422);} finally {spy.mockRestore();}
  const detail=await get(f,`/collections/${f.ids[2]}`);expect(detail.status).toBe(200);
  await pool.query('UPDATE collections SET revision=revision+1 WHERE id=$1',[f.ids[2]]);
  const write=await request(composed.app).patch(`/api/explorers/v1/collections/${f.ids[2]}/order`).set('cookie',f.cookie).set('origin',config.baseURL).set('Idempotency-Key',randomUUID()).send({expectedRevision:detail.body.collection.revision,orderedRecommendationIds:f.recommendations});
  expect(write.status).toBe(409);
  expect((await pool.query('SELECT recommendation_id FROM collection_items WHERE collection_id=$1 ORDER BY display_order',[f.ids[2]])).rows.map(x=>x.recommendation_id)).toEqual(f.recommendations);
});
it('returns every owned membership and explicit recommendation archive state without public ancestor requirements',async()=>{
  const f=await fixture(2,1);
  await pool.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'books',7)",[f.ids[0],f.recommendations[0],f.accountId]);
  const detail=await get(f,`/recommendations/${f.recommendations[0]}`);expect(detail.status).toBe(200);
  expect(detail.body.recommendation.memberships).toBeUndefined();
  expect((await get(f,'/categories/books/memberships')).body.items.map((x:any)=>x.collectionId).sort()).toEqual([...f.ids].sort());
  await pool.query('DELETE FROM collection_items WHERE recommendation_id=$1',[f.recommendations[0]]);
  await pool.query('UPDATE recommendations SET archived_at=now(),revision=revision+1 WHERE id=$1',[f.recommendations[0]]);
  expect((await get(f,`/recommendations/${f.recommendations[0]}`)).status).toBe(404);
  expect((await get(f,`/recommendations/${f.recommendations[0]}`,{status:'archived'})).body.recommendation).toMatchObject({archived:true,revision:2,pin:null});
  expect((await get(f,'/recommendations',{category:'books'})).body.items).toEqual([]);
  expect((await get(f,'/recommendations',{category:'books',status:'archived'})).body.items.map((x:any)=>x.id)).toEqual(f.recommendations);
  expect((await get(f,'/recommendations',{category:'books',collectionId:randomUUID()})).status).toBe(404);
});
it('uses a stable ID tie-breaker for equal collection order and category-wide recommendation pages',async()=>{
  const f=await fixture(3,3);await pool.query('UPDATE collections SET display_order=0 WHERE account_id=$1',[f.accountId]);
  for(const [path,expected] of [['/collections',[...f.ids].sort()],['/recommendations',[...f.recommendations].sort()]] as const) {
    const seen:string[]=[];let cursor:string|null=null;
    do {const page=await get(f,path,{category:'books',limit:1,...(cursor?{cursor}:{})});expect(page.status).toBe(200);seen.push(...page.body.items.map((x:any)=>x.id));cursor=page.body.nextCursor;} while(cursor);
    expect(seen).toEqual(expected);
  }
});
it('executes the read service with the actual runtime role and leaves command receipts unchanged',async()=>{
  const f=await fixture(1,1),runtime=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:2,options:'-c role=music_runtime'});
  try {
    expect((await runtime.query('SELECT current_user')).rows[0].current_user).toBe('music_runtime');
    const service=new OwnerContentService(runtime,config.secret),actor:Actor={userId:f.userId,accountId:f.accountId,role:'owner',credential:{kind:'web-session',sessionId:f.sessionId,sessionVersion:1}};
    expect((await service.listCollections(actor,{category:'books'})).items.map(x=>x.id)).toEqual(f.ids);
    expect((await service.listRecommendations(actor,{category:'books'})).items.map(x=>x.id)).toEqual(f.recommendations);
    expect((await runtime.query('SELECT count(*)::int AS n FROM application_command_receipts WHERE account_id=$1',[f.accountId])).rows[0].n).toBe(0);
  } finally {await runtime.end();}
});
it('top-pick snapshots bind current actor, pin revision, expiry and read scopes',async()=>{
 const a=await fixture(1,1),b=await fixture(1,0),service=new OwnerContentService(pool,config.secret);
 const first=await service.listTopPicks(actorFor(a),{category:'books'});
 await expect(service.listTopPicks(actorFor(b),{category:'books',snapshotToken:first.snapshotToken})).rejects.toMatchObject({status:422});
 await expect(service.listTopPicks({...actorFor(a),credential:{kind:'oauth',scopes:['recommendations:read']}} as Actor,{category:'books'})).rejects.toMatchObject({status:403});
 vi.spyOn(Date,'now').mockReturnValue(first.expiresAt);try{await expect(service.listTopPicks(actorFor(a),{category:'books',snapshotToken:first.snapshotToken})).rejects.toMatchObject({status:422});}finally{vi.restoreAllMocks();}
 await pool.query("INSERT INTO account_category_pin_state(account_id,category,revision) VALUES($1,'books',1)",[a.accountId]);
 await expect(service.listTopPicks(actorFor(a),{category:'books',snapshotToken:first.snapshotToken})).rejects.toMatchObject({status:409});
 const current=await service.listTopPicks(actorFor(a),{category:'books'});
 await pool.query("UPDATE account_category_pin_state SET revision=2 WHERE account_id=$1 AND category='books'",[a.accountId]);
 await expect(service.listTopPicks(actorFor(a),{category:'books',snapshotToken:current.snapshotToken})).rejects.toMatchObject({status:409});
});
it('executes dedicated union GET and shared PATCH through the canonical app without granting reply completeness',async()=>{
 const f=await fixture(1,27),storage=new Map<string,string>();
 await pool.query("INSERT INTO account_category_pin_state(account_id,category) VALUES($1,'books')",[f.accountId]);
 for(const id of f.recommendations)await pool.query("INSERT INTO category_recommendation_pins(account_id,category,recommendation_id,collection_id,position) VALUES($1,'books',$2,$3,0)",[f.accountId,id,f.ids[0]]);
 vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});
 const {default:store}=await import('../../../explorers-earth/src/store/store');
 const {explorersApiClient,assertCompleteMyCategoryContent}=await import('../../../explorers-earth/src/lib/explorersApiClient');
 store.setState({accountId:f.accountId,generation:201,isAuthenticated:true});let loseReply=true;
 vi.stubGlobal('fetch',async(url:string,options:RequestInit)=>{
  if(options.method){const result=await request(composed.app)[options.method==='PUT'?'put':'patch'](url).set('cookie',f.cookie).set('origin',config.baseURL).set('Idempotency-Key',(options.headers as Record<string,string>)['Idempotency-Key']).send(JSON.parse(options.body as string));
   if(loseReply){loseReply=false;expect(result.status).toBe(200);throw new Error('reply lost after commit');}return new Response(JSON.stringify(result.body),{status:result.status});}
  const result=await request(composed.app).get(url).set('cookie',f.cookie);return new Response(JSON.stringify(result.body),{status:result.status});
 });
 try{
  const observation=await explorersApiClient.getCompleteMyCategoryTopPicks({category:'books'});expect(observation.topPicks).toHaveLength(27);assertCompleteMyCategoryContent(observation);
  const selected=[{recommendationId:f.recommendations[26],collectionId:f.ids[0]}],key=randomUUID();
  await expect(explorersApiClient.upsertMyCategoryTopPickOrder(observation,selected,key)).rejects.toMatchObject({status:503});assertCompleteMyCategoryContent(observation);
  await expect(explorersApiClient.upsertMyCategoryTopPickOrder(observation,[],key)).rejects.toMatchObject({status:409});expect(()=>assertCompleteMyCategoryContent(observation)).toThrow();
  const fresh=await explorersApiClient.getCompleteMyCategoryTopPicks({category:'books'}),result=await explorersApiClient.upsertMyCategoryTopPickOrder(fresh,selected,randomUUID());expect(result.pins).toHaveLength(1);expect(()=>assertCompleteMyCategoryContent(result as any)).toThrow();expect(()=>assertCompleteMyCategoryContent(fresh)).toThrow();
  expect((await pool.query('SELECT 1 FROM category_recommendation_pins WHERE account_id=$1',[f.accountId])).rowCount).toBe(27);
 }finally{store.setState({accountId:null,isAuthenticated:false,generation:202});vi.unstubAllGlobals();}
});
