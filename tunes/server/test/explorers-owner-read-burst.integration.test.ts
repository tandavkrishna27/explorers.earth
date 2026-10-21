import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { createCanonicalApp } from '../auth/canonicalApp';
import { resolveExplorersAuthConfig } from '../auth/betterAuth';
import { insertProductDetails } from '../repositories/productCatalogRepository';
import { productEntityDetailsSchema } from '../../shared/explorersProductContract';
// PROD-06. After a Top Pick pin the SPA re-reads every item of the list at once. Production
// runs one pool of 10 connections, so the burst below is sized well past that.
const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51474',EXPLORERS_AUTH_SECRET:'owner-burst-secret-'.repeat(4),GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture'});
let pool:pg.Pool, composed:ReturnType<typeof createCanonicalApp>;
beforeAll(()=>{pool=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:10});composed=createCanonicalApp(pool,config);});
afterAll(async()=>{await pool.end();});
async function fixture(children:number) {
  const userId=`owner-burst-${randomUUID()}`;
  await pool.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Owner',$2)",[userId,`${userId}@example.invalid`]);
  await pool.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())",[randomUUID(),userId,userId]);
  const context=await composed.auth.$context,session=await context.internalAdapter.createSession(userId,false);
  const cookie=`${context.authCookies.sessionToken.name}=${session.token}.${createHmac('sha256',config.secret).update(session.token).digest('base64')}`;
  const me=await request(composed.app).get('/api/explorers/v1/me').set('cookie',cookie);expect(me.status).toBe(200);
  const accountId=me.body.account.id,recommendations:string[]=[];
  const list=(await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'products','Burst','burst',0) RETURNING id",[accountId])).rows[0].id;
  for(let n=0;n<children;n++) {
    const entity=(await pool.query("INSERT INTO entities(kind,title,origin) VALUES('product',$1,'manual') RETURNING id",[`Product ${n}`])).rows[0].id;
    const c=await pool.connect();try{await insertProductDetails(c,entity,productEntityDetailsSchema.parse({productUrl:`https://example.com/p${n}`,brand:'Acme',logoUrl:null,description:'Notes',specifications:{},imageUrls:[]}));}finally{c.release();}
    const id=(await pool.query("INSERT INTO recommendations(account_id,category,entity_id) VALUES($1,'products',$2) RETURNING id",[accountId,entity])).rows[0].id;
    await pool.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'products',$4)",[list,id,accountId,n]);recommendations.push(id);
  }
  return {cookie,list,recommendations,sessionId:session.id};
}
it.each(['fresh','due-for-refresh'])('answers a burst of 30 parallel owner reads after a write with 2xx only (%s session)',async(age)=>{
  const f=await fixture(16),errors=vi.spyOn(console,'error');
  // A session older than Better Auth's one-day updateAge is refreshed by every read.
  if(age!=='fresh')await pool.query("UPDATE auth_session SET expires_at=now()+interval '5 days',updated_at=now()-interval '2 days' WHERE id=$1",[f.sessionId]);
  const snap=await request(composed.app).get('/api/explorers/v1/categories/products/content-snapshot').set('cookie',f.cookie);
  const write=await request(composed.app).put('/api/explorers/v1/categories/products/top-picks').set('cookie',f.cookie).set('origin',config.baseURL).set('Idempotency-Key',randomUUID()).send({expectedCategoryRevision:snap.body.revision,expectedPinRevision:null,orderedPins:[{collectionId:f.list,recommendationId:f.recommendations[0]}]});
  expect(write.status,JSON.stringify(write.body)).toBe(200);
  const paths=[...f.recommendations.map(id=>`/recommendations/${id}/editable`),...f.recommendations.slice(0,8).map(()=>'/categories/products/content-snapshot'),
    '/categories/products/memberships','/categories/products/memberships',`/collections/${f.list}/editable`,'/categories/products/top-picks','/categories/products/content-snapshot','/categories/products/content-snapshot'];
  expect(paths).toHaveLength(30);
  const responses=await Promise.all(paths.map(path=>request(composed.app).get(`/api/explorers/v1${path}`).set('cookie',f.cookie)));
  const failed=responses.map((r,i)=>({path:paths[i],status:r.status,body:r.body})).filter(r=>r.status>=500);
  expect(failed,JSON.stringify({failed:failed.slice(0,3),errors:errors.mock.calls.slice(0,3).map(c=>c.map(String))})).toEqual([]);
  errors.mockRestore();
});
it('answers an exhausted pool with a retryable status and logs the cause without the session token',async()=>{
  const f=await fixture(1),token=decodeURIComponent(f.cookie.split('=')[1]).split('.')[0];
  const tight=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:1,connectionTimeoutMillis:50}),app=createCanonicalApp(tight,config).app;
  const held=await tight.connect(),errors=vi.spyOn(console,'error').mockImplementation(()=>{});
  try{
    const response=await request(app).get(`/api/explorers/v1/recommendations/${f.recommendations[0]}/editable`).set('cookie',f.cookie);
    // The session lookup is the first read to wait for the pool; Better Auth reports it
    // without a SQLSTATE, so this is the transient 503 rather than the 429 of a pg timeout.
    expect(response.status).toBe(503);expect(response.headers['retry-after']).toBe('1');
    expect(response.body.error).toMatchObject({code:'UNAVAILABLE',retryable:true});
    const lines=errors.mock.calls.map(c=>c.map(String).join(' '));
    expect(JSON.parse(lines.find(l=>l.includes('"api_5xx"'))!)).toMatchObject({requestId:response.body.error.requestId,status:503,kind:'connection',route:'/api/explorers/v1/recommendations/:id/editable'});
    expect(lines.join(' ')).not.toContain(token);
  }finally{held.release();errors.mockRestore();await tight.end();}
});
it('summarises lists and items per category for Home in one read (HUB-X02)',async()=>{
  const f=await fixture(3);
  expect((await request(composed.app).get('/api/explorers/v1/content-summary')).status).toBe(401);
  const read=async()=>{const r=await request(composed.app).get('/api/explorers/v1/content-summary').set('cookie',f.cookie);expect(r.status).toBe(200);return r.body.summary.categories;};
  await pool.query("UPDATE collections SET visibility='private' WHERE id=$1",[f.list]);
  expect(await read()).toEqual([{category:'products',lists:1,activeLists:0,items:3,activeItems:0}]);
  await pool.query("UPDATE collections SET visibility='public',publication_state='published' WHERE id=$1",[f.list]);
  await pool.query('UPDATE recommendations SET archived_at=now() WHERE id=$1',[f.recommendations[0]]);
  expect(await read()).toEqual([{category:'products',lists:1,activeLists:1,items:2,activeItems:2}]);
  expect((await request(composed.app).get('/api/explorers/v1/content-summary?x=1').set('cookie',f.cookie)).status).toBe(422);
});
