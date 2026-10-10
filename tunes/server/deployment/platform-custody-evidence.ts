import {inspectUnqualifiedCustodyArchive} from './platform-artifact-evidence';
import {parseStrictJson,parseRelease,canonicalDigest} from './platform-release-contract';
import {CANDIDATE_CI_POLICY} from '../../../scripts/platform-release-authority';
import type {CandidateCiJobObservation} from '../../../scripts/platform-release-authority';

type Code='CUSTODY_EXPECTED_INVALID'|'CUSTODY_INPUT_INVALID'|'CUSTODY_JSON_INVALID'|'CUSTODY_BINDING_INVALID'|'CUSTODY_ARCHIVE_INVALID';
export class CustodyEvidenceError extends Error { constructor(readonly code:Code){super(code);this.name='CustodyEvidenceError';} }
function fail(code:Code='CUSTODY_BINDING_INVALID'):never{throw new CustodyEvidenceError(code);}
type Obj=Record<string,unknown>;
const SHA=/^sha256:[a-f0-9]{64}$/,SOURCE=/^[a-f0-9]{40}$/;
const FILES=['qualification.json','api-smoke-amd64.json','web-smoke-amd64.json'] as const;
const WORKFLOW='.github/workflows/platform-candidate.yml';
function id(v:unknown):v is string{return typeof v==='string'&&/^[1-9][0-9]{0,15}$/.test(v)&&Number.isSafeInteger(Number(v));}
function sha(v:unknown):v is string{return typeof v==='string'&&SHA.test(v);}
function obj(v:unknown,keys:readonly string[],code:Code='CUSTODY_BINDING_INVALID'):Obj{
 try{if(!v||typeof v!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail(code);
 const names=Reflect.ownKeys(v);if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))fail(code);
 const copy:Obj=Object.create(null);for(const key of keys){const d=Object.getOwnPropertyDescriptor(v,key);if(!d||!d.enumerable||!Object.hasOwn(d,'value'))fail(code);copy[key]=d.value;}return copy;
 }catch{return fail(code);}
}
export type CustodyArtifactExpected=Readonly<{artifactId:string;name:string;archiveDigest:string}>;
export type DetachedCustodyExpected=Readonly<{sourceCommit:string;producerRunId:string;producerRunAttempt:string;envelope:CustodyArtifactExpected;manifest:CustodyArtifactExpected;evidence:CustodyArtifactExpected}>;
function expectedSnapshot(value:DetachedCustodyExpected){
 const code='CUSTODY_EXPECTED_INVALID' as const,e=obj(value,['sourceCommit','producerRunId','producerRunAttempt','envelope','manifest','evidence'],code);
 if(typeof e.sourceCommit!=='string'||!SOURCE.test(e.sourceCommit)||!id(e.producerRunId)||!id(e.producerRunAttempt))fail(code);
 const snapshots:Record<string,CustodyArtifactExpected>=Object.create(null),ids=new Set<string>();
 for(const [key,prefix] of [['envelope','custody'],['manifest','release'],['evidence','evidence']] as const){const a=obj(e[key],['artifactId','name','archiveDigest'],code);
 if(!id(a.artifactId)||ids.has(a.artifactId)||a.name!==`platform-${prefix}-${e.producerRunId}-attempt-${e.producerRunAttempt}`||!sha(a.archiveDigest))fail(code);ids.add(a.artifactId);snapshots[key]=Object.freeze(a as CustodyArtifactExpected);}
 return {sourceCommit:e.sourceCommit,producerRunId:e.producerRunId,producerRunAttempt:e.producerRunAttempt,artifacts:snapshots};
}
function parse(text:string):unknown{
 try{const value=parseStrictJson(text);let nodes=0;
 const visit=(v:unknown,depth:number):void=>{if(++nodes>4096||depth>16)fail('CUSTODY_JSON_INVALID');if(typeof v==='string'&&v.length>1024)fail('CUSTODY_JSON_INVALID');if(typeof v==='number'&&!Number.isFinite(v))fail('CUSTODY_JSON_INVALID');if(v&&typeof v==='object'){if(Array.isArray(v)&&v.length>128)fail('CUSTODY_JSON_INVALID');for(const [k,child] of Object.entries(v)){if(k.length>128||['__proto__','constructor','prototype'].includes(k))fail('CUSTODY_JSON_INVALID');visit(child,depth+1);}}};visit(value,0);return value;
 }catch{return fail('CUSTODY_JSON_INVALID');}
}
function ci(value:unknown,source:string):void{
 const c=obj(value,['frontend','backend']),runs=new Set<string>(),jobs=new Set<number>();
 for(const [i,key] of ['frontend','backend'].entries()){
 const r=obj(c[key],['sourceCommit','runId','runAttempt','workflowId','workflowPath','jobs']),policy=CANDIDATE_CI_POLICY.workflows[i];
 if(r.sourceCommit!==source||!id(r.runId)||!id(r.runAttempt)||runs.has(r.runId)||r.workflowId!==policy.id||r.workflowPath!==policy.path||!Array.isArray(r.jobs)||r.jobs.length!==policy.jobs.length)fail();runs.add(r.runId);
 for(const [j,entry] of r.jobs.entries()){const p=policy.jobs[j],job=obj(entry,['key','name','jobId','conclusion']);
 if(job.key!==p.key||job.name!==p.name||typeof job.jobId!=='number'||!Number.isSafeInteger(job.jobId)||job.jobId<=0||jobs.has(job.jobId)||!(job.conclusion==='success'||p.allowSkipped&&job.conclusion==='skipped'))fail();jobs.add(job.jobId);
 // Keep the structural shape aligned with the accepted observer's public job ABI.
 const binding:CandidateCiJobObservation={key:p.key,name:p.name,jobId:job.jobId,conclusion:job.conclusion as 'success'|'skipped'};void binding;
 }
 }
}
export interface UnqualifiedDetachedCustody {
 readonly status:'DETACHED_CUSTODY_STRUCTURALLY_VALID_UNQUALIFIED';readonly releaseQualified:false;readonly cryptographicallyVerified:false;
 readonly executedSmokeVerified:false;readonly layerContentsVerified:false;readonly registryAuthenticated:false;
 readonly sourceCommit:string;readonly producerRunId:string;readonly producerRunAttempt:string;
 readonly envelopeRawFileDigest:string;readonly manifestRawFileDigest:string;readonly manifestCanonicalDigest:string;
 readonly artifacts:Readonly<{envelope:CustodyArtifactExpected;manifest:CustodyArtifactExpected;evidence:CustodyArtifactExpected}>;
}
/** Caller comparisons and byte consistency only. Neither signatures nor executed receipts are accepted as authority. */
export async function inspectUnqualifiedDetachedCustody(envelopeArchive:Buffer,manifestArchive:Buffer,evidenceArchive:Buffer,expected:DetachedCustodyExpected):Promise<UnqualifiedDetachedCustody>{
 try{
 const e=expectedSnapshot(expected);
 const inputs=[envelopeArchive,manifestArchive,evidenceArchive];if(inputs.some(b=>!Buffer.isBuffer(b)||b.length>8*1024*1024))fail('CUSTODY_INPUT_INVALID');
 // All three inputs and comparison primitives are copied synchronously before the first await.
 const copies=inputs.map(b=>Buffer.from(b));
 const envelope=await inspectUnqualifiedCustodyArchive(copies[0],e.artifacts.envelope.archiveDigest,'envelope');
 const manifest=await inspectUnqualifiedCustodyArchive(copies[1],e.artifacts.manifest.archiveDigest,'manifest');
 const evidence=await inspectUnqualifiedCustodyArchive(copies[2],e.artifacts.evidence.archiveDigest,'evidence');
 const v=obj(parse(envelope.files['custody-envelope.json']),['policyVersion','repository','workflowPath','workflowRef','sourceCommit','producerRunId','producerRunAttempt','architecture','ci','images','manifest','evidence']);
 if(v.policyVersion!==CANDIDATE_CI_POLICY.version||v.repository!==CANDIDATE_CI_POLICY.repository||v.workflowPath!==WORKFLOW||v.workflowRef!==CANDIDATE_CI_POLICY.ref||v.sourceCommit!==e.sourceCommit||v.producerRunId!==e.producerRunId||v.producerRunAttempt!==e.producerRunAttempt||v.architecture!=='linux/amd64')fail();
 ci(v.ci,e.sourceCommit);
 const m=obj(v.manifest,['artifactId','name','archiveDigest','rawFileDigest','canonicalDigest']),ev=obj(v.evidence,['artifactId','name','archiveDigest','files']);
 for(const [binding,key] of [[m,'manifest'],[ev,'evidence']] as const)for(const field of ['artifactId','name','archiveDigest'] as const)if(binding[field]!==e.artifacts[key][field])fail();
 if(m.rawFileDigest!==manifest.rawFileDigests['release-manifest.json']||!sha(m.canonicalDigest))fail();
 const ef=obj(ev.files,FILES);for(const name of FILES){const file=obj(ef[name],['rawFileDigest']);if(file.rawFileDigest!==evidence.rawFileDigests[name])fail();parse(evidence.files[name]);}
 let release;try{release=parseRelease(parse(manifest.files['release-manifest.json']));}catch(error){if(error instanceof CustodyEvidenceError)throw error;return fail();}
 if(release.sourceCommit!==e.sourceCommit||release.producerRunId!==e.producerRunId||release.producerWorkflow!==WORKFLOW||release.testEvidenceRef!==`artifact:${e.producerRunId}/${e.artifacts.evidence.name}`||release.manifestDigest!==m.canonicalDigest||canonicalDigest(release)!==m.canonicalDigest)fail();
 const images=obj(v.images,['api','web']);for(const key of ['api','web'] as const){const image=obj(images[key],['repository','manifestDigest','configDigest','layerDigests']),r=release.images[key];
 if(Array.isArray(image.layerDigests)&&new Set([image.manifestDigest,image.configDigest,...image.layerDigests]).size!==image.layerDigests.length+2)fail();
 if(image.repository!==r.repository||image.manifestDigest!==r.digest||!sha(image.configDigest)||!Array.isArray(image.layerDigests)||image.layerDigests.length>64||image.layerDigests.some(d=>!sha(d))||new Set(image.layerDigests).size!==image.layerDigests.length||Object.keys(r.platforms).length!==1||!r.platforms['linux/amd64']||r.platforms['linux/amd64'].digest!==image.manifestDigest||r.platforms['linux/amd64'].smokeEvidenceRef!==`artifact:${e.producerRunId}/${e.artifacts.evidence.name}`)fail();
 }
 const artifacts=Object.freeze({envelope:e.artifacts.envelope,manifest:e.artifacts.manifest,evidence:e.artifacts.evidence});
 return Object.freeze({status:'DETACHED_CUSTODY_STRUCTURALLY_VALID_UNQUALIFIED',releaseQualified:false,cryptographicallyVerified:false,executedSmokeVerified:false,layerContentsVerified:false,registryAuthenticated:false,sourceCommit:e.sourceCommit,producerRunId:e.producerRunId,producerRunAttempt:e.producerRunAttempt,envelopeRawFileDigest:envelope.rawFileDigests['custody-envelope.json'],manifestRawFileDigest:manifest.rawFileDigests['release-manifest.json'],manifestCanonicalDigest:release.manifestDigest,artifacts});
 }catch(error){if(error instanceof CustodyEvidenceError)throw error;return fail('CUSTODY_ARCHIVE_INVALID');}
}
