import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import actualQuill from '../../shared/test-fixtures/quill-note-v1.json';
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
it('persists independent versioned notes and preserves omitted, clear and retry semantics',async()=>{
 const a=await persona(),b=await persona(),shared=await entity(),la=await list(a),lb=await list(b);
 const note={version:1,format:'quill-html',html:'<h2>हैलो café</h2><p><strong>😀 A</strong></p>'};
 const key=randomUUID(),input={category:'books',entityId:shared,collectionId:la.id,expectedCollectionRevision:1,note};
 const saved=await command(a,'post','/recommendations',input,key);expect(saved.status).toBe(201);
 const id=saved.body.recommendation.id;
 expect((await pool.query('SELECT note FROM recommendations WHERE id=$1',[id])).rows[0].note).toEqual(note);
 const replay=await command(a,'post','/recommendations',input,key);expect(replay.body).toEqual(saved.body);
 const rb=await recommendation(b,lb,shared);
 expect((await command(a,'patch',`/recommendations/${id}`,{expectedRevision:1,userRating:4})).status).toBe(200);
 const detail=await request(composed.app).get(`/api/explorers/v1/recommendations/${id}/editable`).set('cookie',a.cookie);
 expect(detail.status).toBe(200);expect(detail.body.recommendation).toMatchObject({id,revision:2,note,categoryRevision:expect.any(String)});
 expect((await request(composed.app).get(`/api/explorers/v1/recommendations/${id}/editable`).set('cookie',b.cookie)).status).toBe(404);
 expect((await command(a,'patch',`/recommendations/${id}`,{expectedRevision:1,note:null})).status).toBe(409);
 expect((await command(a,'patch',`/recommendations/${id}`,{expectedRevision:2,note:{...note,html:'<p><br></p>'}})).status).toBe(200);
 expect((await pool.query('SELECT note FROM recommendations WHERE id=$1',[id])).rows[0].note).toBeNull();
 expect((await pool.query('SELECT note,user_rating FROM recommendations WHERE id=$1',[rb.id])).rows[0]).toEqual({note:null,user_rating:8});
 expect((await pool.query('SELECT title FROM entities WHERE id=$1',[shared])).rows[0].title).toBe('Shared title');
});
it('rejects unsupported rich notes and guards UTF8/body bounds without writing receipts',async()=>{
 const a=await persona(),la=await list(a),shared=await entity();
 for(const [html,status] of [['<script>alert(1)</script>',422],['<p><strong>unclosed</p>',422],['<span class="ql-emojiblot" data-name="grinning"><strong>😀</strong></span>',422],['<span>'.repeat(129)+'A'+'</span>'.repeat(129),413],['<p>'+'<br>'.repeat(10001)+'</p>',413],[`<p>${'😀'.repeat(65536)}</p>`,413]] as const) {
  const key=randomUUID();const result=await command(a,'post','/recommendations',{category:'books',entityId:shared,collectionId:la.id,expectedCollectionRevision:1,note:{version:1,format:'quill-html',html}},key);
  expect(result.status).toBe(status);expect((await pool.query("SELECT count(*)::int AS n FROM application_command_receipts WHERE account_id=$1 AND operation='createRecommendation'",[a.accountId])).rows[0].n).toBe(0);
 }
 const valid=await command(a,'post','/recommendations',{category:'books',entityId:shared,collectionId:la.id,expectedCollectionRevision:1,note:{version:1,format:'quill-html',html:`<p>${'A'.repeat(70000)}</p>`}});expect(valid.status).toBe(201);
 const oversized=await command(a,'patch',`/recommendations/${valid.body.recommendation.id}`,{expectedRevision:1,note:{version:1,format:'quill-html',html:'A'.repeat(1024*1024)}});
 expect(oversized.status).toBe(413);expect(oversized.body.error.code).toBe('RESOURCE_TOO_LARGE');
});
it('rolls back note and revision together on invalid owned-media relation and bounds raw editable reads',async()=>{
 const a=await persona(),b=await persona(),la=await list(a),r=await recommendation(a,la,await entity());
 const foreign=(await pool.query("INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,ready_at,content_sha256) VALUES($1,'recommendation','ready','image/png',1,now(),decode(repeat('00',32),'hex')) RETURNING id",[b.accountId])).rows[0].id;
 const key=randomUUID();expect((await command(a,'patch',`/recommendations/${r.id}`,{expectedRevision:1,note:{version:1,format:'quill-html',html:'<p>Must roll back</p>'},mediaIds:[foreign]},key)).status).toBe(422);
 expect((await pool.query('SELECT note,revision::int FROM recommendations WHERE id=$1',[r.id])).rows[0]).toEqual({note:null,revision:1});
 expect((await pool.query("SELECT count(*)::int AS n FROM application_command_receipts WHERE account_id=$1 AND operation='updateRecommendation'",[a.accountId])).rows[0].n).toBe(0);
 await pool.query('UPDATE recommendations SET note=$2::jsonb WHERE id=$1',[r.id,JSON.stringify({version:1,format:'quill-html',html:'A'.repeat(1024*1024+1)})]);
 expect((await request(composed.app).get(`/api/explorers/v1/recommendations/${r.id}/editable`).set('cookie',a.cookie)).status).toBe(413);
 expect((await request(composed.app).get(`/api/explorers/v1/recommendations/${r.id}/editable`).set('cookie',b.cookie)).status).toBe(404);
 expect((await request(composed.app).get(`/api/explorers/v1/recommendations/${r.id}`).set('cookie',a.cookie)).body.recommendation).not.toHaveProperty('note');
});
it('executes observed shared mutation clients through guarded HTTP with real note fixtures and lost reply replay',async()=>{
 const a=await persona(),storage=new Map<string,string>();
 vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});
 const {default:store}=await import('../../../explorers-earth/src/store/store');
 const {explorersApiClient,assertOwnerDetailObservation,assertCompleteMyCategoryContent,copyOwnerDetailForStaging}=await import('../../../explorers-earth/src/lib/explorersApiClient');
 store.setState({accountId:a.accountId,generation:300,isAuthenticated:true});let lost=false;
 vi.stubGlobal('fetch',async(url:string,options:RequestInit)=>{
  expect(options.credentials).toBe('include');expect(options.cache).toBe('no-store');
  const method=(options.method??'GET').toLowerCase() as 'get'|'post'|'patch'|'delete';
  let req=request(composed.app)[method](url).set('cookie',a.cookie);
  if(method!=='get')req=req.set('origin',config.baseURL).set('Idempotency-Key',new Headers(options.headers).get('Idempotency-Key')!).send(JSON.parse(options.body as string));
  const result=await req;if(lost&&method==='patch'&&url.includes('/recommendations/')){lost=false;throw new Error('lost after commit');}
  return new Response(JSON.stringify(result.body),{status:result.status,headers:{'Content-Type':'application/json'}});
 });
 try {
  const list=await explorersApiClient.createMyCollection({category:'books',title:'Clients',slug:'clients'},'client-list');
  let parent=await explorersApiClient.getMyEditableCollection(list.id);
  const manual=await explorersApiClient.resolveManualEntity({kind:'manual',category:'books',details:{title:'  😀 Client canonical  '}},'client-manual');
  const saved=await explorersApiClient.createMyRecommendation(parent,{entityId:manual.id,displayOverrides:{title:null},note:{version:1,format:'quill-html',html:actualQuill.html}},'client-child');
  expect(()=>assertOwnerDetailObservation(parent)).toThrow();
  let observed=await explorersApiClient.getMyEditableRecommendation(saved.id);
  expect(observed.detail.note?.html).toBe(actualQuill.html);expect(observed.detail.entity.title).toBe('😀 Client canonical');expect(observed.detail.displayTitle).toBeNull();expect(Object.isFrozen(observed.detail.displayOverrides)).toBe(true);const draft=copyOwnerDetailForStaging(observed);draft.note!.html='<p>staged</p>';expect(observed.detail.note?.html).toBe(actualQuill.html);
  const categoryBefore=observed.categoryRevision;lost=true;const patch={displayOverrides:{title:'😀 Author title'},note:{version:1 as const,format:'quill-html' as const,html:'<p>😀 edited</p>'}};
  await expect(explorersApiClient.updateMyRecommendation(observed,patch,'client-retry')).rejects.toMatchObject({status:503});assertOwnerDetailObservation(observed);
  const replay=await explorersApiClient.updateMyRecommendation(observed,patch,'client-retry');expect(replay.revision).toBe(2);
  observed=await explorersApiClient.getMyEditableRecommendation(saved.id);expect(BigInt(observed.categoryRevision)).toBeGreaterThan(BigInt(categoryBefore));expect(observed.detail.note).toEqual(patch.note);expect(observed.detail.displayTitle).toBe('😀 Author title');
  await expect(explorersApiClient.updateMyRecommendation(observed,{note:null},'client-retry')).rejects.toMatchObject({status:409});expect(()=>assertOwnerDetailObservation(observed)).toThrow();
  const complete=await explorersApiClient.getCompleteMyCategoryContent({category:'books'});
  await expect(explorersApiClient.reorderMyCollection(complete,list.id,[],'client-order-bad')).rejects.toMatchObject({status:422});assertCompleteMyCategoryContent(complete);
  await explorersApiClient.reorderMyCollection(complete,list.id,[saved.id],'client-order');expect(()=>assertCompleteMyCategoryContent(complete)).toThrow();
  observed=await explorersApiClient.getMyEditableRecommendation(saved.id);await explorersApiClient.archiveMyRecommendation(observed,'client-archive-child');
  parent=await explorersApiClient.getMyEditableCollection(list.id);await explorersApiClient.updateMyCollection(parent,{heading:'Heading',description:null},'client-update-list');
  parent=await explorersApiClient.getMyEditableCollection(list.id);await explorersApiClient.archiveMyCollection(parent,'client-archive-list');
 }finally {vi.unstubAllGlobals();}
});
it('creates independent owner recommendations without changing shared catalog facts',async()=>{
  const a=await persona(),b=await persona(),shared=await entity(),la=await list(a),lb=await list(b);
  const ra=await recommendation(a,la,shared),rb=await recommendation(b,lb,shared);
  const changed=await command(a,'patch',`/recommendations/${ra.id}`,{expectedRevision:1,userRating:3});expect(changed.status).toBe(200);expect(changed.body.recommendation).toMatchObject({userRating:3,revision:2});
  expect((await pool.query('SELECT user_rating FROM recommendations WHERE id=$1',[rb.id])).rows[0].user_rating).toBe(8);
  expect((await pool.query('SELECT title FROM entities WHERE id=$1',[shared])).rows[0].title).toBe('Shared title');
  expect((await command(b,'patch',`/recommendations/${ra.id}`,{expectedRevision:2,userRating:4})).status).toBe(404);
  expect((await command(b,'delete',`/collections/${la.id}`,{expectedRevision:2})).status).toBe(404);
});
it('denies anonymous, inactive, stale sessions and ambiguous account credentials',async()=>{
  const a=await persona(),body={category:'books',title:'Test',slug:'test'};
  expect((await request(composed.app).post('/api/explorers/v1/collections').set('origin',config.baseURL).send(body)).status).toBe(401);
  expect((await command(a,'post','/collections',body).set('x-account-id',a.accountId)).status).toBe(401);
  await pool.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1",[a.accountId]);expect((await command(a,'post','/collections',body)).status).toBe(403);
  await pool.query("UPDATE creator_accounts SET status='active',suspended_at=NULL WHERE id=$1",[a.accountId]);
  await pool.query('UPDATE user_security_state SET session_version=session_version+1 WHERE user_id=$1',[a.userId]);expect((await command(a,'post','/collections',body)).status).toBe(401);
});
it('validates exact boundary keys, category, revision, path and origin',async()=>{
  const a=await persona(),base={category:'books',title:'Test',slug:'test'};
  for(const body of [{...base,accountId:a.accountId},{...base,category:'music'},{...base,title:' '},{...base,slug:'A B'},{...base,descriptionRich:{}},{...base,visibility:'hidden'}]) expect((await command(a,'post','/collections',body)).status).toBe(422);
  expect((await command(a,'post','/collections?accountId='+a.accountId,base)).status).toBe(422);
  expect((await command(a,'patch','/collections/not-a-uuid',{expectedRevision:1,title:'Updated'})).status).toBe(422);
  expect((await command(a,'post','/collections',base).set('origin','https://foreign.invalid')).status).toBe(403);
  expect((await command(a,'post','/collections',base,'bad')).status).toBe(422);
  const c=await list(a);
  for(const expectedRevision of [0,1.5,'1',9007199254740992]) expect((await command(a,'patch',`/collections/${c.id}`,{expectedRevision,title:'Changed'})).status).toBe(422);
  expect((await request(composed.app).put(`/api/explorers/v1/collections/${c.id}`).send({})).status).toBe(405);
  expect((await command(a,'post','/Collections',base)).status).toBe(404);
  expect((await command(a,'post','/collections/',base)).status).toBe(404);
  expect((await command(a,'patch','/recommendations/search',{expectedRevision:1,userRating:5})).status).toBe(405);
});
it('replays creates, rejects changed hashes and expired keys, and keeps stale commands conflicting',async()=>{
  const a=await persona(),key=randomUUID(),input={category:'books',title:'Read',slug:'read'};
  const first=await command(a,'post','/collections',input,key),replay=await command(a,'post','/collections',input,key);expect(first.status).toBe(201);expect(replay.body).toEqual(first.body);
  expect((await command(a,'post','/collections',{...input,title:'Changed'},key)).status).toBe(409);
  const c=first.body.collection;
  expect((await command(a,'patch',`/collections/${c.id}`,{expectedRevision:1,title:'New'})).status).toBe(200);
  expect((await command(a,'patch',`/collections/${c.id}`,{expectedRevision:1,title:'Old'})).status).toBe(409);
  await pool.query("UPDATE application_command_receipts SET replay_until=now()-interval '1 second' WHERE account_id=$1",[a.accountId]);expect((await command(a,'post','/collections',input,key)).status).toBe(409);
  expect((await pool.query('SELECT count(*)::int AS n FROM collections WHERE account_id=$1',[a.accountId])).rows[0].n).toBe(1);
});
it('rejects wrong-category and foreign parents without receipt or revision side effects',async()=>{
  const a=await persona(),b=await persona(),ca=await list(a),cb=await list(b),key=randomUUID();
  const input={category:'books',entityId:await entity('person'),collectionId:ca.id,expectedCollectionRevision:1};
  expect((await command(a,'post','/recommendations',input,key)).status).toBe(422);
  expect((await command(a,'post','/recommendations',{...input,entityId:await entity(),collectionId:cb.id})).status).toBe(404);
  expect((await pool.query('SELECT revision::int FROM collections WHERE id=$1',[ca.id])).rows[0].revision).toBe(1);
  expect((await pool.query("SELECT count(*)::int AS n FROM application_command_receipts WHERE account_id=$1 AND operation='createRecommendation'",[a.accountId])).rows[0].n).toBe(0);
  expect((await command(a,'post','/recommendations',{...input,entityId:await entity()},key)).status).toBe(201);
});
it('checks exact reorder membership and archives replay before archived revision evaluation',async()=>{
  const a=await persona(),c=await list(a),shared=await entity(),one=await recommendation(a,c,shared),two=await recommendation(a,c,shared,2);
  for(const ids of [[one.id],[one.id,one.id],[one.id,randomUUID()]]) expect((await command(a,'patch',`/collections/${c.id}/order`,{expectedRevision:3,orderedRecommendationIds:ids})).status).toBe(422);
  const result=await command(a,'patch',`/collections/${c.id}/order`,{expectedRevision:3,orderedRecommendationIds:[two.id,one.id]});expect(result.status).toBe(200);expect(result.body.collection.revision).toBe(4);
  const key=randomUUID(),body={expectedRevision:4};expect((await command(a,'delete',`/collections/${c.id}`,body,key)).status).toBe(200);expect((await command(a,'delete',`/collections/${c.id}`,body,key)).status).toBe(200);
  expect((await pool.query('SELECT count(*)::int AS n FROM recommendations WHERE account_id=$1',[a.accountId])).rows[0].n).toBe(2);
  const guide=await list(a,'guides');expect((await command(a,'delete',`/collections/${guide.id}`,{expectedRevision:1})).status).toBe(200);
});
it('writes purpose-compatible owned media and rolls invalid replacement back atomically',async()=>{
  const a=await persona(),b=await persona();
  const media=async(accountId:string,purpose:string,status='ready')=>(await pool.query(`INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,ready_at,content_sha256)
    VALUES($1,$2,$3,'image/png',10,CASE WHEN $3='ready' THEN now() ELSE NULL END,decode(repeat('00',32),'hex')) RETURNING id`,[accountId,purpose,status])).rows[0].id;
  const cover=await media(a.accountId,'collection'),image=await media(a.accountId,'recommendation'),foreign=await media(b.accountId,'recommendation');
  const created=await command(a,'post','/collections',{category:'books',title:'Read',slug:'media',description:'A plain description',heading:'Top reads',coverMediaId:cover});expect(created.status).toBe(201);expect(created.body.collection).toMatchObject({coverMediaId:cover,description:'A plain description',heading:'Top reads'});
  const c=created.body.collection;
  const added=await command(a,'post','/recommendations',{category:'books',entityId:await entity(),collectionId:c.id,expectedCollectionRevision:1,mediaIds:[image]});expect(added.status).toBe(201);expect(added.body.recommendation.mediaIds).toEqual([image]);
  const id=added.body.recommendation.id,key=randomUUID();
  for(const mediaIds of [[foreign],[cover],[await media(a.accountId,'recommendation','uploading')],[image,image]]) expect((await command(a,'patch',`/recommendations/${id}`,{expectedRevision:1,userRating:2,mediaIds},key)).status).toBe(422);
  expect((await pool.query('SELECT revision::int,user_rating FROM recommendations WHERE id=$1',[id])).rows[0]).toEqual({revision:1,user_rating:null});
  expect((await pool.query('SELECT media_id FROM recommendation_media WHERE recommendation_id=$1',[id])).rows.map(r=>r.media_id)).toEqual([image]);
  expect((await pool.query("SELECT count(*)::int AS n FROM application_command_receipts WHERE account_id=$1 AND operation='updateRecommendation'",[a.accountId])).rows[0].n).toBe(0);
  const detached=await command(a,'patch',`/recommendations/${id}`,{expectedRevision:1,mediaIds:[]},key);expect(detached.status).toBe(200);expect(detached.body.recommendation.mediaIds).toEqual([]);
  expect((await command(a,'patch',`/collections/${c.id}`,{expectedRevision:2,coverMediaId:null,description:null,heading:null})).status).toBe(200);
});
it.each([['places','place'],['places','person'],['books','book'],['movies','movie'],['games','game'],['apps','app'],['products','product'],['people','person']])('validates %s core against entity kind %s',async(category,kind)=>{
  const a=await persona(),c=await list(a,category),entityId=await entity(kind);
  const created=await recommendation(a,c,entityId);expect(created).toMatchObject({category,entityId,userRating:8,publicationState:'draft',mediaIds:[]});
  for(const body of [{expectedRevision:1,userRating:0},{expectedRevision:1,userRating:11},{expectedRevision:1,userRating:1.5},{expectedRevision:1,userRating:'5'},{expectedRevision:1,note:{version:1,arbitrary:true}},{expectedRevision:1,entityId:randomUUID()},{expectedRevision:1,category:'books'},{expectedRevision:1}]) expect((await command(a,'patch',`/recommendations/${created.id}`,body)).status).toBe(422);
  const published=await command(a,'patch',`/recommendations/${created.id}`,{expectedRevision:1,publicationState:'published',userRating:null});expect(published.status).toBe(200);expect(published.body.recommendation).toMatchObject({publicationState:'published',userRating:null,revision:2});
});
it('archives one recommendation with replay and leaves another owner and catalog intact',async()=>{
  const a=await persona(),b=await persona(),shared=await entity(),c=await list(a),other=await list(b),r=await recommendation(a,c,shared),rb=await recommendation(b,other,shared),key=randomUUID();
  expect((await command(a,'delete',`/recommendations/${r.id}`,{expectedRevision:1},key)).status).toBe(200);
  expect((await command(a,'delete',`/recommendations/${r.id}`,{expectedRevision:1},key)).status).toBe(200);
  expect((await pool.query('SELECT revision::int FROM collections WHERE id=$1',[c.id])).rows[0].revision).toBe(3);
  expect((await pool.query('SELECT id FROM recommendations WHERE id=$1 AND archived_at IS NULL',[rb.id])).rowCount).toBe(1);
  expect((await pool.query('SELECT id FROM entities WHERE id=$1',[shared])).rowCount).toBe(1);
});
it('resolves only eligible existing entities without accepting provider facts or private foreign context',async()=>{
  const a=await persona(),b=await persona(),shared=await entity(),c=await list(a);
  const rec=await recommendation(a,c,shared);
  const input={entityId:shared,category:'books'};
  const resolved=await command(a,'post','/entities/resolve',input);expect(resolved.status).toBe(200);expect(resolved.body.entity).toEqual({id:shared,kind:'book',title:'Shared title'});
  expect((await command(b,'post','/entities/resolve',input)).status).toBe(404);
  expect((await command(a,'post','/entities/resolve',{...input,title:'Overwrite',provider:'google_books',externalId:'forged'})).status).toBe(422);
  expect((await command(a,'post','/entities/resolve',{...input,category:'movies'})).status).toBe(422);
  expect((await command(a,'post','/entities/resolve',{...input,entityId:randomUUID()})).status).toBe(404);
  await command(a,'delete',`/recommendations/${rec.id}`,{expectedRevision:1});expect((await command(a,'post','/entities/resolve',input)).status).toBe(404);
});
it('rechecks stale and inactive actors at the application boundary, including limited OAuth scopes',async()=>{
  const {RecommendationService}=await import('../application/recommendations');
  const a=await persona(),service=new RecommendationService(pool),actor={userId:a.userId,accountId:a.accountId,role:'owner' as const,credential:{kind:'web-session' as const,sessionId:a.sessionId,sessionVersion:1}};
  const input={category:'books',title:'Direct',slug:'direct'},context={requestId:randomUUID(),idempotencyKey:randomUUID()};
  const created=await service.createCollection(actor,input,context);expect(created.accountId).toBe(a.accountId);
  await expect(service.createCollection({...actor,credential:{kind:'oauth',grantId:randomUUID(),scopes:['profile:read']}},input,context)).rejects.toMatchObject({status:403});
  await pool.query('UPDATE user_security_state SET session_version=session_version+1 WHERE user_id=$1',[a.userId]);await expect(service.createCollection(actor,input,context)).rejects.toMatchObject({status:401});
  await pool.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1",[a.accountId]);await expect(service.archiveCollection(actor,created.id,{expectedRevision:1},context)).rejects.toMatchObject({status:403});
});

// Category commands preserve staged manager save timing. These real HTTP tests
// catch replacement masquerading as autosave and unbounded completeness claims.
async function pinInput(owner:{cookie:string},orderedPins:object[],category='books') {
  const snapshot=await request(composed.app).get(`/api/explorers/v1/categories/${category}/content-snapshot`).set('cookie',owner.cookie);
  expect(snapshot.status).toBe(200);
  return {expectedCategoryRevision:snapshot.body.revision,expectedPinRevision:snapshot.body.pinRevision,orderedPins};
}
function pins(owner:{cookie:string},method:'put'|'patch',input:object,key=randomUUID(),category='books') {
  return request(composed.app)[method](`/api/explorers/v1/categories/${category}/top-picks${method==='patch'?'/order':''}`).set('cookie',owner.cookie).set('origin',config.baseURL).set('Idempotency-Key',key).send(input);
}
it('top picks preserve staged add/drag and unpin/drag ties until explicit Save',async()=>{
  const a=await persona(),c=await list(a),d=await list(a),e=await entity(),one=await recommendation(a,c,e),two=await recommendation(a,d,e);
  const p={recommendationId:one.id,collectionId:c.id},q={recommendationId:two.id,collectionId:d.id};
  const saved=await pins(a,'put',await pinInput(a,[p]));expect(saved.status).toBe(200);expect(saved.body.topPicks).toMatchObject({operation:'replace',pinRevision:1,pins:[{...p,position:0}]});
  const moved=await pins(a,'patch',await pinInput(a,[q]));expect(moved.status).toBe(200);expect(moved.body.topPicks).toMatchObject({operation:'upsert-order',pinRevision:2,pins:[{...q,position:0}]});
  expect((await pool.query('SELECT recommendation_id,position FROM category_recommendation_pins WHERE account_id=$1 ORDER BY recommendation_id',[a.accountId])).rows).toHaveLength(2);
  expect((await pool.query('SELECT position FROM category_recommendation_pins WHERE account_id=$1',[a.accountId])).rows.map(r=>r.position)).toEqual([0,0]);
  const cleared=await pins(a,'put',await pinInput(a,[q]));expect(cleared.status).toBe(200);expect(cleared.body.topPicks.pins).toEqual([{...q,position:0}]);
  expect((await pool.query('SELECT recommendation_id FROM category_recommendation_pins WHERE account_id=$1',[a.accountId])).rows).toEqual([{recommendation_id:two.id}]);
  expect((await pool.query('SELECT publication_state,visibility FROM collections WHERE id=$1',[d.id])).rows[0]).toEqual({publication_state:'draft',visibility:'private'});
});
it('top picks accept 15 supplied rows and preserve an autosave union above 15',async()=>{
  const a=await persona(),c=await list(a),e=await entity(),selected=[];
  for(let i=0;i<16;i++){const r=await recommendation(a,c,e,i+1);selected.push({recommendationId:r.id,collectionId:c.id});}
  expect((await pins(a,'put',await pinInput(a,selected))).status).toBe(422);
  const saved=await pins(a,'put',await pinInput(a,selected.slice(0,15)));expect(saved.status).toBe(200);expect(saved.body.topPicks.pins).toHaveLength(15);
  const moved=await pins(a,'patch',await pinInput(a,selected.slice(15)));expect(moved.status).toBe(200);expect(moved.body.topPicks.pins).toHaveLength(1);
  expect((await pool.query('SELECT count(*)::int n FROM category_recommendation_pins WHERE account_id=$1',[a.accountId])).rows[0].n).toBe(16);
  expect((await pins(a,'patch',await pinInput(a,[]))).body.topPicks.pinRevision).toBe(3);
  expect((await pool.query('SELECT count(*)::int n FROM category_recommendation_pins WHERE account_id=$1',[a.accountId])).rows[0].n).toBe(16);
  expect((await pins(a,'put',await pinInput(a,[]))).body.topPicks.pins).toEqual([]);
  expect((await pool.query('SELECT count(*)::int n FROM category_recommendation_pins WHERE account_id=$1',[a.accountId])).rows[0].n).toBe(0);
});
it('top picks require both revisions and exact strict bounded command inputs',async()=>{
  const a=await persona(),base=await pinInput(a,[]);
  for(const body of [{orderedPins:[]},{...base,expectedPinRevision:undefined},{...base,expectedCategoryRevision:undefined},{...base,expectedCategoryRevision:'01'},{...base,expectedCategoryRevision:'-1'},{...base,expectedPinRevision:0},{...base,expectedPinRevision:'1'},{...base,accountId:a.accountId},{...base,position:0},{...base,complete:true}]) expect((await pins(a,'put',body)).status).toBe(422);
  for(const category of ['music','places','guides','BOOKS']) expect((await pins(a,'put',base,randomUUID(),category)).status).toBe(422);
  expect((await pins(a,'put',base).query({category:'books'})).status).toBe(422);
  expect((await pins(a,'put',base,'bad')).status).toBe(422);
  expect((await request(composed.app).get('/api/explorers/v1/categories/books/top-picks')).status).toBe(401);
});
it('top picks reject foreign and missing selected memberships without data or receipt prefixes',async()=>{
  const a=await persona(),b=await persona(),c=await list(a),d=await list(a),foreign=await list(b),r=await recommendation(a,c,await entity());
  const base=await pinInput(a,[]);
  for(const collectionId of [d.id,foreign.id,randomUUID()]) expect((await pins(a,'put',{...base,orderedPins:[{recommendationId:r.id,collectionId}]})).status).toBe(422);
  expect((await pins(a,'put',{...base,orderedPins:[{recommendationId:r.id,collectionId:c.id},{recommendationId:r.id,collectionId:d.id}]})).status).toBe(422);
  expect((await pool.query("SELECT count(*)::int n FROM application_command_receipts WHERE account_id=$1 AND operation IN ('setCategoryTopPicks','upsertCategoryTopPickOrder')",[a.accountId])).rows[0].n).toBe(0);
  expect((await pool.query('SELECT count(*)::int n FROM account_category_pin_state WHERE account_id=$1',[a.accountId])).rows[0].n).toBe(0);
});
it('top picks replay before stale checks and reject changed hashes and expired receipts',async()=>{
  const a=await persona(),input=await pinInput(a,[]),key=randomUUID(),first=await pins(a,'put',input,key);expect(first.status).toBe(200);expect(first.body.topPicks.pinRevision).toBe(1);
  expect((await pins(a,'put',input)).status).toBe(409);
  const next=await pins(a,'patch',await pinInput(a,[]));expect(next.status).toBe(200);expect(next.body.topPicks.pinRevision).toBe(2);
  expect((await pins(a,'put',input,key)).body).toEqual(first.body);
  expect((await pins(a,'put',{...input,expectedPinRevision:2},key)).status).toBe(409);
  expect((await pins(a,'put',input,key,'games')).status).toBe(409);
  await pool.query("UPDATE application_command_receipts SET replay_until=now()-interval '1 second' WHERE account_id=$1",[a.accountId]);
  expect((await pins(a,'put',input,key)).status).toBe(409);
});
it('top picks serialize concurrent absent-state creation and independently compare both revisions',async()=>{
  const a=await persona(),input=await pinInput(a,[]),results=await Promise.all([pins(a,'put',input),pins(a,'patch',input)]);
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  const current=await pinInput(a,[]);
  expect((await pins(a,'put',{...current,expectedCategoryRevision:'0'})).status).toBe(409);
  expect((await pins(a,'put',{...current,expectedPinRevision:null})).status).toBe(409);
  const changed=await pins(a,'put',current);expect(changed.status).toBe(200);expect(changed.body.topPicks.pinRevision).toBe(2);
  const actual=await pinInput(a,[]);expect(changed.body.topPicks.categoryRevision).toBe(actual.expectedCategoryRevision);
});
it('top picks deny canonical origin, anonymous, stale session, lifecycle, revoked membership and OAuth scopes',async()=>{
  const a=await persona(),input=await pinInput(a,[]),path='/api/explorers/v1/categories/books/top-picks';
  expect((await request(composed.app).put(path).set('origin',config.baseURL).send(input)).status).toBe(401);
  expect((await pins(a,'put',input).set('origin','https://foreign.invalid')).status).toBe(403);
  expect((await pins(a,'put',input).set('x-account-id',a.accountId)).status).toBe(401);
  const {RecommendationService}=await import('../application/recommendations'),service=new RecommendationService(pool);
  const actor={userId:a.userId,accountId:a.accountId,role:'owner' as const,credential:{kind:'web-session' as const,sessionId:a.sessionId,sessionVersion:1}},context={requestId:randomUUID(),idempotencyKey:randomUUID()};
  for(const scopes of [[],['collections:write'],['recommendations:read']]) await expect(service.setCategoryTopPicks({...actor,credential:{kind:'oauth',grantId:randomUUID(),scopes}},'books',input,context)).rejects.toMatchObject({status:403});
  await pool.query('UPDATE auth_session SET expires_at=now()-interval \'1 second\' WHERE id=$1',[a.sessionId]);expect((await pins(a,'put',input)).status).toBe(401);
  const b=await persona(),binput=await pinInput(b,[]);await pool.query('UPDATE user_security_state SET session_version=session_version+1 WHERE user_id=$1',[b.userId]);expect((await pins(b,'put',binput)).status).toBe(401);
  const c=await persona(),cinput=await pinInput(c,[]);await pool.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1",[c.accountId]);expect((await pins(c,'put',cinput)).status).toBe(403);
  const d=await persona(),dinput=await pinInput(d,[]);await expect(service.setCategoryTopPicks({...actor,accountId:d.accountId},'books',dinput,context)).rejects.toMatchObject({status:404});
});
it('top picks select another exact membership and stale category changes fence commands',async()=>{
  const a=await persona(),c=await list(a),d=await list(a),r=await recommendation(a,c,await entity()),p={recommendationId:r.id,collectionId:c.id};
  await pool.query('INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,\'books\',0)',[d.id,r.id,a.accountId]);
  const saved=await pins(a,'put',await pinInput(a,[p]));expect(saved.status).toBe(200);
  const changed=await pins(a,'patch',await pinInput(a,[{...p,collectionId:d.id}]));expect(changed.status).toBe(200);
  expect((await pool.query('SELECT collection_id FROM category_recommendation_pins WHERE recommendation_id=$1',[r.id])).rows[0].collection_id).toBe(d.id);
  const before=await pinInput(a,[p]);await pool.query('UPDATE collections SET title=\'New\' WHERE id=$1',[c.id]);expect((await pins(a,'put',before)).status).toBe(409);
  await pool.query('UPDATE collections SET archived_at=now() WHERE id=$1',[c.id]);expect((await pins(a,'put',await pinInput(a,[p]))).status).toBe(422);
  await pool.query('UPDATE recommendations SET archived_at=now() WHERE id=$1',[r.id]);expect((await pins(a,'patch',await pinInput(a,[{...p,collectionId:d.id}]))).status).toBe(422);
});
it('top picks roll back pin DML, both revisions and receipt on injected failure and permit retry',async()=>{
  const {ExplorersRecommendationRepository}=await import('../repositories/explorersRecommendationRepository');
  for(const failure of ['INSERT INTO application_command_receipts','COMMIT']) {
    const a=await persona(),c=await list(a),r=await recommendation(a,c,await entity()),input=await pinInput(a,[{recommendationId:r.id,collectionId:c.id}]),key=randomUUID();
    const faulty={connect:async()=>{const db=await pool.connect();return {release:()=>db.release(),query:async(sql:string,args?:unknown[])=>{if(sql.startsWith(failure)) throw new Error('Injected top-pick failure');return db.query(sql,args);}};}} as unknown as pg.Pool;
    await expect(new ExplorersRecommendationRepository(faulty).writeCategoryTopPicks(a.accountId,'books',input as any,key,true)).rejects.toThrow('Injected top-pick failure');
    expect(await pinInput(a,[])).toEqual({...input,orderedPins:[]});
    expect((await pool.query('SELECT count(*)::int n FROM category_recommendation_pins WHERE account_id=$1',[a.accountId])).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int n FROM application_command_receipts WHERE account_id=$1 AND operation='setCategoryTopPicks'",[a.accountId])).rows[0].n).toBe(0);
    expect((await pins(a,'put',input,key)).status).toBe(200);
  }
});
it('top picks use real runtime grants and rollback pin revision overflow',async()=>{
  const {ExplorersRecommendationRepository}=await import('../repositories/explorersRecommendationRepository');
  const a=await persona(),c=await list(a),r=await recommendation(a,c,await entity()),input=await pinInput(a,[{recommendationId:r.id,collectionId:c.id}]);
  const runtime={connect:async()=>{const db=await pool.connect();await db.query('SET ROLE music_runtime');return {query:db.query.bind(db),release:async()=>{await db.query('RESET ROLE');db.release();}};}} as unknown as pg.Pool;
  const accepted=await new ExplorersRecommendationRepository(runtime).writeCategoryTopPicks(a.accountId,'books',input as any,randomUUID(),true);expect(accepted.pinRevision).toBe(1);
  expect(accepted.categoryRevision).toBe((await pinInput(a,[])).expectedCategoryRevision);
  await pool.query("UPDATE account_category_pin_state SET revision=9007199254740991 WHERE account_id=$1 AND category='books'",[a.accountId]);
  const before=await pinInput(a,[]);expect((await pins(a,'put',before)).status).toBe(422);
  expect(await pinInput(a,[])).toEqual(before);
  expect((await pool.query('SELECT recommendation_id FROM category_recommendation_pins WHERE account_id=$1',[a.accountId])).rows).toEqual([{recommendation_id:r.id}]);
});

it.each(['books','movies','games','apps','products','people'])('top picks initialize untouched %s to pin revision one and return actual multi-trigger category revision',async category=>{
  const a=await persona(),input={expectedCategoryRevision:'0',expectedPinRevision:null,orderedPins:[]};
  const first=await pins(a,'put',input,randomUUID(),category);expect(first.status).toBe(200);expect(first.body.topPicks).toEqual({operation:'replace',categoryRevision:'1',pinRevision:1,pins:[]});
  const next=await pins(a,'patch',{expectedCategoryRevision:'1',expectedPinRevision:1,orderedPins:[]},randomUUID(),category);expect(next.status).toBe(200);expect(next.body.topPicks.pinRevision).toBe(2);
  expect(next.body.topPicks.categoryRevision).toBe((await pinInput(a,[],category)).expectedCategoryRevision);
  const kind={books:'book',movies:'movie',games:'game',apps:'app',products:'product',people:'person'}[category];
  const c=await list(a,category),r=await recommendation(a,c,await entity(kind));
  const saved=await pins(a,'put',await pinInput(a,[{recommendationId:r.id,collectionId:c.id}],category),randomUUID(),category);
  expect(saved.status).toBe(200);expect(saved.body.topPicks.pinRevision).toBe(3);
  expect((await pool.query('SELECT publication_state FROM recommendations WHERE id=$1',[r.id])).rows[0].publication_state).toBe('draft');
});
it('top picks canonicalize UUID casing for replay while changed order and membership hashes conflict',async()=>{
  const a=await persona(),c=await list(a),d=await list(a),e=await entity(),one=await recommendation(a,c,e),two=await recommendation(a,d,e),key=randomUUID();
  const p={recommendationId:one.id,collectionId:c.id},q={recommendationId:two.id,collectionId:d.id},input=await pinInput(a,[p,q]);
  const first=await pins(a,'put',input,key);expect(first.status).toBe(200);
  expect((await pins(a,'put',{...input,orderedPins:[{recommendationId:one.id.toUpperCase(),collectionId:c.id.toUpperCase()},q]},key)).body).toEqual(first.body);
  expect((await pins(a,'put',{...input,orderedPins:[q,p]},key)).status).toBe(409);
  expect((await pins(a,'put',{...input,orderedPins:[{...p,collectionId:d.id},q]},key)).status).toBe(409);
  // Accepted state + two inserted rows conservatively invalidate several times.
  expect(BigInt(first.body.topPicks.categoryRevision)-BigInt(input.expectedCategoryRevision)).toBeGreaterThan(1n);
  expect(first.body.topPicks.categoryRevision).toBe((await pinInput(a,[])).expectedCategoryRevision);
});
it('top picks terminal purge removes commanded pins and cannot replay into the tombstone',async()=>{
  const a=await persona(),b=await persona(),c=await list(a),d=await list(b),e=await entity(),r=await recommendation(a,c,e),other=await recommendation(b,d,e),input=await pinInput(a,[{recommendationId:r.id,collectionId:c.id}]),key=randomUUID();
  expect((await pins(a,'put',input,key)).status).toBe(200);
  const receipt=(await pool.query("INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,response) VALUES($1,'delete',decode(repeat('02',32),'hex'),decode(repeat('02',32),'hex'),'{}') RETURNING id",[a.accountId])).rows[0].id;
  const feedback=(await pool.query("INSERT INTO deletion_feedback(account_id,reason) VALUES($1,'Delete') RETURNING id",[a.accountId])).rows[0].id;
  const operation=(await pool.query("INSERT INTO account_lifecycle_operations(account_id,kind,state,expected_revision,feedback_id,receipt_id) VALUES($1,'delete','running',1,$2,$3) RETURNING id",[a.accountId,feedback,receipt])).rows[0].id;
  await pool.query("UPDATE creator_accounts SET status='pending_deletion',deletion_requested_at=now() WHERE id=$1",[a.accountId]);
  const db=await pool.connect();try {await db.query('BEGIN');await db.query('SET LOCAL ROLE music_runtime');await db.query('SELECT purge_explorers_account_content($1,$2)',[a.accountId,operation]);await db.query('COMMIT');}finally{await db.query('ROLLBACK');db.release();}
  for(const table of ['category_recommendation_pins','account_category_pin_state']) expect((await pool.query(`SELECT 1 FROM ${table} WHERE account_id=$1`,[a.accountId])).rowCount).toBe(0);
  expect((await pins(a,'put',input,key)).status).toBe(403);
  expect((await pool.query('SELECT 1 FROM entities WHERE id=$1',[e])).rowCount).toBe(1);
  expect((await pool.query('SELECT 1 FROM recommendations WHERE id=$1',[other.id])).rowCount).toBe(1);
  expect((await pool.query('SELECT 1 FROM account_category_content_state WHERE account_id=$1',[a.accountId])).rowCount).toBe(8);
});
it('top picks fence intervening membership/media mutations and reject wrong-category or wrong-owner replay',async()=>{
  const a=await persona(),b=await persona(),c=await list(a),other=await list(a,'games'),r=await recommendation(a,c,await entity()),wrong=await recommendation(a,other,await entity('game'));
  const p={recommendationId:r.id,collectionId:c.id},input=await pinInput(a,[p]),key=randomUUID();
  expect((await pins(a,'put',input,key)).status).toBe(200);
  expect((await pins(b,'put',await pinInput(b,[p]),key)).status).toBe(422);
  expect((await pins(a,'put',await pinInput(a,[{recommendationId:wrong.id,collectionId:other.id}]))).status).toBe(422);
  const beforeMedia=await pinInput(a,[p]),media=(await pool.query("INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,ready_at,content_sha256) VALUES($1,'recommendation','ready','image/png',10,now(),decode(repeat('00',32),'hex')) RETURNING id",[a.accountId])).rows[0].id;
  await pool.query('INSERT INTO recommendation_media(recommendation_id,account_id,media_id,display_order) VALUES($1,$2,$3,0)',[r.id,a.accountId,media]);
  expect((await pins(a,'put',beforeMedia)).status).toBe(409);
  const beforeMembership=await pinInput(a,[p]);await pool.query('DELETE FROM collection_items WHERE collection_id=$1 AND recommendation_id=$2',[c.id,r.id]);
  expect((await pins(a,'put',beforeMembership)).status).toBe(409);
  expect((await pins(a,'put',await pinInput(a,[p]))).status).toBe(422);
  // Replays return the original bounded response even after selected membership vanished.
  expect((await pins(a,'put',input,key)).status).toBe(200);
});
