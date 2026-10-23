import pg from 'pg';import request from 'supertest';import {afterAll,beforeAll,expect,it} from 'vitest';
import {createHmac,randomUUID} from 'node:crypto';
import {createCanonicalApp} from '../../auth/canonicalApp';import {resolveExplorersAuthConfig} from '../../auth/betterAuth';
import {applyTaxonomyCatalogImport,dryRunTaxonomyCatalogImport} from '../../services/taxonomyCatalogImport';
import {loadReviewedCuratedTaxonomy} from '../../../scripts/curated-taxonomy-reviewed-import';

/** 0067 (DS-07): seven catalogs, flat shape for the four new ones, movies configured in place. */
const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51645',EXPLORERS_AUTH_SECRET:'curated-taxonomy-integration-'.repeat(3),GOOGLE_CLIENT_ID:'fixture-only',GOOGLE_CLIENT_SECRET:'fixture-only'});
let admin:pg.Pool,app:ReturnType<typeof createCanonicalApp>;
beforeAll(()=>{admin=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:4});app=createCanonicalApp(admin,config);});
afterAll(async()=>{await admin?.end();});

it('0067 adds four unconfigured catalogs and configures movies over its 0037 vocabulary',async()=>{
 const rows=(await admin.query('SELECT category,state,version,default_locale FROM taxonomy_catalogs ORDER BY category')).rows;
 expect(rows.map(r=>r.category)).toEqual(['apps','books','games','movies','people','places','products']);
 for(const c of ['apps','books','games','products'])expect(rows.find(r=>r.category===c)).toMatchObject({state:'UNCONFIGURED',version:'0',default_locale:null});
 expect(rows.find(r=>r.category==='movies')).toMatchObject({state:'CONFIGURED',version:'1',default_locale:'en'});
 // The suite shares one database and other files add fixture movies terms, so count the
 // 0037 vocabulary through its reviewed TMDB mappings (999999 is the suites' fixture genre).
 expect(Number((await admin.query("SELECT count(DISTINCT t.id) n FROM taxonomy_terms t JOIN movie_provider_genre_terms m ON m.term_id=t.id WHERE t.category='movies' AND m.provider_genre_id<>999999")).rows[0].n)).toBe(27);
 expect(Number((await admin.query("SELECT count(*) n FROM taxonomy_terms t WHERE t.category='movies' AND NOT EXISTS(SELECT 1 FROM taxonomy_term_translations x WHERE x.term_id=t.id AND x.locale='en')")).rows[0].n)).toBe(0);
});

it('0067 refuses a parented flat term and a guides catalog',async()=>{
 const db=await admin.connect();
 try{
  await db.query('BEGIN');
  const root=(await db.query("INSERT INTO taxonomy_terms(category,slug,position) VALUES('books','s2-root',0) RETURNING id")).rows[0].id;
  await db.query("INSERT INTO taxonomy_term_translations(term_id,locale,label) VALUES($1,'en','Root')",[root]);
  const child=(await db.query("INSERT INTO taxonomy_terms(category,slug,position,parent_id) VALUES('books','s2-child',1,$1) RETURNING id",[root])).rows[0].id;
  await db.query("INSERT INTO taxonomy_term_translations(term_id,locale,label) VALUES($1,'en','Child')",[child]);
  await expect(db.query('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toThrow(/Unsupported taxonomy hierarchy/);
 }finally{await db.query('ROLLBACK');db.release();}
 await expect(admin.query("INSERT INTO taxonomy_catalogs(category) VALUES('guides')")).rejects.toThrow();
});

it('lock function accepts the new categories and refuses unknown ones',async()=>{
 const db=await admin.connect();
 try{
  await db.query('BEGIN');
  for(const c of ['books','games','apps','products','movies'])await db.query('SELECT lock_explorers_taxonomy_catalog($1)',[c]);
  await expect(db.query("SELECT lock_explorers_taxonomy_catalog('guides')")).rejects.toThrow(/Unsupported taxonomy catalog/);
 }finally{await db.query('ROLLBACK');db.release();}
});

// Apply runs after the UNCONFIGURED assertions above (tests in a file run in order).
it.each(['books','games','apps','products'] as const)('%s: dry-run clean, apply configures v1, identical re-apply is a no-op',async category=>{
 const {input}=loadReviewedCuratedTaxonomy(category);
 // The suite shares one database: explorers-content-revision leaves a books counter at
 // its 2^53-1 ceiling, and apply bumps every affected account's counter once.
 await admin.query('UPDATE account_category_content_state SET revision=1 WHERE category=$1 AND revision>=9007199254740991',[category]);
 const dry=await dryRunTaxonomyCatalogImport(admin as never,input);
 expect(dry.conflicts).toEqual([]);expect(dry.catalogVersion).toBe(1);
 const receipt=await applyTaxonomyCatalogImport(admin as never,input,'wave2-integration');
 expect(receipt.changed).toBe(true);
 expect((await admin.query('SELECT state,version FROM taxonomy_catalogs WHERE category=$1',[category])).rows[0]).toMatchObject({state:'CONFIGURED',version:'1'});
 const again=await applyTaxonomyCatalogImport(admin as never,input,'wave2-integration');
 expect(again.changed).toBe(false);
});

// Helpers follow category-data-shape.integration.test.ts.
async function persona(){const userId='curated-'+randomUUID();await admin.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Curated owner',$2)",[userId,userId+'@example.invalid']);await admin.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())",[randomUUID(),'google-'+userId,userId]);const context=await app.auth.$context,session=await context.internalAdapter.createSession(userId,false);const cookie=`${context.authCookies.sessionToken.name}=${session.token}.${createHmac('sha256',config.secret).update(session.token).digest('base64')}`;const me=await request(app.app).get('/api/explorers/v1/me').set('cookie',cookie);expect(me.status).toBe(200);return {cookie};}
function command(owner:{cookie:string},path:string,body:object){return request(app.app).post('/api/explorers/v1'+path).set('cookie',owner.cookie).set('origin',config.baseURL).set('Idempotency-Key',randomUUID()).send(body);}
async function list(a:{cookie:string},category:string){const reply=await command(a,'/collections',{category,title:category,slug:category+'-'+randomUUID(),visibility:'private',publicationState:'draft'});expect(reply.status,JSON.stringify(reply.body)).toBe(201);return reply.body.collection;}

it('assigns a reviewed books term through HTTP and refuses another category\'s term',async()=>{
 const books=loadReviewedCuratedTaxonomy('books').input,games=loadReviewedCuratedTaxonomy('games').input;
 const fantasy=books.terms.find(t=>t.slug==='fantasy')!.id,action=games.terms.find(t=>t.slug==='action')!.id;
 const a=await persona();
 const entity=await command(a,'/entities/resolve',{kind:'manual',category:'books',details:{title:'Curated book'}});
 expect(entity.status,JSON.stringify(entity.body)).toBe(200);
 const c=await list(a,'books');
 const created=await command(a,'/recommendations',{category:'books',entityId:entity.body.entity.id,collectionId:c.id,expectedCollectionRevision:c.revision,userRating:null,publicationState:'draft',curatedTermId:fantasy});
 expect(created.status,JSON.stringify(created.body)).toBe(201);
 const read=await request(app.app).get(`/api/explorers/v1/recommendations/${created.body.recommendation.id}/editable`).set('cookie',a.cookie);
 expect(read.status,JSON.stringify(read.body)).toBe(200);
 expect(read.body.recommendation.curatedTerm.term).toMatchObject({id:fantasy,slug:'fantasy',label:'Fantasy',unavailable:false});
 const c2=await list(a,'books');
 const refused=await command(a,'/recommendations',{category:'books',entityId:entity.body.entity.id,collectionId:c2.id,expectedCollectionRevision:c2.revision,userRating:null,publicationState:'draft',curatedTermId:action});
 expect(refused.status,JSON.stringify(refused.body)).toBe(422);
});
