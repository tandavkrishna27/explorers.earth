import {createHash} from 'node:crypto';
import {parseStrictJson,parseRelease,type ReleaseManifest} from './platform-release-contract';

export class OciEvidenceError extends Error { constructor(public readonly code:string){super(code);} }
function fail(code='OCI_METADATA_INVALID'):never {throw new OciEvidenceError(code);}
/** Producer, registry transport and cryptographic authority are not qualified. No caller argument is inspected. */
export async function acquireProjectOciEvidence():Promise<never>{return fail('PRODUCER_UNAVAILABLE');}
const INDEX='application/vnd.oci.image.index.v1+json',MANIFEST='application/vnd.oci.image.manifest.v1+json',CONFIG='application/vnd.oci.image.config.v1+json';
const SHA=/^sha256:[a-f0-9]{64}$/;
type Obj=Record<string,unknown>;
function obj(v:unknown):Obj{if(v===null||typeof v!=='object'||Array.isArray(v))fail();return v as Obj;}
function list(v:unknown):unknown[]{if(!Array.isArray(v))fail();return v;}
function str(v:unknown):string{if(typeof v!=='string')fail();return v;}
function hash(b:Buffer):string{return 'sha256:'+createHash('sha256').update(b).digest('hex');}
function limit():never{return fail('OCI_METADATA_LIMIT');}
function shape(v:unknown):void{
 let count=0;
 const visit=(item:unknown,depth:number):void=>{
  if(++count>2048||depth>16)limit();
  if(typeof item==='string'){if(item.length>8192)limit();return;}
  if(typeof item==='number'){if(!Number.isFinite(item))fail();return;}
  if(item===null||typeof item==='boolean')return;
  if(typeof item!=='object')fail();
  const keys=Object.keys(item as object);if(Array.isArray(item)&&item.length>128)limit();
  for(let i=0;i<keys.length;i++){const key=keys[i];if(key.length>256)limit();if(['__proto__','constructor','prototype'].includes(key))fail();visit((item as Obj)[key],depth+1);}
 };visit(v,0);
}
function parse(b:Buffer):unknown{
 try{
  // The backend parser canonicalizes internally only to validate JSON values, never to compare OCI digests.
  const v=parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(b));shape(v);return v;
 }catch(e){if(e instanceof OciEvidenceError)throw e;return fail();}
}
function fields(v:Obj,allowed:string[]):void{const keys=Object.keys(v);for(let i=0;i<keys.length;i++)if(!allowed.includes(keys[i]))fail('OCI_PROFILE_UNSUPPORTED');}
function stringMap(v:unknown,max=32):void{const m=obj(v),keys=Object.keys(m);if(keys.length>max)limit();for(let i=0;i<keys.length;i++){if(str(m[keys[i]]).length>4096)limit();}}
function annotations(v:unknown):void{if(v===undefined)return;stringMap(v);const m=obj(v),keys=Object.keys(m);for(let i=0;i<keys.length;i++)if(keys[i].startsWith('vnd.docker.reference.'))fail('OCI_PROFILE_UNSUPPORTED');}
function platform(v:unknown):string{
 const p=obj(v);fields(p,['os','architecture','variant']);
 const os=str(p.os),arch=str(p.architecture);
 if(os!=='linux')fail('OCI_MEMBERSHIP_MISMATCH');if(!['amd64','arm64'].includes(arch))fail('OCI_PROFILE_UNSUPPORTED');
 if(Object.hasOwn(p,'variant')&&(typeof p.variant!=='string'||p.variant!==(arch==='amd64'?'v1':'v8')))fail('OCI_PROFILE_UNSUPPORTED');
 return os+'/'+arch;
}
type Descriptor={mediaType:string;digest:string;size:number;source:Obj};
function descriptor(v:unknown):Descriptor{
 const d=obj(v),mediaType=str(d.mediaType),digest=str(d.digest),size=d.size;
 if(!SHA.test(digest)||typeof size!=='number'||!Number.isSafeInteger(size)||size<0)fail();
 return {mediaType,digest,size,source:d};
}
function descriptorProfile(d:Descriptor,hasPlatform=false):void{
 fields(d.source,hasPlatform?['mediaType','digest','size','platform','annotations']:['mediaType','digest','size','annotations']);annotations(d.source.annotations);
}
type PlatformFacts={readonly childDigest:string;readonly configDigest:string};
type ImageFacts={readonly rootDigest:string;readonly rootKind:'index'|'manifest';readonly platforms:Readonly<Record<string,PlatformFacts>>};
export interface UnqualifiedOciGraph{
 readonly status:'OCI_GRAPH_STRUCTURALLY_VALID_UNQUALIFIED';readonly releaseQualified:false;readonly cryptographicallyVerified:false;
 readonly registryAuthenticated:false;readonly runtimeVerified:false;readonly layerContentsVerified:false;readonly executedSmokeVerified:false;
 readonly images:Readonly<{api:ImageFacts;web:ImageFacts}>;
}
function runtime(v:unknown):void{
 if(v===null)return;const r=obj(v);fields(r,['User','Env','Entrypoint','Cmd','WorkingDir','Labels','ExposedPorts','Volumes','StopSignal','ArgsEscaped']);
 const text=['User','WorkingDir','StopSignal'];for(let i=0;i<text.length;i++)if(r[text[i]]!==undefined)str(r[text[i]]);
 const arrays=['Env','Entrypoint','Cmd'];for(let i=0;i<arrays.length;i++){const a=r[arrays[i]];if(a!==undefined){const entries=list(a);for(let j=0;j<entries.length;j++)str(entries[j]);}}
 if(r.Labels!==undefined)stringMap(r.Labels,128);
 const maps=['ExposedPorts','Volumes'];for(let i=0;i<maps.length;i++)if(r[maps[i]]!==undefined){const map=obj(r[maps[i]]),keys=Object.keys(map);if(keys.length>32)limit();for(let j=0;j<keys.length;j++)if(Object.keys(obj(map[keys[j]])).length!==0)fail();}
 if(r.ArgsEscaped!==undefined&&typeof r.ArgsEscaped!=='boolean')fail();
}
function config(v:unknown,layerCount:number):string{
 const c=obj(v);fields(c,['architecture','os','variant','rootfs','created','author','config','history']);
 const p:Obj={architecture:c.architecture,os:c.os};if(Object.hasOwn(c,'variant'))p.variant=c.variant;
 const arch=platform(p),root=obj(c.rootfs);fields(root,['type','diff_ids']);if(root.type!=='layers')fail();
 const diffs=list(root.diff_ids);if(diffs.length>64)limit();if(diffs.length!==layerCount)fail();for(let i=0;i<diffs.length;i++)if(!SHA.test(str(diffs[i])))fail();
 if(c.created!==undefined)str(c.created);if(c.author!==undefined)str(c.author);if(c.config!==undefined)runtime(c.config);
 if(c.history!==undefined){const history=list(c.history);if(history.length>128)limit();for(let i=0;i<history.length;i++){const h=obj(history[i]);fields(h,['created','created_by','author','comment','empty_layer']);const names=['created','created_by','author','comment'];for(let j=0;j<names.length;j++)if(h[names[j]]!==undefined)str(h[names[j]]);if(h.empty_layer!==undefined&&typeof h.empty_layer!=='boolean')fail();}}
 return arch;
}
function image(expected:ReleaseManifest['images']['api'],buffers:Buffer[]):ImageFacts{
 const bytes=new Map<string,Buffer>(),used=new Set<string>(),cache=new Map<string,unknown>();
 for(let i=0;i<buffers.length;i++){const key=hash(buffers[i]);if(bytes.has(key))fail('OCI_DUPLICATE_BYTES');bytes.set(key,buffers[i]);}
 const get=(digest:string,size?:number):unknown=>{
  const b=bytes.get(digest);if(!b)fail('OCI_BYTES_MISMATCH');if(size!==undefined&&b.length!==size)fail('OCI_DESCRIPTOR_MISMATCH');
  used.add(digest);if(!cache.has(digest))cache.set(digest,parse(b));return cache.get(digest);
 };
 const referenced=(d:Descriptor):unknown=>{if(d.size===0)fail();if(d.size>65536)limit();return get(d.digest,d.size);};
 const ordinary=(v:unknown,kind:string):Obj=>{
  const document=obj(v);if(typeof document.schemaVersion!=='number'||typeof document.mediaType!=='string')fail();
  if(document.schemaVersion!==2||document.mediaType!==kind)fail('OCI_PROFILE_UNSUPPORTED');
  fields(document,kind===INDEX?['schemaVersion','mediaType','manifests','annotations']:['schemaVersion','mediaType','config','layers','annotations']);annotations(document.annotations);return document;
 };
 const facts:Record<string,PlatformFacts>=Object.create(null);
 const child=(digest:string,document:unknown,expectedPlatform?:string):void=>{
  const m=ordinary(document,MANIFEST),cd=descriptor(m.config),cv=referenced(cd);descriptorProfile(cd);
  if(cd.mediaType!==CONFIG)fail('OCI_PROFILE_UNSUPPORTED');
  const layers=list(m.layers);if(layers.length>64)limit();
  for(let i=0;i<layers.length;i++){const d=descriptor(layers[i]);descriptorProfile(d);if(!['application/vnd.oci.image.layer.v1.tar','application/vnd.oci.image.layer.v1.tar+gzip','application/vnd.oci.image.layer.v1.tar+zstd'].includes(d.mediaType))fail('OCI_PROFILE_UNSUPPORTED');}
  const key=config(cv,layers.length);if(expectedPlatform!==undefined&&key!==expectedPlatform)fail('OCI_MEMBERSHIP_MISMATCH');
  if(!Object.hasOwn(expected.platforms,key)||expected.platforms[key].digest!==digest||Object.hasOwn(facts,key))fail('OCI_MEMBERSHIP_MISMATCH');
  facts[key]=Object.freeze({childDigest:digest,configDigest:cd.digest});
 };
 const root=obj(get(expected.digest));let rootKind:'index'|'manifest';
 if(root.mediaType===INDEX){
  rootKind='index';const index=ordinary(root,INDEX),entries=list(index.manifests);if(entries.length<1)fail();if(entries.length>2)fail('OCI_PROFILE_UNSUPPORTED');
  for(let i=0;i<entries.length;i++){
   const d=descriptor(entries[i]),document=referenced(d);descriptorProfile(d,true);
   if(d.mediaType!==MANIFEST)fail('OCI_PROFILE_UNSUPPORTED');
   if(str(obj(document).mediaType)!==d.mediaType)fail('OCI_DESCRIPTOR_MISMATCH');
   const key=platform(d.source.platform);if(!Object.hasOwn(expected.platforms,key)||expected.platforms[key].digest!==d.digest||Object.hasOwn(facts,key))fail('OCI_MEMBERSHIP_MISMATCH');
   child(d.digest,document,key);
  }
 }else if(root.mediaType===MANIFEST){rootKind='manifest';if(Object.keys(expected.platforms).length!==1)fail('OCI_MEMBERSHIP_MISMATCH');child(expected.digest,root);}
 else if(typeof root.mediaType!=='string')fail();else return fail('OCI_PROFILE_UNSUPPORTED');
 if(Object.keys(facts).length!==Object.keys(expected.platforms).length)fail('OCI_MEMBERSHIP_MISMATCH');
 if(used.size!==bytes.size)fail('OCI_UNUSED_BYTES');
 return Object.freeze({rootDigest:expected.digest,rootKind,platforms:Object.freeze(facts)});
}
/** Pure caller-byte consistency inspection: never registry, crypto, runtime, smoke or release authority. */
export function inspectUnqualifiedReleaseOciGraph(release:Buffer,api:readonly Buffer[],web:readonly Buffer[]):UnqualifiedOciGraph{
 if(!Buffer.isBuffer(release)||release.length>65536||!Array.isArray(api)||!Array.isArray(web)||api.length<1||web.length<1||api.length>5||web.length>5)fail('OCI_INPUT_LIMIT');
 let total=release.length;
 const groups=[api,web];for(let i=0;i<groups.length;i++)for(let j=0;j<groups[i].length;j++){const b=groups[i][j];if(!Buffer.isBuffer(b)||b.length>65536)fail('OCI_INPUT_LIMIT');total+=b.length;}
 if(total>704*1024)fail('OCI_INPUT_LIMIT');
 const releaseBytes=Buffer.from(release),snapshots:Buffer[][]=[[],[]];for(let i=0;i<groups.length;i++)for(let j=0;j<groups[i].length;j++)snapshots[i].push(Buffer.from(groups[i][j]));
 let manifest:ReleaseManifest;try{manifest=parseRelease(parse(releaseBytes));}catch(e){if(e instanceof OciEvidenceError)throw e;return fail();}
 const images=Object.freeze({api:image(manifest.images.api,snapshots[0]),web:image(manifest.images.web,snapshots[1])});
 return Object.freeze({status:'OCI_GRAPH_STRUCTURALLY_VALID_UNQUALIFIED',releaseQualified:false,cryptographicallyVerified:false,registryAuthenticated:false,runtimeVerified:false,layerContentsVerified:false,executedSmokeVerified:false,images});
}
