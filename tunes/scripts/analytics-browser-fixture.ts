import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import pg from 'pg';
import { createCanonicalApp } from '../server/auth/canonicalApp';
import { resolveExplorersAuthConfig } from '../server/auth/betterAuth';
import {provisionMusicRuntimeLogin} from '../server/db/music-runtime-role';
import {BookCatalog} from '../server/services/bookCatalog';
import {BookCoverFetcher} from '../server/services/bookCoverFetch';
import {LocalObjectStorage} from '../server/services/objectStorage';
import { ensureInitialAccount } from '../server/auth/initialAccount';
import { migrateMusicDatabase } from '../server/db/migrate';
import { MUSIC_UAT_DATABASE_ACK, startOwnedUatDatabase, stopOwnedUatDatabase,
  type OwnedUatDatabaseAuthority } from './music-uat-database';
import { prepareFixtureMusicTokenSecret, cleanupFixtureMusicTokenSecret } from './music-fixture-secret';
import { readSecureMusicSecretFile } from '../server/config/secure-music-secret-file';
import { stopProtectedChild } from './protected-browser-receipt';

import {fingerprint,assertUnchanged,validateDiscovery,validateExecution} from './analytics-browser-contract.mjs';
const root = resolve(import.meta.dirname, '../..');
const frontend = resolve(root, 'explorers-earth');
const initialSource=fingerprint(root);
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['--ack', MUSIC_UAT_DATABASE_ACK]))
  throw new Error('Browser E2E requires exact disposable PostgreSQL acknowledgement');
for (const key of ['DATABASE_URL', 'DATABASE_URL_TEST', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'GATE_PROD',
  'MUSIC_DEPLOY_PRODUCTION', 'MUSIC_DEPLOY_PROD']) {
  if (process.env[key]) throw new Error('Ambient database or Docker authority is forbidden');
}
if (process.env.NODE_ENV === 'production' || Object.keys(process.env).some((key) => key.startsWith('MUSIC_C10_STANDALONE_POSTGRES_')))
  throw new Error('Production or unrelated database authority is forbidden');
const runId = randomBytes(16).toString('hex');
const runtimeRole = `books_browser_${runId.slice(0,12)}`;
const database = `music_uat_${runId}`;
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const disposable = mkdtempSync(join(tmpdir(), 'explorers-books-e2e-'));
const passwordFile = prepareFixtureMusicTokenSecret(root);
let authority: OwnedUatDatabaseAuthority | undefined;
let db: pg.Pool | undefined;
let runtime:pg.Pool|undefined;
let apiServer: ReturnType<ReturnType<typeof createCanonicalApp>['app']['listen']> | undefined;
let vite: ChildProcess | undefined;
let browser: ChildProcess | undefined;
let interrupted = false;

async function freePort(min = 55000, max = 60999): Promise<number> {
  for (let i = 0; i < 150; i++) {
    const port = min + randomBytes(2).readUInt16BE(0) % (max - min + 1);
    const free = await new Promise<boolean>((done) => {
      const server = createServer();
      server.once('error', () => done(false));
      server.listen(port, '127.0.0.1', () => server.close(() => done(true)));
    });
    if (free) return port;
  }
  throw new Error('No local fixture port available');
}
async function waitFor(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* startup */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error('Local fixture server did not start');
}
function stopChild(child: ChildProcess | undefined): void {
  if (!child || child.exitCode !== null) return;
  child.kill();
}
async function dropOwnedDatabase(owned: OwnedUatDatabaseAuthority, password: string): Promise<void> {
  const url = new URL('postgresql://127.0.0.1/postgres');
  url.username = 'music_migrator'; url.password = password; url.port = String(owned.port);
  const admin = new pg.Pool({ connectionString: url.toString(), max: 1 });
  try {
    await admin.query(`DROP DATABASE ${owned.database}`);
    const proof = await admin.query("SELECT shobj_description(oid,'pg_authid') AS ownership FROM pg_roles WHERE rolname=$1", [runtimeRole]);
    if (proof.rows[0]?.ownership === `books-browser:${runId}`) await admin.query(`DROP ROLE ${runtimeRole}`);
    else if (proof.rows.length) throw new Error('Fixture runtime role ownership changed');
  }
  finally { await admin.end(); }
}
async function seedBooks(pool:pg.Pool,accountId:string,name:string){
  await pool.query("INSERT INTO account_category_pin_state(account_id,category) VALUES($1,'books') ON CONFLICT DO NOTHING",[accountId]);
  let pinned=0;
  for(let n=0;n<14;n++){
    const list=(await pool.query("INSERT INTO collections(account_id,category,title,slug,description,heading,visibility,publication_state,display_order) VALUES($1,'books',$2,$3,'Seed description','Seed heading','public','published',$4) RETURNING id",[accountId,`${name} seed list ${n}`,`seed-list-${n}`,n])).rows[0].id;
    for(let position=0;position<(n===0?30:1);position++){
      const entity=(await pool.query("INSERT INTO entities(kind,title,origin) VALUES('book',$1,'manual') RETURNING id",[`${name} seed book ${n}-${position}`])).rows[0].id;
      await pool.query("INSERT INTO book_entity_details(entity_id,authors,subjects,published_date_text,year_text,language_tag,isbn_10) VALUES($1,ARRAY['Seed author'],ARRAY[$2],'2020-03','2020','en','123456789X')",[entity,n===13?'Page Two Subject':position===29?'Later Subject':'Seed Science']);
      const recommendation=(await pool.query("INSERT INTO recommendations(account_id,category,entity_id,user_rating,note,publication_state) VALUES($1,'books',$2,8,$3::jsonb,'published') RETURNING id",[accountId,entity,JSON.stringify({version:1,format:'quill-html',html:'<p>Seed rich note 😀</p>'})])).rows[0].id;
      await pool.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'books',$4)",[list,recommendation,accountId,position]);
      if((n===0&&position<14||n===13)&&pinned<15){await pool.query("INSERT INTO category_recommendation_pins(account_id,category,recommendation_id,collection_id,position) VALUES($1,'books',$2,$3,$4)",[accountId,recommendation,list,pinned===1?0:pinned]);pinned++;}
    }
  }
}
async function main(): Promise<number> {
  const password = await readSecureMusicSecretFile(passwordFile, { mode: 'fixture' });
  const pgPort = await freePort(56000, 60999);
  const apiPort = await freePort(54000, 55999);
  const webPort = await freePort(52000, 53999);
  authority = await startOwnedUatDatabase({ runId, database, commit, port: pgPort, passwordFile });
  const dbUrl = new URL('postgresql://127.0.0.1');
  dbUrl.username = 'music_migrator'; dbUrl.password = password;
  dbUrl.port = String(pgPort); dbUrl.pathname = database;
  db = new pg.Pool({ connectionString: dbUrl.toString(), max: 4 });
  await migrateMusicDatabase(db);
  const origin = `http://127.0.0.1:${webPort}`;
  const config = resolveExplorersAuthConfig({ EXPLORERS_PUBLIC_ORIGIN: origin,
    EXPLORERS_AUTH_SECRET: randomBytes(32).toString('hex'),
    GOOGLE_CLIENT_ID: 'profile-fixture-google', GOOGLE_CLIENT_SECRET: 'profile-fixture-secret' });
  const runtimePassword=randomBytes(32).toString("base64url");
  await provisionMusicRuntimeLogin(db,{loginRole:runtimeRole,password:runtimePassword},{ownershipComment:`books-browser:${runId}`});
  const runtimeUrl=new URL(dbUrl);runtimeUrl.username=runtimeRole;runtimeUrl.password=runtimePassword;runtime=new pg.Pool({connectionString:runtimeUrl.toString(),max:6});
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==","base64");
  const volume=(id:string)=>({id,volumeInfo:{title:`Fixture ${id}`,authors:["Fixture author"],publishedDate:"2024-03",description:"Fixture bibliography",categories:["Fixture Science"],pageCount:123,averageRating:4,ratingsCount:5,language:"en",imageLinks:{thumbnail:`https://books.google.com/books/content?id=${id}&size=thumb`,large:`https://books.google.com/books/content?id=${id}&size=cover`}},saleInfo:{buyLink:"https://books.google.com/buy"}});
  const bookCatalog=new BookCatalog({apiKey:"deterministic-fixture-only",secret:config.secret,fetch:async(target:any)=>{
    if(!target.pathname.endsWith('/volumes'))return new Response(JSON.stringify(volume(target.pathname.split('/').at(-1))));
    const query=target.searchParams.get('q')??'',offset=Number(target.searchParams.get('startIndex')??0);
    if(query.startsWith('continuation')){if(offset)await new Promise(resolve=>setTimeout(resolve,1500));return new Response(JSON.stringify({totalItems:24,items:Array.from({length:12},(_,n)=>volume(`${offset?'obsolete':'continuation'}-${n}`))}));}
    return new Response(JSON.stringify({totalItems:3,items:['success','one-fallback','both-fallback'].map(volume)}));
  }});
  const bookCoverFetcher=new BookCoverFetcher({mode:"deterministic-fixture",resolve:async()=>[{address:"142.250.1.1",family:4}],connect:async(target)=>{const id=target.url.searchParams.get("id");if(id==="both-fallback"||id==="one-fallback"&&target.url.searchParams.get("size")==="thumb")throw new Error("Deterministic optional copy failure");return{status:200,mimeType:"image/png",body:(async function*(){yield png;})()};}});
  const composed = createCanonicalApp(runtime, config,{bookCatalog,bookCoverFetcher,mediaStorage:new LocalObjectStorage(join(disposable,"media"))});
  apiServer = await new Promise((done) => {
    const server = composed.app.listen(apiPort, '127.0.0.1', () => done(server));
  });
  const personas: Record<string, { userId: string; cookie: string; handle: string }> = {};
  for (const name of ['ownerA', 'ownerB']) {
    const userId = `books-e2e-${randomUUID()}`;
    await db.query('INSERT INTO auth_user(id,name,email) VALUES ($1,$2,$3)', [userId, name, `${userId}@example.invalid`]);
    await db.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())",
      [randomUUID(), `google-${userId}`, userId]);
    const context = await composed.auth.$context;
    const session = await context.internalAdapter.createSession(userId, false);
    const signature = createHmac('sha256', config.secret).update(session.token).digest('base64');
    const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${signature}`;
    const handle=`books${name.toLowerCase()}${runId.slice(0,4)}`;
    const selected=await ensureInitialAccount(db,userId);
    await db.query("UPDATE creator_accounts SET handle=$2,display_name=$3,account_type='Creator',public_profile=true,onboarding_status='complete' WHERE id=$1",[selected.accountId,handle,name]);
    await db.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='books'",[selected.accountId]);
    personas[name] = { userId, cookie, handle };
    await seedBooks(db,selected.accountId,name);
  }
  const observerToken=randomBytes(32).toString('hex');
  composed.app.get('/api/__analytics-observer',async(request,response)=>{
    response.set('Cache-Control','no-store');
    if(request.headers.authorization!==`Bearer ${observerToken}`)return response.sendStatus(404);
    try{const events=(await db!.query('SELECT id,account_id,client_event_id,event_type,page,category,collection_id,recommendation_id,canonical_path FROM analytics_events ORDER BY received_at,id')).rows;const receipts=(await db!.query('SELECT account_id,client_event_id,event_id FROM analytics_event_receipts')).rows;response.json({events,receipts});}catch{response.sendStatus(500);}
  });
  const fixturePath = join(disposable, 'sessions.json');
  writeFileSync(fixturePath, JSON.stringify({ origin, personas,observerToken }), { mode: 0o600 });
  vite = spawn(process.execPath, [resolve(frontend, 'node_modules/vite/bin/vite.js'),
    '--config', 'e2e/replatform/books.vite.config.ts'], {
    cwd: frontend, windowsHide: true, stdio: 'inherit', env: { ...process.env,
      BOOKS_E2E_LOCAL_AUTHORITY: 'owned-disposable-pg15', BOOKS_E2E_WEB_PORT: String(webPort),
      BOOKS_E2E_API_PORT: String(apiPort) },
  });
  await waitFor(origin);
  let browserArgs = ['--config=e2e/replatform/analytics.playwright.config.ts', '--retries=0','--workers=1','--forbid-only',`--output=${join(disposable,'artifacts')}`];
  const browserEnv = { ...process.env, BOOKS_E2E_FIXTURE_PATH: fixturePath, PLAYWRIGHT_EXTERNAL_BASE_URL: origin };
  const discovery=spawnSync(process.execPath,[resolve(frontend,'node_modules/@playwright/test/cli.js'),'test',...browserArgs,'--list','--reporter=json'],{cwd:frontend,windowsHide:true,env:browserEnv,encoding:'utf8'});
  if(discovery.status!==0)throw new Error('Analytics discovery failed');
  validateDiscovery(JSON.parse(discovery.stdout));
  const executionReport=join(disposable,'execution.json');
  browser = spawn(process.execPath, [resolve(frontend, 'node_modules/@playwright/test/cli.js'),
    'test', ...browserArgs, '--reporter=json,line'], {
    cwd: frontend, windowsHide: true, stdio: 'inherit', env: { ...process.env,
      BOOKS_E2E_FIXTURE_PATH: fixturePath,
      PLAYWRIGHT_JSON_OUTPUT_NAME:executionReport, PLAYWRIGHT_EXTERNAL_BASE_URL: origin },
  });
  const exitCode = await new Promise<number>((done) => browser!.once('exit', (code) => done(code ?? 1)));
  validateExecution(JSON.parse(readFileSync(executionReport,'utf8')),exitCode);
  assertUnchanged(initialSource,fingerprint(root));
  process.stdout.write(`Analytics source attestation: ${Object.keys(initialSource).length} files unchanged; ten cases passed.\n`);
  return exitCode;
}
const signal = () => { interrupted = true; stopChild(browser); stopChild(vite); };
process.once('SIGINT', signal);
process.once('SIGTERM', signal);
try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`Analytics E2E fixture failed: ${error instanceof Error ? error.message.replaceAll(disposable, '<fixture>') : 'unknown'}\n`);
  process.exitCode = 1;
} finally {
  const failures: string[] = [];
  const cleanup = async (label: string, action: () => unknown) => { try { await action(); } catch { failures.push(label); } };
  await cleanup('browser child', () => stopProtectedChild(browser));
  await cleanup('Vite child', () => stopProtectedChild(vite));
  await cleanup('API server', () => new Promise<void>((done, reject) => apiServer?.close(error => error ? reject(error) : done()) ?? done()));
  await cleanup('runtime pool', () => runtime?.end());
  await cleanup('seed pool', () => db?.end());
  await cleanup('attested owned database/container/runtime role', async () => {
    if (authority) { const password = await readSecureMusicSecretFile(passwordFile, { mode: 'fixture' });
      await stopOwnedUatDatabase(authority, { dropDatabase: (owned) => dropOwnedDatabase(owned, password) }); }
  });
  await cleanup('fixture secret', () => cleanupFixtureMusicTokenSecret(root, passwordFile));
  await cleanup('private fixture directory', () => {
    const relativeTemp = relative(resolve(tmpdir()), resolve(disposable));
    if (!relativeTemp || relativeTemp.startsWith('..') || isAbsolute(relativeTemp) || !relativeTemp.startsWith('explorers-books-e2e-')) throw new Error('Fixture cleanup escaped its owned temporary directory');
    rmSync(resolve(disposable), { recursive: true, force: true });
  });
  if (failures.length) { process.exitCode = 1; process.stderr.write(`Owned Analytics cleanup/qualification failed: ${failures.join(', ')}\n`); }
  if (interrupted) process.exitCode = 130;
  if (process.connected) process.disconnect();
}
