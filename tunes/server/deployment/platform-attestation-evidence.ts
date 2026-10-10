import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

export class AttestationEvidenceError extends Error { constructor(public readonly code:string) { super(code); } }
function fail(code='ATTESTATION_SCHEMA_INVALID'):never { throw new AttestationEvidenceError(code); }

/** No producer, protected executable chain or descendant containment is qualified. Do not read caller proofs or secrets. */
export async function acquireProjectAttestation():Promise<never> { return fail('PRODUCER_UNAVAILABLE'); }

export interface AttestationExpectedBinding {
 readonly repository:string;readonly repositoryId:string;readonly ref:string;readonly sourceCommit:string;
 readonly signerWorkflowPath:string;readonly signerDigest:string;readonly producerRunId:string;
 readonly producerRunAttempt:string;readonly subjectName:string;readonly subjectSha256:string;
}
export interface UnqualifiedVerifiedAttestationOutputInspection {
 readonly status:'VERIFIER_OUTPUT_STRUCTURALLY_VALID_UNQUALIFIED';readonly releaseQualified:false;
 readonly cryptographicallyVerified:false;readonly runId:string;readonly runAttempt:string;readonly subjectSha256:string;
}
const PROJECT=Object.freeze({repository:'tandavkrishna27/explorers.earth',repositoryId:'1171328761',ref:'refs/heads/codex/unified-replatform',signerWorkflowPath:'.github/workflows/platform-candidate.yml'});
const EXPECTED_KEYS=['repository','repositoryId','ref','sourceCommit','signerWorkflowPath','signerDigest','producerRunId','producerRunAttempt','subjectName','subjectSha256'] as const;
function positiveDecimal(value:string):boolean {return /^[1-9][0-9]*$/.test(value)&&Number.isSafeInteger(Number(value));}
function snapshotExpected(value:AttestationExpectedBinding):AttestationExpectedBinding {
 try {
  if(value===null||typeof value!=='object'||Array.isArray(value))fail('ATTESTATION_EXPECTED_BINDING_INVALID');
  const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
  if(keys.length!==EXPECTED_KEYS.length)fail('ATTESTATION_EXPECTED_BINDING_INVALID');
  const snapshot:Record<string,string>=Object.create(null);
  for(const key of EXPECTED_KEYS){const d=descriptors[key];if(!d||!d.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='string')fail('ATTESTATION_EXPECTED_BINDING_INVALID');snapshot[key]=d.value;}
  for(const key of ['repository','repositoryId','ref','signerWorkflowPath'] as const)if(snapshot[key]!==PROJECT[key])fail('ATTESTATION_EXPECTED_BINDING_INVALID');
  if(!positiveDecimal(snapshot.repositoryId)||!positiveDecimal(snapshot.producerRunId)||!positiveDecimal(snapshot.producerRunAttempt)||! /^[a-f0-9]{40}$/.test(snapshot.sourceCommit)||! /^[a-f0-9]{40}$/.test(snapshot.signerDigest)||! /^[a-f0-9]{64}$/.test(snapshot.subjectSha256)||snapshot.subjectName.length===0||snapshot.subjectName.length>65536)fail('ATTESTATION_EXPECTED_BINDING_INVALID');
  return Object.freeze(snapshot) as unknown as AttestationExpectedBinding;
 }catch{ return fail('ATTESTATION_EXPECTED_BINDING_INVALID'); }
}
/** Pure inspection of alleged verifier output. No trusted execution or cryptographic verification occurs. */
export function inspectUnqualifiedVerifiedAttestationOutput(stdout:Buffer,expected:AttestationExpectedBinding):UnqualifiedVerifiedAttestationOutputInspection {
 const binding=snapshotExpected(expected);
 if(!Buffer.isBuffer(stdout)||stdout.length>1024*1024)fail('ATTESTATION_OUTPUT_INPUT_LIMIT');
 try {
  const entry=record(singleton(parse(Buffer.from(stdout)))),result=record(entry.verificationResult);
  // Identity is exclusively the certificate invocation, never the predicate or caller claims.
  const signature=result.signature;
  if(signature===null||typeof signature!=='object'||Array.isArray(signature))fail('ATTESTATION_RUN_ATTEMPT_BINDING_UNAVAILABLE');
  const certificate=(signature as RecordValue).certificate;
  if(certificate===null||typeof certificate!=='object'||Array.isArray(certificate))fail('ATTESTATION_RUN_ATTEMPT_BINDING_UNAVAILABLE');
  const cert=record(certificate),invocation=cert.runInvocationURI;
  const prefix='https://github.com/'+binding.repository+'/actions/runs/';
  if(typeof invocation!=='string'||!invocation.startsWith(prefix))fail('ATTESTATION_RUN_ATTEMPT_BINDING_UNAVAILABLE');
  const match=/^([1-9][0-9]*)\/attempts\/([1-9][0-9]*)$/.exec(invocation.slice(prefix.length));
  if(!match||!positiveDecimal(match[1])||!positiveDecimal(match[2]))fail('ATTESTATION_RUN_ATTEMPT_BINDING_UNAVAILABLE');
  const runId=match[1],runAttempt=match[2];
  if(runId!==binding.producerRunId||runAttempt!==binding.producerRunAttempt)fail('ATTESTATION_RUN_ATTEMPT_BINDING_MISMATCH');
  const repoURI='https://github.com/'+binding.repository,signer=repoURI+'/'+binding.signerWorkflowPath+'@'+binding.ref;
  equal(cert.issuer,'https://token.actions.githubusercontent.com');
  for(const key of ['subjectAlternativeName','buildSignerURI','buildConfigURI'])equal(cert[key],signer);
  for(const key of ['buildSignerDigest','buildConfigDigest'])equal(cert[key],binding.signerDigest);
  for(const key of ['sourceRepositoryDigest','githubWorkflowSHA'])equal(cert[key],binding.sourceCommit);
  equal(cert.sourceRepositoryURI,repoURI);identifier(cert.sourceRepositoryIdentifier,binding.repositoryId);
  equal(cert.sourceRepositoryRef,binding.ref);equal(cert.githubWorkflowRef,binding.ref);equal(cert.githubWorkflowRepository,binding.repository);
  equal(cert.runnerEnvironment,'github-hosted');equal(cert.buildTrigger,'workflow_dispatch');equal(cert.githubWorkflowTrigger,'workflow_dispatch');
  const statement=record(result.statement);equal(statement._type,'https://in-toto.io/Statement/v1');equal(statement.predicateType,'https://slsa.dev/provenance/v1');
  const subject=record(singleton(statement.subject)),digest=record(subject.digest);
  equal(subject.name,binding.subjectName);if(Object.keys(digest).length!==1)fail();equal(digest.sha256,binding.subjectSha256);
  const predicate=record(statement.predicate),definition=record(predicate.buildDefinition);
  equal(definition.buildType,'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1');
  const workflow=record(at(definition.externalParameters,'workflow'));
  equal(workflow.path,binding.signerWorkflowPath);equal(workflow.ref,binding.ref);equal(workflow.repository,repoURI);
  const github=record(at(definition.internalParameters,'github'));equal(github.event_name,'workflow_dispatch');identifier(github.repository_id,binding.repositoryId);
  const dependency=record(singleton(definition.resolvedDependencies));equal(at(dependency.digest,'gitCommit'),binding.sourceCommit);equal(dependency.uri,'git+'+repoURI+'@'+binding.ref);
  const run=record(predicate.runDetails);equal(at(run.builder,'id'),'https://github.com/actions/runner/github-hosted');equal(at(run.metadata,'invocationId'),invocation);
  const bundle=record(at(entry.attestation,'bundle'));equal(bundle.mediaType,'application/vnd.dev.sigstore.bundle.v0.3+json');
  base64(at(at(bundle.verificationMaterial,'certificate'),'rawBytes'));
  const envelope=record(bundle.dsseEnvelope);equal(envelope.payloadType,'application/vnd.in-toto+json');
  if(!isDeepStrictEqual(parse(base64(envelope.payload)),statement))fail();
  base64(record(singleton(envelope.signatures)).sig);
  return Object.freeze({status:'VERIFIER_OUTPUT_STRUCTURALLY_VALID_UNQUALIFIED',releaseQualified:false,cryptographicallyVerified:false,runId,runAttempt,subjectSha256:binding.subjectSha256});
 }catch(error){
  if(error instanceof AttestationEvidenceError&&['ATTESTATION_RUN_ATTEMPT_BINDING_UNAVAILABLE','ATTESTATION_RUN_ATTEMPT_BINDING_MISMATCH'].includes(error.code))return fail(error.code);
  return fail('ATTESTATION_OUTPUT_SCHEMA_INVALID');
 }
}

// Historical official test-fixture policy only. These identifiers are never defaults for this project's authority.
const FIXTURE=Object.freeze({
 repo:'actions/attest-demo',repoId:'763287532',owner:'actions',ownerId:'44036562',ref:'refs/heads/main',
 sha:'a6c23b9806c593664f68637c8f9d45dfcf98b2db',workflow:'.github/workflows/build-python.yml',
 run:'8788389601',attempt:'1',trigger:'workflow_dispatch',
 name:'github_provenance_demo-0.0.12-py3-none-any.whl',digest:'ae57936def59bc4c75edd3a837d89bcefc6d3a5e31d55a6fa7a71624f92c3c3b',
});
type RecordValue=Record<string,unknown>;
function record(value:unknown):RecordValue { if(value===null||typeof value!=='object'||Array.isArray(value))fail();return value as RecordValue; }
function at(value:unknown,key:string):unknown { return record(value)[key]; }
function equal(value:unknown,expected:string):void { if(typeof value!=='string'||value!==expected)fail(); }
function identifier(value:unknown,expected:string):void { if(typeof value!=='string'||! /^[1-9][0-9]*$/.test(value)||!Number.isSafeInteger(Number(value)))fail();equal(value,expected); }
function singleton(value:unknown):unknown { if(!Array.isArray(value)||value.length!==1)fail();return value[0]; }
function boundedShape(value:unknown):void {
 let nodes=0;
 const visit=(item:unknown,depth:number):void=>{
  if(++nodes>2048||depth>16)fail();
  if(typeof item==='string'){if(item.length>65536)fail();return;}
  if(typeof item==='number'){if(!Number.isFinite(item))fail();return;}
  if(item===null||typeof item==='boolean')return;
  if(typeof item!=='object')fail();
  const keys=Object.keys(item as object);
  if(Array.isArray(item)&&item.length>8)fail();
  for(let index=0;index<keys.length;index++){
   const key=keys[index];if(key.length>256||['__proto__','constructor','prototype'].includes(key))fail();
   visit((item as RecordValue)[key],depth+1);
  }
 };
 visit(value,0);
}
function parse(bytes:Buffer):unknown {
 try {const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));boundedShape(value);return value;}
 catch(error){if(error instanceof AttestationEvidenceError)throw error;return fail();}
}
function base64(value:unknown):Buffer {
 if(typeof value!=='string'||value.length===0||value.length>65536||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))fail();
 const bytes=Buffer.from(value,'base64');if(bytes.toString('base64')!==value)fail();return bytes;
}
export interface UnqualifiedFixtureInspection {
 readonly status:'UNQUALIFIED_FIXTURE_SCHEMA_MATCH';readonly releaseQualified:false;readonly cryptographicallyVerified:false;
 readonly subjectSha256:string;readonly signingTimestamp:string;
}
/** Schema inspection ONLY: arbitrary JSON, including a perfect forgery, never becomes crypto or project authority. */
export function inspectUnqualifiedOfficialAttestationFixture(stdout:Buffer,artifact:Buffer):UnqualifiedFixtureInspection {
 if(!Buffer.isBuffer(stdout)||!Buffer.isBuffer(artifact)||stdout.length>1024*1024||artifact.length>8*1024*1024)fail('ATTESTATION_INPUT_LIMIT');
 const stdoutSnapshot=Buffer.from(stdout),artifactSnapshot=Buffer.from(artifact);
 if(createHash('sha256').update(artifactSnapshot).digest('hex')!==FIXTURE.digest)fail('FIXTURE_SUBJECT_MISMATCH');
 const entry=record(singleton(parse(stdoutSnapshot))),result=record(entry.verificationResult);
 const cert=record(at(result.signature,'certificate'));
 const repoURI='https://github.com/'+FIXTURE.repo,signer=repoURI+'/'+FIXTURE.workflow+'@'+FIXTURE.ref;
 const invocation=repoURI+'/actions/runs/'+FIXTURE.run+'/attempts/'+FIXTURE.attempt;
 equal(cert.issuer,'https://token.actions.githubusercontent.com');
 const signerFields=['subjectAlternativeName','buildSignerURI','buildConfigURI'];
 for(let i=0;i<signerFields.length;i++)equal(cert[signerFields[i]],signer);
 const digestFields=['buildSignerDigest','buildConfigDigest','sourceRepositoryDigest','githubWorkflowSHA'];
 for(let i=0;i<digestFields.length;i++)equal(cert[digestFields[i]],FIXTURE.sha);
 equal(cert.sourceRepositoryURI,repoURI);identifier(cert.sourceRepositoryIdentifier,FIXTURE.repoId);
 equal(cert.sourceRepositoryOwnerURI,'https://github.com/'+FIXTURE.owner);identifier(cert.sourceRepositoryOwnerIdentifier,FIXTURE.ownerId);
 equal(cert.sourceRepositoryRef,FIXTURE.ref);equal(cert.githubWorkflowRef,FIXTURE.ref);equal(cert.githubWorkflowRepository,FIXTURE.repo);
 equal(cert.runnerEnvironment,'github-hosted');equal(cert.buildTrigger,FIXTURE.trigger);equal(cert.githubWorkflowTrigger,FIXTURE.trigger);
 equal(cert.runInvocationURI,invocation);
 const timestamp=record(singleton(result.verifiedTimestamps));
 equal(timestamp.type,'TimestampAuthority');equal(timestamp.uri,'timestamp.githubapp.com');
 const signedAt=timestamp.timestamp;
 if(typeof signedAt!=='string'||! /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(signedAt))fail();
 const time=new Date(signedAt);if(!Number.isFinite(time.getTime())||time.toISOString()!==(signedAt.includes('.')?signedAt:signedAt.slice(0,-1)+'.000Z'))fail();
 const statement=record(result.statement);equal(statement._type,'https://in-toto.io/Statement/v1');equal(statement.predicateType,'https://slsa.dev/provenance/v1');
 const subject=record(singleton(statement.subject)),digest=record(subject.digest);equal(subject.name,FIXTURE.name);
 if(Object.keys(digest).length!==1)fail();equal(digest.sha256,FIXTURE.digest);
 // Predicate consistency is checked against fixed certificate policy; predicate claims never supply identity.
 const predicate=record(statement.predicate),definition=record(predicate.buildDefinition);
 equal(definition.buildType,'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1');
 const workflow=record(at(definition.externalParameters,'workflow'));
 equal(workflow.path,FIXTURE.workflow);equal(workflow.ref,FIXTURE.ref);equal(workflow.repository,repoURI);
 const github=record(at(definition.internalParameters,'github'));
 equal(github.event_name,FIXTURE.trigger);identifier(github.repository_id,FIXTURE.repoId);identifier(github.repository_owner_id,FIXTURE.ownerId);
 const dependency=record(singleton(definition.resolvedDependencies));equal(at(dependency.digest,'gitCommit'),FIXTURE.sha);equal(dependency.uri,'git+'+repoURI+'@'+FIXTURE.ref);
 const run=record(predicate.runDetails);equal(at(run.builder,'id'),'https://github.com/actions/runner/github-hosted');equal(at(run.metadata,'invocationId'),invocation);
 const bundle=record(at(entry.attestation,'bundle'));equal(bundle.mediaType,'application/vnd.dev.sigstore.bundle.v0.3+json');
 base64(at(at(bundle.verificationMaterial,'certificate'),'rawBytes'));
 const envelope=record(bundle.dsseEnvelope);equal(envelope.payloadType,'application/vnd.in-toto+json');
 if(!isDeepStrictEqual(parse(base64(envelope.payload)),statement))fail();
 const signature=record(singleton(envelope.signatures));base64(signature.sig);
 return Object.freeze({status:'UNQUALIFIED_FIXTURE_SCHEMA_MATCH',releaseQualified:false,cryptographicallyVerified:false,subjectSha256:FIXTURE.digest,signingTimestamp:signedAt});
}
