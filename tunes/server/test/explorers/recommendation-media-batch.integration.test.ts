import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { replaceRecommendationMedia } from '../../repositories/recommendationMediaWrite';

// Seed shape follows the raw-SQL fixture in explorers-content-revision.integration.test.ts.
const url=process.env.DATABASE_URL_TEST;
let pool:pg.Pool;
async function readyMedia(account:string) {
  return (await pool.query("INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,ready_at,content_sha256) VALUES($1,'recommendation','ready','image/png',1,now(),decode(repeat('00',32),'hex')) RETURNING id",[account])).rows[0].id as string;
}
async function seedRecommendationWithMedia(count:number) {
  const accountId=(await pool.query('INSERT INTO creator_accounts DEFAULT VALUES RETURNING id')).rows[0].id as string;
  const entity=(await pool.query("INSERT INTO entities(kind,title,origin) VALUES('book','Media batch fixture','manual') RETURNING id")).rows[0].id;
  const recommendationId=(await pool.query("INSERT INTO recommendations(account_id,category,entity_id) VALUES($1,'books',$2) RETURNING id",[accountId,entity])).rows[0].id as string;
  const mediaIds:string[]=[];for(let i=0;i<count;i++) mediaIds.push(await readyMedia(accountId));
  return {accountId,recommendationId,mediaIds};
}
async function inTransaction(run:(client:pg.PoolClient,inserts:string[])=>Promise<void>) {
  const client=await pool.connect(),inserts:string[]=[],query=client.query.bind(client);
  client.query=((text:unknown,values?:unknown)=>{if(typeof text==='string'&&/INSERT INTO recommendation_media/.test(text)) inserts.push(text);return query(text as never,values as never);}) as never;
  try {await query('BEGIN');await run(client,inserts);await query('COMMIT');}
  catch(error){await query('ROLLBACK');throw error;}
  finally {client.query=query as never;client.release();}
  return inserts;
}
async function stored(recommendationId:string) {
  return (await pool.query('SELECT media_id,display_order FROM recommendation_media WHERE recommendation_id=$1 ORDER BY display_order',[recommendationId])).rows;
}

describe.skipIf(!url)('recommendation media batch write',()=>{
  beforeAll(()=>{pool=new pg.Pool({connectionString:url,max:2});});
  afterAll(async()=>{await pool.end();});

  it('writes N media rows in order with one INSERT',async()=>{
    const {accountId,recommendationId,mediaIds}=await seedRecommendationWithMedia(5);
    const inserts=await inTransaction(client=>replaceRecommendationMedia(client,accountId,recommendationId,mediaIds));
    expect(inserts).toHaveLength(1);
    const rows=await stored(recommendationId);
    expect(rows.map(row=>row.media_id)).toEqual(mediaIds);
    expect(rows.map(row=>row.display_order)).toEqual([0,1,2,3,4]);
  });

  it('replacing an existing gallery reorders and drops rows (deferred order uniqueness)',async()=>{
    const {accountId,recommendationId,mediaIds}=await seedRecommendationWithMedia(3);
    await inTransaction(client=>replaceRecommendationMedia(client,accountId,recommendationId,mediaIds));
    const next=[mediaIds[2],mediaIds[0]];
    const inserts=await inTransaction(client=>replaceRecommendationMedia(client,accountId,recommendationId,next));
    expect(inserts).toHaveLength(1);
    expect(await stored(recommendationId)).toEqual([{media_id:next[0],display_order:0},{media_id:next[1],display_order:1}]);
  });

  it('an empty list deletes and inserts nothing',async()=>{
    const {accountId,recommendationId,mediaIds}=await seedRecommendationWithMedia(2);
    await inTransaction(client=>replaceRecommendationMedia(client,accountId,recommendationId,mediaIds));
    const inserts=await inTransaction(client=>replaceRecommendationMedia(client,accountId,recommendationId,[]));
    expect(inserts).toHaveLength(0);
    expect(await stored(recommendationId)).toEqual([]);
  });

  it('foreign media is still refused by the ownership foreign key',async()=>{
    const {accountId,recommendationId}=await seedRecommendationWithMedia(0),other=await seedRecommendationWithMedia(1);
    await expect(inTransaction(client=>replaceRecommendationMedia(client,accountId,recommendationId,other.mediaIds))).rejects.toMatchObject({code:'23503'});
    expect(await stored(recommendationId)).toEqual([]);
  });
});
