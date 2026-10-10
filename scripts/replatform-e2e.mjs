import {createHash,randomBytes} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync,lstatSync,realpathSync,unlinkSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename,relative,isAbsolute,delimiter} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const ACK='TASK4_FIXTURE_OWNED_DISPOSABLE_PG15';
export function childNodeEnvironment(environment,platform=process.platform){
 const entries=Object.entries(environment);
 const path=entries.find(([key])=>platform==='win32'?key.toUpperCase()==='PATH':key==='PATH')?.[1]??'';
 const inherited=Object.fromEntries(entries.filter(([key])=>platform!=='win32'||key.toUpperCase()!=='PATH'));
 return {...inherited,PATH:dirname(process.execPath)+delimiter+path};
}
// Stable compatibility identifier. Scope contents are explicitly bound below.
const SCOPE='delivered-auth-profile-books';
const MANIFEST='explorers-earth/e2e/replatform/suite-manifest.json';
const lanes={auth:{count:6,runner:'tunes/scripts/profile-browser-fixture.ts',config:'explorers-earth/playwright.config.ts',projects:['chromium-pr-safe']},profile:{count:6,runner:'tunes/scripts/profile-browser-fixture.ts',config:'explorers-earth/playwright.config.ts',projects:['chromium-pr-safe']},books:{count:20,runner:'tunes/scripts/books-browser-fixture.ts',config:'explorers-earth/e2e/replatform/books.playwright.config.ts',projects:['books-desktop','books-mobile']},lifecycle:{count:18,runner:'tunes/scripts/profile-browser-fixture.ts',config:'explorers-earth/e2e/replatform/lifecycle.playwright.config.ts',projects:['lifecycle-chromium']},movies:{count:24,runner:'tunes/scripts/movies-browser-fixture.ts',config:'explorers-earth/e2e/replatform/movies.playwright.config.ts',projects:['movies-desktop','movies-mobile']},games:{count:20,runner:'tunes/scripts/games-browser-fixture.ts',config:'explorers-earth/e2e/replatform/games.playwright.config.ts',projects:['games-desktop','games-mobile']},music:{count:24,runner:'tunes/scripts/canonical-music-browser-fixture.ts',config:'explorers-earth/e2e/replatform/music.playwright.config.ts',projects:['music-desktop','music-mobile']},places:{count:8,runner:'tunes/scripts/profile-browser-fixture.ts',config:'explorers-earth/e2e/replatform/places.playwright.config.ts',projects:['places-desktop','places-mobile']},'place-links':{count:8,runner:'tunes/scripts/profile-browser-fixture.ts',config:'explorers-earth/e2e/replatform/place-links.playwright.config.ts',projects:['place-links-desktop','place-links-mobile']}};
const placesTitles=["Places: retained location create edit and reload preserve zero and absent coordinates","Places: complete owner and anonymous pages contain every seeded list and recommendation","Places: owned image bytes disappear after the final public attachment is hidden","Places: foreign owner edits and private contact reads cannot disclose owner data"];
const placeLinkTitles=["Place links: existing Products and People lists attach detach and survive reload","Place links: retained create forms atomically create and link Products and People lists","Place links: public children obey parent child category and account visibility","Place links: stale and foreign link commands preserve both lists"];
const musicTitles=["canonical cookie ensure opens one owner workspace and survives reload","owner playlists songs queue playback and history preserve transactions","foreign playlist song and venue identifiers deny owner access","expired owner credential refresh safely replays one mutation","transport reconnect mints a new HTTP socket ticket","browser sign out revokes same session activity and preserves another session","owner publication replay and stale revisions preserve public state","guest request owner acceptance and player updates use separate authority","public unlisted and revoked sharing deny hidden data","newer public revisions survive delayed and out of order notifications","provider outage and retry preserve owner draft and bounded controls","origin expiry and guest request limits fail closed"];
const lifecycleTitles=["active Settings requires trimmed feedback and retries one durable submission","foreign feedback and stale revision cannot delete an active owner","UI deactivation revokes both tabs and the old session","UI deletion is cancelled by a real Google recovery callback","recovery proof expires and cannot grant ordinary authority","concurrent recovery completes exactly once and rejects replay","wrong provider identity cannot recover a retained account","terminal maintenance preserves tombstone and denies recovery","foreign and absent origins cannot mutate lifecycle state","delayed old lifecycle response cannot navigate a new owner","held feedback cannot mutate navigate or log out verified replacement B","held feedback cannot mutate navigate or log out a fresh verified returning A session","held deletion completion preserves verified replacement B","held deletion completion preserves a fresh verified returning A session","held deactivation completion preserves verified replacement B","held deactivation completion preserves a fresh verified returning A session","held recovery completion preserves verified replacement B","held recovery completion preserves a fresh verified returning A session"];
const gamesTitles=["Games manual: Home creates a native list and distinct same-title recommendations","Games manual: note and creator rating survive edit and reload without provider facts","Games manual: complete owner pages preserve memberships reorder and pin position zero","Games manual: Keep draft and Publish preserve keyboard decision and public state","Games manual: ready uploaded cover and gallery bytes enforce owner public and foreign attachment","Games manual: provider unavailable preserves draft and forbids browser credential authority","Games manual: anonymous category and list continuation reveal later rows and terminal state","Games manual: ancestor hide archive and suspension deny fresh and inflight public bytes","Games manual: two anonymous contexts and username transition never reuse private or late rows","Games manual: account and route changes fence every deferred save continuation"];
const fail=message=>{throw new Error(message);};
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const equal=(a,b)=>canonical(a)===canonical(b);
const fields=(value,expected)=>{if(!value||typeof value!=='object'||Array.isArray(value)||!equal(Object.keys(value).sort(),[...expected].sort()))fail('Unknown/missing receipt fields');};
export function resolveNodeOwnedNpm(nodeExecutable=process.execPath,{platform=process.platform}={}){
 const node=realpathSync(nodeExecutable);if(!lstatSync(node).isFile())fail('Node executable must be a regular file');
 let prefix,pkg,alternative;
 if(platform==='win32'&&basename(node).toLowerCase()==='node.exe'){prefix=dirname(node);pkg=join(prefix,'node_modules/npm');alternative=join(prefix,'lib/node_modules/npm');}
 else if(platform==='linux'&&basename(node)==='node'&&basename(dirname(node))==='bin'){prefix=dirname(dirname(node));pkg=join(prefix,'lib/node_modules/npm');alternative=join(prefix,'bin/node_modules/npm');}
 else fail('Unsupported Node-owned npm layout');
 if(existsSync(alternative))fail('Ambiguous Node-owned npm installation');
 if(realpathSync(pkg)!==resolve(pkg)||!lstatSync(pkg).isDirectory())fail('npm package ownership mismatch');
 const packagePath=join(pkg,'package.json'),cli=join(pkg,'bin/npm-cli.js');
 for(const path of [packagePath,cli])if(realpathSync(path)!==resolve(path)||!lstatSync(path).isFile())fail('npm file ownership mismatch');
 const metadata=JSON.parse(readFileSync(packagePath,'utf8'));
 if(metadata.name!=='npm'||!/^\d+\.\d+\.\d+$/.test(metadata.version)||metadata.bin?.npm!=='bin/npm-cli.js')fail('npm package identity mismatch');
 return {nodeExecutable:node,nodePrefix:prefix,npmPackage:packagePath,npmCli:cli,packageVersion:metadata.version,layout:platform==='win32'?'windows-adjacent':'linux-prefix-lib'};
}
export function probeNodeOwnedNpm(nodeExecutable=process.execPath,{platform=process.platform,expectedNodeVersion=process.versions.node,run=(exe,args)=>execFileSync(exe,args,{encoding:'utf8',windowsHide:true})}={}){
 const owner=resolveNodeOwnedNpm(nodeExecutable,{platform});
 const nodeVersion=run(owner.nodeExecutable,['--version']).trim();if(nodeVersion!==`v${expectedNodeVersion}`)fail('Node runtime version mismatch');
 const npmVersion=run(owner.nodeExecutable,[owner.npmCli,'--version']).trim();if(npmVersion!==owner.packageVersion)fail('npm runtime/package version mismatch');
 return {...owner,nodeVersion:expectedNodeVersion,npmVersion};
}
export function identityKey(identity){
 if(!identity||Object.keys(identity).sort().join(',')!=='file,project,repeat,titlePath'||typeof identity.file!=='string'||!identity.file||/[\\:\x00-\x1f]/.test(identity.file)||identity.file.startsWith('/')||identity.file.split('/').some(p=>!p||p==='.'||p==='..')||!Array.isArray(identity.titlePath)||!identity.titlePath.length||identity.titlePath.some(p=>typeof p!=='string'||!p)||typeof identity.project!=='string'||identity.repeat!==0)fail('Invalid protected identity');
 return canonical(identity);
}
function inventory(identities){if(!Array.isArray(identities)||!identities.length)fail('Empty discovery');const keys=identities.map(identityKey);if(new Set(keys).size!==keys.length)fail('Duplicate identity');return keys.sort();}
export function assertEnvironment(env){
 if(env.NODE_ENV==='production'||Object.keys(env).some(key=>key.startsWith('MUSIC_C10_STANDALONE_POSTGRES_')||/^(?:AUTH|PROFILE|BOOKS|LIFECYCLE|MOVIES|GAMES|MUSIC|PLACES|PLACE_LINKS)_E2E_/.test(key))||['DATABASE_URL','DATABASE_URL_TEST','DOCKER_HOST','DOCKER_CONTEXT','GATE_PROD','MUSIC_DEPLOY_PRODUCTION','MUSIC_DEPLOY_PROD','PLAYWRIGHT_EXTERNAL_BASE_URL'].some(key=>Boolean(env[key])))fail('Ambient database, Docker, hosted fixture or production authority is forbidden');
}
export function parseArguments(args){
 if(args.length!==6)fail('Expected exact --milestone, --ack and --receipt flags');const flags={};for(let i=0;i<args.length;i+=2){if(!['--milestone','--ack','--receipt'].includes(args[i])||flags[args[i]]!==undefined||!args[i+1])fail('Unknown/duplicate/missing flag');flags[args[i]]=args[i+1];}
 if(flags['--milestone']!==SCOPE||flags['--ack']!==ACK)fail('Unsupported scope or owned acknowledgement');
 const path=flags['--receipt'];if(!isAbsolute(path)||dirname(resolve(path))!==resolve(tmpdir())||!/^replatform-e2e-[A-Za-z0-9-]{8,64}$/.test(basename(path))||existsSync(path))fail('Receipt must be a fresh direct temporary replatform-e2e directory');
 if(realpathSync(dirname(path))!==realpathSync(tmpdir())||lstatSync(dirname(path)).isSymbolicLink())fail('Receipt parent ownership mismatch');
 return {milestone:SCOPE,receiptDirectory:resolve(path)};
}
export function validateManifest(manifest){
 if(manifest?.version!==1||manifest.scope!==SCOPE||manifest.scopeCompatibilityIdentifier!==true||!equal(manifest.scopeContents,Object.keys(lanes))||!Array.isArray(manifest.lanes)||!equal(manifest.lanes.map(l=>l.name),Object.keys(lanes))||!Array.isArray(manifest.pending)||manifest.pending.length<7||manifest.pending.some(o=>!o.ticket||!o.obligation||o.status!=='pending')||!Array.isArray(manifest.limits)||manifest.limits.length<4)fail('Invalid delivered-slice manifest or pending ledger');
 for(const lane of manifest.lanes){const expected=lanes[lane.name];if(lane.runner!==expected.runner||lane.config!==expected.config||lane.spec!==`explorers-earth/e2e/replatform/${lane.name}.spec.ts`||!equal(lane.projects,expected.projects)||lane.identities?.length!==expected.count)fail('Lane inventory/config mismatch');inventory(lane.identities);if(lane.identities.some(i=>i.file!==lane.spec||!lane.projects.includes(i.project)))fail('Unknown lane identity');if(lane.name==='lifecycle'){const required=lifecycleTitles.map(title=>({file:lane.spec,titlePath:[title],project:'lifecycle-chromium',repeat:0}));if(!equal(inventory(lane.identities),inventory(required)))fail('Lifecycle exact identity mismatch');}if(lane.name==='music'){const required=lane.projects.flatMap(project=>musicTitles.map(title=>({file:lane.spec,titlePath:[title],project,repeat:0})));if(!equal(inventory(lane.identities),inventory(required)))fail('Music exact identity mismatch');}if(['places','place-links'].includes(lane.name)){const required=lane.projects.flatMap(project=>(lane.name==='places'?placesTitles:placeLinkTitles).map(title=>({file:lane.spec,titlePath:[title],project,repeat:0})));if(!equal(inventory(lane.identities),inventory(required)))fail('Places exact identity mismatch');}if(lane.name==='games'){const required=lane.projects.flatMap(project=>gamesTitles.map(title=>({file:lane.spec,titlePath:[title],project,repeat:0})));if(!equal(inventory(lane.identities),inventory(required)))fail('Games exact identity mismatch');}}
 return true;
}
export function protectedBrowserConfiguration(base,root,sourceConfig,outputDir){
 const use={...base.use,trace:'off',video:'off',screenshot:'off'};
 return {...base,testDir:resolve(root,dirname(sourceConfig),base.testDir??'.'),outputDir,use,metadata:{...base.metadata,protectedArtifacts:{sourceConfig,outputDir,trace:use.trace,video:use.video,screenshot:use.screenshot}},projects:base.projects.map(project=>({...project,outputDir,use:{...project.use,trace:use.trace,video:use.video,screenshot:use.screenshot}}))};
}
export function decodeProtectedReport(report,lane,root,execution,artifactPolicy){
 if(!Array.isArray(report?.errors)||report.errors.length||!Array.isArray(report.suites)||!report.suites.length||report.config?.workers!==1||report.config.shard!==null||report.config.forbidOnly!==true||!Array.isArray(report.config.projects))fail('Protected browser reporter errors or selector mismatch');
 const selected=report.config.projects.filter(project=>lane.projects.includes(project.name));
 if(!equal(selected.map(p=>p.name).sort(),[...lane.projects].sort())||selected.some(project=>project.repeatEach!==1||project.retries!==0))fail('Protected browser selected project/repeat/retry mismatch');
 if(typeof report.config.configFile!=='string'||typeof report.config.rootDir!=='string')fail('Protected browser config mismatch');
 if(artifactPolicy){if(report.config.configFile!==artifactPolicy.configFile||!equal(report.config.metadata?.protectedArtifacts,{sourceConfig:lane.config,outputDir:artifactPolicy.outputDir,trace:'off',video:'off',screenshot:'off'})||selected.some(project=>typeof project.outputDir!=='string'||resolve(project.outputDir)!==resolve(artifactPolicy.outputDir)))fail('Protected browser artifact policy mismatch');}
 else if(relative(root,report.config.configFile).replaceAll('\\','/')!==lane.config)fail('Protected browser config mismatch');
 const results=[];
 const walk=(suite,titles,fileRoot)=>{
  if(!suite||typeof suite.title!=='string'||(suite.specs!==undefined&&!Array.isArray(suite.specs))||(suite.suites!==undefined&&!Array.isArray(suite.suites)))fail('Malformed protected suite');
  const next=fileRoot?titles:[...titles,suite.title];
  for(const spec of suite.specs??[]){if(typeof spec.file!=='string'||typeof spec.title!=='string'||!Array.isArray(spec.tests)||!spec.tests.length)fail('Malformed protected spec');for(const test of spec.tests){
   if(!Array.isArray(test.annotations)||test.annotations.some(a=>['skip','fixme','fail'].includes(a.type))||test.expectedStatus!=='passed'||!Array.isArray(test.results)||(!execution&&test.results.length))fail('Protected expected status/annotation/result mismatch');
   const identity={file:relative(root,resolve(report.config.rootDir,spec.file)).replaceAll('\\','/'),titlePath:[...next,spec.title],project:test.projectName,repeat:0};identityKey(identity);
   results.push(execution?{identity,expectedStatus:test.expectedStatus,status:test.status,attempts:test.results.map(r=>({status:r.status,retry:r.retry}))}:identity);
  }}
  for(const nested of suite.suites??[])walk(nested,next,false);
 };
 for(const suite of report.suites)walk(suite,[],true);
 if(!equal(inventory(execution?results.map(r=>r.identity):results),inventory(lane.identities)))fail('Protected exact identity mismatch');
 return {results,playwright:report.config.version};
}
export function validateLaneReceipt(lane,child,provenance){
 if(child?.status!==0||child.signal||child.error)fail('Protected runner child failed/interrupted');const r=child.receipt;
 fields(r,['version','lane','provenance','config','spec','projects','discovery','results','errors','cleanup','authority','child','startedAt','endedAt','playwright','artifacts']);
 if(!equal(r.artifacts,{trace:'off',video:'off',screenshot:'off',cleanup:'passed'}))fail('Protected artifact policy/cleanup mismatch');
 fields(r.cleanup,['status']);fields(r.authority,['owned','database','containerId','imageId']);fields(r.child,['status','signal']);
 if(r?.version!==1||r.lane!==lane.name||!equal(r.provenance,provenance)||r.config!==lane.config||r.spec!==lane.spec||!equal(r.projects,lane.projects)||!Array.isArray(r.errors)||r.errors.length||r.cleanup?.status!=='passed'||r.child?.status!==0||r.child.signal||r.authority?.owned!==true||!/^music_uat_[a-f0-9]{32}$/.test(r.authority.database)||!/^[a-f0-9]{64}$/.test(r.authority.containerId)||!/^sha256:[a-f0-9]{64}$/.test(r.authority.imageId))fail('Protected receipt source/config/cleanup/authority mismatch');
 if(!equal(inventory(r.discovery),inventory(lane.identities))||!Array.isArray(r.results)||!equal(inventory(r.results.map(result=>result.identity)),inventory(lane.identities)))fail('Discovery/execution exact identity mismatch');
 for(const result of r.results){fields(result,['identity','expectedStatus','status','attempts']);if(result.expectedStatus!=='passed'||result.status!=='expected'||!Array.isArray(result.attempts)||result.attempts.length!==1||result.attempts[0].retry!==0||result.attempts[0].status!=='passed')fail('Skipped, incomplete, failed, flaky or retried execution');fields(result.attempts[0],['status','retry']);}
 if(!/^\d+\.\d+\.\d+$/.test(r.playwright)||!Number.isFinite(Date.parse(r.startedAt))||!Number.isFinite(Date.parse(r.endedAt))||Date.parse(r.endedAt)<Date.parse(r.startedAt))fail('Missing tool/timing evidence');
 if(lane.name==='music')validateMusicTopology(child.topology,provenance,r.authority);
 return r;
}
export function validateMusicTopology(record,provenance,authority){
 fields(record,['version','lane','provenance','authority','runtime','schema','transport','children','seams','cleanup']);fields(record.authority,['database','containerId','imageId']);fields(record.runtime,['role','migratorRole','verified']);fields(record.schema,['ready','currentId','currentChecksum']);fields(record.transport,['browserOrigin','canonicalOrigin','musicOrigin','logicalMusicOrigin','socketPath']);fields(record.seams,['session','provider','clock']);fields(record.cleanup,['status']);
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),migrationContract=readFileSync(join(root,'tunes/shared/music-migration-contract.ts'),'utf8'),id=migrationContract.match(/EXPECTED_MUSIC_MIGRATION_ID\s*=\s*"([a-z0-9_]+)"/)?.[1];
 if(!id)fail('Missing Music migration authority');const checksum=createHash('sha256').update(readFileSync(join(root,`tunes/migrations/${id}.sql`),'utf8')).digest('hex');
 const expectedAuthority={database:authority.database,containerId:authority.containerId,imageId:authority.imageId};
 if(record.version!==1||record.lane!=='music'||!equal(record.provenance,provenance)||!equal(record.authority,expectedAuthority)||!/^music_uat_[a-f0-9]{32}$/.test(record.authority.database)||record.runtime.role!==`music_browser_${record.authority.database.slice(10,22)}`||record.runtime.migratorRole!=='music_migrator'||record.runtime.verified!==true||record.schema.ready!==true||record.schema.currentId!==id||record.schema.currentChecksum!==checksum||record.cleanup.status!=='passed'||!equal(record.seams,{session:'better-auth-internal-adapter',provider:'guarded-youtube-transport',clock:'virtual-date-now-601000ms'}))fail('Music topology source/role/schema/seam mismatch');
 const origins=['browserOrigin','canonicalOrigin','musicOrigin'].map(key=>record.transport[key]);
 if(origins.some(origin=>typeof origin!=='string'||!/^http:\/\/127\.0\.0\.1:[1-9]\d{3,4}$/.test(origin)||Number(new URL(origin).port)>65535)||new Set(origins).size!==3||record.transport.logicalMusicOrigin!=='https://music-fixture.test'||record.transport.socketPath!=='/__localtunes/ws')fail('Music topology transport mismatch');
 if(!Array.isArray(record.children)||record.children.length!==2||!equal(record.children.map(child=>child.kind),['canonical','music']))fail('Music topology requires two production children');
 for(const child of record.children){fields(child,['kind','pid','startedAt','stoppedAt','exitCode','signal']);if(!Number.isInteger(child.pid)||child.pid<=0||child.exitCode!==0||child.signal!==null||!Number.isFinite(Date.parse(child.startedAt))||!Number.isFinite(Date.parse(child.stoppedAt))||Date.parse(child.stoppedAt)<Date.parse(child.startedAt))fail('Music child start/stop did not qualify');}
 if(record.children[0].pid===record.children[1].pid)fail('Music children are not independent');
 return record;
}
const musicFailureStages=new Set(['control-prepare','control-reset','control-clock','control-mapping','control-suspend','control-notify','control-provider-unavailable','control-provider-timeout','control-provider-rate-limit','control-provider-oversized','control-provider-success','reconnect-import-api','reconnect-import-owner','reconnect-import-socket','reconnect-ticket','reconnect-first-connect','reconnect-engine-close','reconnect-second-connect','public-route-load','public-http-response','public-schema-ready','public-socket-attempt','public-subscription-ready','provider-search-response','provider-error-visible','provider-draft-preserved','provider-retry-response']);
const musicFailureCauses=new Set(['child-unavailable','child-timeout','child-failed']);
const gamesFailureStages=new Set(['edit-waiter-registered','save-click-started','save-click-completed','patch-request','patch-response','patch-failed','edit-state']);
const gamesFailureCauses=new Set(['request-aborted','request-transport','response-ok','response-error','edit-route','route-changed','save-enabled','save-disabled','save-absent','observation-mismatch','owner-scope-changed','validation-failure','alert-other','state-unavailable']);
const moviesDiagnosticEnums={
 iteration:['none','first','second'],stage:['setup','edit-navigation','edit-form','save-start','save-returned','list-route-reached','saved-note-confirmed','keep-draft-start','keep-draft-returned','archive'],
 owner:['unavailable','disabled','no-account','pending','accepted','rejected'],phase:['unavailable','initial-category','detail-fanout','final-category','mapping','complete'],cause:['none','aborted','unauthenticated','scope-changed','revision-conflict','missing-detail','conflict','read-limit','snapshot-expired','invalid-owner-content','unavailable','other'],
 view:['unavailable','active','inactive'],list:['unavailable','loading','error','missing','ready-empty','ready-nonempty'],visibility:['unavailable','public','draft'],signal:['unavailable','present','absent'],guard:['unavailable','fresh','consumed'],prompt:['unavailable','open','closed'],button:['unavailable','absent','multiple','hidden','disabled','visible-enabled'],budgetAtStage:['unavailable','remaining','exhausted'],budgetAtFailure:['unavailable','remaining','exhausted'],sample:['unavailable','captured']};
const moviesDiagnosticIdentity={file:'explorers-earth/e2e/replatform/movies.spec.ts',titlePath:['owner manual form all fields snapshot repeat edits and archive reload'],project:'movies-mobile',repeat:0};
const moviesFailedStatus=status=>['failed','timedOut','interrupted'].includes(status);
const moviesIdentityAllowed=(lane,identity)=>lane.name==='movies'&&equal(identity,moviesDiagnosticIdentity)&&lane.identities.some(expected=>equal(expected,identity));
function decodeMoviesMarker(message){
 if(typeof message!=='string'||Buffer.byteLength(message,'utf8')>1024||!/^\[movies-diagnostic-v1:[a-z|-]+\]$/.test(message)||message.includes('\n')||message.includes('\r'))return undefined;
 const cells=message.slice('[movies-diagnostic-v1:'.length,-1).split('|'),keys=Object.keys(moviesDiagnosticEnums);
 if(cells.length!==keys.length||keys.some((key,index)=>!moviesDiagnosticEnums[key].includes(cells[index])))return undefined;
 return {version:1,...Object.fromEntries(keys.map((key,index)=>[key,cells[index]]))};
}
function validateMoviesDiagnostic(snapshot){
 fields(snapshot,['version',...Object.keys(moviesDiagnosticEnums)]);
 const descriptors=Object.getOwnPropertyDescriptors(snapshot);if(![Object.prototype,null].includes(Object.getPrototypeOf(snapshot))||Reflect.ownKeys(snapshot).length!==16||!descriptors.version||!('value' in descriptors.version)||descriptors.version.value!==1||Object.entries(moviesDiagnosticEnums).some(([key,values])=>!descriptors[key]||!('value' in descriptors[key])||!values.includes(descriptors[key].value)))fail('Unsafe Movies diagnostic');
}
export function decodeProtectedFailureDiagnostics(report,lane,root){
 const diagnostics=[];const filePattern=basename(lane.spec).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const walk=(suite,titles,fileRoot)=>{const next=fileRoot?titles:[...titles,suite.title];for(const spec of suite.specs??[])for(const test of spec.tests??[]){const identity={file:relative(root,resolve(report.config.rootDir,spec.file)).replaceAll('\\','/'),titlePath:[...next,spec.title],project:test.projectName,repeat:0};if(!lane.identities.some(expected=>identityKey(expected)===identityKey(identity)))fail('Unreviewed diagnostic identity');for(const result of test.results??[]){if(result.status==='passed')continue;const errors=result.errors??(result.error?[result.error]:[]);const markers=errors.filter(error=>typeof error.message==='string'&&error.message.includes('[movies-diagnostic-v1:'));const movies=moviesIdentityAllowed(lane,identity)&&(test.repeatEachIndex===undefined||test.repeatEachIndex===0)&&test.results.length===1&&moviesFailedStatus(result.status)&&result.retry===0&&markers.length===1?decodeMoviesMarker(markers[0].message):undefined;for(const error of errors){const message=typeof error.message==='string'?error.message:'';const stack=typeof error.stack==='string'?error.stack:'';const locations=[...stack.matchAll(new RegExp(`${filePattern}:(\\d+):(\\d+)`,'g'))].map(match=>({line:Number(match[1]),column:Number(match[2])})).filter(location=>location.line>0&&location.line<50000&&location.column>0&&location.column<50000);if(error.location&&typeof error.location.file==='string'&&basename(error.location.file.replaceAll('\\','/'))===basename(lane.spec)&&Number.isInteger(error.location.line)&&error.location.line>0&&error.location.line<50000&&Number.isInteger(error.location.column)&&error.location.column>0&&error.location.column<50000&&!locations.some(location=>location.line===error.location.line&&location.column===error.location.column))locations.push({line:error.location.line,column:error.location.column});const matcher=message.match(/\b(toBeVisible|toHaveValue|toMatchObject|toBe|toContain|toHaveAttribute|toBeChecked)\b/)?.[1]??'unknown';const kind=/strict mode violation/i.test(message)?'strict-mode':/Timeout.*exceeded|timed out|TimeoutError/i.test(message)?'timeout':/expect\(/.test(message)?'assertion':/ECONN|net::ERR_|fetch failed/i.test(message)?'transport':'error';const marker=message.match(/\[music-stage:([a-z-]+)\]/)?.[1];const gamesMarker=message.match(/\[games-stage:([a-z-]+)\]/)?.[1];const stage=lane.name==='music'&&musicFailureStages.has(marker)?marker:lane.name==='games'&&gamesFailureStages.has(gamesMarker)?gamesMarker:null;const causeMarker=message.match(/\[music-cause:([a-z-]+)\]/)?.[1];const gamesCauseMarker=message.match(/\[games-cause:([a-z-]+)\]/)?.[1];const cause=lane.name==='music'&&musicFailureCauses.has(causeMarker)?causeMarker:lane.name==='games'&&gamesFailureCauses.has(gamesCauseMarker)?gamesCauseMarker:null;diagnostics.push({identity,kind,matcher,locations,...(stage?{stage}:{}),...(cause?{cause}:{}),...(movies&&error===markers[0]?{movies}:{})});}}}for(const nested of suite.suites??[])walk(nested,next,false);};for(const suite of report.suites??[])walk(suite,[],true);if(diagnostics.filter(diagnostic=>Object.hasOwn(diagnostic,'movies')).length>1)for(const diagnostic of diagnostics)delete diagnostic.movies;return diagnostics;
}
export function validateFailureRecord(lane,failure,provenance,child){
 fields(failure,['version','lane','provenance','results','child','cleanup','artifacts',...(Object.hasOwn(failure,'diagnostics')?['diagnostics']:[])]);fields(failure.child,['status','signal']);fields(failure.cleanup,['status']);
 if(failure.version!==1||failure.lane!==lane.name||!equal(failure.provenance,provenance)||!Array.isArray(failure.results)||!equal(inventory(failure.results.map(result=>result.identity)),inventory(lane.identities))||child.status===0||!equal(failure.child,{status:child.status,signal:child.signal})||!equal(failure.artifacts,{trace:'off',video:'off',screenshot:'off',cleanup:'passed'})||failure.cleanup.status!=='passed')fail('Malformed protected failure/artifact record');
 for(const result of failure.results){fields(result,['identity','expectedStatus','status','attempts']);if(result.expectedStatus!=='passed'||!['expected','unexpected','skipped'].includes(result.status)||!Array.isArray(result.attempts)||result.attempts.length>1)fail('Malformed failed result');for(const attempt of result.attempts){fields(attempt,['status','retry']);if(attempt.retry!==0||!['passed','failed','timedOut','skipped','interrupted'].includes(attempt.status))fail('Malformed failed attempt');}}
 if(Object.hasOwn(failure,'diagnostics')){let moviesCount=0;if(!Array.isArray(failure.diagnostics))fail('Malformed diagnostic list');for(const diagnostic of failure.diagnostics){fields(diagnostic,['identity','kind','matcher','locations',...(Object.hasOwn(diagnostic,'stage')?['stage']:[]),...(Object.hasOwn(diagnostic,'cause')?['cause']:[]),...(Object.hasOwn(diagnostic,'movies')?['movies']:[])]);if(Object.hasOwn(diagnostic,'movies')){validateMoviesDiagnostic(diagnostic.movies);const matching=failure.results.filter(result=>equal(result.identity,diagnostic.identity));if(++moviesCount>1||!moviesIdentityAllowed(lane,diagnostic.identity)||matching.length!==1||matching[0].attempts.length!==1||matching[0].attempts[0].retry!==0||!moviesFailedStatus(matching[0].attempts[0].status))fail('Unbound Movies diagnostic');}if(Object.hasOwn(diagnostic,'cause')&&!((lane.name==='music'&&musicFailureCauses.has(diagnostic.cause))||(lane.name==='games'&&gamesFailureCauses.has(diagnostic.cause))))fail('Unsafe diagnostic cause');if(Object.hasOwn(diagnostic,'stage')&&!((lane.name==='music'&&musicFailureStages.has(diagnostic.stage))||(lane.name==='games'&&gamesFailureStages.has(diagnostic.stage))))fail('Unsafe diagnostic stage');if(!lane.identities.some(identity=>identityKey(identity)===identityKey(diagnostic.identity))||!['strict-mode','timeout','assertion','transport','error'].includes(diagnostic.kind)||!['toBeVisible','toHaveValue','toMatchObject','toBe','toContain','toHaveAttribute','toBeChecked','unknown'].includes(diagnostic.matcher)||!Array.isArray(diagnostic.locations))fail('Unsafe diagnostic field');for(const location of diagnostic.locations){fields(location,['line','column']);if(!Number.isInteger(location.line)||location.line<=0||location.line>=50000||!Number.isInteger(location.column)||location.column<=0||location.column>=50000)fail('Invalid diagnostic location');}}}
 return failure;
}
export function validateLifecycleFailureRecord(lane,record,provenance){
 fields(record,['version','lane','provenance','phase','interrupted','sourceIntact','cleanup','artifacts','counts']);fields(record.cleanup,['status','failures']);fields(record.artifacts,['trace','video','screenshot','cleanup']);fields(record.counts,['discovered','executed','passed','failed','skipped','attempts']);
 const labels=['browser','vite','service-children','control','runtime-pool','migrator-pool','owned-database','private-directory','artifacts','receipt'];
 if(record.version!==1||record.lane!==lane.name||!equal(record.provenance,provenance)||!['startup','discovery','execution','cleanup'].includes(record.phase)||typeof record.interrupted!=='boolean'||typeof record.sourceIntact!=='boolean'||!Array.isArray(record.cleanup.failures)||new Set(record.cleanup.failures).size!==record.cleanup.failures.length||record.cleanup.failures.some(label=>!labels.includes(label))||record.cleanup.status!==(record.cleanup.failures.length?'failed':'passed')||record.artifacts.trace!=='off'||record.artifacts.video!=='off'||record.artifacts.screenshot!=='off'||!['passed','failed'].includes(record.artifacts.cleanup)||Object.values(record.counts).some(value=>value!==null&&(!Number.isInteger(value)||value<0||value>lane.identities.length)))fail('Malformed protected lifecycle failure record');
 const {executed,passed,failed,skipped,attempts}=record.counts;
 if(executed===null?[passed,failed,skipped,attempts].some(value=>value!==null):[passed,failed,skipped,attempts].some(value=>value===null)||attempts!==passed+failed+skipped||attempts>executed)fail('Inconsistent protected failure counts');
 return record;
}
export async function qualifyLanes({manifest,provenance,runLane,expectedPlaywright}){
 validateManifest(manifest);const receipts=[];for(const lane of manifest.lanes){const receipt=validateLaneReceipt(lane,await runLane(lane),provenance);if(expectedPlaywright&&receipt.playwright!==expectedPlaywright)fail('Installed Playwright version mismatch');receipts.push(receipt);}
 return {version:1,scope:SCOPE,scopeContents:Object.keys(lanes),scopeCompatibilityIdentifier:true,deliveredSlice:'passed',overallMilestone:'incomplete',fullParity:'incomplete',releaseEligible:false,provenance,identities:receipts.reduce((sum,r)=>sum+r.results.length,0),lanes:receipts,pending:manifest.pending,limits:manifest.limits,producer:'local owned-fixture development evidence; no hosted release provenance'};
}
export function snapshotSource(root){
 const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
 const roots=['tunes/server','tunes/shared','tunes/auth-runtime','tunes/migrations','explorers-earth/src','explorers-earth/public','explorers-earth/e2e/replatform','explorers-earth/e2e/setup'];
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean);
 const tracked=git(['ls-files',...roots]);
 const additions=git(['ls-files','--others','--exclude-standard',...roots]).filter(path=>path!==MANIFEST);
 const ignored=git(['ls-files','--others','--ignored','--exclude-standard',...roots,':(exclude)tunes/auth-runtime/node_modules']);
 if(additions.length||ignored.length)fail('Untracked runtime dependency is outside reviewed source inventory');
 const migrationFiles=readdirSync(join(root,'tunes/migrations')).filter(path=>path.endsWith('.sql')).map(path=>`tunes/migrations/${path}`).sort();
 if(!migrationFiles.length||!equal(migrationFiles,tracked.filter(path=>path.startsWith('tunes/migrations/')&&path.endsWith('.sql')).sort()))fail('Migration disk/tracked inventory mismatch');
 const authority=['music-uat-database','music-fixture-secret','music-vitest-evidence','music-output-redaction','music-qualification-postgres'].map(name=>`tunes/scripts/${name}.ts`).concat(['tunes/scripts/music-local-private-files.ps1','tunes/scripts/windows-write-through.ps1']);
 git(['ls-files','--error-unmatch',...authority]);
 const placesHelper='tunes/scripts/places-browser-support.ts';
 git(['ls-files','--error-unmatch',placesHelper]);
 const frontendRoot=git(['ls-files','explorers-earth']).filter(path=>path.split('/').length===2);
 if(git(['ls-files','--others','--exclude-standard','explorers-earth']).some(path=>path.split('/').length===2))fail('Untracked frontend entry/configuration dependency');
 const paths=[...new Set([...tracked,MANIFEST,'scripts/replatform-e2e.mjs','scripts/replatform-e2e.test.mjs','scripts/node-owned-npm.test.mjs','package.json','package-lock.json','tunes/package.json','tunes/package-lock.json','explorers-earth/package.json','explorers-earth/package-lock.json','explorers-earth/playwright.config.ts','tunes/scripts/profile-browser-fixture.ts','tunes/scripts/books-browser-fixture.ts','tunes/scripts/movies-browser-fixture.ts','tunes/scripts/games-browser-fixture.ts','tunes/scripts/canonical-music-browser-fixture.ts','tunes/scripts/protected-browser-receipt.ts','tunes/scripts/lifecycle-browser-guards.ts','tunes/scripts/lifecycle-browser-support.ts','tunes/scripts/places-browser-support.ts'])].sort();
 const dependencies=new Set([...paths,...authority,...frontendRoot]);
 // Follow relative source imports from the runner/helper roots, including additions
 // ignored by Git. Every resolved dependency must be tracked or an explicit overlay.
 const reviewed=new Set([...tracked,...frontendRoot,...authority,placesHelper]);
 const overlay=new Set(['tunes/scripts/profile-browser-fixture.ts','tunes/scripts/books-browser-fixture.ts','tunes/scripts/movies-browser-fixture.ts','tunes/scripts/games-browser-fixture.ts','tunes/scripts/canonical-music-browser-fixture.ts','tunes/scripts/protected-browser-receipt.ts','tunes/scripts/lifecycle-browser-support.ts','tunes/scripts/lifecycle-browser-guards.ts']);
 const queue=[...authority,...overlay];const scanned=new Set();
 while(queue.length){const path=queue.pop();if(scanned.has(path)||! /\.(?:[cm]?js|tsx?)$/.test(path))continue;scanned.add(path);
  const text=readFileSync(join(root,path),'utf8');const imports=/\b(?:import|export)[\s\S]*?\bfrom\s+['"](\.[^'"]+)['"]|\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)|\bimport\s+['"](\.[^'"]+)['"]/g;
  for(const match of text.matchAll(imports)){const imported=resolve(root,dirname(path),match[1]??match[2]??match[3]);const candidates=[imported,...['.ts','.tsx','.js','.mjs','/index.ts','/index.tsx','/index.js'].map(suffix=>imported+suffix),imported.replace(/\.js$/,'.ts')];const found=candidates.find(candidate=>existsSync(candidate)&&lstatSync(candidate).isFile());if(!found)fail('Missing relative executed dependency');const dependency=relative(root,found).replaceAll('\\','/');if(dependency.startsWith('../')||lstatSync(found).isSymbolicLink()||(!reviewed.has(dependency)&&!overlay.has(dependency)))fail('Unreviewed relative executed dependency');dependencies.add(dependency);queue.push(dependency);}
 }
 const closure=[...new Set([...dependencies,...['','tunes/','explorers-earth/','tunes/auth-runtime/'].map(prefix=>`${prefix}node_modules/.package-lock.json`)])].sort();
 const hashes=Object.fromEntries(closure.map(path=>[path,createHash('sha256').update(readFileSync(join(root,path))).digest('hex')]));
 const dirty=Boolean(execFileSync('git',['status','--porcelain=v1','--untracked-files=normal'],{cwd:root,encoding:'utf8',windowsHide:true}).trim());
 return {provenance:{commit,sourceHash:digest(hashes),manifestHash:hashes[MANIFEST],dirty},hashes};
}
export function validateLockedInstall(root,prefix){
 const directory=join(root,prefix),lock=JSON.parse(readFileSync(join(directory,'package-lock.json'))),installed=JSON.parse(readFileSync(join(directory,'node_modules/.package-lock.json'))),pkg=JSON.parse(readFileSync(join(directory,'package.json')));
 for(const [path,value] of Object.entries(installed.packages??{})){if(path&&(!lock.packages?.[path]||lock.packages[path].version!==value.version||lock.packages[path].integrity!==value.integrity))fail(`Installed lock metadata mismatch in ${prefix||'root'}`);}
 for(const name of Object.keys({...pkg.dependencies,...pkg.devDependencies})){const key=`node_modules/${name}`;if(!installed.packages?.[key]||!lock.packages?.[key]||installed.packages[key].version!==lock.packages[key].version)fail(`Required locked dependency absent in ${prefix||'root'}`);}
 return createHash('sha256').update(readFileSync(join(directory,'package-lock.json'))).digest('hex');
}
export function capturedChild(executable,args,cwd,env,capability,abortSignal){
 return new Promise(done=>{let stdout='',stderr='',error=null,overflow=false,requestedSignal=null;const child=spawn(executable,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
 const cancel=signal=>{requestedSignal=typeof signal==='string'?signal:'SIGTERM';if(child.connected)child.send({type:'replatform-cancel',capability},()=>{});};
 const onInterrupt=()=>cancel('SIGINT'),onTerminate=()=>cancel('SIGTERM');
 process.once('SIGINT',onInterrupt);process.once('SIGTERM',onTerminate);abortSignal?.addEventListener('abort',onTerminate,{once:true});
 const append=(stream,chunk)=>{if(overflow)return;const next=(stream==='out'?stdout:stderr)+chunk;if(Buffer.byteLength(next)>8*1024*1024){overflow=true;error='Child output overflow';cancel('SIGTERM');return;}if(stream==='out')stdout=next;else stderr=next;};
 child.stdout.on('data',chunk=>append('out',chunk));child.stderr.on('data',chunk=>append('err',chunk));child.once('error',()=>error='Child could not start');child.once('close',(status,signal)=>{process.removeListener('SIGINT',onInterrupt);process.removeListener('SIGTERM',onTerminate);abortSignal?.removeEventListener('abort',onTerminate);done({status,signal:requestedSignal??signal,error,stdout,stderr});});
 });
}
export async function main(args=process.argv.slice(2)){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');assertEnvironment(process.env);const options=parseArguments(args);
 if(process.versions.node!=='24.21.0')fail('Protected qualification requires Node24.21.0');
 const manifest=JSON.parse(readFileSync(join(root,MANIFEST)));validateManifest(manifest);
 const source=snapshotSource(root),locks=Object.fromEntries(['','tunes','explorers-earth','tunes/auth-runtime'].map(prefix=>[prefix||'root',validateLockedInstall(root,prefix)]));
 const npmOwner=probeNodeOwnedNpm(process.execPath),npm=npmOwner.npmVersion;
 const {chromium}=await import(pathToFileURL(join(root,'explorers-earth/node_modules/playwright-core/index.mjs')).href);
 if(!existsSync(chromium.executablePath()))fail('Installed Chromium unavailable');const probe=await chromium.launch({headless:true});const browserVersion=probe.version();await probe.close();
 mkdirSync(options.receiptDirectory,{mode:0o700});const startedAt=new Date().toISOString();const children=[];
 try{
  const playwright=JSON.parse(readFileSync(join(root,'explorers-earth/node_modules/playwright-core/package.json'))).version;
  for(const [name,target] of [['auth','tsx scripts/profile-browser-fixture.ts --suite auth'],['profile','tsx scripts/profile-browser-fixture.ts'],['lifecycle','tsx scripts/profile-browser-fixture.ts --suite lifecycle'],['music','tsx scripts/canonical-music-browser-fixture.ts'],['places','tsx scripts/profile-browser-fixture.ts --suite places'],['place-links','tsx scripts/profile-browser-fixture.ts --suite place-links']])if(JSON.parse(readFileSync(join(root,'tunes/package.json'))).scripts[`explorers:test:${name}-browser`]!==target)fail('Protected package runner target changed');
  const result=await qualifyLanes({manifest,provenance:source.provenance,expectedPlaywright:playwright,runLane:async lane=>{
   if(!equal(snapshotSource(root).provenance,source.provenance))fail('Source changed before lane execution');
   const directory=join(options.receiptDirectory,lane.name);mkdirSync(directory,{mode:0o700});const capability=randomBytes(32).toString('hex');
   writeFileSync(join(directory,'.protected-owned.json'),JSON.stringify({version:1,lane:lane.name,capability,provenance:source.provenance}),{mode:0o600,flag:'wx'});
   const suffix=['--ack',ACK,'--receipt-directory',directory,'--receipt-capability',capability];
   const selector=['auth','lifecycle','places','place-links'].includes(lane.name)?['--suite',lane.name]:[];
   const childArgs=['--import',pathToFileURL(join(root,'tunes/node_modules/tsx/dist/loader.mjs')).href,join(root,lane.runner),...selector,...suffix];
   const child=await capturedChild(process.execPath,childArgs,root,{...process.env},capability);const childRecord={lane:lane.name,status:child.status,signal:child.signal,error:child.error};children.push(childRecord);
   if(child.status!==0){const diagnostics=child.stderr.split(/\r?\n/).filter(line=>/^(?:Error(?: \[[A-Z_]+\])?:|[^\n]*: ERROR:|(?:Profile|Books|Movies) E2E fixture failed:)/.test(line)).slice(0,3).map(line=>line.replaceAll(capability,'<owned-capability>').replace(/postgres(?:ql)?:\/\/\S+|(?:Bearer\s+)\S+|[A-Za-z0-9_-]{32,}/g,'<redacted>'));for(const line of diagnostics)process.stderr.write(`${lane.name}: ${line}\n`);}
   const receiptPath=join(directory,'receipt.json');if(existsSync(receiptPath))child.receipt=JSON.parse(readFileSync(receiptPath,'utf8'));
   const lifecycleFailurePath=join(directory,'lifecycle-failure.json');if(existsSync(lifecycleFailurePath)){if(child.status===0)fail('Lifecycle failure cannot qualify a successful child');childRecord.lifecycleFailure=validateLifecycleFailureRecord(lane,JSON.parse(readFileSync(lifecycleFailurePath,'utf8')),source.provenance);}
   const failurePath=join(directory,'failure.json');if(existsSync(failurePath))childRecord.failure=validateFailureRecord(lane,JSON.parse(readFileSync(failurePath,'utf8')),source.provenance,child);
   const topologyPath=join(directory,'topology.json');if(child.status===0&&existsSync(topologyPath)){child.topology=JSON.parse(readFileSync(topologyPath,'utf8'));childRecord.topology=validateMusicTopology(child.topology,source.provenance,child.receipt?.authority??{});}
   if(!equal(snapshotSource(root).provenance,source.provenance))fail('Source changed during lane execution');
   return child;
  }});
  result.sourceHashes=source.hashes;result.tools={node:process.versions.node,npm,nodeExecutable:npmOwner.nodeExecutable,npmCli:npmOwner.npmCli,npmPackage:npmOwner.npmPackage,playwright,chromium:browserVersion,locks};result.startedAt=startedAt;result.endedAt=new Date().toISOString();result.children=children;
  writeFileSync(join(options.receiptDirectory,'qualification.json'),JSON.stringify(result,null,2),{mode:0o600,flag:'wx'});
  process.stdout.write(`Delivered slice passed: ${result.identities} identities. Overall milestone/full parity incomplete. Receipt: ${join(options.receiptDirectory,'qualification.json')}\n`);
  return result;
 }catch(error){writeFileSync(join(options.receiptDirectory,'qualification.json'),JSON.stringify({version:1,scope:SCOPE,scopeContents:Object.keys(lanes),scopeCompatibilityIdentifier:true,deliveredSlice:'failed',overallMilestone:'incomplete',fullParity:'incomplete',releaseEligible:false,provenance:source.provenance,children,error:'Protected lane or qualification contract failed',pending:manifest.pending},null,2),{mode:0o600,flag:'wx'});throw error;}
 finally{for(const lane of manifest.lanes){const marker=join(options.receiptDirectory,lane.name,'.protected-owned.json');if(existsSync(marker))unlinkSync(marker);}}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{process.stderr.write(`Scoped qualification failed: ${error.message}\n`);process.exitCode=1;});
