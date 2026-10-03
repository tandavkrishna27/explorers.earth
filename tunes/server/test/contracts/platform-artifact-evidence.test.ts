import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { validateCandidateArchive, acquireCandidateArchive } from '../../deployment/platform-artifact-evidence';
const read = (name='stored') => readFileSync(new URL('./fixtures/platform-artifact/'+name+'.zip',import.meta.url));
const hash=(bytes:Buffer)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const changed=(mutate:(b:Buffer,e:number,c:number)=>void)=>{const b=Buffer.from(read());const e=b.length-22;mutate(b,e,b.readUInt32LE(e+16));return b;};
describe('restricted candidate archive',()=>{
  it.each(['stored','deflated'])('validates independent Python %s fixture without authority',async name=>{const b=read(name);const result=await validateCandidateArchive(b,hash(b));expect(result.releaseQualified).toBe(false);expect(result.files['release-manifest.json']).toBe('{"version":1}');expect(Object.isFrozen(result.files)).toBe(true);});
  it('rejects incorrect raw digest',async()=>{await expect(validateCandidateArchive(read(),'sha256:'+'a'.repeat(64))).rejects.toMatchObject({code:'ARCHIVE_DIGEST_MISMATCH'});});
  it('retains unavailable producer authority',async()=>{await expect(acquireCandidateArchive()).rejects.toMatchObject({code:'PRODUCER_UNAVAILABLE'});});
  it.each([
    ['disk',(b:Buffer,e:number)=>b.writeUInt16LE(1,e+4)],
    ['count',(b:Buffer,e:number)=>b.writeUInt16LE(3,e+10)],
    ['zip64',(b:Buffer,e:number)=>b.writeUInt16LE(65535,e+10)],
    ['comment',(b:Buffer,e:number)=>b.writeUInt16LE(1,e+20)],
    ['directory offset',(b:Buffer,e:number)=>b.writeUInt32LE(1,e+16)],
    ['directory size',(b:Buffer,e:number)=>b.writeUInt32LE(1,e+12)],
    ['encrypted',(b:Buffer,e:number,c:number)=>{b.writeUInt16LE(1,c+8);b.writeUInt16LE(1,6);}],
    ['descriptor',(b:Buffer,e:number,c:number)=>{b.writeUInt16LE(8,c+8);b.writeUInt16LE(8,6);}],
    ['unsupported method',(b:Buffer,e:number,c:number)=>{b.writeUInt16LE(99,c+10);b.writeUInt16LE(99,8);}],
    ['version',(b:Buffer,e:number,c:number)=>{b.writeUInt16LE(45,c+6);b.writeUInt16LE(45,4);}],
    ['local method',(b:Buffer)=>b.writeUInt16LE(8,8)],
    ['local name',(b:Buffer)=>{b[30]=0x58;}],
    ['local CRC',(b:Buffer)=>b.writeUInt32LE(0,14)],
    ['payload CRC',(b:Buffer)=>{b[30+Buffer.byteLength("release-manifest.json")]^=1;}],
    ['extra',(b:Buffer,e:number,c:number)=>b.writeUInt16LE(1,c+30)],
    ['file comment',(b:Buffer,e:number,c:number)=>b.writeUInt16LE(1,c+32)],
    ['symlink',(b:Buffer,e:number,c:number)=>b.writeUInt32LE((0o120777*65536)>>>0,c+38)],
    ['DOS directory',(b:Buffer,e:number,c:number)=>b.writeUInt32LE(16,c+38)],
    ['range',(b:Buffer,e:number,c:number)=>b.writeUInt32LE(1,c+42)],
    ['unknown name',(b:Buffer,e:number,c:number)=>{b[30]=0x58;b[c+46]=0x58;}],
  ] as const)('rejects %s mutation',async(_name,mutate)=>{const b=changed(mutate);await expect(validateCandidateArchive(b,hash(b))).rejects.toMatchObject({code:'ARCHIVE_INVALID'});});
  it.each(['prefix','trailing','truncated'])('rejects %s envelope',async mode=>{const b=mode==='prefix'?Buffer.concat([Buffer.from([0]),read()]):mode==='trailing'?Buffer.concat([read(),Buffer.from([0])]):read().subarray(0,read().length-1);await expect(validateCandidateArchive(b,hash(b))).rejects.toMatchObject({code:'ARCHIVE_INVALID'});});
  it('rejects byte limit before parsing',async()=>{const b=Buffer.alloc(8*1024*1024+1);await expect(validateCandidateArchive(b,hash(b))).rejects.toMatchObject({code:'ARCHIVE_LIMIT'});});
});

it.each(['traversal','absolute','drive','backslash','directory','duplicate','unicode-extra','entry-count','missing-manifest','device','invalid-utf8'])('denies independently generated %s archive',async name=>{const b=read(name);await expect(validateCandidateArchive(b,hash(b))).rejects.toMatchObject({code:'ARCHIVE_INVALID'});});
it.each(['manifest-bomb','receipt-bomb'])('bounds expanded bytes in %s',async name=>{const b=read(name);await expect(validateCandidateArchive(b,hash(b))).rejects.toMatchObject({code:'ARCHIVE_LIMIT'});});

it('preserves hash-qualified snapshot if caller changes its buffer during await',async()=>{const b=read();const pending=validateCandidateArchive(b,hash(b));b.fill(0);expect((await pending).files['release-manifest.json']).toBe('{"version":1}');});
it('bounds non-cooperative parser iteration and does not await stalled cleanup',async()=>{
 const controller=new AbortController();const timeout=vi.spyOn(AbortSignal,'timeout').mockReturnValue(controller.signal);
 const parser=createRequire(import.meta.url)('yauzl');let returned=0;
 const adapter=vi.spyOn(parser,'fromBufferPromise').mockResolvedValue({entryCount:2,eachEntry:()=>({next:()=>new Promise(()=>{}),return:()=>{returned++;return new Promise(()=>{});}}),close:()=>{}});
 try{const b=read();const pending=validateCandidateArchive(b,hash(b));const assertion=expect(pending).rejects.toMatchObject({code:'ARCHIVE_TIMEOUT'});await Promise.resolve();await Promise.resolve();controller.abort();await assertion;expect(returned).toBe(1);}finally{adapter.mockRestore();timeout.mockRestore();}
});

it('rejects NUL raw filenames rather than normalizing them',async()=>{const b=changed((b,e,c)=>{b[30]=0;b[c+46]=0;});await expect(validateCandidateArchive(b,hash(b))).rejects.toMatchObject({code:'ARCHIVE_INVALID'});});
it('rejects DOS special device attributes',async()=>{const b=changed((b,e,c)=>b.writeUInt32LE(64,c+38));await expect(validateCandidateArchive(b,hash(b))).rejects.toMatchObject({code:'ARCHIVE_INVALID'});});
it('rejects malformed digest selector without runtime error leakage',async()=>{await expect(validateCandidateArchive(read(),Symbol('private') as any)).rejects.toMatchObject({code:'ARCHIVE_DIGEST_MISMATCH'});});
