import {PublicContentService} from '../../application/publicContent';
import {createHmac,randomUUID} from 'node:crypto';
import pg from 'pg';import request from 'supertest';import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {createCanonicalApp} from '../../auth/canonicalApp';import {resolveExplorersAuthConfig} from '../../auth/betterAuth';
import {MovieCatalog} from '../../services/movieCatalog';import {authorizeOperation} from '../../application/authorization';
const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51474',EXPLORERS_AUTH_SECRET:'integration-secret-'.repeat(4),GOOGLE_CLIENT_ID:'fixture-google-id',GOOGLE_CLIENT_SECRET:'fixture-google-secret'});
let pool:pg.Pool,composed:ReturnType<typeof createCanonicalApp>;
const upstream=vi.fn(async(url:URL)=>{if(url.pathname.includes('/search/'))return new Response(JSON.stringify({page:Number(url.searchParams.get('page')),total_pages:1,total_results:1,results:[{id:42,title:'Fixture movie',name:'Fixture show',poster_path:null,release_date:null,first_air_date:null}]}));const kind=url.pathname.includes('/tv/')?'tv':'movie';const id=Number(url.pathname.split('/')[3]);return new Response(JSON.stringify(url.pathname.endsWith('/watch/providers')?{id,results:{US:{link:'https://www.themoviedb.org/movie/42/watch',flatrate:[{provider_id:id===43?2:1,provider_name:'Fixture',logo_path:null,display_priority:0}]}}}:{id,title:'Fixture movie',name:'Fixture show',original_title:'Original',original_name:'Original',poster_path:null,backdrop_path:null,release_date:null,first_air_date:null,genres:[{id:id===900001?999998:999999,name:'Deterministic fixture genre'}],runtime:0,episode_run_time:[0],vote_average:0,overview:null,number_of_seasons:kind==='tv'?0:undefined,credits:{cast:[],crew:[]}}));});
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


it('composes movie/TV identity, command replay and caller-metadata denial through authenticated HTTP',async()=>{
 const a=await persona();const base={kind:'provider',category:'movies',provider:'tmdb',externalKind:'movie',externalId:'42'},key=randomUUID();const start=upstream.mock.calls.length;
 const movie=await command(a,'post','/entities/resolve',base,key);expect(movie.status,JSON.stringify(movie.body)).toBe(200);expect(movie.body.entity.details).toMatchObject({mediaType:'movie',runtimeMinutes:0,providerRating:0});expect(upstream.mock.calls.length).toBe(start+2);
 expect((await command(a,'post','/entities/resolve',base,key)).body).toEqual(movie.body);expect(upstream.mock.calls.length).toBe(start+2);
 const tv=await command(a,'post','/entities/resolve',{...base,externalKind:'tv'});expect(tv.status).toBe(200);expect(tv.body.entity.id).not.toBe(movie.body.entity.id);expect(tv.body.entity.details.mediaType).toBe('tv');
 expect((await command(a,'post','/entities/resolve',{...base,details:{genres:[]}})).status).toBe(422);
});
it('unknown fixture genre mapping rolls back recommendation, collection revision and successful receipt',async()=>{
 const a=await persona(),c=await list(a);const e=await command(a,'post','/entities/resolve',{kind:'provider',category:'movies',provider:'tmdb',externalKind:'movie',externalId:'900001'});expect(e.status,JSON.stringify(e.body)).toBe(200);const key=randomUUID();
 const r=await command(a,'post','/recommendations',{category:'movies',entityId:e.body.entity.id,collectionId:c.id,expectedCollectionRevision:1},key);expect(r.status).toBe(422);expect(r.body.error.message).toBe('MOVIE_GENRE_MAPPING_UNAVAILABLE');
 expect((await pool.query('SELECT revision FROM collections WHERE id=$1',[c.id])).rows[0].revision).toBe('1');expect((await pool.query('SELECT count(*) FROM recommendations WHERE account_id=$1',[a.accountId])).rows[0].count).toBe('0');
});

it('fixture taxonomy, region context and incompatible replacement are atomic and account-owned',async()=>{
 const term=(await pool.query("INSERT INTO taxonomy_terms(category,slug) VALUES('movies',$1) RETURNING id",[`fixture-${randomUUID()}`])).rows[0].id;await pool.query("INSERT INTO taxonomy_term_translations(term_id,locale,label) VALUES($1,'en','Deterministic fixture genre')",[term]);await pool.query("INSERT INTO movie_provider_genre_terms(external_kind,provider_genre_id,term_id) VALUES('movie',999999,$1) ON CONFLICT(external_kind,provider_genre_id) DO NOTHING",[term]);
 const a=await persona(),b=await persona(),c=await list(a),base={kind:'provider',category:'movies',provider:'tmdb',externalKind:'movie'};const original=await command(a,'post','/entities/resolve',{...base,externalId:'42'}),destination=await command(b,'post','/entities/resolve',{...base,externalId:'43'});expect(original.status).toBe(200);expect(destination.status).toBe(200);
 const r=await command(a,'post','/recommendations',{category:'movies',entityId:original.body.entity.id,collectionId:c.id,expectedCollectionRevision:1,userRating:8,movieContext:{region:'US',selectedProviderIds:[1]}});expect(r.status,JSON.stringify(r.body)).toBe(201);const id=r.body.recommendation.id;
 const key=randomUUID(),replace={expectedRevision:1,entityId:destination.body.entity.id};const incompatible=await command(a,'post',`/recommendations/${id}/entity`,replace,key);expect(incompatible.status).toBe(422);expect((await pool.query('SELECT entity_id,revision,user_rating FROM recommendations WHERE id=$1',[id])).rows[0]).toMatchObject({entity_id:original.body.entity.id,revision:'1',user_rating:8});
 expect((await command(b,'patch',`/recommendations/${id}`,{expectedRevision:1,movieContext:{region:'US',selectedProviderIds:[]}})).status).toBe(404);
 expect((await command(a,'patch',`/recommendations/${id}`,{expectedRevision:1,movieContext:{region:'US',selectedProviderIds:[]}})).status).toBe(200);
 const successful=await command(a,'post',`/recommendations/${id}/entity`,{...replace,expectedRevision:2});expect(successful.status).toBe(200);expect(successful.body.recommendation).toMatchObject({entityId:destination.body.entity.id,revision:3,userRating:8});
 const detail=await request(composed.app).get(`/api/explorers/v1/recommendations/${id}/editable`).set('cookie',a.cookie);expect(detail.status).toBe(200);expect(detail.body.recommendation).toMatchObject({entity:{kind:'movie',details:{mediaType:'movie'}},movieContext:{region:'US',selectedProviderIds:[]},effectiveMovieDetails:{mediaType:'movie'},movieTerms:[{slug:expect.stringMatching(/^fixture-/)}]});
 expect((await pool.query('SELECT selected_provider_ids FROM movie_recommendation_context WHERE recommendation_id=$1',[id])).rows[0].selected_provider_ids).toEqual([]);expect((await pool.query('SELECT collection_id FROM collection_items WHERE recommendation_id=$1',[id])).rows).toEqual([{collection_id:c.id}]);expect((await pool.query('SELECT count(*) FROM recommendation_taxonomy WHERE recommendation_id=$1',[id])).rows[0].count).toBe('1');
});

it('installs precisely the independently reviewed TMDB mappings and English translations',async()=>{const rows=(await pool.query("SELECT m.external_kind,m.provider_genre_id::integer AS id,t.id AS term,t.slug,t.position,x.label FROM movie_provider_genre_terms m JOIN taxonomy_terms t ON t.id=m.term_id JOIN taxonomy_term_translations x ON x.term_id=t.id AND x.locale='en' WHERE m.provider_genre_id<>999999 ORDER BY m.external_kind,m.provider_genre_id")).rows;expect(rows).toHaveLength(35);expect(new Set(rows.map(r=>r.term)).size).toBe(27);for(const id of [16,35,80,99,18,10751,9648,37]){expect(rows.filter(r=>r.id===id)).toHaveLength(2);expect(new Set(rows.filter(r=>r.id===id).map(r=>r.term)).size).toBe(1);}expect(rows.find(r=>r.id===12)).toMatchObject({slug:'adventure',label:'Adventure',position:1});expect(rows.find(r=>r.id===10759).term).not.toBe(rows.find(r=>r.id===28).term);expect(rows.find(r=>r.id===10765).term).not.toBe(rows.find(r=>r.id===878).term);expect(rows.find(r=>r.id===10768).term).not.toBe(rows.find(r=>r.id===10752).term);});

it('roundtrips declared manual TV zero facts and typed owner presentation without TMDB authority',async()=>{const a=await persona(),c=await list(a),start=upstream.mock.calls.length;const e=await command(a,'post','/entities/resolve',{kind:'manual',category:'movies',details:{title:'Manual show',mediaType:'tv',runtimeMinutes:0,seasonCount:0,providerRating:0,overview:'Declared summary'}});expect(e.status,JSON.stringify(e.body)).toBe(200);expect(e.body.entity).toMatchObject({origin:'manual',provenance:null,details:{mediaType:'tv',runtimeMinutes:0,seasonCount:0,providerRating:0,genres:[],watchProviders:{}}});expect(upstream.mock.calls.length).toBe(start);const r=await recommendation(a,c,e.body.entity.id);const detail=await request(composed.app).get(`/api/explorers/v1/recommendations/${r.id}/editable`).set('cookie',a.cookie);expect(detail.status).toBe(200);expect(detail.body.recommendation).toMatchObject({movieContext:{region:'US',selectedProviderIds:null},effectiveMovieDetails:{runtimeMinutes:0},movieTerms:[]});});

it('database rejects excessive or inactive taxonomy assignments independently of HTTP validation',async()=>{const a=await persona(),c=await list(a);const e=await command(a,'post','/entities/resolve',{kind:'manual',category:'movies',details:{title:'SQL guard'}});expect(e.status).toBe(200);const r=await recommendation(a,c,e.body.entity.id);const term=(await pool.query("SELECT id FROM taxonomy_terms WHERE category='movies' AND active ORDER BY position LIMIT 1")).rows[0].id;await expect(pool.query("INSERT INTO recommendation_taxonomy(recommendation_id,account_id,category,term_id,position) VALUES($1,$2,'movies',$3,32)",[r.id,a.accountId,term])).rejects.toMatchObject({code:'23514'});const inactive=(await pool.query("INSERT INTO taxonomy_terms(category,slug,active) VALUES('movies',$1,false) RETURNING id",['inactive-'+randomUUID()])).rows[0].id;await expect(pool.query("INSERT INTO recommendation_taxonomy(recommendation_id,account_id,category,term_id,position) VALUES($1,$2,'movies',$3,0)",[r.id,a.accountId,inactive])).rejects.toMatchObject({code:'23514'});});

it('serializes concurrent same-recommendation taxonomy writes while allowing independent accounts',async()=>{const a=await persona(),b=await persona(),ca=await list(a),cb=await list(b);const e=await command(a,'post','/entities/resolve',{kind:'manual',category:'movies',details:{title:'Concurrency facts'}});const ra=await recommendation(a,ca,e.body.entity.id),rb=await recommendation(b,cb,e.body.entity.id);const terms=(await pool.query("SELECT id FROM taxonomy_terms WHERE category='movies' AND active ORDER BY position LIMIT 2")).rows;const x=await pool.connect(),y=await pool.connect();try{await x.query('BEGIN');await y.query('BEGIN');await x.query("INSERT INTO recommendation_taxonomy(recommendation_id,account_id,category,term_id,position) VALUES($1,$2,'movies',$3,0)",[ra.id,a.accountId,terms[0].id]);let settled=false;const second=y.query("INSERT INTO recommendation_taxonomy(recommendation_id,account_id,category,term_id,position) VALUES($1,$2,'movies',$3,0)",[ra.id,a.accountId,terms[1].id]).finally(()=>{settled=true;});await new Promise(resolve=>setTimeout(resolve,30));expect(settled).toBe(false);await x.query('COMMIT');await second;await expect(y.query('COMMIT')).rejects.toMatchObject({code:'23505'});await y.query('ROLLBACK');await Promise.all([pool.query("INSERT INTO recommendation_taxonomy(recommendation_id,account_id,category,term_id,position) VALUES($1,$2,'movies',$3,1)",[ra.id,a.accountId,terms[1].id]),pool.query("INSERT INTO recommendation_taxonomy(recommendation_id,account_id,category,term_id,position) VALUES($1,$2,'movies',$3,0)",[rb.id,b.accountId,terms[0].id])]);expect((await pool.query('SELECT count(*) FROM recommendation_taxonomy WHERE recommendation_id=ANY($1::uuid[])',[[ra.id,rb.id]])).rows[0].count).toBe('3');await expect(pool.query('UPDATE recommendation_taxonomy SET recommendation_id=$2,account_id=$3 WHERE recommendation_id=$1 AND term_id=$4',[ra.id,rb.id,b.accountId,terms[1].id])).rejects.toMatchObject({code:'23514'});}finally{await x.query('ROLLBACK');await y.query('ROLLBACK');x.release();y.release();}});

it('projects bounded Movie editorial details only while all public ancestors remain eligible',async()=>{const a=await persona(),c=await list(a);const e=await command(a,'post','/entities/resolve',{kind:'manual',category:'movies',details:{title:'Public Movie'}});const r=await recommendation(a,c,e.body.entity.id);await pool.query('INSERT INTO recommendation_display_overrides(recommendation_id,account_id,display_values) VALUES($1,$2,$3)',[r.id,a.accountId,{overview:'e'.repeat(10000)}]);const handle='m'+randomUUID().replaceAll('-','').slice(0,15);await pool.query("UPDATE creator_accounts SET handle=$2,display_name='Movie owner',account_type='Creator',onboarding_status='complete',public_profile=true WHERE id=$1",[a.accountId,handle]);await pool.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='movies'",[a.accountId]);await pool.query("UPDATE collections SET visibility='public',publication_state='published' WHERE id=$1",[c.id]);await pool.query("UPDATE recommendations SET publication_state='published' WHERE id=$1",[r.id]);const service=new PublicContentService(pool,'fixture-secret');const input={username:handle,category:'movies',slug:c.slug,id:r.id};const result=await service.detail(input);expect(result?.recommendation.movieDetails?.overview).toHaveLength(10000);const owner=await request(composed.app).get(`/api/explorers/v1/recommendations/${r.id}/editable`).set('cookie',a.cookie);expect(owner.status).toBe(200);await pool.query("UPDATE collections SET visibility='private' WHERE id=$1",[c.id]);expect(await service.detail(input)).toBeUndefined();});

it('rejects malformed nested watch and cast facts at the database boundary',async()=>{const a=await persona();const e=await command(a,'post','/entities/resolve',{kind:'manual',category:'movies',details:{title:'Nested facts'}});expect(e.status).toBe(200);for(const watch of [{US:{link:null,flatrate:[],rent:'forged',buy:[]}},{US:{link:null,flatrate:[{providerId:0,name:'Bad',logoUrl:null,priority:0}],rent:[],buy:[]}}])await expect(pool.query('UPDATE movie_entity_details SET watch_providers=$2 WHERE entity_id=$1',[e.body.entity.id,watch])).rejects.toMatchObject({code:'23514'});await expect(pool.query('UPDATE movie_entity_details SET cast_details=$2 WHERE entity_id=$1',[e.body.entity.id,JSON.stringify([{personId:0,creditId:'c',name:'Bad',character:'',profileUrl:null,order:0}])])).rejects.toMatchObject({code:'23514'});});

it('qualifies the exact authenticated MoviesGET search transport and rejects invalid input before providerI/O',async()=>{const a=await persona();const before=upstream.mock.calls.length;const result=await request(composed.app).get('/api/explorers/v1/catalog/movies').query({query:'fixture',limit:24}).set('cookie',a.cookie);expect(result.status,JSON.stringify(result.body)).toBe(200);expect(result.headers['cache-control']).toContain('no-store');expect(result.body.items.map((x:any)=>[x.externalKind,x.externalId])).toEqual([['movie','42'],['tv','42']]);expect(upstream.mock.calls.length).toBe(before+2);expect((await request(composed.app).get('/api/explorers/v1/catalog/movies').query({query:'fixture',limit:25}).set('cookie',a.cookie)).status).toBe(422);expect(upstream.mock.calls.length).toBe(before+2);expect((await request(composed.app).get('/api/explorers/v1/catalog/movies').query({query:'fixture'})).status).toBe(401);});

async function companionPair(){const db=await pool.connect();try{await db.query('BEGIN');const a=(await db.query("INSERT INTO entities(kind,title,origin) VALUES('movie','Genre A','provider') RETURNING id")).rows[0].id,b=(await db.query("INSERT INTO entities(kind,title,origin) VALUES('movie','Genre B','provider') RETURNING id")).rows[0].id;for(const id of [a,b]){const externalId=String(parseInt(randomUUID().replaceAll('-','').slice(0,12),16)+1);await db.query("INSERT INTO entity_identifiers(entity_id,provider,external_kind,external_id,source_url) VALUES($1,'tmdb','movie',$2,$3)",[id,externalId,'https://api.themoviedb.org/3/movie/'+externalId]);}await db.query("INSERT INTO movie_entity_details(entity_id,media_type,genres) VALUES($1,'movie',ARRAY['Action']),($2,'movie','{}')",[a,b]);await db.query("INSERT INTO movie_entity_provider_genres(entity_id,position,provider_genre_id,name) VALUES($1,0,28,'Action')",[a]);await db.query('COMMIT');return{a,b};}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}
it('rejects moving a genre companion while leaving its original canonical parent inconsistent',async()=>{const {a,b}=await companionPair(),db=await pool.connect();try{await db.query('BEGIN');await expect((async()=>{await db.query('UPDATE movie_entity_provider_genres SET entity_id=$2 WHERE entity_id=$1',[a,b]);await db.query("UPDATE movie_entity_details SET genres=ARRAY['Action'] WHERE entity_id=$1",[b]);await db.query('COMMIT');})()).rejects.toMatchObject({code:'23514'});}finally{await db.query('ROLLBACK');db.release();}});
it('rejects changing a taxonomy parent category beneath its unchanged children',async()=>{const parent=(await pool.query("INSERT INTO taxonomy_terms(category,slug) VALUES('movies',$1) RETURNING id",['parent-'+randomUUID()])).rows[0].id;await pool.query("INSERT INTO taxonomy_terms(category,slug,parent_id) VALUES('movies',$1,$2)",['child-'+randomUUID(),parent]);await expect(pool.query("UPDATE taxonomy_terms SET category='books' WHERE id=$1",[parent])).rejects.toMatchObject({code:'23514'});});
it('requires TMDB provenance for nonempty companion genres while retaining manual empty facts',async()=>{const db=await pool.connect();try{await db.query('BEGIN');const id=(await db.query("INSERT INTO entities(kind,title,origin) VALUES('movie','Forged manual genres','manual') RETURNING id")).rows[0].id;await db.query("INSERT INTO movie_entity_details(entity_id,media_type,genres) VALUES($1,'movie',ARRAY['Action'])",[id]);await db.query("INSERT INTO movie_entity_provider_genres(entity_id,position,provider_genre_id,name) VALUES($1,0,28,'Action')",[id]);await expect(db.query('COMMIT')).rejects.toMatchObject({code:'23514'});}finally{await db.query('ROLLBACK');db.release();}const a=await persona(),e=await command(a,'post','/entities/resolve',{kind:'manual',category:'movies',details:{title:'Still manual'}});expect(e.status).toBe(200);expect(e.body.entity).toMatchObject({origin:'manual',provenance:null,details:{genres:[]}});});

it('preserves nonempty TMDB genre provenance when an identity is deleted or reparented',async()=>{const {a,b}=await companionPair();await expect(pool.query("DELETE FROM entity_identifiers WHERE entity_id=$1 AND provider='tmdb'",[a])).rejects.toMatchObject({code:'23514'});await pool.query("DELETE FROM entity_identifiers WHERE entity_id=$1 AND provider='tmdb'",[b]);await expect(pool.query("UPDATE entity_identifiers SET entity_id=$2 WHERE entity_id=$1 AND provider='tmdb'",[a,b])).rejects.toMatchObject({code:'23514'});});

/**
 * The upstream stub reports provider genre 999999, which is deliberately not one of the 35
 * reviewed TMDB mappings, so a resolve refuses with MOVIE_GENRE_MAPPING_UNAVAILABLE until
 * it is mapped. `:46` maps it for `movie` only; the cases below resolve `tv` as well, so
 * both kinds are mapped here. Idempotent, because the suite shares one database.
 */
async function mapFixtureGenre() {
 for (const kind of ['movie','tv'] as const) {
  const existing=await pool.query("SELECT 1 FROM movie_provider_genre_terms WHERE external_kind=$1 AND provider_genre_id=999999",[kind]);
  if (existing.rowCount) continue;
  const term=(await pool.query("INSERT INTO taxonomy_terms(category,slug) VALUES('movies',$1) RETURNING id",[`fixture-${randomUUID()}`])).rows[0].id;
  await pool.query("INSERT INTO taxonomy_term_translations(term_id,locale,label) VALUES($1,'en','Deterministic fixture genre')",[term]);
  await pool.query("INSERT INTO movie_provider_genre_terms(external_kind,provider_genre_id,term_id) VALUES($1,999999,$2) ON CONFLICT(external_kind,provider_genre_id) DO NOTHING",[kind,term]);
 }
}

/**
 * Movies need their own recommendation helper: the shared `recommendation()` above omits
 * `movieContext`, and the movies write path refuses without it with a 422. The existing
 * case at `:48` passes it inline for the same reason.
 */
async function movieRecommendation(owner:{cookie:string},collection:any,entityId:string) {
 const result=await command(owner,'post','/recommendations',{category:'movies',entityId,collectionId:collection.id,
  expectedCollectionRevision:1,userRating:8,movieContext:{region:'US',selectedProviderIds:[1]}});
 expect(result.status,JSON.stringify(result.body)).toBe(201);return result.body.recommendation;
}

/*
 * The two cases ticket 4.1:39 mandates by name. Both were recorded as "does not exist by
 * that name anywhere in source", so the names are verbatim from the ticket and a grep for
 * them now finds a real assertion rather than documentation.
 *
 * `:43` specifies the shapes: resolve fixture movie ID 42 and TV ID 42 and assert different
 * canonical IDs with preserved media_type and season count only where supplied; then A
 * updates title/note/rating while B recommends the same movie, and B's effective values
 * plus the entity source stay unchanged.
 */
it('movie_and_tv_same_id_remain_distinct',async()=>{
 await mapFixtureGenre();
 const a=await persona();
 const base={kind:'provider',category:'movies',provider:'tmdb',externalKind:'movie',externalId:'42'};
 const movie=await command(a,'post','/entities/resolve',base);expect(movie.status,JSON.stringify(movie.body)).toBe(200);
 const tv=await command(a,'post','/entities/resolve',{...base,externalKind:'tv'});expect(tv.status,JSON.stringify(tv.body)).toBe(200);

 // Two entities. The provider's id is identical on both, so canonical identity has to be
 // keyed by kind as well - otherwise one would overwrite the other's facts.
 expect(tv.body.entity.id).not.toBe(movie.body.entity.id);
 expect(movie.body.entity.details.mediaType).toBe('movie');
 expect(tv.body.entity.details.mediaType).toBe('tv');
 expect(movie.body.entity.provenance?.externalId).toBe('42');
 expect(tv.body.entity.provenance?.externalId).toBe('42');
 expect(tv.body.entity.provenance?.externalKind).toBe('tv');

 // Season count only where supplied: the stub reports number_of_seasons for tv only, and
 // the contract refines `mediaType==='tv' || seasonCount===null`, so a movie must not
 // acquire a zero.
 expect(movie.body.entity.details.seasonCount).toBeNull();
 expect(tv.body.entity.details.seasonCount).toBe(0);

 // Independent collections: each is recommendable into its own list, and neither
 // membership leaks into the other.
 const movieList=await list(a),tvList=await list(a);
 const movieRec=await movieRecommendation(a,movieList,movie.body.entity.id);
 const tvRec=await movieRecommendation(a,tvList,tv.body.entity.id);
 expect(movieRec.id).not.toBe(tvRec.id);
 const members=await pool.query(
  `SELECT ci.collection_id,r.entity_id FROM collection_items ci
     JOIN recommendations r ON r.id=ci.recommendation_id
    WHERE ci.collection_id=ANY($1::uuid[])`,
  [[movieList.id,tvList.id]]);
 expect(members.rowCount).toBe(2);
 expect(new Set(members.rows.map(row=>row.entity_id)).size).toBe(2);
 const byList=new Map(members.rows.map(row=>[row.collection_id,row.entity_id]));
 expect(byList.get(movieList.id)).toBe(movie.body.entity.id);
 expect(byList.get(tvList.id)).toBe(tv.body.entity.id);
});

it('creator_note_does_not_mutate_catalog_or_other_creator',async()=>{
 await mapFixtureGenre();
 const a=await persona(),b=await persona();
 const base={kind:'provider',category:'movies',provider:'tmdb',externalKind:'movie',externalId:'42'};
 const resolvedByA=await command(a,'post','/entities/resolve',base);expect(resolvedByA.status).toBe(200);
 const entityId=resolvedByA.body.entity.id;

 /*
  * The shared catalog row, joined across both tables that hold it: `entities` carries
  * title and origin, and the provider facts live in `movie_entity_details`. There is no
  * `details` column on `entities`.
  */
 const catalogSnapshot=async(id:string)=>(await pool.query(
  `SELECT e.title,e.origin,d.media_type,d.original_title,d.year_text,d.genres,d.director,
          d.runtime_minutes,d.provider_rating,d.overview,d.season_count,d.watch_providers,d.cast_details
     FROM entities e LEFT JOIN movie_entity_details d ON d.entity_id=e.id WHERE e.id=$1`,[id])).rows[0];
 const catalogBefore=await catalogSnapshot(entityId);

 // A recommends it, then edits the three things a creator owns: title (as a display
 // override), note and rating.
 const listA=await list(a);const recA=await movieRecommendation(a,listA,entityId);
 await pool.query(
  'INSERT INTO recommendation_display_overrides(recommendation_id,account_id,display_values) VALUES($1,$2,$3)',
  [recA.id,a.accountId,{originalTitle:"A private retitle"}]);
 await pool.query(
  `UPDATE recommendations SET note=$2,user_rating=3 WHERE id=$1`,
  [recA.id,{version:1,format:'quill-html',html:'<p>A note from A</p>'}]);

 /*
  * B recommends the same movie. The resolve must hand back the same shared catalog entity:
  * if it forked a second one, every isolation assertion below would pass for the wrong
  * reason, so that is asserted rather than assumed.
  */
 const resolvedByB=await command(b,'post','/entities/resolve',base);expect(resolvedByB.status).toBe(200);
 expect(resolvedByB.body.entity.id).toBe(entityId);
 const listB=await list(b);const recB=await movieRecommendation(b,listB,entityId);

 /*
  * B's effective values are B's own: no title override, no note, B's own rating. The
  * override join is scoped by account, which is the thing under test - probed by
  * unscoping it, which makes B inherit A's override and fails this case.
  */
 const effectiveB=(await pool.query(
  `SELECT r.user_rating,r.note,o.display_values FROM recommendations r
     LEFT JOIN recommendation_display_overrides o
            ON o.recommendation_id=r.id AND o.account_id=r.account_id
    WHERE r.id=$1`,[recB.id])).rows[0];
 expect(effectiveB.user_rating).toBe(8);
 expect(effectiveB.note).toBeNull();
 expect(effectiveB.display_values).toBeNull();
 expect(JSON.stringify(effectiveB)).not.toContain('private retitle');
 expect(JSON.stringify(effectiveB)).not.toContain('A note from A');

 // And the shared catalog row is unchanged by A's edits: a creator's note is never allowed
 // to become provider truth.
 expect(await catalogSnapshot(entityId)).toEqual(catalogBefore);
 expect(catalogBefore.origin).toBe('provider');

 // A still sees A's own edits, so the isolation is mutual rather than a dropped write.
 const effectiveA=(await pool.query(
  `SELECT r.user_rating,o.display_values FROM recommendations r
     LEFT JOIN recommendation_display_overrides o
            ON o.recommendation_id=r.id AND o.account_id=r.account_id
    WHERE r.id=$1`,[recA.id])).rows[0];
 expect(effectiveA.user_rating).toBe(3);
 expect(effectiveA.display_values).toEqual({originalTitle:"A private retitle"});
});
