import {it,expect} from 'vitest';
import {ExplorersRecommendationRepository} from '../../repositories/explorersRecommendationRepository';
import {createHash} from 'node:crypto';
function fixture(category='apps',options:any={}){
 const calls:{sql:string;values:any[]}[]=[];let receipt:any;
 const collection:any={id:'list',account_id:'owner',category,revision:1},item:any={id:'item',account_id:'owner',category:options.itemCategory??category,revision:1};
 const db={release(){},async query(sql:string,values:any[]=[]){calls.push({sql,values});let rows:any[]=[];
  if(sql.includes('SELECT status'))rows=[{status:'active'}];
  else if(sql.includes('FROM application_command_receipts'))rows=receipt?[receipt]:[];
  else if(sql.startsWith('SELECT category FROM collections'))rows=options.foreign?[]:[{category}];
  else if(sql.startsWith('SELECT * FROM collections'))rows=options.foreign?[]:[collection];
  else if(sql.startsWith('SELECT * FROM recommendations'))rows=[item];
  else if(sql.startsWith('SELECT 1 FROM collection_items'))rows=options.missing?[]:[{}];
  else if(sql.startsWith('DELETE FROM category_recommendation_pins'))rows=[{position:0}];
  else if(sql.startsWith('UPDATE collections SET'))rows=[{...collection,revision:2}];
  else if(sql.startsWith('UPDATE recommendations SET')){if(options.failUpdate)throw Error('transaction failure');rows=[{...item,revision:2}];}
  else if(sql.startsWith('INSERT INTO application_command_receipts'))receipt={request_hash:values[3],response:JSON.parse(values[4]),status:'completed',replayable:true};
  return{rows,rowCount:rows.length};}};
 const repo=new ExplorersRecommendationRepository({connect:async()=>db} as any);
 return{calls,repo,write:(attached=false,revisions={expectedCollectionRevision:1,expectedRecommendationRevision:1})=>repo.writeGameMembership('owner','list','item',revisions,'stable-key',attached)};
}
it.each(['apps','games'])('actual %s detach uses owned category lock and pin scope',async category=>{const f=fixture(category);await f.write();const lock=f.calls.find(c=>c.sql.includes('pg_advisory_xact_lock'))!;expect(lock.values[1]).toBe('owner:'+category);expect(f.calls.find(c=>c.sql.startsWith('DELETE FROM category_recommendation_pins'))!.values).toContain(category);expect(f.calls.at(-1)!.sql).toBe('COMMIT');});
it.each(['apps','games'])('actual %s replay preserves result and performs no second mutation',async category=>{const f=fixture(category),first=await f.write();f.calls.length=0;expect(await f.write()).toEqual(first);expect(f.calls.some(c=>c.sql.startsWith('DELETE')||c.sql.startsWith('UPDATE')||c.sql.includes('pg_advisory'))).toBe(false);await expect(f.write(false,{expectedCollectionRevision:2,expectedRecommendationRevision:1})).rejects.toMatchObject({status:409});});
it.each([['places',{},422],['apps',{itemCategory:'games'},422],['apps',{foreign:true},404],['apps',{missing:true},404]])('actual membership refusal %s %j',async(category,options,status)=>{const f=fixture(category as string,options);await expect(f.write()).rejects.toMatchObject({status});expect(f.calls.at(-1)!.sql).toBe('ROLLBACK');});
it('actual transaction rolls back failed revision update and never writes receipt',async()=>{const f=fixture('apps',{failUpdate:true});await expect(f.write()).rejects.toThrow();expect(f.calls.at(-1)!.sql).toBe('ROLLBACK');expect(f.calls.some(c=>c.sql.startsWith('INSERT INTO application_command_receipts'))).toBe(false);});
it.each(['apps','games'])('actual %s attach parameterizes category and preserves lock order',async category=>{const f=fixture(category,{missing:true});await f.write(true);expect(f.calls.find(c=>c.sql.startsWith('INSERT INTO collection_items'))!.values).toEqual(['list','item','owner',category]);const account=f.calls.findIndex(c=>c.sql.includes('SELECT status')),lock=f.calls.findIndex(c=>c.sql.includes('pg_advisory')),aggregate=f.calls.findIndex(c=>c.sql.startsWith('SELECT * FROM collections'));expect(account).toBeLessThan(lock);expect(lock).toBeLessThan(aggregate);});
it.each(['apps','games'])('actual %s duplicate attach and stale revisions refuse atomically',async category=>{const f=fixture(category);await expect(f.write(true)).rejects.toMatchObject({status:409});await expect(f.write(false,{expectedCollectionRevision:2,expectedRecommendationRevision:1})).rejects.toMatchObject({status:409});await expect(f.write(false,{expectedCollectionRevision:1,expectedRecommendationRevision:2})).rejects.toMatchObject({status:409});expect(f.calls.filter(c=>c.sql.startsWith('DELETE')||c.sql.startsWith('UPDATE'))).toHaveLength(0);});
it('preserves historical Games operation and canonical receipt fingerprint',async()=>{const f=fixture('games');await f.write();const receipt=f.calls.find(c=>c.sql.startsWith('INSERT INTO application_command_receipts'))!;expect(receipt.values[1]).toBe('detachGameMembership');expect(receipt.values[3]).toEqual(createHash('sha256').update('{"category":"games","collectionId":"list","expectedCollectionRevision":1,"expectedRecommendationRevision":1,"recommendationId":"item"}').digest());expect(f.calls.some(c=>c.sql.startsWith('WITH ranks AS'))).toBe(true);});
