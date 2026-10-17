import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createCanonicalApp } from '../auth/canonicalApp';
import { resolveExplorersAuthConfig } from '../auth/betterAuth';

const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51474',EXPLORERS_AUTH_SECRET:'integration-secret-'.repeat(4),GOOGLE_CLIENT_ID:'fixture-google-id',GOOGLE_CLIENT_SECRET:'fixture-google-secret'});
let pool:pg.Pool, composed:ReturnType<typeof createCanonicalApp>;
beforeAll(()=>{pool=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:4});composed=createCanonicalApp(pool,config);});
afterAll(async()=>{await pool.end();});
async function persona() {
  const userId=`recommendation-${randomUUID()}`;
  await pool.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Owner',$2)",[userId,`${userId}@example.invalid`]);
  await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())",[randomUUID(),`google-${userId}`,userId]);
  const context=await composed.auth.$context, session=await context.internalAdapter.createSession(userId,false);
  const cookie=`${context.authCookies.sessionToken.name}=${session.token}.${createHmac('sha256',config.secret).update(session.token).digest('base64')}`;
  const me=await request(composed.app).get('/api/explorers/v1/me').set('cookie',cookie); expect(me.status).toBe(200);
  return {userId,accountId:me.body.account.id as string,cookie,sessionId:session.id};
}
function command(owner:{cookie:string},method:'post'|'patch'|'delete',path:string,body:object,key:string=randomUUID()) {
  return request(composed.app)[method](`/api/explorers/v1${path}`).set('cookie',owner.cookie).set('origin',config.baseURL).set('Idempotency-Key',key).send(body);
}
async function list(owner:{cookie:string},category='books') {
  const result=await command(owner,'post','/collections',{category,title:'Reading',slug:`reading-${randomUUID()}`,visibility:'private',publicationState:'draft'});expect(result.status).toBe(201);return result.body.collection;
}
async function entity(kind='book') {return (await pool.query("INSERT INTO entities(kind,title,origin) VALUES($1,'Shared title','manual') RETURNING id",[kind])).rows[0].id;}
async function recommendation(owner:{cookie:string},collection:any,entityId:string,revision=1) {
  const result=await command(owner,'post','/recommendations',{category:collection.category,entityId,collectionId:collection.id,expectedCollectionRevision:revision,userRating:8,publicationState:'draft'});expect(result.status).toBe(201);return result.body.recommendation;
}
it.each([['books','book'],['movies','movie'],['games','game'],['apps','app'],['products','product'],['people','person']])('bootstraps distinct manual %s identities and replays normalized input',async(category,kind)=>{
 const required=category==='apps'?{appUrl:'https://example.com/app'}:category==='products'?{productUrl:'https://example.com/product'}:{};
 const a=await persona(),key=randomUUID(),input={kind:'manual',category,details:{title:'  😀 Canonical  ',...required}};
 const [one,two]=await Promise.all([command(a,'post','/entities/resolve',input,key),command(a,'post','/entities/resolve',input,key)]);
 expect(one.status).toBe(200);expect(two.body).toEqual(one.body);expect(one.body.entity).toMatchObject({kind,title:'😀 Canonical'});
 expect((await command(a,'post','/entities/resolve',{...input,details:{title:'😀 Canonical',...required}},key)).body).toEqual(one.body);
 expect((await command(a,'post','/entities/resolve',{...input,details:{title:'Changed',...required}},key)).status).toBe(409);
 const distinct=await command(a,'post','/entities/resolve',input);expect(distinct.body.entity.id).not.toBe(one.body.entity.id);
 const typedOperation=category==='movies'?'resolveMovieEntity':category==='apps'?'resolveAppEntity':category==='products'?'resolveProductEntity':category==='people'?'resolvePersonEntity':undefined;
 if(typedOperation) {
  expect((await pool.query("SELECT count(*)::int n FROM application_command_receipts WHERE account_id=$1 AND operation=$2 AND status='completed'",[a.accountId,typedOperation])).rows[0].n).toBe(2);
  expect((await pool.query("SELECT count(*)::int n FROM application_command_receipts WHERE account_id=$1 AND operation='resolveManualEntity'",[a.accountId])).rows[0].n).toBe(0);
 } else {
  expect((await pool.query("SELECT count(*)::int n FROM application_command_receipts WHERE account_id=$1 AND operation='resolveManualEntity'",[a.accountId])).rows[0].n).toBe(2);
 }
 await pool.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1",[a.accountId]);expect((await command(a,'post','/entities/resolve',input,key)).status).toBe(403);
});
it('keeps recommendation title overrides independent and observes omission/reset/clear/replay/rollback',async()=>{
 const a=await persona(),b=await persona(),la=await list(a),lb=await list(b),shared=await entity();
 const ra=await recommendation(a,la,shared),a2=await recommendation(a,la,shared,2),rb=await recommendation(b,lb,shared);
 const detail=async(owner:any,id:string)=>await request(composed.app).get(`/api/explorers/v1/recommendations/${id}/editable`).set('cookie',owner.cookie);
 const key=randomUUID(),body={expectedRevision:1,displayOverrides:{title:'  My title  '}};
 expect((await command(a,'patch',`/recommendations/${ra.id}`,body,key)).status).toBe(200);
 expect((await command(a,'patch',`/recommendations/${ra.id}`,body,key)).status).toBe(200);
 expect((await detail(a,ra.id)).body.recommendation).toMatchObject({displayOverrides:{title:'My title'},displayTitle:'My title',entity:{id:shared,title:'Shared title'}});
 expect((await detail(a,a2.id)).body.recommendation.displayTitle).toBe('Shared title');expect((await detail(b,rb.id)).body.recommendation.displayOverrides).toEqual({});
 expect((await command(a,'patch',`/recommendations/${ra.id}`,{expectedRevision:2,userRating:4})).status).toBe(200);
 expect((await detail(a,ra.id)).body.recommendation.displayTitle).toBe('My title');
 expect((await command(a,'patch',`/recommendations/${ra.id}`,{expectedRevision:3,displayOverrides:{title:null}})).status).toBe(200);
 expect((await detail(a,ra.id)).body.recommendation.displayTitle).toBeNull();
 expect((await command(a,'patch',`/recommendations/${ra.id}`,{expectedRevision:4,displayOverrides:{}})).status).toBe(200);
 expect((await detail(a,ra.id)).body.recommendation.displayTitle).toBe('Shared title');
 expect((await pool.query('SELECT title FROM entities WHERE id=$1',[shared])).rows[0].title).toBe('Shared title');
 expect((await command(b,'patch',`/recommendations/${ra.id}`,{expectedRevision:5,displayOverrides:{title:'Foreign'}})).status).toBe(404);
 const foreign=(await pool.query("INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,ready_at,content_sha256) VALUES($1,'recommendation','ready','image/png',1,now(),decode(repeat('00',32),'hex')) RETURNING id",[b.accountId])).rows[0].id;
 const categoryBefore=(await detail(a,ra.id)).body.recommendation.categoryRevision;
 const failedKey=randomUUID();expect((await command(a,'patch',`/recommendations/${ra.id}`,{expectedRevision:5,displayOverrides:{title:'Rollback'},mediaIds:[foreign]},failedKey)).status).toBe(422);
 expect((await detail(a,ra.id)).body.recommendation).toMatchObject({revision:5,displayOverrides:{},displayTitle:'Shared title'});
 expect((await detail(a,ra.id)).body.recommendation.categoryRevision).toBe(categoryBefore);
 const parentBefore=(await pool.query('SELECT revision::text FROM collections WHERE id=$1',[la.id])).rows[0].revision;
 const overridesBefore=(await pool.query('SELECT count(*)::int n FROM recommendation_display_overrides WHERE account_id=$1',[a.accountId])).rows[0].n;
 const receiptsBefore=(await pool.query("SELECT count(*)::int n FROM application_command_receipts WHERE account_id=$1 AND operation='createRecommendation'",[a.accountId])).rows[0].n;
 expect((await command(a,'post','/recommendations',{category:'books',entityId:shared,collectionId:la.id,expectedCollectionRevision:Number(parentBefore),displayOverrides:{title:'Rollback creation'},mediaIds:[foreign]})).status).toBe(422);
 expect((await pool.query('SELECT revision::text FROM collections WHERE id=$1',[la.id])).rows[0].revision).toBe(parentBefore);
 expect((await pool.query('SELECT count(*)::int n FROM recommendation_display_overrides WHERE account_id=$1',[a.accountId])).rows[0].n).toBe(overridesBefore);
 expect((await pool.query("SELECT count(*)::int n FROM application_command_receipts WHERE account_id=$1 AND operation='createRecommendation'",[a.accountId])).rows[0].n).toBe(receiptsBefore);
});
it('covers runtime companion constraints, statement revisions, moved scopes, rollback and cascade',async()=>{
 const a=await persona(),b=await persona(),la=await list(a),lb=await list(b),shared=await entity(),ra=await recommendation(a,la,shared),a2=await recommendation(a,la,shared,2),rb=await recommendation(b,lb,shared);
 const revision=async(account:string)=>BigInt((await pool.query("SELECT revision FROM account_category_content_state WHERE account_id=$1 AND category='books'",[account])).rows[0].revision);
 const db=await pool.connect();
 try{
  const startA=await revision(a.accountId),startB=await revision(b.accountId);
  await db.query('BEGIN');await db.query('SET LOCAL ROLE music_runtime');
  await db.query('INSERT INTO recommendation_display_overrides(recommendation_id,account_id,display_values) VALUES($1,$3,$4),($2,$3,$4)',[ra.id,a2.id,a.accountId,{title:null}]);await db.query('COMMIT');
  expect(await revision(a.accountId)).toBe(startA+1n);expect(await revision(b.accountId)).toBe(startB);
  await db.query('BEGIN');await db.query('SET LOCAL ROLE music_runtime');await db.query('UPDATE recommendation_display_overrides SET recommendation_id=$2,account_id=$3 WHERE recommendation_id=$1',[ra.id,rb.id,b.accountId]);await db.query('COMMIT');
  expect(await revision(a.accountId)).toBe(startA+2n);expect(await revision(b.accountId)).toBe(startB+1n);
  const before=await revision(a.accountId);await db.query('BEGIN');await db.query('SET LOCAL ROLE music_runtime');await db.query('DELETE FROM recommendation_display_overrides WHERE recommendation_id=$1',[a2.id]);await db.query('ROLLBACK');expect(await revision(a.accountId)).toBe(before);
  await db.query('BEGIN');await db.query('SET LOCAL ROLE music_runtime');await db.query('DELETE FROM recommendation_display_overrides WHERE recommendation_id=$1',[rb.id]);await db.query('COMMIT');expect(await revision(b.accountId)).toBe(startB+2n);
  for(const sql of ['UPDATE account_category_content_state SET revision=revision+1','DELETE FROM entities','INSERT INTO music_schema_migrations(id,checksum,schema_checksum) VALUES(\'forbidden\',\'x\',\'y\')','CREATE TABLE forbidden_runtime(id int)']){
   await db.query('BEGIN');await db.query('SET LOCAL ROLE music_runtime');await expect(db.query(sql)).rejects.toMatchObject({code:'42501'});await db.query('ROLLBACK');
  }
  for(const [account,schema,values] of [[b.accountId,1,{}],[a.accountId,2,{}],[a.accountId,1,[]]] as const)await expect(pool.query('INSERT INTO recommendation_display_overrides(recommendation_id,account_id,schema_version,display_values) VALUES($1,$2,$3,$4)',[ra.id,account,schema,JSON.stringify(values)])).rejects.toThrow();
  await pool.query('DELETE FROM collection_items WHERE recommendation_id=$1',[a2.id]);await pool.query('DELETE FROM recommendations WHERE id=$1',[a2.id]);expect((await pool.query('SELECT 1 FROM recommendation_display_overrides WHERE recommendation_id=$1',[a2.id])).rowCount).toBe(0);
  const unchanged=await revision(a.accountId);await pool.query('DELETE FROM recommendation_display_overrides WHERE account_id=$1 AND false',[a.accountId]);expect(await revision(a.accountId)).toBe(unchanged);
 }finally{await db.query('ROLLBACK');db.release();}
});
it('rolls manual entity back when receipt insertion fails and survives an independent failed recommendation create',async()=>{
 const a=await persona(),la=await list(a),key=randomUUID(),input={kind:'manual',category:'books',details:{title:'😀'.repeat(500)}};
 const resolved=await command(a,'post','/entities/resolve',input,key);expect(resolved.status).toBe(200);
 const failed=await command(a,'post','/recommendations',{category:'books',entityId:resolved.body.entity.id,collectionId:la.id,expectedCollectionRevision:99,displayOverrides:{title:'Mine'}});expect(failed.status).toBe(409);
 expect((await command(a,'post','/entities/resolve',input,key)).body).toEqual(resolved.body);
 const before=(await pool.query('SELECT count(*)::int n FROM entities')).rows[0].n;
 // A transactional failing receipt trigger exercises failure after catalog insertion.
 await pool.query(`CREATE FUNCTION test_manual_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.account_id='${a.accountId}' AND NEW.operation='resolveManualEntity' THEN RAISE EXCEPTION 'injected receipt failure'; END IF; RETURN NEW; END $$`);
 await pool.query('CREATE TRIGGER test_manual_receipt_failure BEFORE INSERT ON application_command_receipts FOR EACH ROW EXECUTE FUNCTION test_manual_receipt_failure()');
 try{expect((await command(a,'post','/entities/resolve',{...input,details:{title:'Must roll back'}})).status).toBe(503);expect((await pool.query('SELECT count(*)::int n FROM entities')).rows[0].n).toBe(before);}finally{await pool.query('DROP TRIGGER test_manual_receipt_failure ON application_command_receipts');await pool.query('DROP FUNCTION test_manual_receipt_failure()');}
});
it('rejects unsafe manual/override fields, requires keys, and retires manual replay using database time',async()=>{
 const a=await persona(),la=await list(a),base={kind:'manual',category:'books',details:{title:'Valid'}};
 for(const details of [{title:null},{title:' '},{title:'😀'.repeat(501)},{title:'A\nB'},{title:'A\tB'},{title:'A\ud800B'},{title:'A',provider:'google_books'},{title:'A',facts:{}}])expect((await command(a,'post','/entities/resolve',{...base,details})).status).toBe(422);
 expect((await request(composed.app).post('/api/explorers/v1/entities/resolve').set('cookie',a.cookie).set('origin',config.baseURL).send(base)).status).toBe(422);
 const key=randomUUID(),resolved=await command(a,'post','/entities/resolve',base,key);expect(resolved.status).toBe(200);
 expect((await command(a,'post','/entities/resolve',{entityId:resolved.body.entity.id,category:'books'})).status).toBe(404);
 await pool.query("UPDATE application_command_receipts SET replay_until=clock_timestamp()-interval '1 second' WHERE account_id=$1 AND operation='resolveManualEntity'",[a.accountId]);expect((await command(a,'post','/entities/resolve',base,key)).status).toBe(409);
 const r=await recommendation(a,la,resolved.body.entity.id);
 for(const displayOverrides of [null,{title:null,accountId:a.accountId},{title:'A\u007fB'},{title:''}])expect((await command(a,'patch',`/recommendations/${r.id}`,{expectedRevision:1,displayOverrides})).status).toBe(422);
 expect((await command(a,'patch',`/recommendations/${r.id}`,{expectedRevision:1,displayOverrides:{title:'😀'.repeat(500)}})).status).toBe(200);
 const detail=await request(composed.app).get(`/api/explorers/v1/recommendations/${r.id}/editable`).set('cookie',a.cookie);expect(detail.status).toBe(200);expect(Array.from(detail.body.recommendation.displayTitle)).toHaveLength(500);
 const archiveKey=randomUUID();expect((await command(a,'delete',`/recommendations/${r.id}`,{expectedRevision:2},archiveKey)).status).toBe(200);expect((await command(a,'delete',`/recommendations/${r.id}`,{expectedRevision:2},archiveKey)).status).toBe(200);
 expect((await command(a,'patch',`/recommendations/${r.id}`,{expectedRevision:2,displayOverrides:{title:'Archived'}})).status).toBe(404);
});
