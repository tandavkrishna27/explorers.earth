import pg from 'pg';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ExplorersRecommendationRepository } from '../repositories/explorersRecommendationRepository';
import { ensureInitialAccount } from '../auth/initialAccount';
import { recoverAccount, requireRecoveryPrincipal } from '../auth/accountRecovery';
import { consumeRecoveryProof } from '../auth/recoveryProof';
import { lockContentCategories } from '../db/explorers-content-lock';
import { AccountLifecycleService } from '../application/accountLifecycle';

let pool:pg.Pool;
beforeAll(()=>{pool=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:6});});
afterAll(async()=>{await pool.end();});
async function revision(account:string,category='books') {
  return BigInt((await pool.query('SELECT revision FROM account_category_content_state WHERE account_id=$1 AND category=$2',[account,category])).rows[0]?.revision??0);
}
async function fixture() {
  const account=(await pool.query('INSERT INTO creator_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
  const entity=(await pool.query("INSERT INTO entities(kind,title,origin) VALUES('book','Revision fixture','manual') RETURNING id")).rows[0].id;
  const list=(await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'books','List',$2,0) RETURNING id",[account,randomUUID()])).rows[0].id;
  const item=(await pool.query("INSERT INTO recommendations(account_id,category,entity_id) VALUES($1,'books',$2) RETURNING id",[account,entity])).rows[0].id;
  return {account,entity,list,item};
}
async function waitForLock(pid:number) {
  const deadline=Date.now()+5000;
  while(Date.now()<deadline) {
    const result=await pool.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",[pid]);
    if(result.rows[0]?.wait_event_type==='Lock') return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error('Expected database lock barrier');
}
describe('category revision foundation',()=>{
  it('does not invalidate for empty DML or unattached asset/catalog metadata',async()=>{
    const f=await fixture(),before=await revision(f.account);
    await pool.query('UPDATE collections SET title=title WHERE account_id=$1 AND false',[f.account]);
    await pool.query('DELETE FROM collection_media WHERE account_id=$1',[f.account]);
    const asset=(await pool.query("INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size) VALUES($1,'collection','uploading','image/png',1) RETURNING id",[f.account])).rows[0].id;
    await pool.query("UPDATE media_assets SET caption='Only metadata' WHERE id=$1",[asset]);
    await pool.query("UPDATE entities SET title='Shared metadata' WHERE id=$1",[f.entity]);
    expect(await revision(f.account)).toBe(before);
  });
  it.each(['content-first','lifecycle-first'])('completes supported account-ordered %s race without partial writes',async order=>{
    const user=`revision-race-${randomUUID()}`;await pool.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Race',$2)",[user,`${user}@example.invalid`]);
    const {accountId}=await ensureInitialAccount(pool,user),session=randomUUID();
    const sessionRow=(await pool.query("INSERT INTO auth_session(id,user_id,token,expires_at,updated_at) VALUES($1,$2,$3,now()+interval '1 hour',now()) RETURNING session_version",[session,user,randomUUID()])).rows[0];
    const actor={userId:user,accountId,role:'owner' as const,credential:{kind:'web-session' as const,sessionId:session,sessionVersion:Number(sessionRow.session_version)}};
    const repo=new ExplorersRecommendationRepository(pool),list=await repo.createCollection(accountId,{category:'apps',title:'Before',slug:randomUUID()},randomUUID());
    const before=await revision(accountId,'apps'),holder=await pool.connect();let content:Promise<any>|undefined,lifecycle:Promise<any>|undefined;
    const beginContent=()=>repo.updateCollection(accountId,list.id,list.revision,{title:'After'},randomUUID()).then(value=>({value})).catch(error=>({error}));
    const beginLifecycle=()=>new AccountLifecycleService(pool).requestAccountDeactivation(actor,{expectedRevision:1},{requestId:randomUUID(),idempotencyKey:randomUUID()});
    try {
      await holder.query('BEGIN');await lockContentCategories(holder,accountId,['apps']);
      if(order==='content-first') content=beginContent();else lifecycle=beginLifecycle();
      const deadline=Date.now()+5000;let pid:number|undefined;
      while(Date.now()<deadline&&!pid) {pid=(await pool.query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT pg_advisory_xact_lock%' AND pid<>pg_backend_pid()")).rows[0]?.pid;if(!pid) await new Promise(resolve=>setTimeout(resolve,10));}
      expect(pid).toBeDefined();
      if(order==='content-first') lifecycle=beginLifecycle();else content=beginContent();
      let blocked=false;const secondDeadline=Date.now()+5000;
      while(Date.now()<secondDeadline&&!blocked) {blocked=(await pool.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rowCount!>0;if(!blocked) await new Promise(resolve=>setTimeout(resolve,10));}
      expect(blocked).toBe(true);await holder.query('COMMIT');
      const [contentResult,lifecycleResult]=await Promise.all([content!,lifecycle!]);expect(lifecycleResult.status).toBe('suspended');
      if(order==='content-first') expect(contentResult.value.title).toBe('After');else expect(contentResult.error).toMatchObject({status:404});
      expect((await pool.query('SELECT title FROM collections WHERE id=$1',[list.id])).rows[0].title).toBe(order==='content-first'?'After':'Before');
      expect(await revision(accountId,'apps')).toBeGreaterThan(before);
    } finally {await holder.query('ROLLBACK');await content;await lifecycle;holder.release();}
  });
  it('advances on every supported repository mutation and preserves failure rollback',async()=>{
    const f=await fixture(),repo=new ExplorersRecommendationRepository(pool);
    const beforeCreate=await revision(f.account);
    const item=await repo.createRecommendation(f.account,{category:'books',entityId:f.entity,collectionId:f.list,expectedCollectionRevision:1},randomUUID());
    expect(await revision(f.account)).toBeGreaterThan(beforeCreate);
    let before=await revision(f.account);const updated=await repo.updateRecommendation(f.account,item.id,item.revision,{userRating:7},randomUUID());expect(await revision(f.account)).toBeGreaterThan(before);
    before=await revision(f.account);const ordered=await repo.reorderCollection(f.account,f.list,2,[item.id],randomUUID());expect(await revision(f.account)).toBeGreaterThan(before);
    before=await revision(f.account);await repo.archiveRecommendation(f.account,item.id,updated.revision,randomUUID());expect(await revision(f.account)).toBeGreaterThan(before);
    before=await revision(f.account);await repo.archiveCollection(f.account,f.list,ordered.revision+1,randomUUID());expect(await revision(f.account)).toBeGreaterThan(before);
    before=await revision(f.account);await expect(repo.createRecommendation(f.account,{category:'books',entityId:f.entity,collectionId:f.list,expectedCollectionRevision:999},randomUUID())).rejects.toMatchObject({status:404});expect(await revision(f.account)).toBe(before);
    const movie=(await pool.query("INSERT INTO entities(kind,title,origin) VALUES('movie','Wrong kind','manual') RETURNING id")).rows[0].id;
    const db=await pool.connect();try {await db.query('BEGIN');await db.query('SET LOCAL ROLE music_runtime');
      await db.query('UPDATE recommendations SET entity_id=$2 WHERE id=$1',[f.item,movie]);
      await expect(db.query('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toMatchObject({code:'23514'});await db.query('ROLLBACK');expect(await revision(f.account)).toBe(before);
    } finally {await db.query('ROLLBACK');db.release();}
  });
  it('rolls back nonempty terminal purge, retains tombstone counters and preserves foreign/shared catalog',async()=>{
    const f=await fixture(),other=await fixture();
    await pool.query('UPDATE recommendations SET note=$2::jsonb WHERE id=$1',[f.item,JSON.stringify({version:1,format:'quill-html',html:'<p>Owned note</p>'})]);
    await pool.query("INSERT INTO recommendations(account_id,category,entity_id) VALUES($1,'books',$2)",[other.account,f.entity]);
    await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'guides','Guide',$2,0)",[f.account,randomUUID()]);
    await pool.query("INSERT INTO collection_items VALUES($1,$2,$3,'books',0,now())",[f.list,f.item,f.account]);
    await pool.query("INSERT INTO account_category_pin_state VALUES($1,'books',9)",[f.account]);
    await pool.query("INSERT INTO category_recommendation_pins VALUES($1,'books',$2,$3,0)",[f.account,f.item,f.list]);
    for(const purpose of ['collection','recommendation']) {
      const asset=(await pool.query("INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,ready_at,content_sha256) VALUES($1,$2,'ready','image/png',1,now(),decode(repeat('00',32),'hex')) RETURNING id",[f.account,purpose])).rows[0].id;
      await pool.query(purpose==='collection'?"INSERT INTO collection_media VALUES($1,$2,'cover',$3,now())":"INSERT INTO recommendation_media VALUES($1,$2,$3,0,now())",[purpose==='collection'?f.list:f.item,f.account,asset]);
    }
    const receipt=(await pool.query("INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,response) VALUES($1,'delete',decode(repeat('02',32),'hex'),decode(repeat('02',32),'hex'),'{}') RETURNING id",[f.account])).rows[0].id;
    const feedback=(await pool.query("INSERT INTO deletion_feedback(account_id,reason) VALUES($1,'Delete') RETURNING id",[f.account])).rows[0].id;
    const operation=(await pool.query("INSERT INTO account_lifecycle_operations(account_id,kind,state,expected_revision,feedback_id,receipt_id) VALUES($1,'delete','running',1,$2,$3) RETURNING id",[f.account,feedback,receipt])).rows[0].id;
    await expect(pool.query('SELECT purge_explorers_account_content($1,$2)',[f.account,operation])).rejects.toMatchObject({code:'42501'});
    await pool.query("UPDATE creator_accounts SET status='pending_deletion',deletion_requested_at=now() WHERE id=$1",[f.account]);
    const counters=async()=> (await pool.query('SELECT category,revision::text FROM account_category_content_state WHERE account_id=$1 ORDER BY category',[f.account])).rows;
    const before=await counters(),db=await pool.connect();
    try {
      await db.query('BEGIN');await db.query('SET LOCAL ROLE music_runtime');await db.query('SELECT purge_explorers_account_content($1,$2)',[f.account,operation]);
      await expect(db.query("SELECT 1/0")).rejects.toMatchObject({code:'22012'});await db.query('ROLLBACK');expect(await counters()).toEqual(before);
      for(const table of ['collections','recommendations','collection_items','collection_media','recommendation_media','category_recommendation_pins','account_category_pin_state']) expect((await pool.query(`SELECT 1 FROM ${table} WHERE account_id=$1`,[f.account])).rowCount,table).toBeGreaterThan(0);
      await db.query('BEGIN');await db.query('SET LOCAL ROLE music_runtime');await expect(db.query('SELECT purge_explorers_account_content($1,$2)',[f.account,randomUUID()])).rejects.toMatchObject({code:'42501'});await db.query('ROLLBACK');
      await db.query('BEGIN');await db.query('SET LOCAL ROLE music_runtime');await db.query('SELECT purge_explorers_account_content($1,$2)',[f.account,operation]);await db.query('COMMIT');
      const purged=await counters();expect(purged).toHaveLength(8);expect(BigInt(purged.find(row=>row.category==='books')!.revision)).toBeGreaterThan(BigInt(before.find(row=>row.category==='books')!.revision));
      await pool.query('SELECT purge_explorers_account_content($1,$2)',[f.account,operation]);expect(await counters()).toEqual(purged);
      await pool.query("UPDATE creator_accounts SET status='deleted',deleted_at=now() WHERE id=$1",[f.account]);expect(await counters()).toHaveLength(8);
      for(const table of ['collections','recommendations','collection_items','collection_media','recommendation_media','category_recommendation_pins','account_category_pin_state']) expect((await pool.query(`SELECT 1 FROM ${table} WHERE account_id=$1`,[f.account])).rowCount,table).toBe(0);
      expect((await pool.query('SELECT 1 FROM entities WHERE id=$1',[f.entity])).rowCount).toBe(1);expect((await pool.query('SELECT 1 FROM recommendations WHERE account_id=$1',[other.account])).rowCount).toBeGreaterThan(0);
      await expect(new ExplorersRecommendationRepository(pool).createCollection(f.account,{category:'books',title:'Forbidden',slug:randomUUID()},randomUUID())).rejects.toMatchObject({status:404});
      await expect(pool.query('DELETE FROM creator_accounts WHERE id=$1',[f.account])).rejects.toMatchObject({code:'23503'});
    } finally {await db.query('ROLLBACK');db.release();}
  });
  it('rolls back the loser of a raw aggregate-first deadlock including its counter',async()=>{
    const f=await fixture(),before=await revision(f.account),ordered=await pool.connect(),raw=await pool.connect();
    await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'guides','Ordered prefix',$2,0),($1,'apps','Raw prefix',$3,0)",[f.account,randomUUID(),randomUUID()]);
    const guidesBefore=await revision(f.account,'guides'),appsBefore=await revision(f.account,'apps');
    let first:Promise<any>|undefined,second:Promise<any>|undefined;
    try {
      for(const db of [ordered,raw]) {await db.query('BEGIN');await db.query("SET LOCAL deadlock_timeout='100ms'");await db.query("SET LOCAL statement_timeout='5s'");await db.query('SET LOCAL ROLE music_runtime');}
      await ordered.query('SELECT id FROM creator_accounts WHERE id=$1 FOR UPDATE',[f.account]);await lockContentCategories(ordered,f.account,['books','guides']);
      await ordered.query("UPDATE collections SET heading='ordered prefix' WHERE account_id=$1 AND category='guides'",[f.account]);
      await raw.query("UPDATE collections SET heading='raw prefix' WHERE account_id=$1 AND category='apps'",[f.account]);
      await raw.query('SELECT id FROM collections WHERE id=$1 FOR UPDATE',[f.list]);
      const orderedPid=(await ordered.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      first=ordered.query("UPDATE collections SET title='ordered' WHERE id=$1",[f.list]).then(()=>({ok:true})).catch(error=>({error}));
      await waitForLock(orderedPid);
      second=raw.query("UPDATE collections SET description='raw' WHERE id=$1",[f.list]).then(()=>({ok:true})).catch(error=>({error}));
      const earliest=await Promise.race([first.then(result=>({db:ordered,result})),second.then(result=>({db:raw,result}))]);
      expect(earliest.result.error?.code).toBe('40P01');await earliest.db.query('ROLLBACK');
      const results=await Promise.all([first,second]);const winner=earliest.db===ordered?raw:ordered;await winner.query('COMMIT');
      expect(results.filter(r=>r.error?.code==='40P01')).toHaveLength(1);
      const row=(await pool.query('SELECT title,description FROM collections WHERE id=$1',[f.list])).rows[0];
      expect(row).toEqual(earliest.db===ordered?{title:'List',description:'raw'}:{title:'ordered',description:null});
      expect(await revision(f.account)).toBeGreaterThan(before);
      const prefixes=(await pool.query("SELECT category,heading FROM collections WHERE account_id=$1 AND category IN ('guides','apps') ORDER BY category",[f.account])).rows;
      expect(prefixes).toEqual(earliest.db===ordered?[{category:'apps',heading:'raw prefix'},{category:'guides',heading:null}]:[{category:'apps',heading:null},{category:'guides',heading:'ordered prefix'}]);
      expect(await revision(f.account,earliest.db===ordered?'guides':'apps')).toBe(earliest.db===ordered?guidesBefore:appsBefore);
      expect(await revision(f.account,earliest.db===ordered?'apps':'guides')).toBeGreaterThan(earliest.db===ordered?appsBefore:guidesBefore);
      const committed=await revision(f.account);
      await ordered.query('BEGIN');await ordered.query('SELECT id FROM creator_accounts WHERE id=$1 FOR UPDATE',[f.account]);await lockContentCategories(ordered,f.account,['books']);
      await ordered.query("UPDATE collections SET heading='clean retry' WHERE id=$1",[f.list]);await ordered.query('COMMIT');expect(await revision(f.account)).toBeGreaterThan(committed);
    } finally {await ordered.query('ROLLBACK');await raw.query('ROLLBACK');await first;await second;ordered.release();raw.release();}
  });
  it('serializes concurrent first writes and sorts reverse caller category order',async()=>{
    const account=(await pool.query('INSERT INTO creator_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const repo=new ExplorersRecommendationRepository(pool);
    await Promise.all([0,1].map(i=>repo.createCollection(account,{category:'books',title:`First ${i}`,slug:randomUUID()},randomUUID())));
    expect(await revision(account)).toBeGreaterThan(1n);
    const a=await pool.connect(),b=await pool.connect();let pending:Promise<unknown>|undefined;
    try {
      await a.query('BEGIN');await b.query('BEGIN');await b.query("SET LOCAL statement_timeout='5s'");
      await lockContentCategories(a,account,['guides','books']);const pid=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      pending=lockContentCategories(b,account,['books','guides']);await waitForLock(pid);await a.query('COMMIT');await pending;await b.query('COMMIT');
    } finally {await a.query('ROLLBACK');await b.query('ROLLBACK');await pending;a.release();b.release();}
  });
  it('invalidates both old and new scopes on legal parent moves and media reassignment',async()=>{
    const f=await fixture();const before=await revision(f.account),guides=await revision(f.account,'guides');
    await pool.query("UPDATE collections SET category='guides' WHERE id=$1",[f.list]);
    expect(await revision(f.account)).toBeGreaterThan(before);expect(await revision(f.account,'guides')).toBeGreaterThan(guides);
    const media=(await pool.query("INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,ready_at,content_sha256) VALUES($1,'collection','ready','image/png',1,now(),decode(repeat('00',32),'hex')) RETURNING id",[f.account])).rows[0].id;
    const other=(await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'books','Other',$2,1) RETURNING id",[f.account,randomUUID()])).rows[0].id;
    await pool.query("INSERT INTO collection_media VALUES($1,$2,'cover',$3,now())",[f.list,f.account,media]);
    const old=await revision(f.account,'guides'),next=await revision(f.account);
    await pool.query('UPDATE collection_media SET collection_id=$2 WHERE collection_id=$1',[f.list,other]);
    expect(await revision(f.account,'guides')).toBeGreaterThan(old);expect(await revision(f.account)).toBeGreaterThan(next);
    const cascade=await revision(f.account);await pool.query('DELETE FROM collections WHERE id=$1',[other]);expect(await revision(f.account)).toBeGreaterThan(cascade);
  });
  it.each(['recoverAccount','consumeRecoveryProof'])('%s takes account/category locks before proof writes and invalidates reactivation',async method=>{
    const user=`revision-recovery-${randomUUID()}`;
    await pool.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Recovery',$2)",[user,`${user}@example.invalid`]);
    const {accountId}=await ensureInitialAccount(pool,user);
    await pool.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1",[accountId]);
    const token=randomBytes(32).toString('base64url');
    const proof=(await pool.query(`INSERT INTO account_recovery_proofs(user_id,account_id,token_hash,authenticated_at,expires_at)
      VALUES($1,$2,$3,now(),now()+interval '5 minutes') RETURNING id`,[user,accountId,createHash('sha256').update(token).digest()])).rows[0].id;
    const before=await revision(accountId),principal=await requireRecoveryPrincipal({cookies:{explorers_recovery_proof:token}} as Request,pool);
    const holder=await pool.connect(),probe=await pool.connect();let pending:Promise<unknown>|undefined;
    try {
      await holder.query('BEGIN');await holder.query('SELECT pg_advisory_xact_lock(44031,hashtext($1))',[`${accountId}:apps`]);
      pending=method==='recoverAccount'?recoverAccount(pool,principal,{expectedRevision:1},{requestId:randomUUID()}):consumeRecoveryProof(pool,token);
      const deadline=Date.now()+5000;let pid:number|undefined;
      while(Date.now()<deadline&&!pid) {pid=(await pool.query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()")).rows[0]?.pid;if(!pid) await new Promise(resolve=>setTimeout(resolve,10));}
      expect(pid).toBeDefined();await probe.query('BEGIN');await probe.query('SELECT id FROM account_recovery_proofs WHERE id=$1 FOR UPDATE NOWAIT',[proof]);await probe.query('ROLLBACK');
      await holder.query('COMMIT');await pending;expect(await revision(accountId)).toBeGreaterThan(before);
    } finally {await probe.query('ROLLBACK');await holder.query('ROLLBACK');await pending;holder.release();probe.release();}
  });
  it('takes the category prelock before locking an existing aggregate',async()=>{
    const f=await fixture(),holder=await pool.connect(),probe=await pool.connect();let pending:Promise<unknown>|undefined;
    try {
      await holder.query('BEGIN');await holder.query("SELECT pg_advisory_xact_lock(44031,hashtext($1))",[`${f.account}:books`]);
      pending=new ExplorersRecommendationRepository(pool).updateCollection(f.account,f.list,1,{title:'Prelocked'},randomUUID());
      let pid:number|undefined;const deadline=Date.now()+5000;
      while(Date.now()<deadline&&!pid) {
        const row=await pool.query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()");
        pid=row.rows[0]?.pid;if(!pid) await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(pid).toBeDefined();await waitForLock(pid!);
      await probe.query('BEGIN');await probe.query('SELECT id FROM collections WHERE id=$1 FOR UPDATE NOWAIT',[f.list]);await probe.query('ROLLBACK');
      await holder.query('COMMIT');await pending;
    } finally {await probe.query('ROLLBACK');await holder.query('ROLLBACK');await pending;holder.release();probe.release();}
  });
  it.each(['collections','recommendations','collection_items','collection_media','recommendation_media','category_recommendation_pins','account_category_pin_state'])('tracks every %s statement event including raw runtime writes',async table=>{
    const f=await fixture();
    await pool.query("INSERT INTO collection_items VALUES($1,$2,$3,'books',0,now())",[f.list,f.item,f.account]);
    await pool.query("INSERT INTO account_category_pin_state VALUES($1,'books',1)",[f.account]);
    const assets=(await pool.query(`INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,ready_at,content_sha256)
      VALUES($1,'collection','ready','image/png',1,now(),decode(repeat('00',32),'hex')),
      ($1,'recommendation','ready','image/png',1,now(),decode(repeat('00',32),'hex')) RETURNING id,purpose`,[f.account])).rows;
    const statements:Record<string,[string,unknown[],string,unknown[],string,unknown[]]>={
      collections:["INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'books','Extra',$2,1)",[f.account,randomUUID()],"UPDATE collections SET revision=revision+1 WHERE id=$1",[f.list],"DELETE FROM collections WHERE id=$1",[f.list]],
      recommendations:["INSERT INTO recommendations(account_id,category,entity_id) VALUES($1,'books',$2)",[f.account,f.entity],"UPDATE recommendations SET revision=revision+1 WHERE id=$1",[f.item],"DELETE FROM recommendations WHERE id=$1",[f.item]],
      collection_items:["INSERT INTO collection_items VALUES($1,$2,$3,'books',0,now())",[f.list,f.item,f.account],"UPDATE collection_items SET display_order=display_order WHERE collection_id=$1",[f.list],"DELETE FROM collection_items WHERE collection_id=$1",[f.list]],
      collection_media:["INSERT INTO collection_media VALUES($1,$2,'cover',$3,now())",[f.list,f.account,assets.find(a=>a.purpose==='collection')!.id],"UPDATE collection_media SET slot=slot WHERE collection_id=$1",[f.list],"DELETE FROM collection_media WHERE collection_id=$1",[f.list]],
      recommendation_media:["INSERT INTO recommendation_media VALUES($1,$2,$3,0,now())",[f.item,f.account,assets.find(a=>a.purpose==='recommendation')!.id],"UPDATE recommendation_media SET display_order=display_order WHERE recommendation_id=$1",[f.item],"DELETE FROM recommendation_media WHERE recommendation_id=$1",[f.item]],
      category_recommendation_pins:["INSERT INTO category_recommendation_pins VALUES($1,'books',$2,$3,0)",[f.account,f.item,f.list],"UPDATE category_recommendation_pins SET position=position WHERE account_id=$1",[f.account],"DELETE FROM category_recommendation_pins WHERE account_id=$1",[f.account]],
      account_category_pin_state:["INSERT INTO account_category_pin_state VALUES($1,'books',1)",[f.account],"UPDATE account_category_pin_state SET revision=revision+1 WHERE account_id=$1",[f.account],"DELETE FROM account_category_pin_state WHERE account_id=$1",[f.account]],
    };
    if(table==='collection_items'||table==='recommendations') await pool.query('DELETE FROM collection_items WHERE collection_id=$1',[f.list]);
    if(table==='account_category_pin_state') await pool.query('DELETE FROM account_category_pin_state WHERE account_id=$1',[f.account]);
    const db=await pool.connect();
    try {
      const operations=statements[table];
      for(let i=0;i<6;i+=2) {
        const before=await revision(f.account);
        await db.query('BEGIN');
        // Parent hard-delete and pin-state delete are restricted to migration/guarded purge authority.
        if(i!==4||!['collections','recommendations','account_category_pin_state'].includes(table)) await db.query('SET LOCAL ROLE music_runtime');
        await db.query(operations[i] as string,operations[i+1] as unknown[]);await db.query('COMMIT');
        expect(await revision(f.account),`${table} event ${i/2}`).toBeGreaterThan(before);
      }
    } finally {await db.query('ROLLBACK');db.release();}
  });
  it('fails closed on overflow and rolls back content and receipt',async()=>{
    const f=await fixture();await pool.query("UPDATE account_category_content_state SET revision=9007199254740991 WHERE account_id=$1 AND category='books'",[f.account]);
    const before=(await pool.query('SELECT title,revision FROM collections WHERE id=$1',[f.list])).rows[0];
    await expect(new ExplorersRecommendationRepository(pool).updateCollection(f.account,f.list,Number(before.revision),{title:'Overflow'},randomUUID())).rejects.toMatchObject({code:'23514'});
    expect((await pool.query('SELECT title,revision FROM collections WHERE id=$1',[f.list])).rows[0]).toEqual(before);expect(await revision(f.account)).toBe(9007199254740991n);
    expect((await pool.query('SELECT count(*)::int AS count FROM application_command_receipts WHERE account_id=$1',[f.account])).rows[0].count).toBe(0);
    await expect(pool.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1",[f.account])).rejects.toMatchObject({code:'23514'});
    expect((await pool.query('SELECT status FROM creator_accounts WHERE id=$1',[f.account])).rows[0].status).toBe('active');
    expect(await revision(f.account,'apps')).toBe(0n);expect(await revision(f.account)).toBe(9007199254740991n);
  });
  it('denies direct state writes and function invocation',async()=>{
    const f=await fixture(),db=await pool.connect();
    try {for(const sql of ['INSERT INTO account_category_content_state VALUES($1,\'guides\',1)','UPDATE account_category_content_state SET revision=revision+1 WHERE account_id=$1','DELETE FROM account_category_content_state WHERE account_id=$1','TRUNCATE account_category_content_state','SELECT explorers_content_revision_insert()','SELECT explorers_content_revision_update()','SELECT explorers_content_revision_delete()','SELECT explorers_content_revision_lifecycle()']) {
      await db.query('BEGIN');await db.query('SET LOCAL ROLE music_runtime');await expect(db.query(sql,sql.includes('$1')?[f.account]:[])).rejects.toMatchObject({code:'42501'});await db.query('ROLLBACK');
    }} finally {await db.query('ROLLBACK');db.release();}
  });
  it('installs SELECT-only state without runtime bump capability',async()=>{
    expect((await pool.query("SELECT to_regclass('public.account_category_content_state')::text AS name")).rows[0].name).toBe('account_category_content_state');
    const rights=(await pool.query(`SELECT has_table_privilege('music_runtime','account_category_content_state','SELECT') AS read,
      has_table_privilege('music_runtime','account_category_content_state','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS write`)).rows[0];
    expect(rights).toEqual({read:true,write:false});
  });
  it('keeps untouched scopes absent and rolls back first creation',async()=>{
    const account=(await pool.query('INSERT INTO creator_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    expect(await revision(account)).toBe(0n);
    const db=await pool.connect();
    try {await db.query('BEGIN');await db.query('SET LOCAL ROLE music_runtime');
      await db.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'books','First',$2,0)",[account,randomUUID()]);
      expect(BigInt((await db.query('SELECT revision FROM account_category_content_state WHERE account_id=$1',[account])).rows[0].revision)).toBeGreaterThan(0n);
      await db.query('ROLLBACK');expect(await revision(account)).toBe(0n);
    } finally {await db.query('ROLLBACK');db.release();}
  });
  it('advances on supported commands and preserves identical replay',async()=>{
    const account=(await pool.query('INSERT INTO creator_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const repo=new ExplorersRecommendationRepository(pool), input={category:'books' as const,title:'Command',slug:randomUUID()},key=randomUUID();
    const list=await repo.createCollection(account,input,key), first=await revision(account);
    expect(first).toBeGreaterThan(0n);expect(await repo.createCollection(account,input,key)).toEqual(list);expect(await revision(account)).toBe(first);
    await repo.updateCollection(account,list.id,list.revision,{heading:'Changed'},randomUUID());expect(await revision(account)).toBeGreaterThan(first);
  });
  it('advances status transitions only and retains eight bounded counters',async()=>{
    const f=await fixture(),before=await revision(f.account);
    await pool.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1",[f.account]);
    const suspended=await revision(f.account);expect(suspended).toBeGreaterThan(before);
    await pool.query('UPDATE creator_accounts SET updated_at=now() WHERE id=$1',[f.account]);expect(await revision(f.account)).toBe(suspended);
    await pool.query("UPDATE creator_accounts SET status='active',suspended_at=NULL WHERE id=$1",[f.account]);expect(await revision(f.account)).toBeGreaterThan(suspended);
    expect((await pool.query('SELECT count(*)::int AS count FROM account_category_content_state WHERE account_id=$1',[f.account])).rows[0].count).toBe(8);
  });
});
