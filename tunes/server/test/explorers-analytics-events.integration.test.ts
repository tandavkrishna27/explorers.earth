import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { AnalyticsService, analyticsInputHash } from '../application/analytics';
import type { Actor } from '../application/actor';
import request from 'supertest';
import { createCanonicalApp } from '../auth/canonicalApp';
import { resolveExplorersAuthConfig } from '../auth/betterAuth';
import { provisionMusicRuntimeLogin, verifyMusicRuntimeLogin } from '../db/music-runtime-role';
let pool: pg.Pool, service: AnalyticsService;
beforeAll(() => { pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 8 }); service = new AnalyticsService(pool); });
afterAll(async () => { await pool.end(); });
async function fixture() {
    const userId = randomUUID(), handle = `analytics-${randomUUID().slice(0, 8)}`;
    await pool.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Analytics',$2)", [userId, `${userId}@example.invalid`]);
    const accountId = (await pool.query("INSERT INTO creator_accounts(handle,display_name,account_type,onboarding_status) VALUES($1,'Analytics','Personal','complete') RETURNING id", [handle])).rows[0].id;
    await pool.query("INSERT INTO account_memberships(user_id,account_id,role) VALUES($1,$2,'owner')", [userId, accountId]);
    await pool.query('INSERT INTO user_security_state(user_id) VALUES($1)', [userId]);
    await pool.query("INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,'books',true,0)", [accountId]);
    const collectionId = (await pool.query("INSERT INTO collections(account_id,category,title,slug,display_order,visibility,publication_state) VALUES($1,'books','Visible','visible',0,'public','published') RETURNING id", [accountId])).rows[0].id;
    const actor: Actor = { userId, accountId, role: 'owner', credential: { kind: 'oauth', grantId: randomUUID(), scopes: ['analytics:read'] } };
    const input = { consent: true, eventId: `event-${randomUUID()}`, accountId, locationId: collectionId, event: { type: 'view' as const, page: 'public-books' as const, timestamp: new Date().toISOString(), canonicalPath: `/${handle}/books/visible` } };
    return { accountId, userId, collectionId, actor, input };
}
it('commits exactly one concurrent event and receipt, conflicts on changed timestamp and does not bump content revisions', async () => {
    const f = await fixture(), before = (await pool.query('SELECT revision FROM creator_accounts WHERE id=$1', [f.accountId])).rows;
    const results = await Promise.all(Array.from({ length: 8 }, () => service.recordAnalyticsEvent(f.input, { requestId: 'concurrent' })));
    expect(results.filter(x => x.status === 'accepted')).toHaveLength(1);
    expect(results.filter(x => x.status === 'duplicate')).toHaveLength(7);
    expect((await pool.query('SELECT count(*) FROM analytics_events WHERE account_id=$1', [f.accountId])).rows[0].count).toBe('1');
    expect((await pool.query('SELECT count(*) FROM analytics_event_receipts WHERE account_id=$1', [f.accountId])).rows[0].count).toBe('1');
    await expect(service.recordAnalyticsEvent({ ...f.input, event: { ...f.input.event, timestamp: new Date(Date.parse(f.input.event.timestamp) - 1).toISOString() } }, { requestId: 'conflict' })).rejects.toMatchObject({ name: 'IdempotencyConflictError' });
    expect((await pool.query('SELECT revision FROM creator_accounts WHERE id=$1', [f.accountId])).rows).toEqual(before);
});
it('denied consent/private/foreign targets create zero state and hidden identical retries remain unavailable', async () => {
    const a = await fixture(), b = await fixture();
    expect(await service.recordAnalyticsEvent({ ...a.input, consent: false }, { requestId: 'denied', resolveCountry: () => { throw Error('must not enrich'); } })).toEqual({ status: 'consent-denied' });
    await expect(service.recordAnalyticsEvent({ ...a.input, locationId: b.collectionId }, { requestId: 'foreign' })).rejects.toMatchObject({ status: 404 });
    await pool.query("UPDATE collections SET visibility='private' WHERE id=$1", [a.collectionId]);
    await expect(service.recordAnalyticsEvent(a.input, { requestId: 'private' })).rejects.toMatchObject({ status: 404 });
    expect((await pool.query('SELECT count(*) FROM analytics_event_receipts WHERE account_id=$1', [a.accountId])).rows[0].count).toBe('0');
    await pool.query("UPDATE collections SET visibility='public' WHERE id=$1", [a.collectionId]);
    await service.recordAnalyticsEvent(a.input, { requestId: 'accepted' });
    await pool.query("UPDATE collections SET visibility='private' WHERE id=$1", [a.collectionId]);
    await expect(service.recordAnalyticsEvent(a.input, { requestId: 'hidden-retry' })).rejects.toMatchObject({ status: 404 });
});
it('Actor aggregate is isolated and rejects absent scope, foreign resource and suspended owner', async () => {
    const a = await fixture(), b = await fixture();
    await service.recordAnalyticsEvent(a.input, { requestId: 'aggregate' });
    const query = { from: new Date(Date.now() - 60000).toISOString(), to: new Date(Date.now() + 60000).toISOString() };
    expect((await service.getCreatorAnalytics(a.actor, query)).totals).toEqual({ views: 1, clicks: 0, interactions: 0 });
    expect((await service.getCreatorAnalytics(b.actor, query)).totals.views).toBe(0);
    await expect(service.getCreatorAnalytics({ ...a.actor, credential: { kind: 'oauth', grantId: 'fixture', scopes: [] } }, query)).rejects.toMatchObject({ status: 403 });
    await expect(service.getCreatorAnalytics(a.actor, { ...query, collectionId: b.collectionId })).rejects.toMatchObject({ status: 404 });
    await pool.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1", [a.accountId]);
    await expect(service.getCreatorAnalytics(a.actor, query)).rejects.toMatchObject({ status: 403 });
});
it('retention retires receipts atomically, aging retry never recreates payload and FK binds both account and key', async () => {
    const f = await fixture(), accepted = await service.recordAnalyticsEvent(f.input, { requestId: 'retention' });
    if (!('eventId' in accepted))
        throw Error('event missing');
    const linkage = await pool.connect();
    try {
        await linkage.query('BEGIN');
        await linkage.query('DELETE FROM analytics_event_receipts WHERE account_id=$1', [f.accountId]);
        await expect(linkage.query('INSERT INTO analytics_event_receipts(account_id,client_event_id,input_hash,event_id) VALUES($1,$2,$3,$4)', [f.accountId, 'different-key', Buffer.alloc(32), accepted.eventId])).rejects.toMatchObject({ code: '23503' });
    }
    finally {
        await linkage.query('ROLLBACK');
        linkage.release();
    }
    await pool.query("UPDATE analytics_events SET occurred_at=now()-interval '367 days' WHERE id=$1", [accepted.eventId]);
    await pool.query('SELECT purge_expired_analytics_events(100)');
    expect(await service.recordAnalyticsEvent(f.input, { requestId: 'retired-retry' })).toEqual({ status: 'duplicate', retired: true });
    // Model an accepted historical body after the payload's retention window elapsed.
    const aged = {...f.input,event:{...f.input.event,timestamp:new Date(Date.now()-367*86400000).toISOString()}};
    await pool.query('UPDATE analytics_event_receipts SET input_hash=$1 WHERE account_id=$2 AND client_event_id=$3',[analyticsInputHash(aged),f.accountId,f.input.eventId]);
    expect(await service.recordAnalyticsEvent(aged,{requestId:'aged-retired-retry'})).toEqual({status:'duplicate',retired:true});
    await expect(service.recordAnalyticsEvent({...aged,eventId:`new-aged-${randomUUID()}`},{requestId:'new-aged'})).rejects.toMatchObject({status:422});
    expect((await pool.query('SELECT count(*) FROM analytics_events WHERE account_id=$1', [f.accountId])).rows[0].count).toBe('0');
    expect((await pool.query('SELECT octet_length(input_hash) AS bytes,event_id,retired_at IS NOT NULL AS retired FROM analytics_event_receipts WHERE account_id=$1', [f.accountId])).rows).toEqual([{ bytes: 32, event_id: null, retired: true }]);
});
it('canonical POST boots without Strapi and maps strict statuses; anonymous summary has no authority', async () => {
    const f = await fixture(), app = createCanonicalApp(pool, resolveExplorersAuthConfig({ EXPLORERS_PUBLIC_ORIGIN: 'http://127.0.0.1:51474', EXPLORERS_AUTH_SECRET: 'analytics-fixture-secret-'.repeat(3), GOOGLE_CLIENT_ID: 'fixture', GOOGLE_CLIENT_SECRET: 'fixture' })).app;
    expect((await request(app).get('/api/explorers/analytics/summary').query({ from: f.input.event.timestamp, to: new Date(Date.now() + 60000).toISOString() })).status).toBe(401);
    expect((await request(app).post('/api/explorers/analytics/events').send(f.input)).status).toBe(201);
    const duplicate = await request(app).post('/api/explorers/analytics/events').send(f.input);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body).toMatchObject({ status: 'committed', duplicate: true });
    expect((await request(app).post('/api/explorers/analytics/events').send({ ...f.input, event: { ...f.input.event, type: 'click' } })).status).toBe(409);
    expect((await request(app).post('/api/explorers/analytics/events').send({ ...f.input, consent: false })).status).toBe(204);
    expect((await request(app).post('/api/explorers/analytics/events').send({ ...f.input, event: { ...f.input.event, timestamp: '1970-01-01T00:00:00Z' }, eventId: `old-${randomUUID()}` })).status).toBe(422);
});
it('lost COMMIT acknowledgement retries one stored event and transaction failure leaves neither row', async () => {
    const f = await fixture();
    let lost = false;
    const observed = { connect: async () => { const db = await pool.connect(); return { release: () => db.release(), query: async (sql: string, args?: unknown[]) => { const result = await db.query(sql, args); if (sql === 'COMMIT' && !lost) {
                lost = true;
                throw Error('owned lost commit acknowledgement');
            } return result; } }; } } as unknown as pg.Pool;
    await expect(new AnalyticsService(observed).recordAnalyticsEvent(f.input, { requestId: 'lost' })).rejects.toThrow('owned lost commit acknowledgement');
    expect((await service.recordAnalyticsEvent(f.input, { requestId: 'retry' })).status).toBe('duplicate');
    const failed = { ...f.input, eventId: `rollback-${randomUUID()}` };
    const failing = { connect: async () => { const db = await pool.connect(); return { release: () => db.release(), query: (sql: string, args?: unknown[]) => sql.startsWith('INSERT INTO analytics_event_receipts') ? Promise.reject(Error('owned receipt failure')) : db.query(sql, args) }; } } as unknown as pg.Pool;
    await expect(new AnalyticsService(failing).recordAnalyticsEvent(failed, { requestId: 'rollback' })).rejects.toThrow('owned receipt failure');
    expect((await pool.query('SELECT count(*) FROM analytics_events WHERE client_event_id=$1', [failed.eventId])).rows[0].count).toBe('0');
});
it('UTC boundaries are inclusive/exclusive and account suspension during aggregate is rechecked', async () => {
    const f = await fixture();
    await service.recordAnalyticsEvent(f.input, { requestId: 'utc' });
    const from = new Date(Date.now() - 2 * 86400000), midnight = new Date(Math.floor(from.getTime() / 86400000) * 86400000);
    await pool.query('UPDATE analytics_events SET occurred_at=$1 WHERE account_id=$2', [midnight, f.accountId]);
    const start = midnight.toISOString(), end = new Date(midnight.getTime() + 86400000).toISOString();
    expect((await service.getCreatorAnalytics(f.actor, { from: start, to: end })).totals.views).toBe(1);
    expect((await service.getCreatorAnalytics(f.actor, { from: new Date(midnight.getTime() - 86400000).toISOString(), to: start })).totals.views).toBe(0);
    let changed = false;
    const race = { connect: async () => { const db = await pool.connect(); return { release: () => db.release(), query: async (sql: string, args?: unknown[]) => { const result = await db.query(sql, args); if (sql.startsWith('WITH eligible') && !changed) {
                changed = true;
                await pool.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1", [f.accountId]);
            } return result; } }; } } as unknown as pg.Pool;
    await expect(new AnalyticsService(race).getCreatorAnalytics(f.actor, { from: start, to: end })).rejects.toMatchObject({ status: 403 });
    expect(changed).toBe(true);
});
it('database aggregation bounds each dimension before transferring rows and preserves exact remainder', async () => {
    const f = await fixture();
    await pool.query(`INSERT INTO analytics_events(account_id,client_event_id,event_type,page,category,occurred_at,canonical_path,element,consent_version) SELECT $1,'bounded-'||n,'view','public-books','books',now(),$2,'element-'||lpad(n::text,3,'0'),'explorers-analytics-v1' FROM generate_series(1,111) n`, [f.accountId, f.input.event.canonicalPath]);
    let dimensionRows = 0;
    const observed = { connect: async () => { const db = await pool.connect(); return { release: () => db.release(), query: async (sql: string, args?: unknown[]) => { const result = await db.query(sql, args); if (sql.startsWith('WITH eligible'))
                dimensionRows = result.rows.filter(row => row.dimension === 'element' || row.dimension === 'element:other').length; return result; } }; } } as unknown as pg.Pool;
    const summary = await new AnalyticsService(observed).getCreatorAnalytics(f.actor, { from: new Date(Date.now() - 60000).toISOString(), to: new Date(Date.now() + 60000).toISOString() });
    expect(dimensionRows).toBe(101);
    expect(summary.dimensions.element.buckets).toHaveLength(100);
    expect(summary.dimensions.element.other.views).toBe(11);
    expect(summary.totals.views).toBe(111);
});
it('preserves every currently permitted descriptive metadata field without exposing it in summaries', async () => {
    const f = await fixture(), metadata = { title: 'Visible title', authors: 'Public author', listName: 'Visible list', category: 'books', recommendationType: 'book', sector: 'Public sector', genre: 'Public genre', subject: 'Public subject', guideName: 'Public guide label', mediaType: 'book', genres: 'Public genres' };
    await service.recordAnalyticsEvent({ ...f.input, event: { ...f.input.event, metadata } }, { requestId: 'metadata' });
    expect((await pool.query('SELECT metadata FROM analytics_events WHERE account_id=$1', [f.accountId])).rows[0].metadata).toEqual(metadata);
    const summary = await service.getCreatorAnalytics(f.actor, { from: new Date(Date.now() - 60000).toISOString(), to: new Date(Date.now() + 60000).toISOString() });
    expect(JSON.stringify(summary)).not.toContain('Visible title');
});
it('canonical Music bridge preserves public/friendly minimal ingestion, server time and missing-map privacy', async () => {
    const f = await fixture(), app = createCanonicalApp(pool, resolveExplorersAuthConfig({ EXPLORERS_PUBLIC_ORIGIN: 'http://127.0.0.1:51474', EXPLORERS_AUTH_SECRET: 'music-analytics-fixture-'.repeat(3), GOOGLE_CLIENT_ID: 'fixture', GOOGLE_CLIENT_SECRET: 'fixture' })).app;
    await pool.query("INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,'music',true,1)", [f.accountId]);
    const slug = `music-${randomUUID()}`, legacy = `legacy-${randomUUID()}`, user = (await pool.query(`INSERT INTO users(username,password,email,guest_url,venue_name,strapi_user_document_id,strapi_account_document_id,lifecycle_operation_id,guest_capability_hash,guest_discoverable) VALUES($1,'not-a-login-secret',$2,$3,'Music',$4,$5,$5,$6,true) RETURNING id`, [`music-${randomUUID()}`, `${randomUUID()}@example.invalid`, slug, `provider-${randomUUID()}`, legacy, randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')])).rows[0].id;
    const body = { consent: true, eventId: `music-event-${randomUUID()}`, event: { name: 'playlist_opened' } };
    expect((await request(app).post(`/api/explorers/analytics/music/${slug}/events`).send(body)).status).toBe(404);
    await pool.query('INSERT INTO account_music_identity(account_id,music_user_id) VALUES($1,$2)', [f.accountId, user]);
    expect((await request(app).post(`/api/explorers/analytics/music/${slug}/events`).send(body)).status).toBe(201);
    expect((await request(app).post(`/api/explorers/analytics/music/${slug}/events`).send(body)).status).toBe(200);
    expect((await request(app).post(`/api/explorers/analytics/music-account/${legacy}/events`).send({ ...body, eventId: `friendly-${randomUUID()}` })).status).toBe(201);
    const generic = { ...f.input, locationId: undefined, eventId: `generic-music-${randomUUID()}`, event: { ...f.input.event, page: 'public-music', canonicalPath: f.input.event.canonicalPath.split('/books')[0] + '/music' } };
    expect((await request(app).post('/api/explorers/analytics/events').send(generic)).status).toBe(201);
    const times = (await pool.query('SELECT occurred_at,received_at FROM analytics_events WHERE account_id=$1 AND canonical_path=$2', [f.accountId, '/music/share'])).rows;
    expect(times).toHaveLength(2);
    for (const row of times)
        expect(row.occurred_at).toEqual(row.received_at);
});
it('actual protected runtime records/reads and retains payload only through maintenance authority', async () => {
    const f = await fixture(), login = `analytics_runtime_${randomUUID().replaceAll('-', '').slice(0, 12)}`, password = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
    await provisionMusicRuntimeLogin(pool, { loginRole: login, password });
    const target = new URL(process.env.DATABASE_URL_TEST!);
    target.username = login;
    target.password = password;
    const runtime = new pg.Pool({ connectionString: target.toString(), max: 4 });
    try {
        await verifyMusicRuntimeLogin(pool, runtime, { loginRole: login });
        const service = new AnalyticsService(runtime);
        await service.recordAnalyticsEvent(f.input, { requestId: 'protected' });
        expect((await service.getCreatorAnalytics(f.actor, { from: new Date(Date.now() - 60000).toISOString(), to: new Date(Date.now() + 60000).toISOString() })).totals.views).toBe(1);
        await pool.query("INSERT INTO account_category_settings(account_id,category,is_public,display_order) VALUES($1,'music',true,1)", [f.accountId]);
        const legacy = `protected-${randomUUID()}`, music = (await pool.query(`INSERT INTO users(username,password,email,guest_url,venue_name,strapi_user_document_id,strapi_account_document_id,lifecycle_operation_id,guest_capability_hash) VALUES($1,'not-a-login-secret',$2,$3,'Music',$4,$5,$5,$6) RETURNING id`, [`music-${randomUUID()}`, `${randomUUID()}@example.invalid`, `music-${randomUUID()}`, `provider-${randomUUID()}`, legacy, randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')])).rows[0].id;
        await pool.query('INSERT INTO account_music_identity(account_id,music_user_id) VALUES($1,$2)', [f.accountId, music]);
        await expect(service.recordAnalyticsEvent({ ...f.input, locationId: undefined, eventId: `music-${randomUUID()}`, event: { type: 'interaction', page: 'public-music', timestamp: '1970-01-01T00:00:00Z', canonicalPath: '/music/share', element: 'playlist-opened', metadata: { action: 'playlist_opened' } } }, { requestId: 'protected-music', music: { mode: 'friendly', legacyAccountId: legacy } })).resolves.toMatchObject({ status: 'accepted' });
        await expect(runtime.query('DELETE FROM analytics_events WHERE account_id=$1', [f.accountId])).rejects.toMatchObject({ code: '42501' });
        await expect(runtime.query('UPDATE analytics_event_receipts SET input_hash=$1 WHERE account_id=$2', [Buffer.alloc(32), f.accountId])).rejects.toMatchObject({ code: '42501' });
        await pool.query("UPDATE analytics_events SET occurred_at=now()-interval '367 days' WHERE account_id=$1", [f.accountId]);
        expect((await runtime.query('SELECT purge_expired_analytics_events(100) AS removed')).rows[0].removed).toBe(2);
        expect(await service.recordAnalyticsEvent(f.input, { requestId: 'protected-retired' })).toEqual({ status: 'duplicate', retired: true });
    }
    finally {
        await runtime.end();
        await pool.query(`DROP OWNED BY ${login}`);
        await pool.query(`DROP ROLE ${login}`);
    }
});
it('does not release an owner summary if account authority is revoked during COMMIT', async () => {
    const f = await fixture();
    await service.recordAnalyticsEvent(f.input, { requestId: 'commit-race' });
    let revoked = false;
    const race = { connect: async () => { const db = await pool.connect(); return { release: () => db.release(), query: async (sql: string, args?: unknown[]) => { const result = await db.query(sql, args); if (sql === 'COMMIT' && !revoked) {
                revoked = true;
                await pool.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1", [f.accountId]);
            } return result; } }; } } as unknown as pg.Pool;
    await expect(new AnalyticsService(race).getCreatorAnalytics(f.actor, { from: new Date(Date.now() - 60000).toISOString(), to: new Date(Date.now() + 60000).toISOString() })).rejects.toMatchObject({ status: 403 });
    expect(revoked).toBe(true);
});
it('terminal purge requires the matching running deletion and retires telemetry before content', async () => {
    const f = await fixture();
    await service.recordAnalyticsEvent(f.input, { requestId: 'terminal' });
    const receipt = (await pool.query("INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,response) VALUES($1,'delete',decode(repeat('02',32),'hex'),decode(repeat('02',32),'hex'),'{}') RETURNING id", [f.accountId])).rows[0].id;
    const feedback = (await pool.query("INSERT INTO deletion_feedback(account_id,reason) VALUES($1,'Delete') RETURNING id", [f.accountId])).rows[0].id;
    const operation = (await pool.query("INSERT INTO account_lifecycle_operations(account_id,kind,state,expected_revision,feedback_id,receipt_id) VALUES($1,'delete','running',1,$2,$3) RETURNING id", [f.accountId, feedback, receipt])).rows[0].id;
    await expect(pool.query('SELECT purge_explorers_account_content($1,$2)', [f.accountId, operation])).rejects.toMatchObject({ code: '42501' });
    await pool.query("UPDATE creator_accounts SET status='pending_deletion',deletion_requested_at=now() WHERE id=$1", [f.accountId]);
    await expect(pool.query('SELECT purge_explorers_account_content($1,$2)', [f.accountId, randomUUID()])).rejects.toMatchObject({ code: '42501' });
    expect((await pool.query('SELECT count(*) FROM analytics_events WHERE account_id=$1', [f.accountId])).rows[0].count).toBe('1');
    await pool.query('SELECT purge_explorers_account_content($1,$2)', [f.accountId, operation]);
    expect((await pool.query('SELECT count(*) FROM analytics_events WHERE account_id=$1', [f.accountId])).rows[0].count).toBe('0');
    expect((await pool.query('SELECT count(*) FROM collections WHERE account_id=$1', [f.accountId])).rows[0].count).toBe('0');
    expect((await pool.query('SELECT event_id,retired_at,input_hash FROM analytics_event_receipts WHERE account_id=$1', [f.accountId])).rows[0]).toMatchObject({ event_id: null, retired_at: expect.any(Date), input_hash: expect.any(Buffer) });
});

it('retention acquires at most the requested number of advisory locks even on a sequential backlog plan',async()=>{
 const f=await fixture();await pool.query("INSERT INTO analytics_events(account_id,client_event_id,event_type,page,category,collection_id,occurred_at,canonical_path,consent_version) SELECT $1,'backlog-event-'||n,'view','public-books','books',$2,now()-interval '367 days',$3,'explorers-analytics-v1' FROM generate_series(1,400) n",[f.accountId,f.collectionId,f.input.event.canonicalPath]);
 const db=await pool.connect();try{await db.query('BEGIN');await db.query('SET LOCAL enable_indexscan=off');await db.query('SET LOCAL enable_bitmapscan=off');await db.query('SET LOCAL enable_indexonlyscan=off');expect((await db.query('SELECT purge_expired_analytics_events(1) AS removed')).rows[0].removed).toBe(1);expect(Number((await db.query("SELECT count(*) AS locks FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND classid=44036")).rows[0].locks)).toBeLessThanOrEqual(1);}finally{await db.query('ROLLBACK');db.release();await pool.query('DELETE FROM analytics_events WHERE account_id=$1',[f.accountId]);}
});
it('a contended retention candidate consumes its bounded inspection budget instead of locking another account payload',async()=>{
 const owners=[await fixture(),await fixture()].sort((a,b)=>a.accountId.localeCompare(b.accountId));
 for(const f of owners)await service.recordAnalyticsEvent(f.input,{requestId:'contended-retention'});
 const extra={...owners[0].input,eventId:`contended-extra-${randomUUID()}`};await service.recordAnalyticsEvent(extra,{requestId:'contended-extra'});
 for(const f of owners)await pool.query("UPDATE analytics_events SET occurred_at=now()-interval '367 days' WHERE account_id=$1",[f.accountId]);
 const blocker=await pool.connect(),db=await pool.connect();try{
  await blocker.query('BEGIN');for(const key of [owners[0].input.eventId,extra.eventId])await blocker.query('SELECT pg_advisory_xact_lock(44036,hashtext($1))',[owners[0].accountId+':'+key]);
  await db.query('BEGIN');expect((await db.query('SELECT purge_expired_analytics_events(2) AS removed')).rows[0].removed).toBe(0);
  expect((await db.query('SELECT count(*) FROM analytics_events WHERE account_id=ANY($1::uuid[])',[owners.map(f=>f.accountId)])).rows[0].count).toBe('3');
 }finally{await db.query('ROLLBACK');db.release();await blocker.query('ROLLBACK');blocker.release();}
});