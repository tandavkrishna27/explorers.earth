import {BookCatalog} from '../services/bookCatalog';
import {MediaService} from '../application/media';
import type {Actor} from '../application/actor';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64');
const bytes=new Map<string,Buffer>();let storageReads=0;
const storage={environment:'local' as const,put:async(k:string,b:Buffer)=>{bytes.set(k,b);},get:async(k:string)=>{storageReads++;return bytes.get(k)!;},delete:async(k:string)=>{bytes.delete(k);}};
let providerTitle='Provider title';const providerFetch=vi.fn(async(url:URL)=>new Response(JSON.stringify(url.pathname.endsWith('/volumes')?{items:[{id:'fixture-v1',volumeInfo:{title:providerTitle,authors:['Writer'],publishedDate:'2024-03',industryIdentifiers:[{type:'ISBN_10',identifier:'123456789X'}],description:'<p>Book summary</p>'}}],totalItems:1}:{id:url.pathname.split('/').at(-1),volumeInfo:{title:providerTitle,authors:['Writer'],publishedDate:'2024-03',industryIdentifiers:[{type:'ISBN_10',identifier:'123456789X'}],description:'<p>Book summary</p>'}})));
const books=new BookCatalog({apiKey:'deterministic-only',secret:'cursor-test-secret',fetch:providerFetch as any});import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createCanonicalApp } from '../auth/canonicalApp';
import { resolveExplorersAuthConfig } from '../auth/betterAuth';

const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51474',EXPLORERS_AUTH_SECRET:'integration-secret-'.repeat(4),GOOGLE_CLIENT_ID:'fixture-google-id',GOOGLE_CLIENT_SECRET:'fixture-google-secret'});
let pool:pg.Pool, composed:ReturnType<typeof createCanonicalApp>;
beforeAll(()=>{pool=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:4});composed=createCanonicalApp(pool,config,{bookCatalog:books,mediaStorage:storage});});
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

it('refetches trusted Book identity once per command, serializes global identity and preserves first stored facts',async()=>{
 const a=await persona(),b=await persona(),input={kind:'provider',category:'books',provider:'google_books',externalKind:'volume',externalId:'fixture-v1'},key=randomUUID();
 const search=await request(composed.app).get('/api/explorers/v1/catalog/books?query=book').set('cookie',a.cookie);expect(search.status).toBe(200);expect(search.body.items[0].preview.isbn13).toBeNull();
 const start=providerFetch.mock.calls.length;
 const resolved=await command(a,'post','/entities/resolve',input,key);expect(resolved.status).toBe(200);expect(resolved.body.entity.details).toMatchObject({authors:['Writer'],isbn10:'123456789X',isbn13:null,yearText:'2024'});expect(providerFetch.mock.calls.length).toBe(start+1);
 expect((await command(a,'post','/entities/resolve',input,key)).body).toEqual(resolved.body);expect(providerFetch.mock.calls.length).toBe(start+1);
 expect((await command(a,'post','/entities/resolve',{...input,externalId:'different'},key)).status).toBe(409);expect(providerFetch.mock.calls.length).toBe(start+1);
 providerTitle='Updated provider';const again=await command(b,'post','/entities/resolve',input);expect(again.body.entity).toEqual(resolved.body.entity);
 const [one,two]=await Promise.all([command(a,'post','/entities/resolve',{...input,externalId:'fixture-v2'}),command(b,'post','/entities/resolve',{...input,externalId:'fixture-v2'})]);expect(one.status).toBe(200);expect(two.body.entity.id).toBe(one.body.entity.id);expect(one.body.entity.id).not.toBe(resolved.body.entity.id);
 expect((await command(a,'post','/entities/resolve',{...input,details:{title:'Spoof'}})).status).toBe(422);
});
it('roundtrips manual Book facts, sparse overrides/context and identity replacement preserving account editorial relations',async()=>{
 const a=await persona(),b=await persona(),la=await list(a),lb=await list(b);
 const original=await command(a,'post','/entities/resolve',{kind:'manual',category:'books',details:{title:'Original',authors:['Original author'],subtitle:'Canonical subtitle'}});expect(original.status).toBe(200);
 const target=await command(b,'post','/entities/resolve',{kind:'manual',category:'books',details:{title:'Replacement',authors:['New author']}});expect(target.status).toBe(200);
 const ra=await recommendation(a,la,original.body.entity.id),rb=await recommendation(b,lb,original.body.entity.id);
 const uploaded=await request(composed.app).post('/api/explorers/v1/media').set('cookie',a.cookie).set('origin',config.baseURL).set('content-type','image/png').set('x-media-purpose','recommendation').set('x-file-name','snapshot.png').send(png);expect(uploaded.status).toBe(201);const mediaId=uploaded.body.media.id;
 await pool.query("INSERT INTO account_category_pin_state(account_id,category) VALUES($1,\'books\')",[a.accountId]);
 await pool.query("INSERT INTO category_recommendation_pins(account_id,category,recommendation_id,collection_id,position) VALUES($1,'books',$2,$3,0)",[a.accountId,ra.id,la.id]);
 const note={version:1,format:'quill-html',html:'<p>My note</p>'},bookContext={buyLinks:[{name:'Shop',url:'https://shop.example/book',logo:'https://shop.example/logo'}]};
 const change=await command(a,'patch',`/recommendations/${ra.id}`,{expectedRevision:1,note,mediaIds:[mediaId],displayOverrides:{subtitle:null,authors:['Mine']},bookContext});expect(change.status).toBe(200);
 const before=(await request(composed.app).get(`/api/explorers/v1/recommendations/${ra.id}/editable`).set('cookie',a.cookie)).body.recommendation;expect(before.effectiveBookDetails).toMatchObject({authors:['Mine'],subtitle:null});expect(before.bookContext).toEqual(bookContext);
 const key=randomUUID(),replace={expectedRevision:2,entityId:target.body.entity.id};const result=await command(a,'post',`/recommendations/${ra.id}/entity`,replace,key);expect(result.status).toBe(200);expect(result.body.recommendation).toMatchObject({entityId:target.body.entity.id,revision:3,userRating:8,mediaIds:[mediaId]});
 expect((await command(a,'post',`/recommendations/${ra.id}/entity`,replace,key)).body).toEqual(result.body);
 expect((await command(a,'post',`/recommendations/${ra.id}/entity`,{...replace,entityId:original.body.entity.id},key)).status).toBe(409);
 const after=(await request(composed.app).get(`/api/explorers/v1/recommendations/${ra.id}/editable`).set('cookie',a.cookie)).body.recommendation;expect(after).toMatchObject({note,bookContext,displayOverrides:before.displayOverrides,effectiveBookDetails:{authors:['Mine'],subtitle:null}});expect(Number(after.categoryRevision)).toBe(Number(before.categoryRevision)+1);expect(after.pin).toEqual(before.pin);expect(after.collectionIds).toEqual(before.collectionIds);expect(after.mediaIds).toEqual(before.mediaIds);
 expect((await pool.query('SELECT collection_id FROM collection_items WHERE recommendation_id=$1',[ra.id])).rows).toEqual([{collection_id:la.id}]);
 expect((await command(a,'post',`/recommendations/${ra.id}/entity`,{expectedRevision:3,entityId:target.body.entity.id})).status).toBe(422);
 expect((await command(b,'post',`/recommendations/${ra.id}/entity`,{expectedRevision:3,entityId:original.body.entity.id})).status).toBe(404);
 expect((await command(a,'post',`/recommendations/${ra.id}/entity`,{expectedRevision:2,entityId:original.body.entity.id})).status).toBe(409);
 expect((await command(a,'post',`/recommendations/${ra.id}/entity`,{expectedRevision:3,entityId:await entity('movie')})).status).toBe(422);
 expect((await request(composed.app).get(`/api/explorers/v1/recommendations/${rb.id}/editable`).set('cookie',b.cookie)).body.recommendation.effectiveBookDetails.authors).toEqual(['Original author']);
 expect((await pool.query('SELECT entity_id FROM recommendations WHERE id=$1',[rb.id])).rows[0].entity_id).toBe(original.body.entity.id);
});
it('authorizes recommendation raw image bytes through every live ancestor before storage on HEAD/range/conditional',async()=>{
 const a=await persona(),l=await list(a),r=await recommendation(a,l,await entity());
 for(const [data,mime] of [[Buffer.concat([png,Buffer.alloc(5*1024*1024+1)]),'image/png'],[Buffer.from('0000ftypisom'),'video/mp4'],[png,'image/jpeg']] as const){const count=bytes.size;const invalid=await request(composed.app).post('/api/explorers/v1/media').set('cookie',a.cookie).set('origin',config.baseURL).set('content-type',mime).set('x-media-purpose','recommendation').set('x-file-name','snapshot.png').send(data);expect(invalid.status).toBe(422);expect(bytes.size).toBe(count);}
 const uploaded=await request(composed.app).post('/api/explorers/v1/media').set('cookie',a.cookie).set('origin',config.baseURL).set('content-type','image/png').set('x-media-purpose','recommendation').set('x-file-name','snapshot.png').send(png);expect(uploaded.status).toBe(201);const media=uploaded.body.media;
 expect((await command(a,'patch',`/recommendations/${r.id}`,{expectedRevision:1,mediaIds:[media.id],publicationState:'published'})).status).toBe(200);
 await pool.query("UPDATE creator_accounts SET onboarding_status='complete',public_profile=true,handle=$2,display_name='Books',account_type='Creator' WHERE id=$1",[a.accountId,`b${randomUUID().replaceAll('-','').slice(0,12)}`]);await pool.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='books'",[a.accountId]);await pool.query("UPDATE collections SET visibility='public',publication_state='published' WHERE id=$1",[l.id]);
 const publicBytes=await request(composed.app).get(media.url);expect(publicBytes.status).toBe(200);const etag=publicBytes.headers.etag;
 const gates=[['creator_accounts',a.accountId,"public_profile=false","public_profile=true"],['creator_accounts',a.accountId,"onboarding_status='incomplete'","onboarding_status='complete'"],['collections',l.id,"visibility='private'","visibility='public'"],['collections',l.id,"publication_state='draft'","publication_state='published'"],['collections',l.id,"archived_at=now()","archived_at=NULL"],['recommendations',r.id,"publication_state='draft'","publication_state='published'"],['recommendations',r.id,"archived_at=now()","archived_at=NULL"]];
 for(const [table,id,hidden,visible] of gates){await pool.query(`UPDATE ${table} SET ${hidden} WHERE id=$1`,[id]);const start=storageReads;for(const mode of ['head','range','etag']){const q=mode==='head'?request(composed.app).head(media.url):request(composed.app).get(media.url);if(mode==='range')q.set('range','bytes=0-3');if(mode==='etag')q.set('if-none-match',etag);expect((await q).status).toBe(404);}expect(storageReads).toBe(start);await pool.query(`UPDATE ${table} SET ${visible} WHERE id=$1`,[id]);}
 await pool.query("UPDATE account_category_settings SET is_public=false WHERE account_id=$1 AND category='books'",[a.accountId]);const reads=storageReads;expect((await request(composed.app).head(media.url)).status).toBe(404);expect(storageReads).toBe(reads);await pool.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='books'",[a.accountId]);
 expect((await request(composed.app).get(media.url).set('range','bytes=0-3')).status).toBe(206);expect((await request(composed.app).get(media.url).set('if-none-match',etag)).status).toBe(304);
 expect((await request(composed.app).delete(`/api/explorers/v1/media/${media.id}`).set('cookie',a.cookie).set('origin',config.baseURL)).status).toBe(404);
});
it('enforces companions kind/category ownership and rollback on direct SQL',async()=>{
 const a=await persona(),l=await list(a,'movies'),r=await recommendation(a,l,await entity('movie'));
 await expect(pool.query('INSERT INTO book_entity_details(entity_id) VALUES($1)',[r.entityId])).rejects.toMatchObject({code:'23514'});
 await expect(pool.query('INSERT INTO book_recommendation_context(recommendation_id,account_id) VALUES($1,$2)',[r.id,a.accountId])).rejects.toMatchObject({code:'23514'});
 const e=await entity();await pool.query('INSERT INTO book_entity_details(entity_id) VALUES($1)',[e]);await expect(pool.query("UPDATE entities SET kind='movie' WHERE id=$1",[e])).rejects.toMatchObject({code:'23514'});
});
it('rolls back provider facts and replacement identity/revisions on receipt failure',async()=>{
 const a=await persona(),l=await list(a),r=await recommendation(a,l,await entity()),next=await entity();
 const before=(await pool.query('SELECT revision::text FROM account_category_content_state WHERE account_id=$1 AND category=\'books\'',[a.accountId])).rows[0].revision;
 await pool.query(`CREATE FUNCTION test_book_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.account_id='${a.accountId}' AND NEW.operation IN ('resolveBookEntity','replaceRecommendationEntity') THEN RAISE EXCEPTION 'injected receipt failure'; END IF; RETURN NEW; END $$`);await pool.query('CREATE TRIGGER test_book_receipt_failure BEFORE INSERT ON application_command_receipts FOR EACH ROW EXECUTE FUNCTION test_book_receipt_failure()');
 try{
  expect((await command(a,'post','/entities/resolve',{kind:'provider',category:'books',provider:'google_books',externalKind:'volume',externalId:'rollback-volume'})).status).toBe(503);
  expect((await pool.query("SELECT count(*)::int n FROM entity_identifiers WHERE provider='google_books' AND external_id='rollback-volume'")).rows[0].n).toBe(0);
  expect((await command(a,'post',`/recommendations/${r.id}/entity`,{expectedRevision:1,entityId:next})).status).toBe(503);
  expect((await pool.query('SELECT entity_id,revision::text FROM recommendations WHERE id=$1',[r.id])).rows[0]).toEqual({entity_id:r.entityId,revision:'1'});
  expect((await pool.query("SELECT revision::text FROM account_category_content_state WHERE account_id=$1 AND category='books'",[a.accountId])).rows[0].revision).toBe(before);
 }finally{await pool.query('DROP TRIGGER test_book_receipt_failure ON application_command_receipts');await pool.query('DROP FUNCTION test_book_receipt_failure()');}
});
it('exposes effective Book details and explicit buy context publicly without raw overrides or catalog provenance',async()=>{
 const a=await persona(),l=await list(a),e=(await command(a,'post','/entities/resolve',{kind:'manual',category:'books',details:{title:'Book',authors:['Canonical']}})).body.entity,r=await recommendation(a,l,e.id);
 const handle=`b${randomUUID().replaceAll('-','').slice(0,12)}`;await pool.query("UPDATE creator_accounts SET onboarding_status='complete',public_profile=true,handle=$2,display_name='Books',account_type='Creator' WHERE id=$1",[a.accountId,handle]);await pool.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='books'",[a.accountId]);await pool.query("UPDATE collections SET visibility='public',publication_state='published' WHERE id=$1",[l.id]);
 expect((await command(a,'patch',`/recommendations/${r.id}`,{expectedRevision:1,publicationState:'published',displayOverrides:{authors:['Mine']},bookContext:{buyLinks:[{name:'Shop',url:'https://shop.example/book'}]}})).status).toBe(200);
 const page=await request(composed.app).get(`/api/explorers/v1/public/profiles/${handle}/collections/books/${l.slug}/recommendations/${r.id}`);expect(page.status).toBe(200);expect(page.body.recommendation.bookDetails.authors).toEqual(['Mine']);expect(page.body.recommendation.bookContext.buyLinks).toHaveLength(1);expect(page.body.recommendation).not.toHaveProperty('displayOverrides');expect(page.body.recommendation).not.toHaveProperty('provenance');
 await pool.query('UPDATE book_recommendation_context SET buy_links=$2 WHERE recommendation_id=$1',[r.id,JSON.stringify([{name:'Unsafe',url:'javascript:bad'}])]);expect((await request(composed.app).get(`/api/explorers/v1/recommendations/${r.id}/editable`).set('cookie',a.cookie)).status).toBe(503);expect((await request(composed.app).get(`/api/explorers/v1/public/profiles/${handle}/collections/books/${l.slug}/recommendations/${r.id}`)).status).not.toBe(200);
});
it('permits minimal runtime facts insert/read and context DML while denying shared facts update/delete',async()=>{
 const a=await persona(),l=await list(a),r=await recommendation(a,l,await entity());const client=await pool.connect();
 try{
  await client.query('BEGIN');await client.query('SET LOCAL ROLE music_runtime');await client.query("INSERT INTO book_entity_details(entity_id,authors) VALUES($1,ARRAY['Runtime author'])",[r.entityId]);expect((await client.query('SELECT authors FROM book_entity_details WHERE entity_id=$1',[r.entityId])).rows[0].authors).toEqual(['Runtime author']);await client.query('INSERT INTO book_recommendation_context(recommendation_id,account_id) VALUES($1,$2)',[r.id,a.accountId]);await client.query("UPDATE book_recommendation_context SET buy_links='[]' WHERE recommendation_id=$1",[r.id]);await client.query('DELETE FROM book_recommendation_context WHERE recommendation_id=$1',[r.id]);await client.query('COMMIT');
  for(const sql of ['UPDATE book_entity_details SET authors=authors WHERE entity_id=$1','DELETE FROM book_entity_details WHERE entity_id=$1']){await client.query('BEGIN');await client.query('SET LOCAL ROLE music_runtime');await expect(client.query(sql,[r.entityId])).rejects.toMatchObject({code:'42501'});await client.query('ROLLBACK');}
 }finally{await client.query('ROLLBACK');client.release();}
});
