import { createHmac, createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import pg from 'pg';
import { createCanonicalApp } from '../server/auth/canonicalApp';
import { resolveExplorersAuthConfig } from '../server/auth/betterAuth';
import {provisionMusicRuntimeLogin} from '../server/db/music-runtime-role';
import {MovieCatalog} from '../server/services/movieCatalog';
import {MovieImageFetcher} from '../server/services/movieImageFetch';
import {authorizeOperation} from '../server/application/authorization';
import {LocalObjectStorage} from '../server/services/objectStorage';
import { ensureInitialAccount } from '../server/auth/initialAccount';
import { migrateMusicDatabase } from '../server/db/migrate';
import { MUSIC_UAT_DATABASE_ACK, startOwnedUatDatabase, stopOwnedUatDatabase,
  type OwnedUatDatabaseAuthority } from './music-uat-database';
import { prepareFixtureMusicTokenSecret, cleanupFixtureMusicTokenSecret } from './music-fixture-secret';
import { readSecureMusicSecretFile } from '../server/config/secure-music-secret-file';
import { extractProtectedReceiptArguments, createProtectedReceipt, stopProtectedChild } from './protected-browser-receipt';

const root = resolve(import.meta.dirname, '../..');
const frontend = resolve(root, 'explorers-earth');
const rawArguments=process.argv.slice(2);
const diagnostic=rawArguments.length===3&&rawArguments[2]==='--diagnose-owner';
if(diagnostic)rawArguments.pop();
const focusIndex=rawArguments.indexOf('--focus');
const focus=focusIndex<0?undefined:rawArguments[focusIndex+1];
if(focusIndex>=0&&(focusIndex!==2||rawArguments.length!==4||!['pagination','search','manual','copies','owner-order'].includes(focus??'')))throw Error('Invalid local Movies focus selector');
const receiptArguments = extractProtectedReceiptArguments(focusIndex<0?rawArguments:rawArguments.slice(0,2));
if (JSON.stringify(receiptArguments.args) !== JSON.stringify(['--ack', MUSIC_UAT_DATABASE_ACK]))
  throw new Error('Browser E2E requires exact disposable PostgreSQL acknowledgement');
for (const key of ['DATABASE_URL', 'DATABASE_URL_TEST', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'GATE_PROD',
  'MUSIC_DEPLOY_PRODUCTION', 'MUSIC_DEPLOY_PROD']) {
  if (process.env[key]) throw new Error('Ambient database or Docker authority is forbidden');
}
if (process.env.NODE_ENV === 'production' || Object.keys(process.env).some((key) => key.startsWith('MUSIC_C10_STANDALONE_POSTGRES_')))
  throw new Error('Production or unrelated database authority is forbidden');
const protectedReceipt = await createProtectedReceipt(root, 'movies', receiptArguments);
if((focus||diagnostic)&&protectedReceipt)throw Error('Protected qualification cannot use a local focus selector');
const runId = randomBytes(16).toString('hex');
const runtimeRole = `movies_browser_${runId.slice(0,12)}`;
const database = `music_uat_${runId}`;
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const disposable = mkdtempSync(join(tmpdir(), 'explorers-movies-e2e-'));
const passwordFile = prepareFixtureMusicTokenSecret(root);
let authority: OwnedUatDatabaseAuthority | undefined;
let db: pg.Pool | undefined;
let runtime:pg.Pool|undefined;
let apiServer: ReturnType<ReturnType<typeof createCanonicalApp>['app']['listen']> | undefined;
let vite: ChildProcess | undefined;
let frontendBuild:ChildProcess|undefined;
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
    if (proof.rows[0]?.ownership === `movies-browser:${runId}`) await admin.query(`DROP ROLE ${runtimeRole}`);
    else if (proof.rows.length) throw new Error('Fixture runtime role ownership changed');
  }
  finally { await admin.end(); }
}
async function seedMovies(pool:pg.Pool,accountId:string,name:string){
 await pool.query("INSERT INTO account_category_pin_state(account_id,category) VALUES($1,'movies') ON CONFLICT DO NOTHING",[accountId]);let pinned=0;
 const action=(await pool.query("SELECT id FROM taxonomy_terms WHERE category='movies' AND slug='action' AND active")).rows[0].id;
 const drama=(await pool.query("SELECT id FROM taxonomy_terms WHERE category='movies' AND slug='drama' AND active")).rows[0].id;
 for(let n=0;n<14;n++){
  const list=(await pool.query("INSERT INTO collections(account_id,category,title,slug,description,heading,visibility,publication_state,display_order) VALUES($1,'movies',$2,$3,'Seed description','Seed heading','public','published',$4) RETURNING id",[accountId,`${name} seed list ${n}`,`seed-list-${n}`,n])).rows[0].id;
  for(let position=0;position<(n===0?30:1);position++){
   const entity=(await pool.query("INSERT INTO entities(kind,title,origin) VALUES('movie',$1,'manual') RETURNING id",[`${name} seed movie ${n}-${position}`])).rows[0].id;
   await pool.query("INSERT INTO movie_entity_details(entity_id,media_type,runtime_minutes,season_count,year_text) VALUES($1,$2,0,$3,'2020')",[entity,position%2?'tv':'movie',position%2?0:null]);
   const recommendation=(await pool.query("INSERT INTO recommendations(account_id,category,entity_id,user_rating,note,publication_state) VALUES($1,'movies',$2,8,$3::jsonb,'published') RETURNING id",[accountId,entity,JSON.stringify({version:1,format:'quill-html',html:'<p>Seed rich note 😀</p>'})])).rows[0].id;
   await pool.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'movies',$4)",[list,recommendation,accountId,position]);
   await pool.query("INSERT INTO recommendation_taxonomy(recommendation_id,account_id,category,term_id,position) VALUES($1,$2,'movies',$3,0)",[recommendation,accountId,n===13?drama:action]);
   if((n===0&&position<14||n===13)&&pinned<15){await pool.query("INSERT INTO category_recommendation_pins(account_id,category,recommendation_id,collection_id,position) VALUES($1,'movies',$2,$3,$4)",[accountId,recommendation,list,pinned]);pinned++;}
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
  await provisionMusicRuntimeLogin(db,{loginRole:runtimeRole,password:runtimePassword},{ownershipComment:`movies-browser:${runId}`});
  const runtimeUrl=new URL(dbUrl);runtimeUrl.username=runtimeRole;runtimeUrl.password=runtimePassword;runtime=new pg.Pool({connectionString:runtimeUrl.toString(),max:6});
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==","base64");
  const candidate=(id:number,kind:'movie'|'tv')=>({id,...(kind==='movie'?{title:`Fixture Movie ${id}`,release_date:'2024-03-01'}:{name:`Fixture Show ${id}`,first_air_date:'2024-03-01'}),poster_path:`/${id}-poster.jpg`});
  const movieCatalog=new MovieCatalog({accessToken:'deterministic-fixture-only',authorize:a=>authorizeOperation(runtime!,a,'entities:resolve',a.accountId),fetch:async(target:any)=>{
   const kind: 'movie'|'tv'=target.pathname.includes('/tv')?'tv':'movie';
   if(target.pathname.includes('/search/')){const page=Number(target.searchParams.get('page'));if(target.searchParams.get('query')==='continuation'&&page>1)await new Promise(r=>setTimeout(r,1500));return new Response(JSON.stringify({page,total_pages:target.searchParams.get('query')==='continuation'?2:1,total_results:target.searchParams.get('query')==='continuation'?24:3,results:target.searchParams.get('query')==='continuation'?Array.from({length:12},(_,i)=>candidate(100+page*12+i,kind)):[42,43,44].map(id=>candidate(id,kind))}));}
   const id=Number(target.pathname.split('/')[3]);
   if(target.pathname.endsWith('/watch/providers'))return new Response(JSON.stringify({id,results:{US:{link:`https://www.themoviedb.org/${kind}/${id}/watch`,flatrate:[{provider_id:1,provider_name:'Fixture Watch',logo_path:null,display_priority:0}]}}}));
   return new Response(JSON.stringify({...candidate(id,kind),original_title:'Original movie',original_name:'Original show',backdrop_path:`/${id}-backdrop.jpg`,genres:[{id:kind==='movie'?28:10759,name:kind==='movie'?'Action':'Action & Adventure'}],runtime:123,episode_run_time:[45],vote_average:8,overview:'Fixture source details',number_of_seasons:kind==='tv'?0:undefined,credits:{crew:[{job:'Director',name:'Fixture director'}],cast:Array.from({length:11},(_,i)=>({id:i+1,credit_id:'credit-'+i,original_name:'Actor '+i,character:'Role '+i,profile_path:i===0?null:`/${id}-cast-${i}.jpg`,order:i}))}}));
  }});
  const movieImageFetcher=new MovieImageFetcher({mode:'deterministic-fixture',resolve:async()=>[{address:'142.250.1.1',family:4}],connect:async target=>{if(target.url.pathname.includes('/44-')||target.url.pathname.includes('/43-cast-'))throw Error('Deterministic optional copy failure');return {status:200,mimeType:'image/png',length:png.length,body:(async function*(){yield png;})()};}});
  const composed=createCanonicalApp(runtime,config,{movieCatalog,movieImageFetcher,mediaStorage:new LocalObjectStorage(join(disposable,'media'))});
  apiServer = await new Promise((done) => {
    const server = composed.app.listen(apiPort, '127.0.0.1', () => done(server));
  });
  const personas: Record<string, { userId: string; cookie: string; handle: string }> = {};
  for (const name of ['ownerA', 'ownerB']) {
    const userId = `movies-e2e-${randomUUID()}`;
    await db.query('INSERT INTO auth_user(id,name,email) VALUES ($1,$2,$3)', [userId, name, `${userId}@example.invalid`]);
    await db.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())",
      [randomUUID(), `google-${userId}`, userId]);
    const context = await composed.auth.$context;
    const session = await context.internalAdapter.createSession(userId, false);
    const signature = createHmac('sha256', config.secret).update(session.token).digest('base64');
    const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${signature}`;
    const handle=`movies${name.toLowerCase()}${runId.slice(0,4)}`;
    const selected=await ensureInitialAccount(db,userId);
    await db.query("UPDATE creator_accounts SET handle=$2,display_name=$3,account_type='Creator',public_profile=true,onboarding_status='complete' WHERE id=$1",[selected.accountId,handle,name]);
    await db.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='movies'",[selected.accountId]);
    personas[name] = { userId, cookie, handle };
    await seedMovies(db,selected.accountId,name);
  }
  const fixturePath = join(disposable, 'sessions.json');
  writeFileSync(fixturePath, JSON.stringify({ origin, personas }), { mode: 0o600 });
  let diagnosticPath:string|undefined;
  let diagnosticBinding:unknown;
  const diagnosticRecords:unknown[]=[];
  if(diagnostic){
    const canonicalPath=resolve(frontend,'src/features/Movies/api/moviesClient.ts'),canonical=readFileSync(canonicalPath,'utf8');
    let overlay=canonical.replace('  const initial=useAuthStore',"  let diagnosticPhase='initial',diagnosticAttempt=0;let expected:string|undefined,actual:string|undefined;try {\n  const initial=useAuthStore");
    overlay=overlay.replace('      const observed=await',"      diagnosticPhase='detail';diagnosticAttempt++;expected=String(item.revision);actual=undefined;\n      const observed=await").replace('      assertCurrent();if(observed.detail.revision',"      actual=String(observed.detail.revision);\n      assertCurrent();if(observed.detail.revision").replace('  const final=await',"  diagnosticPhase='final';\n  const final=await");
    overlay=overlay.replace('  return {observation:final,lists,details};',"  return {observation:final,lists,details};\n  }catch(error){const e=error as {code?:unknown;status?:unknown};const allow=['CONFLICT','INVALID_RESPONSE','READ_LIMIT','UNAUTHENTICATED','FORBIDDEN','NOT_FOUND','ABORTED'];const records=((globalThis as any).__moviesOwnerDiagnosis??=[]);if(records.length<16)records.push({phase:diagnosticPhase,attempt:Math.min(1000,diagnosticAttempt),code:allow.includes(String(e?.code))?String(e.code):'UNCLASSIFIED',status:Number.isInteger(e?.status)&&Number(e.status)>=100&&Number(e.status)<=599?e.status:0,expected:expected&&/^\\d{1,20}$/.test(expected)?expected:undefined,actual:actual&&/^\\d{1,20}$/.test(actual)?actual:undefined,aborted:Boolean(signal?.aborted),abortReason:signal?.aborted?'signal':'none',parseLocation:diagnosticPhase==='detail'?'editable-response':'category-response'});throw error;}");
    diagnosticPath=join(disposable,'owner-diagnostic-overlay.ts');writeFileSync(diagnosticPath,overlay,{mode:0o600});
    diagnosticBinding={acceptance:false,canonical: createHash('sha256').update(canonical).digest('hex'),overlay:createHash('sha256').update(overlay).digest('hex'),paths:['explorers-earth/src/features/Movies/api/moviesClient.ts'],ui:JSON.parse(readFileSync(resolve(root,'.superpowers/movies-ui-component-source-hashes.json'),'utf8'))};
  }
  const frontendEnv={...process.env,MOVIES_E2E_DIAGNOSTIC_OVERLAY:diagnosticPath??'',MOVIES_E2E_LOCAL_AUTHORITY:'owned-disposable-pg15',MOVIES_E2E_WEB_PORT:String(webPort),MOVIES_E2E_API_PORT:String(apiPort)};
  // Compiled local preview avoids thousands of dev-module HTTP requests; it
  // still proxies actual runtime APIs and reads no ambient frontend env files.
  const buildStarted=Date.now();
  frontendBuild=spawn(process.execPath,[resolve(frontend,'node_modules/vite/bin/vite.js'),'build','--logLevel','error','--config','e2e/replatform/movies.vite.config.ts','--outDir',join(disposable,'frontend-build')],{cwd:frontend,windowsHide:true,stdio:'inherit',env:frontendEnv});
  const built=await new Promise<number>(done=>frontendBuild!.once('exit',code=>done(code??1)));process.stdout.write(`Owned Movies frontend build exit=${built} elapsedMs=${Date.now()-buildStarted}\n`);if(built!==0)throw Error('Owned Movies frontend build failed');
  const assetRoot=join(disposable,'frontend-build','assets');let inspectedBytes=0,diagnosticTransformPresent=false;for(const name of readdirSync(assetRoot)){if(!name.endsWith('.js'))continue;const path=join(assetRoot,name),size=statSync(path).size;inspectedBytes+=size;if(size>16*1024*1024||inspectedBytes>64*1024*1024)throw Error('Movie build diagnostic scan limit');if(readFileSync(path).includes(Buffer.from('__moviesOwnerDiagnosis')))diagnosticTransformPresent=true;}if(diagnosticTransformPresent!==diagnostic)throw Error('Movie diagnostic transform state mismatch');process.stdout.write(`Owned Movies diagnostic mode=${diagnostic} transform=${diagnosticTransformPresent} canonicalUninstrumented=${!diagnostic}\n`);
  vite = spawn(process.execPath,[resolve(frontend,'node_modules/vite/bin/vite.js'),'preview','--logLevel','error','--config','e2e/replatform/movies.vite.config.ts','--outDir',join(disposable,'frontend-build')],{cwd:frontend,windowsHide:true,stdio:'inherit',env:frontendEnv});
  await waitFor(origin);
  let browserArgs = ['--config=e2e/replatform/movies.playwright.config.ts', '--retries=0'];
  const browserEnv = { ...process.env,MOVIES_E2E_OWNER_DIAGNOSTIC:diagnostic?'1':'', MOVIES_E2E_FIXTURE_PATH: fixturePath, MOVIES_E2E_ARTIFACT_DIR: join(disposable,'browser-output'), PLAYWRIGHT_EXTERNAL_BASE_URL: origin };
  if(focus)browserArgs.push('--grep',focus==='pagination'?'anonymous category later|global TMDB taxonomy':focus==='search'?'delayed real canonical search':focus==='copies'?'optional provider image failures':focus==='owner-order'?'owner manual form|canonical both-kind provider|optional provider image failures':'owner manual form');
  if (protectedReceipt) browserArgs = protectedReceipt.arguments(browserArgs, disposable);
  if (protectedReceipt) protectedReceipt.discovery(frontend, [...browserArgs, '--workers=1', '--forbid-only'], browserEnv, disposable);
  browser = spawn(process.execPath, [resolve(frontend, 'node_modules/@playwright/test/cli.js'),
    'test', ...browserArgs, ...(protectedReceipt ? ['--workers=1', '--forbid-only', '--reporter=json,line'] : [])], {
    cwd: frontend, windowsHide: true, stdio: diagnostic?['ignore','pipe','inherit']:'inherit', env: { ...browserEnv,
      MOVIES_E2E_FIXTURE_PATH: fixturePath, MOVIES_E2E_ARTIFACT_DIR: join(disposable,'browser-output'),
      ...(protectedReceipt ? protectedReceipt.executionEnvironment({}, disposable) : {}),
      PLAYWRIGHT_EXTERNAL_BASE_URL: origin },
  });
  if(diagnostic&&browser?.stdout){let pending='';browser.stdout.on('data',chunk=>{process.stdout.write(chunk);pending+=String(chunk);const lines=pending.split('\n');pending=lines.pop()??'';for(const line of lines){const marker=line.indexOf('MOVIES_OWNER_DIAGNOSTIC ');if(marker>=0){try{const record=JSON.parse(line.slice(marker+'MOVIES_OWNER_DIAGNOSTIC '.length));if(diagnosticRecords.length<24)diagnosticRecords.push(record);}catch{}}}});}
  const exitCode = await new Promise<number>((done) => browser!.once('exit', (code) => done(code ?? 1)));
  if(diagnostic)writeFileSync(resolve(root,'.superpowers/sdd/epic-01/task4.1-owner-diagnostic-receipt.json'),JSON.stringify({version:1,acceptance:false,binding:diagnosticBinding,exitCode,records:diagnosticRecords},null,2)+'\n');
  if (protectedReceipt) protectedReceipt.execution(exitCode, browser.signalCode, disposable);
  return exitCode;
}
const signal = () => { interrupted = true; stopChild(browser); stopChild(vite);stopChild(frontendBuild); };
process.once('SIGINT', signal);
process.once('SIGTERM', signal);
process.on('message', (message: unknown) => {
  const input = message as { type?: string; capability?: string };
  if (protectedReceipt && input.type === 'replatform-cancel' && input.capability === protectedReceipt.capability) signal();
});
try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`Movies E2E fixture failed: ${error instanceof Error ? error.message.replaceAll(disposable, '<fixture>') : 'unknown'}\n`);
  process.exitCode = 1;
} finally {
  const failures: string[] = [];
  const cleanup = async (label: string, action: () => unknown) => { try { await action(); } catch { failures.push(label); } };
  await cleanup('browser child', () => protectedReceipt ? stopProtectedChild(browser) : stopChild(browser));
  await cleanup('build child',()=>stopProtectedChild(frontendBuild));
  await cleanup('Vite child', () => protectedReceipt ? stopProtectedChild(vite) : stopChild(vite));
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
    if (!relativeTemp || relativeTemp.startsWith('..') || isAbsolute(relativeTemp) || !relativeTemp.startsWith('explorers-movies-e2e-')) throw new Error('Fixture cleanup escaped its owned temporary directory');
    rmSync(resolve(disposable), { recursive: true, force: true });
  });
  if (protectedReceipt && authority) await cleanup('protected receipt qualification', () => protectedReceipt.finish(authority!, failures, interrupted));
  if (failures.length) { process.exitCode = 1; process.stderr.write(`Owned Movies cleanup/qualification failed: ${failures.join(', ')}\n`); }
  if (interrupted) process.exitCode = 130;
  if (process.connected) process.disconnect();
}
