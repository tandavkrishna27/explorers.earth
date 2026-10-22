import {createHmac,randomUUID} from 'node:crypto';
import pg from 'pg';import request from 'supertest';import {afterAll,beforeAll,expect,it} from 'vitest';
import {createCanonicalApp} from '../../auth/canonicalApp';import {resolveExplorersAuthConfig} from '../../auth/betterAuth';

/**
 * OWN-01 (0065) and LP-09 (0066) through the real HTTP surface on PostgreSQL: an archived
 * list frees its slug, a live duplicate is still 409, a restore onto a reused slug is a
 * conflict, a renamed list's old slug keeps resolving and cannot be taken by a new list.
 */
const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51644',EXPLORERS_AUTH_SECRET:'collection-slug-integration-'.repeat(4),GOOGLE_CLIENT_ID:'fixture-only',GOOGLE_CLIENT_SECRET:'fixture-only'});
let admin:pg.Pool,app:ReturnType<typeof createCanonicalApp>;
beforeAll(()=>{admin=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:4});app=createCanonicalApp(admin,config);});
afterAll(async()=>{await admin?.end();});
async function persona(){const userId='collection-slug-'+randomUUID();await admin.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Games owner',$2)",[userId,userId+'@example.invalid']);await admin.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())",[randomUUID(),'google-'+userId,userId]);const context=await app.auth.$context,session=await context.internalAdapter.createSession(userId,false);const cookie=`${context.authCookies.sessionToken.name}=${session.token}.${createHmac('sha256',config.secret).update(session.token).digest('base64')}`;const me=await request(app.app).get('/api/explorers/v1/me').set('cookie',cookie);expect(me.status).toBe(200);return {userId,accountId:me.body.account.id as string,cookie};}
function command(owner:{cookie:string},method:'post'|'patch'|'delete',path:string,body:object,key=randomUUID()){return request(app.app)[method]('/api/explorers/v1'+path).set('cookie',owner.cookie).set('origin',config.baseURL).set('Idempotency-Key',key).send(body);}

async function create(a:{cookie:string},category:string,slug:string,extra:object={}){return command(a,'post','/collections',{category,title:slug,slug,visibility:'private',publicationState:'draft',...extra});}
async function archive(a:{cookie:string},c:{id:string;revision:number}){const reply=await command(a,'delete',`/collections/${c.id}`,{expectedRevision:c.revision});expect(reply.status,JSON.stringify(reply.body)).toBe(200);}
async function rename(a:{cookie:string},c:{id:string;revision:number},slug:string){return command(a,'patch',`/collections/${c.id}`,{expectedRevision:c.revision,slug});}
async function publish(a:{accountId:string},category:string,id:string){const handle='slug'+randomUUID().replaceAll('-','').slice(0,16);
 await admin.query("UPDATE creator_accounts SET handle=$2,display_name='Slug owner',account_type='Creator',onboarding_status='complete',public_profile=true WHERE id=$1",[a.accountId,handle]);
 await admin.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category=$2",[a.accountId,category]);
 await admin.query("UPDATE collections SET visibility='public',publication_state='published' WHERE id=$1",[id]);return handle;}

it('an archived list frees its slug for a new list (OWN-01)',async()=>{
 const a=await persona(),first=await create(a,'books','paris');expect(first.status).toBe(201);
 await archive(a,first.body.collection);
 const second=await create(a,'books','paris');expect(second.status,JSON.stringify(second.body)).toBe(201);
 expect(second.body.collection.id).not.toBe(first.body.collection.id);
});

it('a live duplicate slug is still a conflict',async()=>{
 const a=await persona();expect((await create(a,'books','rome')).status).toBe(201);
 expect((await create(a,'books','rome')).status).toBe(409);
 expect((await create(a,'movies','rome')).status).toBe(201); // other category, same slug
});

it('restoring an archived list onto a reused slug is refused by the live index',async()=>{
 const a=await persona(),first=await create(a,'books','oslo');await archive(a,first.body.collection);
 expect((await create(a,'books','oslo')).status).toBe(201);
 await expect(admin.query('UPDATE collections SET archived_at=NULL WHERE id=$1',[first.body.collection.id])).rejects.toMatchObject({code:'23505',constraint:'collections_live_slug_uq'});
});

it('renaming records the old slug, renaming back clears it, and a new list may not take it (LP-09)',async()=>{
 const a=await persona(),made=await create(a,'places','lisbon');expect(made.status,JSON.stringify(made.body)).toBe(201);
 const renamed=await rename(a,made.body.collection,'lisbon-2026');expect(renamed.status,JSON.stringify(renamed.body)).toBe(200);
 expect((await admin.query('SELECT collection_id FROM collection_slug_redirects WHERE account_id=$1 AND category=$2 AND old_slug=$3',[a.accountId,'places','lisbon'])).rows).toEqual([{collection_id:made.body.collection.id}]);
 expect((await create(a,'places','lisbon')).status).toBe(409);
 const back=await rename(a,renamed.body.collection,'lisbon');expect(back.status,JSON.stringify(back.body)).toBe(200);
 expect((await admin.query('SELECT old_slug FROM collection_slug_redirects WHERE collection_id=$1 ORDER BY old_slug',[made.body.collection.id])).rows).toEqual([{old_slug:'lisbon-2026'}]);
});

it('a redirect left by an archived list does not block the slug',async()=>{
 const a=await persona(),made=await create(a,'places','porto');const renamed=await rename(a,made.body.collection,'porto-old');
 await archive(a,renamed.body.collection);
 expect((await create(a,'places','porto')).status).toBe(201);
 expect((await admin.query("SELECT 1 FROM collection_slug_redirects WHERE account_id=$1 AND old_slug='porto'",[a.accountId])).rowCount).toBe(0);
});

it('public reads follow a renamed list\'s old slug (LP-09)',async()=>{
 const a=await persona(),made=await create(a,'places','kyoto');const renamed=await rename(a,made.body.collection,'kyoto-temples');
 const handle=await publish(a,'places',made.body.collection.id);
 const current=await request(app.app).get(`/api/explorers/v1/profiles/${handle}/recommendations/places/kyoto-temples`);
 const old=await request(app.app).get(`/api/explorers/v1/profiles/${handle}/recommendations/places/kyoto`);
 expect(current.status,JSON.stringify(current.body)).toBe(200);expect(old.status,JSON.stringify(old.body)).toBe(200);
 expect(old.body).toEqual(current.body);
 const contentCurrent=await request(app.app).get(`/api/explorers/v1/public/profiles/${handle}/collections/places/kyoto-temples/recommendations`);
 const contentOld=await request(app.app).get(`/api/explorers/v1/public/profiles/${handle}/collections/places/kyoto/recommendations`);
 expect(contentOld.status,JSON.stringify(contentOld.body)).toBe(contentCurrent.status);
 expect(contentOld.body).toEqual(contentCurrent.body);
 expect(renamed.status).toBe(200);
});

it('the duplicate pre-check in 0065 names live duplicates instead of guessing',async()=>{
 const sql=(await import('node:fs')).readFileSync(new URL('../../../migrations/0065_explorers_collection_live_slug.sql',import.meta.url),'utf8');
 const a=await persona();
 const db=await admin.connect();
 try{
  await db.query('BEGIN');
  await db.query('DROP INDEX collections_live_slug_uq'); // no slug uniqueness at all, so duplicates can exist
  const x=(await db.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'books','A','dup',0) RETURNING id",[a.accountId])).rows[0].id;
  const y=(await db.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'books','B','dup',1) RETURNING id",[a.accountId])).rows[0].id;
  await expect(db.query(sql)).rejects.toThrow(new RegExp(`OWN-01: live lists share a slug.*${[x,y].sort().join(',')}`));
 }finally{await db.query('ROLLBACK');db.release();}
});
