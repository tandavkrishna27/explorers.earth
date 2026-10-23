import pg from 'pg';import request from 'supertest';import {afterAll,beforeAll,expect,it} from 'vitest';
import {createHmac,randomUUID} from 'node:crypto';
import {createCanonicalApp} from '../../auth/canonicalApp';import {resolveExplorersAuthConfig} from '../../auth/betterAuth';

/** 0068 (DS-04, DS-14, Apps one link, Games developer). Additive only; nothing dropped. */
const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51644',EXPLORERS_AUTH_SECRET:'category-data-shape-integration-'.repeat(3),GOOGLE_CLIENT_ID:'fixture-only',GOOGLE_CLIENT_SECRET:'fixture-only'});
let admin:pg.Pool,app:ReturnType<typeof createCanonicalApp>;
beforeAll(()=>{admin=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:4});app=createCanonicalApp(admin,config);});
afterAll(async()=>{await admin?.end();});
// Helpers follow game-details.integration.test.ts:14-21, generalised over the category.
async function persona(){const userId='data-shape-'+randomUUID();await admin.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Data shape owner',$2)",[userId,userId+'@example.invalid']);await admin.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())",[randomUUID(),'google-'+userId,userId]);const context=await app.auth.$context,session=await context.internalAdapter.createSession(userId,false);const cookie=`${context.authCookies.sessionToken.name}=${session.token}.${createHmac('sha256',config.secret).update(session.token).digest('base64')}`;const me=await request(app.app).get('/api/explorers/v1/me').set('cookie',cookie);expect(me.status).toBe(200);return {userId,accountId:me.body.account.id as string,cookie};}
function command(owner:{cookie:string},method:'post'|'patch',path:string,body:object,key=randomUUID()){return request(app.app)[method]('/api/explorers/v1'+path).set('cookie',owner.cookie).set('origin',config.baseURL).set('Idempotency-Key',key).send(body);}
async function list(a:{cookie:string},category:string){const reply=await command(a,'post','/collections',{category,title:category,slug:category+'-'+randomUUID(),visibility:'private',publicationState:'draft'});expect(reply.status,JSON.stringify(reply.body)).toBe(201);return reply.body.collection;}
async function manual(a:{cookie:string},category:string,details:object){const reply=await command(a,'post','/entities/resolve',{kind:'manual',category,details});expect(reply.status,JSON.stringify(reply.body)).toBe(200);return reply.body.entity;}
async function recommendation(a:{cookie:string},category:string,e:any,extra:object={}){const c=await list(a,category);const reply=await command(a,'post','/recommendations',{category,entityId:e.id,collectionId:c.id,expectedCollectionRevision:c.revision,userRating:null,publicationState:'draft',...extra});expect(reply.status,JSON.stringify(reply.body)).toBe(201);return reply.body.recommendation;}
async function editable(a:{cookie:string},id:string){const reply=await request(app.app).get(`/api/explorers/v1/recommendations/${id}/editable`).set('cookie',a.cookie);expect(reply.status,JSON.stringify(reply.body)).toBe(200);return reply.body.recommendation;}

it('round-trips game developer, product affiliate flag and app other links through HTTP',async()=>{
 const a=await persona();
 const game=await manual(a,'games',{title:'Celeste',developer:'Maddy Makes Games'});
 expect((await admin.query('SELECT developer FROM game_entity_details WHERE entity_id=$1',[game.id])).rows).toEqual([{developer:'Maddy Makes Games'}]);
 expect((await editable(a,(await recommendation(a,'games',game)).id)).gamePresentation.details.developer).toBe('Maddy Makes Games');

 const links=[{label:'Android',url:'https://play.google.com/store/apps/details?id=x'}];
 const appEntity=await manual(a,'apps',{title:'Linked app',appUrl:'https://app.example/x',otherLinks:links});
 expect((await admin.query('SELECT download_url,other_links FROM app_entity_details WHERE entity_id=$1',[appEntity.id])).rows).toEqual([{download_url:null,other_links:links}]);
 expect((await editable(a,(await recommendation(a,'apps',appEntity)).id)).entity.details.otherLinks).toEqual(links);
 // A row written before 0068 keeps its download_url and reads it back as one Download link.
 await admin.query("UPDATE app_entity_details SET other_links='[]',download_url='https://app.example/get' WHERE entity_id=$1",[appEntity.id]);
 expect((await editable(a,(await recommendation(a,'apps',appEntity)).id)).entity.details.otherLinks).toEqual([{label:'Download',url:'https://app.example/get'}]);

 const product=await manual(a,'products',{title:'Linked product',productUrl:'https://shop.example/p'});
 const r=await recommendation(a,'products',product,{productOffer:{price:null,currencyCode:null,buyUrl:'https://aff.example/p',affiliateDisclosed:true}});
 expect((await editable(a,r.id)).productOffer).toMatchObject({buyUrl:'https://aff.example/p',affiliateDisclosed:true});
 await admin.query('UPDATE product_recommendation_context SET buy_url=NULL WHERE recommendation_id=$1',[r.id]);
 // The 0068 backfill statement, verbatim.
 await admin.query(`UPDATE public.product_recommendation_context context SET buy_url=details.product_url
 FROM public.recommendations recommendation
 JOIN public.product_entity_details details ON details.entity_id=recommendation.entity_id
 WHERE recommendation.id=context.recommendation_id AND recommendation.account_id=context.account_id
  AND recommendation.category='products' AND context.buy_url IS NULL`);
 expect((await admin.query('SELECT buy_url FROM product_recommendation_context WHERE recommendation_id=$1',[r.id])).rows).toEqual([{buy_url:'https://shop.example/p'}]);
});

it('refuses a rating on a new People recommendation and a follower count on a new person',async()=>{
 const a=await persona();
 const refused=await command(a,'post','/entities/resolve',{kind:'manual',category:'people',details:{title:'Ada',externalFollowerCountText:'10k'}});
 expect(refused.status).toBe(422);
 const person=await manual(a,'people',{title:'Ada'});
 const c=await list(a,'people');
 const rated=await command(a,'post','/recommendations',{category:'people',entityId:person.id,collectionId:c.id,expectedCollectionRevision:c.revision,userRating:8,publicationState:'draft'});
 expect(rated.status).toBe(422);
 const r=await recommendation(a,'people',person);
 expect((await command(a,'patch',`/recommendations/${r.id}`,{expectedRevision:r.revision,userRating:7})).status).toBe(422);
});
const columns=async(table:string)=>(await admin.query('SELECT column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1',[table])).rows;

it('adds affiliate_disclosed, other_links and developer without dropping old columns',async()=>{
 expect(await columns('product_recommendation_context')).toEqual(expect.arrayContaining([expect.objectContaining({column_name:'affiliate_disclosed',is_nullable:'NO'}),expect.objectContaining({column_name:'buy_url'})]));
 expect(await columns('product_entity_details')).toEqual(expect.arrayContaining([expect.objectContaining({column_name:'product_url'}),expect.objectContaining({column_name:'logo_url'})]));
 expect(await columns('app_entity_details')).toEqual(expect.arrayContaining([expect.objectContaining({column_name:'other_links',is_nullable:'NO'}),expect.objectContaining({column_name:'download_url'})]));
 expect(await columns('game_entity_details')).toEqual(expect.arrayContaining([expect.objectContaining({column_name:'developer',is_nullable:'YES'})]));
 expect(await columns('person_entity_details')).toEqual(expect.arrayContaining([expect.objectContaining({column_name:'external_follower_count_text'})]));
});

it('bounds other_links and developer',async()=>{
 const entity=randomUUID();
 await admin.query("INSERT INTO entities(id,kind,title,origin) VALUES($1,'game','Bound','manual')",[entity]);
 await expect(admin.query("INSERT INTO game_entity_details(entity_id,developer) VALUES($1,'')",[entity])).rejects.toThrow();
 await expect(admin.query("INSERT INTO game_entity_details(entity_id,developer) VALUES($1,' padded ')",[entity])).rejects.toThrow();
 const app=randomUUID();
 await admin.query("INSERT INTO entities(id,kind,title,origin) VALUES($1,'app','Bound app','manual')",[app]);
 await expect(admin.query("INSERT INTO app_entity_details(entity_id,app_url,other_links) VALUES($1,'https://app.example','[1,2,3,4,5]'::jsonb)",[app])).rejects.toThrow();
 await expect(admin.query("INSERT INTO app_entity_details(entity_id,app_url,other_links) VALUES($1,'https://app.example','{}'::jsonb)",[app])).rejects.toThrow();
 await admin.query('DELETE FROM entities WHERE id=ANY($1::uuid[])',[[entity,app]]);
});
