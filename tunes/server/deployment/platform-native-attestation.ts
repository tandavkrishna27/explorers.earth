import * as fs from 'node:fs/promises';
import {constants, type Stats} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {platform,arch,getuid,env} from 'node:process';
import {types} from 'node:util';
import {AttestationEvidenceError,inspectUnqualifiedVerifiedAttestationOutput,type AttestationExpectedBinding} from './platform-attestation-evidence';

export type CandidateAttestationSubject=Readonly<
 |{kind:'file';fileName:'custody-envelope.json'|'release-manifest.json';bytes:Buffer}
 |{kind:'oci';image:'api'|'web';manifestDigest:string}
>;
export type NativeAttestationSubjectObservation=Readonly<{
 status:'NATIVE_ATTESTATION_SUBJECT_OBSERVED_UNQUALIFIED';releaseQualified:false;
 subjectName:string;subjectSha256:string;runId:string;runAttempt:string;sourceCommit:string;signerDigest:string;
}>;
const GH='/usr/bin/gh',ARCHIVE='/opt/explorers/toolchain/gh_2.87.3_linux_amd64.tar.gz';
const REGISTRY='/opt/explorers/toolchain/registry-auth.json',CUSTODY='/opt/explorers/attestation-custody';
// Reviewed official HTTPS release API asset 360964172 (release 289552018).
// https://api.github.com/repos/cli/cli/releases/tags/v2.87.3
// https://api.github.com/repos/cli/cli/git/ref/tags/v2.87.3
// Tag v2.87.3 resolved cf862d65df7f8ff528015e235c8cccd48cea286f on 2026-10-11.
// This is a fixed official publication trust anchor, NOT independently verified
// Sigstore binary/source provenance. Provisioning/installing the archive is external.
const ARCHIVE_SHA='c6e5537631fca45f277ef405ce8751d139b491e9402cc20891a003525a8773b2';
const MAX_ARCHIVE=16*1024*1024,MAX_UNPACKED=64*1024*1024,MAX_BINARY=48*1024*1024;
const PROJECT={repository:'tandavkrishna27/explorers.earth',repositoryId:'1171328761',ref:'refs/heads/codex/unified-replatform',signerWorkflowPath:'.github/workflows/platform-candidate.yml'} as const;
const EXPECTED_KEYS=['repository','repositoryId','ref','sourceCommit','signerWorkflowPath','signerDigest','producerRunId','producerRunAttempt','subjectName','subjectSha256'];
class NativeError extends Error{constructor(readonly code:string,readonly custodyRetained=false){super(code);}}
function deny(code:string):never{throw new NativeError(code);}
function uid():number{if(typeof getuid!=='function')deny('NATIVE_ATTESTATION_PLATFORM_UNSUPPORTED');return getuid();}
function named(error:unknown,code:string):Error{return error instanceof NativeError||error instanceof AttestationEvidenceError?error:new NativeError(code);}
function hash(bytes:Buffer):string{return createHash('sha256').update(bytes).digest('hex');}
function literal(pattern:RegExp,value:string):boolean{const m=pattern.exec(value);return m!==null&&m[0]===value;}
function data(value:unknown,keys:readonly string[],code:string):Record<string,unknown>{
 if(value===null||typeof value!=='object'||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))deny(code);
 const descriptors=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(descriptors).length!==keys.length)deny(code);
 const snapshot:Record<string,unknown>=Object.create(null);
 for(const key of keys){const d=descriptors[key];if(!d||!d.enumerable||!Object.hasOwn(d,'value'))deny(code);snapshot[key]=d.value;}
 return snapshot;
}
function snapshotExpected(expected:unknown):AttestationExpectedBinding{
 const code='ATTESTATION_EXPECTED_BINDING_INVALID',v=data(expected,EXPECTED_KEYS,code);
 for(const key of EXPECTED_KEYS)if(typeof v[key]!=='string')deny(code);
 for(const [key,value] of Object.entries(PROJECT))if(v[key]!==value)deny(code);
 for(const key of ['sourceCommit','signerDigest'])if(!literal(/[a-f0-9]{40}/,v[key] as string))deny(code);
 for(const key of ['producerRunId','producerRunAttempt'])if(!literal(/[1-9][0-9]*/,v[key] as string)||!Number.isSafeInteger(Number(v[key])))deny(code);
 if(!literal(/[a-f0-9]{64}/,v.subjectSha256 as string)||!(v.subjectName as string).length||(v.subjectName as string).length>1024)deny(code);
 return Object.freeze(v) as unknown as AttestationExpectedBinding;
}
type SubjectSnapshot=Readonly<{name:string;digest:string;bytes?:Buffer;argument?:string}>;
function snapshotSubject(value:unknown,expected:AttestationExpectedBinding):SubjectSnapshot{
 const code='NATIVE_ATTESTATION_SUBJECT_INVALID';
 if(value===null||typeof value!=='object'||types.isProxy(value))deny(code);
 const kind=Object.getOwnPropertyDescriptor(value,'kind');if(!kind||!Object.hasOwn(kind,'value'))deny(code);
 if(kind.value==='file'){
  const v=data(value,['kind','fileName','bytes'],code);
  if(v.fileName!=='custody-envelope.json'&&v.fileName!=='release-manifest.json')deny(code);
  if(!Buffer.isBuffer(v.bytes)||types.isProxy(v.bytes)||Object.getPrototypeOf(v.bytes)!==Buffer.prototype)deny(code);
  const b=v.bytes as Buffer;
  const lengthGetter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'length')!.get!;
  const length=lengthGetter.call(b) as number;
  if(length===0||length>(v.fileName==='custody-envelope.json'?131072:65536))deny(code);
  for(const key of Reflect.ownKeys(b))if(typeof key!=='string'||!literal(/0|[1-9][0-9]*/,key)||Number(key)>=length)deny(code);
  const copied=Buffer.from(b),digest=hash(copied);if(v.fileName!==expected.subjectName||digest!==expected.subjectSha256)deny(code);
  return Object.freeze({name:v.fileName,digest,bytes:copied});
 }
 if(kind.value==='oci'){
  const v=data(value,['kind','image','manifestDigest'],code);
  if((v.image!=='api'&&v.image!=='web')||typeof v.manifestDigest!=='string'||!literal(/sha256:[a-f0-9]{64}/,v.manifestDigest))deny(code);
  const name='ghcr.io/tandavkrishna27/explorers-'+v.image,digest=v.manifestDigest.slice(7);
  if(name!==expected.subjectName||digest!==expected.subjectSha256)deny(code);
  return Object.freeze({name,digest,argument:'oci://'+name+'@'+v.manifestDigest});
 }
 return deny(code);
}
function authSnapshot():string{
 // Closed child environment. Reject alternate authority before acquiring files.
 const forbidden=['GH_HOST','GH_CONFIG_DIR','GH_PATH','GH_PAGER','PAGER','BROWSER','GH_BROWSER','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN','GITHUB_TOKEN','DOCKER_CONFIG','DOCKER_AUTH_CONFIG','REGISTRY_AUTH_FILE','XDG_RUNTIME_DIR','SSL_CERT_FILE','SSL_CERT_DIR','NODE_EXTRA_CA_CERTS','SIGSTORE_ROOT_FILE','SIGSTORE_TUF_ROOT','SIGSTORE_TRUST_ROOT','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','LD_PRELOAD','LD_LIBRARY_PATH','GODEBUG'];
 for(const key of forbidden)if(env[key])deny('NATIVE_ATTESTATION_ENVIRONMENT_INVALID');
 const token=env.GH_TOKEN;if(typeof token!=='string'||token.length===0||token.length>16384||/[\x00-\x20\x7f]/.test(token))deny('NATIVE_ATTESTATION_AUTH_UNAVAILABLE');
 return token;
}
type Identity=Readonly<{dev:number;ino:number;size:number;uid:number;mode:number;mtimeMs:number;ctimeMs:number;nlink:number}>;
function identity(s:Stats):Identity{return Object.freeze({dev:s.dev,ino:s.ino,size:s.size,uid:s.uid,mode:s.mode,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs,nlink:s.nlink});}
function same(a:Identity,b:Stats):boolean{return Object.entries(a).every(([key,value])=>b[key as keyof Stats]===value);}
async function protectedPath(path:string,kind:'file'|'directory',owner=0,privateMode=false):Promise<Stats>{
 let current='';const parts=path.split('/').filter(Boolean);
 for(let index=-1;index<parts.length;index++){
  current=index===-1?'/':(current==='/'?'':current)+'/'+parts[index];
  const s=await fs.lstat(current),last=index===parts.length-1;
  if(s.isSymbolicLink()||s.uid!==(last?owner:0)||(s.mode&0o022)!==0||(!last&&!s.isDirectory()))deny('NATIVE_ATTESTATION_PROTECTED_PATH_INVALID');
  if(last&&((kind==='file'&&!s.isFile())||(kind==='directory'&&!s.isDirectory())||(privateMode&&(s.mode&0o777)!==(kind==='file'?0o600:0o700))))deny('NATIVE_ATTESTATION_PROTECTED_PATH_INVALID');
 }
 if(await fs.realpath(path)!==path)deny('NATIVE_ATTESTATION_PROTECTED_PATH_INVALID');
 return fs.lstat(path);
}
type ProtectedFile=Readonly<{path:string;id:Identity;bytes:Buffer;handle:fs.FileHandle}>;
async function readExact(handle:fs.FileHandle,size:number):Promise<Buffer>{
 const bytes=Buffer.alloc(size);let offset=0;
 while(offset<size){const result=await handle.read(bytes,offset,size-offset,offset);if(result.bytesRead<=0)deny('NATIVE_ATTESTATION_CUSTODY_CHANGED');offset+=result.bytesRead;}
 return bytes;
}
async function acquireFile(path:string,limit:number,owner=0,privateMode=false):Promise<ProtectedFile>{
 const before=await protectedPath(path,'file',owner,privateMode);
 if(before.nlink!==1||before.size<=0||before.size>limit)deny('NATIVE_ATTESTATION_FILE_LIMIT');
 const handle=await fs.open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  if(!same(identity(before),await handle.stat()))deny('NATIVE_ATTESTATION_CUSTODY_CHANGED');
  // A protected inode cannot be grown by the caller. Check size around reading.
  const bytes=await readExact(handle,before.size);if(bytes.length!==before.size||bytes.length>limit)deny('NATIVE_ATTESTATION_FILE_LIMIT');
  const file=Object.freeze({path,id:identity(before),bytes:Buffer.from(bytes),handle});await recheckFile(file,owner,privateMode);return file;
 }catch(error){await handle.close().catch(()=>{});throw error;}
}
async function recheckFile(file:ProtectedFile,owner=0,privateMode=false):Promise<void>{
 if(!same(file.id,await protectedPath(file.path,'file',owner,privateMode))||!same(file.id,await file.handle.stat()))deny('NATIVE_ATTESTATION_CUSTODY_CHANGED');
 const bytes=await readExact(file.handle,file.id.size);if(!bytes.equals(file.bytes))deny('NATIVE_ATTESTATION_CUSTODY_CHANGED');
}
function tarString(b:Buffer,start:number,length:number):string{
 const field=b.subarray(start,start+length),end=field.indexOf(0),text=field.subarray(0,end===-1?field.length:end);
 if(end!==-1&&field.subarray(end).some(x=>x!==0))deny('NATIVE_ATTESTATION_ARCHIVE_INVALID');
 if(text.some(x=>x<32||x>126))deny('NATIVE_ATTESTATION_ARCHIVE_INVALID');return text.toString('ascii');
}
function octal(b:Buffer,start:number,length:number):number{
 const raw=b.subarray(start,start+length).toString('ascii');if(!/^[0-7]+[\x00 ]*$/.test(raw))deny('NATIVE_ATTESTATION_ARCHIVE_INVALID');
 const n=parseInt(raw,8);if(!Number.isSafeInteger(n)||n<0)deny('NATIVE_ATTESTATION_ARCHIVE_INVALID');return n;
}
function officialBinary(archive:Buffer):Buffer{
 try{
  const tar=gunzipSync(archive,{maxOutputLength:MAX_UNPACKED});if(tar.length>MAX_UNPACKED||tar.length%512!==0)deny('NATIVE_ATTESTATION_ARCHIVE_INVALID');
  const seen=new Set<string>();let binary:Buffer|undefined,ended=false,entries=0;
  for(let offset=0;offset<tar.length;){
   const h=tar.subarray(offset,offset+512);if(h.length!==512)deny('NATIVE_ATTESTATION_ARCHIVE_INVALID');
   if(h.every(x=>x===0)){if(tar.length-offset<1024||tar.subarray(offset).some(x=>x!==0))deny('NATIVE_ATTESTATION_ARCHIVE_INVALID');ended=true;break;}
   if(++entries>2048)deny('NATIVE_ATTESTATION_ARCHIVE_INVALID');
   let sum=0;for(let i=0;i<512;i++)sum+=i>=148&&i<156?32:h[i];if(sum!==octal(h,148,8))deny('NATIVE_ATTESTATION_ARCHIVE_INVALID');
   if(h.subarray(257,263).toString()!=='ustar\0'||h.subarray(263,265).toString()!=='00')deny('NATIVE_ATTESTATION_ARCHIVE_INVALID');
   const base=tarString(h,0,100),prefix=tarString(h,345,155),name=(prefix?prefix+'/':'')+base,type=h[156];
   if(name.length>255||!name.startsWith('gh_2.87.3_linux_amd64/')||name.split('/').some((p,i,a)=>p==='.'||p==='..'||(!p&&i!==a.length-1))||name.includes('\\')||seen.has(name)||(type!==48&&type!==0&&type!==53))deny('NATIVE_ATTESTATION_ARCHIVE_INVALID');
   seen.add(name);const size=octal(h,124,12);if(size>MAX_BINARY||(type===53&&size!==0))deny('NATIVE_ATTESTATION_ARCHIVE_INVALID');
   const next=offset+512+Math.ceil(size/512)*512;if(next>tar.length)deny('NATIVE_ATTESTATION_ARCHIVE_INVALID');
   if(name==='gh_2.87.3_linux_amd64/bin/gh'){if(type===53||size===0)deny('NATIVE_ATTESTATION_ARCHIVE_INVALID');binary=Buffer.from(tar.subarray(offset+512,offset+512+size));}
   offset=next;
  }
  if(!ended||!binary)deny('NATIVE_ATTESTATION_ARCHIVE_INVALID');return binary;
 }catch(error){throw named(error,'NATIVE_ATTESTATION_ARCHIVE_INVALID');}
}
type GhLease=Readonly<{executable:string;archive:ProtectedFile;binary:ProtectedFile}>;
async function acquireGhExecutable():Promise<GhLease>{
 if(platform!=='linux'||arch!=='x64'||typeof getuid!=='function')deny('NATIVE_ATTESTATION_PLATFORM_UNSUPPORTED');
 let archive:ProtectedFile|undefined,binary:ProtectedFile|undefined;
 try{
  try{archive=await acquireFile(ARCHIVE,MAX_ARCHIVE);}catch(error){throw named(error,'NATIVE_ATTESTATION_PROVENANCE_UNAVAILABLE');}
  if(hash(archive.bytes)!==ARCHIVE_SHA)deny('NATIVE_ATTESTATION_PROVENANCE_INVALID');
  const published=officialBinary(archive.bytes);binary=await acquireFile(GH,MAX_BINARY);
  if((binary.id.mode&0o111)===0||!binary.bytes.equals(published))deny('NATIVE_ATTESTATION_EXECUTABLE_MISMATCH');
  return Object.freeze({executable:GH,archive,binary});
 }catch(error){await Promise.all([archive?.handle.close(),binary?.handle.close()]);throw named(error,'NATIVE_ATTESTATION_PROVENANCE_UNAVAILABLE');}
}
type OwnedSubjectLease={root:string;rootId:Identity;argument:string;subject:SubjectSnapshot;files:ProtectedFile[];directories:{path:string;dev:number;ino:number}[];environment:Record<string,string>;registry?:ProtectedFile};
async function registryAuth():Promise<ProtectedFile>{
 let file:ProtectedFile|undefined;
 try{
  file=await acquireFile(REGISTRY,16384,uid(),true);
  const parsed:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(file.bytes)),top=data(parsed,['auths'],'NATIVE_ATTESTATION_REGISTRY_AUTH_INVALID');
  const auths=data(top.auths,['ghcr.io'],'NATIVE_ATTESTATION_REGISTRY_AUTH_INVALID'),auth=data(auths['ghcr.io'],['auth'],'NATIVE_ATTESTATION_REGISTRY_AUTH_INVALID');
  if(typeof auth.auth!=='string'||auth.auth.length===0||auth.auth.length>12000)deny('NATIVE_ATTESTATION_REGISTRY_AUTH_INVALID');
  const decoded=Buffer.from(auth.auth,'base64');if(decoded.toString('base64')!==auth.auth||!literal(/[\x21-\x7e]+:[\x21-\x7e]+/,decoded.toString()))deny('NATIVE_ATTESTATION_REGISTRY_AUTH_INVALID');
  return file;
 }catch(error){await file?.handle.close();throw named(error,error instanceof SyntaxError?'NATIVE_ATTESTATION_REGISTRY_AUTH_INVALID':'NATIVE_ATTESTATION_REGISTRY_AUTH_UNAVAILABLE');}
}
async function ownedFile(lease:OwnedSubjectLease,name:string,bytes:Buffer):Promise<ProtectedFile>{
 const path=lease.root+'/'+name,handle=await fs.open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await handle.writeFile(bytes);}finally{await handle.close();}
 const before=await fs.lstat(path),reader=await fs.open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 let file:ProtectedFile;
 // Ownership transfers to the lease only after the snapshot exists. Every
 // failure before that transfer closes this exact reader locally.
 try{
  if(!same(identity(before),await reader.stat()))deny('NATIVE_ATTESTATION_CUSTODY_CHANGED');
  file=Object.freeze({path,id:identity(before),bytes:await readExact(reader,before.size),handle:reader});
 }catch(error){await reader.close().catch(()=>{});throw error;}
 lease.files.push(file);
 await recheckOwnedFile(lease,file);
 if(!file.bytes.equals(bytes))deny('NATIVE_ATTESTATION_CUSTODY_CHANGED');return file;
}
async function stageOwnedSubject(subject:SubjectSnapshot,token:string):Promise<OwnedSubjectLease>{
 await protectedPath(CUSTODY,'directory',uid(),true);
 // Registry auth is independently acquired at a fixed protected path; never a
 // caller Docker config or an inherited credential helper.
 const registry=subject.argument?await registryAuth():undefined;
 let lease:OwnedSubjectLease|undefined,allocatedRoot=false;
 try{
  const root=await fs.mkdtemp(CUSTODY+'/observe-');allocatedRoot=true;const rootStat=await fs.lstat(root);
  lease={root,rootId:identity(rootStat),argument:subject.argument??root+'/'+subject.name,subject,files:[],directories:[],environment:{},registry};
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||rootStat.uid!==uid()||(rootStat.mode&0o777)!==0o700)deny('NATIVE_ATTESTATION_CUSTODY_CHANGED');
  // Intermediate directories are created and recorded by this private lease.
  for(const name of ['home','gh','docker','cache']){const path=root+'/'+name;await fs.mkdir(path,{mode:0o700});const s=await fs.lstat(path);lease.directories.push({path,dev:s.dev,ino:s.ino});}
  await ownedFile(lease,'gh/config.yml',Buffer.from('version: 1\nprompt: disabled\naliases: {}\npager: ""\n'));
  // Keep Docker config present even for file subjects to prevent any fallback.
  await ownedFile(lease,'docker/config.json',registry?.bytes??Buffer.from('{"auths":{}}'));
  if(subject.bytes){const file=await ownedFile(lease,subject.name,subject.bytes);if(hash(file.bytes)!==subject.digest)deny('NATIVE_ATTESTATION_CUSTODY_CHANGED');}
  lease.environment={HOME:root+'/home',GH_CONFIG_DIR:root+'/gh',DOCKER_CONFIG:root+'/docker',XDG_CACHE_HOME:root+'/cache',GH_TOKEN:token,GH_PROMPT_DISABLED:'1',GH_NO_UPDATE_NOTIFIER:'1',GH_NO_EXTENSION_UPDATE_NOTIFIER:'1',GH_PAGER:'',CI:'true',NO_COLOR:'1',LANG:'C',LC_ALL:'C'};
  return lease;
 }catch(error){
  const first=named(error,'NATIVE_ATTESTATION_EXECUTION_FAILED');
  try{if(lease)await cleanupOwnedSubject(lease);else{await registry?.handle.close();if(allocatedRoot)deny('NATIVE_ATTESTATION_CUSTODY_RETAINED');}}
  catch{throw new NativeError(first instanceof NativeError||first instanceof AttestationEvidenceError?first.code:'NATIVE_ATTESTATION_EXECUTION_FAILED',true);}
  throw first;
 }
}
async function recheckLease(lease:OwnedSubjectLease):Promise<void>{
 const root=await fs.lstat(lease.root);if(root.isSymbolicLink()||!root.isDirectory()||root.uid!==uid()||root.dev!==lease.rootId.dev||root.ino!==lease.rootId.ino||(root.mode&0o777)!==0o700)deny('NATIVE_ATTESTATION_CUSTODY_CHANGED');
 for(const directory of lease.directories){const s=await fs.lstat(directory.path);if(s.isSymbolicLink()||!s.isDirectory()||s.uid!==uid()||s.dev!==directory.dev||s.ino!==directory.ino||(s.mode&0o777)!==0o700)deny('NATIVE_ATTESTATION_CUSTODY_CHANGED');}
 for(const file of lease.files)await recheckOwnedFile(lease,file);
 if(lease.registry)await recheckFile(lease.registry,uid(),true);
}
async function recheckOwnedFile(lease:OwnedSubjectLease,file:ProtectedFile):Promise<void>{
 // Parent lease directories are runner-owned, not root-owned. They were created
 // privately and are rechecked above; do not apply toolchain ancestry policy.
 const s=await fs.lstat(file.path);if(s.isSymbolicLink()||!s.isFile()||!same(file.id,s)||!same(file.id,await file.handle.stat())||s.uid!==uid()||s.nlink!==1||(s.mode&0o777)!==0o600||!(await readExact(file.handle,file.id.size)).equals(file.bytes))deny('NATIVE_ATTESTATION_CUSTODY_CHANGED');
 if(!file.path.startsWith(lease.root+'/'))deny('NATIVE_ATTESTATION_CUSTODY_CHANGED');
}
async function cleanupOwnedSubject(lease:OwnedSubjectLease):Promise<void>{
 try{
  await recheckLease(lease);
  for(const file of [...lease.files].reverse()){await file.handle.close();await fs.unlink(file.path);}
  for(const directory of [...lease.directories].reverse())await fs.rmdir(directory.path);
  await fs.rmdir(lease.root);await lease.registry?.handle.close();
 }catch{await Promise.allSettled([...lease.files.map(f=>f.handle.close()),lease.registry?.handle.close()]);deny('NATIVE_ATTESTATION_CUSTODY_RETAINED');}
}
// Coordinator ruling: fixed audited no-helper gh invocation owns its original
// child. This is not general process-tree containment or a claim that process-
// group disappearance settles arbitrary descendants. The genuine release byte
// gate and closed config remove supported helper execution paths for this command.
function runChild(executable:string,args:readonly string[],lease:OwnedSubjectLease,stdoutLimit:number,stderrLimit:number):Promise<Buffer>{
 return new Promise((resolve,reject)=>{
  let child:ReturnType<typeof spawn>;
  try{child=spawn(executable,[...args],{cwd:lease.root,env:lease.environment,shell:false,stdio:['ignore','pipe','pipe']});}catch{return reject(new NativeError('NATIVE_ATTESTATION_CHILD_ERROR'));}
  let code:string|undefined,finished=false,stdoutBytes=0,stderrBytes=0;const chunks:Buffer[]=[];
  const finish=(exit:number|null,signal:string|null)=>{
   if(finished)return;finished=true;clearTimeout(deadline);clearTimeout(settlement);
   if(code)return reject(new NativeError(code));if(exit!==0||signal!==null)return reject(new NativeError('NATIVE_ATTESTATION_CHILD_EXIT_INVALID'));resolve(Buffer.concat(chunks,stdoutBytes));
  };
  let settlement:ReturnType<typeof setTimeout>|undefined;
  const stop=(reason:string)=>{if(code)return;code=reason;chunks.length=0;
   settlement=setTimeout(()=>{if(finished)return;finished=true;clearTimeout(deadline);reject(new NativeError(reason,true));},5000);
   try{child.kill('SIGKILL');}catch{}
  };
  const deadline=setTimeout(()=>stop('NATIVE_ATTESTATION_CHILD_TIMEOUT'),120000);
  child.once('error',()=>stop('NATIVE_ATTESTATION_CHILD_ERROR'));
  child.once('close',finish);
  child.stdout?.once('error',()=>stop('NATIVE_ATTESTATION_CHILD_ERROR'));
  child.stderr?.once('error',()=>stop('NATIVE_ATTESTATION_CHILD_ERROR'));
  child.stdout?.on('data',(chunk:Buffer)=>{if(code||finished)return;const b=Buffer.from(chunk);stdoutBytes+=b.length;if(stdoutBytes>stdoutLimit)return stop('NATIVE_ATTESTATION_STDOUT_LIMIT');chunks.push(b);});
  child.stderr?.on('data',(chunk:Buffer)=>{if(code||finished)return;stderrBytes+=Buffer.byteLength(chunk);if(stderrBytes>stderrLimit)stop('NATIVE_ATTESTATION_STDERR_LIMIT');});
 });
}
async function executeGhVerify(gh:GhLease,lease:OwnedSubjectLease,expected:AttestationExpectedBinding):Promise<Buffer>{
 await recheckFile(gh.archive);await recheckFile(gh.binary);await recheckLease(lease);
 const version=await runChild(gh.executable,['--version'],lease,4096,65536);
 const versionText=new TextDecoder('utf-8',{fatal:true}).decode(version);
 if(!/^gh version 2\.87\.3 \([^\r\n]{1,64}\)\r?\n(?:https:\/\/github\.com\/cli\/cli\/releases\/tag\/v2\.87\.3\r?\n)?$/.test(versionText))deny('NATIVE_ATTESTATION_GH_VERSION_INVALID');
 await recheckFile(gh.archive);await recheckFile(gh.binary);await recheckLease(lease);
 const stdout=await runChild(gh.executable,['attestation','verify',lease.argument,'--repo',PROJECT.repository,'--signer-workflow',PROJECT.repository+'/'+PROJECT.signerWorkflowPath,'--source-ref',PROJECT.ref,'--source-digest',expected.sourceCommit,'--signer-digest',expected.signerDigest,'--deny-self-hosted-runners','--cert-oidc-issuer','https://token.actions.githubusercontent.com','--predicate-type','https://slsa.dev/provenance/v1','--digest-alg','sha256','--format','json','--hostname','github.com'],lease,1048576,65536);
 await recheckFile(gh.archive);await recheckFile(gh.binary);await recheckLease(lease);return stdout;
}
/** Executes one bounded subject comparison. Expected comparisons never supply
 * producer authority. This observer cannot qualify a release or enable verifyRelease. */
export async function observeNativeCandidateAttestation(subject:CandidateAttestationSubject,expected:AttestationExpectedBinding):Promise<NativeAttestationSubjectObservation>{
 const binding=snapshotExpected(expected),snapshot=snapshotSubject(subject,binding),token=authSnapshot();
 let gh:GhLease|undefined,lease:OwnedSubjectLease|undefined,result:NativeAttestationSubjectObservation|undefined,failure:Error|undefined;
 try{
  gh=await acquireGhExecutable();lease=await stageOwnedSubject(snapshot,token);
  const stdout=await executeGhVerify(gh,lease,binding);
  const inspection=inspectUnqualifiedVerifiedAttestationOutput(stdout,binding);
  result=Object.freeze({status:'NATIVE_ATTESTATION_SUBJECT_OBSERVED_UNQUALIFIED',releaseQualified:false,subjectName:snapshot.name,subjectSha256:snapshot.digest,runId:inspection.runId,runAttempt:inspection.runAttempt,sourceCommit:binding.sourceCommit,signerDigest:binding.signerDigest});
 }catch(error){failure=named(error,'NATIVE_ATTESTATION_EXECUTION_FAILED');}
 // Unsettled original child retains custody: it may still hold subject/config.
 if(lease&&(!(failure instanceof NativeError)||!failure.custodyRetained)){
  try{await cleanupOwnedSubject(lease);}catch(error){failure??=named(error,'NATIVE_ATTESTATION_CUSTODY_RETAINED');}
 }
 try{await Promise.all([gh?.archive.handle.close(),gh?.binary.handle.close()]);}catch{failure??=new NativeError('NATIVE_ATTESTATION_CUSTODY_RETAINED');}
 if(failure)throw failure;if(!result)deny('NATIVE_ATTESTATION_EXECUTION_FAILED');return result;
}
