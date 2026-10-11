import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {lstatSync,realpathSync,openSync,fstatSync,readSync,closeSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve,dirname,basename,join,isAbsolute,parse} from 'node:path';
import {execFileSync} from 'node:child_process';
import {deflateSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Pool,PoolClient} from 'pg';
import type {createCanonicalApp} from '../server/auth/canonicalApp';
import type {ExplorersAuthConfig} from '../server/auth/betterAuth';
import {LocalObjectStorage,assertObjectKey,createLocalObjectStorageWithSettlement,type LocalStorageSettlementCapability} from '../server/services/objectStorage';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {sep} from 'node:path';
import type {OwnedUatDatabaseAuthority} from './music-uat-database';
import {z} from 'zod/v3';
import {extractCanonicalCustodySnapshot,extractCanonicalCustodyDiagnostic,type CanonicalCustodyReason,type CanonicalCustodyCensus} from '../server/auth/canonicalHandlerCustody';
import {inspectAppsPrivateDescendant} from './apps-private-custody';
import {appEntityDetailsSchema,type AppEntityDetails} from '../shared/explorersAppContract';
import {editableOwnerCollectionSchema,editableOwnerRecommendationSchema,ownerMembershipDtoSchema} from '../shared/explorersOwnerContentContract';
// This module allocates no DB, listener, process, directory or HTTP request on import.
export const APPS_CASES = [
 'Apps manual: list and complete typed recommendation create edit archive and reload',
 'Apps manual: ordered owned screenshots replacement and visibility enforce real bytes',
 'Apps manual: Keep Draft Publish and ancestor withdrawal preserve public state',
 'Apps manual: category top picks save reorder unpin and limit survive reload',
] as const;
const uuid=z.string().uuid(),sha=z.string().regex(/^[a-f0-9]{64}$/),length=z.number().int().min(8).max(5242880);
const identitySchema=z.object({version:z.literal(1),runId:z.string().regex(/^[a-f0-9]{32}$/),commit:z.string().regex(/^[a-f0-9]{40}$/),caseId:z.enum(APPS_CASES),project:z.enum(['apps-desktop','apps-mobile']),repeat:z.literal(0)}).strict();
export type AppsIdentity=z.infer<typeof identitySchema>;
type InitialPersona={userId:string;handle:string;cookie:string};
const personaSchema=z.object({userId:z.string().min(1).max(128),accountId:uuid,handle:z.string().min(1).max(64),cookie:z.string().min(3).max(4096)}).strict();
type Persona=z.infer<typeof personaSchema>;
const manifestSchema=identitySchema.extend({personas:z.object({ownerA:personaSchema,ownerB:personaSchema}).strict(),collections:z.array(z.object({id:uuid,title:z.string().min(1).max(200),slug:z.string().min(1).max(200)}).strict()).max(2),recommendations:z.array(z.object({id:uuid,entityId:uuid,collectionId:uuid,title:z.string().min(1).max(200),developer:z.string().min(1).max(200)}).strict()).max(16),memberships:z.array(z.object({recommendationId:uuid,collectionId:uuid}).strict()).max(16),media:z.array(z.object({id:uuid,owner:z.enum(['ownerA','ownerB']),length,sha256:sha}).strict()).max(3),uploadFiles:z.array(z.object({path:z.string().min(1).max(1024),name:z.string().max(100).regex(/^[a-z0-9-]+\.png$/),length,sha256:sha}).strict()).max(2)}).strict();
export type AppsManifest=z.infer<typeof manifestSchema>;
const observationSchema=identitySchema.extend({collections:z.array(editableOwnerCollectionSchema).max(4),recommendations:z.array(editableOwnerRecommendationSchema).max(20),memberships:z.array(ownerMembershipDtoSchema).max(20),media:z.array(z.object({id:uuid,accountId:uuid,purpose:z.literal('recommendation'),status:z.enum(['ready','pending_delete','deleted']),length,sha256:sha}).strict()).max(24)}).strict();
export type AppsObservation=z.infer<typeof observationSchema>;
type SeedPlan={collections:{title:string;slug:string;visibility:'public'|'private';publicationState:'published'|'draft'}[];recommendations:{title:string;collectionIndex:number;details:AppEntityDetails}[];media:{owner:'ownerA'|'ownerB';recommendationIndexes:number[];bytes:Buffer}[];uploads:Buffer[]};
function png(pixel:readonly number[]) {
 const chunk=(name:string,data:Buffer)=>{const type=Buffer.from(name),all=Buffer.concat([type,data]);let crc=0xffffffff;for(const b of all){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(data.length);c.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([n,all,c]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,...pixel]))),chunk('IEND',Buffer.alloc(0))]);
}
export function buildAppsSeedPlan(caseId:string):SeedPlan {
 const index=APPS_CASES.indexOf(caseId as never);if(index<0)throw Error('Apps seed identity denied');
 const published=index===1||index===3;
 const collections=Array.from({length:index===0?0:index===2?1:2},(_,i)=>({title:`Native Apps List ${i+1}`,slug:`native-apps-list-${i+1}`,visibility:published?'public' as const:'private' as const,publicationState:published?'published' as const:'draft' as const}));
 const recommendations=Array.from({length:index===1?2:index===3?16:0},(_,i)=>({title:`Native Fixture App ${String(i+1).padStart(2,'0')}`,collectionIndex:index===1?i:i<8?0:1,details:appEntityDetailsSchema.parse({appUrl:`https://apps.example.invalid/fixture-${i+1}`,developer:`Native Developer ${i+1}`,logoUrl:null,description:'Owned manual fixture',downloadUrl:null,priceTier:null,platforms:['Web']})}));
 return {collections,recommendations,media:index===1?[{owner:'ownerA',recommendationIndexes:[0,1],bytes:png([255,0,0,255])},{owner:'ownerB',recommendationIndexes:[],bytes:png([0,255,0,255])}]:[],uploads:index===1?[png([0,0,255,255]),png([255,255,0,255])]:[]};
}
export function validateAppsControl(input:{remote:string;host:string;origin:string;expectedHost:string;expectedOrigin:string;capability:string;expectedCapability:string;runId:string;commit:string;body:unknown;active?:AppsIdentity}) {
 const b=identitySchema.extend({action:z.enum(['reset','observe'])}).strict().parse(input.body);
 if(input.remote!=='127.0.0.1'||input.host!==input.expectedHost||input.origin!==input.expectedOrigin||!sha.safeParse(input.capability).success||!sha.safeParse(input.expectedCapability).success||!timingSafeEqual(Buffer.from(input.capability),Buffer.from(input.expectedCapability))||b.runId!==input.runId||b.commit!==input.commit||(b.action==='observe'&&JSON.stringify({...b,action:undefined})!==JSON.stringify({...input.active,action:undefined})))throw Error('Apps control denied');
 return b;
}
export interface AppsControlOptions {
 pool:Pool;composed:ReturnType<typeof createCanonicalApp>;config:ExplorersAuthConfig;runId:string;commit:string;origin:string;apiOrigin:string;
 personas:{ownerA:InitialPersona;ownerB:InitialPersona};storage:LocalObjectStorage;storageDirectory:string;fixtureFilesRoot:string;expectedTemporaryRoot:string;disposableDirectory:string;ownedAuthority:OwnedUatDatabaseAuthority;
}
// A supplied adapter is complete and explicitly synthetic; it cannot emit native evidence.
export interface AppsControlDependencies {
 uuid():string;capability():string;
 files:{assertCustody():Promise<void>;write(path:string,bytes:Buffer):Promise<void>;read(path:string):Promise<Buffer>;remove(path:string):Promise<void>};
 storage:{put(key:string,bytes:Buffer):Promise<unknown>;get(key:string):Promise<Buffer>;delete(key:string):Promise<void>};
 session(person:Persona):Promise<Persona>;
 canonical(person:Persona,path:string,method?:'GET'|'PATCH',body?:unknown):Promise<any>;
}
const fail=(phase:string)=>new Error(`Apps fixture ${phase} failed`);
const storagePrototype=LocalObjectStorage.prototype;
const storageMethods=Object.getOwnPropertyDescriptors(storagePrototype);
type FixedAppsInput=Omit<import('../server/auth/canonicalApp').CanonicalAppsFixtureInput,'mediaStorage'>;
const requestSnapshotBindings=new WeakMap<object,RequestBinding>();
type RequestBinding={authority:OwnedUatDatabaseAuthority;authoritySnapshot:string;personas:FixedAppsInput['personasWithActualAccountIds'];poolPrototype:unknown;poolMethods:unknown[];custody:ReturnType<typeof import('../server/auth/canonicalApp').createCanonicalAppsFixtureApp>['custody'];admission:ReturnType<typeof import('../server/auth/canonicalApp').createCanonicalAppsFixtureApp>['admission'];sealed:boolean};
type CompositionBinding={pool:Pool;config:ExplorersAuthConfig;configSnapshot:string;storage:LocalObjectStorage;settlement:LocalStorageSettlementCapability;root:string;app:unknown;auth:unknown;composedPrototype:unknown;objects:{value:object;prototype:unknown;descriptors:PropertyDescriptorMap}[];requests?:RequestBinding};
const compositionBindings=new WeakMap<object,CompositionBinding>();
/** Explicit construction only: no connection, listener or filesystem allocation. */
export async function createAppsFixtureComposition(pool:Pool,config:ExplorersAuthConfig,storageDirectory:string,fixedInput?:FixedAppsInput){
 if(!isAbsolute(storageDirectory)||storageDirectory.length>1024)throw fail('composition');
 if(fixedInput)exactKeys(fixedInput,['runAuthority','personasWithActualAccountIds']);
 const canonical=await import('../server/auth/canonicalApp');
 const root=resolve(storageDirectory),{storage,settlement}=createLocalObjectStorageWithSettlement(root),fixed=fixedInput?canonical.createCanonicalAppsFixtureApp(pool,config,{mediaStorage:storage,...fixedInput}):undefined,composed=fixed?.composed??canonical.createCanonicalApp(pool,config,{mediaStorage:storage});
 const requests=fixed?{authority:fixedInput!.runAuthority,authoritySnapshot:JSON.stringify(fixedInput!.runAuthority),personas:structuredClone(fixedInput!.personasWithActualAccountIds),poolPrototype:Object.getPrototypeOf(pool),poolMethods:[pool.query,pool.connect,pool.end],custody:fixed.custody,admission:fixed.admission,sealed:false}:undefined;
 compositionBindings.set(composed,{pool,config,configSnapshot:JSON.stringify(config),storage,settlement,root,app:composed.app,auth:composed.auth,composedPrototype:Object.getPrototypeOf(composed),objects:[composed,composed.app,composed.auth].map(value=>({value,prototype:Object.getPrototypeOf(value),descriptors:Object.getOwnPropertyDescriptors(value)})),requests});
 return {composed,storage};
}
/** Physical media FS only; grants no request, auth, PG or disposal authority. */
export async function drainAppsFixtureStorage(options:AppsControlOptions,milliseconds:number){
 try{validateOptions(options);assertComposition(options);const binding=compositionBindings.get(options.composed)!;return await binding.settlement.sealAndDrain(milliseconds);}catch{throw fail('storage drain');}
}
function requestBinding(options:AppsControlOptions){
 validateOptions(options);assertComposition(options);const binding=compositionBindings.get(options.composed)!.requests;
 if(!binding||binding.authority!==options.ownedAuthority||binding.authoritySnapshot!==JSON.stringify(options.ownedAuthority))throw fail('request authority');
 if(Object.getPrototypeOf(options.pool)!==binding.poolPrototype||[options.pool.query,options.pool.connect,options.pool.end].some((method,index)=>method!==binding.poolMethods[index]))throw fail('request authority');
 for(const name of ['ownerA','ownerB'] as const){const fixed=binding.personas[name],person=options.personas[name];if(fixed.userId!==person.userId||fixed.handle!==person.handle)throw fail('request authority');}
 requestSnapshotBindings.set(options,binding);return binding;
}
/** Begins the original canonical record. Dataset admission runs inside the fixed app. */
export function admitAppsFixtureRequest(options:AppsControlOptions,request:IncomingMessage,response:ServerResponse){try{const binding=requestBinding(options);if(binding.sealed)return false;return binding.custody.admit(request,response);}catch{throw fail('request admission');}}
/** Synchronous outer admission latch; no timed drain or release of original work. */
export function sealAppsFixtureRequests(options:AppsControlOptions){try{const binding=requestBinding(options);binding.sealed=true;binding.admission.seal();}catch{throw fail('request seal');}}
/** Only exact settled is positive request evidence; all other states retain custody. */
export type AppsRequestDrainDiagnostic=Readonly<{status:'settled'|'failed-but-settled'|'unsettled';sealed:boolean;requests:number;frames:number;unknown:boolean;uncertain:boolean;reason?:CanonicalCustodyReason;provedReadTransportCancellations?:number;census?:CanonicalCustodyCensus;censusCode?:string}>;
const requestDrainDiagnostics=new WeakMap<object,AppsRequestDrainDiagnostic>();
export function extractAppsRequestDrainSnapshot(options:unknown):AppsRequestDrainDiagnostic|undefined{if(options===null||(typeof options!=='object'&&typeof options!=='function'))return undefined;const binding=requestSnapshotBindings.get(options as object);return binding?extractCanonicalCustodySnapshot(binding.custody):undefined;}
export function extractAppsRequestDrainDiagnostic(options:unknown):AppsRequestDrainDiagnostic|undefined{return options!==null&&(typeof options==='object'||typeof options==='function')?requestDrainDiagnostics.get(options as object):undefined;}
export async function drainAppsFixtureRequests(options:AppsControlOptions,milliseconds:number){try{if(!Number.isSafeInteger(milliseconds)||milliseconds<1||milliseconds>15000)throw fail('request budget');const binding=requestBinding(options);binding.sealed=true;binding.admission.seal();const result=await binding.custody.sealAndDrain(milliseconds);if(!requestDrainDiagnostics.has(options)){const detail=extractCanonicalCustodyDiagnostic(binding.custody);requestDrainDiagnostics.set(options,Object.freeze({...extractCanonicalCustodySnapshot(binding.custody),...result,...(detail?{reason:detail.reason}:{})}));}return result;}catch{throw fail('request drain');}}
function assertComposition(o:AppsControlOptions){
 const binding=compositionBindings.get(o.composed);
 if(!binding||binding.pool!==o.pool||binding.config!==o.config||binding.configSnapshot!==JSON.stringify(o.config)||binding.storage!==o.storage||binding.root!==resolve(o.storageDirectory)||Object.getPrototypeOf(o.storage)!==storagePrototype||Object.getPrototypeOf(o.composed)!==binding.composedPrototype||o.composed.app!==binding.app||o.composed.auth!==binding.auth)throw fail('composition');
 const own=Object.getOwnPropertyDescriptor(o.storage,'root');if(!own||own.get||own.value!==binding.root||o.storage.environment!=='local')throw fail('composition');
 for(const object of binding.objects){if(Object.getPrototypeOf(object.value)!==object.prototype)throw fail('composition');for(const [name,descriptor] of Object.entries(object.descriptors)){if(typeof descriptor.value!=='function'&&!descriptor.get&&!descriptor.set)continue;const current=Object.getOwnPropertyDescriptor(object.value,name);if(!current||current.value!==descriptor.value||current.get!==descriptor.get||current.set!==descriptor.set)throw fail('composition');}}
 for(const [name,descriptor] of Object.entries(storageMethods)){if(name==='constructor')continue;if(Object.hasOwn(o.storage,name)||Object.getOwnPropertyDescriptor(storagePrototype,name)?.value!==descriptor.value)throw fail('composition');}
 return binding.root;
}
function exactKeys(value:unknown,keys:string[]) {if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.sort().join(','))throw fail('authority');}
function loopback(value:string) {const u=new URL(value);if(u.origin!==value||u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!/^\d{4,5}$/.test(u.port)||Number(u.port)>65535||Number(u.port)<1024||u.username||u.password)throw fail('authority');return u;}
function validateOptions(o:AppsControlOptions) {
 exactKeys(o,['pool','composed','config','runId','commit','origin','apiOrigin','personas','storage','storageDirectory','fixtureFilesRoot','expectedTemporaryRoot','disposableDirectory','ownedAuthority']);
 const api=loopback(o.apiOrigin);loopback(o.origin);if(o.apiOrigin===o.origin||o.config.baseURL!==o.origin)throw fail('authority');
 identitySchema.parse({version:1,runId:o.runId,commit:o.commit,caseId:APPS_CASES[0],project:'apps-desktop',repeat:0});
 const a=o.ownedAuthority;exactKeys(a,['owned','runId','commit','database','port','containerId','imageId','contextHost']);
 if(a.owned!==true||a.runId!==o.runId||a.commit!==o.commit||a.database!==`music_uat_${o.runId}`||!sha.safeParse(a.containerId).success||!/^sha256:[a-f0-9]{64}$/.test(a.imageId)||!Number.isSafeInteger(a.port)||a.port<1024||a.port>65535||!['npipe:////./pipe/docker_engine','npipe:////./pipe/dockerDesktopLinuxEngine','unix:///var/run/docker.sock'].includes(a.contextHost))throw fail('authority');
 exactKeys(o.personas,['ownerA','ownerB']);for(const p of Object.values(o.personas)){exactKeys(p,['userId','handle','cookie']);personaSchema.omit({accountId:true}).parse(p);}
 if(o.personas.ownerA.userId===o.personas.ownerB.userId||o.personas.ownerA.handle===o.personas.ownerB.handle||o.storage.environment!=='local')throw fail('authority');
 for(const p of [o.expectedTemporaryRoot,o.disposableDirectory,o.storageDirectory,o.fixtureFilesRoot])if(!isAbsolute(p)||p.length>1024)throw fail('custody');
 if(dirname(resolve(o.disposableDirectory))!==resolve(o.expectedTemporaryRoot)||!/^explorers-profile-e2e-[A-Za-z0-9]+$/.test(basename(o.disposableDirectory))||resolve(o.storageDirectory)!==join(resolve(o.disposableDirectory),'owned-media')||resolve(o.fixtureFilesRoot)!==join(resolve(o.disposableDirectory),'apps-fixture-files'))throw fail('custody');
 return api;
}
export type AppsControllerDiagnostic=Readonly<{operation:'initialize'|'reset'|'observe'|'control'|'close';phase:'ownership'|'custody'|'remove-old-object'|'remove-upload-file'|'connect'|'transaction'|'seed-put'|'seed-get'|'upload-write'|'upload-read'|'sessions'|'canonical'|'response'|'settlement';boundary:'none'|'before-custody'|'after-custody'|'ancestor'|'target'|'before-mutation'|'after-mutation'|'final-custody';category:'deadline'|'refusal';budgetMs?:5000|10000|12000}>;
const controllerDiagnostics=new WeakMap<object,()=>AppsControllerDiagnostic|undefined>();
export function extractAppsControlDiagnostic(value:unknown):AppsControllerDiagnostic|undefined {return (typeof value==='object'&&value!==null||typeof value==='function')?controllerDiagnostics.get(value as object)?.():undefined;}
function nativeDependencies(o:AppsControlOptions,guard:(boundary?:AppsControllerDiagnostic['boundary'])=>void):AppsControlDependencies {
 guard();assertComposition(o);
 const helper=resolve(import.meta.dirname,'music-local-private-files.ps1');
 function inspectPrivate(path:string,directory:boolean) {
  guard('ancestor');
  let current=resolve(path);for(;;){const st=lstatSync(current);if(st.isSymbolicLink()||realpathSync(current).toLowerCase()!==current.toLowerCase())throw fail('custody');if(current===parse(current).root)break;current=dirname(current);}
  guard('target');const st=lstatSync(path);if(directory?!st.isDirectory():!st.isFile())throw fail('custody');
  if(process.platform==='win32'&&inspectAppsPrivateDescendant(path)){guard();return;}
  if(process.platform==='win32'){
   const ps='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
   if(lstatSync(ps).isSymbolicLink()||realpathSync(ps).toLowerCase()!==ps.toLowerCase()||!lstatSync(ps).isFile()||lstatSync(helper).isSymbolicLink()||!lstatSync(helper).isFile()||realpathSync(helper).toLowerCase()!==helper.toLowerCase())throw fail('custody');
   const env={SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',PATH:'C:\\Windows\\System32',TEMP:o.expectedTemporaryRoot,TMP:o.expectedTemporaryRoot};
   const version=execFileSync(ps,['-NoLogo','-NoProfile','-NonInteractive','-Command','$PSVersionTable.PSVersion.ToString()'],{env,windowsHide:true,timeout:10000,maxBuffer:4096,encoding:'utf8'}).trim();
   if(!/^5\.1\.\d+\.\d+$/.test(version))throw fail('custody');
   const result=execFileSync(ps,['-NoLogo','-NoProfile','-NonInteractive','-File',helper,'inspect',path],{env,windowsHide:true,timeout:10000,maxBuffer:4096,encoding:'utf8'});
   if(JSON.parse(result).ok!==true)throw fail('custody');
  }else if(typeof process.getuid!=='function'||st.uid!==process.getuid()||(st.mode&0o077)!==0)throw fail('custody');
 }
 const assertCustody=async()=>{guard('before-custody');assertComposition(o);if(resolve(o.expectedTemporaryRoot)!==resolve(tmpdir()))throw fail('custody');inspectPrivate(o.disposableDirectory,true);inspectPrivate(o.fixtureFilesRoot,true);inspectPrivate(o.storageDirectory,true);if(realpathSync(o.storageDirectory)!==assertComposition(o))throw fail('custody');guard('after-custody');};
 function file(path:string){if(dirname(resolve(path))!==resolve(o.fixtureFilesRoot)||!/^apps-upload-[12]\.png$/.test(basename(path)))throw fail('custody');}
 async function objectPath(key:string,create=false){
  await assertCustody();guard();assertObjectKey(key,'local');const parts=key.split('/');if(parts.length!==3||parts[0]!=='local'||!uuid.safeParse(parts[1]).success||!uuid.safeParse(parts[2]).success)throw fail('storage custody');
  const root=assertComposition(o),path=resolve(root,...parts);if(!path.startsWith(root+sep))throw fail('storage custody');
  const ancestors=[join(root,'local'),dirname(path)];for(const ancestor of ancestors){try{inspectPrivate(ancestor,true);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;if(create){guard();await mkdir(ancestor,{mode:0o700});guard();inspectPrivate(ancestor,true);}else throw error;}}
  return path;
 }
 return {
  uuid:randomUUID,capability:()=>randomBytes(32).toString('hex'),
  files:{assertCustody,write:async(path,bytes)=>{file(path);await assertCustody();guard();if(bytes.length>5242880)throw fail('custody');guard('before-mutation');writeFileSync(path,bytes,{mode:0o600,flag:'wx'});inspectPrivate(path,false);},read:async path=>{
   file(path);await assertCustody();guard();inspectPrivate(path,false);const before=lstatSync(path);if(before.size<8||before.size>5242880)throw fail('custody');const fd=openSync(path,'r');try{const st=fstatSync(fd);if(st.dev!==before.dev||st.ino!==before.ino||st.size!==before.size||!st.isFile())throw fail('custody');const data=Buffer.alloc(st.size+1);let count=0;while(count<data.length){const n=readSync(fd,data,count,data.length-count,null);if(!n)break;count+=n;}if(count!==st.size)throw fail('custody');return data.subarray(0,count);}finally{closeSync(fd);}
  },remove:async path=>{file(path);await assertCustody();guard();try{inspectPrivate(path,false);guard('before-mutation');unlinkSync(path);guard('after-mutation');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}},
  // These promises settle with physical FS work. Production storage deadline
  // wrappers are deliberately excluded from this fixture's custody ledger.
  storage:{put:async(key,bytes)=>{if(bytes.length<8||bytes.length>5242880)throw fail('storage');const path=await objectPath(key,true);guard();guard('before-mutation');await writeFile(path,bytes,{flag:'wx',mode:0o600});guard('after-mutation');inspectPrivate(path,false);await assertCustody();guard();},get:async key=>{const path=await objectPath(key);guard();inspectPrivate(path,false);const size=lstatSync(path).size;if(size<8||size>5242880)throw fail('storage');const bytes=await readFile(path);guard();await assertCustody();guard();inspectPrivate(path,false);if(bytes.length<8||bytes.length>5242880)throw fail('storage');return bytes;},delete:async key=>{try{const path=await objectPath(key);guard();try{inspectPrivate(path,false);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}guard('before-mutation');await rm(path,{force:true});guard('after-mutation');guard('final-custody');await assertCustody();guard('after-custody');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}},
  session:async person=>{const context=await o.composed.auth.$context,session=await context.internalAdapter.createSession(person.userId,false);const signature=createHmac('sha256',o.config.secret).update(session.token).digest('base64');return {...person,cookie:`${context.authCookies.sessionToken.name}=${session.token}.${signature}`};},
  canonical:async(person,path,method='GET',body)=>{
   if(!(/^\/api\/auth\/get-session$|^\/api\/explorers\/v1\/(me|account)$|^\/api\/explorers\/v1\/(collections|recommendations)\/[a-f0-9-]{36}\/editable\?status=all$/.test(path))||method==='PATCH'&&path!=='/api/explorers/v1/account')throw fail('canonical');
   const response=await fetch(`${o.apiOrigin}${path}`,{method,headers:{Cookie:person.cookie,...(method==='PATCH'?{Origin:o.origin,'Content-Type':'application/json','Idempotency-Key':randomUUID()}: {})},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});
   try{if(response.status!==200||Number(response.headers.get('content-length')??0)>4*1024*1024)throw fail('canonical');const reader=response.body?.getReader();if(!reader)throw fail('canonical');const chunks:Uint8Array[]=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4*1024*1024)throw fail('canonical');chunks.push(value);}}finally{await reader.cancel();reader.releaseLock();}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}finally{await response.body?.cancel().catch(()=>undefined);}
  },
 };
}
function validateDependencies(d:AppsControlDependencies) {
 exactKeys(d,['uuid','capability','files','storage','session','canonical']);
 for(const name of ['uuid','capability','session','canonical'] as const)if(typeof d[name]!=='function')throw fail('adapter');
 for(const [name,keys] of [['files',['assertCustody','write','read','remove']],['storage',['put','get','delete']]] as const){exactKeys(d[name],[...keys]);for(const key of keys)if(typeof (d[name] as any)[key]!=='function')throw fail('adapter');}
}
const APPS_STORAGE_BUDGET_MS=12000;
export async function createAppsControl(options:AppsControlOptions,dependencies?:AppsControlDependencies,nativeMutationGuard?:()=>void) {
 let poisoned=false;
 let operation:AppsControllerDiagnostic['operation']='initialize',phase:AppsControllerDiagnostic['phase']='ownership',boundary:AppsControllerDiagnostic['boundary']='none',diagnostic:AppsControllerDiagnostic|undefined;
 function record(category:AppsControllerDiagnostic['category'],snapshot:Omit<AppsControllerDiagnostic,'category'>={operation,phase,boundary}){if(!diagnostic)diagnostic=Object.freeze({...snapshot,category});}

 const activeDeadlines=new Map<symbol,{deadline:number;snapshot:Omit<AppsControllerDiagnostic,'category'>}>();
 const guard=(next?:AppsControllerDiagnostic['boundary'])=>{if(next)boundary=next;for(const entry of activeDeadlines.values())if(performance.now()>=entry.deadline){poisoned=true;record('deadline',{...entry.snapshot,boundary});}if(poisoned||typeof nativeMutationGuard!=='function'){record('refusal');throw fail('settlement unknown');}try{nativeMutationGuard();}catch{record('refusal');throw fail('settlement unknown');}};
 let webHost:string,d:AppsControlDependencies;
 try{validateOptions(options);webHost=new URL(options.origin).host;d=dependencies===undefined?nativeDependencies(options,guard):dependencies;validateDependencies(d);}catch{throw fail('initialization');}
 const provenance=dependencies===undefined?'native' as const:'synthetic' as const;
 let closed=false,busy=false,active:AppsIdentity|undefined;
 const pending=new Set<Promise<unknown>>(),operations=new Set<Promise<unknown>>(),keys=new Set<string>(),files=new Set<string>();
 let capability:string;try{capability=d.capability();sha.parse(capability);}catch{throw fail('initialization');}
 async function finite<T>(work:Promise<T>,settlementPhase:string,ms=12000,track=true):Promise<T>{const token=Symbol(),deadline=performance.now()+ms;const snapshot:Omit<AppsControllerDiagnostic,'category'>=settlementPhase==='control'?{operation:'control',phase:'response',boundary:'none',budgetMs:ms as 5000|10000|12000}:{operation,phase,boundary,budgetMs:ms as 5000|10000|12000};activeDeadlines.set(token,{deadline,snapshot});if(track){pending.add(work);void work.finally(()=>pending.delete(work)).catch(()=>undefined);}let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{poisoned=true;record('deadline',{...snapshot,boundary});reject(fail(`${settlementPhase} settlement unknown`));},ms);})]);}catch(error){record('refusal',snapshot);throw error;}finally{if(performance.now()>=deadline){poisoned=true;record('deadline',{...snapshot,boundary});}activeDeadlines.delete(token);if(timer)clearTimeout(timer);}}
 const q=async(db:Pool|PoolClient,text:string,values:unknown[]=[])=>finite(db.query(text,values),'database');
 const personas={} as Record<'ownerA'|'ownerB',Persona>;
 async function ownership(db:Pool|PoolClient,initial=false){
  phase='ownership';boundary='none';
  if((await q(db,'SELECT current_database() AS database')).rows[0]?.database!==options.ownedAuthority.database)throw fail('ownership');
  const rows=(await q(db,'SELECT user_id,account_id FROM initial_account_bindings WHERE user_id=ANY($1::text[])',[Object.values(options.personas).map(p=>p.userId)])).rows;
  if(rows.length!==2)throw fail('ownership');
  for(const name of ['ownerA','ownerB'] as const){const p=options.personas[name],row=rows.find(r=>r.user_id===p.userId);if(!row||!uuid.safeParse(row.account_id).success||!initial&&row.account_id!==personas[name].accountId)throw fail('ownership');if(initial)personas[name]=personaSchema.parse({...p,accountId:row.account_id});}
  if(personas.ownerA.accountId===personas.ownerB.accountId)throw fail('ownership');
 }
 try{await ownership(options.pool,true);phase='custody';await finite(d.files.assertCustody(),'custody');}catch{throw fail('initialization');}
 const accountIds=Object.values(personas).map(p=>p.accountId);
 async function refreshed(){phase='sessions';for(const name of ['ownerA','ownerB'] as const){const old=personas[name],fresh=personaSchema.parse(await finite(d.session(old),'session'));if(fresh.userId!==old.userId||fresh.accountId!==old.accountId||fresh.handle!==old.handle)throw fail('session');const session=await finite(d.canonical(fresh,'/api/auth/get-session'),'session');const me=await finite(d.canonical(fresh,'/api/explorers/v1/me'),'session');if(session.user?.id!==old.userId||me.account?.id!==old.accountId||me.account?.handle!==old.handle||me.account?.onboardingStatus!=='complete')throw fail('session');personas[name]=fresh;}}
 function identity(value:AppsIdentity){const parsed=identitySchema.parse(value);if(parsed.runId!==options.runId||parsed.commit!==options.commit)throw fail('identity');return parsed;}
 function assertAvailable(){if(closed||busy||poisoned)throw fail('unavailable');if(provenance==='native')assertComposition(options);}
 function storageKey(key:string,accountId:string,id:string){if(key!==`local/${accountId}/${id}`||!accountIds.includes(accountId)||!uuid.safeParse(id).success)throw fail('storage custody');}
 async function removeKeys(targets:Iterable<string>){phase='remove-old-object';boundary='none';const failures:string[]=[];for(const key of targets){try{await finite(d.storage.delete(key),'storage',APPS_STORAGE_BUDGET_MS);keys.delete(key);}catch{failures.push('storage');if(poisoned)break;}}if(failures.length)throw fail('cleanup storage');}
 async function removeFiles(){phase='remove-upload-file';boundary='none';const failures:string[]=[];for(const path of files){try{await finite(d.files.remove(path),'files',5000);files.delete(path);}catch{failures.push('files');if(poisoned)break;}}if(failures.length)throw fail('cleanup files');}
 async function reset(value:AppsIdentity):Promise<AppsManifest>{
  assertAvailable();const id=identity(value);operation='reset';boundary='none';busy=true;active=undefined;
  const freshKeys:string[]=[],oldKeys:string[]=[];let committed=false,rolledBack=false,rollbackStarted=false,rollbackFailed=false,abandonedConnect=false,client:PoolClient|undefined;
  async function rollback(db:PoolClient){rollbackStarted=true;const physical=db.query('ROLLBACK');void physical.then(()=>{rolledBack=true;},()=>{rollbackFailed=true;});await finite(physical,'database');}
  try{
   await ownership(options.pool);phase='custody';await finite(d.files.assertCustody(),'custody');await removeFiles();
   const plan=buildAppsSeedPlan(id.caseId),result:AppsManifest={...id,personas:{ownerA:{...personas.ownerA},ownerB:{...personas.ownerB}},collections:[],recommendations:[],memberships:[],media:[],uploadFiles:[]};
   phase='connect';const acquisition=options.pool.connect().then(leased=>{if(abandonedConnect)leased.release(fail('connect settlement'));return leased;});
   try{client=await finite(acquisition,'database');}catch{abandonedConnect=true;throw fail('connect');}phase='transaction';await q(client,'BEGIN');await q(client,"SET LOCAL statement_timeout='10000ms'");await ownership(client);phase='transaction';
   const content=(await q(client,"SELECT id,account_id,entity_id FROM recommendations WHERE account_id=ANY($1::uuid[]) AND category='apps' LIMIT 65",[accountIds])).rows;
   const ownedMedia=(await q(client,"SELECT id,account_id FROM media_assets WHERE account_id=ANY($1::uuid[]) AND purpose='recommendation' LIMIT 25",[accountIds])).rows;
   if(content.length>64||ownedMedia.length>24)throw fail('reset bounds');
   const objects=(await q(client,"SELECT mo.media_id,ma.account_id,mo.object_key,mo.storage_environment FROM media_objects mo JOIN media_assets ma ON ma.id=mo.media_id WHERE ma.account_id=ANY($1::uuid[]) AND ma.purpose='recommendation' LIMIT 25",[accountIds])).rows;
   if(objects.length>24)throw fail('reset bounds');for(const row of objects){storageKey(row.object_key,row.account_id,row.media_id);if(row.storage_environment!=='local')throw fail('storage custody');keys.add(row.object_key);oldKeys.push(row.object_key);}
   await q(client,"UPDATE analytics_event_receipts er SET event_id=NULL,retired_at=coalesce(er.retired_at,clock_timestamp()) FROM analytics_events e WHERE er.event_id=e.id AND er.account_id=e.account_id AND e.account_id=ANY($1::uuid[]) AND e.category='apps' AND (EXISTS(SELECT 1 FROM collections c WHERE c.id=e.collection_id AND c.account_id=e.account_id AND c.category='apps') OR EXISTS(SELECT 1 FROM recommendations r WHERE r.id=e.recommendation_id AND r.account_id=e.account_id AND r.category='apps'))",[accountIds]);
   await q(client,"DELETE FROM analytics_events e WHERE e.account_id=ANY($1::uuid[]) AND e.category='apps' AND (EXISTS(SELECT 1 FROM collections c WHERE c.id=e.collection_id AND c.account_id=e.account_id AND c.category='apps') OR EXISTS(SELECT 1 FROM recommendations r WHERE r.id=e.recommendation_id AND r.account_id=e.account_id AND r.category='apps'))",[accountIds]);
   await q(client,"DELETE FROM collections WHERE account_id=ANY($1::uuid[]) AND category='apps'",[accountIds]);
   await q(client,"DELETE FROM recommendations WHERE account_id=ANY($1::uuid[]) AND category='apps'",[accountIds]);
   await q(client,"DELETE FROM account_category_pin_state WHERE account_id=ANY($1::uuid[]) AND category='apps'",[accountIds]);
   const entities=[...new Set(content.map(r=>r.entity_id))];if(entities.length)await q(client,"DELETE FROM entities WHERE id=ANY($1::uuid[]) AND kind='app' AND origin='manual' AND NOT EXISTS(SELECT 1 FROM recommendations r WHERE r.entity_id=entities.id)",[entities]);
   const mediaIds=ownedMedia.map(r=>r.id);if(mediaIds.length){await q(client,"DELETE FROM media_objects WHERE media_id=ANY($1::uuid[]) AND storage_environment='local'",[mediaIds]);await q(client,"DELETE FROM media_assets WHERE id=ANY($1::uuid[]) AND account_id=ANY($2::uuid[]) AND purpose='recommendation'",[mediaIds,accountIds]);}
   for(const p of Object.values(personas)){
    await q(client,"UPDATE creator_accounts SET status='active',suspended_at=NULL,deletion_requested_at=NULL,onboarding_status='complete',handle=$2,display_name=$3,account_type='Creator',public_profile=true WHERE id=$1",[p.accountId,p.handle,`Apps ${p.handle}`]);
    await q(client,'UPDATE user_security_state SET blocked_at=NULL WHERE user_id=$1',[p.userId]);
    await q(client,"INSERT INTO account_category_settings(account_id,category,is_public,display_order) SELECT $1,'apps',true,coalesce(max(display_order)+1,0) FROM account_category_settings WHERE account_id=$1 ON CONFLICT(account_id,category) DO UPDATE SET is_public=true",[p.accountId]);
   }
   for(const [i,c] of plan.collections.entries()){const cid=uuid.parse(d.uuid());await q(client,'INSERT INTO collections(id,account_id,category,title,slug,display_order,visibility,publication_state) VALUES($1,$2,\'apps\',$3,$4,$5,$6,$7)',[cid,personas.ownerA.accountId,c.title,c.slug,i,c.visibility,c.publicationState]);result.collections.push({id:cid,title:c.title,slug:c.slug});}
   for(const [i,r] of plan.recommendations.entries()){
    const eid=uuid.parse(d.uuid()),rid=uuid.parse(d.uuid()),collectionId=result.collections[r.collectionIndex].id;
    await q(client,"INSERT INTO entities(id,kind,title,origin) VALUES($1,'app',$2,'manual')",[eid,r.title]);
    const a=r.details;await q(client,'INSERT INTO app_entity_details(entity_id,app_url,developer,logo_url,description,download_url,price_tier,platforms) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[eid,a.appUrl,a.developer,a.logoUrl,a.description,a.downloadUrl,a.priceTier,a.platforms]);
    await q(client,"INSERT INTO recommendations(id,account_id,category,entity_id,publication_state) VALUES($1,$2,'apps',$3,'published')",[rid,personas.ownerA.accountId,eid]);
    await q(client,"INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'apps',$4)",[collectionId,rid,personas.ownerA.accountId,id.caseId===APPS_CASES[3]?i%8:0]);
    result.recommendations.push({id:rid,entityId:eid,collectionId,title:r.title,developer:a.developer!});result.memberships.push({recommendationId:rid,collectionId});
   }
   for(const m of plan.media){const mid=uuid.parse(d.uuid()),accountId=personas[m.owner].accountId,key=`local/${accountId}/${mid}`,hash=createHash('sha256').update(m.bytes).digest();storageKey(key,accountId,mid);keys.add(key);freshKeys.push(key);phase='seed-put';await finite(d.storage.put(key,m.bytes),'storage',APPS_STORAGE_BUDGET_MS);phase='seed-get';const actual=await finite(d.storage.get(key),'storage',APPS_STORAGE_BUDGET_MS);if(actual.length!==m.bytes.length||!createHash('sha256').update(actual).digest().equals(hash))throw fail('storage');
    await q(client,"INSERT INTO media_assets(id,account_id,purpose,status,mime_type,byte_size,content_sha256,ready_at) VALUES($1,$2,'recommendation','ready','image/png',$3,$4,now())",[mid,accountId,m.bytes.length,hash]);
    await q(client,"INSERT INTO media_objects(media_id,variant,storage_environment,object_key,mime_type,byte_size,content_sha256) VALUES($1,'original','local',$2,'image/png',$3,$4)",[mid,key,m.bytes.length,hash]);
    for(const ri of m.recommendationIndexes)await q(client,'INSERT INTO recommendation_app_screenshots(recommendation_id,account_id,slot_index,media_id) VALUES($1,$2,0,$3)',[result.recommendations[ri].id,accountId,mid]);
    result.media.push({id:mid,owner:m.owner,length:actual.length,sha256:hash.toString('hex')});
   }
   phase='transaction';await q(client,'COMMIT');committed=true;await removeKeys(oldKeys);
   for(const [i,bytes] of plan.uploads.entries()){const name=`apps-upload-${i+1}.png`,path=join(options.fixtureFilesRoot,name);files.add(path);phase='upload-write';await finite(d.files.write(path,bytes),'files',5000);phase='upload-read';const actual=await finite(d.files.read(path),'files',5000);if(actual.length!==bytes.length||!actual.equals(bytes))throw fail('custody');result.uploadFiles.push({path,name,length:actual.length,sha256:createHash('sha256').update(actual).digest('hex')});}
   phase='sessions';await refreshed();result.personas={ownerA:{...personas.ownerA},ownerB:{...personas.ownerB}};
   const parsed=manifestSchema.parse(result);for(const arr of [parsed.collections.map(c=>c.id),parsed.recommendations.map(r=>r.id),parsed.recommendations.map(r=>r.entityId),parsed.recommendations.map(r=>r.title),parsed.media.map(m=>m.id)])if(new Set(arr).size!==arr.length)throw fail('seed uniqueness');
   active=id;return parsed;
  }catch(error){
   record('refusal');active=undefined;
   if(client&&!committed&&!poisoned){try{await rollback(client);}catch{poisoned=true;}}
   if(!committed&&!poisoned)try{await removeKeys(freshKeys);}catch{poisoned=true;}
   // A failed reset is terminal; it cannot mint a new success after partial native work.
   poisoned=true;throw fail('reset');
  }finally{
   if(client&&!pending.size)client.release(rollbackFailed?fail('rollback'):undefined);else if(client){
    const retained=client,settlements=[...pending];
    // Never return a leased connection while native work may still use it. After
    // settlement, roll back an uncommitted transaction before releasing it; the
    // original unknown-settlement failure remains terminal even if this succeeds.
    const release=(async()=>{await Promise.allSettled(settlements);try{if(!committed&&!rollbackStarted)await rollback(retained);}catch{poisoned=true;}finally{await Promise.allSettled([...pending].filter(work=>work!==release));retained.release(rollbackFailed||!committed&&!rolledBack?fail('rollback'):undefined);}})();
    pending.add(release);void release.finally(()=>pending.delete(release)).catch(()=>{poisoned=true;});
   }busy=false;
  }
 }
 async function observe(value:AppsIdentity):Promise<AppsObservation>{assertAvailable();const id=identity(value);if(!active||JSON.stringify(id)!==JSON.stringify(active))throw fail('identity');operation='observe';boundary='none';busy=true;try{
  await ownership(options.pool);phase='custody';await finite(d.files.assertCustody(),'custody');
  const cs=(await q(options.pool,"SELECT id,account_id FROM collections WHERE account_id=ANY($1::uuid[]) AND category='apps' ORDER BY account_id,display_order,id LIMIT 5",[accountIds])).rows;
  const rs=(await q(options.pool,"SELECT id,account_id FROM recommendations WHERE account_id=ANY($1::uuid[]) AND category='apps' ORDER BY account_id,created_at,id LIMIT 21",[accountIds])).rows;
  const ms=(await q(options.pool,"SELECT ci.collection_id,ci.recommendation_id,ci.display_order,c.revision::text AS collection_revision,c.archived_at IS NOT NULL AS collection_archived,r.archived_at IS NOT NULL AS recommendation_archived FROM collection_items ci JOIN collections c ON c.id=ci.collection_id AND c.account_id=ci.account_id AND c.category=ci.category JOIN recommendations r ON r.id=ci.recommendation_id AND r.account_id=ci.account_id AND r.category=ci.category WHERE ci.account_id=ANY($1::uuid[]) AND ci.category='apps' ORDER BY ci.collection_id,ci.display_order,ci.recommendation_id LIMIT 21",[accountIds])).rows;
  const media=(await q(options.pool,"SELECT id,account_id,purpose,status,byte_size,content_sha256 FROM media_assets WHERE account_id=ANY($1::uuid[]) AND purpose='recommendation' ORDER BY account_id,id LIMIT 25",[accountIds])).rows;
  const objects=(await q(options.pool,"SELECT mo.media_id,ma.account_id,mo.object_key,mo.storage_environment,mo.byte_size,mo.content_sha256 FROM media_objects mo JOIN media_assets ma ON ma.id=mo.media_id WHERE ma.account_id=ANY($1::uuid[]) AND ma.purpose='recommendation' AND mo.variant='original' LIMIT 25",[accountIds])).rows;
  if(cs.length>4||rs.length>20||ms.length>20||media.length>24||objects.length>24)throw fail('observe bounds');
  const person=(accountId:string)=>{const p=Object.values(personas).find(p=>p.accountId===accountId);if(!p)throw fail('ownership');return p;};
  phase='canonical';const result:AppsObservation={...id,collections:[],recommendations:[],memberships:[],media:[]};
  for(const row of cs){const p=person(row.account_id),dto=editableOwnerCollectionSchema.parse((await finite(d.canonical(p,`/api/explorers/v1/collections/${uuid.parse(row.id)}/editable?status=all`),'canonical')).collection);if(dto.id!==row.id||dto.accountId!==p.accountId||dto.category!=='apps')throw fail('observe');result.collections.push(dto);}
  for(const row of rs){const p=person(row.account_id),dto=editableOwnerRecommendationSchema.parse((await finite(d.canonical(p,`/api/explorers/v1/recommendations/${uuid.parse(row.id)}/editable?status=all`),'canonical')).recommendation);if(dto.id!==row.id||dto.accountId!==p.accountId||dto.category!=='apps')throw fail('observe');result.recommendations.push(dto);}
  for(const row of ms){if(!result.collections.some(c=>c.id===row.collection_id)||!result.recommendations.some(r=>r.id===row.recommendation_id))throw fail('observe');result.memberships.push(ownerMembershipDtoSchema.parse({collectionId:row.collection_id,recommendationId:row.recommendation_id,collectionRevision:Number(row.collection_revision),displayOrder:row.display_order,collectionArchived:row.collection_archived,recommendationArchived:row.recommendation_archived}));}
  for(const row of media){person(row.account_id);if(!Buffer.isBuffer(row.content_sha256)||row.content_sha256.length!==32)throw fail('observe');if(row.status==='ready'){const matching=objects.filter(o=>o.media_id===row.id);if(matching.length!==1)throw fail('observe');const object=matching[0];storageKey(object.object_key,row.account_id,row.id);if(object.account_id!==row.account_id||object.storage_environment!=='local'||Number(object.byte_size)!==Number(row.byte_size)||!Buffer.isBuffer(object.content_sha256)||!object.content_sha256.equals(row.content_sha256))throw fail('observe');}result.media.push({id:row.id,accountId:row.account_id,purpose:row.purpose,status:row.status,length:Number(row.byte_size),sha256:row.content_sha256.toString('hex')});}
  return observationSchema.parse(result);
 }catch{record('refusal');throw fail('observe');}finally{busy=false;}}
 function tracked<T>(operation:Promise<T>){operations.add(operation);void operation.finally(()=>operations.delete(operation)).catch(()=>undefined);return operation;}
 const resetTracked=(value:AppsIdentity)=>tracked(reset(value)),observeTracked=(value:AppsIdentity)=>tracked(observe(value));
 async function handle(req:IncomingMessage,res:ServerResponse):Promise<boolean>{
  if(req.url!=='/api/__apps-fixture/control')return false;
  try{assertAvailable();const presented=String(req.headers['x-apps-fixture-capability']??'');if(req.method!=='POST'||req.headers['content-type']?.split(';')[0]!=='application/json'||req.socket.remoteAddress!=='127.0.0.1'||req.headers.host!==webHost||req.headers.origin!==options.origin||!sha.safeParse(presented).success||!timingSafeEqual(Buffer.from(presented),Buffer.from(capability)))throw fail('control');let size=0;const chunks:Buffer[]=[];
   const body=await finite((async()=>{for await(const chunk of req){size+=chunk.length;if(size>4096)throw fail('control');chunks.push(Buffer.from(chunk));}return JSON.parse(Buffer.concat(chunks).toString('utf8'));})(),'control',10000);
   const parsed=validateAppsControl({remote:req.socket.remoteAddress??'',host:String(req.headers.host??''),origin:String(req.headers.origin??''),expectedHost:webHost,expectedOrigin:options.origin,capability:String(req.headers['x-apps-fixture-capability']??''),expectedCapability:capability,runId:options.runId,commit:options.commit,body,active});
   const {action,...id}=parsed,result=action==='reset'?await resetTracked(id):await observeTracked(id),json=JSON.stringify(result);if(Buffer.byteLength(json)>4*1024*1024)throw fail('control');res.statusCode=200;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(json);
  }catch{res.statusCode=403;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end('{"error":"owned Apps control denied"}');}return true;
 }
 async function close(){operation='close';phase='settlement';boundary='none';closed=true;active=undefined;const failures:string[]=[];
  // The drain itself is not native work and must not enter the set it drains.
  if(operations.size||pending.size)try{await finite(Promise.allSettled([...operations,...pending]),'cleanup settlement',10000,false);}catch{failures.push('settlement');}
  if(busy||operations.size||pending.size||poisoned)failures.push('settlement');
  if(!pending.size&&!busy){try{await removeKeys([...keys]);}catch{failures.push('storage');}try{await removeFiles();}catch{failures.push('files');}}
  if(failures.length){poisoned=true;throw fail(`cleanup ${[...new Set(failures)].join(',')}`);}
 }
 const controller={capability,provenance,reset:resetTracked,observe:observeTracked,handle,close,getDiagnostic:()=>diagnostic};if(provenance==='native')controllerDiagnostics.set(controller,()=>diagnostic);return controller;
}
