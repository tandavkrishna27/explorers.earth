import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {migrateMusicDatabase} from '../../db/migrate';
import {applyTaxonomyCatalogImport} from '../../services/taxonomyCatalogImport';
import {publicPeopleSectorProjection,publicPeopleProjection} from '../../publicProfile/publicPeopleProjection';
/** SOURCE ONLY in T3: never run without explicit disposable PostgreSQL authority.
 * This executes production SQL rather than manufacturing eligible membership rows. */
const enabled=process.env.EXPLORERS_T3_POSTGRES_TEST==='1'&&!!process.env.DATABASE_URL_TEST;
const suite=enabled?describe.sequential:describe.skip;
const databaseName=`explorers_t3_${process.pid}`;
let admin:pg.Pool,pool:pg.Pool,owner:string,handle:string,sector:string,otherSector:string;
const secret='fixture-only-people-sector-key-32bytes';
async function collection(slug:string,order:number,visibility='public'){
 return (await pool.query(`INSERT INTO collections(account_id,category,title,slug,visibility,publication_state,display_order) VALUES($1,'people',$2,$2,$3,'published',$4) RETURNING id`,[owner,slug,visibility,order])).rows[0].id as string;
}
async function recommendation(term=sector,entity?:string){
 const entityId=entity??(await pool.query("INSERT INTO entities(kind,title,origin) VALUES('person','Fixture person','manual') RETURNING id")).rows[0].id;
 await pool.query('INSERT INTO person_entity_details(entity_id) VALUES($1) ON CONFLICT DO NOTHING',[entityId]);
 const id=(await pool.query("INSERT INTO recommendations(account_id,category,entity_id,publication_state) VALUES($1,'people',$2,'published') RETURNING id",[owner,entityId])).rows[0].id;
 await pool.query("INSERT INTO recommendation_taxonomy(recommendation_id,account_id,category,term_id,position) VALUES($1,$2,'people',$3,0)",[id,owner,term]);return {id,entityId};
}
async function member(list:string,recommendation:string,order:number){await pool.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'people',$4)",[list,recommendation,owner,order]);}
suite('T3 actual PostgreSQL membership and current suppression qualification',()=>{
 beforeAll(async()=>{
  admin=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:1});await admin.query(`CREATE DATABASE ${databaseName}`);
  const url=new URL(process.env.DATABASE_URL_TEST!);url.pathname=`/${databaseName}`;pool=new pg.Pool({connectionString:url.toString(),max:4});await migrateMusicDatabase(pool);
  sector=randomUUID();otherSector=randomUUID();
  await applyTaxonomyCatalogImport(pool,{version:'explorers-taxonomy-import/v1',catalogVersion:1,category:'people',defaultLocale:'en',terms:[{id:sector,category:'people',slug:'fixture-sector',parentId:null,position:0,active:true,labels:{en:'Fixture sector'}},{id:otherSector,category:'people',slug:'fixture-other',parentId:null,position:1,active:true,labels:{en:'Fixture other'}}],sourceMappings:[],legacySlugMappings:[{legacySlug:'fixture-old',termId:sector}]},'synthetic T3 disposable fixture');
  owner=(await pool.query('INSERT INTO creator_accounts DEFAULT VALUES RETURNING id')).rows[0].id;handle='t3-fixture';
  await pool.query("UPDATE creator_accounts SET handle=$2,display_name='Fixture owner',account_type='Creator',public_profile=true,onboarding_status='complete',status='active' WHERE id=$1",[owner,handle]);
  await pool.query("INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,'people',true,0) ON CONFLICT(account_id,category) DO UPDATE SET is_public=true",[owner]);
 },300000);
 afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP DATABASE ${databaseName}`);await admin.end();}},120000);
 it('only owned ready collection cover is projected',async()=>{
  const list=await collection('cover-fixture',99999);
  const media=(await pool.query("INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size) VALUES($1,'collection','uploading','image/jpeg',1) RETURNING id",[owner])).rows[0].id;
  await pool.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)",[list,owner,media]);
  expect((await publicPeopleProjection(pool,handle,12,undefined,'cover-fixture'))!.personLists[0].cover_image).toBeNull();
  await pool.query("UPDATE media_assets SET status='ready',ready_at=now(),content_sha256=$2 WHERE id=$1",[media,Buffer.alloc(32,1)]);
  expect((await publicPeopleProjection(pool,handle,12,undefined,'cover-fixture'))!.personLists[0].cover_image).toEqual({url:`/api/explorers/v1/media/${media}/content`,alternativeText:null});
  const foreignOwner=(await pool.query('INSERT INTO creator_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
  const foreign=(await pool.query("INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,content_sha256,ready_at) VALUES($1,'collection','ready','image/jpeg',1,$2,now()) RETURNING id",[foreignOwner,Buffer.alloc(32,2)])).rows[0].id;
  await expect(pool.query('UPDATE collection_media SET media_id=$2 WHERE collection_id=$1',[list,foreign])).rejects.toThrow();
  await pool.query("UPDATE media_assets SET status='pending_delete' WHERE id=$1",[media]);
  expect((await publicPeopleProjection(pool,handle,12,undefined,'cover-fixture'))!.personLists[0].cover_image).toBeNull();
 });
 it('private first membership cannot hide public second; duplicate public membership emits one recommendation; shared entity remains distinct',async()=>{
  const privateList=await collection('private-first',0,'private'),publicList=await collection('public-second',1),later=await collection('public-third',2);
  const first=await recommendation(),second=await recommendation(sector,first.entityId),wrong=await recommendation(otherSector);
  await member(privateList,first.id,0);await member(publicList,first.id,0);await member(later,first.id,0);await member(publicList,second.id,1);await member(publicList,wrong.id,2);
  const result=await publicPeopleSectorProjection(pool,handle,'fixture-sector',24,undefined,secret);
  expect(result!.recommended_people.map(p=>p.documentId)).toEqual([first.id,second.id]);expect(result!.recommended_people[0].person_list.documentId).toBe(publicList);
  await pool.query('UPDATE person_entity_details SET suppressed_at=now() WHERE entity_id=$1',[first.entityId]);
  expect((await publicPeopleSectorProjection(pool,handle,'fixture-sector',24,undefined,secret))!.recommended_people).toEqual([]);
 });
 it('keyset continues after 24 deep orders, preserves ties, accepts canonical identity through approved alias',async()=>{
  const list=await collection('deep-orders',100000),ids:string[]=[];
  for(let n=0;n<30;n++){const item=await recommendation();ids.push(item.id);await member(list,item.id,100000+n);}
  const first=await publicPeopleSectorProjection(pool,handle,'fixture-old',24,undefined,secret);expect(first!.recommended_people).toHaveLength(24);
  const next=await publicPeopleSectorProjection(pool,handle,'fixture-sector',24,first!.nextCursor!,secret);expect(next!.recommended_people.map(p=>p.documentId)).toEqual(ids.slice(24));
 });
 it('suppression between original snapshot commit and post-check denies sector and legacy lists without revision invalidation',async()=>{
  const list=await collection('race',100001);const person=await recommendation();await member(list,person.id,0);
  let injected=false;
  const wrapped={query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {release:()=>client.release(),query:async(sql:string,values?:any[])=>{const result=await client.query(sql,values);if(sql==='COMMIT'&&!injected){injected=true;await pool.query('UPDATE person_entity_details SET suppressed_at=now() WHERE entity_id=$1',[person.entityId]);}return result;}};}} as unknown as pg.Pool;
  // The injected entity must be in the returned page, so read its dedicated list.
  expect(await publicPeopleProjection(wrapped,handle,12,undefined,'race')).toBeUndefined();
  await pool.query('UPDATE person_entity_details SET suppressed_at=NULL WHERE entity_id=$1',[person.entityId]);
  // Put the race entity ahead of every current eligible sector item.
  await pool.query('UPDATE collections SET display_order=200000 WHERE id=$1',[list]);
  await pool.query('UPDATE collection_items SET display_order=0 WHERE collection_id=$1',[list]);
  injected=false;
  // Consume to the last sector page which includes the race recommendation.
  let page=await publicPeopleSectorProjection(pool,handle,'fixture-sector',24,undefined,secret);
  const cursor=page!.nextCursor!;
  expect(await publicPeopleSectorProjection(wrapped,handle,'fixture-sector',24,cursor,secret)).toBeUndefined();
 });
});
