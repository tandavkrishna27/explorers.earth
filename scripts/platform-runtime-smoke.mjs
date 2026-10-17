// Explicit disposable local rehearsal. This is not a deploy/qualification authority.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import https from 'node:https';
import {buildLocalRuntimePlan,validateApiEnvironment} from './platform-runtime-plan.ts';
import {assertUnauthenticatedSession,assertRestartQualification,selectCompiledExport} from './platform-runtime-smoke-contract.mjs';
if(process.argv[2]!=='--owned-synthetic-local-only')throw new Error('EXPLICIT_LOCAL_REHEARSAL_REQUIRED');
const nonce=randomBytes(8).toString('hex'), project='platform-rehearsal-'+nonce, volume=project+'-fixture';
const stage=mkdtempSync(join(tmpdir(),project+'-')),context=JSON.parse(execFileSync('docker',['context','inspect'],{encoding:'utf8'}));
assert.ok(context[0].Name==='desktop-linux'||/^unix:\/\//.test(context[0].Endpoints.docker.Host),'LOCAL_DAEMON_REQUIRED');
const d=(args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000});
const api=d(['image','inspect','explorers-platform-compose-smoke:owned','--format','{{.Id}}']).trim();
const web=d(['image','inspect','explorers-qa-web-local:qualified-a','--format','{{.Id}}']).trim();
const commit=d(['image','inspect',api,'--format','{{index .Config.Labels "org.opencontainers.image.revision"}}']).trim();
assert.match(commit,/^[a-f0-9]{40}$/);
const plan=buildLocalRuntimePlan({authority:'synthetic-local-only',origin:'https://qa.platform.invalid',project,apiImage:'ghcr.io/tandavkrishna27/explorers-api@'+api,webImage:'ghcr.io/tandavkrishna27/explorers-web@'+web,commit,database:'platform_qa',runtimeRole:'platform_login',migratorRole:'platform_owner',attestationKey:'synthetic-only-'+randomBytes(32).toString('hex'),files:{runtimePassword:'/owned/runtime',migratorPassword:'/owned/migrator',apiEnvironment:'/owned/api.env',publicConfig:'/owned/public.json',runtimeSource:'/owned/source',webTemplate:'/owned/index.html',tls:'/owned/tls',routing:'/owned/routing.yml'}});
const c=plan.compose; c.services.api.image=api;c.services.migrate.image=api;c.services.web.image=web;
// Fixture substitutions replace only host-file locations with an ownership-labeled
// Docker volume, preserving readonly mounts and separating migrator from runtime.
const bind=(target,readonly=true)=>`${volume}:${target}${readonly?':ro':''}`;
c.services.postgres.volumes=['postgres-data:/var/lib/postgresql/data',bind('/fixture')];c.services.postgres.environment.POSTGRES_PASSWORD_FILE='/fixture/migrator';
c.services.migrate.volumes=[bind('/fixture'),'gate-evidence:/deployment-gates'];c.services.migrate.environment.MUSIC_DATABASE_PASSWORD_FILE='/fixture/migrator';c.services.migrate.environment.MUSIC_RUNTIME_DATABASE_PASSWORD_FILE='/fixture/runtime';
// Runtime receives a dedicated volume containing ONLY its password, not the fixture.
const runtimeVolume=project+'-runtime', routingVolume=project+'-routing', rendererVolume=project+'-renderer';c.services.api.volumes=[`${runtimeVolume}:/run/secrets:ro`];
for(const v of [volume,runtimeVolume,routingVolume,rendererVolume])c.volumes[v]={external:true,name:v};
c.services.api.environment.MUSIC_DATABASE_PASSWORD_FILE='/run/secrets/runtime';c.services.api.env_file=[{path:join(stage,'api.env'),required:true}];c.networks.api.internal=true;
c.networks.ingress={};c.services.proxy.networks.push('ingress');
c.services.render.volumes=[`${rendererVolume}:/fixture:ro`,'runtime-web:/runtime-web'];c.services.render.command=['node','/fixture/source/scripts/render-platform-runtime.mjs','/fixture/public.json','/fixture/index.html','/runtime-web'];
c.services.proxy.volumes=[`${routingVolume}:/fixture:ro`];c.services.proxy.command=['--api.dashboard=false','--providers.file.filename=/fixture/routing.yml','--entrypoints.websecure.address=:443'];plan.routing.tls.certificates=[{certFile:'/fixture/tls/cert.pem',keyFile:'/fixture/tls/key.pem'}];
const composeFile=join(stage,'compose.json');writeFileSync(composeFile,JSON.stringify(c));
const compose=(...args)=>d(['compose','-f',composeFile,'-p',project,...args]);
const receipt={authority:'synthetic-local-only',releaseQualified:false,sourceCommit:commit,apiSourceTree:execFileSync('git',['rev-parse',commit+':tunes'],{encoding:'utf8'}).trim(),apiImage:api,webImage:web,checks:[],cleanup:false,publicRendererSourceHashes:{}};
const check=(name,fn)=>{fn();receipt.checks.push(name);};
let extracted, composeValidated=false;
try{
 for(const v of [volume,runtimeVolume,routingVolume,rendererVolume])d(['volume','create','--label',`platform.rehearsal=${nonce}`,v]);
 mkdirSync(join(stage,'source'),{recursive:true});extracted=d(['create',web]).trim();d(['cp',`${extracted}:/opt/platform-runtime/.`,join(stage,'source')]);d(['cp',`${extracted}:/usr/share/nginx/html/index.html`,join(stage,'index.html')]);d(['rm',extracted]);extracted=undefined;
 for(const relative of ['scripts/render-platform-runtime.mjs','src/lib/publicRuntimeContract.ts']){const extractedBytes=readFileSync(join(stage,'source',relative));assert.deepEqual(extractedBytes,readFileSync(join('explorers-earth',relative)),'VERIFIED_WEB_SOURCE_MISMATCH');receipt.publicRendererSourceHashes[relative]=createHash('sha256').update(extractedBytes).digest('hex');}
 const runtime=randomBytes(32).toString('base64url');writeFileSync(join(stage,'runtime'),runtime,{mode:0o600});writeFileSync(join(stage,'migrator'),randomBytes(32).toString('base64url'),{mode:0o600});
 writeFileSync(join(stage,'public.json'),JSON.stringify({version:1,environment:'qa',origin:'https://qa.platform.invalid',apiPath:'/api',socketPath:'/socket.io',analytics:{enabled:false}}));writeFileSync(join(stage,'routing.yml'),JSON.stringify(plan.routing));
 const apiEnvironment={EXPLORERS_AUTH_SECRET:'synthetic-'+randomBytes(32).toString('hex'),GOOGLE_CLIENT_ID:'synthetic.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'synthetic-only',EXPLORERS_MEDIA_S3_BUCKET:'synthetic-qa-bucket',EXPLORERS_MEDIA_S3_REGION:'us-east-1',AWS_ACCESS_KEY_ID:'synthetic-only',AWS_SECRET_ACCESS_KEY:'synthetic-only'};
 validateApiEnvironment(apiEnvironment);writeFileSync(join(stage,'api.env'),Object.entries(apiEnvironment).map(([k,v])=>k+'='+v).join('\n')+'\n');
 d(['run','--rm','--network','none','-v',`${stage}:/stage:ro`,'-v',`${volume}:/fixture`,'-v',`${runtimeVolume}:/runtime`,'-v',`${routingVolume}:/routing`,'-v',`${rendererVolume}:/render`,'node:24-bookworm','sh','-c','cp /stage/migrator /fixture/migrator && cp /stage/runtime /fixture/runtime && cp /stage/runtime /runtime/runtime && chmod 600 /fixture/migrator /fixture/runtime /runtime/runtime && cp -R /stage/source /render/source && cp /stage/public.json /stage/index.html /render/ && cp /stage/routing.yml /routing/ && mkdir /routing/tls && openssl req -x509 -newkey rsa:2048 -nodes -keyout /routing/tls/key.pem -out /routing/tls/cert.pem -days 1 -subj /CN=qa.platform.invalid -addext subjectAltName=DNS:qa.platform.invalid >/dev/null 2>&1']);
 check('compose-syntax',()=>compose('config','--quiet'));composeValidated=true;
 compose('up','-d','--wait','--wait-timeout','120');
 const ids=JSON.parse(compose('ps','--all','--format','json').split('\n').filter(Boolean).map(JSON.parse).map(x=>JSON.stringify(x)).join(',').replace(/^/,'[').replace(/$/,']'));
 const apiContainer=ids.find(x=>x.Service==='api').ID, pgContainer=ids.find(x=>x.Service==='postgres').ID;
 check('no-api-host-port',()=>assert.deepEqual(JSON.parse(d(['inspect',apiContainer,'--format','{{json .HostConfig.PortBindings}}'])),{}));
 check('no-db-host-port',()=>assert.deepEqual(JSON.parse(d(['inspect',pgContainer,'--format','{{json .HostConfig.PortBindings}}'])),{}));
 check('runtime-cannot-access-migrator',()=>assert.equal(d(['exec',apiContainer,'node','-e',"const fs=require('fs');if(fs.existsSync('/fixture/migrator'))process.exit(1)"]).trim(),''));
 check('runtime-not-superuser',()=>assert.equal(d(['exec',pgContainer,'psql','-U','platform_owner','-d','platform_qa','-Atc',"select rolsuper or rolcreaterole or rolcreatedb from pg_roles where rolname='platform_login'"]).trim(),'f'));
 const port=Number(compose('port','proxy','443').trim().split(':').pop());assert.ok(port>0&&port<=65535,'BOUND_LOCAL_PROXY_PORT_REQUIRED');
 const fetch=(path,body)=>new Promise((resolve,reject)=>{const req=https.request({hostname:'127.0.0.1',port,path,method:body?'POST':'GET',servername:'qa.platform.invalid',headers:{Host:'qa.platform.invalid',Origin:'https://qa.platform.invalid',...(body?{'Content-Type':'application/json'}:{})},rejectUnauthorized:false,timeout:10000},r=>{let text='';r.on('data',b=>text+=b);r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,body:text}));});req.on('timeout',()=>req.destroy(new Error('LOCAL_REQUEST_TIMEOUT')));req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
 for(const path of ['/','/profile','/runtime-config.json','/robots.txt','/sitemap.xml']){const r=await fetch(path);check('https-web-'+path,()=>{assert.equal(r.status,200);assert.equal(r.headers['x-robots-tag'],'noindex,nofollow');});}
 for(const path of ['/api/auth/get-session','/api/explorers/analytics/summary','/graphql','/socket.io/?EIO=4&transport=polling']){const r=await fetch(path);check('canonical-route-'+path,()=>{assert.equal(r.headers['cache-control'],'no-store');if(path==='/api/auth/get-session')assertUnauthenticatedSession(r);if(path.includes('summary'))assert.equal(r.status,401);if(path.startsWith('/socket.io')||path==='/graphql')assert.equal(r.status,404);});}
 const signin=await fetch('/api/auth/sign-in/social',{provider:'google',callbackURL:'https://qa.platform.invalid/'});
 check('synthetic-google-init-secure-cookie',()=>{assert.equal(signin.status,200);assert.ok(signin.headers['set-cookie']?.some(v=>/; Secure(?:;|$)/i.test(v)&&/; HttpOnly(?:;|$)/i.test(v)));const redirect=new URL(JSON.parse(signin.body).url);assert.equal(redirect.origin,'https://accounts.google.com');assert.equal(redirect.searchParams.get('redirect_uri'),'https://qa.platform.invalid/api/auth/callback/google');});
 check('runtime-owner-role-refused-before-listen',()=>{assert.throws(()=>compose('run','--rm','--no-deps','-e','MUSIC_DATABASE_USER=platform_owner','api'),error=>error.status===1&&/runtime database role must be distinct/.test(error.stderr));});
 const sql=query=>d(['exec',pgContainer,'psql','-v','ON_ERROR_STOP=1','-U','platform_owner','-d','platform_qa','-Atc',query]).trim();
 const oldChecksum=sql("select checksum from music_schema_migrations where id='0036_explorers_analytics_events'");assert.match(oldChecksum,/^[a-f0-9]{64}$/);
 try{sql("update music_schema_migrations set checksum=repeat('0',64) where id='0036_explorers_analytics_events'");check('schema-corruption-refused-before-listen',()=>assert.throws(()=>compose('run','--rm','--no-deps','api'),error=>error.status===1&&/schema is not ready/.test(error.stderr)));}finally{sql("update music_schema_migrations set checksum='"+oldChecksum+"' where id='0036_explorers_analytics_events'");}
 const readinessProbe=`const {default:pg}=await import('pg');const {default:fs}=await import('node:fs');const selectCompiledExport=${selectCompiledExport.toString()};const load=async name=>{const entries=fs.readdirSync('./dist/server').filter(file=>/^chunk-[A-Z0-9]+[.]js$/.test(file)).map(file=>({file,source:fs.readFileSync('./dist/server/'+file,'utf8')}));const m=await import('./dist/server/'+selectCompiledExport(entries,name));if(typeof m[name]!=='function')throw new Error('CANONICAL_COMPILED_EXPORT_INVALID');return m[name];};const resolveMusicDatabaseConnection=await load('resolveMusicDatabaseConnection');const checkMusicDatabaseReadiness=await load('checkMusicDatabaseReadiness');const c=await resolveMusicDatabaseConnection(process.env,'runtime');const p=new pg.Pool({connectionString:c.connectionString});try{const state=await checkMusicDatabaseReadiness(p);const row=(await p.query('select schema_checksum from music_schema_migrations order by id desc limit 1')).rows[0];process.stdout.write(JSON.stringify({...state,schemaChecksum:row.schema_checksum}));}finally{await p.end();}`;
 const schemaState=()=>JSON.parse(d(['exec',apiContainer,'node','--input-type=module','-e',readinessProbe]));
 const beforeRestart=schemaState();
 compose('restart','api');
 let restartedSession,healthy=false;const restartDeadline=Date.now()+30000;
 while(Date.now()<restartDeadline){
  healthy=d(['inspect',apiContainer,'--format','{{.State.Health.Status}}']).trim()==='healthy';
  if(healthy){try{const response=await fetch('/api/auth/get-session');assertUnauthenticatedSession(response);restartedSession=response;break;}catch{/* bounded startup verification, not a test retry */}}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 const afterRestart=schemaState();
 check('restart-retains-schema',()=>assertRestartQualification({healthy,session:restartedSession,schema:afterRestart,roleCount:Number(sql("select count(*) from pg_roles where rolname='platform_login'"))},beforeRestart));
 receipt.restartSchema=afterRestart;
}catch(error){process.stderr.write('Local rehearsal failed before qualification; stage '+receipt.checks.length+'\n');throw error;}finally{
 if(extracted)d(['rm','-f',extracted]);
 // No unrelated resource can be removed: project names are random, and each
 // external fixture volume is checked against its creation nonce first.
 if(composeValidated){
  for(const id of compose('ps','--all','--quiet').trim().split(/\s+/).filter(Boolean)){const labels=JSON.parse(d(['inspect',id,'--format','{{json .Config.Labels}}']));assert.equal(labels['com.docker.compose.project'],project);assert.ok(Object.keys(c.services).includes(labels['com.docker.compose.service']));}
  for(const name of ['postgres-data','gate-evidence','runtime-web']){const full=project+'_'+name;const exists=d(['volume','ls','--filter','name='+full,'--format','{{.Name}}']).trim().split(/\s+/).includes(full);if(exists)assert.equal(d(['volume','inspect',full,'--format','{{index .Labels "com.docker.compose.project"}}']).trim(),project);}
  compose('down','--volumes','--remove-orphans');
 }
 for(const v of [volume,runtimeVolume,routingVolume,rendererVolume]){assert.equal(d(['volume','inspect',v,'--format','{{index .Labels "platform.rehearsal"}}']).trim(),nonce);d(['volume','rm',v]);}
 receipt.cleanup=true;rmSync(stage,{recursive:true,force:true});
}
receipt.receiptDigest='sha256:'+createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
process.stdout.write(JSON.stringify(receipt)+'\n');
