// One explicit owned local fixture lane. Does not authorize hosted QA or release.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {buildLocalRuntimePlan} from './platform-runtime-plan.ts';
import {validateProxyDiscovery,validateProxyExecution,validateProxyResources} from './platform-proxy-browser-contract.mjs';
const ownedFiles=['scripts/platform-proxy-browser.mjs','scripts/platform-proxy-browser-contract.d.mts','explorers-earth/e2e/replatform/proxy-fixture-authority.d.mts','scripts/platform-proxy-browser-contract.mjs','tunes/scripts/platform-proxy-browser-fixture.ts','tunes/scripts/platform-proxy-browser-support.ts','tunes/server/test/contracts/platform-proxy-browser.test.ts','explorers-earth/e2e/replatform/proxy-fixture-authority.mjs','explorers-earth/e2e/replatform/platform-proxy.playwright.config.ts','explorers-earth/e2e/replatform/platform-proxy.manifest.json','explorers-earth/e2e/replatform/platform-proxy-preflight.mjs',...['auth','profile','books','analytics'].map(n=>'explorers-earth/e2e/replatform/'+n+'.spec.ts')];
const diagnostic=JSON.stringify(process.argv.slice(2))===JSON.stringify(['--owned-synthetic-local-only','--diagnostic-lost-ack-mobile']);
if(!diagnostic&&JSON.stringify(process.argv.slice(2))!==JSON.stringify(['--owned-synthetic-local-only']))throw new Error('EXPLICIT_SYNTHETIC_AUTHORITY_REQUIRED');
for(const key of ['DATABASE_URL','DATABASE_URL_TEST','DOCKER_HOST','DOCKER_CONTEXT','NODE_ENV','GOOGLE_CLIENT_SECRET','AWS_SECRET_ACCESS_KEY'])if(process.env[key])throw new Error('AMBIENT_AUTHORITY_FORBIDDEN');
const root=process.cwd(),runId=randomBytes(16).toString('hex'),project='platform-browser-'+runId,stage=mkdtempSync(join(tmpdir(),project+'-'));
const docker=(args,timeout=180000)=>execFileSync('docker',args,{encoding:'utf8',timeout,stdio:['ignore','pipe','pipe']});
const context=JSON.parse(docker(['context','inspect']));assert.equal(context[0].Name,'desktop-linux');
const reviewedWebImage='sha256:f70dc846d3dfd65fd6b8893d77a368aed88609ee6cc4fea3bcbe096345ddd06f';
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),webImage=docker(['image','inspect',reviewedWebImage,'--format','{{.Id}}']).trim();
assert.equal(webImage,reviewedWebImage);
const authority={kind:'owned-synthetic-proxy/v1',runId,project,sourceCommit:commit,webImage,capability:randomBytes(32).toString('hex'),origin:'https://qa.platform.invalid',callback:'https://qa.platform.invalid/api/auth/callback/google',database:'platform_qa',runtimeRole:'platform_browser_login',observerOwned:true,protectedArtifacts:true};
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceFiles=[...new Set([...execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean),...ownedFiles])].sort();
const sourceHashes=()=>Object.fromEntries(sourceFiles.map(p=>[p,sha(readFileSync(join(root,p)))]));
const before=sourceHashes(),archive=join(stage,'source');mkdirSync(archive);
execFileSync('git',['archive','--format=tar','--output='+join(stage,'source.tar'),commit]);execFileSync('tar',['-xf',join(stage,'source.tar'),'-C',archive]);
// Full tracked snapshot, including explicit new-file closure, no ambient untracked files.
for(const path of sourceFiles){mkdirSync(dirname(join(archive,path)),{recursive:true});copyFileSync(join(root,path),join(archive,path));}
const manifest=JSON.parse(readFileSync(join(archive,'explorers-earth/e2e/replatform/platform-proxy.manifest.json')));
writeFileSync(join(stage,'Fixture.Dockerfile'),`FROM public.ecr.aws/docker/library/node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
WORKDIR /source
COPY tunes/package*.json tunes/
COPY tunes/auth-runtime/package*.json tunes/auth-runtime/
RUN npm ci --prefix tunes
COPY explorers-earth/package*.json explorers-earth/
RUN npm ci --prefix explorers-earth
RUN cd explorers-earth && npx playwright install --with-deps chromium && apt-get update && apt-get install -y --no-install-recommends libnss3-tools openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY . .
`);
// This image consumes only the already closed tracked archive, not a workspace.
// Dockerfile-specific empty ignore prevents production-context exclusions from
// silently dropping fixture/auth files. The production ignore is unchanged.
writeFileSync(join(stage,'Fixture.Dockerfile.dockerignore'),'# Closed tracked source archive only\n');
const imageTag='explorers-platform-proxy-fixture:'+sha(JSON.stringify(before)).slice(0,16);
process.stdout.write('Preparing locked Linux browser fixture image (no runtime cloud egress).\n');
execFileSync('docker',['build','-f',join(stage,'Fixture.Dockerfile'),'-t',imageTag,archive],{stdio:'inherit',timeout:1200000});
const image=docker(['image','inspect',imageTag,'--format','{{.Id}}']).trim();
const volumes=['fixture','private','renderer','routing','ca'].map(n=>project+'-'+n);
const [fixtureVolume,privateVolume,rendererVolume,routingVolume,caVolume]=volumes;
const fakeApi='ghcr.io/tandavkrishna27/explorers-api@sha256:'+'0'.repeat(64);
const plan=buildLocalRuntimePlan({authority:'synthetic-local-only',origin:authority.origin,project:'platform-rehearsal-'+runId,apiImage:fakeApi,webImage:'ghcr.io/tandavkrishna27/explorers-web@'+webImage,commit,database:authority.database,runtimeRole:authority.runtimeRole,migratorRole:'platform_owner',attestationKey:'synthetic-only-'+runId,files:{runtimePassword:'/owned/runtime',migratorPassword:'/owned/migrator',apiEnvironment:'/owned/api.env',publicConfig:'/owned/public.json',runtimeSource:'/owned/source',webTemplate:'/owned/index.html',tls:'/owned/tls',routing:'/owned/routing.json'}});
const c=plan.compose;c.name=project;delete c.services.migrate;
c.services.postgres.volumes=['postgres-data:/var/lib/postgresql/data',fixtureVolume+':/fixture:ro'];c.services.postgres.environment.POSTGRES_PASSWORD_FILE='/fixture/migrator';
c.services.api={image,init:true,command:['tunes/node_modules/.bin/tsx','tunes/scripts/platform-proxy-browser-fixture.ts','--owned-synthetic-local-only'],volumes:[fixtureVolume+':/fixture:ro',privateVolume+':/private'],networks:['database','api'],depends_on:{postgres:{condition:'service_healthy'}},healthcheck:{test:['CMD','node','-e',"const f=require('fs');if(!f.existsSync('/private/ready.json'))process.exit(1);fetch('http://127.0.0.1:5000/api/auth/get-session').then(async r=>{if(r.status!==200||await r.text()!=='null')process.exit(1)}).catch(()=>process.exit(1))"],interval:'3s',timeout:'3s',retries:60}};
c.services.web.image=webImage;c.services.render.volumes=[rendererVolume+':/fixture:ro','runtime-web:/runtime-web'];c.services.render.command=['node','/fixture/source/scripts/render-platform-runtime.mjs','/fixture/public.json','/fixture/index.html','/runtime-web'];
c.services.proxy.volumes=[routingVolume+':/fixture:ro'];c.services.proxy.command=['--api.dashboard=false','--providers.file.filename=/fixture/routing.json','--entrypoints.websecure.address=:443'];
c.networks.api.internal=true;c.networks.browser={internal:true};c.services.proxy.networks={api:{},web:{},browser:{aliases:['qa.platform.invalid']}};
plan.routing.tls.certificates=[{certFile:'/fixture/tls/cert.pem',keyFile:'/fixture/tls/key.pem'}];
const browserEnv={PLATFORM_PROXY_AUTHORITY:JSON.stringify(authority),PLAYWRIGHT_EXTERNAL_BASE_URL:authority.origin,AUTH_E2E_FIXTURE_PATH:'/private/sessions/auth.json',PROFILE_E2E_FIXTURE_PATH:'/private/sessions/profile.json',BOOKS_E2E_FIXTURE_PATH:'/private/sessions/books.json',ANALYTICS_E2E_FIXTURE_PATH:'/private/sessions/analytics.json',PLAYWRIGHT_JSON_OUTPUT_NAME:'/private/execution.json',NODE_EXTRA_CA_CERTS:'/fixture/cert.pem'};
const args='--config=e2e/replatform/platform-proxy.playwright.config.ts --workers=1 --retries=0 --forbid-only --output=/private/artifacts';
const diagnosticArgs=diagnostic?' --project=analytics-desktop --project=analytics-mobile':'';
c.services.browser={image,init:true,working_dir:'/source/explorers-earth',environment:browserEnv,volumes:[privateVolume+':/private',caVolume+':/fixture:ro'],networks:['browser'],depends_on:{proxy:{condition:'service_started'}},command:['sh','-c',`mkdir -p /root/.pki/nssdb && certutil -N -d sql:/root/.pki/nssdb --empty-password && certutil -A -d sql:/root/.pki/nssdb -n fixture -t C,, -i /fixture/cert.pem && node -e "const fs=require('fs');const {chromium}=require('playwright');if(process.version!=='v24.21.0'||require('@playwright/test/package.json').version!=='1.61.1'||!fs.existsSync(chromium.executablePath()))process.exit(1)" && node e2e/replatform/platform-proxy-preflight.mjs && node node_modules/@playwright/test/cli.js test ${args} --list --reporter=json > /private/discovery.stdout && cp /private/execution.json /private/discovery.json && node --input-type=module -e "import fs from 'node:fs';import {validateProxyDiscovery} from '../scripts/platform-proxy-browser-contract.mjs';validateProxyDiscovery(JSON.parse(fs.readFileSync('/private/discovery.json')),JSON.parse(fs.readFileSync('e2e/replatform/platform-proxy.manifest.json')))" && node node_modules/@playwright/test/cli.js test ${args}${diagnosticArgs} --reporter=json > /private/browser.stdout`]};
for(const v of volumes)c.volumes[v]={external:true,name:v};delete c.volumes['gate-evidence'];
const file=join(stage,'compose.json');writeFileSync(file,JSON.stringify(c));
const compose=(...args)=>docker(['compose','-f',file,'-p',project,...args],600000);
const receipt={kind:authority.kind,releaseQualified:false,sourceCommit:commit,sourceHashes:before,webImage,fixtureImage:image,providerBoundary:'canonical fixture injected catalog/cover/local storage; not production API image provider qualification',tlsBoundary:'owned self-signed fixture CA; ignoreHTTPSErrors limited to this config, not production trust',checks:[],cleanup:false};
let extracted,validated=false;
try{
 for(const v of volumes)docker(['volume','create','--label','platform.browser='+runId,v]);
 mkdirSync(join(stage,'renderer'));extracted=docker(['create',webImage]).trim();docker(['cp',extracted+':/opt/platform-runtime/.',join(stage,'renderer/source')]);docker(['cp',extracted+':/usr/share/nginx/html/index.html',join(stage,'renderer/index.html')]);docker(['rm',extracted]);extracted=undefined;
 for(const p of ['scripts/render-platform-runtime.mjs','src/lib/publicRuntimeContract.ts'])assert.deepEqual(readFileSync(join(stage,'renderer/source',p)),readFileSync(join(root,'explorers-earth',p)));
 writeFileSync(join(stage,'renderer/public.json'),JSON.stringify({version:1,environment:'qa',origin:authority.origin,apiPath:'/api',socketPath:'/socket.io',analytics:{enabled:false}}));
 writeFileSync(join(stage,'authority.json'),JSON.stringify(authority),{mode:0o600});writeFileSync(join(stage,'migrator'),randomBytes(32).toString('base64url'),{mode:0o600});writeFileSync(join(stage,'runtime'),randomBytes(32).toString('base64url'),{mode:0o600});writeFileSync(join(stage,'routing.json'),JSON.stringify(plan.routing));
 docker(['run','--rm','--network','none','-v',stage+':/stage:ro','-v',fixtureVolume+':/fixture','-v',privateVolume+':/private','-v',rendererVolume+':/renderer','-v',routingVolume+':/routing','-v',caVolume+':/ca',image,'sh','-c','cp /stage/authority.json /private/authority.json && chmod 600 /private/authority.json && cp /stage/runtime /stage/migrator /fixture/ && chmod 600 /fixture/* && cp -R /stage/renderer/. /renderer/ && cp /stage/routing.json /routing/ && mkdir /routing/tls && openssl req -x509 -newkey rsa:2048 -nodes -keyout /routing/tls/key.pem -out /routing/tls/cert.pem -days 1 -subj /CN=qa.platform.invalid -addext subjectAltName=DNS:qa.platform.invalid >/dev/null 2>&1 && cp /routing/tls/cert.pem /ca/cert.pem']);
 compose('config','--quiet');validated=true;compose('up','-d','--wait','--wait-timeout','240','api','web','proxy');
 const serviceId=name=>compose('ps','--quiet',name).trim();
 for(const name of ['api','postgres'])assert.deepEqual(JSON.parse(docker(['inspect',serviceId(name),'--format','{{json .HostConfig.PortBindings}}'])),{});
 const browserExit=compose('run','--no-deps','--name',project+'-browser','browser');
 receipt.runtime=JSON.parse(docker(['run','--rm','--network','none','-v',privateVolume+':/private:ro',image,'cat','/private/ready.json']));
 receipt.preflight=JSON.parse(docker(['run','--rm','--network','none','-v',privateVolume+':/private:ro',image,'cat','/private/preflight.json']));
 const read=name=>JSON.parse(docker(['run','--rm','--network','none','-v',privateVolume+':/private:ro',image,'cat','/private/'+name]));
 validateProxyDiscovery(read('discovery.json'),manifest);if(diagnostic)throw new Error('DIAGNOSTIC_NOT_FULL_QUALIFICATION');validateProxyExecution(read('execution.json'),manifest,0);
 receipt.checks.push('exact-discovery-38','each-result-one-pass-retry-zero-38','no-api-or-db-host-ports','schema36-protected-runtime');
 assert.deepEqual(sourceHashes(),before);receipt.sourceUnchanged=true;
}catch(error){process.stderr.write('Proxy fixture failed; protected diagnostics remain private until owned cleanup.\n');
 if(validated){try{
  const raw=JSON.parse(docker(['run','--rm','--network','none','-v',privateVolume+':/private:ro',image,'cat','/private/execution.json']));
  const failures=[];const visit=suites=>{for(const s of suites||[]){for(const spec of s.specs||[])for(const test of spec.tests||[])for(const result of test.results||[])if(result.status!=='passed'){
   const message=result.error?.message||'';failures.push({file:spec.file,title:spec.title,project:test.projectName,status:result.status,retry:result.retry,category:/Timeout/i.test(message)?'timeout':/strict mode/i.test(message)?'strict-locator':/expect\(/i.test(message)?'assertion':'other',location:result.error?.location?{file:result.error.location.file,line:result.error.location.line,column:result.error.location.column}:undefined});
  }visit(s.suites);}};visit(raw.suites);
  const attempts=[]; const annotations=suites=>{for(const s of suites||[]){for(const spec of s.specs||[])for(const test of spec.tests||[])for(const a of test.annotations||[])if(a.type.startsWith("lost-ack-"))attempts.push({type:a.type,...JSON.parse(a.description)});annotations(s.suites);}};annotations(raw.suites);const safe={runId,sourceCommit:commit,diagnostic,stats:raw.stats,failures,attempts};writeFileSync(join(stage,'sanitized-failure.json'),JSON.stringify(safe,null,2));process.stderr.write(JSON.stringify(safe)+'\n');
 }catch{process.stderr.write('No completed execution receipt available.\n');}}
 if(validated){try{const id=compose('ps','--quiet','api').trim();process.stderr.write(docker(['logs','--tail','20',id]).replaceAll(stage,'<private>'));}catch{}}
 throw error;
}finally{
 if(extracted)docker(['rm','-f',extracted]);
 if(validated){
  const containers=compose('ps','--all','--quiet').trim().split(/\s+/).filter(Boolean).map(id=>{const l=JSON.parse(docker(['inspect',id,'--format','{{json .Config.Labels}}']));return {project:l['com.docker.compose.project'],service:l['com.docker.compose.service']};});
  const ownedVolumes=JSON.parse(docker(['volume','ls','--format','json']).split('\n').filter(Boolean).map(s=>JSON.parse(s)).filter(v=>v.Name.startsWith(project)).map(v=>JSON.stringify(v)).join(',').replace(/^/,'[').replace(/$/,']')).map(v=>{const l=JSON.parse(docker(['volume','inspect',v.Name,'--format','{{json .Labels}}']));return {name:v.Name,nonce:l['platform.browser'],project:l['com.docker.compose.project']};});
  validateProxyResources({project,runId,containers,volumes:ownedVolumes});compose('down','--volumes','--remove-orphans');
 }
 for(const v of volumes){assert.equal(docker(['volume','inspect',v,'--format','{{index .Labels "platform.browser"}}']).trim(),runId);docker(['volume','rm',v]);}
 // Source archive/image intentionally retained for review; remove synthetic secrets and raw reports with owned volumes.
 for(const p of ['authority.json','runtime','migrator','compose.json'])rmSync(join(stage,p));
 receipt.cleanup=true;receipt.retainedReviewArchive=stage;
}
receipt.digest='sha256:'+sha(JSON.stringify(receipt));writeFileSync(join(stage,'sanitized-receipt.json'),JSON.stringify(receipt,null,2));process.stdout.write(JSON.stringify({digest:receipt.digest,count:38,cleanup:receipt.cleanup,archive:stage})+'\n');
