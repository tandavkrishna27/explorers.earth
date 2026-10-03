import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type { Readable } from 'node:stream';

// Limited declarations for the audited published yauzl 3.4.0 API; backend direct dependency only.
interface Entry { fileName: string; fileNameRaw: Buffer; fileNameLength: number; extraFieldLength: number; fileCommentLength: number; versionNeededToExtract: number; generalPurposeBitFlag: number; compressionMethod: number; crc32: number; compressedSize: number; uncompressedSize: number; relativeOffsetOfLocalHeader: number; externalFileAttributes: number; extraFields: unknown[]; }
interface LocalHeader { fileDataStart: number; fileName: Buffer; extraField: Buffer; fileNameLength: number; extraFieldLength: number; versionNeededToExtract: number; generalPurposeBitFlag: number; compressionMethod: number; crc32: number; compressedSize: number; uncompressedSize: number; }
interface ZipFile { entryCount: number; eachEntry(): AsyncIterableIterator<Entry>; readLocalFileHeaderPromise(entry: Entry, options: {minimal:false}): Promise<LocalHeader>; openReadStreamPromise(entry: Entry): Promise<Readable>; close(): void; }
interface Parser { fromBufferPromise(bytes: Buffer, options: {strictFileNames:true;decodeStrings:true;validateEntrySizes:true}): Promise<ZipFile>; }
const requireOwned = createRequire(import.meta.url);
const parser = requireOwned('yauzl') as Parser;
const { crc32 } = requireOwned('node:zlib') as { crc32(bytes: Uint8Array, previous?: number): number };
export class ArtifactEvidenceError extends Error { constructor(public readonly code: string) { super(code); } }
function fail(code='ARCHIVE_INVALID'): never { throw new ArtifactEvidenceError(code); }
const ALLOWED_FILES = Object.freeze(['release-manifest.json','qualification.json','api-smoke-amd64.json','web-smoke-amd64.json','api-smoke-arm64.json','web-smoke-arm64.json']);
const MAX_BYTES = 8*1024*1024, MAX_EXPANDED = 4*1024*1024;
export interface StructuralArchive { readonly releaseQualified: false; readonly status:'ARTIFACT_STRUCTURALLY_VALID_UNQUALIFIED'; readonly archiveDigest: string; readonly files: Readonly<Record<string,string>>; }
/** No producer, signature, download or release authority is implied by matching these structural bytes. */
export async function acquireCandidateArchive(): Promise<never> { return fail('PRODUCER_UNAVAILABLE'); }
export async function validateCandidateArchive(input: Buffer, expectedDigest: string): Promise<StructuralArchive> {
  if (!Buffer.isBuffer(input) || input.length > MAX_BYTES) fail('ARCHIVE_LIMIT');
  // Snapshot first, then qualify these exact bytes, including buffers backed by shared memory.
  const bytes = Buffer.from(input);
  if (typeof expectedDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(expectedDigest) || 'sha256:'+createHash('sha256').update(bytes).digest('hex') !== expectedDigest) fail('ARCHIVE_DIGEST_MISMATCH');
  if (bytes.length < 22) fail();
  const eocd = bytes.length-22;
  if (bytes.readUInt32LE(eocd)!==0x06054b50 || bytes.readUInt16LE(eocd+20)!==0 || bytes.readUInt16LE(eocd+4)!==0 || bytes.readUInt16LE(eocd+6)!==0) fail();
  const count = bytes.readUInt16LE(eocd+10), centralSize = bytes.readUInt32LE(eocd+12), centralOffset = bytes.readUInt32LE(eocd+16);
  if (count<1 || count>32 || bytes.readUInt16LE(eocd+8)!==count || centralSize===0xffffffff || centralOffset===0xffffffff || centralOffset+centralSize!==eocd) fail();
  const signal = AbortSignal.timeout(10000);
  let timeoutReject: (error: ArtifactEvidenceError)=>void = ()=>{};
  const timeoutPromise = new Promise<never>((_,reject)=>{ timeoutReject=reject; });
  const onAbort=()=>timeoutReject(new ArtifactEvidenceError('ARCHIVE_TIMEOUT'));
  signal.addEventListener('abort',onAbort,{once:true});
  const bounded=<T>(operation:Promise<T>):Promise<T>=>Promise.race([operation,timeoutPromise]);
  let zip: ZipFile | undefined; let iterator: AsyncIterableIterator<Entry> | undefined; let activeStream: Readable | undefined;
  try {
    zip = await bounded(parser.fromBufferPromise(bytes,{strictFileNames:true,decodeStrings:true,validateEntrySizes:true}));
    if (zip.entryCount!==count) fail();
    iterator=zip.eachEntry(); const files:Record<string,string>=Object.create(null); const ranges:{start:number;end:number}[]=[];
    let expanded=0, records=0, seen=0;
    while (true) {
      const item=await bounded(iterator.next()); if(item.done) break;
      const entry=item.value; seen++; if(seen>count) fail();
      const name=entry.fileName;
      if(!ALLOWED_FILES.includes(name) || Object.hasOwn(files,name) || !entry.fileNameRaw.equals(Buffer.from(name,'ascii')) || entry.fileNameLength!==name.length) fail();
      const fields=[entry.compressedSize,entry.uncompressedSize,entry.relativeOffsetOfLocalHeader];
      if(!fields.every(n=>Number.isSafeInteger(n)&&n>=0) || entry.extraFieldLength!==0 || entry.fileCommentLength!==0 || entry.extraFields.length!==0 || ![10,20].includes(entry.versionNeededToExtract) || (entry.generalPurposeBitFlag&~0x0800)!==0 || ![0,8].includes(entry.compressionMethod)) fail();
      const unixType=(entry.externalFileAttributes>>>16)&0xf000;
      if(((entry.externalFileAttributes&0xff)&~0x27)!==0 || ![0,0x8000].includes(unixType)) fail();
      if(entry.compressionMethod===8 && entry.versionNeededToExtract!==20) fail();
      const cap=name==='release-manifest.json'?65536:131072;
      if(entry.uncompressedSize>cap || expanded+entry.uncompressedSize>MAX_EXPANDED) fail('ARCHIVE_LIMIT');
      const local=await bounded(zip.readLocalFileHeaderPromise(entry,{minimal:false}));
      if(!local.fileName.equals(entry.fileNameRaw) || local.fileNameLength!==entry.fileNameLength || local.extraFieldLength!==0 || local.extraField.length!==0 || local.versionNeededToExtract!==entry.versionNeededToExtract || local.generalPurposeBitFlag!==entry.generalPurposeBitFlag || local.compressionMethod!==entry.compressionMethod || local.crc32!==entry.crc32 || local.compressedSize!==entry.compressedSize || local.uncompressedSize!==entry.uncompressedSize) fail();
      const start=entry.relativeOffsetOfLocalHeader, end=local.fileDataStart+entry.compressedSize;
      if(local.fileDataStart!==start+30+entry.fileNameLength || !Number.isSafeInteger(end) || end>centralOffset || end<local.fileDataStart) fail();
      ranges.push({start,end}); records+=46+entry.fileNameLength;
      activeStream=await bounded(zip.openReadStreamPromise(entry));
      // Attach before consumption; cleanup errors cannot leak or override a first structural failure.
      activeStream.on('error',()=>{});
      const chunks:Buffer[]=[]; let actual=0, checksum=0;
      const dataIterator=activeStream[Symbol.asyncIterator]();
      while(true) { const part=await bounded(dataIterator.next()); if(part.done) break; const chunk=Buffer.isBuffer(part.value)?part.value:Buffer.from(part.value); actual+=chunk.length; if(actual>cap || expanded+actual>MAX_EXPANDED) fail('ARCHIVE_LIMIT'); checksum=crc32(chunk,checksum); chunks.push(chunk); }
      activeStream=undefined;
      if(actual!==entry.uncompressedSize || checksum!==entry.crc32) fail();
      expanded+=actual;
      try { files[name]=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,actual)); } catch { fail(); }
    }
    if(seen!==count || records!==centralSize || !Object.hasOwn(files,'release-manifest.json')) fail();
    ranges.sort((a,b)=>a.start-b.start); let cursor=0; for(const range of ranges){ if(range.start!==cursor) fail(); cursor=range.end; } if(cursor!==centralOffset) fail();
    return Object.freeze({releaseQualified:false as const,status:'ARTIFACT_STRUCTURALLY_VALID_UNQUALIFIED' as const,archiveDigest:expectedDigest,files:Object.freeze(files)});
  } catch(error) { if(error instanceof ArtifactEvidenceError) throw error; return fail(signal.aborted?'ARCHIVE_TIMEOUT':'ARCHIVE_INVALID'); }
  finally { signal.removeEventListener('abort',onAbort); try { activeStream?.destroy(); } catch {} try { void iterator?.return?.().catch(()=>{}); } catch {} try { zip?.close(); } catch {} }
}


