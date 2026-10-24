import {createHmac,randomUUID} from 'node:crypto';
import pg from 'pg';import request from 'supertest';import {afterAll,beforeAll,expect,it} from 'vitest';
import {createCanonicalApp} from '../../auth/canonicalApp';import {resolveExplorersAuthConfig} from '../../auth/betterAuth';

/**
 * GMS-X01: a manual game's year, platforms and genres (migration 0064) through the real
 * HTTP surface on PostgreSQL: manual resolve -> owner editable -> public games page.
 * Runs on the plain DATABASE_URL_TEST service (games.integration.test.ts needs an attested
 * owned C10 container, which only tunes.yml can provide).
 */
const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51644',EXPLORERS_AUTH_SECRET:'game-details-integration-'.repeat(4),GOOGLE_CLIENT_ID:'fixture-only',GOOGLE_CLIENT_SECRET:'fixture-only'});
let admin:pg.Pool,app:ReturnType<typeof createCanonicalApp>;
beforeAll(()=>{admin=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:4});app=createCanonicalApp(admin,config);});
afterAll(async()=>{await admin?.end();});
async function persona(){const userId='game-details-'+randomUUID();await admin.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Games owner',$2)",[userId,userId+'@example.invalid']);await admin.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())",[randomUUID(),'google-'+userId,userId]);const context=await app.auth.$context,session=await context.internalAdapter.createSession(userId,false);const cookie=`${context.authCookies.sessionToken.name}=${session.token}.${createHmac('sha256',config.secret).update(session.token).digest('base64')}`;const me=await request(app.app).get('/api/explorers/v1/me').set('cookie',cookie);expect(me.status).toBe(200);return {userId,accountId:me.body.account.id as string,cookie};}
function command(owner:{cookie:string},method:'post'|'patch'|'delete',path:string,body:object,key=randomUUID()){return request(app.app)[method]('/api/explorers/v1'+path).set('cookie',owner.cookie).set('origin',config.baseURL).set('Idempotency-Key',key).send(body);}
async function list(a:{cookie:string}){const reply=await command(a,'post','/collections',{category:'games',title:'Games',slug:'games-'+randomUUID(),visibility:'private',publicationState:'draft'});expect(reply.status).toBe(201);return reply.body.collection;}
async function manual(a:{cookie:string},title:string){const reply=await command(a,'post','/entities/resolve',{kind:'manual',category:'games',details:{title}});expect(reply.status,JSON.stringify(reply.body)).toBe(200);return reply.body.entity;}
async function recommendation(a:{cookie:string},c:any,e:any){const reply=await command(a,'post','/recommendations',{category:'games',entityId:e.id,collectionId:c.id,expectedCollectionRevision:c.revision,userRating:null,publicationState:'draft'});expect(reply.status,JSON.stringify(reply.body)).toBe(201);return {row:reply.body.recommendation};}
async function editable(a:{cookie:string},id:string){const reply=await request(app.app).get(`/api/explorers/v1/recommendations/${id}/editable`).set('cookie',a.cookie);expect(reply.status,JSON.stringify(reply.body)).toBe(200);return reply.body.recommendation;}
async function publish(a:{accountId:string},c:any,r:any){const handle='games'+randomUUID().replaceAll('-','').slice(0,16);await admin.query("UPDATE creator_accounts SET handle=$2,display_name='Games',account_type='Creator',onboarding_status='complete',public_profile=true WHERE id=$1",[a.accountId,handle]);await admin.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='games'",[a.accountId]);await admin.query("UPDATE collections SET visibility='public',publication_state='published' WHERE id=$1",[c.id]);await admin.query("UPDATE recommendations SET publication_state='published' WHERE id=$1",[r.id]);return handle;}

it('actual manual game keeps year, platforms and genres through create, owner edit and public read (GMS-X01)',async()=>{
 const a=await persona(),c=await list(a);
 const details={title:'Celeste',releaseYear:2018,platforms:['PC (Microsoft Windows)','Nintendo Switch'],genres:['Platform','Indie']};
 const resolved=await command(a,'post','/entities/resolve',{kind:'manual',category:'games',details});expect(resolved.status,JSON.stringify(resolved.body)).toBe(200);
 const e=resolved.body.entity;expect((await admin.query('SELECT release_year,platforms,genres FROM game_entity_details WHERE entity_id=$1',[e.id])).rows).toEqual([{release_year:2018,platforms:details.platforms,genres:details.genres}]);
 const {row}=await recommendation(a,c,e);
 expect((await editable(a,row.id)).gamePresentation.details).toEqual({releaseYear:2018,platforms:details.platforms,genres:details.genres,developer:null});
 const handle=await publish(a,c,row),page=await request(app.app).get(`/api/explorers/v1/profiles/${handle}/recommendations/games`);expect(page.status).toBe(200);
 expect(page.body.gameLists[0].recommendations[0].gamePresentation.details).toEqual({releaseYear:2018,platforms:details.platforms,genres:details.genres,developer:null});
 const plain=await manual(a,'No details');expect((await admin.query('SELECT 1 FROM game_entity_details WHERE entity_id=$1',[plain.id])).rowCount).toBe(0);
 const {row:plainRow}=await recommendation(a,await list(a),plain);expect((await editable(a,plainRow.id)).gamePresentation.details).toEqual({releaseYear:null,platforms:[],genres:[],developer:null});
 for(const bad of [{releaseYear:1850},{platforms:Array.from({length:13},(_,i)=>`p${i}`)},{genres:['']},{platforms:'PC'}]){const reply=await command(a,'post','/entities/resolve',{kind:'manual',category:'games',details:{title:'Bad',...bad}});expect(reply.status,JSON.stringify(bad)).toBe(422);}
 await expect(admin.query("INSERT INTO game_entity_details(entity_id,genres) VALUES($1,ARRAY[''])",[plain.id])).rejects.toThrow();
});

