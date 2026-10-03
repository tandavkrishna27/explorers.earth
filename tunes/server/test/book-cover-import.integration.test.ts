import {BookCoverFetcher} from '../services/bookCoverFetch';
import {createHash} from 'node:crypto';
import {provisionMusicRuntimeLogin} from '../db/music-runtime-role';
let fetchCount=0;let failThumbnail=false;let duringFetch:(()=>Promise<void>)|undefined;let failDelete=false;
const coverFetcher=new BookCoverFetcher({mode:'deterministic-fixture',resolve:async()=>[{address:'142.250.1.1',family:4}],connect:async(target)=>{fetchCount++;const hook=duringFetch;duringFetch=undefined;if(hook)await hook();if(failThumbnail&&target.url.searchParams.get('size')==='thumb')throw Error('fixture unavailable');return {status:200,mimeType:'image/png',body:(async function*(){yield png;})()};}});
import {BookCatalog} from '../services/bookCatalog';
import {MediaService} from '../application/media';
import type {Actor} from '../application/actor';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64');
const bytes=new Map<string,Buffer>();let storageReads=0;let storagePuts=0;
const storage={environment:'local' as const,put:async(k:string,b:Buffer)=>{storagePuts++;bytes.set(k,b);},get:async(k:string)=>{storageReads++;return bytes.get(k)!;},delete:async(k:string)=>{if(failDelete)throw Error('fixture delete unavailable');bytes.delete(k);}};
let providerTitle='Provider title';const providerFetch=vi.fn(async(url:URL)=>new Response(JSON.stringify(url.pathname.endsWith('/volumes')?{items:[{id:'fixture-v1',volumeInfo:{title:providerTitle,authors:['Writer'],publishedDate:'2024-03',industryIdentifiers:[{type:'ISBN_10',identifier:'123456789X'}],description:'<p>Book summary</p>'}}],totalItems:1}:{id:url.pathname.split('/').at(-1),volumeInfo:{title:providerTitle,authors:['Writer'],publishedDate:'2024-03',industryIdentifiers:[{type:'ISBN_10',identifier:'123456789X'}],description:'<p>Book summary</p>'}})));
const books=new BookCatalog({apiKey:'deterministic-only',secret:'cursor-test-secret',fetch:providerFetch as any});import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createCanonicalApp } from '../auth/canonicalApp';
import { resolveExplorersAuthConfig } from '../auth/betterAuth';

const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51474',EXPLORERS_AUTH_SECRET:'integration-secret-'.repeat(4),GOOGLE_CLIENT_ID:'fixture-google-id',GOOGLE_CLIENT_SECRET:'fixture-google-secret'});
let pool:pg.Pool,runtimePool:pg.Pool, composed:ReturnType<typeof createCanonicalApp>;
const runtimeRole='book_cover_fixture_runtime',runtimeOwnership=`book-cover-fixture:${randomUUID()}`;
beforeAll(async()=>{pool=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:4});const password=createHash('sha256').update(randomUUID()).digest('base64url');await provisionMusicRuntimeLogin(pool,{loginRole:runtimeRole,password},{ownershipComment:runtimeOwnership});const target=new URL(process.env.DATABASE_URL_TEST!);target.username=runtimeRole;target.password=password;runtimePool=new pg.Pool({connectionString:target.toString(),max:1});runtimePool.on('error',()=>undefined);composed=createCanonicalApp(runtimePool,config,{bookCatalog:books,mediaStorage:storage,bookCoverFetcher:coverFetcher});});
afterAll(async()=>{await runtimePool?.end();if(pool){const role=(await pool.query("SELECT shobj_description(oid,'pg_authid') ownership FROM pg_roles WHERE rolname=$1",[runtimeRole])).rows[0];if(role?.ownership===runtimeOwnership)await pool.query('DROP ROLE book_cover_fixture_runtime');await pool.end();}});
it('provides a real shared-connection upload seam for bounded importer pools',async()=>{
 const service=new MediaService(runtimePool,storage);expect(service.usingConnection).toBeTypeOf('function');
 const a=await persona(),actor:Actor={userId:a.userId,accountId:a.accountId,role:'owner',credential:{kind:'web-session',sessionId:a.sessionId,sessionVersion:1}},db=await runtimePool.connect();
 try{const before=runtimePool.totalCount;const media=await service.usingConnection(db).createMedia(actor,{purpose:'recommendation',filename:'shared.png',mimeType:'image/png',bytes:png,length:png.length},{requestId:randomUUID()});expect(media.size).toBe(png.length);expect(runtimePool.totalCount).toBe(before);}finally{db.release();}
});
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

async function fixtureBook(owner:{cookie:string},same=false){
 const id=await entity();await pool.query("INSERT INTO book_entity_details(entity_id,cover_url,cover_large_url) VALUES($1,$2,$3)",[id,'https://books.google.com/books/content?size=thumb',same?'https://books.google.com/books/content?size=thumb':'https://books.google.com/books/content?size=cover']);
 await pool.query("INSERT INTO entity_identifiers(entity_id,provider,external_kind,external_id,fetched_at,source_url) VALUES($1,'google_books','volume',$2,now(),'https://www.googleapis.com/books/v1/volumes/'||$2)",[id,randomUUID()]);const l=await list(owner);return {l,r:await recommendation(owner,l,id)};
}
it('copies both canonical cover slots, replays receipt and denies caller URLs and cross-owner imports',async()=>{
 const a=await persona(),b=await persona(),{r}=await fixtureBook(a),key=randomUUID(),before=fetchCount;
 const copied=await command(a,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:1},key);expect(copied.status).toBe(200);expect(copied.body.coverImport.slots.cover.status).toBe('copied');expect(copied.body.coverImport.slots.thumbnail.status).toBe('copied');expect(fetchCount).toBe(before+2);
 const replay=await command(a,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:1},key);expect(replay.body).toEqual(copied.body);expect(fetchCount).toBe(before+2);
 expect((await command(a,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:2},key)).status).toBe(409);
 expect((await command(b,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:2})).status).toBe(404);
 expect((await command(a,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:2,url:'https://books.google.com/spoof'})).status).toBe(422);
 const detail=await request(composed.app).get(`/api/explorers/v1/recommendations/${r.id}/editable`).set('cookie',a.cookie);expect(detail.status).toBe(200);expect(detail.body.recommendation.bookCovers.cover.id).toBe(copied.body.coverImport.slots.cover.media.id);expect(detail.body.recommendation.revision).toBe(2);
 await expect(pool.query("UPDATE media_assets SET status='pending_delete' WHERE id=$1",[copied.body.coverImport.slots.cover.media.id])).rejects.toMatchObject({code:'23514'});
 await expect(pool.query("UPDATE media_assets SET mime_type='video/mp4' WHERE id=$1",[copied.body.coverImport.slots.cover.media.id])).rejects.toMatchObject({code:'23514'});
});
it('deduplicates equal provider URLs while retaining both slots and references',async()=>{
 const a=await persona(),{r}=await fixtureBook(a,true),before=fetchCount;const result=await command(a,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:1});expect(result.status).toBe(200);expect(fetchCount).toBe(before+1);expect(result.body.coverImport.slots.cover.media.id).toBe(result.body.coverImport.slots.thumbnail.media.id);
 expect((await request(composed.app).delete(`/api/explorers/v1/media/${result.body.coverImport.slots.cover.media.id}`).set('cookie',a.cookie).set('origin',config.baseURL)).status).toBe(404);
});
it('retains successful cover when thumbnail fails and preserves copied cover through entity replacement',async()=>{
 const a=await persona(),{r}=await fixtureBook(a);failThumbnail=true;let result;try{result=await command(a,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:1});}finally{failThumbnail=false;}expect(result.status).toBe(200);expect(result.body.coverImport.slots.thumbnail.status).toBe('fallback');expect(result.body.coverImport.slots.cover.status).toBe('copied');
 const next=await entity();expect((await command(a,'post',`/recommendations/${r.id}/entity`,{expectedRevision:2,entityId:next})).status).toBe(200);const detail=await request(composed.app).get(`/api/explorers/v1/recommendations/${r.id}/editable`).set('cookie',a.cookie);expect(detail.status).toBe(200);expect(detail.body.recommendation.bookCovers.cover.id).toBe(result.body.coverImport.slots.cover.media.id);
});
it('revalidates after fetch, preserves prior slots and durably retries unattached cleanup',async()=>{
 const a=await persona(),{r}=await fixtureBook(a);const first=await command(a,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:1});expect(first.status).toBe(200);
 duringFetch=async()=>{await pool.query('UPDATE recommendations SET revision=revision+1 WHERE id=$1',[r.id]);};failDelete=true;let stale;try{stale=await command(a,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:2});}finally{failDelete=false;duringFetch=undefined;}
 expect(stale.status).toBe(409);const pending=(await pool.query("SELECT id FROM media_assets WHERE account_id=$1 AND status='pending_delete'",[a.accountId])).rows;expect(pending).toHaveLength(2);
 expect((await pool.query('SELECT media_id FROM recommendation_book_covers WHERE recommendation_id=$1 ORDER BY slot',[r.id])).rows.map(v=>v.media_id)).toEqual([first.body.coverImport.slots.cover.media.id,first.body.coverImport.slots.thumbnail.media.id]);
 await new MediaService(pool,storage).retryPendingDeletes(a.accountId);for(const row of pending)expect((await pool.query('SELECT status FROM media_assets WHERE id=$1',[row.id])).rows[0].status).toBe('deleted');
});
it('rolls relation, recommendation revision and receipt back together on completion failure',async()=>{
 const a=await persona(),{r}=await fixtureBook(a);
 await pool.query(`CREATE FUNCTION test_cover_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.account_id='${a.accountId}' AND NEW.operation='importBookCovers' AND NEW.status='completed' THEN RAISE EXCEPTION 'fixture receipt failure'; END IF;RETURN NEW;END $$`);await pool.query('CREATE TRIGGER test_cover_receipt_failure BEFORE UPDATE ON application_command_receipts FOR EACH ROW EXECUTE FUNCTION test_cover_receipt_failure()');
 try{expect((await command(a,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:1})).status).toBe(503);expect((await pool.query('SELECT revision FROM recommendations WHERE id=$1',[r.id])).rows[0].revision).toBe('1');expect((await pool.query('SELECT 1 FROM recommendation_book_covers WHERE recommendation_id=$1',[r.id])).rowCount).toBe(0);expect((await pool.query("SELECT status FROM media_assets WHERE account_id=$1",[a.accountId])).rows.every(v=>v.status==='deleted')).toBe(true);}finally{await pool.query('DROP TRIGGER test_cover_receipt_failure ON application_command_receipts');await pool.query('DROP FUNCTION test_cover_receipt_failure()');}
});
it('public bytes and public controlled cover DTO require each ancestor before storage, HEAD/range/conditional',async()=>{
 const a=await persona(),{r,l}=await fixtureBook(a);const copied=await command(a,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:1});expect(copied.status).toBe(200);const media=copied.body.coverImport.slots.cover.media;
 const username=`b${randomUUID().replaceAll('-','').slice(0,12)}`;await pool.query("UPDATE creator_accounts SET public_profile=true,onboarding_status='complete',handle=$2,display_name='Books',account_type='Creator' WHERE id=$1",[a.accountId,username]);await pool.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='books'",[a.accountId]);await pool.query("UPDATE collections SET visibility='public',publication_state='published' WHERE id=$1",[l.id]);await pool.query("UPDATE recommendations SET publication_state='published' WHERE id=$1",[r.id]);
 const publicPath=`/api/explorers/v1/public/profiles/${username}/collections/books/${l.slug}/recommendations/${r.id}`;const detail=await request(composed.app).get(publicPath);expect(detail.status).toBe(200);expect(detail.body.recommendation.bookCovers.cover).toEqual(media);expect((await request(composed.app).get(media.url)).status).toBe(200);
 for(const [hide,reveal] of [
  ["UPDATE creator_accounts SET public_profile=false WHERE id=$1","UPDATE creator_accounts SET public_profile=true WHERE id=$1"],
  ["UPDATE account_category_settings SET is_public=false WHERE account_id=$1 AND category='books'","UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='books'"],
  ["UPDATE collections SET visibility='private' WHERE account_id=$1","UPDATE collections SET visibility='public' WHERE account_id=$1"],
  ["UPDATE recommendations SET publication_state='draft' WHERE account_id=$1","UPDATE recommendations SET publication_state='published' WHERE account_id=$1"]]){
  await pool.query(hide,[a.accountId]);const reads=storageReads;expect((await request(composed.app).get(publicPath)).status).toBe(404);expect((await request(composed.app).head(media.url)).status).toBe(404);expect((await request(composed.app).get(media.url).set('range','bytes=0-3')).status).toBe(404);expect((await request(composed.app).get(media.url).set('if-none-match','*')).status).toBe(404);expect(storageReads).toBe(reads);await pool.query(reveal,[a.accountId]);expect((await request(composed.app).get(publicPath)).status).toBe(200);
 }
});
it('enforces cover image/owner/category relations and permits runtime attachment without guard execution grants',async()=>{
 const a=await persona(),b=await persona(),{r}=await fixtureBook(a);const copied=await command(a,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:1});const mediaId=copied.body.coverImport.slots.cover.media.id;
 await expect(pool.query('UPDATE recommendation_book_covers SET account_id=$2 WHERE recommendation_id=$1',[r.id,b.accountId])).rejects.toMatchObject({code:'23503'});
 await expect(pool.query("UPDATE media_assets SET purpose='collection' WHERE id=$1",[mediaId])).rejects.toMatchObject({code:'23514'});await expect(pool.query('UPDATE media_assets SET byte_size=5242881 WHERE id=$1',[mediaId])).rejects.toMatchObject({code:'23514'});
 const db=await pool.connect();try{await db.query('BEGIN');await db.query('SET LOCAL ROLE music_runtime');expect((await db.query("SELECT has_function_privilege(current_user,'guard_recommendation_book_cover()','EXECUTE') allowed")).rows[0].allowed).toBe(false);await db.query("DELETE FROM recommendation_book_covers WHERE recommendation_id=$1 AND slot='cover'",[r.id]);await db.query("INSERT INTO recommendation_book_covers(recommendation_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)",[r.id,a.accountId,mediaId]);await db.query('COMMIT');}finally{await db.query('ROLLBACK');db.release();}
});
it('resumes durable copied-slot progress without another remote fetch or object put',async()=>{
 const a=await persona(),{r}=await fixtureBook(a,true),key=randomUUID();const actor:Actor={userId:a.userId,accountId:a.accountId,role:'owner',credential:{kind:'web-session',sessionId:a.sessionId,sessionVersion:1}};
 const media=await new MediaService(pool,storage).createMedia(actor,{purpose:'recommendation',filename:'saved.png',mimeType:'image/png',bytes:png,length:png.length},{requestId:randomUUID()});
 const hash=(v:string)=>createHash('sha256').update(v).digest();await pool.query("INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,status,response) VALUES($1,'importBookCovers',$2,$3,'pending',$4)",[a.accountId,hash(key),hash(JSON.stringify([r.id,1])),JSON.stringify({entityId:r.entityId,coverUrl:'https://books.google.com/books/content?size=thumb',thumbnailUrl:'https://books.google.com/books/content?size=thumb',slots:{cover:{status:'copied',media}}})]);const before=fetchCount,size=bytes.size;
 const result=await command(a,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:1},key);expect(result.status).toBe(200);expect(fetchCount).toBe(before);expect(bytes.size).toBe(size);expect(result.body.coverImport.slots.thumbnail.media.id).toBe(media.id);
});
it('records both optional fallback slots once and rejects manual identity or stale observation before fetch',async()=>{
 const a=await persona(),{r}=await fixtureBook(a,true),key=randomUUID(),before=fetchCount;failThumbnail=true;let result;try{result=await command(a,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:1},key);}finally{failThumbnail=false;}expect(result.status).toBe(200);expect(result.body.coverImport.slots).toEqual({cover:{status:'fallback'},thumbnail:{status:'fallback'}});expect(fetchCount).toBe(before+1);expect((await command(a,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:1},key)).body).toEqual(result.body);expect(fetchCount).toBe(before+1);expect((await command(a,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:1})).status).toBe(409);expect(fetchCount).toBe(before+1);
 const manual=await recommendation(a,await list(a),await entity());expect((await command(a,'post',`/recommendations/${manual.id}/book-covers`,{expectedRevision:1})).status).toBe(404);expect(fetchCount).toBe(before+1);
});
it('concurrent receipt retries cannot consume every runtime pool connection while the writer uploads',async()=>{
 const a=await persona(),{r}=await fixtureBook(a),key=randomUUID(),before=fetchCount;
 duringFetch=async()=>{await new Promise(resolve=>setTimeout(resolve,100));};
 // Bound a deliberately detected pool-starvation regression and release only
 // this fixture login's waiting import locks, never another test/authority.
 const rescue=setTimeout(()=>void pool.query("SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE usename='book_cover_fixture_runtime' AND wait_event='advisory' AND query LIKE '%pg_advisory_lock(44035%'"),500);
 try{const results=await Promise.all(Array.from({length:8},()=>command(a,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:1},key).then(v=>v)));expect(results.every(v=>v.status===200||v.status===409)).toBe(true);expect(results.some(v=>v.status===200)).toBe(true);expect(fetchCount).toBe(before+2);}finally{clearTimeout(rescue);duringFetch=undefined;}
});
it('distinct concurrent imports and duplicate busy retries remain bounded with a saturated six-connection runtime pool',async()=>{
 const a=await persona(),fixtures=[];for(let n=0;n<6;n++)fixtures.push(await fixtureBook(a));
 const bounded=new pg.Pool({connectionString:runtimePool.options.connectionString,max:6}),api=createCanonicalApp(bounded,config,{bookCatalog:books,mediaStorage:storage,bookCoverFetcher:coverFetcher});
 const send=(r:any,key:string)=>request(api.app).post(`/api/explorers/v1/recommendations/${r.id}/book-covers`).set('cookie',a.cookie).set('origin',config.baseURL).set('Idempotency-Key',key).send({expectedRevision:1});
 const rescue=setTimeout(()=>void pool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='book_cover_fixture_runtime' AND state='idle'"),3000);
 try{let before=fetchCount;const results=await Promise.all(fixtures.map(({r})=>send(r,randomUUID())));expect(results.map(v=>v.status)).toEqual(Array(6).fill(200));expect(fetchCount).toBe(before+12);
  const {r}=await fixtureBook(a),key=randomUUID();before=fetchCount;duringFetch=async()=>{await new Promise(resolve=>setTimeout(resolve,100));};const retries=await Promise.all(Array.from({length:8},()=>send(r,key)));expect(retries.some(v=>v.status===409)).toBe(true);expect(retries.some(v=>v.status===200)).toBe(true);expect(retries.every(v=>v.status===200||v.status===409)).toBe(true);expect(fetchCount).toBe(before+2);const replay=await send(r,key);expect(replay.status).toBe(200);expect(replay.body).toEqual(retries.find(v=>v.status===200)!.body);expect(fetchCount).toBe(before+2);
 }finally{clearTimeout(rescue);duringFetch=undefined;await bounded.end();}
});
it('never resurrects a retired or expired pending receipt after remote work',async()=>{
 const a=await persona(),{r}=await fixtureBook(a),key=randomUUID();duringFetch=async()=>{await pool.query("UPDATE application_command_receipts SET status='retired',response=NULL,replay_until=clock_timestamp()-interval '1 second' WHERE account_id=$1 AND operation='importBookCovers'",[a.accountId]);};
 const result=await command(a,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:1},key);expect(result.status).toBe(409);expect((await pool.query('SELECT 1 FROM recommendation_book_covers WHERE recommendation_id=$1',[r.id])).rowCount).toBe(0);expect((await pool.query('SELECT revision FROM recommendations WHERE id=$1',[r.id])).rows[0].revision).toBe('1');expect((await pool.query("SELECT status FROM application_command_receipts WHERE account_id=$1 AND operation='importBookCovers'",[a.accountId])).rows[0].status).toBe('retired');expect((await pool.query('SELECT status FROM media_assets WHERE account_id=$1',[a.accountId])).rows.every(v=>v.status==='deleted')).toBe(true);
});
import {BookCoverImportService} from '../application/bookCoverImport';
async function loseCommittedConnection(stage:'ready'|'completed'){
 const a=await persona(),{r}=await fixtureBook(a,true),key=randomUUID(),beforeFetch=fetchCount,beforePut=storagePuts;
 let fired=false;
 const faultPool={query:runtimePool.query.bind(runtimePool),connect:async()=>{
  const db=await runtimePool.connect();db.on('error',()=>undefined);let armed=false,dead=false;
  return {query:async(sql:any,args?:any)=>{
   if(dead)throw Error('fixture connection lost after commit');
   const result=await db.query(sql,args);
   if(typeof sql==='string'&&((stage==='ready'&&sql.includes("SET status='ready'"))||(stage==='completed'&&sql.includes("SET status='completed'"))))armed=true;
   if(sql==='COMMIT'&&armed&&!fired){fired=true;dead=true;await pool.query('SELECT pg_terminate_backend($1)',[db.processID]);throw Error('fixture committed acknowledgement lost');}
   return result;
  },release:()=>db.release(true)};
 }} as unknown as pg.Pool;
 const actor:Actor={userId:a.userId,accountId:a.accountId,role:'owner',credential:{kind:'web-session',sessionId:a.sessionId,sessionVersion:1}},context={requestId:randomUUID(),idempotencyKey:key};
 await expect(new BookCoverImportService(faultPool,new MediaService(faultPool,storage),coverFetcher).import(actor,r.id,{expectedRevision:1},context)).rejects.toThrow();expect(fired).toBe(true);
 const receipt=(await pool.query("SELECT status,response FROM application_command_receipts WHERE account_id=$1 AND operation='importBookCovers'",[a.accountId])).rows[0];
 expect(receipt.status).toBe(stage==='ready'?'pending':'completed');expect(receipt.response.slots.cover.status).toBe('copied');
 const resumed=await new BookCoverImportService(runtimePool,new MediaService(runtimePool,storage),coverFetcher).import(actor,r.id,{expectedRevision:1},context);
 expect(resumed.slots.cover.status).toBe('copied');expect(resumed.slots.thumbnail.media.id).toBe(resumed.slots.cover.media.id);
 expect(fetchCount).toBe(beforeFetch+1);expect(storagePuts).toBe(beforePut+1);
 const assets=(await pool.query('SELECT id,status FROM media_assets WHERE account_id=$1',[a.accountId])).rows;expect(assets).toEqual([{id:resumed.slots.cover.media.id,status:'ready'}]);
 expect([...bytes.keys()].filter(k=>k.includes(a.accountId))).toHaveLength(1);expect((await pool.query('SELECT revision FROM recommendations WHERE id=$1',[r.id])).rows[0].revision).toBe('2');
 const replay=await new BookCoverImportService(runtimePool,new MediaService(runtimePool,storage),coverFetcher).import(actor,r.id,{expectedRevision:1},context);expect(replay).toEqual(resumed);expect(storagePuts).toBe(beforePut+1);
}
it('resumes after actual ready commit and lost connection without an extra fetch, asset or object put',async()=>{await loseCommittedConnection('ready');});
it('replays final committed attachment after its response is lost without cleanup or duplicate work',async()=>{await loseCommittedConnection('completed');});
