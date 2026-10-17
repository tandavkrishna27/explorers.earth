import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createCanonicalApp } from '../auth/canonicalApp';
import { resolveExplorersAuthConfig } from '../auth/betterAuth';
import { emptyBookDetails } from '../../shared/explorersBookContract';
import { publicRecommendationDetailSchema } from '../../shared/explorersPublicContentContract';
let pool:pg.Pool, app:ReturnType<typeof createCanonicalApp>['app'];
beforeAll(()=>{pool=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:4});app=createCanonicalApp(pool,resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51474',EXPLORERS_AUTH_SECRET:'public-test-secret-'.repeat(4),GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture'})).app;});
afterAll(async()=>{await pool.end();});
async function fixture(count=5) {
  const handle=`p${randomUUID().replaceAll('-','').slice(0,20)}`;
  const account=(await pool.query("INSERT INTO creator_accounts(handle,display_name,account_type,public_profile,onboarding_status) VALUES($1,'Public','Personal',true,'complete') RETURNING id",[handle])).rows[0].id;
  await pool.query("INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,'books',true,0)",[account]);
  const collection=(await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order,visibility,publication_state) VALUES($1,'books','Reading','reading',0,'public','published') RETURNING id",[account])).rows[0].id;
  const entity=(await pool.query("INSERT INTO entities(kind,title,origin) VALUES('book','Public title','manual') RETURNING id")).rows[0].id;
  const ids:string[]=[];
  for(let order=0;order<count;order++) {
    const id=(await pool.query("INSERT INTO recommendations(account_id,entity_id,category,user_rating,publication_state,note) VALUES($1,$2,'books',8,'published','{\"private\":\"secret\"}') RETURNING id",[account,entity])).rows[0].id;
    await pool.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'books',$4)",[collection,id,account,order]);ids.push(id);
  }
  const path=`/api/explorers/v1/public/profiles/${handle}/collections/books`;
  return {account,collection,entity,ids,handle,path,children:`${path}/reading/recommendations`};
}
// Ticket 2.4 / step 4. The canonical replacement for the Strapi username-availability
// query the three username inputs ran while typing. Public by parity with what it
// replaces, which was reachable unauthenticated from the landing page.
const availability=(handle:string)=>`/api/explorers/v1/public/handles/${handle}/available`;

it('answers availability for any account holding the handle, not only a public one',async()=>{
  const taken=await fixture(1);
  expect((await request(app).get(availability(taken.handle))).body).toEqual({available:false});
  // A private, incomplete account still holds its handle: absence from the public profile
  // read next door does NOT mean free, which is why this cannot be answered from there.
  const hidden=`h${randomUUID().replaceAll('-','').slice(0,20)}`;
  await pool.query("INSERT INTO creator_accounts(handle,display_name,account_type,public_profile,onboarding_status) VALUES($1,'Hidden','Personal',false,'incomplete')",[hidden]);
  expect((await request(app).get(availability(hidden))).body).toEqual({available:false});
  expect((await request(app).get(`/api/explorers/v1/public/profiles/${hidden}/collections/books`)).status).toBe(404);
  const free=`f${randomUUID().replaceAll('-','').slice(0,20)}`;
  expect((await request(app).get(availability(free))).body).toEqual({available:true});
});

it('resolves the handle case-insensitively, so one handle cannot look free in two spellings',async()=>{
  const taken=await fixture(1);
  expect((await request(app).get(availability(taken.handle.toUpperCase()))).body).toEqual({available:false});
});

it('refuses a handle the write would refuse as malformed, rather than calling it free',async()=>{
  // Same bound as updateAccountInputSchema.handle: 3-30 characters. Reporting a
  // two-character handle as available would send a creator into a form the write rejects.
  for(const handle of ['ab','a'.repeat(31)])
    expect((await request(app).get(availability(handle))).status).toBe(400);
  expect((await request(app).get(`${availability('freehandle')}?extra=1`)).status).toBe(400);
  expect((await request(app).post(availability('freehandle'))).status).toBe(405);
});

it('never lets an availability answer be cached',async()=>{
  const response=await request(app).get(availability(`c${randomUUID().replaceAll('-','').slice(0,20)}`));
  expect(response.headers['cache-control']).toBe('no-store');
});

it('pages public children beyond page one using safe explicit projection',async()=>{
  const f=await fixture(53);const first=await request(app).get(f.children).query({limit:2});expect(first.status).toBe(200);
  expect(first.body.items).toEqual(f.ids.slice(0,2).map(id=>({id,title:'Public title',kind:'book',userRating:8})));
  expect(first.headers['cache-control']).toBe('no-store');expect(first.body.nextCursor).toEqual(expect.any(String));
  expect(JSON.stringify(first.body)).not.toContain(f.account);expect(JSON.stringify(first.body)).not.toContain(f.entity);expect(JSON.stringify(first.body)).not.toContain('secret');
  const second=await request(app).get(f.children).query({limit:2,cursor:first.body.nextCursor});expect(second.status).toBe(200);expect(second.body.items.map((x:any)=>x.id)).toEqual(f.ids.slice(2,4));
  const seen=first.body.items.concat(second.body.items).map((x:any)=>x.id);let cursor=second.body.nextCursor;
  while(cursor) {const page=await request(app).get(f.children).query({limit:2,cursor});expect(page.status).toBe(200);seen.push(...page.body.items.map((x:any)=>x.id));cursor=page.body.nextCursor;}
  expect(seen).toEqual(f.ids);
});
it('projects effective override string/null and invalidates public continuation without leaking raw values',async()=>{
 const f=await fixture(3),first=await request(app).get(f.children).query({limit:1});expect(first.status).toBe(200);
 await pool.query('UPDATE recommendations SET note=NULL WHERE account_id=$1',[f.account]);
 await pool.query('INSERT INTO recommendation_display_overrides(recommendation_id,account_id,display_values) VALUES($1,$3,$4),($2,$3,$5)',[f.ids[0],f.ids[1],f.account,{title:'😀 Edited'},{title:null}]);
 expect((await request(app).get(f.children).query({limit:1,cursor:first.body.nextCursor})).status).toBe(409);
 const page=await request(app).get(f.children);expect(page.status).toBe(200);expect(page.body.items.map((v:any)=>v.title)).toEqual(['😀 Edited',null,'Public title']);
 for(const id of f.ids.slice(0,2)) {
  const detail=await request(app).get(`${f.children}/${id}`);expect(detail.status).toBe(200);
  expect(publicRecommendationDetailSchema.parse(detail.body)).toEqual(detail.body);
  expect(Object.keys(detail.body.recommendation).sort()).toEqual(['bookContext','bookCovers','bookDetails','id','kind','note','title','userRating']);
  expect(detail.body).toEqual({version:'explorers-public-content/v1',recommendation:{id,title:id===f.ids[0]?'😀 Edited':null,kind:'book',userRating:8,note:null,
   bookDetails:emptyBookDetails(),bookContext:{buyLinks:[]},bookCovers:{cover:null,thumbnail:null}}});
  expect(JSON.stringify(detail.body)).not.toContain(f.account);expect(JSON.stringify(detail.body)).not.toContain(f.entity);
 }
 await pool.query('UPDATE recommendation_display_overrides SET display_values=$2 WHERE recommendation_id=$1',[f.ids[0],{secret:'Never exposed'}]);
 const bad=await request(app).get(f.children);expect(bad.status).toBe(400);expect(JSON.stringify(bad.body)).not.toContain('Never exposed');
 await pool.query('UPDATE recommendation_display_overrides SET display_values=$2 WHERE recommendation_id=$1',[f.ids[0],{title:'Never exposed'.repeat(100000)}]);
 for(const path of [f.children,`${f.children}/${f.ids[0]}`]){const large=await request(app).get(path);expect(large.status).toBe(413);expect(JSON.stringify(large.body)).not.toContain('Never exposed');}
});
it('rejects unknown query inputs, invalid bounds and altered or rebound cursors',async()=>{
  const f=await fixture(),g=await fixture();
  for(const query of [{limit:0},{limit:25},{limit:'1.2'},{limit:'01'},{limit:['1','2']},{accountId:f.account},{username:f.handle},{category:'books'},{slug:'reading'},{order:'title'},{cursor:'o2'}]) expect((await request(app).get(f.children).query(query)).status).toBe(400);
  const page=await request(app).get(f.children).query({limit:2});const cursor=page.body.nextCursor;
  for(const [path,value] of [[f.children,cursor+'a'],[g.children,cursor],[f.path,cursor],[f.children.replace('/books/','/movies/'),cursor]]) expect((await request(app).get(path).query({limit:2,cursor:value})).status).toBe(400);
  expect((await request(app).get(f.children).query({limit:3,cursor})).status).toBe(400);
});
it('gates every ancestor and treats hidden collections like nonexistent resources',async()=>{
  const f=await fixture();const missing=(await request(app).get(f.children.replace('/reading/','/missing/'))).body;
  for(const [sql,undo] of [
    ["UPDATE creator_accounts SET public_profile=false WHERE id=$1","UPDATE creator_accounts SET public_profile=true WHERE id=$1"],
    ["UPDATE creator_accounts SET onboarding_status='incomplete' WHERE id=$1","UPDATE creator_accounts SET onboarding_status='complete' WHERE id=$1"],
    ["UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1","UPDATE creator_accounts SET status='active',suspended_at=NULL WHERE id=$1"],
    ["UPDATE account_category_settings SET is_public=false WHERE account_id=$1","UPDATE account_category_settings SET is_public=true WHERE account_id=$1"],
  ]) {await pool.query(sql,[f.account]);const response=await request(app).get(f.children);expect(response.status).toBe(404);expect(response.body).toEqual(missing);await pool.query(undo,[f.account]);}
  for(const [sql,undo] of [["visibility='private'","visibility='public'"],["publication_state='draft'","publication_state='published'"],["archived_at=now()","archived_at=NULL"]]) {await pool.query(`UPDATE collections SET ${sql} WHERE id=$1`,[f.collection]);const response=await request(app).get(f.children);expect(response.status).toBe(404);expect(response.body).toEqual(missing);await pool.query(`UPDATE collections SET ${undo} WHERE id=$1`,[f.collection]);}
  expect((await request(app).get(f.children.replace('/books/','/movies/'))).body).toEqual(missing);
});
it('filters mixed publication and archival states before taking the bounded page',async()=>{
  const f=await fixture();await pool.query("UPDATE recommendations SET publication_state='draft' WHERE id=$1",[f.ids[0]]);await pool.query('UPDATE recommendations SET archived_at=now() WHERE id=$1',[f.ids[2]]);
  const page=await request(app).get(f.children).query({limit:2});expect(page.status).toBe(200);expect(page.body.items.map((x:any)=>x.id)).toEqual([f.ids[1],f.ids[3]]);
  await pool.query("UPDATE recommendations SET publication_state='draft' WHERE id=$1",[f.ids[4]]);
  const next=await request(app).get(f.children).query({limit:2,cursor:page.body.nextCursor});expect(next.status).toBe(409);
  const restarted=await request(app).get(f.children);expect(restarted.status).toBe(200);expect(restarted.body.items.map((x:any)=>x.id)).toEqual([f.ids[1],f.ids[3]]);
});
it('requires restart after collection order revision changes and rechecks privacy on continuation',async()=>{
  const f=await fixture();const first=await request(app).get(f.children).query({limit:2});
  await pool.query('UPDATE collections SET revision=revision+1 WHERE id=$1',[f.collection]);expect((await request(app).get(f.children).query({limit:2,cursor:first.body.nextCursor})).status).toBe(409);
  await pool.query("UPDATE collections SET visibility='private' WHERE id=$1",[f.collection]);expect((await request(app).get(f.children).query({limit:2,cursor:first.body.nextCursor})).status).toBe(404);
});
it('pages collections with stable ID tie-breaks without embedding partial child arrays',async()=>{
  const f=await fixture(0);for(let i=0;i<26;i++) await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order,visibility,publication_state) VALUES($1,'books','List',$2,0,'public','published')",[f.account,`list-${i}`]);
  await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'books','Private','private',0)",[f.account]);
  const wanted=(await pool.query('SELECT id FROM collections WHERE account_id=$1 AND visibility=\'public\' ORDER BY display_order,id',[f.account])).rows.map(x=>x.id);
  const seen:string[]=[];let cursor:string|undefined;do {const page=await request(app).get(f.path).query({limit:2,...(cursor?{cursor}:{})});expect(page.status).toBe(200);for(const item of page.body.items) {expect(Object.keys(item).sort()).toEqual(['description','heading','id','slug','title']);seen.push(item.id);}cursor=page.body.nextCursor;} while(cursor);expect(seen).toEqual(wanted);
});
it('binds continuation to the resolved account when a public handle changes owner',async()=>{
  const f=await fixture(),g=await fixture();const page=await request(app).get(f.children).query({limit:2});
  await pool.query('UPDATE creator_accounts SET handle=$2 WHERE id=$1',[f.account,`old-${randomUUID().slice(0,8)}`]);
  await pool.query('UPDATE creator_accounts SET handle=$2 WHERE id=$1',[g.account,f.handle]);
  expect((await request(app).get(f.children).query({limit:2,cursor:page.body.nextCursor})).status).toBe(400);
});
it('keeps category/path inputs exact and unavailable parity uniform for guests',async()=>{
  const f=await fixture();
  expect((await request(app).get(f.path.replace('/books','/music'))).status).toBe(400);
  expect((await request(app).get(f.path.replace('/books','/Books'))).status).toBe(400);
  expect((await request(app).get(f.path+'/')).status).toBe(404);
  expect((await request(app).get(f.path.replace('/collections','/Collections'))).status).toBe(404);
  const noAccount=await request(app).get(f.path.replace(f.handle,'missing-account'));
  await pool.query('UPDATE account_category_settings SET is_public=false WHERE account_id=$1',[f.account]);
  const hidden=await request(app).get(f.path);expect(hidden.status).toBe(404);expect(hidden.body).toEqual(noAccount.body);
});
it('records fixture query plans without claiming production scale',async()=>{
  const f=await fixture(53);
  const lists=await pool.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id,title,slug,description,heading,display_order FROM collections WHERE account_id=$1 AND category='books' AND archived_at IS NULL AND visibility='public' AND publication_state='published' AND (display_order,id)>(0,$2::uuid) ORDER BY display_order,id LIMIT 3`,[f.account,f.collection]);
  const children=await pool.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT r.id,e.title,e.kind,r.user_rating,ci.display_order FROM collection_items ci JOIN recommendations r ON r.id=ci.recommendation_id AND r.account_id=ci.account_id AND r.category=ci.category JOIN entities e ON e.id=r.entity_id WHERE ci.collection_id=$1 AND ci.account_id=$2 AND ci.category='books' AND r.archived_at IS NULL AND r.publication_state='published' AND (ci.display_order,r.id)>(0,$3::uuid) ORDER BY ci.display_order,r.id LIMIT 3`,[f.collection,f.account,f.ids[0]]);
  for(const [label,result] of [['collections',lists],['children',children]] as const) {const plan=result.rows[0]['QUERY PLAN'][0];expect(plan.Plan['Node Type']).toBe('Limit');expect(plan.Plan['Actual Rows']).toBeLessThanOrEqual(3);writeFileSync(join(tmpdir(),`task-3-1-public-${label}-explain.json`),JSON.stringify(plan,null,2));}
});
it('serves only validated rich note detail through every live public ancestor',async()=>{
 const f=await fixture(1),note={version:1,format:'quill-html',html:'<h3>Public</h3><p><u>😀 café</u></p>'};
 await pool.query('UPDATE recommendations SET note=$2::jsonb WHERE id=$1',[f.ids[0],JSON.stringify(note)]);
 const path=`${f.children}/${f.ids[0]}`,visible=await request(app).get(path);expect(visible.status).toBe(200);
 expect(publicRecommendationDetailSchema.parse(visible.body)).toEqual(visible.body);
 expect(visible.body).toEqual({version:'explorers-public-content/v1',recommendation:{id:f.ids[0],title:'Public title',kind:'book',userRating:8,note,
  bookDetails:emptyBookDetails(),bookContext:{buyLinks:[]},bookCovers:{cover:null,thumbnail:null}}});
 const missing=(await request(app).get(`${f.children}/${randomUUID()}`)).body;
 for(const [sql,undo,id] of [
  ['UPDATE creator_accounts SET public_profile=false WHERE id=$1','UPDATE creator_accounts SET public_profile=true WHERE id=$1',f.account],
  ['UPDATE account_category_settings SET is_public=false WHERE account_id=$1','UPDATE account_category_settings SET is_public=true WHERE account_id=$1',f.account],
  ["UPDATE collections SET visibility='private' WHERE id=$1","UPDATE collections SET visibility='public' WHERE id=$1",f.collection],
  ["UPDATE recommendations SET publication_state='draft' WHERE id=$1","UPDATE recommendations SET publication_state='published' WHERE id=$1",f.ids[0]],
 ]) {await pool.query(sql,[id]);const hidden=await request(app).get(path);expect(hidden.status).toBe(404);expect(hidden.body).toEqual(missing);await pool.query(undo,[id]);}
 await pool.query('UPDATE recommendations SET note=$2::jsonb WHERE id=$1',[f.ids[0],JSON.stringify({...note,html:'<p onclick="x()">unsafe</p>'})]);
 const unsafe=await request(app).get(path);expect(unsafe.status).toBe(503);expect(JSON.stringify(unsafe.body)).not.toContain('onclick');
});
