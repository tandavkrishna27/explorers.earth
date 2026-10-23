import {createHmac,randomUUID} from 'node:crypto';
import pg from 'pg';import request from 'supertest';import {afterAll,beforeAll,expect,it} from 'vitest';
import {createCanonicalApp} from '../../auth/canonicalApp';import {resolveExplorersAuthConfig} from '../../auth/betterAuth';

/**
 * WP3B (LP-08, LP-09) through the real HTTP surface on PostgreSQL: every category may rename
 * its list URL and the old one keeps resolving; an archived list restores under its slug
 * or, when that slug was reused, under a new one; Delete removes a list permanently.
 */
const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51645',EXPLORERS_AUTH_SECRET:'collection-manage-integration-'.repeat(4),GOOGLE_CLIENT_ID:'fixture-only',GOOGLE_CLIENT_SECRET:'fixture-only'});
let admin:pg.Pool,app:ReturnType<typeof createCanonicalApp>;
beforeAll(()=>{admin=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:4});app=createCanonicalApp(admin,config);});
afterAll(async()=>{await admin?.end();});
type Owner={userId:string;accountId:string;cookie:string};type List={id:string;revision:number;slug:string};
async function persona():Promise<Owner>{const userId='collection-manage-'+randomUUID();await admin.query("INSERT INTO auth_user(id,name,email) VALUES($1,'List owner',$2)",[userId,userId+'@example.invalid']);await admin.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())",[randomUUID(),'google-'+userId,userId]);const context=await app.auth.$context,session=await context.internalAdapter.createSession(userId,false);const cookie=`${context.authCookies.sessionToken.name}=${session.token}.${createHmac('sha256',config.secret).update(session.token).digest('base64')}`;const me=await request(app.app).get('/api/explorers/v1/me').set('cookie',cookie);expect(me.status).toBe(200);return {userId,accountId:me.body.account.id as string,cookie};}
function command(owner:{cookie:string},method:'post'|'patch'|'delete',path:string,body:object,key=randomUUID()){return request(app.app)[method]('/api/explorers/v1'+path).set('cookie',owner.cookie).set('origin',config.baseURL).set('Idempotency-Key',key).send(body);}
async function create(a:Owner,category:string,slug:string):Promise<List>{const reply=await command(a,'post','/collections',{category,title:slug,slug,visibility:'private',publicationState:'draft'});expect(reply.status,JSON.stringify(reply.body)).toBe(201);return reply.body.collection;}
async function archive(a:Owner,c:List):Promise<List>{const reply=await command(a,'delete',`/collections/${c.id}`,{expectedRevision:c.revision});expect(reply.status,JSON.stringify(reply.body)).toBe(200);return {...c,revision:c.revision+1};}
const rename=(a:Owner,c:List,slug:string)=>command(a,'patch',`/collections/${c.id}`,{expectedRevision:c.revision,slug});
const restore=(a:Owner,c:List,extra:object={})=>command(a,'post',`/collections/${c.id}/restore`,{expectedRevision:c.revision,...extra});
const purge=(a:Owner,c:List)=>command(a,'post',`/collections/${c.id}/purge`,{expectedRevision:c.revision});
async function publish(a:Owner,category:string,id:string){const handle='manage'+randomUUID().replaceAll('-','').slice(0,16);
 await admin.query("UPDATE creator_accounts SET handle=$2,display_name='List owner',account_type='Creator',onboarding_status='complete',public_profile=true WHERE id=$1",[a.accountId,handle]);
 await admin.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category=$2",[a.accountId,category]);
 await admin.query("UPDATE collections SET visibility='public',publication_state='published' WHERE id=$1",[id]);return handle;}
async function item(a:Owner,category:string,c:List){const entity=await command(a,'post','/entities/resolve',{kind:'manual',category,details:{title:'Item '+randomUUID().slice(0,8)}});expect(entity.status,JSON.stringify(entity.body)).toBe(200);
 const made=await command(a,'post','/recommendations',{category,entityId:entity.body.entity.id,collectionId:c.id,expectedCollectionRevision:c.revision,userRating:null,publicationState:'draft'});expect(made.status,JSON.stringify(made.body)).toBe(201);
 return {recommendation:made.body.recommendation as {id:string;revision:number},list:{...c,revision:c.revision+1}};}

it.each(['movies','books','games','apps','products','people'])('renames the slug of a %s list and the old URL resolves (LP-09)',async category=>{
 const a=await persona(),list=await create(a,category,'comfort-picks');
 const renamed=await rename(a,list,'cosy-picks');expect(renamed.status,JSON.stringify(renamed.body)).toBe(200);expect(renamed.body.collection.slug).toBe('cosy-picks');
 const handle=await publish(a,category,list.id);
 const current=await request(app.app).get(`/api/explorers/v1/profiles/${handle}/recommendations/${category}/cosy-picks`);
 const old=await request(app.app).get(`/api/explorers/v1/profiles/${handle}/recommendations/${category}/comfort-picks`);
 expect(current.status,JSON.stringify(current.body)).toBe(200);expect(old.status,JSON.stringify(old.body)).toBe(200);expect(old.body).toEqual(current.body);
 const contentCurrent=await request(app.app).get(`/api/explorers/v1/public/profiles/${handle}/collections/${category}/cosy-picks/recommendations`);
 const contentOld=await request(app.app).get(`/api/explorers/v1/public/profiles/${handle}/collections/${category}/comfort-picks/recommendations`);
 expect(contentCurrent.status,JSON.stringify(contentCurrent.body)).toBe(200);expect(contentOld.status).toBe(200);expect(contentOld.body).toEqual(contentCurrent.body);
});

it('refuses a slug that is a live redirect of another list',async()=>{
 const a=await persona(),alpha=await create(a,'movies','alpha');
 expect((await rename(a,alpha,'alpha-2')).status).toBe(200);
 const beta=await create(a,'movies','beta'),res=await rename(a,beta,'alpha');
 expect(res.status,JSON.stringify(res.body)).toBe(409);expect(res.body.error.code).toBe('CONFLICT');
});

it('rejects an invalid slug with 422',async()=>{
 const a=await persona(),gamma=await create(a,'books','gamma');
 const res=await rename(a,gamma,'Not A Slug!');expect(res.status).toBe(422);
});

it('restores an archived list with its slug (LP-08)',async()=>{
 const a=await persona(),made=await create(a,'games','couch-co-op'),archived=await archive(a,made);
 const restored=await restore(a,archived);expect(restored.status,JSON.stringify(restored.body)).toBe(200);
 expect(restored.body.collection).toMatchObject({id:made.id,slug:'couch-co-op',revision:archived.revision+1});
 expect((await admin.query('SELECT archived_at FROM collections WHERE id=$1',[made.id])).rows[0].archived_at).toBeNull();
});

it('restoring when the slug was reused is a conflict that changes nothing, and a new slug restores it',async()=>{
 const a=await persona(),made=await create(a,'games','paris'),archived=await archive(a,made);
 await create(a,'games','paris');
 const res=await restore(a,archived);
 expect(res.status,JSON.stringify(res.body)).toBe(409);expect(res.body.error.code).toBe('CONFLICT');expect(res.body.error.message).toBe('List URL is taken; choose a new URL to restore');
 expect((await admin.query('SELECT archived_at IS NOT NULL a,revision::int revision FROM collections WHERE id=$1',[made.id])).rows[0]).toEqual({a:true,revision:archived.revision});
 const ok=await restore(a,archived,{slug:'paris-2019'});expect(ok.status,JSON.stringify(ok.body)).toBe(200);expect(ok.body.collection.slug).toBe('paris-2019');
});

it('restoring onto a slug that is a live list\'s redirect is a conflict',async()=>{
 const a=await persona(),made=await create(a,'apps','tools'),archived=await archive(a,made);
 const other=await create(a,'apps','tools');expect((await rename(a,other,'tools-2')).status).toBe(200); // "tools" now redirects to the live list
 const res=await restore(a,archived);expect(res.status).toBe(409);expect(res.body.error.message).toBe('List URL is taken; choose a new URL to restore');
});

it('restore of a live list is 409 and an invalid slug is 422',async()=>{
 const a=await persona(),live=await create(a,'apps','live');
 const res=await restore(a,live);expect(res.status).toBe(409);expect(res.body.error.message).toBe('List is not archived');
 const archived=await archive(a,live);
 expect((await restore(a,archived,{slug:'Not A Slug!'})).status).toBe(422);
 expect((await restore(a,archived,{slug:'ok',extra:true})).status).toBe(422);
});

it('deletes a list permanently; its slug is free again',async()=>{
 const a=await persona(),made=await create(a,'products','desk-setup');
 const res=await purge(a,made);expect(res.status,JSON.stringify(res.body)).toBe(200);expect(res.body.collection).toEqual({id:made.id,deleted:true});
 expect((await admin.query('SELECT 1 FROM collections WHERE id=$1',[made.id])).rowCount).toBe(0);
 await create(a,'products','desk-setup');
 expect((await purge(a,made)).status).toBe(404);
});

it('deletes an archived list and a renamed list with its redirects',async()=>{
 const a=await persona(),made=await create(a,'movies','old-name'),renamed=(await rename(a,made,'new-name')).body.collection as List;
 const archived=await archive(a,renamed);
 expect((await purge(a,archived)).status).toBe(200);
 expect((await admin.query('SELECT 1 FROM collection_slug_redirects WHERE collection_id=$1',[made.id])).rowCount).toBe(0);
});

it('a stale revision is refused and deletes nothing',async()=>{
 const a=await persona(),made=await create(a,'people','stale');
 expect((await purge(a,{...made,revision:made.revision+5})).status).toBe(409);
 expect((await admin.query('SELECT 1 FROM collections WHERE id=$1',[made.id])).rowCount).toBe(1);
});

it('items only in the deleted list are archived; shared items stay',async()=>{
 const a=await persona();let first=await create(a,'games','first');const second=await create(a,'games','second');
 const only=await item(a,'games',first);first=only.list;const shared=await item(a,'games',first);first=shared.list;
 const attached=await command(a,'post',`/collections/${second.id}/memberships/${shared.recommendation.id}`,{expectedCollectionRevision:second.revision,expectedRecommendationRevision:shared.recommendation.revision});
 expect(attached.status,JSON.stringify(attached.body)).toBe(200);
 expect((await purge(a,first)).status).toBe(200);
 expect((await admin.query('SELECT archived_at IS NOT NULL a FROM recommendations WHERE id=$1',[only.recommendation.id])).rows[0].a).toBe(true);
 expect((await admin.query('SELECT archived_at IS NULL a FROM recommendations WHERE id=$1',[shared.recommendation.id])).rows[0].a).toBe(true);
 expect((await admin.query('SELECT collection_id FROM collection_items WHERE recommendation_id=$1',[shared.recommendation.id])).rows).toEqual([{collection_id:second.id}]);
});

it('a list with visit history is deleted too; the event stays, unlinked',async()=>{
 const a=await persona(),made=await create(a,'people','creators');
 const event=(await admin.query(`INSERT INTO analytics_events(account_id,client_event_id,event_type,page,category,collection_id,occurred_at,canonical_path,consent_version)
  VALUES ($1,$2,'view','public-people','people',$3,now(),'/u/x/people/creators','v1') RETURNING id`,[a.accountId,'evt-'+randomUUID(),made.id])).rows[0].id;
 expect((await purge(a,made)).status).toBe(200);
 expect((await admin.query('SELECT collection_id FROM analytics_events WHERE id=$1',[event])).rows).toEqual([{collection_id:null}]);
});

it('the purge statements run as the runtime role',async()=>{
 const a=await persona(),made=await create(a,'books','runtime');const filled=await item(a,'books',made);
 const db=await admin.connect();
 try{
  await db.query('BEGIN');await db.query('SET LOCAL ROLE music_runtime');
  await db.query('DELETE FROM category_recommendation_pins WHERE collection_id=$1',[made.id]);
  await db.query('DELETE FROM collections WHERE id=$1 AND account_id=$2',[made.id,a.accountId]);
  await db.query('UPDATE recommendations SET archived_at=now(),revision=revision+1,updated_at=now() WHERE id=ANY($1::uuid[])',[[filled.recommendation.id]]);
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 expect((await admin.query('SELECT 1 FROM collections WHERE id=$1',[made.id])).rowCount).toBe(0);
});

it('restore and purge accept only POST',async()=>{
 const a=await persona(),made=await create(a,'movies','methods');
 expect((await command(a,'patch',`/collections/${made.id}/restore`,{expectedRevision:made.revision})).status).toBe(405);
 expect((await command(a,'delete',`/collections/${made.id}/purge`,{expectedRevision:made.revision})).status).toBe(405);
});
