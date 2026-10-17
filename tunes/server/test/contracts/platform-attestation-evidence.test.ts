import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {acquireProjectAttestation,inspectUnqualifiedOfficialAttestationFixture as inspectFixture} from '../../deployment/platform-attestation-evidence';
import * as attestationModule from '../../deployment/platform-attestation-evidence';
const path='./fixtures/platform-attestation/';
const raw=()=>readFileSync(new URL(path+'gh-2.87.3-verified-fixture.json',import.meta.url));
const artifact=()=>readFileSync(new URL(path+'github_provenance_demo-0.0.12-py3-none-any.whl',import.meta.url));
const parsed=()=>JSON.parse(raw().toString('utf8'));
const changed=(fn:(entry:any,entries:any[])=>void)=>{const entries=parsed();fn(entries[0],entries);return Buffer.from(JSON.stringify(entries));};
const invalid=(stdout:Buffer)=>expect(()=>inspectFixture(stdout,artifact())).toThrowError('ATTESTATION_SCHEMA_INVALID');
describe('unqualified pinned official verifier fixture schema',()=>{
 it('checks immutable original fixture provenance',()=>{expect(createHash('sha256').update(raw()).digest('hex')).toBe('4d2ee70e1e69635d4349e0f4ed8a13c2d09d8beb28446bac7a46ca74eea9d2d5');});
 it('matches genuine fixture shape without claiming crypto or release authority',()=>{const result=inspectFixture(raw(),artifact());expect(result).toMatchObject({releaseQualified:false,cryptographicallyVerified:false,status:'UNQUALIFIED_FIXTURE_SCHEMA_MATCH'});expect(Object.isFrozen(result)).toBe(true);});
 it('rejects tampered fixture artifact bytes',()=>{const b=artifact();b[0]^=1;expect(()=>inspectFixture(raw(),b)).toThrowError('FIXTURE_SUBJECT_MISMATCH');});
 it('cannot confer authenticity on shape-valid forged signature output',()=>{const b=changed(e=>{e.attestation.bundle.dsseEnvelope.signatures[0].sig=Buffer.from('forged-signature').toString('base64');e.releaseQualified=true;});expect(inspectFixture(b,artifact())).toMatchObject({releaseQualified:false,cryptographicallyVerified:false});});
 it.each([
  ['wrong bundle type',(e:any):void=>{e.attestation.bundle.mediaType='unsupported';}],
  ['missing raw certificate',(e:any):void=>{delete e.attestation.bundle.verificationMaterial.certificate.rawBytes;}],
  ['invalid raw certificate encoding',(e:any):void=>{e.attestation.bundle.verificationMaterial.certificate.rawBytes='not!base64';}],
  ['noncanonical base64',(e:any):void=>{e.attestation.bundle.dsseEnvelope.signatures[0].sig='Zh==';}],
  ['missing signature',(e:any):void=>{e.attestation.bundle.dsseEnvelope.signatures=[];}],
  ['duplicate signature',(e:any):void=>{e.attestation.bundle.dsseEnvelope.signatures.push(e.attestation.bundle.dsseEnvelope.signatures[0]);}],
  ['wrong envelope type',(e:any):void=>{e.attestation.bundle.dsseEnvelope.payloadType='wrong';}],
  ['invalid envelope UTF8',(e:any):void=>{e.attestation.bundle.dsseEnvelope.payload=Buffer.from([255]).toString('base64');}],
  ['contradictory envelope statement',(e:any):void=>{const statement=JSON.parse(JSON.stringify(e.verificationResult.statement));statement.subject[0].digest.sha256='a'.repeat(64);e.attestation.bundle.dsseEnvelope.payload=Buffer.from(JSON.stringify(statement)).toString('base64');}],
 ] as const)('rejects %s',(_label,fn)=>invalid(changed(fn)));
 it.each([
  ['issuer','https://attacker.invalid'],['subjectAlternativeName','https://github.com/evil/repo/.github/workflows/build-python.yml@refs/heads/main'],
  ['buildSignerURI','https://github.com/actions/attest-demo/.github/workflows/other.yml@refs/heads/main'],['buildConfigURI','https://github.com/actions/attest-demo/.github/workflows/other.yml@refs/heads/main'],
  ['buildSignerDigest','a'.repeat(40)],['buildConfigDigest','a'.repeat(40)],['sourceRepositoryDigest','a'.repeat(40)],['githubWorkflowSHA','a'.repeat(40)],
  ['sourceRepositoryURI','https://github.com/tandavkrishna27/explorers.earth'],['sourceRepositoryIdentifier','1171328761'],['sourceRepositoryIdentifier','0763287532'],['sourceRepositoryIdentifier',763287532],['sourceRepositoryIdentifier','9007199254740992'],
  ['sourceRepositoryOwnerIdentifier','1'],['sourceRepositoryOwnerIdentifier','044036562'],['sourceRepositoryOwnerURI','https://github.com/evil'],
  ['sourceRepositoryRef','refs/heads/codex/unified-replatform'],['githubWorkflowRef','refs/heads/other'],['githubWorkflowRepository','tandavkrishna27/explorers.earth'],
  ['runnerEnvironment','self-hosted'],['buildTrigger','push'],['githubWorkflowTrigger','push'],
  ['runInvocationURI','https://github.com/actions/attest-demo/actions/runs/8788389601/attempts/2'],
  ['runInvocationURI','https://github.com/actions/attest-demo/actions/runs/8788389602/attempts/1'],
  ['runInvocationURI','https://github.com/actions/attest-demo/actions/runs/08788389601/attempts/1'],
  ['runInvocationURI','https://github.com/actions/attest-demo/actions/runs/8788389601/attempts/1?trusted=yes'],
  ['runInvocationURI','https://github.com/actions/attest-demo/actions/runs/8788389601/attempts/1#trusted'],
  ['runInvocationURI','https://evil@github.com/actions/attest-demo/actions/runs/8788389601/attempts/1'],
 ] as const)('rejects certificate %s = %s',(key,value)=>invalid(changed(e=>{e.verificationResult.signature.certificate[key]=value;})));
 it.each(['issuer','subjectAlternativeName','buildSignerDigest','buildConfigDigest','sourceRepositoryDigest','sourceRepositoryIdentifier','sourceRepositoryOwnerIdentifier','runInvocationURI','runnerEnvironment'])('rejects missing certificate %s',key=>invalid(changed(e=>{delete e.verificationResult.signature.certificate[key];})));
 it.each([
  ['predicateType',(e:any):void=>{e.verificationResult.statement.predicateType='https://attacker.invalid';}],
  ['statement type',(e:any):void=>{e.verificationResult.statement._type='wrong';}],
  ['subject digest',(e:any):void=>{e.verificationResult.statement.subject[0].digest.sha256='a'.repeat(64);}],
  ['subject name',(e:any):void=>{e.verificationResult.statement.subject[0].name='release-manifest.json';}],
  ['subject digest algorithm',(e:any):void=>{e.verificationResult.statement.subject[0].digest.sha512='a'.repeat(128);}],
  ['duplicate subject',(e:any):void=>{e.verificationResult.statement.subject.push(e.verificationResult.statement.subject[0]);}],
  ['empty subjects',(e:any):void=>{e.verificationResult.statement.subject=[];}],
  ['missing cert',(e:any):void=>{delete e.verificationResult.signature.certificate;}],
  ['missing result',(e:any):void=>{delete e.verificationResult;}],
  ['missing attestation',(e:any):void=>{delete e.attestation;}],
  ['empty timestamps',(e:any):void=>{e.verificationResult.verifiedTimestamps=[];}],
  ['unsupported timestamp',(e:any):void=>{e.verificationResult.verifiedTimestamps[0].type='PredicateTimestamp';}],
  ['wrong timestamp authority',(e:any):void=>{e.verificationResult.verifiedTimestamps[0].uri='evil.invalid';}],
  ['invalid timestamp',(e:any):void=>{e.verificationResult.verifiedTimestamps[0].timestamp='2024-02-30T00:00:00Z';}],
  ['timestamp number',(e:any):void=>{e.verificationResult.verifiedTimestamps[0].timestamp=1234;}],
  ['duplicate timestamps',(e:any):void=>{e.verificationResult.verifiedTimestamps.push(e.verificationResult.verifiedTimestamps[0]);}],
  ['forged predicate run',(e:any):void=>{e.verificationResult.statement.predicate.runDetails.metadata.invocationId='https://github.com/actions/attest-demo/actions/runs/2/attempts/1';}],
  ['forged predicate source',(e:any):void=>{e.verificationResult.statement.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit='a'.repeat(40);}],
  ['forged predicate repository',(e:any):void=>{e.verificationResult.statement.predicate.buildDefinition.internalParameters.github.repository_id='1171328761';}],
  ['forged predicate owner',(e:any):void=>{e.verificationResult.statement.predicate.buildDefinition.internalParameters.github.repository_owner_id='1';}],
  ['forged predicate event',(e:any):void=>{e.verificationResult.statement.predicate.buildDefinition.internalParameters.github.event_name='push';}],
  ['forged predicate ref',(e:any):void=>{e.verificationResult.statement.predicate.buildDefinition.externalParameters.workflow.ref='refs/heads/evil';}],
  ['forged predicate workflow',(e:any):void=>{e.verificationResult.statement.predicate.buildDefinition.externalParameters.workflow.path='.github/workflows/evil.yml';}],
  ['forged predicate builder',(e:any):void=>{e.verificationResult.statement.predicate.runDetails.builder.id='https://github.com/actions/runner/self-hosted';}],
 ] as const)('rejects %s',(_label,fn)=>invalid(changed(fn)));
 it.each(['identical','contradictory'])('denies %s duplicated entries',mode=>invalid(changed((entry,entries)=>{const duplicate=JSON.parse(JSON.stringify(entry));if(mode==='contradictory')duplicate.verificationResult.signature.certificate.issuer='evil';entries.push(duplicate);})));
 it.each(['{}','[]','null','true','{','[null]'])('denies malformed or wrong outer shape %s',text=>invalid(Buffer.from(text)));
 it('rejects invalid UTF8 rather than replacing bytes',()=>invalid(Buffer.from([0xff])));
 it('bounds stdout before parsing',()=>expect(()=>inspectFixture(Buffer.alloc(1024*1024+1),artifact())).toThrowError('ATTESTATION_INPUT_LIMIT'));
 it('bounds artifact before hashing',()=>expect(()=>inspectFixture(raw(),Buffer.alloc(8*1024*1024+1))).toThrowError('ATTESTATION_INPUT_LIMIT'));
 it('bounds object depth',()=>invalid(changed(e=>{let value:any={};e.extra=value;for(let i=0;i<30;i++){value.next={};value=value.next;}})));
 it('bounds object nodes',()=>invalid(changed(e=>{e.extra={};for(let i=0;i<3000;i++)e.extra['n'+i]=i;})));
 it('bounds array entries',()=>invalid(changed(e=>{e.extra=Array(9).fill(0);})));
 it('bounds individual strings',()=>invalid(changed(e=>{e.extra='x'.repeat(65537);})));
 it('rejects prototype-special keys',()=>invalid(Buffer.from(raw().toString().replace('"attestation":','"__proto__":{},"attestation":'))));
 it.each(['stdout','artifact'])('rejects nonbyte %s without invoking caller getters',which=>{let reads=0;const fake={get length(){reads++;throw new Error('SECRET');}};expect(()=>inspectFixture(which==='stdout'?fake as any:raw(),which==='artifact'?fake as any:artifact())).toThrowError('ATTESTATION_INPUT_LIMIT');expect(reads).toBe(0);});
});
it('production denies forged selectors, policies, executor, secrets and executable claims without reading them',async()=>{let reads=0;const forged={get evidence(){reads++;throw new Error('SECRET');},get executor(){reads++;throw new Error('SPAWN');},get path(){reads++;throw new Error('WRITABLE_EXECUTABLE');}};await expect((acquireProjectAttestation as any)(forged,raw(),artifact())).rejects.toMatchObject({code:'PRODUCER_UNAVAILABLE'});expect(reads).toBe(0);});

// Derived from the retained shape only: every project claim and signature here is synthetic.
const binding={repository:'tandavkrishna27/explorers.earth',repositoryId:'1171328761',ref:'refs/heads/codex/unified-replatform',sourceCommit:'a'.repeat(40),signerWorkflowPath:'.github/workflows/platform-candidate.yml',signerDigest:'b'.repeat(40),producerRunId:'12345',producerRunAttempt:'2',subjectName:'custody-envelope.json',subjectSha256:'c'.repeat(64)};
const invocation='https://github.com/tandavkrishna27/explorers.earth/actions/runs/12345/attempts/2';
function synthetic(fn:(e:any,entries:any[])=>void=()=>{}):Buffer {
 const entries=parsed(),e=entries[0],c=e.verificationResult.signature.certificate;
 const repo='https://github.com/'+binding.repository,signer=repo+'/'+binding.signerWorkflowPath+'@'+binding.ref;
 Object.assign(c,{issuer:'https://token.actions.githubusercontent.com',subjectAlternativeName:signer,buildSignerURI:signer,buildConfigURI:signer,buildSignerDigest:binding.signerDigest,buildConfigDigest:binding.signerDigest,sourceRepositoryDigest:binding.sourceCommit,githubWorkflowSHA:binding.sourceCommit,sourceRepositoryURI:repo,sourceRepositoryIdentifier:binding.repositoryId,sourceRepositoryRef:binding.ref,githubWorkflowRef:binding.ref,githubWorkflowRepository:binding.repository,runInvocationURI:invocation});
 const s=e.verificationResult.statement,d=s.predicate.buildDefinition;
 s.subject=[{name:binding.subjectName,digest:{sha256:binding.subjectSha256}}];
 Object.assign(d.externalParameters.workflow,{path:binding.signerWorkflowPath,ref:binding.ref,repository:repo});
 d.internalParameters.github.repository_id=binding.repositoryId;
 d.resolvedDependencies=[{uri:'git+'+repo+'@'+binding.ref,digest:{gitCommit:binding.sourceCommit}}];
 s.predicate.runDetails.metadata.invocationId=invocation;
 e.attestation.bundle.dsseEnvelope.payload=Buffer.from(JSON.stringify(s)).toString('base64');
 fn(e,entries);return Buffer.from(JSON.stringify(entries));
}
const inspectOutput=(b:Buffer,expected:any=binding)=>(attestationModule as any).inspectUnqualifiedVerifiedAttestationOutput(b,expected);
describe('synthetic project verifier output parsing never grants authority',()=>{
 it.each(['\n','\r','\r\n','\u2028','\u2029'])('rejects invocation trailing line terminator %#',suffix=>expect(()=>inspectOutput(synthetic(e=>{e.verificationResult.signature.certificate.runInvocationURI=invocation+suffix;}))).toThrowError('ATTESTATION_RUN_ATTEMPT_BINDING_UNAVAILABLE'));
 it.each(['\n','\r','\r\n','\u2028','\u2029'].flatMap(suffix=>['sourceCommit','signerDigest','subjectSha256','producerRunId','producerRunAttempt'].map(key=>({suffix,key}))))('rejects canonical expected field trailing terminator %#',({suffix,key})=>expect(()=>inspectOutput(synthetic(),{...binding,[key]:binding[key as keyof typeof binding]+suffix})).toThrowError('ATTESTATION_EXPECTED_BINDING_INVALID'));
 it.each(['\n','\r','\r\n','\u2028','\u2029'].flatMap(suffix=>['sourceRepositoryIdentifier','buildSignerDigest','buildConfigDigest','sourceRepositoryDigest','githubWorkflowSHA'].map(key=>({suffix,key}))))('rejects canonical certificate field trailing terminator %#',({suffix,key})=>expect(()=>inspectOutput(synthetic(e=>{e.verificationResult.signature.certificate[key]+=suffix;}))).toThrowError('ATTESTATION_OUTPUT_SCHEMA_INVALID'));
 it('requires the pure output inspector',()=>expect((attestationModule as any).inspectUnqualifiedVerifiedAttestationOutput).toBeTypeOf('function'));
 it('compares distinct source and signer digests and returns only frozen unqualified identifiers',()=>{const result=inspectOutput(synthetic());expect(result).toEqual({status:'VERIFIER_OUTPUT_STRUCTURALLY_VALID_UNQUALIFIED',releaseQualified:false,cryptographicallyVerified:false,runId:'12345',runAttempt:'2',subjectSha256:'c'.repeat(64)});expect(Object.isFrozen(result)).toBe(true);});
 it.each([undefined,null,42,'','https://github.com/tandavkrishna27/explorers.earth/actions/runs/012345/attempts/2','https://github.com/tandavkrishna27/explorers.earth/actions/runs/12345/attempts/02','https://github.com/tandavkrishna27/explorers.earth/actions/runs/9007199254740992/attempts/2',invocation+'?token=SECRET',invocation+'#x',invocation+'/extra',invocation.replace('github.com','evil.invalid'),invocation.replace('https://','https://evil@'),invocation.replace('/12345/','/%31%32%33%34%35/'),invocation.replace('explorers.earth','other')])('refuses absent or nonliteral certificate invocation %s',value=>expect(()=>inspectOutput(synthetic(e=>{e.verificationResult.signature.certificate.runInvocationURI=value;}))).toThrowError('ATTESTATION_RUN_ATTEMPT_BINDING_UNAVAILABLE'));
 it.each([invocation.replace('/12345/','/12346/'),invocation.replace('/attempts/2','/attempts/3')])('refuses certificate run disagreement %s',value=>expect(()=>inspectOutput(synthetic(e=>{e.verificationResult.signature.certificate.runInvocationURI=value;}))).toThrowError('ATTESTATION_RUN_ATTEMPT_BINDING_MISMATCH'));
 it.each(['issuer','subjectAlternativeName','buildSignerURI','buildConfigURI','buildSignerDigest','buildConfigDigest','sourceRepositoryDigest','githubWorkflowSHA','sourceRepositoryURI','sourceRepositoryIdentifier','sourceRepositoryRef','githubWorkflowRef','githubWorkflowRepository','runnerEnvironment','buildTrigger','githubWorkflowTrigger'])('rejects wrong certificate %s',key=>expect(()=>inspectOutput(synthetic(e=>{e.verificationResult.signature.certificate[key]='SECRET';}))).toThrowError('ATTESTATION_OUTPUT_SCHEMA_INVALID'));
 it.each([
  (e:any,entries:any[])=>entries.push(e),
  (e:any)=>e.verificationResult.statement.subject.push(e.verificationResult.statement.subject[0]),
  (e:any)=>e.verificationResult.statement.subject[0].name='wrong',
  (e:any)=>e.verificationResult.statement.subject[0].digest.sha256='d'.repeat(64),
  (e:any)=>e.attestation.bundle.dsseEnvelope.signatures.push(e.attestation.bundle.dsseEnvelope.signatures[0]),
  (e:any)=>e.attestation.bundle.dsseEnvelope.payload=Buffer.from('{}').toString('base64'),
  (e:any)=>e.attestation.bundle.dsseEnvelope.signatures[0].sig='Zh==',
  (e:any)=>{let v:any={};e.extra=v;for(let i=0;i<17;i++){v.next={};v=v.next;}},
  (e:any)=>{e.extra={};for(let i=0;i<2049;i++)e.extra['n'+i]=0;},
  (e:any)=>e.extra='x'.repeat(65537),
  (e:any)=>e.extra=Array(9).fill(0),
 ])('rejects inconsistent or unbounded output %#',fn=>expect(()=>inspectOutput(synthetic(fn))).toThrowError('ATTESTATION_OUTPUT_SCHEMA_INVALID'));
 it.each([Buffer.from([255]),Buffer.from('{'),Buffer.from('[]')])('rejects invalid bytes %#',b=>expect(()=>inspectOutput(b)).toThrowError('ATTESTATION_OUTPUT_SCHEMA_INVALID'));
 it('caps bytes',()=>expect(()=>inspectOutput(Buffer.alloc(1024*1024+1))).toThrowError('ATTESTATION_OUTPUT_INPUT_LIMIT'));
 it('does not read nonbyte stdout getters',()=>{let reads=0;const fake={get length(){reads++;throw new Error('SECRET');}};expect(()=>inspectOutput(fake as any)).toThrowError('ATTESTATION_OUTPUT_INPUT_LIMIT');expect(reads).toBe(0);});
 it.each(['certificate','signature'])('refuses missing %s despite correct predicate invocation',key=>expect(()=>inspectOutput(synthetic(e=>{if(key==='certificate')delete e.verificationResult.signature.certificate;else delete e.verificationResult.signature;}))).toThrowError('ATTESTATION_RUN_ATTEMPT_BINDING_UNAVAILABLE'));
 it.each([
  (s:any)=>s.predicate.buildDefinition.externalParameters.workflow.path='.github/workflows/evil.yml',
  (s:any)=>s.predicate.buildDefinition.externalParameters.workflow.ref='refs/heads/main',
  (s:any)=>s.predicate.buildDefinition.externalParameters.workflow.repository='https://github.com/evil/repo',
  (s:any)=>s.predicate.buildDefinition.internalParameters.github.repository_id='1',
  (s:any)=>s.predicate.buildDefinition.internalParameters.github.event_name='push',
  (s:any)=>s.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit='d'.repeat(40),
  (s:any)=>s.predicate.runDetails.metadata.invocationId=invocation.replace('/attempts/2','/attempts/3'),
  (s:any)=>s.predicate.runDetails.builder.id='https://github.com/actions/runner/self-hosted',
 ])('rejects matching DSSE with contradictory predicate %#',fn=>expect(()=>inspectOutput(synthetic(e=>{fn(e.verificationResult.statement);e.attestation.bundle.dsseEnvelope.payload=Buffer.from(JSON.stringify(e.verificationResult.statement)).toString('base64');}))).toThrowError('ATTESTATION_OUTPUT_SCHEMA_INVALID'));
 it('rejects symbol comparison keys',()=>expect(()=>inspectOutput(synthetic(),{...binding,[Symbol('secret')]:true})).toThrowError('ATTESTATION_EXPECTED_BINDING_INVALID'));
 it.each(Object.keys(binding))('rejects expected getters before reading bytes: %s',key=>{let reads=0;const expected={...binding};Object.defineProperty(expected,key,{enumerable:true,get(){reads++;throw new Error('SECRET');}});expect(()=>inspectOutput(synthetic(),expected)).toThrowError('ATTESTATION_EXPECTED_BINDING_INVALID');expect(reads).toBe(0);});
 it.each([{...binding,extra:true},{...binding,repository:'evil/repo'},{...binding,repositoryId:'1'},{...binding,ref:'refs/heads/main'},{...binding,signerWorkflowPath:'.github/workflows/evil.yml'},{...binding,sourceCommit:'A'.repeat(40)},{...binding,signerDigest:'a'.repeat(64)},{...binding,producerRunId:'01'},{...binding,producerRunAttempt:'9007199254740992'},{...binding,subjectSha256:'C'.repeat(64)}])('rejects invalid expected comparison %#',expected=>expect(()=>inspectOutput(synthetic(),expected)).toThrowError('ATTESTATION_EXPECTED_BINDING_INVALID'));
 it('rejects inherited and nonenumerable comparisons',()=>{const inherited=Object.create(binding);expect(()=>inspectOutput(synthetic(),inherited)).toThrowError('ATTESTATION_EXPECTED_BINDING_INVALID');const hidden={...binding};Object.defineProperty(hidden,'repository',{value:binding.repository,enumerable:false});expect(()=>inspectOutput(synthetic(),hidden)).toThrowError('ATTESTATION_EXPECTED_BINDING_INVALID');});
 it('perfect forged proof cannot qualify and errors reveal no input or cause',()=>{const result=inspectOutput(synthetic(e=>{e.releaseQualified=true;e.cryptographicallyVerified=true;e.attestation.bundle.dsseEnvelope.signatures[0].sig=Buffer.from('forged').toString('base64');}));expect(result.releaseQualified).toBe(false);expect(result.cryptographicallyVerified).toBe(false);try{inspectOutput(Buffer.from('SECRET'));throw new Error('accepted');}catch(error:any){expect(error.message).toBe('ATTESTATION_OUTPUT_SCHEMA_INVALID');expect(Object.getOwnPropertyNames(error).sort()).toEqual(['code','message','stack']);expect(error.cause).toBeUndefined();}});
});
