import {lstatSync,realpathSync,openSync,fstatSync,readSync,closeSync,constants} from 'node:fs';
import {isAbsolute,resolve,dirname} from 'node:path';
import {TextDecoder} from 'node:util';

const LIMIT=65536, CHUNK=4096;
const METHODS=['lstatSync','realpathSync','openSync','fstatSync','readSync','closeSync'];
const native=Object.freeze({lstatSync,realpathSync,openSync,fstatSync,readSync,closeSync});
const FIELDS=['dev','ino','mode','uid','gid','nlink','mtimeNs','ctimeNs'];
function refuse(){throw Error('APPS_DESCRIPTOR_CUSTODY_INVALID');}
function requireValue(value){if(!value)refuse();}
function samePath(a,b){return typeof a==='string'&&(process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b);}
function identity(stat,file){
 requireValue(stat&&!stat.isSymbolicLink()&&(file?stat.isFile():stat.isDirectory()));
 const value={};
 for(const field of FIELDS){requireValue(typeof stat[field]==='bigint');value[field]=stat[field];}
 if(file){requireValue(typeof stat.size==='bigint'&&stat.size>=0n&&stat.size<=BigInt(LIMIT)&&stat.nlink===1n);value.size=stat.size;}
 return value;
}
function sameIdentity(a,b){return Object.keys(a).every(key=>a[key]===b[key]);}
function adapter(raw){
 const descriptors=Object.getOwnPropertyDescriptors(raw);
 requireValue(Reflect.ownKeys(descriptors).length===METHODS.length);
 const fs={};
 for(const name of METHODS){const d=descriptors[name];requireValue(d?.enumerable&&Object.hasOwn(d,'value')&&typeof d.value==='function');fs[name]=d.value;}
 return fs;
}

/** Returns only text for JSON.parse. Parent-verified private ACL custody remains required;
 * these pathname/handle checks do not establish adversarial Windows ACL protection.
 * Import performs no I/O. An optional complete adapter is for resource-free contracts. */
export function readAppsDescriptor(path,filesystem=native){
 let fd,fs;
 try{
  requireValue(typeof path==='string'&&path.length>0&&path.length<=1024&&!/[\x00-\x1f\x7f]/.test(path)&&isAbsolute(path)&&samePath(resolve(path),path));
  fs=adapter(filesystem);
  const inspect=(target,file)=>{
   const value=identity(fs.lstatSync(target,{bigint:true}),file);
   requireValue(samePath(fs.realpathSync(target),target));return value;
  };
  const ancestors=[];let current=dirname(path);
  for(let count=0;;count++){
   requireValue(count<=1024);ancestors.push({path:current,identity:inspect(current,false)});
   const parent=dirname(current);if(parent===current)break;current=parent;
  }
  const before=inspect(path,true);
  fd=fs.openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  requireValue(Number.isSafeInteger(fd)&&fd>=0);
  requireValue(sameIdentity(before,identity(fs.fstatSync(fd,{bigint:true}),true)));
  const size=Number(before.size),bytes=Buffer.alloc(size+1);let count=0,calls=0;
  while(count<bytes.length){
   requireValue(++calls<=LIMIT+2);
   const wanted=Math.min(CHUNK,bytes.length-count),read=fs.readSync(fd,bytes,count,wanted,null);
   requireValue(Number.isSafeInteger(read)&&read>=0&&read<=wanted);
   if(read===0)break;count+=read;
  }
  requireValue(count===size);
  requireValue(sameIdentity(before,identity(fs.fstatSync(fd,{bigint:true}),true))&&sameIdentity(before,inspect(path,true)));
  for(const entry of ancestors)requireValue(sameIdentity(entry.identity,inspect(entry.path,false)));
  const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes.subarray(0,count));
  const closing=fd;fd=undefined;fs.closeSync(closing);return text;
 }catch{
  if(fd!==undefined&&fs){try{fs.closeSync(fd);}catch{}}
  refuse();
 }
}
