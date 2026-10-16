import {describe,it,expect} from 'vitest';
import {drainReaderPages,createReaderLeaseAdapter} from '../helpers/placesReaderAcceptanceFixture';

describe('Places reader acceptance inert helper contracts',()=>{
 it('drains exact pages and preserves page metadata',async()=>{
  const cursors:(string|undefined)[]=[];
  const result=await drainReaderPages(async(cursor:string|undefined)=>{cursors.push(cursor);return cursor?{items:[{id:'b'}],nextCursor:null,metadata:{count:2}}:{items:[{id:'a'}],nextCursor:'next',metadata:{count:2}};},['a','b'],24);
  expect(result.items.map((row:any)=>row.id)).toEqual(['a','b']);expect(cursors).toEqual([undefined,'next']);expect(result.pages).toHaveLength(2);
 });
 it('refuses duplicates, skipped identities, changed metadata and persistent cursors',async()=>{
  await expect(drainReaderPages(async()=>({items:[{id:'a'},{id:'a'}],nextCursor:null,metadata:{}}),['a','b'],24)).rejects.toThrow('identity');
  await expect(drainReaderPages(async()=>({items:[{id:'a'}],nextCursor:null,metadata:{}}),['a','b'],24)).rejects.toThrow('identity');
  let page=0;await expect(drainReaderPages(async()=>({items:[{id:String(++page)}],nextCursor:'next',metadata:{page}}),['1','2'],24)).rejects.toThrow('metadata');
  let calls=0;await expect(drainReaderPages(async()=>({items:[{id:String(++calls)}],nextCursor:'next',metadata:{}}),['1','2','3','4'],24)).rejects.toThrow('cursor');expect(calls).toBe(4);
 });
 it('forwards the second BEGIN only after commit and barrier; compatibility releases once',async()=>{
  const actual:string[]=[];let releaseCount=0,barrierCount=0;
  const lease={query:async(text:string)=>{actual.push(text);return {command:text.split(' ')[0],rows:[]};},release:()=>{releaseCount++;}};
  const adapter=createReaderLeaseAdapter(lease,async()=>{barrierCount++;expect(actual).toEqual(['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','SELECT original','COMMIT','SELECT scope']);});
  const first=await adapter.pool.connect();await first.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await first.query('SELECT original');await first.query('COMMIT');first.release();expect(releaseCount).toBe(0);
  await adapter.pool.query('SELECT scope');const second=await adapter.pool.connect();await second.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await second.query('/* public_places_current_list */ SELECT 1');await second.query('ROLLBACK');second.release();adapter.finish();
  expect(barrierCount).toBe(1);expect(releaseCount).toBe(1);expect(adapter.status()).toMatchObject({begins:2,commits:1,rollbacks:1,logicalReleases:2,physicalReleases:1,transaction:false,connected:false});
 });
 it('canonical retained client supports second snapshot and release once',async()=>{
  let releases=0,barrier=0;const adapter=createReaderLeaseAdapter({query:async(text:string)=>({command:text.split(' ')[0],rows:[]}),release:()=>{releases++;}},async()=>{barrier++;});
  const client=await adapter.pool.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query('COMMIT');await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query('COMMIT');client.release();adapter.finish();expect(barrier).toBe(1);expect(releases).toBe(1);
 });
 it('refuses simultaneous connect, pool query in snapshot, and second BEGIN without commit',async()=>{
  const adapter=createReaderLeaseAdapter({query:async(text:string)=>({command:text.split(' ')[0],rows:[]}),release:()=>{}},async()=>{}),client=await adapter.pool.connect();
  await expect(adapter.pool.connect()).rejects.toThrow('lease');await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await expect(adapter.pool.query('SELECT scope')).rejects.toThrow('lease');await expect(client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')).rejects.toThrow('transaction');await client.query('ROLLBACK');client.release();adapter.finish();expect(adapter.status().physicalReleases).toBe(1);
 });
});
