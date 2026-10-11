import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import type {AttestationExpectedBinding} from '../../deployment/platform-attestation-evidence';
import {observeNativeCandidateAttestation} from '../../deployment/platform-native-attestation';

// Every filesystem/process/provenance boundary below is SYNTHETIC. No child,
// archive download, real signature verification, or release qualification occurs.
const fake=vi.hoisted(()=>({files:new Map<string,Buffer>(),stats:new Map<string,any>(),commands:[] as any[],descriptors:[] as {path:string;closes:number}[],stageFault:'' as ''|'read'|'stat',env:{GH_TOKEN:'SYNTHETIC_SECRET'} as Record<string,string>,version:'gh version 2.87.3 (2026-02-23)\n',output:Buffer.alloc(0),exit:0,hang:false,error:false,overflow:0,stderrOverflow:false,killSettles:true,cleanup:false,replace:false,archiveChanged:false,directoryChanged:false,gzipError:false,tar:Buffer.alloc(0),reads:0,closed:0,kill:0}));
vi.mock('node:process',()=>({platform:'linux',arch:'x64',getuid:()=>1001,env:fake.env}));
vi.mock('node:zlib',()=>({gunzipSync:(_b:Buffer,options:any)=>{expect(options.maxOutputLength).toBe(64*1024*1024);if(fake.gzipError)throw new Error('SECRET');return fake.tar;}}));
vi.mock('node:crypto',async importOriginal=>{
 const original=await importOriginal<typeof import('node:crypto')>();
 return {...original,createHash:(algorithm:string)=>{
  const hash=original.createHash(algorithm);let archive=false;
  const wrapper={update(bytes:any){archive=Buffer.isBuffer(bytes)&&bytes.toString()==='SYNTHETIC_OFFICIAL_ARCHIVE';hash.update(bytes);return wrapper;},digest(encoding:any){return archive?'c6e5537631fca45f277ef405ce8751d139b491e9402cc20891a003525a8773b2':hash.digest(encoding);}};
  return wrapper;
 }};
});
vi.mock('node:fs/promises',()=>({
 lstat:vi.fn(async(path:string)=>{const stat=fake.stats.get(path);if(!stat)throw new Error('SECRET missing');return {...stat};}),
 realpath:vi.fn(async(path:string)=>path),
 mkdtemp:vi.fn(async(prefix:string)=>{const p=prefix+'synthetic';fake.stats.set(p,stat('directory',1001,0o700));return p;}),
 mkdir:vi.fn(async(path:string,options:any)=>{fake.stats.set(path,stat('directory',1001,options.mode));}),
 open:vi.fn(async(path:string,flags:number,mode?:number)=>{
  if(mode!==undefined){if(fake.files.has(path))throw new Error('SECRET exists');fake.files.set(path,Buffer.alloc(0));fake.stats.set(path,stat('file',1001,mode));}
  if(!fake.stats.has(path))throw new Error('SECRET missing');
  const original=fake.stats.get(path),descriptor={path,closes:0};fake.descriptors.push(descriptor);
  const fault=(kind:'read'|'stat')=>{if(mode===undefined&&path.endsWith('/gh/config.yml')&&fake.stageFault===kind){fake.stageFault='';throw new Error('SECRET staging '+kind);}};
  return {stat:async()=>{fault('stat');return {...original};},read:async(buffer:Buffer,offset:number,length:number,position:number)=>{fault('read');fake.reads++;const source=fake.files.get(path)!,count=Math.max(0,Math.min(length,source.length-position));source.copy(buffer,offset,position,position+count);return {bytesRead:count,buffer};},writeFile:async(bytes:Buffer)=>{fake.files.set(path,Buffer.from(bytes));original.size=bytes.length;},close:async()=>{fake.closed++;descriptor.closes++;}};
 }),
 unlink:vi.fn(async(path:string)=>{if(fake.cleanup)throw new Error('SECRET retained');fake.files.delete(path);fake.stats.delete(path);}),
 rmdir:vi.fn(async(path:string)=>{if(fake.cleanup||[...fake.stats.keys()].some(p=>p.startsWith(path+'/')))throw new Error('SECRET retained');fake.stats.delete(path);}),
}));
vi.mock('node:child_process',()=>({spawn:vi.fn((executable:string,args:string[],options:any)=>{
 const child=new EventEmitter() as any;child.pid=456;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{fake.kill++;if(fake.killSettles)queueMicrotask(()=>child.emit('close',null,'SIGKILL'));return true;};
 fake.commands.push({executable,args,options,child});
 queueMicrotask(()=>{
  if(fake.hang)return;
  if(fake.error){child.emit('error',new Error('SYNTHETIC_SECRET'));child.emit('close',null,null);return;}
  const isVersion=args[0]==='--version';
  child.stdout.emit('data',isVersion?Buffer.from(fake.version):fake.overflow?Buffer.alloc(fake.overflow):fake.output);
  child.stderr.emit('data',!isVersion&&fake.stderrOverflow?Buffer.alloc(65537):Buffer.from('SYNTHETIC_SECRET raw stderr'));
  if(!isVersion&&fake.replace)fake.stats.get('/usr/bin/gh').ino++;
  if(!isVersion&&fake.archiveChanged)fake.stats.get(archivePath).ino++;
  if(!isVersion&&fake.directoryChanged)fake.stats.get('/opt/explorers/attestation-custody/observe-synthetic/gh').ino++;
  child.emit('close',isVersion?0:fake.exit,null);
 });return child;
})}));
const archivePath='/opt/explorers/toolchain/gh_2.87.3_linux_amd64.tar.gz';
const registryPath='/opt/explorers/toolchain/registry-auth.json';
const bytes=Buffer.from('synthetic subject bytes');
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function stat(kind:string,uid=0,mode=0o755):any{return {dev:1,ino:10,size:0,uid,mode,mtimeMs:1,ctimeMs:1,nlink:1,isFile:()=>kind==='file',isDirectory:()=>kind==='directory',isSymbolicLink:()=>kind==='link'};}
function tarEntry(name:string,payload:Buffer,type='0'):Buffer{
 const header=Buffer.alloc(512);header.write(name);header.write('0000755\0',100);header.write('0000000\0',108);header.write('0000000\0',116);header.write(payload.length.toString(8).padStart(11,'0')+'\0',124);header.write('00000000000\0',136);header.fill(32,148,156);header.write(type,156);header.write('ustar\0',257);header.write('00',263);
 const sum=header.reduce((n,b)=>n+b,0);header.write(sum.toString(8).padStart(6,'0')+'\0 ',148);
 return Buffer.concat([header,payload,Buffer.alloc((512-payload.length%512)%512)]);
}
const binary=Buffer.from('synthetic exact gh binary');
function replaceBytes(path:string,b:Buffer):void{fake.files.set(path,b);fake.stats.get(path).size=b.length;}
function binding(name='custody-envelope.json',digest=sha(bytes)):AttestationExpectedBinding{return {repository:'tandavkrishna27/explorers.earth',repositoryId:'1171328761',ref:'refs/heads/codex/unified-replatform',sourceCommit:'a'.repeat(40),signerWorkflowPath:'.github/workflows/platform-candidate.yml',signerDigest:'b'.repeat(40),producerRunId:'12345',producerRunAttempt:'2',subjectName:name,subjectSha256:digest};}
function fixture(expected:AttestationExpectedBinding,change:(entry:any)=>void=()=>{}):Buffer{
 const entries=JSON.parse(readFileSync(new URL('./fixtures/platform-attestation/gh-2.87.3-verified-fixture.json',import.meta.url)).toString());const e=entries[0],c=e.verificationResult.signature.certificate;
 const repo='https://github.com/'+expected.repository,signer=repo+'/'+expected.signerWorkflowPath+'@'+expected.ref,invocation=repo+'/actions/runs/'+expected.producerRunId+'/attempts/'+expected.producerRunAttempt;
 Object.assign(c,{issuer:'https://token.actions.githubusercontent.com',subjectAlternativeName:signer,buildSignerURI:signer,buildConfigURI:signer,buildSignerDigest:expected.signerDigest,buildConfigDigest:expected.signerDigest,sourceRepositoryDigest:expected.sourceCommit,githubWorkflowSHA:expected.sourceCommit,sourceRepositoryURI:repo,sourceRepositoryIdentifier:expected.repositoryId,sourceRepositoryRef:expected.ref,githubWorkflowRef:expected.ref,githubWorkflowRepository:expected.repository,runInvocationURI:invocation});
 const s=e.verificationResult.statement,d=s.predicate.buildDefinition;s.subject=[{name:expected.subjectName,digest:{sha256:expected.subjectSha256}}];Object.assign(d.externalParameters.workflow,{path:expected.signerWorkflowPath,ref:expected.ref,repository:repo});d.internalParameters.github.repository_id=expected.repositoryId;d.resolvedDependencies=[{uri:'git+'+repo+'@'+expected.ref,digest:{gitCommit:expected.sourceCommit}}];s.predicate.runDetails.metadata.invocationId=invocation;e.attestation.bundle.dsseEnvelope.payload=Buffer.from(JSON.stringify(s)).toString('base64');change(e);return Buffer.from(JSON.stringify(entries));
}
function observe(subject:any={kind:'file',fileName:'custody-envelope.json',bytes},expected:any=binding()){
 return observeNativeCandidateAttestation(subject,expected);
}
beforeEach(()=>{
 vi.useRealTimers();fake.files.clear();fake.stats.clear();fake.commands=[];fake.descriptors=[];fake.stageFault='';for(const key of Object.keys(fake.env))delete fake.env[key];fake.env.GH_TOKEN='SYNTHETIC_SECRET';Object.assign(fake,{version:'gh version 2.87.3 (2026-02-23)\n',output:fixture(binding()),exit:0,hang:false,error:false,overflow:0,stderrOverflow:false,killSettles:true,cleanup:false,replace:false,archiveChanged:false,directoryChanged:false,gzipError:false,reads:0,closed:0,kill:0});
 for(const p of ['/','/usr','/usr/bin','/opt','/opt/explorers','/opt/explorers/toolchain'])fake.stats.set(p,stat('directory'));
 fake.stats.set('/opt/explorers/attestation-custody',stat('directory',1001,0o700));
 for(const [p,b,uid,mode] of [[archivePath,Buffer.from('SYNTHETIC_OFFICIAL_ARCHIVE'),0,0o644],['/usr/bin/gh',binary,0,0o755],[registryPath,Buffer.from(JSON.stringify({auths:{'ghcr.io':{auth:Buffer.from('runner:SYNTHETIC_REGISTRY_SECRET').toString('base64')}}})),1001,0o600]] as const){fake.files.set(p,b);fake.stats.set(p,{...stat('file',uid,mode),size:b.length});}
 fake.tar=Buffer.concat([tarEntry('gh_2.87.3_linux_amd64/bin/gh',binary),Buffer.alloc(1024)]);
});
afterEach(()=>vi.useRealTimers());

describe('synthetic unqualified native attestation boundary',()=>{
 it('exports the bounded observer without a caller executor factory',async()=>{
  const module=await import('../../deployment/platform-native-attestation');
  expect(module.observeNativeCandidateAttestation).toBeTypeOf('function');
  expect(Object.keys(module).sort()).toEqual(['observeNativeCandidateAttestation']);
 });
 it('executes the exact protected child and real parser, settles cleanup, and remains unqualified',async()=>{
  const result=await observe();expect(result).toMatchObject({status:'NATIVE_ATTESTATION_SUBJECT_OBSERVED_UNQUALIFIED',releaseQualified:false,subjectName:'custody-envelope.json',subjectSha256:sha(bytes),runId:'12345',runAttempt:'2'});expect(Object.isFrozen(result)).toBe(true);
  expect(fake.commands).toHaveLength(2);const command=fake.commands[1];expect(command.executable).toBe('/usr/bin/gh');expect(command.options).toMatchObject({shell:false,stdio:['ignore','pipe','pipe']});expect(command.args).toEqual(['attestation','verify','/opt/explorers/attestation-custody/observe-synthetic/custody-envelope.json','--repo','tandavkrishna27/explorers.earth','--signer-workflow','tandavkrishna27/explorers.earth/.github/workflows/platform-candidate.yml','--source-ref','refs/heads/codex/unified-replatform','--source-digest','a'.repeat(40),'--signer-digest','b'.repeat(40),'--deny-self-hosted-runners','--cert-oidc-issuer','https://token.actions.githubusercontent.com','--predicate-type','https://slsa.dev/provenance/v1','--digest-alg','sha256','--format','json','--hostname','github.com']);
  expect(command.options.env.GH_TOKEN).toBe('SYNTHETIC_SECRET');expect(command.options.env.GH_NO_UPDATE_NOTIFIER).toBe('1');expect(command.args.join(' ')).not.toContain('SECRET');expect([...fake.stats.keys()].some(p=>p.includes('observe-synthetic'))).toBe(false);expect(fake.closed).toBeGreaterThan(0);
 });
 it.each(['api','web'] as const)('constructs only immutable %s OCI subjects with private auths-only config',async image=>{
  const digest='c'.repeat(64),name=`ghcr.io/tandavkrishna27/explorers-${image}`,expected=binding(name,digest);fake.output=fixture(expected);expect((await observe({kind:'oci',image,manifestDigest:'sha256:'+digest},expected)).releaseQualified).toBe(false);expect(fake.commands[1].args[2]).toBe(`oci://${name}@sha256:${digest}`);
 });
 it.each(['release-manifest.json','custody-envelope.json'] as const)('owns copied %s bytes',async fileName=>{const input=Buffer.from(bytes),expected=binding(fileName);fake.output=fixture(expected);const pending=observe({kind:'file',fileName,bytes:input},expected);input.fill(0);expect((await pending).subjectSha256).toBe(sha(bytes));});
 it.each([
  ['version',()=>{fake.version='gh version 2.87.2\n';},'NATIVE_ATTESTATION_GH_VERSION_INVALID'],
  ['writable ancestry',()=>{fake.stats.get('/usr').mode=0o777;},'NATIVE_ATTESTATION_PROTECTED_PATH_INVALID'],
  ['symlink executable',()=>{fake.stats.set('/usr/bin/gh',stat('link'));},'NATIVE_ATTESTATION_PROTECTED_PATH_INVALID'],
  ['missing official archive',()=>{fake.stats.delete(archivePath);},'NATIVE_ATTESTATION_PROVENANCE_UNAVAILABLE'],
  ['wrong official bytes',()=>{replaceBytes(archivePath,Buffer.from('counterfeit'));},'NATIVE_ATTESTATION_PROVENANCE_INVALID'],
  ['wrong executable bytes',()=>{replaceBytes('/usr/bin/gh',Buffer.from('counterfeit'));},'NATIVE_ATTESTATION_EXECUTABLE_MISMATCH'],
  ['bounded gzip',()=>{fake.gzipError=true;},'NATIVE_ATTESTATION_ARCHIVE_INVALID'],
  ['duplicate tar entry',()=>{fake.tar=Buffer.concat([tarEntry('gh_2.87.3_linux_amd64/bin/gh',binary),tarEntry('gh_2.87.3_linux_amd64/bin/gh',binary),Buffer.alloc(1024)]);},'NATIVE_ATTESTATION_ARCHIVE_INVALID'],
  ['tar symlink',()=>{fake.tar=Buffer.concat([tarEntry('gh_2.87.3_linux_amd64/bin/gh',binary,'2'),Buffer.alloc(1024)]);},'NATIVE_ATTESTATION_ARCHIVE_INVALID'],
  ['tar traversal',()=>{fake.tar=Buffer.concat([tarEntry('../bin/gh',binary),Buffer.alloc(1024)]);},'NATIVE_ATTESTATION_ARCHIVE_INVALID'],
  ['ambient host',()=>{fake.env.GH_HOST='evil';},'NATIVE_ATTESTATION_ENVIRONMENT_INVALID'],
  ['ambient trust',()=>{fake.env.SSL_CERT_FILE='evil';},'NATIVE_ATTESTATION_ENVIRONMENT_INVALID'],
  ['ambient config',()=>{fake.env.DOCKER_CONFIG='evil';},'NATIVE_ATTESTATION_ENVIRONMENT_INVALID'],
  ['missing token',()=>{delete fake.env.GH_TOKEN;},'NATIVE_ATTESTATION_AUTH_UNAVAILABLE'],
 ] as const)('denies %s before further work',async(_name,change,code)=>{change();await expect(observe()).rejects.toMatchObject({message:code,code});expect(fake.commands.length).toBeLessThanOrEqual(code.endsWith('VERSION_INVALID')?1:0);});
 it.each(['credsStore','credHelpers','extra'])('rejects registry %s helper/config injection',async key=>{replaceBytes(registryPath,Buffer.from(JSON.stringify({auths:{'ghcr.io':{auth:'cnVubmVyOnRva2Vu'}},[key]:key==='credHelpers'?{'ghcr.io':'evil'}:'evil'})));await expect(observe({kind:'oci',image:'api',manifestDigest:'sha256:'+'c'.repeat(64)},binding('ghcr.io/tandavkrishna27/explorers-api','c'.repeat(64)))).rejects.toMatchObject({code:'NATIVE_ATTESTATION_REGISTRY_AUTH_INVALID'});expect(fake.commands).toHaveLength(0);});
 it('rejects missing registry auth',async()=>{fake.stats.delete(registryPath);await expect(observe({kind:'oci',image:'api',manifestDigest:'sha256:'+'c'.repeat(64)},binding('ghcr.io/tandavkrishna27/explorers-api','c'.repeat(64)))).rejects.toMatchObject({code:'NATIVE_ATTESTATION_REGISTRY_AUTH_UNAVAILABLE'});});
 it.each([
  [{kind:'file',fileName:'evil.json',bytes},binding()],
  [{kind:'file',fileName:'custody-envelope.json',bytes:Buffer.alloc(131073)},binding()],
  [{kind:'file',fileName:'custody-envelope.json',bytes},binding('wrong')],
  [{kind:'file',fileName:'custody-envelope.json',bytes},binding('custody-envelope.json','c'.repeat(64))],
  [{kind:'file',fileName:'custody-envelope.json',bytes,executor:true},binding()],
  [{kind:'oci',image:'api',manifestDigest:'latest'},binding()],
  [{kind:'oci',image:'api',manifestDigest:'sha256:'+'c'.repeat(64)},binding('ghcr.io/tandavkrishna27/explorers-api','d'.repeat(64))],
 ])('rejects input mismatch %# without child invocation',async(subject,expected)=>{await expect(observe(subject,expected)).rejects.toThrow();expect(fake.commands).toHaveLength(0);});
 it.each(['repository','ref','sourceCommit','signerDigest'])('rejects expected %s before work',async key=>{await expect(observe(undefined,{...binding(),[key]:'evil'})).rejects.toMatchObject({code:'ATTESTATION_EXPECTED_BINDING_INVALID'});expect(fake.commands).toHaveLength(0);});
 it.each(['subject','expected'])('does not execute hostile %s getters',async which=>{let reads=0;const subject:any={kind:'file',fileName:'custody-envelope.json',bytes},expected:any=binding();Object.defineProperty(which==='subject'?subject:expected,which==='subject'?'bytes':'repository',{enumerable:true,get(){reads++;throw new Error('SECRET');}});await expect(observe(subject,expected)).rejects.toThrow();expect(reads).toBe(0);expect(fake.commands).toHaveLength(0);});
 it('rejects proxies before traps',async()=>{let reads=0;const proxy=new Proxy({}, {ownKeys(){reads++;throw new Error('SECRET');}});await expect(observe(proxy)).rejects.toThrow();expect(reads).toBe(0);});
 it('perfect stdout cannot override nonzero child exit',async()=>{fake.exit=1;await expect(observe()).rejects.toMatchObject({code:'NATIVE_ATTESTATION_CHILD_EXIT_INVALID'});});
 it('replacement executable denies observation',async()=>{fake.replace=true;await expect(observe()).rejects.toMatchObject({code:'NATIVE_ATTESTATION_CUSTODY_CHANGED'});});
 it('replacement archive denies observation',async()=>{fake.archiveChanged=true;await expect(observe()).rejects.toMatchObject({code:'NATIVE_ATTESTATION_CUSTODY_CHANGED'});});
 it('replacement private configuration directory denies observation',async()=>{fake.directoryChanged=true;await expect(observe()).rejects.toMatchObject({code:'NATIVE_ATTESTATION_CUSTODY_CHANGED'});});
 it('cleanup retention denies observation without leaking paths/secrets',async()=>{fake.cleanup=true;await expect(observe()).rejects.toMatchObject({message:'NATIVE_ATTESTATION_CUSTODY_RETAINED',code:'NATIVE_ATTESTATION_CUSTODY_RETAINED'});});
 it.each([
  ['missing certificate',(e:any)=>{delete e.verificationResult.signature.certificate;},'ATTESTATION_RUN_ATTEMPT_BINDING_UNAVAILABLE'],
  ['cross attempt',(e:any)=>{e.verificationResult.signature.certificate.runInvocationURI=e.verificationResult.signature.certificate.runInvocationURI.replace('/attempts/2','/attempts/3');},'ATTESTATION_RUN_ATTEMPT_BINDING_MISMATCH'],
  ['issuer',(e:any)=>{e.verificationResult.signature.certificate.issuer='SECRET';},'ATTESTATION_OUTPUT_SCHEMA_INVALID'],
  ['source',(e:any)=>{e.verificationResult.signature.certificate.sourceRepositoryDigest='c'.repeat(40);},'ATTESTATION_OUTPUT_SCHEMA_INVALID'],
 ])('real parser denies %s after successful child',async(_name,change,code)=>{fake.output=fixture(binding(),change);await expect(observe()).rejects.toMatchObject({code});expect(fake.commands).toHaveLength(2);});
 it('overflow kills original child and waits for close before cleanup',async()=>{fake.overflow=1048577;await expect(observe()).rejects.toMatchObject({code:'NATIVE_ATTESTATION_STDOUT_LIMIT'});expect(fake.kill).toBe(1);});
 it('timeout kills and settles original child',async()=>{vi.useFakeTimers();fake.hang=true;const pending=observe();const assertion=expect(pending).rejects.toMatchObject({code:'NATIVE_ATTESTATION_CHILD_TIMEOUT'});await vi.advanceTimersByTimeAsync(120000);await assertion;expect(fake.kill).toBe(1);});
 it('child error does not expose raw error or stdout',async()=>{fake.error=true;await expect(observe()).rejects.toMatchObject({message:'NATIVE_ATTESTATION_CHILD_ERROR'});});
 it('rejects Buffer own getters before reading them',async()=>{let reads=0;const b=Buffer.from(bytes);Object.defineProperty(b,'length',{get(){reads++;throw new Error('SECRET');}});await expect(observe({kind:'file',fileName:'custody-envelope.json',bytes:b})).rejects.toMatchObject({code:'NATIVE_ATTESTATION_SUBJECT_INVALID'});expect(reads).toBe(0);});
 it('stderr overflow kills and settles child',async()=>{fake.stderrOverflow=true;await expect(observe()).rejects.toMatchObject({code:'NATIVE_ATTESTATION_STDERR_LIMIT'});expect(fake.kill).toBe(1);});
 it('unsettled original child retains custody and preserves the first safe error',async()=>{vi.useFakeTimers();fake.hang=true;fake.killSettles=false;const assertion=expect(observe()).rejects.toMatchObject({code:'NATIVE_ATTESTATION_CHILD_TIMEOUT',custodyRetained:true});await vi.advanceTimersByTimeAsync(125000);await assertion;expect([...fake.stats.keys()].some(p=>p.includes('observe-synthetic'))).toBe(true);});
 it('exit event without close cannot produce an observation',async()=>{fake.hang=true;const pending=observe();let complete=false;void pending.then(()=>{complete=true;},()=>{complete=true;});for(let n=0;n<1000&&!fake.commands.length;n++)await Promise.resolve();const child=fake.commands[0].child;child.stdout.emit('data',Buffer.from(fake.version));child.emit('exit',0,null);for(let n=0;n<10;n++)await Promise.resolve();expect(complete).toBe(false);child.emit('close',0,null);for(let n=0;n<1000&&fake.commands.length<2;n++)await Promise.resolve();fake.commands[1].child.stdout.emit('data',fake.output);fake.commands[1].child.emit('close',0,null);expect((await pending).releaseQualified).toBe(false);});
 it.each(['read','stat'] as const)('closes every original descriptor once on partial staging %s failure',async fault=>{fake.stageFault=fault;await expect(observe()).rejects.toMatchObject({code:'NATIVE_ATTESTATION_EXECUTION_FAILED',message:'NATIVE_ATTESTATION_EXECUTION_FAILED',custodyRetained:true});expect(fake.commands).toHaveLength(0);const staging=fake.descriptors.filter(d=>d.path.endsWith('/gh/config.yml'));expect(staging).toHaveLength(2);expect(fake.descriptors.every(d=>d.closes===1)).toBe(true);expect(fake.files.has('/opt/explorers/attestation-custody/observe-synthetic/gh/config.yml')).toBe(true);});
});
