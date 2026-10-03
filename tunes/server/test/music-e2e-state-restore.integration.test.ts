import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateMusicDatabase } from "../db/migrate";
import { EXPECTED_MUSIC_MIGRATION_CHAIN } from "../../shared/music-migration-contract";
import {
  attestUatDatabaseAuthority,
  MUSIC_UAT_DATABASE_ACK,
  parseUatDatabaseAuthority,
} from "../../scripts/music-uat-database";
import {
  MUSIC_FIXTURE_DATA_DUMP_MAX_BYTES,
  runMusicFixtureRestoreTransaction,
} from "../../scripts/music-e2e-state-restore.mjs";
import { corruptC11LaterCopyRow } from "./music-e2e-state-restore-test-helper";

const enabled = process.env.MUSIC_C11_STATE_RESTORE_POSTGRES_TEST === "1"
  && process.env.MUSIC_UAT_DATABASE_ACK === MUSIC_UAT_DATABASE_ACK;
const describePg = enabled ? describe.sequential : describe.skip;
const dockerExecutable = process.platform === "win32" ? "docker.exe" : "docker";
const fixtureDatabase = "music_fixture";
let admin: pg.Pool | undefined;
let fixture: pg.Pool | undefined;
let containerId = "";
let revisionAccount='';

function databaseUrl(name: string) {
  const target = new URL(process.env.DATABASE_URL_TEST ?? "");
  target.pathname = `/${name}`;
  return target.toString();
}

function docker(args: string[], input?: Buffer) {
  const result = spawnSync(dockerExecutable, args, {
    input, windowsHide: true, maxBuffer: MUSIC_FIXTURE_DATA_DUMP_MAX_BYTES,
  });
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) throw new Error("owned restore integration child failed");
  return result.stdout;
}

function dump(dataOnly = false) {
  return docker([
    "exec", "-i", containerId, "pg_dump", "-U", "music_migrator", "-d", fixtureDatabase,
    "--format=plain", ...(dataOnly ? ["--data-only"] : ["--clean", "--if-exists", "--no-owner"]),
  ]);
}

function hash() {
  const normalized = dump().toString("utf8").split(/\r?\n/)
    .filter((line) => !line.startsWith("--") && !line.startsWith("\\restrict") && !line.startsWith("\\unrestrict"))
    .join("\n");
  return createHash("sha256").update(normalized).digest("hex");
}
function replay(operation:{file:string;args:string[];input:Buffer}) {
  const result=spawnSync(operation.file,operation.args,{input:operation.input,windowsHide:true,maxBuffer:4*1024*1024});
  if(result.status!==0) console.error(result.stderr?.toString('utf8'));
  return result;
}

describePg("owned PostgreSQL transactional Music E2E restore", () => {
  beforeAll(async () => {
    const authority = parseUatDatabaseAuthority(process.env);
    if (!authority) throw new Error("owned restore integration authority is missing");
    attestUatDatabaseAuthority(process.env, authority.commit);
    containerId = authority.containerId;
    admin = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST, max: 1 });
    await admin.query("CREATE DATABASE music_fixture");
    fixture = new pg.Pool({ connectionString: databaseUrl(fixtureDatabase), max: 1 });
    await migrateMusicDatabase(fixture);
    await fixture.query(`INSERT INTO users(
      username,password,email,guest_url,venue_name,strapi_user_document_id,strapi_account_document_id,
      lifecycle_operation_id,guest_capability_hash
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
      "e2e-public-music-restore-owner", "not-a-login-secret", "restore@example.invalid",
      "e2e-public-music-restore", "Callback fixture", "e2e-public-music-restore-user",
      "e2e-public-music-restore-account", "restore-provision", "a".repeat(64),
    ]);
    await fixture.query("INSERT INTO playlists(user_id,name,is_visible_to_guests) SELECT id,$1,true FROM users WHERE username=$2", [
      "Restore qualification", "e2e-public-music-restore-owner",
    ]);
    revisionAccount=(await fixture.query('INSERT INTO creator_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const entity=(await fixture.query("INSERT INTO entities(kind,title,origin) VALUES('book','Restore catalog','manual') RETURNING id")).rows[0].id;
    const list=(await fixture.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'books','Restore list',$2,0) RETURNING id",[revisionAccount,randomUUID()])).rows[0].id;
    await fixture.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'guides','Restore guide',$2,0)",[revisionAccount,randomUUID()]);
    const item=(await fixture.query("INSERT INTO recommendations(account_id,category,entity_id) VALUES($1,'books',$2) RETURNING id",[revisionAccount,entity])).rows[0].id;
    const other=(await fixture.query("INSERT INTO recommendations(account_id,category,entity_id) VALUES($1,'books',$2) RETURNING id",[revisionAccount,entity])).rows[0].id;
    await fixture.query("INSERT INTO book_entity_details(entity_id,authors,isbn_10,published_date_text) VALUES($1,ARRAY['Restored author'],'123456789X','2024-03')",[entity]);
    await fixture.query('INSERT INTO book_recommendation_context(recommendation_id,account_id,buy_links) VALUES($1,$2,$3)',[item,revisionAccount,JSON.stringify([{name:'Restored shop',url:'https://shop.example/book'}])]);
    await fixture.query('INSERT INTO recommendation_display_overrides(recommendation_id,account_id,display_values) VALUES($1,$3,$4),($2,$3,$5)',[item,other,revisionAccount,{title:null},{}]);
    await fixture.query('UPDATE recommendations SET note=$2::jsonb WHERE id=$1',[item,JSON.stringify({version:1,format:'quill-html',html:'<p>😀 Restored author note</p>'})]);
    await fixture.query("INSERT INTO collection_items VALUES($1,$2,$3,'books',0,now())",[list,item,revisionAccount]);
    await fixture.query("INSERT INTO account_category_pin_state VALUES($1,'books',7)",[revisionAccount]);
    await fixture.query("INSERT INTO category_recommendation_pins VALUES($1,'books',$2,$3,0)",[revisionAccount,item,list]);
    for(const purpose of ['collection','recommendation']) {
      const media=(await fixture.query(`INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,ready_at,content_sha256)
        VALUES($1,$2,'ready','image/png',1,now(),decode(repeat('00',32),'hex')) RETURNING id`,[revisionAccount,purpose])).rows[0].id;
      await fixture.query(purpose==='collection'?"INSERT INTO collection_media VALUES($1,$2,'cover',$3,now())":"INSERT INTO recommendation_media VALUES($1,$2,$3,0,now())",[purpose==='collection'?list:item,revisionAccount,media]);
    }
    const cover=(await fixture.query("SELECT media_id FROM recommendation_media WHERE recommendation_id=$1",[item])).rows[0].media_id;
    await fixture.query("INSERT INTO recommendation_book_covers(recommendation_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3),($1,$2,'thumbnail',$3)",[item,revisionAccount,cover]);
    const analytics=(await fixture.query("INSERT INTO analytics_events(account_id,client_event_id,event_type,page,category,collection_id,recommendation_id,occurred_at,canonical_path,consent_version) VALUES($1,'restore-analytics','view','public-books','books',$2,$3,now(),'/restore/books','explorers-analytics-v1') RETURNING id",[revisionAccount,list,item])).rows[0].id;
    await fixture.query("INSERT INTO analytics_event_receipts(account_id,client_event_id,input_hash,event_id) VALUES($1,'restore-analytics',decode(repeat('00',32),'hex'),$2)",[revisionAccount,analytics]);
    await fixture.query("INSERT INTO analytics_event_receipts(account_id,client_event_id,input_hash,retired_at) VALUES($1,'restore-retired',decode(repeat('01',32),'hex'),now())",[revisionAccount]);
    const movie=(await fixture.query("INSERT INTO entities(kind,title,origin) VALUES('movie','Restored TV facts','manual') RETURNING id")).rows[0].id;
    await fixture.query("INSERT INTO movie_entity_details(entity_id,media_type,runtime_minutes,season_count) VALUES($1,'tv',0,0)",[movie]);
    const movieRec=(await fixture.query("INSERT INTO recommendations(account_id,category,entity_id) VALUES($1,'movies',$2) RETURNING id",[revisionAccount,movie])).rows[0].id;
    await fixture.query("INSERT INTO movie_recommendation_context(recommendation_id,account_id,selected_provider_ids) VALUES($1,$2,'{}')",[movieRec,revisionAccount]);
    const genre=(await fixture.query("SELECT id FROM taxonomy_terms WHERE category='movies' AND slug='animation'")).rows[0].id;
    await fixture.query("INSERT INTO recommendation_taxonomy(recommendation_id,account_id,category,term_id,position) VALUES($1,$2,'movies',$3,0)",[movieRec,revisionAccount,genre]);
    await fixture.query("UPDATE account_category_content_state SET revision=revision+123 WHERE account_id=$1",[revisionAccount]);
  });

  afterAll(async () => {
    try { if (fixture) await fixture.end(); }
    finally {
      if (admin) {
        try {
          await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [fixtureDatabase]);
          await admin.query("DROP DATABASE music_fixture");
        } finally { await admin.end(); }
      }
    }
  });

  it("restores a populated callback identity to its exact snapshot hash", async () => {
    const baselineData = dump(true);
    const baselineHash = hash();
    await fixture!.query("UPDATE users SET venue_name=$1 WHERE username=$2", [
      "Mutated callback fixture", "e2e-public-music-restore-owner",
    ]);
    expect(hash()).not.toBe(baselineHash);
    const restored = runMusicFixtureRestoreTransaction({
      containerId, dataDump: baselineData, snapshotHash: baselineHash, captureHash: hash,
      execute: replay,
    });
    expect(restored).toEqual({ ok: true, beforeHash: baselineHash, afterHash: baselineHash });
    expect(hash()).toBe(baselineHash);
  });

  it('preserves nonempty category counters exactly and advances after replay',async()=>{
    const analytics=(await fixture!.query('SELECT * FROM analytics_events ORDER BY id')).rows,receipts=(await fixture!.query('SELECT * FROM analytics_event_receipts ORDER BY client_event_id')).rows;expect(analytics).toHaveLength(1);expect(receipts).toHaveLength(2);
    expect((await fixture!.query('SELECT media_type,runtime_minutes,season_count FROM movie_entity_details')).rows).toEqual([{media_type:'tv',runtime_minutes:0,season_count:0}]);
    expect((await fixture!.query('SELECT selected_provider_ids FROM movie_recommendation_context')).rows).toEqual([{selected_provider_ids:[]}]);
    expect((await fixture!.query('SELECT position FROM recommendation_taxonomy')).rows).toEqual([{position:0}]);
    const bookFacts=(await fixture!.query('SELECT * FROM book_entity_details')).rows;
    const bookCovers=(await fixture!.query('SELECT * FROM recommendation_book_covers ORDER BY recommendation_id,slot')).rows;expect(bookCovers).toHaveLength(2);
    const bookContexts=(await fixture!.query('SELECT * FROM book_recommendation_context')).rows;
    const overrides=(await fixture!.query('SELECT recommendation_id,display_values FROM recommendation_display_overrides WHERE account_id=$1 ORDER BY recommendation_id',[revisionAccount])).rows;
    expect(overrides.map(row=>row.display_values)).toEqual(expect.arrayContaining([{title:null},{}]));
    const notes=(await fixture!.query('SELECT id,note FROM recommendations WHERE account_id=$1 ORDER BY id',[revisionAccount])).rows;
    const before=(await fixture!.query('SELECT category,revision::text FROM account_category_content_state WHERE account_id=$1 ORDER BY category',[revisionAccount])).rows;
    expect(before).toHaveLength(3);expect(BigInt(before[0].revision)).toBeGreaterThan(100n);
    const data=dump(true),snapshot=hash();
    expect((await fixture!.query('SELECT * FROM recommendation_book_covers ORDER BY recommendation_id,slot')).rows).toEqual(bookCovers);
    await fixture!.query("UPDATE collections SET heading='Before restore',revision=revision+1 WHERE account_id=$1",[revisionAccount]);
    const result=runMusicFixtureRestoreTransaction({containerId,dataDump:data,snapshotHash:snapshot,captureHash:hash,
      execute:replay});
    expect(result).toEqual({ok:true,beforeHash:snapshot,afterHash:snapshot});
    expect((await fixture!.query('SELECT category,revision::text FROM account_category_content_state WHERE account_id=$1 ORDER BY category',[revisionAccount])).rows).toEqual(before);
    expect((await fixture!.query('SELECT id,note FROM recommendations WHERE account_id=$1 ORDER BY id',[revisionAccount])).rows).toEqual(notes);
    expect((await fixture!.query('SELECT recommendation_id,display_values FROM recommendation_display_overrides WHERE account_id=$1 ORDER BY recommendation_id',[revisionAccount])).rows).toEqual(overrides);
    expect((await fixture!.query('SELECT * FROM analytics_events ORDER BY id')).rows).toEqual(analytics);expect((await fixture!.query('SELECT * FROM analytics_event_receipts ORDER BY client_event_id')).rows).toEqual(receipts);
    expect((await fixture!.query('SELECT * FROM book_entity_details')).rows).toEqual(bookFacts);
    expect((await fixture!.query('SELECT * FROM book_recommendation_context')).rows).toEqual(bookContexts);
    expect((await fixture!.query('SELECT * FROM recommendation_book_covers ORDER BY recommendation_id,slot')).rows).toEqual(bookCovers);
    await fixture!.query("UPDATE collections SET heading='After restore' WHERE account_id=$1 AND category='books'",[revisionAccount]);
    const next=(await fixture!.query("SELECT revision::text FROM account_category_content_state WHERE account_id=$1 AND category='books'",[revisionAccount])).rows[0].revision;
    expect(BigInt(next)).toBeGreaterThan(BigInt(before.find(row=>row.category==='books')!.revision));
  });

  it("rolls an injected mid-replay failure back to the pre-attempt mutated hash", async () => {
    const baselineData = dump(true);
    await fixture!.query("UPDATE users SET venue_name=$1 WHERE username=$2", [
      "Pre-attempt mutation", "e2e-public-music-restore-owner",
    ]);
    const preAttemptHash = hash();
    const hostileReplay = corruptC11LaterCopyRow(baselineData, {
      maximumBytes: MUSIC_FIXTURE_DATA_DUMP_MAX_BYTES,
    });
    expect(hostileReplay.earlierRows).toBe(EXPECTED_MUSIC_MIGRATION_CHAIN.length);
    expect(hostileReplay.targetRows).toBe(1);
    expect(hostileReplay.corruptedRow).toBe(1);
    const result = runMusicFixtureRestoreTransaction({
      containerId, dataDump: hostileReplay.dataDump, snapshotHash: "b".repeat(64), captureHash: hash,
      execute: (operation) => spawnSync(operation.file, operation.args, {
        input: operation.input, windowsHide: true, maxBuffer: 4 * 1024 * 1024,
      }),
    });
    expect(result).toEqual({ ok: false, stage: "database-restore", code: "replay-failed-rolled-back" });
    expect(hash()).toBe(preAttemptHash);
  });
});
