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
import {LocalObjectStorage} from '../server/services/objectStorage';
import { ensureInitialAccount } from '../server/auth/initialAccount';
import { migrateMusicDatabase } from '../server/db/migrate';
import { MUSIC_UAT_DATABASE_ACK, startOwnedUatDatabase, stopOwnedUatDatabase,
  type OwnedUatDatabaseAuthority } from './music-uat-database';
import { prepareFixtureMusicTokenSecret, cleanupFixtureMusicTokenSecret } from './music-fixture-secret';
import { readSecureMusicSecretFile } from '../server/config/secure-music-secret-file';
import { extractProtectedReceiptArguments, createProtectedReceipt, stopProtectedChild } from './protected-browser-receipt';

import type {BookCatalog} from '../server/services/bookCatalog';
import type {MovieCatalog} from '../server/services/movieCatalog';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const root = resolve(import.meta.dirname, '../..');
// BEGIN PUBLIC CASE SCHEDULER: finite fixture-only, independently exercised without resource setup.
function createPublicCaseScheduler(io:{now:()=>number;wait:(milliseconds:number)=>Promise<void>;probe:(milliseconds:number)=>Promise<void>}) {
 const reservation=94, admissionMs=75000, rows:{tag:string;ingress:number;finished:number;aborted:number;probes:number;waitMs:number}[]=[];
 let current:typeof rows[number]|undefined,mode:'admission'|'case'|'ended'='ended',outstanding=0,remaining:number|undefined,resetAt:number|undefined,failure=false,probing=false,renew=false;
 const deny:()=>never=()=>{failure=true;throw Error('Public case scheduling failed');};
 const check=()=>{if(failure)deny();};
 const observation=(status:number,header:unknown)=>{
  if(!Number.isInteger(status)||status<200||status>599||status===429)deny();
  const match=typeof header==='string'?/^limit=(\d+),\s*remaining=(\d+),\s*reset=(\d+)$/.exec(header):null;
  if(!match)deny();
  const limit=Number(match[1]),available=Number(match[2]),seconds=Number(match[3]);
  if(limit!==120||!Number.isInteger(available)||available<0||available>119||!Number.isInteger(seconds)||seconds<0||seconds>60)deny();
  if(remaining===undefined||renew){remaining=available;resetAt=io.now()+seconds*1000;renew=false;}
  else remaining=Math.min(remaining,available);
 };
 const begin=async(tag:string)=>{
  check();const index=rows.length,expected=(index<10?'desktop-':'mobile-')+(index%10);
  if(index>=20||tag!==expected||mode!=='ended'||outstanding!==0)deny();
  const started=io.now(),deadline=started+admissionMs;current={tag,ingress:0,finished:0,aborted:0,probes:0,waitMs:0};rows.push(current);mode='admission';
  const boundedProbe=async(refresh:boolean)=>{
   if(io.now()>=deadline)deny();probing=true;renew=refresh;
   try{await io.probe(Math.min(15000,deadline-io.now()));}catch{deny();}finally{probing=false;renew=false;}
   if(io.now()>=deadline||outstanding!==0)deny();check();
  };
  const wasUnknown=remaining===undefined;
  if(wasUnknown)await boundedProbe(false);
  if(remaining===undefined||resetAt===undefined)deny();
  if(remaining<reservation||io.now()>=resetAt){
   const pause=Math.max(0,resetAt+1000-io.now());if(io.now()+pause>=deadline)deny();
   await io.wait(pause);if(io.now()>=deadline)deny();await boundedProbe(true);
  }
  if(remaining===undefined||remaining<reservation||outstanding!==0)deny();
  current.waitMs=io.now()-started;mode='case';return {...current};
 };
 const enter=()=>{
  check();if(!current||mode==='ended'||mode==='admission'&&!probing)deny();
  const row=current;if(++row.ingress>reservation)deny();if(probing&&++row.probes>2)deny();
  outstanding++;if(remaining!==undefined)remaining=Math.max(0,remaining-1);let settled=false;
  return (status:number,header:unknown,aborted:boolean)=>{
   if(settled)return;settled=true;outstanding--;
   if(aborted){row.aborted++;if(header!==undefined)try{observation(status,header);}catch{failure=true;}}
   else{row.finished++;try{observation(status,header);}catch{failure=true;}}
  };
 };
 const end=(tag:string)=>{check();if(!current||mode!=='case'||tag!==current.tag||outstanding!==0)deny();mode='ended';return {...current};};
 const complete=()=>{check();if(rows.length!==20||mode!=='ended'||outstanding!==0)deny();return rows.map(row=>({...row}));};
 return {begin,enter,end,complete,snapshot:()=>({outstanding,remaining,resetAt,failure,mode,rows:rows.map(row=>({...row}))})};
}
// END PUBLIC CASE SCHEDULER
const frontend = resolve(root, 'explorers-earth');
const rawArguments=process.argv.slice(2);
const receiptArguments = extractProtectedReceiptArguments(rawArguments);
if (JSON.stringify(receiptArguments.args) !== JSON.stringify(['--ack', MUSIC_UAT_DATABASE_ACK]))
  throw new Error('Browser E2E requires exact disposable PostgreSQL acknowledgement');
for (const key of ['DATABASE_URL', 'DATABASE_URL_TEST', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'GATE_PROD',
  'MUSIC_DEPLOY_PRODUCTION', 'MUSIC_DEPLOY_PROD']) {
  if (process.env[key]) throw new Error('Ambient database or Docker authority is forbidden');
}
if (process.env.NODE_ENV === 'production' || Object.keys(process.env).some((key) => key.startsWith('MUSIC_C10_STANDALONE_POSTGRES_')))
  throw new Error('Production or unrelated database authority is forbidden');
const protectedReceipt = await createProtectedReceipt(root, 'games', receiptArguments);

const runId = randomBytes(16).toString('hex');
const runtimeRole = `games_browser_${runId.slice(0,12)}`;
const database = `music_uat_${runId}`;
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const disposable = mkdtempSync(join(tmpdir(), 'explorers-games-e2e-'));
const passwordFile = prepareFixtureMusicTokenSecret(root);
let authority: OwnedUatDatabaseAuthority | undefined;
let db: pg.Pool | undefined;
let runtime:pg.Pool|undefined;
let apiServer: ReturnType<ReturnType<typeof createCanonicalApp>['app']['listen']> | undefined;
let vite: ChildProcess | undefined;
let frontendBuild:ChildProcess|undefined;
let browser: ChildProcess | undefined;
let interrupted = false;
let phase='setup';
let releaseStorage:(()=>void)|undefined;
let storageEntered=false;
let storageSettled:Promise<void>|undefined;

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
    if (proof.rows[0]?.ownership === `games-browser:${runId}`) await admin.query(`DROP ROLE ${runtimeRole}`);
    else if (proof.rows.length) throw new Error('Fixture runtime role ownership changed');
  }
  finally { await admin.end(); }
}
async function seedGames(pool:pg.Pool,accountId:string,name:string){
 await pool.query("INSERT INTO account_category_pin_state(account_id,category) VALUES($1,'games') ON CONFLICT DO NOTHING",[accountId]); let pinned=0;
 for(let n=0;n<14;n++){
  const list=(await pool.query("INSERT INTO collections(account_id,category,title,slug,description,heading,visibility,publication_state,display_order) VALUES($1,'games',$2,$3,'Seed description','Seed heading','public','published',$4) RETURNING id",[accountId,name+' seed list '+n,'seed-list-'+n,n])).rows[0].id;
  for(let position=0;position<(n===0?30:1);position++){
   const entity=(await pool.query("INSERT INTO entities(kind,title,origin) VALUES('game',$1,'manual') RETURNING id",[name+' seed game '+n+'-'+position])).rows[0].id;
   const recommendation=(await pool.query("INSERT INTO recommendations(account_id,category,entity_id,user_rating,note,publication_state) VALUES($1,'games',$2,8,$3::jsonb,'published') RETURNING id",[accountId,entity,JSON.stringify({version:1,format:'quill-html',html:'<p>Seed rich note 😀</p>'})])).rows[0].id;
   await pool.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'games',$4)",[list,recommendation,accountId,position]);
   if((n===0&&position<14||n===13)&&pinned<15){await pool.query("INSERT INTO category_recommendation_pins(account_id,category,recommendation_id,collection_id,position) VALUES($1,'games',$2,$3,$4)",[accountId,recommendation,list,pinned++]);}
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
  phase='migration';await migrateMusicDatabase(db);
  const origin = `http://127.0.0.1:${webPort}`;
  const config = resolveExplorersAuthConfig({ EXPLORERS_PUBLIC_ORIGIN: origin,
    EXPLORERS_AUTH_SECRET: randomBytes(32).toString('hex'),
    GOOGLE_CLIENT_ID: 'profile-fixture-google', GOOGLE_CLIENT_SECRET: 'profile-fixture-secret' });
  phase='runtime';const runtimePassword=randomBytes(32).toString("base64url");
  await provisionMusicRuntimeLogin(db,{loginRole:runtimeRole,password:runtimePassword},{ownershipComment:`games-browser:${runId}`});
  const runtimeUrl=new URL(dbUrl);runtimeUrl.username=runtimeRole;runtimeUrl.password=runtimePassword;runtime=new pg.Pool({connectionString:runtimeUrl.toString(),max:6});
  const storage=new LocalObjectStorage(join(disposable,'media'));
  const unavailable={search:async()=>{throw Error('Unregistered provider unavailable');},resolve:async()=>{throw Error('Unregistered provider unavailable');}};
  const composed=createCanonicalApp(runtime,config,{bookCatalog:unavailable as unknown as BookCatalog,movieCatalog:unavailable as unknown as MovieCatalog,mediaStorage:{environment:'local',put:storage.put.bind(storage),putOwned:storage.putOwned.bind(storage),delete:storage.delete.bind(storage),get:async(key:string)=>{const bytes=await storage.get(key),gate=storageSettled;if(gate){storageEntered=true;await gate;}return bytes;}}});
  const controlCapability=randomBytes(32).toString('hex');
  let probeHandle='';
  const publicCases=createPublicCaseScheduler({now:()=>Date.now(),wait:milliseconds=>new Promise(done=>setTimeout(done,milliseconds)),probe:async milliseconds=>{
   if(!probeHandle)throw Error('Public admission probe unavailable');
   const response=await fetch(`http://127.0.0.1:${apiPort}/api/explorers/v1/profiles/${probeHandle}`,{signal:AbortSignal.timeout(milliseconds),redirect:'error'});
   await response.arrayBuffer();if(response.status!==200)throw Error('Public admission probe failed');
  }});
  composed.app.use((req,res,next)=>{
   if(req.method==='GET'&&req.path.startsWith('/api/explorers/v1/profiles/')){
    let settle:ReturnType<typeof publicCases.enter>;try{settle=publicCases.enter();}catch{return void res.sendStatus(503);}
    req.once('aborted',()=>settle(res.statusCode,res.headersSent?res.getHeader('RateLimit'):undefined,true));
    res.once('finish',()=>settle(res.statusCode,res.getHeader('RateLimit'),false));
    res.once('close',()=>{if(!res.writableFinished)settle(res.statusCode,res.headersSent?res.getHeader('RateLimit'):undefined,true);});
   }next();
  });
  // Observe ingress before the unchanged native router/limiter, including direct and aborted requests.
  const publicCaseLayer=(composed.app as unknown as {router:{stack:unknown[]}}).router.stack.pop();
  (composed.app as unknown as {router:{stack:unknown[]}}).router.stack.unshift(publicCaseLayer);
  const controlledAccounts=new Map<string,string>();
  composed.app.post('/api/__games-fixture/control',async(req,res)=>{
   if(req.ip!=='127.0.0.1'||req.get('origin')!==origin||req.get('x-games-fixture-capability')!==controlCapability)return void res.sendStatus(404);
   const body=req.body;if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||(!['arm-storage','storage-state','release-storage','suspend-ownerA','restore-ownerA'].includes(body.action)&&!(typeof body.action==='string'&&/^public-(begin|end)-(desktop|mobile)-[0-9]$/.test(body.action))))return void res.sendStatus(422);
   try{
    if(body.action.startsWith('public-begin-'))return void res.json(await publicCases.begin(body.action.slice(13)));
    else if(body.action.startsWith('public-end-'))return void res.json(publicCases.end(body.action.slice(11)));
    else if(body.action==='arm-storage'){if(storageSettled)return void res.sendStatus(409);storageEntered=false;storageSettled=new Promise<void>(done=>{releaseStorage=done;});}
    else if(body.action==='release-storage'){releaseStorage?.();releaseStorage=undefined;storageSettled=undefined;}
    else if(body.action==='suspend-ownerA')await db!.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1",[controlledAccounts.get('ownerA')]);
    else if(body.action==='restore-ownerA')await db!.query("UPDATE creator_accounts SET status='active',suspended_at=NULL WHERE id=$1",[controlledAccounts.get('ownerA')]);
    res.json({entered:storageEntered});
   }catch{res.sendStatus(500);}
  });
  apiServer = await new Promise((done) => {
    const server = composed.app.listen(apiPort, '127.0.0.1', () => done(server));
  });
  const personas: Record<string, { userId: string; cookie: string; handle: string }> = {};
  for (const name of ['ownerA', 'ownerB']) {
    const userId = `games-e2e-${randomUUID()}`;
    await db.query('INSERT INTO auth_user(id,name,email) VALUES ($1,$2,$3)', [userId, name, `${userId}@example.invalid`]);
    await db.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'google',$3,now())",
      [randomUUID(), `google-${userId}`, userId]);
    const context = await composed.auth.$context;
    const session = await context.internalAdapter.createSession(userId, false);
    const signature = createHmac('sha256', config.secret).update(session.token).digest('base64');
    const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${signature}`;
    const handle=`games${name.toLowerCase()}${runId.slice(0,4)}`;
    const selected=await ensureInitialAccount(db,userId);
    await db.query("UPDATE creator_accounts SET handle=$2,display_name=$3,account_type='Creator',public_profile=true,onboarding_status='complete' WHERE id=$1",[selected.accountId,handle,name]);
    await db.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='games'",[selected.accountId]);
    personas[name] = { userId, cookie, handle };
    controlledAccounts.set(name,selected.accountId);
    await seedGames(db,selected.accountId,name);
  }
  probeHandle=personas.ownerA.handle;
  phase='frontend';const fixturePath = join(disposable, 'sessions.json');
  writeFileSync(fixturePath, JSON.stringify({ origin, personas, controlCapability }), { mode: 0o600 });
  const frontendRequire=createRequire(resolve(frontend,'package.json'));
  const viteConfig=join(disposable,'games.vite.config.mjs');
  const definitions={
   'import.meta.env.VITE_API_URL':JSON.stringify(origin+'/graphql'),
   'import.meta.env.VITE_REST_API_URL':JSON.stringify('https://legacy-rest.invalid/api'),
   'import.meta.env.VITE_BASE_URL':JSON.stringify(origin),
   'import.meta.env.VITE_PUBLIC_PROFILE_GATEWAY_URL':JSON.stringify(origin),
   'import.meta.env.VITE_LOCAL_TUNES_API_URL':JSON.stringify('https://music-fixture.test'),
   'import.meta.env.VITE_LOCAL_TUNES_ENABLED':JSON.stringify('false'),
   'import.meta.env.VITE_PAYMENT_API_URL':JSON.stringify(origin),
   'import.meta.env.VITE_GOOGLE_MAPS_API_KEY':JSON.stringify('fixture-google-maps-key'),
   'import.meta.env.VITE_PUBLIC_ACCESS_TOKEN':JSON.stringify(''),
   'import.meta.env.VITE_FULL_ACCESS_TOKEN':JSON.stringify('')};
  const preview={host:'127.0.0.1',port:webPort,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:'+apiPort,changeOrigin:false}}};
  writeFileSync(viteConfig,'import react from '+JSON.stringify(pathToFileURL(frontendRequire.resolve('@vitejs/plugin-react')).href)+';\nexport default '+JSON.stringify({envDir:false,envPrefix:'GAMES_E2E_NEVER_EXPOSE_AMBIENT_',define:definitions,resolve:{alias:{'zod/v3':frontendRequire.resolve('zod/v3'),'@vis.gl/react-google-maps':resolve(frontend,'e2e/setup/maps-fixture.tsx')}},preview}) .replace(/}$/,',plugins:[react()]}')+';\n',{mode:0o600});
  frontendBuild=spawn(process.execPath,[resolve(frontend,'node_modules/vite/bin/vite.js'),'build','--logLevel','error','--config',viteConfig,'--outDir',join(disposable,'frontend-build')],{cwd:frontend,windowsHide:true,stdio:'inherit',env:{...process.env}});
  const built=await new Promise<number>(done=>frontendBuild!.once('exit',code=>done(code??1)));if(built!==0)throw Error('Owned Games frontend build failed');
  vite=spawn(process.execPath,[resolve(frontend,'node_modules/vite/bin/vite.js'),'preview','--logLevel','error','--config',viteConfig,'--outDir',join(disposable,'frontend-build')],{cwd:frontend,windowsHide:true,stdio:'inherit',env:{...process.env}});
  await waitFor(origin);
  phase='browser';let browserArgs=['--config=e2e/replatform/games.playwright.config.ts','--retries=0'];
  const browserEnv={...process.env,GAMES_E2E_FIXTURE_PATH:fixturePath,GAMES_E2E_ARTIFACT_DIR:join(disposable,'browser-output'),PLAYWRIGHT_EXTERNAL_BASE_URL:origin};
  if(protectedReceipt)browserArgs=protectedReceipt.arguments(browserArgs,disposable);
  if(protectedReceipt)protectedReceipt.discovery(frontend,[...browserArgs,'--workers=1','--forbid-only'],browserEnv,disposable);
  browser=spawn(process.execPath,[resolve(frontend,'node_modules/@playwright/test/cli.js'),'test',...browserArgs,...(protectedReceipt?['--workers=1','--forbid-only','--reporter=json,line']:[])],{cwd:frontend,windowsHide:true,stdio:'inherit',env:{...browserEnv,...(protectedReceipt?protectedReceipt.executionEnvironment({},disposable):{})}});
  const exitCode=await new Promise<number>(done=>browser!.once('exit',code=>done(code??1)));
  console.log('GAMES_PUBLIC_CASES '+JSON.stringify(publicCases.complete()));
  if(protectedReceipt)protectedReceipt.execution(exitCode,browser.signalCode,disposable);
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
  const code=error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&/^[A-Z0-9_]{1,32}$/.test(error.code)?error.code:'UNCLASSIFIED';
  process.stderr.write(`Games E2E fixture failed phase=${phase} code=${code}\n`);
  process.exitCode = 1;
} finally {
  releaseStorage?.();releaseStorage=undefined;storageSettled=undefined;
  const failures: string[] = [];
  const cleanup = async (label: string, action: () => unknown) => { try { await action(); } catch { failures.push(label); } };
  await cleanup('browser child', () => stopProtectedChild(browser));
  await cleanup('build child',()=>stopProtectedChild(frontendBuild));
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
    if (!relativeTemp || relativeTemp.startsWith('..') || isAbsolute(relativeTemp) || !relativeTemp.startsWith('explorers-games-e2e-')) throw new Error('Fixture cleanup escaped its owned temporary directory');
    rmSync(resolve(disposable), { recursive: true, force: true });
  });
  if (protectedReceipt && authority) await cleanup('protected receipt qualification', () => protectedReceipt.finish(authority!, failures, interrupted));
  if (failures.length) { process.exitCode = 1; process.stderr.write(`Owned Games cleanup/qualification failed: ${failures.join(', ')}\n`); }
  if (interrupted) process.exitCode = 130;
  if (process.connected) process.disconnect();
}
