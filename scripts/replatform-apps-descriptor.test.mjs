import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve, dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {readAppsDescriptor} from '../explorers-earth/e2e/replatform/apps-descriptor-reader.mjs';

const path = resolve('private-apps-fixture', 'sessions.json');
function harness(bytes = Buffer.from('{"cookie":"private-value"}')) {
  const calls = [], nodes = new Map();
  const stat = (file, ino) => ({dev:1n,ino:BigInt(ino),mode:file?0o100600n:0o40700n,uid:0n,gid:0n,nlink:1n,size:file?BigInt(bytes.length):0n,mtimeNs:1n,ctimeNs:1n,isFile:()=>file,isDirectory:()=>!file,isSymbolicLink:()=>false});
  nodes.set(path, stat(true, 100));
  let current=dirname(path), ino=1;
  for (;;) { nodes.set(current,stat(false,ino++));const parent=dirname(current);if(parent===current)break;current=parent; }
  let offset=0;
  const fs = {
    lstatSync(p, options) { calls.push(['lstat',p]);assert.equal(options.bigint,true);return nodes.get(p); },
    realpathSync(p) { calls.push(['realpath',p]);return p; },
    openSync(p, flags) { calls.push(['open',p,flags]);return 7; },
    fstatSync(fd, options) { calls.push(['fstat',fd]);assert.equal(options.bigint,true);return nodes.get(path); },
    readSync(fd, buffer, start, length, position) { calls.push(['read',length,position]);assert.equal(position,null);const count=Math.min(length,bytes.length-offset);bytes.copy(buffer,start,offset,offset+count);offset+=count;return count; },
    closeSync(fd) { calls.push(['close',fd]); },
  };
  return {fs,calls,nodes,bytes};
}
function rejected(h, target=path) { assert.throws(()=>readAppsDescriptor(target,h.fs),error=>error.message==='APPS_DESCRIPTOR_CUSTODY_INVALID'&&!error.message.includes('private-value')); }

test('returns decoded descriptor text with bounded reads and closes retained handle',()=>{
  const h=harness();assert.equal(readAppsDescriptor(path,h.fs),'{"cookie":"private-value"}');
  assert.deepEqual(h.calls.filter(c=>c[0]==='close'),[['close',7]]);
  assert.ok(h.calls.filter(c=>c[0]==='read').every(c=>c[1]<=4096));
});
test('accepts exactly 64KiB of valid UTF8 and a finite EOF sentinel',()=>{
  const h=harness(Buffer.alloc(65536,32));assert.equal(readAppsDescriptor(path,h.fs).length,65536);
  assert.ok(h.calls.filter(c=>c[0]==='read').length<=65538);
});
for(const bytes of [Buffer.from([0xc3,0x28]),Buffer.from([0xff]),Buffer.from([0xe2,0x82])])test(`rejects invalid UTF8 ${bytes.toString('hex')} after closing`,()=>{
  const h=harness(bytes);rejected(h);assert.equal(h.calls.filter(c=>c[0]==='close').length,1);
});
for(const fault of ['oversized','nonregular','symlink','hardlink'])test(`rejects ${fault} before open`,()=>{
  const h=harness(),s=h.nodes.get(path);
  if(fault==='oversized')s.size=65537n;if(fault==='nonregular')s.isFile=()=>false;if(fault==='symlink')s.isSymbolicLink=()=>true;if(fault==='hardlink')s.nlink=2n;
  rejected(h);assert.equal(h.calls.some(c=>c[0]==='open'),false);
});
for(const target of ['relative/sessions.json',path+'\0',path+'\n',path+'x'.repeat(1025)])test('rejects invalid absolute path without FS calls '+JSON.stringify(target.slice(-15)),()=>{
  const h=harness();rejected(h,target);assert.deepEqual(h.calls,[]);
});
for(const fault of ['symlink','canonical','non-directory'])test(`rejects ancestor ${fault} before open`,()=>{
  const h=harness(),parent=dirname(path);
  if(fault==='symlink')h.nodes.get(parent).isSymbolicLink=()=>true;
  if(fault==='non-directory')h.nodes.get(parent).isDirectory=()=>false;
  if(fault==='canonical')h.fs.realpathSync=p=>p===parent?resolve('foreign'):p;
  rejected(h);assert.equal(h.calls.some(c=>c[0]==='open'),false);
});
for(const field of ['ino','dev','size','mode','nlink','mtimeNs','ctimeNs','uid','gid'])test(`rejects open handle ${field} mutation and closes`,()=>{
  const h=harness(),s=h.nodes.get(path);h.fs.fstatSync=()=>({...s,[field]:s[field]+1n});rejected(h);assert.equal(h.calls.filter(c=>c[0]==='close').length,1);assert.equal(h.calls.some(c=>c[0]==='read'),false);
});
test('rejects sentinel growth after opening and closes',()=>{
  const h=harness(Buffer.from('abcdef'));h.nodes.get(path).size=5n;rejected(h);assert.equal(h.calls.filter(c=>c[0]==='close').length,1);
});
test('rejects shrinkage on finite EOF and closes',()=>{
  const h=harness(Buffer.from('abc'));h.nodes.get(path).size=4n;rejected(h);assert.equal(h.calls.filter(c=>c[0]==='close').length,1);
});
test('supports partial reads with a finite byte budget',()=>{
  const h=harness(Buffer.from('abc'));let index=0;h.fs.readSync=(fd,b,o,n)=>{if(index===3)return 0;b[o]='abc'.charCodeAt(index++);return 1;};assert.equal(readAppsDescriptor(path,h.fs),'abc');
});
for(const result of [-1,1.5,5000,NaN])test(`rejects invalid read count ${result} and closes`,()=>{
  const h=harness();h.fs.readSync=()=>result;rejected(h);assert.equal(h.calls.filter(c=>c[0]==='close').length,1);
});
test('rejects final fstat mutation after successful byte read',()=>{
  const h=harness(),s=h.nodes.get(path);let count=0;h.fs.fstatSync=()=>++count===1?s:{...s,mtimeNs:2n};rejected(h);assert.equal(h.calls.filter(c=>c[0]==='close').length,1);
});
test('rejects ancestor identity replacement after successful byte read',()=>{
  const h=harness(),original=h.fs.readSync;h.fs.readSync=(...args)=>{const n=original(...args);h.nodes.set(dirname(path),{...h.nodes.get(dirname(path)),ino:999n});return n;};rejected(h);
});
test('rejects path replacement after successful byte read',()=>{
  const h=harness(),s=h.nodes.get(path);let stats=0;h.fs.lstatSync=(p)=>p===path&&++stats>1?{...s,ino:999n}:h.nodes.get(p);rejected(h);
});
for(const method of ['openSync','readSync','closeSync'])test(`sanitizes ${method} errors without returning text`,()=>{
  const h=harness();h.fs[method]=()=>{throw Error('private-value '+path);};rejected(h);if(method==='readSync')assert.equal(h.calls.filter(c=>c[0]==='close').length,1);
});
test('rejects partial/accessor/extra fake adapters before any fallback',()=>{
  const h=harness();for(const adapter of [{readSync:h.fs.readSync},{...h.fs,extra:()=>{}},Object.defineProperty({...h.fs},'readSync',{get(){throw Error('private-value');},enumerable:true})])assert.throws(()=>readAppsDescriptor(path,adapter),/APPS_DESCRIPTOR_CUSTODY_INVALID/);
  assert.deepEqual(h.calls,[]);
});
test('attempts a failed close only once and refuses to return descriptor text',()=>{
  const h=harness();let closes=0;h.fs.closeSync=()=>{closes++;throw Error('private-value');};rejected(h);assert.equal(closes,1);
});
function fixtureRead(lane, reader, legacy, requiredInput=name=>{assert.equal(name,'REPLATFORM_E2E_FIXTURE_PATH');return path;}) {
  const source=readFileSync(new URL('../explorers-earth/e2e/replatform/fixtures.ts',import.meta.url),'utf8');
  const start=source.indexOf(' const value=',source.indexOf('const descriptor='));const end=source.indexOf('\n assertFixtureOrigin(value);',start);
  assert.ok(start>=0&&end>start);
  const expression=source.slice(start+' const value='.length,end).trim().replace(/;$/,'').replaceAll('():Descriptor=>','()=>').replaceAll(' as Descriptor','');
  // Execute only the actual descriptor read/parse expression, stripping its two TS annotations.
  return Function('lane','readAppsDescriptor','required','readFileSync',`return ${expression}`)(lane,reader,requiredInput,legacy);
}
test('Apps descriptor read and parse uses bounded reader without legacy FS fallback',()=>{
  let calls=0;const value=fixtureRead('apps',target=>{assert.equal(target,path);calls++;return '{"version":1}';},()=>assert.fail('legacy read'));
  assert.deepEqual(value,{version:1});assert.equal(calls,1);
});
test('actual Apps fixture parse sanitizes malformed private JSON text',()=>{
  assert.throws(()=>fixtureRead('apps',()=>'{"cookie":"private-value"} trailing-private-value',()=>assert.fail('legacy read')),error=>error.message==='APPS_DESCRIPTOR_CUSTODY_INVALID'&&!error.message.includes('private-value'));
});
test('actual Apps fixture parse sanitizes reader and required-input errors',()=>{
  assert.throws(()=>fixtureRead('apps',()=>{throw Error('private-value '+path);},()=>assert.fail('legacy read')),/^Error: APPS_DESCRIPTOR_CUSTODY_INVALID$/);
  assert.throws(()=>fixtureRead('apps',()=>assert.fail('reader after missing input'),()=>assert.fail('legacy read'),()=>{throw Error('private-value '+path);}),/^Error: APPS_DESCRIPTOR_CUSTODY_INVALID$/);
});
test('all other lanes retain original UTF8 read and parse behavior',()=>{
  for(const lane of ['books','movies','places','guides']){
   let calls=0;assert.deepEqual(fixtureRead(lane,()=>assert.fail('Apps reader'),(target,encoding)=>{assert.equal(target,path);assert.equal(encoding,'utf8');calls++;return '{"version":1}';}),{version:1});assert.equal(calls,1);
   assert.throws(()=>fixtureRead(lane,()=>assert.fail('Apps reader'),()=>'{invalid private-value'),SyntaxError);
  }
});
