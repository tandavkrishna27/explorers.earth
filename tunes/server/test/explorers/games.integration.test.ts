import {spawnSync,execFileSync} from 'node:child_process';
import {captureGamesOwnedPostgres,validateGamesRestore,type GamesPostgresSnapshot} from '../helpers/games-owned-postgres-authority';
import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve,sep} from 'node:path';
import pg from 'pg';import request from 'supertest';import {beforeAll,afterAll,it,expect} from 'vitest';
import {createCanonicalApp} from '../../auth/canonicalApp';import {resolveExplorersAuthConfig} from '../../auth/betterAuth';
import {runAccountLifecycleMaintenance} from '../../application/accountLifecycleMaintenance';
import {RecommendationService} from '../../application/recommendations';
import {provisionMusicRuntimeLogin} from '../../db/music-runtime-role';import {LocalObjectStorage} from '../../services/objectStorage';
const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51643',EXPLORERS_AUTH_SECRET:'games-owned-integration-'.repeat(4),GOOGLE_CLIENT_ID:'fixture-only',GOOGLE_CLIENT_SECRET:'fixture-only'});
let sourceAuthority:GamesPostgresSnapshot;
let storageGate:{entered:()=>void;settled:Promise<void>}|undefined;
let admin:pg.Pool,runtime:pg.Pool,app:ReturnType<typeof createCanonicalApp>,storage:LocalObjectStorage,storageRoot:string;
const role='games_owner_'+randomBytes(8).toString('hex'),ownership='games-a3m:'+role;
beforeAll(async()=>{
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:process.cwd(),encoding:'utf8',windowsHide:true,timeout:10_000,stdio:['ignore','pipe','pipe']}).trim();
 sourceAuthority=captureGamesOwnedPostgres(process.env,sourceCommit);const url=new URL(sourceAuthority.target);
 admin=new pg.Pool({connectionString:url.toString(),max:4});const password=randomBytes(32).toString('base64url');await provisionMusicRuntimeLogin(admin,{loginRole:role,password},{ownershipComment:ownership});url.username=role;url.password=password;runtime=new pg.Pool({connectionString:url.toString(),max:4});
 expect((await runtime.query('SELECT current_user')).rows[0].current_user).toBe(role);
 storageRoot=await mkdtemp(join(tmpdir(),'games-a3m-owned-'));storage=new LocalObjectStorage(storageRoot);
 const unavailable={search:async()=>{throw Error('No provider authority');},resolve:async()=>{throw Error('No provider authority');}};
 app=createCanonicalApp(runtime,config,{mediaStorage:{environment:'local',put:storage.put.bind(storage),putOwned:storage.putOwned.bind(storage),delete:storage.delete.bind(storage),get:async(key:string)=>{const bytes=await storage.get(key),gate=storageGate;if(gate){gate.entered();await gate.settled;}return bytes;}},bookCatalog:unavailable as any,movieCatalog:unavailable as any});
});
afterAll(async()=>{await runtime?.end();if(admin){const row=(await admin.query("SELECT shobj_description(oid,'pg_authid') AS ownership FROM pg_roles WHERE rolname=$1",[role])).rows[0];if(row?.ownership===ownership){await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);}await admin.end();}if(storageRoot){const absolute=resolve(storageRoot),parent=resolve(tmpdir())+sep;if(!absolute.startsWith(parent)||!absolute.slice(parent.length).startsWith('games-a3m-owned-'))throw Error('Owned storage cleanup refused');await rm(absolute,{recursive:true,force:true});}});
async function persona(){const userId='games-'+randomUUID();await admin.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Games owner',$2)",[userId,userId+'@example.invalid']);await admin.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())",[randomUUID(),'google-'+userId,userId]);const context=await app.auth.$context,session=await context.internalAdapter.createSession(userId,false);const cookie=`${context.authCookies.sessionToken.name}=${session.token}.${createHmac('sha256',config.secret).update(session.token).digest('base64')}`;const me=await request(app.app).get('/api/explorers/v1/me').set('cookie',cookie);expect(me.status).toBe(200);return {userId,cookie,accountId:me.body.account.id as string};}
function command(owner:{cookie:string},method:'post'|'patch'|'delete',path:string,body:object,key=randomUUID()){return request(app.app)[method]('/api/explorers/v1'+path).set('cookie',owner.cookie).set('origin',config.baseURL).set('Idempotency-Key',key).send(body);}
async function list(a:{cookie:string}){const reply=await command(a,'post','/collections',{category:'games',title:'Games',slug:'games-'+randomUUID(),visibility:'private',publicationState:'draft'});expect(reply.status).toBe(201);return reply.body.collection;}
async function manual(a:{cookie:string},title='Same title',key=randomUUID()){const reply=await command(a,'post','/entities/resolve',{kind:'manual',category:'games',details:{title}},key);expect(reply.status,JSON.stringify(reply.body)).toBe(200);return reply.body.entity;}
async function recommendation(a:{cookie:string},c:any,e:any,key=randomUUID()){const body={category:'games',entityId:e.id,collectionId:c.id,expectedCollectionRevision:c.revision,userRating:null,publicationState:'draft'};const reply=await command(a,'post','/recommendations',body,key);expect(reply.status,JSON.stringify(reply.body)).toBe(201);return {row:reply.body.recommendation,body,key};}
async function editable(a:{cookie:string},id:string){const reply=await request(app.app).get(`/api/explorers/v1/recommendations/${id}/editable`).set('cookie',a.cookie);expect(reply.status,JSON.stringify(reply.body)).toBe(200);return reply.body.recommendation;}
it('actual paired Games membership command attaches without cloning and replays original observations',async()=>{
 const a=await persona(),first=await list(a),second=await list(a),e=await manual(a),{row}=await recommendation(a,first,e),key=randomUUID();
 const body={expectedCollectionRevision:second.revision,expectedRecommendationRevision:row.revision},path=`/collections/${second.id}/memberships/${row.id}`;
 const attached=await command(a,'post',path,body,key);expect(attached.status,JSON.stringify(attached.body)).toBe(200);
 expect(attached.body.membership).toMatchObject({attached:true,collection:{id:second.id,revision:second.revision+1},recommendation:{id:row.id,revision:row.revision+1}});
 const replay=await command(a,'post',path,body,key);expect(replay.status).toBe(200);expect(replay.body).toEqual(attached.body);
 expect((await admin.query('SELECT count(*) FROM collection_items WHERE recommendation_id=$1',[row.id])).rows[0].count).toBe('2');
 expect((await command(a,'post',path,{expectedCollectionRevision:attached.body.membership.collection.revision,expectedRecommendationRevision:attached.body.membership.recommendation.revision})).status).toBe(409);
});
it('actual detach compacts order, advances only selected pin state, and retains last-detached owner content',async()=>{
 const a=await persona(),first=await list(a),second=await list(a),e=await manual(a),{row}=await recommendation(a,first,e);
 const attached=await command(a,'post',`/collections/${second.id}/memberships/${row.id}`,{expectedCollectionRevision:second.revision,expectedRecommendationRevision:row.revision});expect(attached.status).toBe(200);
 const other=await recommendation(a,attached.body.membership.collection,await manual(a,'Other'));
 await admin.query("INSERT INTO account_category_pin_state(account_id,category,revision) VALUES($1,'games',1) ON CONFLICT(account_id,category) DO NOTHING",[a.accountId]);
 await admin.query("INSERT INTO category_recommendation_pins(account_id,category,recommendation_id,collection_id,position) VALUES($1,'games',$2,$3,0)",[a.accountId,row.id,first.id]);
 const revision=async(table:string,id:string)=>Number((await admin.query(`SELECT revision FROM ${table} WHERE id=$1`,[id])).rows[0].revision);
 const pinRevision=async()=>Number((await admin.query("SELECT revision FROM account_category_pin_state WHERE account_id=$1 AND category='games'",[a.accountId])).rows[0].revision);
 const initialPin=await pinRevision(),detachBody={expectedCollectionRevision:await revision('collections',second.id),expectedRecommendationRevision:await revision('recommendations',row.id)},detachKey=randomUUID();
 const detach=await command(a,'delete',`/collections/${second.id}/memberships/${row.id}`,detachBody,detachKey);expect(detach.status,JSON.stringify(detach.body)).toBe(200);expect(detach.body.membership.attached).toBe(false);
 expect(await pinRevision()).toBe(initialPin);expect((await admin.query('SELECT display_order FROM collection_items WHERE collection_id=$1 AND recommendation_id=$2',[second.id,other.row.id])).rows[0].display_order).toBe(0);
 expect((await command(a,'delete',`/collections/${second.id}/memberships/${row.id}`,detachBody,detachKey)).body).toEqual(detach.body);
 const handle=await publish(a,first,row),publicDetail=`/api/explorers/v1/public/profiles/${handle}/collections/games/${first.slug}/recommendations/${row.id}`,lastBody={expectedCollectionRevision:await revision('collections',first.id),expectedRecommendationRevision:await revision('recommendations',row.id)};
 expect((await request(app.app).get(publicDetail)).status).toBe(200);
 const last=await command(a,'delete',`/collections/${first.id}/memberships/${row.id}`,lastBody);expect(last.status).toBe(200);expect(await pinRevision()).toBe(initialPin+1);
 expect((await editable(a,row.id)).id).toBe(row.id);expect((await request(app.app).get(publicDetail)).status).toBe(404);
 expect((await admin.query('SELECT count(*) FROM collection_items WHERE recommendation_id=$1',[row.id])).rows[0].count).toBe('0');
 expect((await command(a,'delete',`/collections/${first.id}/memberships/${row.id}`,{expectedCollectionRevision:last.body.membership.collection.revision,expectedRecommendationRevision:last.body.membership.recommendation.revision})).status).toBe(404);
});
it('actual paired membership rejects crossed ownership, unknown fields and concurrent stale commands without partial mutation',async()=>{
 const a=await persona(),b=await persona(),first=await list(a),second=await list(a),foreign=await list(b),{row}=await recommendation(a,first,await manual(a));
 const body={expectedCollectionRevision:second.revision,expectedRecommendationRevision:row.revision},path=`/collections/${second.id}/memberships/${row.id}`;
 expect((await command(a,'post',`/collections/${foreign.id}/memberships/${row.id}`,body)).status).toBe(404);
 expect((await command(b,'post',path,body)).status).toBe(404);
 expect((await command(a,'post',path,{...body,category:'games'})).status).toBe(422);
 expect((await command(a,'post',path,{...body,expectedRecommendationRevision:0})).status).toBe(422);
 const results=await Promise.all([command(a,'post',path,body),command(a,'post',path,body)]);expect(results.map(reply=>reply.status).sort()).toEqual([200,409]);
 expect((await admin.query('SELECT count(*) FROM collection_items WHERE collection_id=$1 AND recommendation_id=$2',[second.id,row.id])).rows[0].count).toBe('1');
 expect((await admin.query('SELECT revision FROM recommendations WHERE id=$1',[row.id])).rows[0].revision).toBe(String(row.revision+1));
 expect((await request(app.app).put('/api/explorers/v1'+path)).status).toBe(405);
});
it('actual Games membership requires both OAuth scopes and rejects cross-category resources without receipts',async()=>{
 const a=await persona(),first=await list(a),second=await list(a),{row}=await recommendation(a,first,await manual(a)),body={expectedCollectionRevision:second.revision,expectedRecommendationRevision:row.revision};
 const actor={role:'owner',userId:a.userId,accountId:a.accountId,credential:{kind:'oauth',scopes:['collections:write']}} as any,key=randomUUID();
 await expect(new RecommendationService(runtime).gameMembership(actor,second.id,row.id,body,{requestId:randomUUID(),idempotencyKey:key},true)).rejects.toMatchObject({status:403,code:'FORBIDDEN'});
 expect((await admin.query('SELECT count(*) FROM application_command_receipts WHERE account_id=$1 AND idempotency_key_hash=$2',[a.accountId,createHash('sha256').update(key).digest()])).rows[0].count).toBe('0');
 await admin.query("UPDATE collections SET category='books' WHERE id=$1",[second.id]);
 const current=Number((await admin.query('SELECT revision FROM collections WHERE id=$1',[second.id])).rows[0].revision);
 expect((await command(a,'post',`/collections/${second.id}/memberships/${row.id}`,{...body,expectedCollectionRevision:current})).status).toBe(422);
 expect((await admin.query('SELECT count(*) FROM collection_items WHERE recommendation_id=$1',[row.id])).rows[0].count).toBe('1');
});
async function publish(a:Awaited<ReturnType<typeof persona>>,c:any,r:any){const handle='games'+randomUUID().replaceAll('-','').slice(0,16);await admin.query("UPDATE creator_accounts SET handle=$2,display_name='Games',account_type='Creator',onboarding_status='complete',public_profile=true WHERE id=$1",[a.accountId,handle]);await admin.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='games'",[a.accountId]);await admin.query("UPDATE collections SET visibility='public',publication_state='published' WHERE id=$1",[c.id]);await admin.query("UPDATE recommendations SET publication_state='published' WHERE id=$1",[r.id]);return handle;}
it('actual runtime-role manual create replays its original keys and preserves distinct same-title UUID identity',async()=>{
 const a=await persona(),c=await list(a),key=randomUUID(),e=await manual(a,'Same title',key),same=await manual(a,'Same title',key),other=await manual(a);expect(same.id).toBe(e.id);expect(other.id).not.toBe(e.id);
 const created=await recommendation(a,c,e);const replay=await command(a,'post','/recommendations',created.body,created.key);expect(replay.status).toBe(201);expect(replay.body.recommendation).toEqual(created.row);
 const row=await editable(a,created.row.id);expect(row).toMatchObject({category:'games',userRating:null,mediaIds:[],gamePresentation:{version:'explorers-manual-game/v1',origin:'manual',providerExternalId:null,providerFacts:null,images:[],coverMediaId:null}});
 expect((await admin.query('SELECT count(*) FROM collection_items WHERE recommendation_id=$1',[row.id])).rows[0].count).toBe('1');
});
it('actual owner manual rating validates1..10/null and rejects stale edit observations',async()=>{
 const a=await persona(),c=await list(a),e=await manual(a),{row}=await recommendation(a,c,e);
 expect((await command(a,'patch',`/recommendations/${row.id}`,{expectedRevision:row.revision,userRating:0})).status).toBe(422);
 const saved=await command(a,'patch',`/recommendations/${row.id}`,{expectedRevision:row.revision,userRating:10});expect(saved.status).toBe(200);
 expect((await command(a,'patch',`/recommendations/${row.id}`,{expectedRevision:row.revision,userRating:1})).status).toBe(409);
 const cleared=await command(a,'patch',`/recommendations/${row.id}`,{expectedRevision:saved.body.recommendation.revision,userRating:null});expect(cleared.status).toBe(200);expect((await editable(a,row.id)).userRating).toBeNull();
});
it('actual IGDB search/resolve stays unavailable and never creates receipts/provider entities',async()=>{
 const a=await persona();const reply=await request(app.app).get('/api/explorers/v1/catalog/games').query({query:'Games',limit:24}).set('cookie',a.cookie);expect(reply.status).toBe(503);expect(reply.body.error.code).toBe('PROVIDER_UNAVAILABLE');
 const key=randomUUID(),resolved=await command(a,'post','/entities/resolve',{kind:'provider',category:'games',provider:'igdb',externalKind:'game',externalId:'42'},key);expect(resolved.status).toBe(503);expect(resolved.body.error.code).toBe('PROVIDER_UNAVAILABLE');expect((await admin.query('SELECT count(*) FROM application_command_receipts WHERE account_id=$1 AND idempotency_key_hash=$2',[a.accountId,createHash('sha256').update(key).digest()])).rows[0].count).toBe('0');
 expect((await request(app.app).get('/api/explorers/v1/catalog/games').query({query:'Game'})).status).toBe(401);
});
it('actual manual public content denies category privacy and every archived/unpublished ancestor',async()=>{
 const a=await persona(),c=await list(a),e=await manual(a),{row}=await recommendation(a,c,e),handle=await publish(a,c,row),url=`/api/explorers/v1/profiles/${handle}/recommendations/games`;
 const first=await request(app.app).get(url);expect(first.status).toBe(200);expect(first.body.gameLists[0].recommendations[0].id).toBe(row.id);
 for(const [table,column,off,on,id] of [['account_category_settings','is_public',false,true,a.accountId],['collections','visibility','private','public',c.id],['collections','publication_state','draft','published',c.id],['recommendations','publication_state','draft','published',row.id]] as const){
  const where=table==='account_category_settings'?"account_id=$1 AND category='games'":'id=$1';await admin.query(`UPDATE ${table} SET ${column}=$2 WHERE ${where}`,[id,off]);const hidden=await request(app.app).get(url);if(table==='account_category_settings')expect(hidden.status).toBe(404);else{expect(hidden.status).toBe(200);expect(JSON.stringify(hidden.body)).not.toContain(row.id);}await admin.query(`UPDATE ${table} SET ${column}=$2 WHERE ${where}`,[id,on]);
 }
 await admin.query('UPDATE recommendations SET archived_at=now() WHERE id=$1',[row.id]);expect(JSON.stringify((await request(app.app).get(url)).body)).not.toContain(row.id);
});

const png=Buffer.from([137,80,78,71,13,10,26,10,0]);
async function upload(a:{cookie:string}){const reply=await request(app.app).post('/api/explorers/v1/media').set('cookie',a.cookie).set('origin',config.baseURL).set('x-media-purpose','recommendation').set('x-file-name','game.png').set('content-type','image/png').send(png);expect(reply.status,JSON.stringify(reply.body)).toBe(201);return reply.body.media;}
it('actual ready local upload attaches in order and enforces account ownership before any public bytes',async()=>{
 const a=await persona(),b=await persona(),c=await list(a),e=await manual(a),{row}=await recommendation(a,c,e),image=await upload(a),foreign=await upload(b);
 expect((await request(app.app).get(image.url)).status).toBe(404);
 expect((await command(a,'patch',`/recommendations/${row.id}`,{expectedRevision:row.revision,mediaIds:[foreign.id]})).status).toBe(422);
 const saved=await command(a,'patch',`/recommendations/${row.id}`,{expectedRevision:row.revision,mediaIds:[image.id]});expect(saved.status).toBe(200);
 const read=await editable(a,row.id);expect(read.gamePresentation).toMatchObject({images:[{mediaId:image.id,url:image.url}],coverMediaId:image.id});
 expect((await request(app.app).get(image.url).set('cookie',b.cookie)).status).toBe(404);
 const handle=await publish(a,c,row);const publicRead=await request(app.app).get(image.url);expect(publicRead.status).toBe(200);expect(Buffer.compare(publicRead.body,png)).toBe(0);
 await admin.query("UPDATE account_category_settings SET is_public=false WHERE account_id=$1 AND category='games'",[a.accountId]);expect((await request(app.app).get(image.url)).status).toBe(404);expect((await request(app.app).get(`/api/explorers/v1/profiles/${handle}/recommendations/games`)).status).toBe(404);
});
it('actual lifecycle purge removes Games ownership/media and retains shared catalog used by another account',async()=>{
 const a=await persona(),b=await persona(),ca=await list(a),cb=await list(b),e=await manual(a),{row}=await recommendation(a,ca,e),other=await recommendation(b,cb,e),image=await upload(a);
 expect((await command(a,'patch',`/recommendations/${row.id}`,{expectedRevision:row.revision,mediaIds:[image.id]})).status).toBe(200);
 const revision=Number((await admin.query('SELECT revision FROM creator_accounts WHERE id=$1',[a.accountId])).rows[0].revision);
 const feedback=await command(a,'post','/account/deletion-feedback',{reason:'Leaving'});expect(feedback.status).toBe(201);
 const deleted=await command(a,'post','/account/deletion',{expectedRevision:revision,feedbackId:feedback.body.feedback.id});expect(deleted.status).toBe(200);
 await runAccountLifecycleMaintenance(runtime,storage);
 expect((await admin.query('SELECT status FROM creator_accounts WHERE id=$1',[a.accountId])).rows[0].status).toBe('deleted');
 for(const table of ['collections','recommendations','collection_items','recommendation_media','media_assets'])expect((await admin.query(`SELECT count(*) FROM ${table} WHERE account_id=$1`,[a.accountId])).rows[0].count).toBe('0');
 expect((await admin.query('SELECT id FROM entities WHERE id=$1',[e.id])).rowCount).toBe(1);expect((await editable(b,other.row.id)).entityId).toBe(e.id);expect((await request(app.app).get(image.url)).status).toBe(404);
});

it('actual copied local image bytes are denied after every public ancestor changes during native read',async()=>{
 const a=await persona(),c=await list(a),e=await manual(a),{row}=await recommendation(a,c,e),image=await upload(a);expect((await command(a,'patch',`/recommendations/${row.id}`,{expectedRevision:row.revision,mediaIds:[image.id]})).status).toBe(200);await publish(a,c,row);
 const cases=[['creator_accounts','public_profile',false,true,a.accountId],['account_category_settings','is_public',false,true,a.accountId],['collections','visibility','private','public',c.id],['collections','publication_state','draft','published',c.id],['collections','archived_at',new Date(),null,c.id],['recommendations','publication_state','draft','published',row.id],['recommendations','archived_at',new Date(),null,row.id]] as const;
 for(const [table,column,hidden,visible,id] of cases){let enter:()=>void=()=>{},release:()=>void=()=>{};const entered=new Promise<void>(resolve=>{enter=resolve;}),settled=new Promise<void>(resolve=>{release=resolve;});storageGate={entered:enter,settled};const reading=request(app.app).get(image.url).then(reply=>reply);let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([entered,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Native image read not entered')),3000);})]);const where=table==='account_category_settings'?"account_id=$1 AND category='games'":'id=$1';await admin.query(`UPDATE ${table} SET ${column}=$2 WHERE ${where}`,[id,hidden]);release();const reply=await reading;expect(reply.status,table+'.'+column).toBe(404);expect(reply.headers.etag).not.toBe('\"'+createHash('sha256').update(png).digest('hex')+'\"');expect(reply.body.error.code).toBe('NOT_FOUND');expect(reply.headers['content-range']).toBeUndefined();await admin.query(`UPDATE ${table} SET ${column}=$2 WHERE ${where}`,[id,visible]);}
  finally{if(timer)clearTimeout(timer);release();storageGate=undefined;await reading;}
 }
 const visible=await request(app.app).get(image.url);expect(visible.status).toBe(200);expect(Buffer.compare(visible.body,png)).toBe(0);
});

it('populated native Games dump restores exact schema39 rows and runtime grants in an exclusively owned temporary database',async()=>{
 // Source authority is immutable and separate from the temporary restore destination.
 const database='games_restore_'+randomBytes(8).toString('hex'),comment='games-a3m-restore:'+database,url=new URL(sourceAuthority.target);const source=url.pathname.slice(1);if(!/^[a-z_][a-z0-9_]*$/.test(source))throw Error('Unsafe owned database name');
 const invoke=(args:string[],input?:Buffer)=>{const currentHead=execFileSync('git',['rev-parse','HEAD'],{cwd:process.cwd(),encoding:'utf8',windowsHide:true,timeout:10_000,stdio:['ignore','pipe','pipe']}).trim();const fresh=validateGamesRestore(process.env,currentHead,sourceAuthority);const container=fresh.containerId;const child=spawnSync(process.platform==='win32'?'docker.exe':'docker',['exec','-i',container,...args],{input,windowsHide:true,timeout:15000,maxBuffer:64*1024*1024});if(child.status!==0||!Buffer.isBuffer(child.stdout))throw Error('Owned restore child failed');return child.stdout;};
 const before=(await admin.query("SELECT id,checksum,schema_checksum FROM music_schema_migrations ORDER BY id")).rows;
 // collection_items has composite identity, so source census is explicit and deterministic.
 const countSql="SELECT (SELECT count(*) FROM collections WHERE category='games')::text AS lists,(SELECT count(*) FROM recommendations WHERE category='games')::text AS recommendations,(SELECT count(*) FROM collection_items WHERE category='games')::text AS memberships,(SELECT count(*) FROM recommendation_media rm JOIN recommendations r ON r.id=rm.recommendation_id WHERE r.category='games')::text AS media";
 const counts=(await admin.query(countSql)).rows[0];expect(Number(counts.recommendations)).toBeGreaterThan(0);expect(Number(counts.media)).toBeGreaterThan(0);
 const dump=invoke(['pg_dump','-U',url.username,'-d',source,'--format=plain','--no-owner']);expect(dump.length).toBeGreaterThan(0);expect(dump.length).toBeLessThan(64*1024*1024);
 expect((await admin.query('SELECT datname FROM pg_database WHERE datname=$1',[database])).rowCount).toBe(0);await admin.query(`CREATE DATABASE ${database}`);await admin.query(`COMMENT ON DATABASE ${database} IS '${comment}'`);
 let restored:pg.Pool|undefined,reader:pg.Pool|undefined;
 try{invoke(['psql','-U',url.username,'-d',database,'--set','ON_ERROR_STOP=1','--single-transaction'],dump);url.pathname='/'+database;restored=new pg.Pool({connectionString:url.toString(),max:1});expect((await restored.query('SELECT id,checksum,schema_checksum FROM music_schema_migrations ORDER BY id')).rows).toEqual(before);expect(before.at(-1)?.id).toBe('0057_retire_music_category');expect((await restored.query(countSql)).rows[0]).toEqual(counts);
  const original=await admin.query("SELECT r.id,r.entity_id,r.user_rating,r.note,ci.collection_id,ci.display_order FROM recommendations r JOIN collection_items ci ON ci.recommendation_id=r.id AND ci.account_id=r.account_id WHERE r.category='games' ORDER BY r.id,ci.collection_id");expect((await restored.query("SELECT r.id,r.entity_id,r.user_rating,r.note,ci.collection_id,ci.display_order FROM recommendations r JOIN collection_items ci ON ci.recommendation_id=r.id AND ci.account_id=r.account_id WHERE r.category='games' ORDER BY r.id,ci.collection_id")).rows).toEqual(original.rows);
  const runtimeUrl=new URL((runtime as any).options.connectionString);runtimeUrl.pathname='/'+database;reader=new pg.Pool({connectionString:runtimeUrl.toString(),max:1});expect((await reader.query('SELECT current_user')).rows[0].current_user).toBe(role);expect((await reader.query(countSql)).rows[0]).toEqual(counts);
 }finally{await reader?.end();await restored?.end();const authority=(await admin.query("SELECT shobj_description(oid,'pg_database') AS comment FROM pg_database WHERE datname=$1",[database])).rows[0];if(authority?.comment!==comment)throw Error('Owned restore cleanup authority mismatch');await admin.query(`DROP DATABASE ${database}`);expect((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount).toBe(0);}
});
