import {runAccountLifecycleMaintenance} from '../application/accountLifecycleMaintenance';
import {editableOwnerRecommendationSchema} from '../../shared/explorersOwnerContentContract';
import {readMovieEntity} from '../repositories/movieCatalogRepository';
import {extractMovieImageSlots} from '../services/movieImageFetch';
import {PublicProfileService} from '../publicProfile/publicProfileService';
import {PostgresPublicProfileGateway} from '../publicProfile/postgresPublicProfileGateway';
import {MovieMediaImportService} from '../application/movieMediaImport';
import {MovieImageFetcher} from '../services/movieImageFetch';
import {MediaService} from '../application/media';
import type {Actor} from '../application/actor';
import type {ObjectStorage} from '../services/objectStorage';
import {MediaRepository} from '../repositories/mediaRepository';
import {PublicContentService} from '../application/publicContent';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import pg from 'pg';import request from 'supertest';import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {createCanonicalApp} from '../auth/canonicalApp';import {resolveExplorersAuthConfig} from '../auth/betterAuth';
import {MovieCatalog} from '../services/movieCatalog';import {authorizeOperation} from '../application/authorization';
const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51474',EXPLORERS_AUTH_SECRET:'integration-secret-'.repeat(4),GOOGLE_CLIENT_ID:'fixture-google-id',GOOGLE_CLIENT_SECRET:'fixture-google-secret'});
let pool:pg.Pool,composed:ReturnType<typeof createCanonicalApp>;
const upstream=vi.fn(async(url:URL)=>{if(url.pathname.includes('/search/'))return new Response(JSON.stringify({page:Number(url.searchParams.get('page')),total_pages:1,total_results:1,results:[{id:42,title:'Fixture movie',name:'Fixture show',poster_path:null,release_date:null,first_air_date:null}]}));const kind=url.pathname.includes('/tv/')?'tv':'movie';const id=Number(url.pathname.split('/')[3]);return new Response(JSON.stringify(url.pathname.endsWith('/watch/providers')?{id,results:{US:{link:'https://www.themoviedb.org/movie/42/watch',flatrate:[{provider_id:id===43?2:1,provider_name:'Fixture',logo_path:null,display_priority:0}]}}}:{id,title:'Fixture movie',name:'Fixture show',original_title:'Original',original_name:'Original',poster_path:null,backdrop_path:null,release_date:null,first_air_date:null,genres:[],runtime:0,episode_run_time:[0],vote_average:0,overview:null,number_of_seasons:kind==='tv'?0:undefined,credits:{cast:[],crew:[]}}));});
beforeAll(()=>{pool=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:4});const movies=new MovieCatalog({accessToken:'deterministic-only',fetch:upstream as any,authorize:a=>authorizeOperation(pool,a,'entities:resolve',a.accountId)});composed=createCanonicalApp(pool,config,{movieCatalog:movies});});
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
async function list(owner:{cookie:string},category='movies') {
  const result=await command(owner,'post','/collections',{category,title:'Reading',slug:`reading-${randomUUID()}`,visibility:'private',publicationState:'draft'});expect(result.status).toBe(201);return result.body.collection;
}
async function entity(kind='book') {return (await pool.query("INSERT INTO entities(kind,title,origin) VALUES($1,'Shared title','manual') RETURNING id",[kind])).rows[0].id;}
async function recommendation(owner:{cookie:string},collection:any,entityId:string,revision=1) {
  const result=await command(owner,'post','/recommendations',{category:collection.category,entityId,collectionId:collection.id,expectedCollectionRevision:revision,userRating:8,publicationState:'draft'});expect(result.status).toBe(201);return result.body.recommendation;
}



async function fixture(){
 const a=await persona(),c=await list(a);
 const entityId=(await pool.query("INSERT INTO entities(kind,title,origin) VALUES('movie','Provider media SQL','provider') RETURNING id")).rows[0].id;
 const externalId=String(Math.floor(Math.random()*1000000000)+1000000);
 await pool.query("INSERT INTO entity_identifiers(entity_id,provider,external_kind,external_id,fetched_at,source_url) VALUES($1,'tmdb','movie',$2,to_timestamp(1700000000),$3)",[entityId,externalId,`https://api.themoviedb.org/3/movie/${externalId}`]);
 await pool.query("INSERT INTO movie_entity_details(entity_id,media_type,poster_url,cast_details) VALUES($1,'movie','https://image.tmdb.org/t/p/w780/poster.jpg',$2)",[entityId,JSON.stringify([{personId:1,creditId:'same',name:'Actor',character:'',profileUrl:null,order:0},{personId:1,creditId:'same',name:'Actor',character:'',profileUrl:'https://image.tmdb.org/t/p/w185/actor.jpg',order:1}])]);
 const r=await recommendation(a,c,entityId);
 const mediaId=(await pool.query("INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,content_sha256,ready_at) VALUES($1,'recommendation','ready','image/png',8,$2,now()) RETURNING id",[a.accountId,Buffer.alloc(32)])).rows[0].id;
 return {a,c,r,entityId,externalId,mediaId};
}
async function attach(f:Awaited<ReturnType<typeof fixture>>,slotIndex=0,overrides:Record<string,unknown>={}){
 const v={recommendationId:f.r.id,accountId:f.a.accountId,sourceEntityId:f.entityId,externalKind:'movie',externalId:f.externalId,fetchedAt:1700000000000,mappingVersion:1,slot:slotIndex===0?'poster':'cast',ordinal:slotIndex===0?null:slotIndex-2,personId:slotIndex===0?null:1,creditId:slotIndex===0?null:'same',mediaId:f.mediaId,...overrides};
 return pool.query("INSERT INTO recommendation_movie_media(recommendation_id,account_id,category,source_entity_id,source_external_kind,source_external_id,source_fetched_at,source_mapping_version,slot,slot_index,cast_ordinal,person_id,credit_id,media_id) VALUES($1,$2,'movies',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",[v.recommendationId,v.accountId,v.sourceEntityId,v.externalKind,v.externalId,v.fetchedAt,v.mappingVersion,v.slot,slotIndex,v.ordinal,v.personId,v.creditId,v.mediaId]);
}
it('persists exact current provider poster and original cast ordinal source tuples',async()=>{
 const f=await fixture();await attach(f);await attach(f,3);
 expect((await pool.query('SELECT slot_index FROM recommendation_movie_media WHERE recommendation_id=$1 ORDER BY slot_index',[f.r.id])).rows).toEqual([{slot_index:0},{slot_index:3}]);
});
it('rejects source mismatch, absent original cast image and immutable parent/source updates',async()=>{
 const f=await fixture();await expect(attach(f,0,{externalId:'999999999999'})).rejects.toMatchObject({code:'23514'});
 await expect(attach(f,2)).rejects.toMatchObject({code:'23514'});await attach(f);
 await expect(pool.query('UPDATE recommendation_movie_media SET source_external_id=$2 WHERE recommendation_id=$1',[f.r.id,'999999999999'])).rejects.toMatchObject({code:'23514'});
});
it('guards inverse media readiness/size and entity replacement while allowing explicit transactional detach',async()=>{
 const f=await fixture();await attach(f);
 await expect(pool.query("UPDATE media_assets SET status='pending_delete',delete_requested_at=now() WHERE id=$1",[f.mediaId])).rejects.toMatchObject({code:'23514'});
 await expect(pool.query('UPDATE media_assets SET byte_size=5242881 WHERE id=$1',[f.mediaId])).rejects.toMatchObject({code:'23514'});
 const e=await entity('movie');await expect(pool.query('UPDATE recommendations SET entity_id=$2 WHERE id=$1',[f.r.id,e])).rejects.toMatchObject({code:'23514'});
 const db=await pool.connect();try{await db.query('BEGIN');await db.query('DELETE FROM recommendation_movie_media WHERE recommendation_id=$1',[f.r.id]);await db.query('UPDATE recommendations SET entity_id=$2 WHERE id=$1',[f.r.id,e]);await db.query('COMMIT');}finally{await db.query('ROLLBACK');db.release();}
 expect((await pool.query('SELECT count(*) FROM recommendation_movie_media WHERE recommendation_id=$1',[f.r.id])).rows[0].count).toBe('0');
});

it('rejects nullable cast discriminator holes and facts/identifier reverse mutations',async()=>{
 const f=await fixture();await expect(attach(f,3,{ordinal:null})).rejects.toMatchObject({code:'23514'});
 await expect(attach(f,3,{personId:null})).rejects.toMatchObject({code:'23514'});
 await attach(f);
 await expect(pool.query('UPDATE entities SET facts_version=2 WHERE id=$1',[f.entityId])).rejects.toMatchObject({code:'23514'});
 await expect(pool.query("UPDATE movie_entity_details SET poster_url='https://evil.invalid/poster.jpg' WHERE entity_id=$1",[f.entityId])).rejects.toMatchObject({code:'23514'});

});

it('rejects changed provider source URL independently of facts checks',async()=>{const f=await fixture();await attach(f);await expect(pool.query("UPDATE entity_identifiers SET source_url='https://evil.invalid/source' WHERE entity_id=$1",[f.entityId])).rejects.toMatchObject({code:'23514'});});

it('counts provider aliases as references and admits bytes only through fresh public Movies ancestors',async()=>{
 const f=await fixture();await attach(f);await attach(f,3);const repo=new MediaRepository(pool);
 await expect(repo.markDelete(f.mediaId,f.a.accountId)).resolves.toBeUndefined();
 await pool.query("UPDATE creator_accounts SET handle=$2,display_name='Media owner',account_type='Creator',onboarding_status='complete',public_profile=true WHERE id=$1",[f.a.accountId,'media'+randomUUID().replaceAll('-','').slice(0,15)]);
 await pool.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='movies'",[f.a.accountId]);
 await pool.query("UPDATE collections SET visibility='public',publication_state='published' WHERE id=$1",[f.c.id]);
 await pool.query("UPDATE recommendations SET publication_state='published' WHERE id=$1",[f.r.id]);
 expect(await repo.isPublicAttachment(f.mediaId)).toBe(true);
 await pool.query("UPDATE collections SET visibility='private' WHERE id=$1",[f.c.id]);expect(await repo.isPublicAttachment(f.mediaId)).toBe(false);
});

it('returns source-bound owned images in actual editable Movie detail without altering snapshots',async()=>{
 const f=await fixture();await attach(f);await attach(f,3);
 const read=await request(composed.app).get(`/api/explorers/v1/recommendations/${f.r.id}/editable`).set('cookie',f.a.cookie);expect(read.status).toBe(200);
 expect(read.body.recommendation.providerMedia).toMatchObject({source:{entityId:f.entityId,externalId:f.externalId,mappingVersion:1,fetchedAt:1700000000000},poster:{id:f.mediaId},backdrop:null,cast:[{slot:{kind:'cast',ordinal:0},media:null},{slot:{kind:'cast',ordinal:1},media:{id:f.mediaId}}]});
 expect(read.body.recommendation.mediaIds).toEqual([]);
});

it('keeps the actual PostgreSQL upload lock and compensation until noncooperative native put settles',async()=>{
 const f=await fixture();const actor:Actor={userId:f.a.userId,accountId:f.a.accountId,role:'owner',credential:{kind:'web-session',sessionId:f.a.sessionId,sessionVersion:1}};
 let finish!:(value:string)=>void,started!:()=>void,deleted=false;const admitted=new Promise<void>(r=>{started=r;});
 const storage:ObjectStorage={environment:'local',put:async()=>{throw Error('ordinary put must not be called');},get:async()=>Buffer.alloc(8),delete:async()=>{deleted=true;},putOwned:()=>{
  const nativeResult=new Promise<string>(r=>{finish=r;});const settlement=nativeResult.then(()=>undefined,()=>undefined);started();
  const completion=new Promise<never>((_r,reject)=>setTimeout(()=>reject(Error('fixture native deadline')),10));return {completion,settlement,nativeResult};
 }};
 const bytes=Buffer.from([137,80,78,71,13,10,26,10]);
 const op=new MediaService(pool,storage).createMediaOwned(actor,{purpose:'recommendation',filename:'movie.png',mimeType:'image/png',length:8,bytes},{requestId:'owned-pg'});
 await admitted;await expect(op.completion).rejects.toThrow();expect(deleted).toBe(false);
 const db=await pool.connect();try{expect((await db.query('SELECT pg_try_advisory_lock(44024,hashtext($1)) locked',[f.a.accountId])).rows[0].locked).toBe(false);}finally{db.release();}
 let settled=false;op.settlement.then(()=>{settled=true;});await Promise.resolve();expect(settled).toBe(false);
 finish('late-version');await op.settlement;expect(deleted).toBe(true);
 const released=await pool.connect();try{expect((await released.query('SELECT pg_try_advisory_lock(44024,hashtext($1)) locked',[f.a.accountId])).rows[0].locked).toBe(true);await released.query('SELECT pg_advisory_unlock(44024,hashtext($1))',[f.a.accountId]);}finally{released.release();}
});

it('serves the exact authenticated reviewed taxonomy GET with no caller parameters',async()=>{
 const a=await persona();const path='/api/explorers/v1/catalog/movie-genres';
 expect((await request(composed.app).get(path)).status).toBe(401);
 const result=await request(composed.app).get(path).set('cookie',a.cookie);expect(result.status).toBe(200);expect(result.body.items).toHaveLength(27);
 expect(result.body.items.reduce((n:number,t:any)=>n+t.providerMappings.length,0)).toBe(35);
 expect((await request(composed.app).get(path+'?locale=en').set('cookie',a.cookie)).status).toBe(422);
 expect((await request(composed.app).post(path).set('cookie',a.cookie).set('origin',config.baseURL)).status).toBe(405);
});

it('completes immutable partial receipts and retries only unavailable slots under a new current-revision key',async()=>{
 const f=await fixture();const actor:Actor={userId:f.a.userId,accountId:f.a.accountId,role:'owner',credential:{kind:'web-session',sessionId:f.a.sessionId,sessionVersion:1}};
 let failCast=true,downloads=0,puts=0;const bytes=Buffer.from([137,80,78,71,13,10,26,10]);
 const fetcher=new MovieImageFetcher({mode:'deterministic-fixture',resolve:async()=>[{address:'8.8.8.8',family:4}],connect:async target=>{downloads++;if(failCast&&target.url.pathname.includes('w185'))throw Error('cast unavailable');return {status:200,mimeType:'image/png',length:8,body:(async function*(){yield bytes;})()};}});
 const storage:ObjectStorage={environment:'local',put:async()=>{throw Error('ordinary put');},putOwned:()=>{puts++;const nativeResult=Promise.resolve('version');return {completion:nativeResult,nativeResult,settlement:nativeResult.then(()=>undefined)};},get:async()=>bytes,delete:async()=>undefined};
 const importer=new MovieMediaImportService(pool,new MediaService(pool,storage),fetcher),key=randomUUID();
 const first=await importer.import(actor,f.r.id,{expectedRevision:f.r.revision},{requestId:'partial',idempotencyKey:key});
 expect(first.revision).toBe(f.r.revision+1);expect(first.slots.find(x=>x.slot.kind==='poster')?.status).toBe('copied');expect(first.slots.find(x=>x.slot.kind==='cast'&&x.slot.ordinal===1)?.status).toBe('unavailable');
 const counts=[downloads,puts];failCast=false;expect(await importer.import(actor,f.r.id,{expectedRevision:f.r.revision},{requestId:'replay',idempotencyKey:key})).toEqual(first);expect([downloads,puts]).toEqual(counts);
 const retry=await importer.import(actor,f.r.id,{expectedRevision:first.revision},{requestId:'retry',idempotencyKey:randomUUID()});expect(retry.revision).toBe(first.revision+1);expect(downloads).toBe(counts[0]+1);expect(puts).toBe(counts[1]+1);expect(retry.slots.filter(x=>x.status==='copied')).toHaveLength(2);
 await expect(importer.import(actor,f.r.id,{expectedRevision:first.revision},{requestId:'conflict',idempotencyKey:key})).rejects.toMatchObject({status:409});
});

it('replaces source atomically through HTTP, preserves snapshots and masks old provider copies',async()=>{
 const f=await fixture();await attach(f);await attach(f,3);
 await pool.query('INSERT INTO recommendation_media(recommendation_id,account_id,media_id,display_order) VALUES($1,$2,$3,0)',[f.r.id,f.a.accountId,f.mediaId]);
 const e=await command(f.a,'post','/entities/resolve',{kind:'manual',category:'movies',details:{title:'Replacement source'}});expect(e.status).toBe(200);
 const changed=await command(f.a,'post',`/recommendations/${f.r.id}/entity`,{expectedRevision:f.r.revision,entityId:e.body.entity.id});expect(changed.status).toBe(200);
 expect((await pool.query('SELECT count(*) FROM recommendation_movie_media WHERE recommendation_id=$1',[f.r.id])).rows[0].count).toBe('0');
 expect((await pool.query('SELECT status FROM media_assets WHERE id=$1',[f.mediaId])).rows[0].status).toBe('ready');
 const read=await request(composed.app).get(`/api/explorers/v1/recommendations/${f.r.id}/editable`).set('cookie',f.a.cookie);expect(read.status).toBe(200);expect(read.body.recommendation.providerMedia).toBeNull();expect(read.body.recommendation.mediaIds).toEqual([f.mediaId]);
});

it('admits only authenticated strict Movie media import commands',async()=>{
 const f=await fixture(),path=`/api/explorers/v1/recommendations/${f.r.id}/movie-media/import`;
 expect((await request(composed.app).post(path).set('origin',config.baseURL).send({expectedRevision:f.r.revision})).status).toBe(401);
 expect((await command(f.a,'post',`/recommendations/${f.r.id}/movie-media/import`,{expectedRevision:f.r.revision,url:'https://evil.invalid/image.jpg'})).status).toBe(422);
 expect((await request(composed.app).get(path).set('cookie',f.a.cookie)).status).toBe(405);
});

it('projects public Movie lists with source-bound copies, cast holes and fresh privacy',async()=>{
 const f=await fixture();await attach(f);await attach(f,3);const handle='movie'+randomUUID().replaceAll('-','').slice(0,15);
 await pool.query("UPDATE creator_accounts SET handle=$2,display_name='Movie owner',account_type='Creator',onboarding_status='complete',public_profile=true WHERE id=$1",[f.a.accountId,handle]);
 await pool.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='movies'",[f.a.accountId]);
 await pool.query("UPDATE collections SET visibility='public',publication_state='published' WHERE id=$1",[f.c.id]);
 await pool.query("UPDATE recommendations SET publication_state='published' WHERE id=$1",[f.r.id]);
 const gateway=new PostgresPublicProfileGateway(pool),service=new PublicProfileService(gateway),page:any=await service.category(handle,'movies',12);
 expect(page.movieLists).toHaveLength(1);const movie=page.movieLists[0].recommended_movies[0];expect(movie.tmdb_id).toBe(f.externalId);
 expect(movie.poster_path).toBe(`/api/explorers/v1/media/${f.mediaId}/content`);expect(movie.cast_details.map((c:any)=>c.profile_url)).toEqual([null,`/api/explorers/v1/media/${f.mediaId}/content`]);
 await pool.query("UPDATE collections SET visibility='private' WHERE id=$1",[f.c.id]);expect((await service.category(handle,'movies',12) as any).movieLists).toEqual([]);
});

it('rejects pending receipt URL substitution before native admission',async()=>{
 const f=await fixture(),e=await readMovieEntity(pool,f.entityId),key=randomUUID();let native=0;
 const source={entityId:e.id,provider:'tmdb',externalKind:'movie',externalId:f.externalId,fetchedAt:1700000000000,mappingVersion:1};
 const slots=extractMovieImageSlots(e.details).map(x=>({slot:x.slot,url:x.url,status:x.url?'pending':'absent',reused:false}));slots[0].url='https://image.tmdb.org/t/p/w780/substituted.jpg';
 const digest=(v:string)=>createHash('sha256').update(v).digest();
 await pool.query("INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,status,response) VALUES($1,'importMovieMedia',$2,$3,'pending',$4)",[f.a.accountId,digest(key),digest(JSON.stringify([f.r.id,f.r.revision])),JSON.stringify({source,expectedRevision:f.r.revision,slots,counters:{received:0,reserved:0,download:0,put:0,dns:0,connect:0,body:0}})]);
 const fetcher=new MovieImageFetcher({mode:'deterministic-fixture',resolve:async()=>{native++;throw Error('must not resolve substituted URL');},connect:async()=>{throw Error();}});
 const actor:Actor={userId:f.a.userId,accountId:f.a.accountId,role:'owner',credential:{kind:'web-session',sessionId:f.a.sessionId,sessionVersion:1}};
 const importer=new MovieMediaImportService(pool,new MediaService(pool),fetcher);
 await expect(importer.import(actor,f.r.id,{expectedRevision:f.r.revision},{requestId:'substitution',idempotencyKey:key})).rejects.toMatchObject({status:409});expect(native).toBe(0);
});

it('retains pending lineage exhaustion without resetting attempts or bytes on resume',async()=>{
 for(const counters of [{received:0,reserved:60*1024*1024,download:12,put:0,dns:12,connect:12,body:12},{received:0,reserved:0,download:12,put:12,dns:12,connect:12,body:12}]){
  const f=await fixture(),e=await readMovieEntity(pool,f.entityId),key=randomUUID();let native=0;
  const source={entityId:e.id,provider:'tmdb',externalKind:'movie',externalId:f.externalId,fetchedAt:1700000000000,mappingVersion:1};
  const slots=extractMovieImageSlots(e.details).map(x=>({slot:x.slot,url:x.url,status:x.url?'pending':'absent',reused:false}));
  const digest=(v:string)=>createHash('sha256').update(v).digest();
  await pool.query("INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,status,response) VALUES($1,'importMovieMedia',$2,$3,'pending',$4)",[f.a.accountId,digest(key),digest(JSON.stringify([f.r.id,f.r.revision])),JSON.stringify({source,expectedRevision:f.r.revision,slots,counters})]);
  const fetcher=new MovieImageFetcher({mode:'deterministic-fixture',resolve:async()=>{native++;throw Error('exhausted');},connect:async()=>{throw Error();}});
  const actor:Actor={userId:f.a.userId,accountId:f.a.accountId,role:'owner',credential:{kind:'web-session',sessionId:f.a.sessionId,sessionVersion:1}};
  const result=await new MovieMediaImportService(pool,new MediaService(pool),fetcher).import(actor,f.r.id,{expectedRevision:f.r.revision},{requestId:'exhausted',idempotencyKey:key});
  expect(result.slots.filter(s=>s.status==='unavailable')).toHaveLength(2);expect(native).toBe(0);expect(result.revision).toBe(f.r.revision+1);
 }
});

it('revalidates Actor after lost final commit acknowledgement without deleting committed images',async()=>{
 const f=await fixture(),bytes=Buffer.from([137,80,78,71,13,10,26,10]);let injected=false,deletes=0;
 const wrapped=new Proxy(pool,{get(target,property){if(property==='connect')return async()=>{const client=await target.connect();let final=false;return new Proxy(client,{get(c,p){if(p==='query')return async(...args:any[])=>{const sql=String(args[0]);if(sql.includes("SET status='completed'"))final=true;const result=await (c.query as any)(...args);if(final&&sql==='COMMIT'&&!injected){injected=true;await pool.query('DELETE FROM auth_session WHERE id=$1',[f.a.sessionId]);throw Error('lost committed acknowledgement');}return result;};const value=Reflect.get(c,p);return typeof value==='function'?value.bind(c):value;}});};const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;}});
 const storage:ObjectStorage={environment:'local',put:async()=>{throw Error('ordinary put');},putOwned:()=>{const nativeResult=Promise.resolve('v');return {completion:nativeResult,nativeResult,settlement:nativeResult.then(()=>undefined)};},get:async()=>bytes,delete:async()=>{deletes++;}};
 const fetcher=new MovieImageFetcher({mode:'deterministic-fixture',resolve:async()=>[{address:'8.8.8.8',family:4}],connect:async()=>({status:200,mimeType:'image/png',length:8,body:(async function*(){yield bytes;})()})});
 const actor:Actor={userId:f.a.userId,accountId:f.a.accountId,role:'owner',credential:{kind:'web-session',sessionId:f.a.sessionId,sessionVersion:1}};
 await expect(new MovieMediaImportService(wrapped,new MediaService(pool,storage),fetcher).import(actor,f.r.id,{expectedRevision:f.r.revision},{requestId:'lost-ack',idempotencyKey:randomUUID()})).rejects.toMatchObject({status:401});
 expect(injected).toBe(true);expect(deletes).toBe(0);expect((await pool.query('SELECT count(*) FROM recommendation_movie_media WHERE recommendation_id=$1',[f.r.id])).rows[0].count).toBe('2');
});

it('serves bounded public genre continuation without collapsing separate recommendations',async()=>{
 const f=await fixture(),handle='genre'+randomUUID().replaceAll('-','').slice(0,15);
 const term=(await pool.query("SELECT id,slug FROM taxonomy_terms WHERE category='movies' AND slug='action' AND active")).rows[0];
 const rev=(await pool.query('SELECT revision FROM collections WHERE id=$1',[f.c.id])).rows[0].revision;
 const second=await recommendation(f.a,f.c,f.entityId,Number(rev));
 for(const id of [f.r.id,second.id])await pool.query("INSERT INTO recommendation_taxonomy(recommendation_id,account_id,category,term_id,position) VALUES($1,$2,'movies',$3,0)",[id,f.a.accountId,term.id]);
 await pool.query("UPDATE creator_accounts SET handle=$2,display_name='Genre owner',account_type='Creator',onboarding_status='complete',public_profile=true WHERE id=$1",[f.a.accountId,handle]);
 await pool.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='movies'",[f.a.accountId]);await pool.query("UPDATE collections SET visibility='public',publication_state='published' WHERE id=$1",[f.c.id]);await pool.query("UPDATE recommendations SET publication_state='published' WHERE account_id=$1",[f.a.accountId]);
 const path=`/api/explorers/v1/profiles/${handle}/recommendations/movies/genres/action`;
 const first=await request(composed.app).get(path+'?limit=1');expect(first.status).toBe(200);expect(first.body.recommended_movies).toHaveLength(1);expect(first.body.nextCursor).toEqual(expect.any(String));
 const next=await request(composed.app).get(path).query({limit:1,cursor:first.body.nextCursor});expect(next.status).toBe(200);expect(next.body.recommended_movies).toHaveLength(1);expect(next.body.recommended_movies[0].documentId).not.toBe(first.body.recommended_movies[0].documentId);expect(next.body.nextCursor).toBeNull();
 expect((await request(composed.app).get(path).query({limit:1,cursor:first.body.nextCursor+'x'})).status).toBe(400);
 expect((await request(composed.app).get(path.replace('/action','/comedy')).query({limit:1,cursor:first.body.nextCursor})).status).toBe(400);
 expect((await request(composed.app).get(path).query({limit:2,cursor:first.body.nextCursor})).status).toBe(400);
 expect((await request(composed.app).get(`/api/explorers/v1/profiles/${handle}/recommendations/movies`).query({limit:1,cursor:first.body.nextCursor})).status).toBe(400);
 const other=await fixture(),otherHandle='othergenre'+randomUUID().replaceAll('-','').slice(0,12);await pool.query("UPDATE creator_accounts SET handle=$2,display_name='Other genre',account_type='Creator',onboarding_status='complete',public_profile=true WHERE id=$1",[other.a.accountId,otherHandle]);await pool.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='movies'",[other.a.accountId]);
 expect((await request(composed.app).get(path.replace(handle,otherHandle)).query({limit:1,cursor:first.body.nextCursor})).status).toBe(400);
 await pool.query("UPDATE recommendations SET user_rating=9 WHERE id=$1",[f.r.id]);expect((await request(composed.app).get(path).query({limit:1,cursor:first.body.nextCursor})).status).toBe(400);
});

it('rejects editable Movie wire copies from another canonical source or cast position',async()=>{
 const f=await fixture();await attach(f);await attach(f,3);const response=await request(composed.app).get(`/api/explorers/v1/recommendations/${f.r.id}/editable`).set('cookie',f.a.cookie);expect(response.status).toBe(200);const dto=response.body.recommendation;
 expect(editableOwnerRecommendationSchema.safeParse(dto).success).toBe(true);
 for(const patch of [{entityId:randomUUID()},{externalId:'999'},{externalKind:'tv'},{fetchedAt:1700000000001}]){const forged=structuredClone(dto);Object.assign(forged.providerMedia.source,patch);expect(editableOwnerRecommendationSchema.safeParse(forged).success).toBe(false);}
 const cast=structuredClone(dto);cast.providerMedia.cast[1].slot.ordinal=9;expect(editableOwnerRecommendationSchema.safeParse(cast).success).toBe(false);
});

it('executes zero-reference source cleanup only after committed replacement',async()=>{
 const f=await fixture();await attach(f);const bytes=Buffer.from([137,80,78,71,13,10,26,10]);let deleted=false;
 await pool.query("INSERT INTO media_objects(media_id,variant,object_key,storage_environment,mime_type,byte_size,content_sha256) VALUES($1,'original',$2,'local','image/png',8,decode(repeat('00',32),'hex'))",[f.mediaId,`local/${f.a.accountId}/${f.mediaId}`]);
 const storage:ObjectStorage={environment:'local',put:async()=>undefined,get:async()=>bytes,delete:async()=>{const rec=(await pool.query('SELECT entity_id FROM recommendations WHERE id=$1',[f.r.id])).rows[0];expect(rec.entity_id).not.toBe(f.entityId);deleted=true;}};
 const app=createCanonicalApp(pool,config,{mediaStorage:storage}).app;
 const e=await request(app).post('/api/explorers/v1/entities/resolve').set('cookie',f.a.cookie).set('origin',config.baseURL).set('Idempotency-Key',randomUUID()).send({kind:'manual',category:'movies',details:{title:'Fresh manual'}});expect(e.status).toBe(200);
 const changed=await request(app).post(`/api/explorers/v1/recommendations/${f.r.id}/entity`).set('cookie',f.a.cookie).set('origin',config.baseURL).set('Idempotency-Key',randomUUID()).send({expectedRevision:f.r.revision,entityId:e.body.entity.id});expect(changed.status).toBe(200);expect(deleted).toBe(true);expect((await pool.query('SELECT status FROM media_assets WHERE id=$1',[f.mediaId])).rows[0].status).toBe('deleted');
});

it('revalidates Actor after acknowledged final commit before emitting the response',async()=>{
 const f=await fixture(),bytes=Buffer.from([137,80,78,71,13,10,26,10]);let injected=false;
 const wrapped=new Proxy(pool,{get(target,property){if(property==='connect')return async()=>{const client=await target.connect();let final=false;return new Proxy(client,{get(c,p){if(p==='query')return async(...args:any[])=>{const sql=String(args[0]);if(sql.includes("SET status='completed'"))final=true;const result=await (c.query as any)(...args);if(final&&sql==='COMMIT'&&!injected){injected=true;await pool.query('DELETE FROM auth_session WHERE id=$1',[f.a.sessionId]);}return result;};const value=Reflect.get(c,p);return typeof value==='function'?value.bind(c):value;}});};const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;}});
 const storage:ObjectStorage={environment:'local',put:async()=>{throw Error('ordinary put');},putOwned:()=>{const nativeResult=Promise.resolve('v');return {completion:nativeResult,nativeResult,settlement:nativeResult.then(()=>undefined)};},get:async()=>bytes,delete:async()=>{throw Error('committed references must survive');}};
 const fetcher=new MovieImageFetcher({mode:'deterministic-fixture',resolve:async()=>[{address:'8.8.8.8',family:4}],connect:async()=>({status:200,mimeType:'image/png',length:8,body:(async function*(){yield bytes;})()})});
 const actor:Actor={userId:f.a.userId,accountId:f.a.accountId,role:'owner',credential:{kind:'web-session',sessionId:f.a.sessionId,sessionVersion:1}};
 await expect(new MovieMediaImportService(wrapped,new MediaService(pool,storage),fetcher).import(actor,f.r.id,{expectedRevision:f.r.revision},{requestId:'acknowledged-commit',idempotencyKey:randomUUID()})).rejects.toMatchObject({status:401});
 expect(injected).toBe(true);expect((await pool.query('SELECT count(*) FROM recommendation_movie_media WHERE recommendation_id=$1',[f.r.id])).rows[0].count).toBe('2');
});

it('compensates previously owned copied progress when a resumed lineage fails',async()=>{
 const f=await fixture(),e=await readMovieEntity(pool,f.entityId),key=randomUUID(),bytes=Buffer.from([137,80,78,71,13,10,26,10]);let deleted=false;
 await pool.query("INSERT INTO media_objects(media_id,variant,object_key,storage_environment,mime_type,byte_size,content_sha256) VALUES($1,'original',$2,'local','image/png',8,decode(repeat('00',32),'hex'))",[f.mediaId,`local/${f.a.accountId}/${f.mediaId}`]);
 const source={entityId:e.id,provider:'tmdb',externalKind:'movie',externalId:f.externalId,fetchedAt:1700000000000,mappingVersion:1};
 const media={id:f.mediaId,url:`/api/explorers/v1/media/${f.mediaId}/content`,mimeType:'image/png',size:8,alternativeText:null,caption:null};
 const slots=extractMovieImageSlots(e.details).map(x=>({slot:x.slot,url:x.url,status:x.url?'pending':'absent',reused:false,...(x.slot.kind==='poster'?{status:'copied',media}:{})}));
 const digest=(v:string)=>createHash('sha256').update(v).digest();
 await pool.query("INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,status,response) VALUES($1,'importMovieMedia',$2,$3,'pending',$4)",[f.a.accountId,digest(key),digest(JSON.stringify([f.r.id,f.r.revision])),JSON.stringify({source,expectedRevision:f.r.revision,slots,counters:{received:8,reserved:0,download:1,put:1,dns:1,connect:1,body:1}})]);
 const storage:ObjectStorage={environment:'local',put:async()=>undefined,get:async()=>bytes,delete:async()=>{deleted=true;}};
 const fetcher=new MovieImageFetcher({mode:'deterministic-fixture',resolve:async()=>{throw Error('must not reach fixture transport');},connect:async()=>{throw Error();}});
 vi.spyOn(fetcher,'fetchOwned').mockImplementation(()=>{throw Error('fatal native fixture');});
 const actor:Actor={userId:f.a.userId,accountId:f.a.accountId,role:'owner',credential:{kind:'web-session',sessionId:f.a.sessionId,sessionVersion:1}};
 await expect(new MovieMediaImportService(pool,new MediaService(pool,storage),fetcher).import(actor,f.r.id,{expectedRevision:f.r.revision},{requestId:'resume-failure',idempotencyKey:key})).rejects.toThrow('fatal native fixture');
 expect(deleted).toBe(true);expect((await pool.query('SELECT status FROM media_assets WHERE id=$1',[f.mediaId])).rows[0].status).toBe('deleted');
});

it('purges source-bound aliases child-first after actual storage cleanup while retaining shared facts',async()=>{
 const f=await fixture();await attach(f);await attach(f,3);const bytes=Buffer.from([137,80,78,71,13,10,26,10]);let deletes=0;
 await pool.query("INSERT INTO media_objects(media_id,variant,object_key,storage_environment,mime_type,byte_size,content_sha256) VALUES($1,'original',$2,'local','image/png',8,decode(repeat('00',32),'hex'))",[f.mediaId,`local/${f.a.accountId}/${f.mediaId}`]);
 const revision=Number((await pool.query('SELECT revision FROM creator_accounts WHERE id=$1',[f.a.accountId])).rows[0].revision);
 const feedback=await command(f.a,'post','/account/deletion-feedback',{reason:'Movie cleanup qualification'});expect(feedback.status).toBe(201);
 const pending=await command(f.a,'post','/account/deletion',{expectedRevision:revision,feedbackId:feedback.body.feedback.id});expect(pending.status).toBe(200);
 const storage:ObjectStorage={environment:'local',put:async()=>undefined,get:async()=>bytes,delete:async()=>{deletes++;expect((await pool.query('SELECT status FROM creator_accounts WHERE id=$1',[f.a.accountId])).rows[0].status).toBe('pending_deletion');}};
 await runAccountLifecycleMaintenance(pool,storage);
 expect(deletes).toBe(1);expect((await pool.query('SELECT status FROM creator_accounts WHERE id=$1',[f.a.accountId])).rows[0].status).toBe('deleted');
 for(const table of ['recommendation_movie_media','recommendations','media_assets'])expect((await pool.query(`SELECT count(*) FROM ${table} WHERE account_id=$1`,[f.a.accountId])).rows[0].count).toBe('0');
 expect((await pool.query('SELECT count(*) FROM movie_entity_details WHERE entity_id=$1',[f.entityId])).rows[0].count).toBe('1');
 expect((await pool.query('SELECT state FROM account_lifecycle_operations WHERE id=$1',[pending.body.lifecycle.operationId])).rows[0].state).toBe('succeeded');
});

it('retains global and account import admission until timed-out native DNS actually settles',async()=>{
 const fixtures=[];for(let i=0;i<5;i++)fixtures.push(await fixture());
 const wide=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:12});let started=0,releaseDns!:()=>void;
 const gate=new Promise<void>(resolve=>{releaseDns=resolve;});const pending:Promise<any>[]=[];
 const fetcher=new MovieImageFetcher({mode:'deterministic-fixture',deadlineMs:20,resolve:async()=>{started++;await gate;return [{address:'8.8.8.8',family:4}];},connect:async()=>{throw Error('aborted DNS must not connect');}});
 const importer=new MovieMediaImportService(wide,new MediaService(wide),fetcher);
 const actor=(f:Awaited<ReturnType<typeof fixture>>):Actor=>({userId:f.a.userId,accountId:f.a.accountId,role:'owner',credential:{kind:'web-session',sessionId:f.a.sessionId,sessionVersion:1}});
 try{
  for(const f of fixtures.slice(0,4))pending.push(importer.import(actor(f),f.r.id,{expectedRevision:f.r.revision},{requestId:'native-held',idempotencyKey:randomUUID()}));
  const until=Date.now()+3000;while(started<4&&Date.now()<until)await new Promise(r=>setTimeout(r,5));expect(started).toBe(4);await new Promise(r=>setTimeout(r,40));
  for(const f of [fixtures[0],fixtures[4]])await expect(importer.import(actor(f),f.r.id,{expectedRevision:f.r.revision},{requestId:'capacity-denied',idempotencyKey:randomUUID()})).rejects.toMatchObject({status:409});
  expect(started).toBe(4);releaseDns();await Promise.all(pending);
  const f=fixtures[4],result=await importer.import(actor(f),f.r.id,{expectedRevision:f.r.revision},{requestId:'capacity-released',idempotencyKey:randomUUID()});expect(result.revision).toBe(f.r.revision+1);
 }finally{releaseDns();await Promise.allSettled(pending);await wide.end();}
});

it('the configured60s caller race does not release an unsettled native import lease',async()=>{
 const f=await fixture(),actor:Actor={userId:f.a.userId,accountId:f.a.accountId,role:'owner',credential:{kind:'web-session',sessionId:f.a.sessionId,sessionVersion:1}};
 let releaseDns!:()=>void,released!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>{releaseDns=r;}),settled=new Promise<void>(r=>{released=r;}),admitted=new Promise<void>(r=>{started=r;});
 const wrapped=new Proxy(pool,{get(target,p){if(p==='connect')return async()=>{const db=await target.connect();return new Proxy(db,{get(c,key){if(key==='release')return()=>{c.release();released();};const value=Reflect.get(c,key);return typeof value==='function'?value.bind(c):value;}});};const value=Reflect.get(target,p);return typeof value==='function'?value.bind(target):value;}});
 const realTimeout=globalThis.setTimeout;const seen:number[]=[];let fireCallerDeadline!:()=>void;const clock=vi.spyOn(globalThis,'setTimeout').mockImplementation(((callback:any,delay:number,...args:any[])=>{if(delay===60000){seen.push(delay);fireCallerDeadline=()=>callback(...args);}return realTimeout(callback,delay,...args);}) as any);
 const fetcher=new MovieImageFetcher({mode:'deterministic-fixture',deadlineMs:20,resolve:async()=>{started();await gate;return [{address:'8.8.8.8',family:4}];},connect:async()=>{throw Error('aborted DNS must not connect');}});
 const importer=new MovieMediaImportService(wrapped,new MediaService(pool),fetcher);
 try{
  const caller=importer.import(actor,f.r.id,{expectedRevision:f.r.revision},{requestId:'caller-race',idempotencyKey:randomUUID()});const denied=caller.then(()=>({resolved:true}),error=>error);await admitted;expect(seen).toEqual([60000]);fireCallerDeadline();expect(await denied).toMatchObject({status:409,message:'Movie import caller deadline exceeded'});
  await expect(importer.import(actor,f.r.id,{expectedRevision:f.r.revision},{requestId:'still-native-held',idempotencyKey:randomUUID()})).rejects.toMatchObject({status:409,message:'Movie import admission unavailable'});
  releaseDns();await settled;
 }finally{releaseDns();clock.mockRestore();await settled;}
});

it('caps fresh command admissions at30 per account while replay remains immutable and native-free',async()=>{
 const f=await fixture(),actor:Actor={userId:f.a.userId,accountId:f.a.accountId,role:'owner',credential:{kind:'web-session',sessionId:f.a.sessionId,sessionVersion:1}};let native=0,revision=f.r.revision;
 const fetcher=new MovieImageFetcher({mode:'deterministic-fixture',resolve:async()=>{native++;throw Error('deterministic unavailable');},connect:async()=>{throw Error('no DNS result');}}),importer=new MovieMediaImportService(pool,new MediaService(pool),fetcher);
 const now=Date.now(),clock=vi.spyOn(Date,'now').mockReturnValue(now);const firstKey=randomUUID();let first:any;
 try{
  for(let i=0;i<30;i++){const result=await importer.import(actor,f.r.id,{expectedRevision:revision},{requestId:'rate-fixture',idempotencyKey:i===0?firstKey:randomUUID()});if(i===0)first=result;revision=result.revision;}
  const calls=native;await expect(importer.import(actor,f.r.id,{expectedRevision:revision},{requestId:'rate-denied',idempotencyKey:randomUUID()})).rejects.toMatchObject({status:409});expect(native).toBe(calls);
  expect(await importer.import(actor,f.r.id,{expectedRevision:f.r.revision},{requestId:'rate-replay',idempotencyKey:firstKey})).toEqual(first);expect(native).toBe(calls);
 }finally{clock.mockRestore();}
});

it('deduplicates exact canonical cast URLs into one owned put while retaining original distinct ordinals',async()=>{
 const f=await fixture(),bytes=Buffer.from([137,80,78,71,13,10,26,10]);let downloads=0,puts=0;
 await pool.query('UPDATE movie_entity_details SET cast_details=$2 WHERE entity_id=$1',[f.entityId,JSON.stringify([{personId:1,creditId:'same',name:'First',character:'A',profileUrl:'https://image.tmdb.org/t/p/w185/shared.jpg',order:0},{personId:1,creditId:'same',name:'Second',character:'B',profileUrl:'https://image.tmdb.org/t/p/w185/shared.jpg',order:1}])]);
 const fetcher=new MovieImageFetcher({mode:'deterministic-fixture',resolve:async()=>[{address:'8.8.8.8',family:4}],connect:async()=>{downloads++;return {status:200,mimeType:'image/png',length:8,body:(async function*(){yield bytes;})()};}});
 const storage:ObjectStorage={environment:'local',put:async()=>{throw Error();},putOwned:()=>{puts++;const nativeResult=Promise.resolve('v');return {completion:nativeResult,nativeResult,settlement:nativeResult.then(()=>undefined)};},get:async()=>bytes,delete:async()=>undefined};
 const actor:Actor={userId:f.a.userId,accountId:f.a.accountId,role:'owner',credential:{kind:'web-session',sessionId:f.a.sessionId,sessionVersion:1}};
 const result=await new MovieMediaImportService(pool,new MediaService(pool,storage),fetcher).import(actor,f.r.id,{expectedRevision:f.r.revision},{requestId:'alias-copy',idempotencyKey:randomUUID()});
 expect([downloads,puts]).toEqual([2,2]);const casts=result.slots.filter(s=>s.slot.kind==='cast');expect(casts.map(s=>s.slot.kind==='cast'?s.slot.ordinal:-1)).toEqual([0,1]);expect(casts.every(s=>s.status==='copied')).toBe(true);if(casts[0].status!=='copied'||casts[1].status!=='copied')throw Error('Expected both copied cast aliases');expect(casts[0].media.id).toBe(casts[1].media.id);
 expect((await pool.query('SELECT count(*) AS slots,count(DISTINCT media_id) AS assets FROM recommendation_movie_media WHERE recommendation_id=$1',[f.r.id])).rows[0]).toEqual({slots:'3',assets:'2'});
});

it.each(['revision','source','expiry'])('retires stale %s resumed progress with durable owned compensation',async(mode)=>{
 const f=await fixture(),e=await readMovieEntity(pool,f.entityId),key=randomUUID(),bytes=Buffer.from([137,80,78,71,13,10,26,10]);let deleted=false;
 await pool.query("INSERT INTO media_objects(media_id,variant,object_key,storage_environment,mime_type,byte_size,content_sha256) VALUES($1,'original',$2,'local','image/png',8,decode(repeat('00',32),'hex'))",[f.mediaId,`local/${f.a.accountId}/${f.mediaId}`]);
 const source={entityId:e.id,provider:'tmdb',externalKind:'movie',externalId:f.externalId,fetchedAt:1700000000000,mappingVersion:1};
 const media={id:f.mediaId,url:`/api/explorers/v1/media/${f.mediaId}/content`,mimeType:'image/png',size:8,alternativeText:null,caption:null};
 const slots=extractMovieImageSlots(e.details).map(x=>({slot:x.slot,url:x.url,status:x.url?'pending':'absent',reused:false,...(x.slot.kind==='poster'?{status:'copied',media}:{})}));
 const digest=(v:string)=>createHash('sha256').update(v).digest();
 await pool.query("INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,status,response) VALUES($1,'importMovieMedia',$2,$3,'pending',$4)",[f.a.accountId,digest(key),digest(JSON.stringify([f.r.id,f.r.revision])),JSON.stringify({source,expectedRevision:f.r.revision,slots,counters:{received:8,reserved:0,download:1,put:1,dns:1,connect:1,body:1}})]);
 const storage:ObjectStorage={environment:'local',put:async()=>undefined,get:async()=>bytes,delete:async()=>{deleted=true;}};
 const fetcher=new MovieImageFetcher({mode:'deterministic-fixture',resolve:async()=>{throw Error('must not reach fixture transport');},connect:async()=>{throw Error();}});
 if(mode==='revision')await pool.query('UPDATE recommendations SET revision=revision+1 WHERE id=$1',[f.r.id]);
 if(mode==='source')await pool.query("UPDATE entity_identifiers SET fetched_at=fetched_at+interval '1 second' WHERE entity_id=$1",[f.entityId]);
 if(mode==='expiry')await pool.query("UPDATE application_command_receipts SET replay_until=clock_timestamp()-interval '1 second' WHERE account_id=$1 AND operation='importMovieMedia'",[f.a.accountId]);
 const actor:Actor={userId:f.a.userId,accountId:f.a.accountId,role:'owner',credential:{kind:'web-session',sessionId:f.a.sessionId,sessionVersion:1}};
 await expect(new MovieMediaImportService(pool,new MediaService(pool,storage),fetcher).import(actor,f.r.id,{expectedRevision:f.r.revision},{requestId:'resume-failure',idempotencyKey:key})).rejects.toMatchObject({status:409});
 expect((await pool.query("SELECT status,response FROM application_command_receipts WHERE account_id=$1 AND operation='importMovieMedia'",[f.a.accountId])).rows[0]).toEqual({status:'retired',response:null});
 expect(deleted).toBe(true);expect((await pool.query('SELECT status FROM media_assets WHERE id=$1',[f.mediaId])).rows[0].status).toBe('deleted');
});

it('retains global and account import admission until rejected response native disposal actually settles',async()=>{
 const fixtures=[];for(let i=0;i<5;i++)fixtures.push(await fixture());
 const wide=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:12});let started=0,releaseDisposal!:()=>void;
 const gate=new Promise<void>(resolve=>{releaseDisposal=resolve;});const pending:Promise<any>[]=[];
 const fetcher=new MovieImageFetcher({mode:'deterministic-fixture',deadlineMs:20,resolve:async()=>[{address:'8.8.8.8',family:4}],connect:async()=>{started++;return {status:302,mimeType:'image/png',body:(async function*(){yield Buffer.alloc(8);})(),discard:()=>undefined,settlement:gate};}});
 const importer=new MovieMediaImportService(wide,new MediaService(wide),fetcher);
 const actor=(f:Awaited<ReturnType<typeof fixture>>):Actor=>({userId:f.a.userId,accountId:f.a.accountId,role:'owner',credential:{kind:'web-session',sessionId:f.a.sessionId,sessionVersion:1}});
 try{
  for(const f of fixtures.slice(0,4))pending.push(importer.import(actor(f),f.r.id,{expectedRevision:f.r.revision},{requestId:'native-held',idempotencyKey:randomUUID()}));
  const until=Date.now()+3000;while(started<4&&Date.now()<until)await new Promise(r=>setTimeout(r,5));expect(started).toBe(4);await new Promise(r=>setTimeout(r,40));
  for(const f of [fixtures[0],fixtures[4]])await expect(importer.import(actor(f),f.r.id,{expectedRevision:f.r.revision},{requestId:'capacity-denied',idempotencyKey:randomUUID()})).rejects.toMatchObject({status:409});
  expect(started).toBe(4);releaseDisposal();await Promise.all(pending);
  const f=fixtures[4],result=await importer.import(actor(f),f.r.id,{expectedRevision:f.r.revision},{requestId:'capacity-released',idempotencyKey:randomUUID()});expect(result.revision).toBe(f.r.revision+1);
 }finally{releaseDisposal();await Promise.allSettled(pending);await wide.end();}
});

it.each(['referenced','reused','foreign','storage-failure'])('preserves safe %s custody during stale-resume retirement',async(mode)=>{
 const f=await fixture(),e=await readMovieEntity(pool,f.entityId),key=randomUUID(),bytes=Buffer.from([137,80,78,71,13,10,26,10]);let deleted=false;
 await pool.query("INSERT INTO media_objects(media_id,variant,object_key,storage_environment,mime_type,byte_size,content_sha256) VALUES($1,'original',$2,'local','image/png',8,decode(repeat('00',32),'hex'))",[f.mediaId,`local/${f.a.accountId}/${f.mediaId}`]);
 const source={entityId:e.id,provider:'tmdb',externalKind:'movie',externalId:f.externalId,fetchedAt:1700000000000,mappingVersion:1};
 const media={id:f.mediaId,url:`/api/explorers/v1/media/${f.mediaId}/content`,mimeType:'image/png',size:8,alternativeText:null,caption:null};
 const slots=extractMovieImageSlots(e.details).map(x=>({slot:x.slot,url:x.url,status:x.url?'pending':'absent',reused:false,...(x.slot.kind==='poster'?{status:'copied',media}:{})}));
 if(mode==='referenced'||mode==='reused')await attach(f);
 if(mode==='reused')slots[0].reused=true;
 if(mode==='foreign'){const foreign=await fixture();(slots[0] as any).media={...media,id:foreign.mediaId,url:`/api/explorers/v1/media/${foreign.mediaId}/content`};}
 const digest=(v:string)=>createHash('sha256').update(v).digest();
 await pool.query("INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,status,response) VALUES($1,'importMovieMedia',$2,$3,'pending',$4)",[f.a.accountId,digest(key),digest(JSON.stringify([f.r.id,f.r.revision])),JSON.stringify({source,expectedRevision:f.r.revision,slots,counters:{received:8,reserved:0,download:1,put:1,dns:1,connect:1,body:1}})]);
 const storage:ObjectStorage={environment:'local',put:async()=>undefined,get:async()=>bytes,delete:async()=>{if(mode==='storage-failure')throw Error('storage unavailable');deleted=true;}};
 const fetcher=new MovieImageFetcher({mode:'deterministic-fixture',resolve:async()=>{throw Error('must not reach fixture transport');},connect:async()=>{throw Error();}});
 await pool.query('UPDATE recommendations SET revision=revision+1 WHERE id=$1',[f.r.id]);
 const actor:Actor={userId:f.a.userId,accountId:f.a.accountId,role:'owner',credential:{kind:'web-session',sessionId:f.a.sessionId,sessionVersion:1}};
 await expect(new MovieMediaImportService(pool,new MediaService(pool,storage),fetcher).import(actor,f.r.id,{expectedRevision:f.r.revision},{requestId:'resume-failure',idempotencyKey:key})).rejects.toMatchObject({status:409});
 const receipt=(await pool.query("SELECT status,response FROM application_command_receipts WHERE account_id=$1 AND operation='importMovieMedia'",[f.a.accountId])).rows[0];
 expect(receipt.status).toBe(mode==='foreign'?'pending':'retired');if(mode==='foreign')expect(receipt.response).not.toBeNull();else expect(receipt.response).toBeNull();
 expect(deleted).toBe(false);expect((await pool.query('SELECT status FROM media_assets WHERE id=$1',[f.mediaId])).rows[0].status).toBe(mode==='storage-failure'?'pending_delete':'ready');
});

for(const [label,mutation,target] of [
 ['account private',"UPDATE creator_accounts SET public_profile=false WHERE id=$1",'account'],
 ['category private',"UPDATE account_category_settings SET is_public=false WHERE account_id=$1 AND category='movies'",'account'],
 ['list unpublished',"UPDATE collections SET publication_state='draft' WHERE id=$1",'list'],
 ['list archived',"UPDATE collections SET archived_at=now() WHERE id=$1",'list'],
 ['recommendation unpublished',"UPDATE recommendations SET publication_state='draft' WHERE id=$1",'rec'],
 ['recommendation archived',"UPDATE recommendations SET archived_at=now() WHERE id=$1",'rec']
] as const)it('denies copied Movie byte ancestry after '+label,async()=>{
 const f=await fixture();await attach(f);const repo=new MediaRepository(pool);
 await pool.query("UPDATE creator_accounts SET handle=$2,display_name='Media owner',account_type='Creator',onboarding_status='complete',public_profile=true WHERE id=$1",[f.a.accountId,'media'+randomUUID().replaceAll('-','').slice(0,15)]);
 await pool.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='movies'",[f.a.accountId]);await pool.query("UPDATE collections SET visibility='public',publication_state='published' WHERE id=$1",[f.c.id]);await pool.query("UPDATE recommendations SET publication_state='published' WHERE id=$1",[f.r.id]);expect(await repo.isPublicAttachment(f.mediaId)).toBe(true);
 await pool.query(mutation,[target==='account'?f.a.accountId:target==='list'?f.c.id:f.r.id]);expect(await repo.isPublicAttachment(f.mediaId)).toBe(false);
});

it('rechecks copied Movie public ancestry after an in-flight storage read before returning any bytes',async()=>{
 const f=await fixture();await attach(f);await pool.query("INSERT INTO media_objects(media_id,variant,object_key,storage_environment,mime_type,byte_size,content_sha256) VALUES($1,'original',$2,'local','image/png',8,decode(repeat('00',32),'hex'))",[f.mediaId,`local/${f.a.accountId}/${f.mediaId}`]);await pool.query("UPDATE creator_accounts SET handle=$2,display_name='Race owner',account_type='Creator',onboarding_status='complete',public_profile=true WHERE id=$1",[f.a.accountId,'race'+randomUUID().replaceAll('-','').slice(0,15)]);await pool.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='movies'",[f.a.accountId]);await pool.query("UPDATE collections SET visibility='public',publication_state='published' WHERE id=$1",[f.c.id]);await pool.query("UPDATE recommendations SET publication_state='published' WHERE id=$1",[f.r.id]);
 let reached!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>reached=r),blocked=new Promise<void>(r=>release=r);const bytes=Buffer.from('owned copied bytes');
 const storage:ObjectStorage={environment:'local',put:async()=>undefined,delete:async()=>undefined,get:async()=>{reached();await blocked;return bytes;}};const service=new MediaService(pool,storage);const pending=service.resolveMediaContent(null,f.mediaId);const observed=pending.then(()=>({returned:true}),()=>({returned:false}));await entered;
 await pool.query("UPDATE collections SET publication_state='draft' WHERE id=$1",[f.c.id]);release();expect(await observed).toEqual({returned:false});
 await pool.query("UPDATE collections SET publication_state='published' WHERE id=$1",[f.c.id]);expect((await service.resolveMediaContent(null,f.mediaId)).bytes).toEqual(bytes);
});
