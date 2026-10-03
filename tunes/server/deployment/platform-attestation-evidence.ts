import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

export class AttestationEvidenceError extends Error { constructor(public readonly code:string) { super(code); } }
function fail(code='ATTESTATION_SCHEMA_INVALID'):never { throw new AttestationEvidenceError(code); }

/** No producer, protected executable chain or descendant containment is qualified. Do not read caller proofs or secrets. */
export async function acquireProjectAttestation():Promise<never> { return fail('PRODUCER_UNAVAILABLE'); }

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
