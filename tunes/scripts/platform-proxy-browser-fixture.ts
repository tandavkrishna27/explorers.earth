// Fixture composition only. Never used by production startup or hosted QA.
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import pg from 'pg';
import {createCanonicalApp} from '../server/auth/canonicalApp';
import {resolveExplorersAuthConfig} from '../server/auth/betterAuth';
import {migrateMusicDatabase} from '../server/db/migrate';
import {provisionMusicRuntimeLogin} from '../server/db/music-runtime-role';
import {checkMusicDatabaseReadiness} from '../server/db/readiness';
import {ensureInitialAccount} from '../server/auth/initialAccount';
import {issueRecoveryProof} from '../server/auth/recoveryProof';
import {fixtureProviders,seedBooks} from './platform-proxy-browser-support';
if(JSON.stringify(process.argv.slice(2))!==JSON.stringify(['--owned-synthetic-local-only']))throw new Error('EXPLICIT_SYNTHETIC_AUTHORITY_REQUIRED');
const authority=JSON.parse(readFileSync('/private/authority.json','utf8'));
if(authority.kind!=='owned-synthetic-proxy/v1'||authority.origin!=='https://qa.platform.invalid'||!/^platform-browser-[a-f0-9]{32}$/.test(authority.project))throw new Error('FIXTURE_AUTHORITY_INVALID');
const password=readFileSync('/fixture/migrator','utf8'),runtimePassword=readFileSync('/fixture/runtime','utf8');
const db=new pg.Pool({host:'postgres',port:5432,user:'platform_owner',password,database:authority.database,max:4});
await migrateMusicDatabase(db);
await provisionMusicRuntimeLogin(db,{loginRole:authority.runtimeRole,password:runtimePassword},{ownershipComment:'platform-proxy:'+authority.runId});
const runtime=new pg.Pool({host:'postgres',port:5432,user:authority.runtimeRole,password:runtimePassword,database:authority.database,max:6});
const schema=await checkMusicDatabaseReadiness(runtime);if(!schema.ready||schema.currentId!=='0037_explorers_movies_provider_context')throw new Error('FIXTURE_SCHEMA_NOT_READY');
const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:authority.origin,EXPLORERS_AUTH_SECRET:randomBytes(32).toString('hex'),GOOGLE_CLIENT_ID:'synthetic.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'synthetic-only'});
const composed=createCanonicalApp(runtime,config,fixtureProviders(config.secret,'/private'));
mkdirSync('/private/sessions',{recursive:true});
let observerToken='';
for(const group of ['auth','profile','books','analytics']){
 const personas:Record<string,any>={};let recoveryProof;
 for(const name of ['ownerA','ownerB','ownerC']){
  const userId=`proxy-${group}-${randomUUID()}`;
  await db.query('INSERT INTO auth_user(id,name,email) VALUES($1,$2,$3)',[userId,name,userId+'@example.invalid']);
  await db.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())",[randomUUID(),'google-'+userId,userId]);
  const context=await composed.auth.$context,session=await context.internalAdapter.createSession(userId,false);
  const cookie=context.authCookies.sessionToken.name+'='+session.token+'.'+createHmac('sha256',config.secret).update(session.token).digest('base64');
  const handle=`${group}${name.toLowerCase()}${authority.runId.slice(0,4)}`;
  personas[name]={userId,cookie,handle};
  if(group==='books'||group==='analytics'){
   const a=await ensureInitialAccount(db,userId);
   await db.query("UPDATE creator_accounts SET handle=$2,display_name=$3,account_type='Creator',public_profile=true,onboarding_status='complete' WHERE id=$1",[a.accountId,handle,name]);
   await db.query("UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='books'",[a.accountId]);
   await seedBooks(db,a.accountId,name);
  }
 }
 if(group==='auth'){
  const p=personas.ownerB,a=await ensureInitialAccount(db,p.userId);
  await db.query("UPDATE creator_accounts SET status='suspended',suspended_at=now() WHERE id=$1",[a.accountId]);
  await db.query('UPDATE user_security_state SET blocked_at=now(),session_version=session_version+1 WHERE user_id=$1',[p.userId]);
  await db.query('DELETE FROM auth_session WHERE user_id=$1',[p.userId]);
  const session=await (await composed.auth.$context).internalAdapter.createSession(p.userId,false);
  recoveryProof=(await issueRecoveryProof(db,{userId:p.userId,subject:'google-'+p.userId,sessionId:session.id})).token;
 }
 if(group==='analytics')observerToken=randomBytes(32).toString('hex');
 writeFileSync('/private/sessions/'+group+'.json',JSON.stringify({origin:authority.origin,personas,recoveryProof,observerToken:group==='analytics'?observerToken:undefined,proxyAuthority:authority}),{mode:0o600});
}
composed.app.get('/api/__analytics-observer',async(req,res)=>{res.set('Cache-Control','no-store');if(req.headers.authorization!=='Bearer '+observerToken)return res.sendStatus(404);try{res.json({events:(await db.query('SELECT id,account_id,client_event_id,event_type,page,category,collection_id,recommendation_id,canonical_path FROM analytics_events ORDER BY received_at,id')).rows,receipts:(await db.query('SELECT account_id,client_event_id,event_id FROM analytics_event_receipts')).rows});}catch{res.sendStatus(500);}});
const server=composed.app.listen(5000,'0.0.0.0',()=>writeFileSync('/private/ready.json',JSON.stringify({schema,seed:'canonical-fixture-only',runId:authority.runId}),{mode:0o600}));
async function close(){await new Promise<void>((done)=>server.close(()=>done()));await runtime.end();await db.end();process.exit(0);}
process.once('SIGTERM',close);process.once('SIGINT',close);
