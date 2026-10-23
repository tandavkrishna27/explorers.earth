import pg from 'pg';import {afterAll,beforeAll,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';

/** 0068 (DS-04, DS-14, Apps one link, Games developer). Additive only; nothing dropped. */
let admin:pg.Pool;
beforeAll(()=>{admin=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:2});});
afterAll(async()=>{await admin?.end();});
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
