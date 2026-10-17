import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,it,expect} from 'vitest';
import {publicMoviesProjection,PublicMovieCursorError} from '../publicProfile/publicMoviesProjection';
let pool:pg.Pool;const secret='movies-public-continuation-test-'.repeat(2);
beforeAll(()=>{pool=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:4});});afterAll(async()=>{await pool.end();});
async function fixture(){
 const handle='gateway'+randomUUID().replaceAll('-','').slice(0,16);
 const account=(await pool.query("INSERT INTO creator_accounts(handle,display_name,account_type,onboarding_status,public_profile) VALUES($1,'Public owner','Creator','complete',true) RETURNING id",[handle])).rows[0].id;
 await pool.query("INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,'movies',true,0) ON CONFLICT(account_id,category) DO UPDATE SET is_public=true",[account]);
 await pool.query("INSERT INTO account_category_pin_state(account_id,category) VALUES($1,'movies')",[account]);
 const entity=(await pool.query("INSERT INTO entities(kind,title,origin) VALUES('movie','Manual source','manual') RETURNING id")).rows[0].id;
 await pool.query("INSERT INTO movie_entity_details(entity_id,media_type) VALUES($1,'movie')",[entity]);
 const lists=[] as Array<{id:string;slug:string}>;
 for(let i=0;i<2;i++)lists.push((await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order,visibility,publication_state) VALUES($1,'movies',$2,$3,$4,'public','published') RETURNING id,slug",[account,'List '+i,'list-'+randomUUID(),i])).rows[0]);
 const recs=[] as string[];
 for(let i=0;i<3;i++){
  const rec=(await pool.query("INSERT INTO recommendations(account_id,category,entity_id,publication_state) VALUES($1,'movies',$2,'published') RETURNING id",[account,entity])).rows[0].id;recs.push(rec);
  await pool.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'movies',$4)",[lists[i===2?1:0].id,rec,account,i]);
 }
 await pool.query("INSERT INTO category_recommendation_pins(account_id,category,recommendation_id,collection_id,position) VALUES($1,'movies',$2,$3,0)",[account,recs[2],lists[1].id]);
 return {account,handle,lists,recs};
}
it('uses category-wide pins outside the first list page and opaque exact-scope continuation',async()=>{
 const f=await fixture();const first=await publicMoviesProjection(pool,f.handle,1,undefined,undefined,secret);expect(first.movieLists).toHaveLength(1);expect(first.movieLists[0].documentId).toBe(f.lists[0].id);expect(first.topPicks.map((r:any)=>r.documentId)).toEqual([f.recs[2]]);expect(first.nextCursor).toEqual(expect.any(String));
 const second=await publicMoviesProjection(pool,f.handle,1,first.nextCursor,undefined,secret);expect(second.movieLists[0].documentId).toBe(f.lists[1].id);expect(second.nextCursor).toBeNull();
 for(const args of [[2,first.nextCursor,undefined,secret],[1,first.nextCursor,f.lists[0].slug,secret],[1,first.nextCursor,undefined,'other-continuation-test-'.repeat(2)]] as const)await expect(publicMoviesProjection(pool,f.handle,args[0],args[1],args[2],args[3])).rejects.toBeInstanceOf(PublicMovieCursorError);
 await expect(publicMoviesProjection(pool,f.handle,1,'o1',undefined,secret)).rejects.toBeInstanceOf(PublicMovieCursorError);
});
it('keeps list continuations bound to list, limit, account and observed content revision',async()=>{
 const f=await fixture();const first=await publicMoviesProjection(pool,f.handle,1,undefined,f.lists[0].slug,secret),token=first.movieLists[0].recommended_movies_next_cursor;
 expect(token).toEqual(expect.any(String));expect(first.movieLists[0].recommended_movies[0].documentId).toBe(f.recs[0]);
 const next=await publicMoviesProjection(pool,f.handle,1,token,f.lists[0].slug,secret);expect(next.movieLists[0].recommended_movies[0].documentId).toBe(f.recs[1]);expect(next.movieLists[0].recommended_movies_next_cursor).toBeNull();
 await expect(publicMoviesProjection(pool,f.handle,1,token,f.lists[1].slug,secret)).rejects.toBeInstanceOf(PublicMovieCursorError);
 await expect(publicMoviesProjection(pool,f.handle,2,token,f.lists[0].slug,secret)).rejects.toBeInstanceOf(PublicMovieCursorError);
 const other=await fixture();await expect(publicMoviesProjection(pool,other.handle,1,token,other.lists[0].slug,secret)).rejects.toBeInstanceOf(PublicMovieCursorError);
 await pool.query("UPDATE recommendations SET user_rating=7 WHERE id=$1",[f.recs[0]]);await expect(publicMoviesProjection(pool,f.handle,1,token,f.lists[0].slug,secret)).rejects.toBeInstanceOf(PublicMovieCursorError);
});
it('denies current public privacy changes during post-snapshot revalidation',async()=>{
 for(const mutation of ["UPDATE creator_accounts SET public_profile=false WHERE id=$1","UPDATE account_category_settings SET is_public=false WHERE account_id=$1 AND category='movies'","UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1"]){
  const f=await fixture();let changed=false;
  const wrapped=new Proxy(pool,{get(target,p){if(p==='connect')return async()=>{const db=await target.connect();return new Proxy(db,{get(c,key){if(key==='query')return async(...args:any[])=>{const result=await (c.query as any)(...args);if(args[0]==='COMMIT'&&!changed){changed=true;await pool.query(mutation,[f.account]);}return result;};const v=Reflect.get(c,key);return typeof v==='function'?v.bind(c):v;}});};const v=Reflect.get(target,p);return typeof v==='function'?v.bind(target):v;}});
  expect(await publicMoviesProjection(wrapped,f.handle,1,undefined,undefined,secret)).toBeUndefined();expect(changed).toBe(true);
 }
});
it('fails closed when continuation is required without a signing key',async()=>{
 const f=await fixture();await expect(publicMoviesProjection(pool,f.handle,1)).rejects.toThrow('Movie continuation key unavailable');
});

for(const [label,mutation,target] of [
 ['unpublished list',"UPDATE collections SET publication_state='draft' WHERE id=$1",'list'],
 ['archived list',"UPDATE collections SET archived_at=now() WHERE id=$1",'list'],
 ['deleted list',"DELETE FROM collections WHERE id=$1",'list'],
 ['unpublished recommendation',"UPDATE recommendations SET publication_state='draft' WHERE id=$1",'rec'],
 ['archived recommendation',"UPDATE recommendations SET archived_at=now() WHERE id=$1",'rec']
] as const)it('denies public Movie '+label+' before projection and after snapshot',async()=>{
 const f=await fixture();expect((await publicMoviesProjection(pool,f.handle,1,undefined,f.lists[0].slug,secret))?.movieLists[0].recommended_movies.map((r:any)=>r.documentId)).toContain(f.recs[0]);
 let changed=false;const wrapped=new Proxy(pool,{get(t,p){if(p==='connect')return async()=>{const db=await t.connect();return new Proxy(db,{get(c,k){if(k==='query')return async(...args:any[])=>{const result=await(c.query as any)(...args);if(args[0]==='COMMIT'&&!changed){changed=true;await pool.query(mutation,[target==='list'?f.lists[0].id:f.recs[0]]);}return result;};const v=Reflect.get(c,k);return typeof v==='function'?v.bind(c):v;}});};const v=Reflect.get(t,p);return typeof v==='function'?v.bind(t):v;}});
 expect(await publicMoviesProjection(wrapped,f.handle,1,undefined,f.lists[0].slug,secret)).toBeUndefined();expect(changed).toBe(true);
 const fresh=await publicMoviesProjection(pool,f.handle,1,undefined,f.lists[0].slug,secret);if(target==='list')expect(fresh).toBeUndefined();else expect(fresh?.movieLists[0].recommended_movies.map((r:any)=>r.documentId)).not.toContain(f.recs[0]);
});

it('fails closed on malformed stored Movie projection overrides rather than emitting partial public data',async()=>{
 const f=await fixture();await pool.query("INSERT INTO recommendation_display_overrides(recommendation_id,account_id,display_values) VALUES($1,$2,$3::jsonb)",[f.recs[0],f.account,JSON.stringify({runtimeMinutes:'invalid-number'})]);
 await expect(publicMoviesProjection(pool,f.handle,1,undefined,f.lists[0].slug,secret)).rejects.toThrow();
});
