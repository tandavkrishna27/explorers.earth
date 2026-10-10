import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {writeSync} from 'node:fs';

const ACK='APPS_TWO_RETAINED_ACL_ADOPTION_V1';
const PS='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const HELPER_SHA='d35c7b8a92813890d5074a9088ff6d690610322deb0684d0c52b26774a5ff764';
type Stage='validate'|'preflight'|'adopt';
type Dependencies={platform:string;argv:string[];environment:Record<string,string|undefined>;root:string;clock:{setTimeout(fn:()=>void,ms:number):unknown;clearTimeout(value:unknown):void};preflight():Promise<void>;adopt():Promise<void>};
class Refusal extends Error{constructor(stage:Stage){super('APPS_RETAINED_ACL_ADOPTION_FAILED '+stage);}}
function requireValue(value:unknown):asserts value{if(!value)throw Error('refused');}

/** Fresh, explicit authority for three fixed objects only. No recovery/qualification authority. */
export function createAppsRetainedAclAdoption(dependencies?:Dependencies){
 const synthetic=dependencies!==undefined,d=dependencies??nativeDependencies();let retained:Promise<{status:'adopted';evidence:'synthetic'|'native';qualification:false}>|undefined;
 return{run(){return retained??=execute();}};
 async function execute(){let stage:Stage='validate';
  try{
   requireValue(Object.keys(d).sort().join(',')==='adopt,argv,clock,environment,platform,preflight,root'&&typeof d.preflight==='function'&&typeof d.adopt==='function'&&typeof d.clock?.setTimeout==='function'&&typeof d.clock?.clearTimeout==='function');
   requireValue(d.platform==='win32'&&Array.isArray(d.argv)&&JSON.stringify(d.argv)===JSON.stringify(['--adopt-exact-retained-acls','--ack',ACK]));
   requireValue(path.win32.isAbsolute(d.root)&&path.win32.resolve(d.root)===d.root&&!d.root.startsWith('\\\\')&&!/[\x00-\x1f\x7f'"`]/.test(d.root));
   requireValue(!Object.entries(d.environment).some(([key,value])=>value!==undefined&&(/^(?:DOCKER_|MUSIC_C10_STANDALONE_POSTGRES_|(?:APPS|REPLATFORM)_E2E_)/i.test(key)||['NODE_OPTIONS','NODE_PATH','NODE_CHANNEL_FD','DATABASE_URL','DATABASE_URL_TEST'].includes(key))));
   stage='preflight';await bounded(d.preflight,30000);stage='adopt';await bounded(d.adopt,120000);
   return{status:'adopted' as const,evidence:synthetic?'synthetic' as const:'native' as const,qualification:false as const};
  }catch{throw new Refusal(stage);}
 }
 async function bounded(operation:()=>Promise<void>,budget:number){let timer:unknown;const original=Promise.resolve().then(operation);original.catch(()=>{});try{await Promise.race([original,new Promise<never>((_,reject)=>{timer=d.clock.setTimeout(()=>reject(Error('timeout')),budget);})]);}finally{d.clock.clearTimeout(timer);}}
}

// SetSecurityInfo(MAXIMUM_ALLOWED) deliberately suppresses child propagation.
// Non-inheritable ACEs alone do NOT suppress removal of old inherited child ACEs.
// https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-setsecurityinfo
const ADOPTION_CSHARP=String.raw`
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.Security.Cryptography;
public static class ExactAppsAclAdoption {
 const uint MAXIMUM_ALLOWED=0x02000000, READ_CONTROL=0x00020000, WRITE_DAC=0x00040000, READ_ATTRIBUTES=0x80;
 const uint OPEN_EXISTING=3, OPEN_REPARSE_POINT=0x00200000, BACKUP_SEMANTICS=0x02000000;
 const uint SHARE_READ_WRITE=3; // excludes FILE_SHARE_DELETE, never reads secret data
 static string owner=WindowsIdentity.GetCurrent().User.Value;
 static Process parent;static long parentStart;static Stopwatch pulses=Stopwatch.StartNew();static volatile bool pipeClosed=true;
 [StructLayout(LayoutKind.Sequential)] struct ProcessBasic {public IntPtr Reserved,Peb,Reserved2,Reserved3,Pid,ParentPid;}
 [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr handle,int kind,out ProcessBasic value,int size,out int returned);
 [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
 static void BeginParent(int pid){ProcessBasic info;int returned;Need(NtQueryInformationProcess(GetCurrentProcess(),0,out info,Marshal.SizeOf(typeof(ProcessBasic)),out returned)==0&&info.ParentPid.ToInt64()==pid);parent=Process.GetProcessById(pid);parentStart=parent.StartTime.ToUniversalTime().Ticks;pipeClosed=false;var input=new Thread(()=>{try{while(Console.In.ReadLine()=="APPS_ACL_PARENT_ALIVE"){lock(pulses){pulses.Restart();}}}finally{pipeClosed=true;}});input.IsBackground=true;input.Start();}
 static void ParentAlive(){Need(!pipeClosed&&!parent.HasExited&&Process.GetProcessById(parent.Id).StartTime.ToUniversalTime().Ticks==parentStart);lock(pulses){Need(pulses.ElapsedMilliseconds<5000);}}
 [StructLayout(LayoutKind.Sequential)] struct Info {public uint Attributes,CreateLow,CreateHigh,AccessLow,AccessHigh,WriteLow,WriteHigh,Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
 [StructLayout(LayoutKind.Sequential)] struct Basic { public long Creation,Access,Write,Change;public uint Attributes; }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint mode,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle handle,out Info info);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle handle,int type,out Basic info,uint size);
 [DllImport("advapi32.dll")] static extern uint GetSecurityInfo(SafeFileHandle handle,int type,uint security,out IntPtr sid,out IntPtr group,out IntPtr dacl,out IntPtr sacl,out IntPtr descriptor);
 [DllImport("advapi32.dll")] static extern uint SetSecurityInfo(SafeFileHandle handle,int type,uint security,IntPtr owner,IntPtr group,IntPtr dacl,IntPtr sacl);
 [DllImport("advapi32.dll")] static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr value);
 [DllImport("ntdll.dll")] static extern int NtQueryObject(SafeFileHandle handle,int type,IntPtr data,int size,out int required);
 static void Close(SafeFileHandle handle){Need(CloseHandle(handle.DangerousGetHandle()));handle.SetHandleAsInvalid();handle.Close();Need(handle.IsClosed);}
 static void Need(bool okay){if(!okay)throw new Exception("refused");}
 static void Time(Stopwatch clock){ParentAlive();Need(clock.ElapsedMilliseconds<85000);}
 static SafeFileHandle Open(string file,uint access,bool directory,bool witness=false){var h=CreateFileW(file,access,witness?7u:(directory?SHARE_READ_WRITE:1u),IntPtr.Zero,OPEN_EXISTING,OPEN_REPARSE_POINT|(directory?BACKUP_SEMANTICS:0),IntPtr.Zero);Need(!h.IsInvalid);return h;}
 static Info Physical(SafeFileHandle h,bool directory){Info i;Need(GetFileInformationByHandle(h,out i));Need((i.Attributes&0x400)==0&&((i.Attributes&0x10)!=0)==directory);if(!directory)Need(i.Links==1);return i;}
 static string Key(Info i){return String.Join(":",((i.Attributes&0x10)!=0?new uint[]{i.Volume,i.IndexHigh,i.IndexLow,i.CreateHigh,i.CreateLow,i.Attributes}:new uint[]{i.Volume,i.IndexHigh,i.IndexLow,i.CreateHigh,i.CreateLow,i.WriteHigh,i.WriteLow,i.SizeHigh,i.SizeLow,i.Attributes,i.Links}));}
 static RawSecurityDescriptor Security(SafeFileHandle h){IntPtr sid,group,dacl,sacl,sd;Need(GetSecurityInfo(h,1,7,out sid,out group,out dacl,out sacl,out sd)==0);try{uint size=GetSecurityDescriptorLength(sd);Need(size>0&&size<=65536);var bytes=new byte[size];Marshal.Copy(sd,bytes,0,(int)size);var result=new RawSecurityDescriptor(bytes,0);Need(result.Owner!=null&&result.DiscretionaryAcl!=null);return result;}finally{LocalFree(sd);}}
 static void Rights(SafeFileHandle h){IntPtr p=Marshal.AllocHGlobal(256);try{int required;Need(NtQueryObject(h,0,p,256,out required)==0);uint granted=(uint)Marshal.ReadInt32(p,4);Need((granted&(READ_CONTROL|WRITE_DAC|READ_ATTRIBUTES))==(READ_CONTROL|WRITE_DAC|READ_ATTRIBUTES));}finally{Marshal.FreeHGlobal(p);}}
 static string Acl(SafeFileHandle h){return Security(h).GetSddlForm(AccessControlSections.Owner|AccessControlSections.Group|AccessControlSections.Access);}
 static FileSecurity Exact(){var security=new FileSecurity();security.SetOwner(new SecurityIdentifier(owner));security.SetAccessRuleProtection(true,false);foreach(string sid in new[]{owner,"S-1-5-18","S-1-5-32-544"})security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid),FileSystemRights.FullControl,InheritanceFlags.None,PropagationFlags.None,AccessControlType.Allow));return security;}
 static void Apply(SafeFileHandle h){Rights(h);var raw=new RawSecurityDescriptor(Exact().GetSecurityDescriptorBinaryForm(),0);var bytes=new byte[raw.DiscretionaryAcl.BinaryLength];raw.DiscretionaryAcl.GetBinaryForm(bytes,0);var pinned=GCHandle.Alloc(bytes,GCHandleType.Pinned);try{Need(SetSecurityInfo(h,1,0x80000004,IntPtr.Zero,IntPtr.Zero,pinned.AddrOfPinnedObject(),IntPtr.Zero)==0);}finally{pinned.Free();}}
 static void Protected(SafeFileHandle h){var sd=Security(h);Need(sd.Owner.Value==owner);Need((sd.ControlFlags&ControlFlags.DiscretionaryAclProtected)!=0&&sd.DiscretionaryAcl.Count==3);var names=new HashSet<string>();foreach(GenericAce ace in sd.DiscretionaryAcl){var common=ace as CommonAce;Need(common!=null&&common.AceQualifier==AceQualifier.AccessAllowed&&common.AceFlags==AceFlags.None&&common.AccessMask==(int)FileSystemRights.FullControl);Need(new[]{owner,"S-1-5-18","S-1-5-32-544"}.Contains(common.SecurityIdentifier.Value)&&names.Add(common.SecurityIdentifier.Value));}}
 static string Times(SafeFileHandle h){Basic b;Need(GetFileInformationByHandleEx(h,0,out b,(uint)Marshal.SizeOf(typeof(Basic))));return String.Join(":",new long[]{b.Creation,b.Access,b.Write,b.Change,b.Attributes});}
 sealed class Record {public string Path,Key,Acl,TimesBefore;public bool Directory,RequireOwner;public SafeFileHandle Handle;public Record(string path,bool directory,uint access,bool requireOwner=true){Path=path;Directory=directory;RequireOwner=requireOwner;Handle=Open(path,access,directory);Key=ExactAppsAclAdoption.Key(Physical(Handle,directory));if(requireOwner)Need(Security(Handle).Owner.Value==owner);Acl=ExactAppsAclAdoption.Acl(Handle);TimesBefore=Times(Handle);}public void Verify(bool unchangedAcl){if(RequireOwner)Need(Security(Handle).Owner.Value==owner);if(!unchangedAcl)Protected(Handle);Need(Key==ExactAppsAclAdoption.Key(Physical(Handle,Directory)));using(var check=Open(Path,READ_CONTROL|READ_ATTRIBUTES,Directory,true)){Need(Key==ExactAppsAclAdoption.Key(Physical(check,Directory)));Need(ExactAppsAclAdoption.Acl(check)==ExactAppsAclAdoption.Acl(Handle));}if(unchangedAcl){Need(Acl==ExactAppsAclAdoption.Acl(Handle));if(!Directory)Need(TimesBefore==Times(Handle));}}}
 static string[] Names(string parent){var names=Directory.GetFileSystemEntries(parent).Select(Path.GetFileName).OrderBy(n=>n,StringComparer.Ordinal).ToArray();Need(names.Length>=2&&names.Length<=512&&names.All(n=>System.Text.RegularExpressions.Regex.IsMatch(n,"^current-[a-f0-9]{32}$")));return names;}
 static void Inspect(string ps,string helper,string path,Stopwatch clock){Time(clock);var p=new Process();p.StartInfo=new ProcessStartInfo(ps,"-NoLogo -NoProfile -NonInteractive -File \""+helper+"\" inspect \""+path+"\""){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};p.StartInfo.EnvironmentVariables.Clear();p.StartInfo.EnvironmentVariables["SystemRoot"]=Environment.GetEnvironmentVariable("SystemRoot");var output=new StringBuilder();bool overflow=false;var outputClosed=new ManualResetEvent(false);var errorClosed=new ManualResetEvent(false);p.OutputDataReceived+=(s,e)=>{if(e.Data==null)outputClosed.Set();else{lock(output){if(output.Length+e.Data.Length>4096)overflow=true;else output.Append(e.Data);}}};p.ErrorDataReceived+=(s,e)=>{if(e.Data==null)errorClosed.Set();};Need(p.Start());p.BeginOutputReadLine();p.BeginErrorReadLine();Need(p.WaitForExit(10000));Need(outputClosed.WaitOne(1000)&&errorClosed.WaitOne(1000));Time(clock);Need(!overflow&&p.ExitCode==0&&output.ToString()=="{\"ok\":true}");p.Dispose();}
 public static string Run(string root,string ps,string helper,int parentId){
  BeginParent(parentId);var clock=Stopwatch.StartNew();ParentAlive();Need(Path.GetFullPath(root)==root&&!root.StartsWith(@"\\")&&!root.Contains("\""));var parent=Path.Combine(root,".artifacts","music-token-secrets");var fixedNames=new[]{"current-b7e028133a9ddbaa592f51dac56e5b9b","current-6c19df9181633a022588752c25ca1674"};
  var held=new List<Record>();held.Add(new Record(helper,false,READ_CONTROL|READ_ATTRIBUTES));using(var input=new FileStream(helper,FileMode.Open,FileAccess.Read,FileShare.Read)){using(var hash=SHA256.Create()){Need(BitConverter.ToString(hash.ComputeHash(input)).Replace("-","").ToLowerInvariant()=="d35c7b8a92813890d5074a9088ff6d690610322deb0684d0c52b26774a5ff764");}}for(string ancestor=Path.GetDirectoryName(parent);;ancestor=Path.GetDirectoryName(ancestor)){held.Add(new Record(ancestor,true,READ_CONTROL|READ_ATTRIBUTES,false));if(ancestor==Path.GetPathRoot(ancestor))break;}
  // Parent mask is exactly MAXIMUM_ALLOWED: Microsoft's documented no-propagation guarantee.
  var directory=new Record(parent,true,MAXIMUM_ALLOWED);held.Add(directory);Rights(directory.Handle);var names=Names(parent);Need(fixedNames.All(n=>names.Contains(n)));
  var files=new List<Record>();foreach(var name in names){Time(clock);var record=new Record(Path.Combine(parent,name),false,READ_CONTROL|READ_ATTRIBUTES|(fixedNames.Contains(name)?WRITE_DAC:0));files.Add(record);if(fixedNames.Contains(name))Rights(record.Handle);}
  var leasePath=Path.Combine(parent,".apps-two-retained-acl-adoption.lock");var lease=new FileStream(leasePath,FileMode.CreateNew,FileSystemRights.FullControl,FileShare.None,4096,FileOptions.WriteThrough,Exact());lease.Flush(true);var leaseKey=Key(Physical(lease.SafeFileHandle,false));Protected(lease.SafeFileHandle);
  // No finally-disposal on rejection: handles survive until own process exits; lease inode remains.
  foreach(var item in held.Concat(files))item.Verify(true);Time(clock);ParentAlive();Apply(directory.Handle);Protected(directory.Handle);
  foreach(var item in files.Where(r=>fixedNames.Contains(Path.GetFileName(r.Path)))){Time(clock);item.Verify(true);ParentAlive();Apply(item.Handle);Protected(item.Handle);}
  foreach(var item in held)item.Verify(item!=directory);foreach(var item in files)item.Verify(!fixedNames.Contains(Path.GetFileName(item.Path)));
  var finalNames=Directory.GetFileSystemEntries(parent).Select(Path.GetFileName).Where(n=>n!=".apps-two-retained-acl-adoption.lock").OrderBy(n=>n,StringComparer.Ordinal).ToArray();Need(names.SequenceEqual(finalNames)&&Directory.GetFileSystemEntries(parent).Length==names.Length+1);
  Inspect(ps,helper,parent,clock);foreach(var name in fixedNames)Inspect(ps,helper,Path.Combine(parent,name),clock);
  foreach(var item in held.Concat(files)){Time(clock);item.Verify(item!=directory&&!fixedNames.Contains(Path.GetFileName(item.Path)));}
  foreach(var item in files.Concat(held)){ParentAlive();Close(item.Handle);}Time(clock);Need(leaseKey==Key(Physical(lease.SafeFileHandle,false)));Protected(lease.SafeFileHandle);
  ParentAlive();var info=Physical(lease.SafeFileHandle,false);Close(lease.SafeFileHandle);return "APPS_ACL_ADOPTED:"+info.Volume+":"+(((ulong)info.IndexHigh<<32)|info.IndexLow);
 }
}
`;

function nativeDependencies():Dependencies{
 const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),helper=path.join(root,'tunes','scripts','music-local-private-files.ps1');let unknown=false;
 async function canonical(file:string,owned:boolean){const fs=await import('node:fs/promises');requireValue(path.resolve(file)===file&&!file.startsWith('\\\\'));for(let current=file;;current=path.dirname(current)){const stat=await fs.lstat(current);requireValue(!stat.isSymbolicLink()&&await fs.realpath(current)===current);if(current===path.dirname(current))break;}const stat=await fs.lstat(file,{bigint:true});requireValue(stat.isFile()&&(!owned||stat.nlink===1n));}
 async function command(script:string,budget:number,kind:'adopt'|'inspect'){
  requireValue(!unknown);const {spawn}=await import('node:child_process');
  return await new Promise<string>((resolve,reject)=>{
   let output='',failed=false;
   const encoded=Buffer.from(script,'utf16le').toString('base64');requireValue(encoded.length+PS.length+100<32767);
   const child=spawn(PS,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',encoded],{shell:false,windowsHide:true,env:{SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP},stdio:['pipe','pipe','pipe']});
   const pulse=()=>{try{if(!failed&&!child.stdin.destroyed)child.stdin.write('APPS_ACL_PARENT_ALIVE\n');}catch{deny();}};
   const heartbeat=setInterval(pulse,250);
   const deny=()=>{if(failed)return;failed=true;unknown=true;clearInterval(heartbeat);try{child.stdin.end();}catch{}reject(Error('refused'));};
   const timer=setTimeout(deny,budget);child.on('error',deny);child.stdin.on('error',deny);child.stdout.on('error',deny);child.stderr.on('error',deny);try{if(kind==='adopt')child.stdin.write(Buffer.from(ADOPTION_CSHARP,'utf8').toString('base64')+'\n');}catch{deny();}pulse();
   child.stdout.on('data',value=>{if(output.length+value.length>4096)deny();else output+=value.toString();});child.stderr.resume();
   child.on('close',(code,signal)=>{clearTimeout(timer);clearInterval(heartbeat);child.stdin.end();const text=output.trim();if(!failed&&code===0&&signal===null&&(kind==='adopt'?/^APPS_ACL_ADOPTED:\d{1,10}:\d{1,20}$/.test(text):text==='{"ok":true}'))resolve(text);else deny();});
  });
 }
 return{platform:process.platform,argv:process.argv.slice(2),environment:process.env,root,clock:{setTimeout:(fn,ms)=>setTimeout(()=>{unknown=true;fn();},ms),clearTimeout:value=>clearTimeout(value as NodeJS.Timeout)},async preflight(){requireValue(process.versions.node==='24.21.0');await canonical(process.execPath,false);await canonical(PS,false);await canonical(helper,true);const {createHash}=await import('node:crypto');const fs=await import('node:fs/promises');requireValue(createHash('sha256').update(await fs.readFile(helper)).digest('hex')===HELPER_SHA);},async adopt(){
  const literal=(value:string)=>"'"+value.replaceAll("'","''")+"'";
  // Fixed source supplied as data on the first pipe line; later lines carry liveness only.
  const script="$ErrorActionPreference='Stop'\ntry { if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) { throw 'refused' }; Add-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadLine())))\n[Console]::Out.WriteLine([ExactAppsAclAdoption]::Run("+literal(root)+","+literal(PS)+","+literal(helper)+","+process.pid+")); exit 0 } catch { exit 1 }";
  // Only this positively closed, source-owned child may supply native lease identity.
  const metadata=(await command(script,100000,'adopt')).split(':');
  const fs=await import('node:fs/promises'),leasePath=path.join(root,'.artifacts','music-token-secrets','.apps-two-retained-acl-adoption.lock');
  await canonical(leasePath,true);const observed=await fs.lstat(leasePath,{bigint:true});
  // libuv Windows maps dev to volume serial low32 and ino to FILE_ID.QuadPart.
  // https://github.com/libuv/libuv/blob/v1.x/src/win/fs.c
  requireValue(!unknown&&observed.dev===BigInt(metadata[1])&&observed.ino===BigInt(metadata[2])&&observed.size===0n);
  const opened=await fs.open(leasePath,'r');const identity=await opened.stat({bigint:true});
  requireValue(identity.dev===observed.dev&&identity.ino===observed.ino&&identity.nlink===1n&&identity.size===0n);
  await command("& "+literal(helper)+" inspect "+literal(leasePath)+"; exit $LASTEXITCODE",10000,'inspect');
  await opened.close();await canonical(leasePath,true);const final=await fs.lstat(leasePath,{bigint:true});
  requireValue(!unknown&&final.dev===observed.dev&&final.ino===observed.ino&&final.size===0n&&final.mtimeNs===observed.mtimeNs&&final.ctimeNs===observed.ctimeNs);
  await fs.unlink(leasePath);
 }};
}
// Self terminal failure is not proof of closure of a timed-out PowerShell descendant.
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)void createAppsRetainedAclAdoption().run().then(result=>{writeSync(1,JSON.stringify(result)+'\n');},failure=>{try{writeSync(2,failure instanceof Refusal?failure.message+'\n':'APPS_RETAINED_ACL_ADOPTION_FAILED unknown\n');}finally{process.exit(1);}});
