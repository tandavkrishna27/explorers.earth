import {spawn,execFile} from 'node:child_process';
import {lstatSync,realpathSync} from 'node:fs';
import path from 'node:path';

/** Read-only capability admission. Explicit executable only; no discovery fallback. */
export async function assertPublicParityPowerShellRuntime(executable:string|undefined,script:string):Promise<string>{
 const refused=()=>new Error('PUBLIC_PARITY_RUNTIME_UNSUPPORTED');
 try{
  if(process.platform!=='win32'||typeof executable!=='string'||!path.isAbsolute(executable)||path.resolve(executable)!==executable||executable.length>4096||/[\x00-\x1f\x7f]/.test(executable))throw refused();
  for(const file of [executable,script]){const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||realpathSync(file)!==file)throw refused();}
  const command=`$ErrorActionPreference='Stop'; . '${script.replaceAll("'","''")}' -DefinitionsOnly; if([PublicParityJob.ProductionNative]::ConstructionCount -ne 0 -or [PublicParityJob.ProductionNative]::EntryCount -ne 0){exit 1}; [Console]::Out.Write('PUBLIC_PARITY_RUNTIME_READY')`;
  const output=await new Promise<string>((resolve,reject)=>execFile(executable,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{shell:false,windowsHide:true,timeout:10000,maxBuffer:65536,encoding:'utf8',env:{SystemRoot:process.env.SystemRoot}},(error,stdout,stderr)=>error||stderr.length?reject(refused()):resolve(stdout)));
  if(output!=='PUBLIC_PARITY_RUNTIME_READY')throw refused();return executable;
 }catch{throw refused();}
}

/** Own every child stream event; retain only a finite transport failure. */
export function launchPublicParitySupervisor(executable:string,args:readonly string[],cwd:string){
 const child=spawn(executable,[...args],{cwd,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot}});
 let failure:Error|undefined,readFailed=false,ended=false,queued=0,stderrBytes=0,wake:(()=>void)|undefined;
 const chunks:Buffer[]=[];const pending=new Set<(error:Error)=>void>();
 const refuseWrites=()=>{failure??=new Error('PUBLIC_PARITY_LAUNCHER_TRANSPORT_FAILED');for(const reject of [...pending])reject(failure);};
 const fail=()=>{readFailed=true;refuseWrites();wake?.();};
 child.stdin.on('error',fail);child.stdin.on('close',refuseWrites);
 child.stdout.on('error',fail);child.stdout.on('end',()=>{ended=true;wake?.();});child.stdout.on('close',()=>{if(!ended)fail();ended=true;wake?.();});
 child.stdout.on('data',(bytes:Buffer)=>{queued+=bytes.length;if(queued>9*1024*1024+4){fail();child.stdout.destroy();}else chunks.push(bytes);wake?.();});
 child.stderr.on('error',fail);child.stderr.on('data',(bytes:Buffer)=>{stderrBytes+=bytes.length;if(stderrBytes>1024*1024){fail();child.stderr.destroy();}});
 const exit=new Promise<{code:number|null;closed:boolean}>((resolve,reject)=>{child.once('error',()=>{fail();reject(failure);});child.once('close',code=>{ended=true;if(code===0)refuseWrites();else fail();wake?.();resolve({code,closed:true});});});
 // Child spawn rejection can precede the supervisor's awaited exit proof.
 exit.catch(()=>undefined);
 return {stream:{async read():Promise<Buffer|null>{while(!chunks.length&&!ended&&!readFailed)await new Promise<void>(resolve=>{wake=resolve;});wake=undefined;if(readFailed)throw failure;const chunk=chunks.shift();if(chunk)queued-=chunk.length;return chunk??null;},write(bytes:Buffer):Promise<void>{if(failure)return Promise.reject(failure);return new Promise((resolve,reject)=>{let settled=false;const finish=(error?:Error|null)=>{if(settled)return;settled=true;pending.delete(refuse);if(error){fail();reject(failure);}else resolve();};const refuse=(error:Error)=>{if(settled)return;settled=true;pending.delete(refuse);reject(error);};pending.add(refuse);try{child.stdin.write(bytes,finish);}catch{fail();}});},async close(){child.stdin.end();}},exited:()=>exit};
}
