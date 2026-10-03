import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {acquireProjectOciEvidence,inspectUnqualifiedReleaseOciGraph as inspectGraph} from '../../deployment/platform-oci-evidence';
import {SCHEMA_FLOOR,canonicalDigest} from '../../deployment/platform-release-contract';
type Fixture={name:string;expectedError:string|null;release:string;api:string[];web:string[]};
const dir='./fixtures/platform-oci/';
const read=(name:string)=>readFileSync(new URL(dir+name,import.meta.url));
const fixtures:Fixture[]=JSON.parse(read('cases.json').toString());
const decode=(f:Fixture)=>({release:Buffer.from(f.release,'base64'),api:f.api.map(b=>Buffer.from(b,'base64')),web:f.web.map(b=>Buffer.from(b,'base64'))});
it('keeps independently regenerated release claims at the current schema floor',()=>{
 for(const fixture of fixtures)expect(JSON.parse(decode(fixture).release.toString()).schemaVersion).toBe(SCHEMA_FLOOR);
});
it('rejects coherent historical schema36 release claims before OCI graph acceptance',()=>{
 const bytes=decode(fixtures[0]);const release=JSON.parse(bytes.release.toString());release.schemaVersion=36;release.manifestDigest=canonicalDigest(release);
 expect(()=>inspectGraph(Buffer.from(JSON.stringify(release)),bytes.api,bytes.web)).toThrow('OCI_METADATA_INVALID');
});
it.each(fixtures)('independent $name has intended first error category',f=>{const b=decode(f);if(f.expectedError){expect(()=>inspectGraph(b.release,b.api,b.web)).toThrowError(f.expectedError);}else{const result=inspectGraph(b.release,b.api,b.web);expect(result).toMatchObject({releaseQualified:false,cryptographicallyVerified:false,registryAuthenticated:false,runtimeVerified:false,layerContentsVerified:false,executedSmokeVerified:false,status:'OCI_GRAPH_STRUCTURALLY_VALID_UNQUALIFIED'});expect(Object.isFrozen(result)).toBe(true);}});
it('verifies independent tar/gzip and case bytes against generator receipts',()=>{const receipts=JSON.parse(read('receipt.json').toString());for(const name of Object.keys(receipts)){const b=read(name);expect(b.length).toBe(receipts[name].size);expect('sha256:'+createHash('sha256').update(b).digest('hex')).toBe(receipts[name].digest);}});
it.each(['release','metadata','count','not-buffer','not-array'])('denies %s input limits before graph work',mode=>{const b=decode(fixtures[0]);if(mode==='release')b.release=Buffer.alloc(65537);if(mode==='metadata')b.api[0]=Buffer.alloc(65537);if(mode==='count')b.api=Array(6).fill(Buffer.from('{}'));if(mode==='not-buffer')b.release={} as any;if(mode==='not-array')b.api={} as any;expect(()=>inspectGraph(b.release,b.api,b.web)).toThrowError('OCI_INPUT_LIMIT');});
it('denies production before caller proof/secret/registry/transport getter access',async()=>{let reads=0;const caller={get secret(){reads++;throw new Error('SECRET');},get fetch(){reads++;throw new Error('NETWORK');},get policy(){reads++;throw new Error('FORGED_AUTHORITY');}};await expect((acquireProjectOciEvidence as any)(caller)).rejects.toMatchObject({code:'PRODUCER_UNAVAILABLE'});expect(reads).toBe(0);});
it('keeps index roots, runnable children and config identities distinct and deeply frozen',()=>{const b=decode(fixtures.find(f=>f.name==='multi')!);const result=inspectGraph(b.release,b.api,b.web),release=JSON.parse(b.release.toString());expect(result.images.api.rootKind).toBe('index');expect(result.images.api.rootDigest).toBe(release.images.api.digest);expect(result.images.api.platforms['linux/amd64'].childDigest).toBe(release.images.api.platforms['linux/amd64'].digest);expect(result.images.api.rootDigest).not.toBe(result.images.api.platforms['linux/amd64'].childDigest);expect(result.images.api.platforms['linux/amd64'].configDigest).not.toBe(result.images.api.platforms['linux/amd64'].childDigest);for(const v of [result.images,result.images.api,result.images.api.platforms,result.images.api.platforms['linux/amd64']])expect(Object.isFrozen(v)).toBe(true);});
it('permits legal already-supplied config reference reuse across distinct roles',()=>{const b=decode(fixtures.find(f=>f.name==='shared-config-across-roles')!);const result=inspectGraph(b.release,b.api,b.web);expect(result.images.api.rootDigest).not.toBe(result.images.web.rootDigest);expect(result.images.api.platforms['linux/amd64'].configDigest).toBe(result.images.web.platforms['linux/amd64'].configDigest);});
it('independent compressed-layer digest differs from uncompressed DiffID without claiming layer validation',()=>{const h=(b:Buffer)=>createHash('sha256').update(b).digest('hex');expect(h(read('layer.tar'))).not.toBe(h(read('layer.tar.gz')));const b=decode(fixtures.find(f=>f.name==='repeated-layer-reference')!);expect(inspectGraph(b.release,b.api,b.web).layerContentsVerified).toBe(false);});
