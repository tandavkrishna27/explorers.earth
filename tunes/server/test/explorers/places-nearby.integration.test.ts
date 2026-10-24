import pg from 'pg';import request from 'supertest';import {afterAll,beforeAll,expect,it} from 'vitest';
import {createHmac,randomUUID} from 'node:crypto';
import {createCanonicalApp} from '../../auth/canonicalApp';import {resolveExplorersAuthConfig} from '../../auth/betterAuth';
import {PlacesNearbyService} from '../../services/placesNearby';

/** WP6: GET /api/explorers/v1/places/nearby and the person-type write refusal (Task 6-3). */
const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51645',EXPLORERS_AUTH_SECRET:'places-nearby-integration-'.repeat(3),GOOGLE_CLIENT_ID:'fixture-only',GOOGLE_CLIENT_SECRET:'fixture-only'});
const calls:Array<{url:string;init:RequestInit}>=[];
const fakeFetch=async(url:string,init:RequestInit)=>{calls.push({url,init});return new Response(JSON.stringify({places:[{id:'g-1',displayName:{text:'Fixture Cafe'},location:{latitude:38.7223,longitude:-9.1393},shortFormattedAddress:'1 Rua, Lisbon'}]}),{status:200});};
let admin:pg.Pool,app:ReturnType<typeof createCanonicalApp>;
beforeAll(()=>{admin=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:4});app=createCanonicalApp(admin,config,{placesNearby:new PlacesNearbyService({googleApiKey:'fixture-key',fetch:fakeFetch})});});
afterAll(async()=>{await admin?.end();});
async function persona(){const userId='places-nearby-'+randomUUID();await admin.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Places owner',$2)",[userId,userId+'@example.invalid']);await admin.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())",[randomUUID(),'google-'+userId,userId]);const context=await app.auth.$context,session=await context.internalAdapter.createSession(userId,false);const cookie=`${context.authCookies.sessionToken.name}=${session.token}.${createHmac('sha256',config.secret).update(session.token).digest('base64')}`;const me=await request(app.app).get('/api/explorers/v1/me').set('cookie',cookie);expect(me.status).toBe(200);return {userId,accountId:me.body.account.id as string,cookie};}
function command(owner:{cookie:string},method:'post'|'patch',path:string,body:object,key=randomUUID()){return request(app.app)[method]('/api/explorers/v1'+path).set('cookie',owner.cookie).set('origin',config.baseURL).set('Idempotency-Key',key).send(body);}
const nearby=(query:string,cookie?:string)=>{const r=request(app.app).get('/api/explorers/v1/places/nearby'+query);return cookie?r.set('cookie',cookie):r;};

it('refuses a signed-out nearby lookup',async()=>{
 const reply=await nearby('?lat=38.7223&lng=-9.1393');
 expect(reply.status).toBe(401);expect(reply.headers['cache-control']).toBe('no-store');
});

it('validates coordinates',async()=>{
 const a=await persona();
 for(const query of ['','?lat=91&lng=0','?lat=10&lng=181','?lat=0&lng=0','?lat=abc&lng=1','?lat=1&lng=1&extra=x']){
  const reply=await nearby(query,a.cookie);
  expect(reply.status,query).toBe(400);
  expect(reply.body.error).toMatchObject({code:'INVALID_INPUT',requestId:expect.any(String)});
 }
});

it('returns nearby places from the injected provider and refuses other methods',async()=>{
 const a=await persona();
 const reply=await nearby('?lat=38.7223&lng=-9.1393',a.cookie);
 expect(reply.status,JSON.stringify(reply.body)).toBe(200);
 expect(reply.headers['cache-control']).toBe('no-store');
 expect(reply.body).toEqual({source:'google',places:[{id:'g-1',title:'Fixture Cafe',subtitle:'1 Rua, Lisbon',lat:38.7223,lng:-9.1393}]});
 expect(calls.at(-1)?.url).toBe('https://places.googleapis.com/v1/places:searchNearby');
 expect((await request(app.app).post('/api/explorers/v1/places/nearby')).status).toBe(405);
});

it('refuses a new person-type place recommendation while a place write works',async()=>{
 const a=await persona();
 const created=await command(a,'post','/collections',{category:'places',title:'Lisbon',slug:'lisbon-'+randomUUID(),visibility:'private',publicationState:'draft'});
 expect(created.status,JSON.stringify(created.body)).toBe(201);
 let collection=created.body.collection;
 const resolved=await command(a,'post','/entities/resolve',{kind:'manual',category:'places',details:{title:'Fixture Cafe'}});
 expect(resolved.status,JSON.stringify(resolved.body)).toBe(200);
 const context={recommendationType:'place',sourceOfRecommendation:'self',contactName:null,contactNumber:null,contactVisibility:'private',placeSocialUrl:null,placeWebsiteUrl:null,creatorSocialUrl:null,legacyPlaceNote:null,personProfileUrl:null,personAddress:null};
 const body=(placeContext:object)=>({category:'places',entityId:resolved.body.entity.id,collectionId:collection.id,expectedCollectionRevision:collection.revision,userRating:null,publicationState:'draft',placeContext});
 const person=await command(a,'post','/recommendations',body({...context,recommendationType:'person',contactName:'Ada'}));
 expect(person.status,JSON.stringify(person.body)).toBe(422);
 expect(JSON.stringify(person.body)).toContain('Recommend people in the People category');
 collection=(await admin.query('SELECT id,revision FROM collections WHERE id=$1',[collection.id])).rows[0];collection.revision=Number(collection.revision);
 const place=await command(a,'post','/recommendations',body(context));
 expect(place.status,JSON.stringify(place.body)).toBe(201);
});
