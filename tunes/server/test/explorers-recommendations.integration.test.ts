import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let pool: pg.Pool;
beforeAll(() => { pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 4 }); });
afterAll(async () => { await pool.end(); });
async function account() {
  const result = await pool.query("INSERT INTO creator_accounts DEFAULT VALUES RETURNING id");
  return result.rows[0].id as string;
}
async function entity(kind = 'book') {
  const result = await pool.query("INSERT INTO entities(kind,title,origin) VALUES ($1,'Same title','manual') RETURNING id", [kind]);
  return result.rows[0].id as string;
}
async function collection(accountId: string, category = 'books') {
  const result = await pool.query(`INSERT INTO collections(account_id,category,title,slug,display_order)
    VALUES ($1,$2,'List',$3,0) RETURNING id`, [accountId, category, randomUUID()]);
  return result.rows[0].id as string;
}
async function recommendation(accountId: string, entityId: string, category = 'books') {
  const result = await pool.query(`INSERT INTO recommendations(account_id,entity_id,category)
    VALUES ($1,$2,$3) RETURNING id`, [accountId, entityId, category]);
  return result.rows[0].id as string;
}
async function contentAttachment(purpose:'collection'|'recommendation') {
  const accountId=await account();
  const parent=purpose==='collection'?await collection(accountId):await recommendation(accountId,await entity());
  const result=await pool.query(`INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,ready_at,content_sha256)
    VALUES($1,$2,'ready','image/png',10,now(),decode(repeat('00',32),'hex')) RETURNING id`,[accountId,purpose]);
  const mediaId=result.rows[0].id as string;
  return {accountId,mediaId,attach:(db:Pick<pg.PoolClient,'query'>)=>purpose==='collection'
    ?db.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)",[parent,accountId,mediaId])
    :db.query('INSERT INTO recommendation_media(recommendation_id,account_id,media_id,display_order) VALUES($1,$2,$3,0)',[parent,accountId,mediaId])};
}
async function waitForDatabaseLock(pid:number) {
  const deadline=Date.now()+5000;
  while(Date.now()<deadline) {
    const row=await pool.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",[pid]);
    if(row.rows[0]?.wait_event_type==='Lock') return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error('Expected the competing SQL writer to wait on an asset lock');
}

describe('recommendation core PostgreSQL contract', () => {
  it.each(['collection','recommendation'] as const)('rejects runtime purpose mutation of an attached %s asset', async purpose=>{
    const fixture=await contentAttachment(purpose), db=await pool.connect();
    try {
      await db.query('BEGIN');await db.query('SET LOCAL ROLE music_runtime');
      await fixture.attach(db);await db.query('COMMIT');
      await db.query('BEGIN');await db.query('SET LOCAL ROLE music_runtime');
      await db.query("UPDATE media_assets SET purpose=$2 WHERE id=$1",[fixture.mediaId,purpose==='collection'?'recommendation':'collection']);
      await expect(db.query('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toMatchObject({code:'23514'});
      await db.query('ROLLBACK');
      expect((await pool.query('SELECT purpose,status FROM media_assets WHERE id=$1',[fixture.mediaId])).rows[0]).toEqual({purpose,status:'ready'});
    } finally {await db.query('ROLLBACK');db.release();}
  });
  it.each(['collection','recommendation'] as const)('serializes a purpose update behind a committed %s attachment', async purpose=>{
    const fixture=await contentAttachment(purpose), attaching=await pool.connect(), updating=await pool.connect();
    let pending:Promise<unknown>|undefined;
    try {
      await attaching.query('BEGIN');await attaching.query('SET LOCAL ROLE music_runtime');
      await fixture.attach(attaching);await attaching.query('SET CONSTRAINTS ALL IMMEDIATE');
      await updating.query('BEGIN');await updating.query('SET LOCAL ROLE music_runtime');
      const pid=(await updating.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      pending=updating.query("UPDATE media_assets SET purpose=$2 WHERE id=$1",[fixture.mediaId,purpose==='collection'?'recommendation':'collection'])
        .then(()=>updating.query('SET CONSTRAINTS ALL IMMEDIATE')).catch(error=>error);
      await waitForDatabaseLock(pid);
      await attaching.query('COMMIT');
      expect(await pending).toMatchObject({code:'23514'});
      await updating.query('ROLLBACK');
    } finally {await attaching.query('ROLLBACK');await updating.query('ROLLBACK');await pending;attaching.release();updating.release();}
  });
  it.each(['collection','recommendation'] as const)('rejects an attachment after a concurrent %s purpose update commits', async purpose=>{
    const fixture=await contentAttachment(purpose), updating=await pool.connect(), attaching=await pool.connect();
    let pending:Promise<unknown>|undefined;
    try {
      await updating.query('BEGIN');await updating.query('SET LOCAL ROLE music_runtime');
      await updating.query("UPDATE media_assets SET purpose=$2 WHERE id=$1",[fixture.mediaId,purpose==='collection'?'recommendation':'collection']);
      await attaching.query('BEGIN');await attaching.query('SET LOCAL ROLE music_runtime');await fixture.attach(attaching);
      const pid=(await attaching.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      pending=attaching.query('SET CONSTRAINTS ALL IMMEDIATE').catch(error=>error);
      await waitForDatabaseLock(pid);await updating.query('COMMIT');
      expect(await pending).toMatchObject({code:'23514'});
      await attaching.query('ROLLBACK');
    } finally {await updating.query('ROLLBACK');await attaching.query('ROLLBACK');await pending;updating.release();attaching.release();}
  });
  it('installs the core identity and owned relationship tables', async () => {
    for (const name of ['entities','entity_identifiers','collections','recommendations','collection_items',
      'account_category_pin_state','category_recommendation_pins','collection_media','recommendation_media']) {
      const result = await pool.query('SELECT to_regclass($1)::text AS name', [name]);
      expect(result.rows[0].name).toBe(name);
    }
  });
  it('keeps provider kinds and IDs distinct and prevents provider reassignment', async () => {
    const first = await entity('movie'), second = await entity('movie'), externalId=randomUUID();
    await pool.query(`INSERT INTO entity_identifiers(entity_id,provider,external_kind,external_id)
      VALUES ($1,'tmdb','movie',$3),($2,'tmdb','tv',$3)`, [first,second,externalId]);
    await expect(pool.query(`INSERT INTO entity_identifiers(entity_id,provider,external_kind,external_id)
      VALUES ($1,'tmdb','movie',$2)`,[second,externalId])).rejects.toMatchObject({code:'23505'});
    expect(first).not.toBe(second);
  });
  it('allows independent recommendations of a shared entity and repeat contexts', async () => {
    const a = await account(), b = await account(), shared = await entity();
    const ids = await Promise.all([recommendation(a,shared),recommendation(b,shared),recommendation(a,shared)]);
    expect(new Set(ids).size).toBe(3);
    await pool.query('UPDATE recommendations SET user_rating=9 WHERE id=$1',[ids[0]]);
    expect((await pool.query('SELECT user_rating FROM recommendations WHERE id=$1',[ids[1]])).rows[0].user_rating).toBeNull();
  });
  it('rejects foreign and wrong-category collection membership', async () => {
    const a = await account(), b = await account(), list = await collection(a), item = await recommendation(b,await entity());
    await expect(pool.query(`INSERT INTO collection_items VALUES ($1,$2,$3,'books',0,now())`,[list,item,a])).rejects.toMatchObject({code:'23503'});
    const movie = await recommendation(a,await entity('movie'),'movies');
    await expect(pool.query(`INSERT INTO collection_items VALUES ($1,$2,$3,'books',0,now())`,[list,movie,a])).rejects.toMatchObject({code:'23503'});
  });
  it('enforces entity category mapping including Places people and parent changes', async () => {
    const a = await account(), person = await entity('person');
    await recommendation(a,person,'places');
    await expect(recommendation(a,person,'books')).rejects.toMatchObject({code:'23514'});
    await expect(pool.query("UPDATE entities SET kind='book' WHERE id=$1",[person])).rejects.toMatchObject({code:'23514'});
  });
  it('permits atomic swaps but rejects duplicate final positions', async () => {
    const a=await account(), list=await collection(a), first=await recommendation(a,await entity()), second=await recommendation(a,await entity());
    await pool.query(`INSERT INTO collection_items VALUES ($1,$2,$4,'books',0,now()),($1,$3,$4,'books',1,now())`,[list,first,second,a]);
    await pool.query('UPDATE collection_items SET display_order=1-display_order WHERE collection_id=$1',[list]);
    await expect(pool.query('UPDATE collection_items SET display_order=0 WHERE collection_id=$1',[list])).rejects.toMatchObject({code:'23505'});
    expect((await pool.query('SELECT recommendation_id FROM collection_items WHERE collection_id=$1 ORDER BY display_order',[list])).rows.map(r=>r.recommendation_id)).toEqual([second,first]);
  });
  it('keeps archived slugs reserved and shared catalog facts intact', async () => {
    const a=await account(), list=await collection(a), shared=await entity(), item=await recommendation(a,shared);
    await pool.query(`INSERT INTO collection_items VALUES ($1,$2,$3,'books',0,now())`,[list,item,a]);
    await pool.query('UPDATE collections SET archived_at=now() WHERE id=$1',[list]);
    await expect(pool.query(`INSERT INTO collections(account_id,category,title,slug,display_order)
      SELECT account_id,category,title,slug,1 FROM collections WHERE id=$1`,[list])).rejects.toMatchObject({code:'23505'});
    expect((await pool.query('SELECT id FROM entities WHERE id=$1',[shared])).rowCount).toBe(1);
  });
  it('denies runtime catalog identity reassignment and content hard deletion', async () => {
    const client=await pool.connect();
    try {
      await client.query('SET ROLE music_runtime');
      await expect(client.query('DELETE FROM entities')).rejects.toMatchObject({code:'42501'});
      await expect(client.query('TRUNCATE collections')).rejects.toMatchObject({code:'42501'});
      await expect(client.query('UPDATE entity_identifiers SET entity_id=gen_random_uuid()')).rejects.toMatchObject({code:'42501'});
      await expect(client.query('DELETE FROM recommendations')).rejects.toMatchObject({code:'42501'});
    } finally {await client.query('RESET ROLE');client.release();}
  });
  it('rejects foreign, unready and wrong-purpose content media at the database boundary', async () => {
    const a=await account(), b=await account(), list=await collection(a);
    const media=await pool.query(`INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size)
      VALUES ($1,'collection','uploading','image/png',10) RETURNING id`,[b]);
    const id=media.rows[0].id;
    await expect(pool.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)",[list,a,id])).rejects.toMatchObject({code:'23503'});
    await pool.query('UPDATE media_assets SET account_id=$1 WHERE id=$2',[a,id]);
    await expect(pool.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)",[list,a,id])).rejects.toMatchObject({code:'23514'});
    await pool.query("UPDATE media_assets SET purpose='claim-evidence',status='ready',ready_at=now(),content_sha256=decode(repeat('00',32),'hex') WHERE id=$1",[id]);
    await expect(pool.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)",[list,a,id])).rejects.toMatchObject({code:'23514'});
  });
  it('keeps ready media referenced by content from entering deletion', async () => {
    const a=await account(), list=await collection(a);
    const result=await pool.query(`INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,ready_at,content_sha256)
      VALUES($1,'collection','ready','image/png',10,now(),decode(repeat('00',32),'hex')) RETURNING id`,[a]);
    const media=result.rows[0].id;
    await pool.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)",[list,a,media]);
    await expect(pool.query("UPDATE media_assets SET status='pending_delete',delete_requested_at=now() WHERE id=$1",[media])).rejects.toMatchObject({code:'23514'});
  });
  it('keeps attached content media out of owner deletion and abandoned cleanup', async () => {
    const {MediaRepository}=await import('../repositories/mediaRepository');
    const a=await account(), list=await collection(a);
    const result=await pool.query(`INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,ready_at,content_sha256,created_at)
      VALUES($1,'collection','ready','image/png',10,now(),decode(repeat('00',32),'hex'),now()-interval '2 days') RETURNING id`,[a]);
    const media=result.rows[0].id;
    await pool.query(`INSERT INTO media_objects(media_id,variant,storage_environment,object_key,mime_type,byte_size,content_sha256)
      VALUES($1,'original','local',$2,'image/png',10,decode(repeat('00',32),'hex'))`,[media,`local/${randomUUID()}`]);
    await pool.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)",[list,a,media]);
    const repository=new MediaRepository(pool);
    expect((await repository.abandoned(a,'local')).map(r=>r.id)).not.toContain(media);
    expect(await repository.markDelete(media,a)).toBeUndefined();
    expect((await pool.query('SELECT status FROM media_assets WHERE id=$1',[media])).rows[0].status).toBe('ready');
  });
});

describe('recommendation repository transactions', () => {
  it('permits content purge only for a matching running terminal deletion and retries atomically', async () => {
    const a=await account(), b=await account(), shared=await entity(), list=await collection(a), other=await collection(b);
    const first=await recommendation(a,shared), second=await recommendation(b,shared);
    await pool.query('INSERT INTO recommendation_display_overrides(recommendation_id,account_id,display_values) VALUES($1,$2,$3),($4,$5,$6)',[first,a,{title:null},second,b,{title:'B survives'}]);
    await pool.query("INSERT INTO collection_items VALUES($1,$2,$3,'books',0,now())",[list,first,a]);
    await pool.query("INSERT INTO account_category_pin_state(account_id,category) VALUES($1,'books')",[a]);
    await pool.query("INSERT INTO category_recommendation_pins VALUES($1,'books',$2,$3,0)",[a,first,list]);
    const client=await pool.connect();
    try {
      await client.query('SET ROLE music_runtime');
      await expect(client.query('SELECT purge_explorers_account_content($1,$2)',[a,randomUUID()])).rejects.toMatchObject({code:'42501'});
      await client.query('RESET ROLE');
      const receipt=await pool.query(`INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,response)
        VALUES($1,'requestAccountDeletion',decode(repeat('01',32),'hex'),decode(repeat('01',32),'hex'),'{}') RETURNING id`,[a]);
      const feedback=await pool.query("INSERT INTO deletion_feedback(account_id,reason) VALUES($1,'Delete') RETURNING id",[a]);
      const operation=await pool.query(`INSERT INTO account_lifecycle_operations(account_id,kind,state,expected_revision,feedback_id,receipt_id)
        VALUES($1,'delete','running',1,$2,$3) RETURNING id`,[a,feedback.rows[0].id,receipt.rows[0].id]);
      await pool.query("UPDATE creator_accounts SET status='pending_deletion',deletion_requested_at=now() WHERE id=$1",[a]);
      await client.query('SET ROLE music_runtime');
      await expect(client.query('SELECT purge_explorers_account_content($1,$2)',[b,operation.rows[0].id])).rejects.toMatchObject({code:'42501'});
      await client.query('BEGIN');
      await client.query('SELECT purge_explorers_account_content($1,$2)',[a,operation.rows[0].id]);
      await client.query('ROLLBACK');
      expect((await pool.query('SELECT id FROM recommendations WHERE id=$1',[first])).rowCount).toBe(1);
      expect((await pool.query('SELECT display_values FROM recommendation_display_overrides WHERE recommendation_id=$1',[first])).rows).toEqual([{display_values:{title:null}}]);
      const purged=await client.query('SELECT purge_explorers_account_content($1,$2) AS count',[a,operation.rows[0].id]);
      expect(purged.rows[0].count).toBe(2);
      expect((await client.query('SELECT purge_explorers_account_content($1,$2) AS count',[a,operation.rows[0].id])).rows[0].count).toBe(0);
      expect((await pool.query('SELECT id FROM entities WHERE id=$1',[shared])).rowCount).toBe(1);
      expect((await pool.query('SELECT id FROM recommendations WHERE id=$1',[second])).rowCount).toBe(1);
      expect((await pool.query('SELECT display_values FROM recommendation_display_overrides WHERE recommendation_id=$1',[first])).rows).toEqual([]);
      expect((await pool.query('SELECT display_values FROM recommendation_display_overrides WHERE recommendation_id=$1',[second])).rows).toEqual([{display_values:{title:'B survives'}}]);
      expect((await pool.query('SELECT id FROM collections WHERE id=$1',[other])).rowCount).toBe(1);
      expect((await pool.query('SELECT * FROM category_recommendation_pins WHERE account_id=$1',[a])).rowCount).toBe(0);
    } finally {await client.query('RESET ROLE');client.release();}
  });
  it('rolls back failed category writes including receipt and parent revision', async () => {
    const {ExplorersRecommendationRepository}=await import('../repositories/explorersRecommendationRepository');
    const repository=new ExplorersRecommendationRepository(pool), a=await account();
    const list=await repository.createCollection(a,{category:'books',title:'Read',slug:'read'},randomUUID()), key=randomUUID();
    await expect(repository.createRecommendation(a,{category:'books',entityId:await entity('person'),collectionId:list.id,expectedCollectionRevision:1},key)).rejects.toMatchObject({code:'23514'});
    expect((await pool.query('SELECT revision::int FROM collections WHERE id=$1',[list.id])).rows[0].revision).toBe(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM application_command_receipts WHERE account_id=$1 AND operation='createRecommendation'",[a])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM recommendations WHERE account_id=$1',[a])).rows[0].n).toBe(0);
    const saved=await repository.createRecommendation(a,{category:'books',entityId:await entity(),collectionId:list.id,expectedCollectionRevision:1},key);
    expect(saved.revision).toBe(1);
  });
  it('expires create replay without recreating a resource', async () => {
    const {ExplorersRecommendationRepository}=await import('../repositories/explorersRecommendationRepository');
    const repository=new ExplorersRecommendationRepository(pool), a=await account(), key=randomUUID();
    const input={category:'books' as const,title:'Read',slug:'read'};
    await repository.createCollection(a,input,key);
    await pool.query("UPDATE application_command_receipts SET replay_until=now()-interval '1 second' WHERE account_id=$1",[a]);
    await expect(repository.createCollection(a,input,key)).rejects.toMatchObject({status:409});
    expect((await pool.query('SELECT count(*)::int AS n FROM collections WHERE account_id=$1',[a])).rows[0].n).toBe(1);
  });
  it('applies account, category and parent visibility before returning a public collection', async () => {
    const {ExplorersRecommendationRepository}=await import('../repositories/explorersRecommendationRepository');
    const repository=new ExplorersRecommendationRepository(pool), a=await account();
    const list=await repository.createCollection(a,{category:'books',title:'Read',slug:'read',visibility:'public',publicationState:'published'},randomUUID());
    await pool.query("UPDATE creator_accounts SET onboarding_status='complete',public_profile=true,handle=$2,display_name='Owner',account_type='Creator' WHERE id=$1",[a,`t${randomUUID().replaceAll('-','').slice(0,12)}`]);
    await pool.query("INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,'books',true,0)",[a]);
    expect((await repository.getPublicCollection(list.id))?.id).toBe(list.id);
    await pool.query("UPDATE account_category_settings SET is_public=false WHERE account_id=$1",[a]);
    expect(await repository.getPublicCollection(list.id)).toBeNull();
    await pool.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1",[a]);
    await pool.query("UPDATE collections SET visibility='private' WHERE id=$1",[list.id]);
    expect(await repository.getPublicCollection(list.id)).toBeNull();
    await pool.query("UPDATE collections SET visibility='public' WHERE id=$1",[list.id]);
    await pool.query("UPDATE creator_accounts SET public_profile=false WHERE id=$1",[a]);
    expect(await repository.getPublicCollection(list.id)).toBeNull();
  });
  it('revision-checks recommendation edits and archives only that recommendation', async () => {
    const {ExplorersRecommendationRepository}=await import('../repositories/explorersRecommendationRepository');
    const repository=new ExplorersRecommendationRepository(pool), a=await account(), shared=await entity();
    const list=await repository.createCollection(a,{category:'books',title:'Read',slug:'read'},randomUUID());
    const first=await repository.createRecommendation(a,{category:'books',entityId:shared,collectionId:list.id,expectedCollectionRevision:1},randomUUID());
    const second=await repository.createRecommendation(a,{category:'books',entityId:shared,collectionId:list.id,expectedCollectionRevision:2},randomUUID());
    const edited=await repository.updateRecommendation(a,first.id,1,{userRating:8},randomUUID());
    expect(edited.revision).toBe(2);
    await expect(repository.updateRecommendation(a,first.id,1,{userRating:9},randomUUID())).rejects.toMatchObject({status:409});
    const key=randomUUID(); await repository.archiveRecommendation(a,first.id,2,key); await repository.archiveRecommendation(a,first.id,2,key);
    expect((await pool.query('SELECT recommendation_id FROM collection_items WHERE collection_id=$1',[list.id])).rows.map(r=>r.recommendation_id)).toEqual([second.id]);
    expect((await pool.query('SELECT user_rating FROM recommendations WHERE id=$1',[second.id])).rows[0].user_rating).toBeNull();
    expect((await pool.query('SELECT id FROM entities WHERE id=$1',[shared])).rowCount).toBe(1);
  });
  it('serializes provider resolution without merging equal titles', async () => {
    const {ExplorersRecommendationRepository}=await import('../repositories/explorersRecommendationRepository');
    const repository=new ExplorersRecommendationRepository(pool);
    const input={kind:'movie' as const,title:'Equal title',provider:'tmdb' as const,externalKind:'movie',externalId:randomUUID()};
    const resolved=await Promise.all([repository.resolveProviderEntity(input),repository.resolveProviderEntity(input)]);
    expect(resolved[0].id).toBe(resolved[1].id);
    const distinct=await repository.resolveProviderEntity({...input,externalId:randomUUID()});
    expect(distinct.id).not.toBe(resolved[0].id);
  });
  it('makes concurrent create retries one resource and rejects changed payload', async () => {
    const {ExplorersRecommendationRepository}=await import('../repositories/explorersRecommendationRepository');
    const repository=new ExplorersRecommendationRepository(pool), a=await account();
    const input={category:'books' as const,title:'Read',slug:'reads',visibility:'public' as const,publicationState:'published' as const};
    const key=randomUUID();
    const results=await Promise.all([repository.createCollection(a,input,key),repository.createCollection(a,input,key)]);
    expect(results[0]).toEqual(results[1]);
    await expect(repository.createCollection(a,{...input,title:'Changed'},key)).rejects.toMatchObject({status:409});
    expect((await pool.query('SELECT count(*)::int AS n FROM collections WHERE account_id=$1',[a])).rows[0].n).toBe(1);
  });
  it('rejects stale and incomplete reorder without partial changes; archives replay before stale revision', async () => {
    const {ExplorersRecommendationRepository}=await import('../repositories/explorersRecommendationRepository');
    const repository=new ExplorersRecommendationRepository(pool), a=await account(), b=await account();
    const list=await repository.createCollection(a,{category:'books',title:'Read',slug:'books'},randomUUID());
    const first=await repository.createRecommendation(a,{category:'books',entityId:await entity(),collectionId:list.id,expectedCollectionRevision:1},randomUUID());
    const second=await repository.createRecommendation(a,{category:'books',entityId:await entity(),collectionId:list.id,expectedCollectionRevision:2},randomUUID());
    const ordering=()=>pool.query('SELECT recommendation_id FROM collection_items WHERE collection_id=$1 ORDER BY display_order',[list.id]);
    await expect(repository.reorderCollection(a,list.id,3,[second.id],randomUUID())).rejects.toMatchObject({status:422});
    await expect(repository.reorderCollection(a,list.id,2,[second.id,first.id],randomUUID())).rejects.toMatchObject({status:409});
    await expect(repository.reorderCollection(b,list.id,3,[second.id,first.id],randomUUID())).rejects.toMatchObject({status:404});
    expect((await ordering()).rows.map(r=>r.recommendation_id)).toEqual([first.id,second.id]);
    const updated=await repository.reorderCollection(a,list.id,3,[second.id,first.id],randomUUID());
    expect(updated.revision).toBe(4);
    expect((await ordering()).rows.map(r=>r.recommendation_id)).toEqual([second.id,first.id]);
    const key=randomUUID();
    await repository.archiveCollection(a,list.id,4,key);
    await repository.archiveCollection(a,list.id,4,key);
    await expect(repository.archiveCollection(a,list.id,4,randomUUID())).rejects.toMatchObject({status:404});
    expect((await pool.query('SELECT count(*)::int AS n FROM recommendations WHERE account_id=$1',[a])).rows[0].n).toBe(2);
  });
});
