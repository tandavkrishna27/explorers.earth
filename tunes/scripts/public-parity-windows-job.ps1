param([switch]$DefinitionsOnly)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -ne 'Core' -or $PSVersionTable.PSVersion.Major -lt 7 -or -not $IsWindows) { throw 'PUBLIC_PARITY_RUNTIME_UNSUPPORTED' }
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
namespace PublicParityJob {
public sealed class NativeFailure : Exception { public readonly string Stage; public readonly uint Code; public Child OwnedChild; public NativeFailure(string stage, uint code=0):base(stage){Stage=stage;Code=code;} }
public sealed class Child { public IntPtr Process, Thread; public string Slot; public bool Retired; }
public sealed class Launch { public string Executable, Cwd; public string[] Arguments; public Dictionary<string,string> Environment; public string Slot; }
public interface IJobNative {
 IntPtr Job(); Child Create(Launch launch); void Assign(IntPtr job, Child child); void Resume(Child child);
 bool Wait(Child child, uint ms); uint ExitCode(Child child); void Terminate(Child child, uint code);
 void TerminateJob(IntPtr job,uint code); uint Active(IntPtr job); void Release(IntPtr handle,string kind); void WaitLogs(long deadline);
}
public sealed class JobRunner {
 readonly IJobNative native; readonly IntPtr job; readonly int expectedEpochCount; readonly List<Child> retained = new List<Child>();
 public volatile bool Cancelled; public bool Failed {get;private set;} public bool Empty {get;private set;} public bool Closed {get;private set;}
 bool admission=true; public JobRunner(IJobNative native,int expectedEpochCount){if(expectedEpochCount!=32&&expectedEpochCount!=12)throw new NativeFailure("protocol");this.expectedEpochCount=expectedEpochCount;this.native=native;job=native.Job();}
 public void Cancel(){Cancelled=true;Failed=true;admission=false;}
 void Check(){if(Cancelled)throw new OperationCanceledException();}
 void WaitPositive(Child child,long deadline,bool cancellable){while(true){if(cancellable)Check();long left=deadline-Environment.TickCount64;if(left<=0)throw new NativeFailure("wait");if(native.Wait(child,(uint)Math.Min(100,left)))return;}}
 public Child Launch(Launch launch,long deadline){
  Check();int epoch;if(launch.Slot!="fixture"&&(!int.TryParse(launch.Slot,out epoch)||epoch<1||epoch>expectedEpochCount||launch.Slot!=epoch.ToString()))throw new NativeFailure("protocol");if(!admission||retained.Any(c=>c.Slot==launch.Slot))throw new NativeFailure("protocol");
  Child child=null;try{child=native.Create(launch);retained.Add(child);Check();native.Assign(job,child);Check();native.Resume(child);Check();return child;}
  catch(Exception error){Failed=true;admission=false;if(child==null&&error is NativeFailure)child=((NativeFailure)error).OwnedChild;if(child!=null&&!retained.Contains(child))retained.Add(child);if(child!=null){native.Terminate(child,0xE0470001);WaitPositive(child,deadline,false);}throw;}
 }
 public object Retire(int epoch,long deadline){Check();if(epoch<1||epoch>expectedEpochCount)throw new NativeFailure("protocol");Child c=retained.SingleOrDefault(x=>x.Slot==epoch.ToString());if(c==null||c.Retired)throw new NativeFailure("protocol");if(native.Wait(c,0))throw new NativeFailure("wait");native.Terminate(c,0xE0470001);WaitPositive(c,deadline,true);Check();c.Retired=true;return new {epoch,processSignaled=true,handlesRetained=c.Process!=IntPtr.Zero&&c.Thread!=IntPtr.Zero};}
 public object Finish(long deadline,bool abort){
  admission=false;if(abort)Cancel();
  Child fixture=retained.SingleOrDefault(c=>c.Slot=="fixture");
  if(!abort){try{if(fixture==null||retained.Count(c=>c.Slot!="fixture"&&c.Retired)!=expectedEpochCount)throw new NativeFailure("protocol");WaitPositive(fixture,Math.Min(deadline,Environment.TickCount64+5000),true);if(native.ExitCode(fixture)!=0)throw new NativeFailure("wait");}catch{Cancel();throw;}}
  native.TerminateJob(job,0xE0470001);foreach(Child c in retained)WaitPositive(c,deadline,false);
  if(native.Active(job)!=0)throw new NativeFailure("query");Empty=true;
  return new {activeProcesses=0,fixtureSignaled=fixture!=null,fixtureExitCode=fixture==null?0:native.ExitCode(fixture),workersSignaled=true};
 }
 public void Exit(long deadline=0){
  if(deadline==0)deadline=Environment.TickCount64+5000;
  if(!Empty||Closed)throw new NativeFailure("protocol");
  try{
   native.WaitLogs(deadline);
   foreach(Child c in retained){
    if(c.Thread!=IntPtr.Zero){native.Release(c.Thread,"thread");c.Thread=IntPtr.Zero;}
    if(c.Process!=IntPtr.Zero){native.Release(c.Process,"process");c.Process=IntPtr.Zero;}
   }
   native.Release(job,"job");Closed=true;
  }catch{Failed=true;throw;}
 }
}
// One retained result shared by production drains and the DefinitionsOnly seam.
public sealed class DrainSettlement {
 NativeFailure first;
 public void Record(NativeFailure error){Interlocked.CompareExchange(ref first,error,null);}
 public void ThrowIfFailed(){NativeFailure error=Volatile.Read(ref first);if(error!=null)throw error;}
 public void Drain(Action read,Action release,Action<NativeFailure> failed){
  try{read();}catch(Exception error){var failure=error as NativeFailure??new NativeFailure("protocol");Record(failure);failed(failure);}
  finally{try{release();}catch(Exception error){var failure=error as NativeFailure??new NativeFailure("release");Record(failure);failed(failure);}}
 }
}
public sealed class OrdinarySlot {
 readonly object gate=new object();bool busy;long version;
 public long Begin(bool priority=false){lock(gate){if(busy&&!priority)throw new NativeFailure("protocol");busy=true;return ++version;}}
 public void RequireIdle(){lock(gate){if(busy)throw new NativeFailure("protocol");}}
 public void Publish(long owner,Action send){lock(gate){if(owner==version)busy=false;send();}}
}public sealed class ProductionNative : IJobNative {
 readonly DrainSettlement drainSettlement=new DrainSettlement(); readonly List<Task> drains=new List<Task>(); public static int ConstructionCount,EntryCount; public ProductionNative(){Interlocked.Increment(ref ConstructionCount);}
 static void Entry(){Interlocked.Increment(ref EntryCount);} static NativeFailure Error(string stage){return new NativeFailure(stage,(uint)Marshal.GetLastWin32Error());}
 [StructLayout(LayoutKind.Sequential)] struct SECURITY_ATTRIBUTES { public int Size; public IntPtr Descriptor; public int Inherit; }
 [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT {public long PerProcess,PerJob;public uint Flags;public UIntPtr Min,Max;public uint Active;public UIntPtr Affinity;public uint Priority,Scheduling;}
 [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS {public ulong R,W,O,RB,WB,OB;}
 [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMIT {public BASIC_LIMIT Basic;public IO_COUNTERS IO;public UIntPtr ProcessMemory,JobMemory,PeakProcess,PeakJob;}
 [StructLayout(LayoutKind.Sequential)] struct ACCOUNT { public long User,Kernel,PeriodUser,PeriodKernel;public uint Faults,Total,Active,Terminated; }
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct STARTUPINFO {public int cb;public string reserved,desktop,title;public uint x,y,xSize,ySize,xChars,yChars,fill,flags;public ushort show,reserved2;public IntPtr reservedPointer,input,output,error;}
 [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX {public STARTUPINFO Info;public IntPtr Attributes;}
 [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION {public IntPtr Process,Thread;public uint ProcessId,ThreadId;}
 [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObjectW(IntPtr attributes,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int cls,ref EXTENDED_LIMIT info,uint length);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int cls,out ACCOUNT info,uint length,IntPtr returnLength);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint ms);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,ref SECURITY_ATTRIBUTES attrs,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,uint flags,ref UIntPtr size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,UIntPtr attribute,IntPtr value,UIntPtr size,IntPtr previous,IntPtr returned);
 [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
 [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool CreateProcessW(string executable,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string cwd,ref STARTUPINFOEX startup,out PROCESS_INFORMATION process);
 public IntPtr Job(){Entry();IntPtr h=CreateJobObjectW(IntPtr.Zero,null);if(h==IntPtr.Zero)throw Error("create");EXTENDED_LIMIT info=new EXTENDED_LIMIT();info.Basic.Flags=0x2000;if(!SetInformationJobObject(h,9,ref info,(uint)Marshal.SizeOf<EXTENDED_LIMIT>())){Release(h,"job");throw Error("create");}return h;}
 public static string Quote(string value){if(value.IndexOf('\0')>=0)throw new NativeFailure("protocol");var b=new StringBuilder("\"");int slashes=0;foreach(char c in value){if(c=='\\'){slashes++;continue;}if(c=='\"'){b.Append('\\',slashes*2+1);b.Append(c);}else{b.Append('\\',slashes);b.Append(c);}slashes=0;}b.Append('\\',slashes*2);return b.Append('"').ToString();}
 public Child Create(Launch launch){
  Entry();IntPtr ir=IntPtr.Zero,iw=IntPtr.Zero,or=IntPtr.Zero,ow=IntPtr.Zero,er=IntPtr.Zero,ew=IntPtr.Zero,list=IntPtr.Zero,handles=IntPtr.Zero,env=IntPtr.Zero;bool initialized=false;PROCESS_INFORMATION pi=new PROCESS_INFORMATION();
  try{SECURITY_ATTRIBUTES sa=new SECURITY_ATTRIBUTES{Size=Marshal.SizeOf<SECURITY_ATTRIBUTES>(),Inherit=1};
   if(!CreatePipe(out ir,out iw,ref sa,0)||!CreatePipe(out or,out ow,ref sa,0)||!CreatePipe(out er,out ew,ref sa,0))throw Error("create");
   foreach(IntPtr h in new[]{iw,or,er})if(!SetHandleInformation(h,1,0))throw Error("create");
   UIntPtr size=UIntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);if(size==UIntPtr.Zero)throw Error("create");list=Marshal.AllocHGlobal((int)size.ToUInt64());if(!InitializeProcThreadAttributeList(list,1,0,ref size))throw Error("create");initialized=true;
   handles=Marshal.AllocHGlobal(IntPtr.Size*3);Marshal.WriteIntPtr(handles,0,ir);Marshal.WriteIntPtr(handles,IntPtr.Size,ow);Marshal.WriteIntPtr(handles,IntPtr.Size*2,ew);
   if(!UpdateProcThreadAttribute(list,0,(UIntPtr)0x20002,handles,(UIntPtr)(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero))throw Error("create");
   string environment=String.Join("\0",launch.Environment.OrderBy(x=>x.Key,StringComparer.OrdinalIgnoreCase).Select(x=>x.Key+"="+x.Value))+"\0\0";env=Marshal.StringToHGlobalUni(environment);
   var startup=new STARTUPINFOEX{Info=new STARTUPINFO{cb=Marshal.SizeOf<STARTUPINFOEX>(),flags=0x101,show=0,input=ir,output=ow,error=ew},Attributes=list};
   string command=Quote(launch.Executable)+" "+String.Join(" ",launch.Arguments.Select(Quote));
   if(!CreateProcessW(launch.Executable,new StringBuilder(command),IntPtr.Zero,IntPtr.Zero,true,0x80404,env,launch.Cwd,ref startup,out pi))throw Error("create");
   // Drain separately: the child's bytes never enter the launcher control stream.
   IntPtr outRead=or,errorRead=er;or=er=IntPtr.Zero;Drain(outRead,launch.Slot,"stdout");Drain(errorRead,launch.Slot,"stderr");
   return new Child{Process=pi.Process,Thread=pi.Thread,Slot=launch.Slot};
  }catch(Exception error){
   if(pi.Process!=IntPtr.Zero){var failure=error as NativeFailure??new NativeFailure("create");failure.OwnedChild=new Child{Process=pi.Process,Thread=pi.Thread,Slot=launch.Slot};throw failure;}
   throw;
  }finally{
   NativeFailure releaseFailure=null;
   foreach(IntPtr h in new[]{ir,iw,or,ow,er,ew})if(h!=IntPtr.Zero)try{Release(h,"pipe");}catch(NativeFailure error){releaseFailure=error;}
   if(initialized)DeleteProcThreadAttributeList(list);
   if(list!=IntPtr.Zero)Marshal.FreeHGlobal(list);
   if(handles!=IntPtr.Zero)Marshal.FreeHGlobal(handles);
   if(env!=IntPtr.Zero)Marshal.FreeHGlobal(env);
   if(releaseFailure!=null){if(pi.Process!=IntPtr.Zero)releaseFailure.OwnedChild=new Child{Process=pi.Process,Thread=pi.Thread,Slot=launch.Slot};throw releaseFailure;}
  }
 }
 void Drain(IntPtr h,string slot,string stream){
  drains.Add(Task.Run(()=>drainSettlement.Drain(
   ()=>{using(var fs=new FileStream(new Microsoft.Win32.SafeHandles.SafeFileHandle(h,false),FileAccess.Read,4096,false)){
    byte[] buffer=new byte[4096];int n;while((n=fs.Read(buffer,0,buffer.Length))>0)Wire.Log(slot,stream,Encoding.UTF8.GetString(buffer,0,n));
   }},
   ()=>Release(h,"pipe"),
   failure=>Wire.TransportFailed(failure))));
 }
 public void WaitLogs(long deadline){Entry();foreach(Task drain in drains){long left=deadline-Environment.TickCount64;if(left<1||!drain.Wait((int)Math.Min(int.MaxValue,left)))throw new NativeFailure("wait");drain.GetAwaiter().GetResult();}drainSettlement.ThrowIfFailed();Wire.ThrowIfTransportFailed();}
 public void Assign(IntPtr job,Child child){Entry();if(!AssignProcessToJobObject(job,child.Process))throw Error("assign");}
 public void Resume(Child child){Entry();if(ResumeThread(child.Thread)==uint.MaxValue)throw Error("resume");}
 public bool Wait(Child child,uint ms){Entry();uint result=WaitForSingleObject(child.Process,ms);if(result==0)return true;if(result==258)return false;throw Error("wait");}
 public uint ExitCode(Child child){Entry();uint code;if(!GetExitCodeProcess(child.Process,out code))throw Error("wait");return code;}
 public void Terminate(Child child,uint code){Entry();if(!TerminateProcess(child.Process,code))throw Error("terminate");}
 public void TerminateJob(IntPtr job,uint code){Entry();if(!TerminateJobObject(job,code))throw Error("terminate");}
 public uint Active(IntPtr job){Entry();ACCOUNT value;if(!QueryInformationJobObject(job,1,out value,(uint)Marshal.SizeOf<ACCOUNT>(),IntPtr.Zero))throw Error("query");return value.Active;}
 public void Release(IntPtr handle,string kind){Entry();if(!CloseHandle(handle))throw Error("release");}
}
public sealed class ScriptedNative : IJobNative {
 readonly DrainSettlement drainSettlement=new DrainSettlement(); public void RecordDrainFailure(string stage){
  drainSettlement.Drain(()=>{if(stage=="protocol")throw new NativeFailure(stage);},()=>{if(stage=="release")throw new NativeFailure(stage);},failure=>{});
 }
 public readonly List<string> Events=new List<string>(); public string Fail;public bool Stuck,Exited,PartialCreate;public uint FixtureCode,ActiveCount;public Action OnCreate;
 void Call(string stage){Events.Add(stage);if(Fail==stage)throw new NativeFailure(stage);}
 public IntPtr Job(){Call("job");return (IntPtr)1;} public Child Create(Launch launch){Call("create");if(PartialCreate)throw new NativeFailure("create"){OwnedChild=new Child{Process=(IntPtr)2,Thread=(IntPtr)3,Slot=launch.Slot}};Exited=false;if(OnCreate!=null)OnCreate();return new Child{Process=(IntPtr)2,Thread=(IntPtr)3,Slot=launch.Slot};}
 public void WaitLogs(long deadline){Call("drains");drainSettlement.ThrowIfFailed();} public void Assign(IntPtr job,Child child){Call("assign");}public void Resume(Child child){Call("resume");}
 public bool Wait(Child child,uint ms){Call("wait");if(Stuck&&ms>0)Thread.Sleep((int)Math.Min(ms,10));return !Stuck&&(ms!=0||Exited);}
 public uint ExitCode(Child child){Call("exit-code");return FixtureCode;}public void Terminate(Child child,uint code){Call("terminate");Exited=true;}
 public void TerminateJob(IntPtr job,uint code){Call("terminate-job");Exited=true;}public uint Active(IntPtr job){Call("query");return ActiveCount;}
 public void Release(IntPtr handle,string kind){Call("release-"+kind);}
}
public static class ContractCases {
 public static string HandleCustodyRegression(){var native=new ScriptedNative();var runner=new JobRunner(native,32);runner.Launch(new Launch{Slot="1"},Environment.TickCount64+1000);var proof=runner.Retire(1,Environment.TickCount64+1000);bool retained;using(var json=JsonDocument.Parse(JsonSerializer.Serialize(proof)))retained=json.RootElement.GetProperty("handlesRetained").GetBoolean();bool before=native.Events.Any(value=>value=="release-process"||value=="release-thread");runner.Finish(Environment.TickCount64+1000,true);runner.Exit();bool after=native.Events.Contains("release-process")&&native.Events.Contains("release-thread")&&runner.Closed;return JsonSerializer.Serialize(new{retained,closedBeforeFinal=before,closedAfterFinal=after});}
public static string FamilyRegression(){
  int refused=0;
  foreach(int count in new[]{32,12}){
   var n=new ScriptedNative();var r=new JobRunner(n,count);r.Launch(new Launch{Slot="fixture"},Environment.TickCount64+1000);
   foreach(int bad in new[]{count+1,44}){int before=n.Events.Count;try{r.Launch(new Launch{Slot=bad.ToString()},Environment.TickCount64+1000);throw new Exception("invalid epoch admitted");}catch(NativeFailure){Require(n.Events.Count==before);refused++;}}
   int incomplete=count==32?16:11;
   for(int i=1;i<=incomplete;i++){r.Launch(new Launch{Slot=i.ToString()},Environment.TickCount64+1000);r.Retire(i,Environment.TickCount64+1000);}
   try{r.Finish(Environment.TickCount64+1000,false);throw new Exception("partial family finished");}catch(NativeFailure){Require(!r.Empty);refused++;}
   r.Finish(Environment.TickCount64+1000,true);r.Exit();Require(r.Empty&&r.Closed);
   n=new ScriptedNative();r=new JobRunner(n,count);r.Launch(new Launch{Slot="fixture"},Environment.TickCount64+1000);
   for(int i=1;i<=count;i++){r.Launch(new Launch{Slot=i.ToString()},Environment.TickCount64+1000);r.Retire(i,Environment.TickCount64+1000);}
   r.Finish(Environment.TickCount64+1000,false);r.Exit();Require(r.Empty&&r.Closed);
  }
  foreach(int invalid in new[]{16,44,0}){var n=new ScriptedNative();try{new JobRunner(n,invalid);throw new Exception("unbound count admitted");}catch(NativeFailure){Require(n.Events.Count==0);}}
  Require(ProductionNative.ConstructionCount==0&&ProductionNative.EntryCount==0);
  return JsonSerializer.Serialize(new{counts=new[]{32,12},refused,productionConstructors=ProductionNative.ConstructionCount,productionEntries=ProductionNative.EntryCount});
 } static void Require(bool value){if(!value)throw new Exception("contract failed");}
 public static string Run(string name){
  string[] allowed={"assign-before-resume","create-failure","partial-create-failure","assign-failure","resume-failure","process-wait-timeout","job-query-failure","nonzero-active","abort-stuck-fixture","abort-pending-command","finish-nonzero-fixture","exit-handshake","handle-release-failure","process-release-failure","job-release-failure","drain-read-failure","drain-release-failure"};
  if(!allowed.Contains(name))throw new ArgumentException("case refused");var n=new ScriptedNative();var r=new JobRunner(n,32);var launch=new Launch{Slot="fixture"};bool threw=false;
  try{
   if(name=="create-failure")n.Fail="create";if(name=="partial-create-failure")n.PartialCreate=true;if(name=="assign-failure")n.Fail="assign";if(name=="resume-failure")n.Fail="resume";
   if(name=="abort-pending-command")n.OnCreate=()=>r.Cancel();
   r.Launch(launch,Environment.TickCount64+50);
   if(name=="process-wait-timeout")n.Stuck=true;
   if(name=="job-query-failure")n.Fail="query";if(name=="nonzero-active")n.ActiveCount=1;
   if(name=="finish-nonzero-fixture"){for(int i=1;i<=32;i++){r.Launch(new Launch{Slot=i.ToString()},Environment.TickCount64+50);r.Retire(i,Environment.TickCount64+50);}n.FixtureCode=7;r.Finish(Environment.TickCount64+50,false);}
   if(name=="abort-stuck-fixture")n.Stuck=false;
   r.Finish(Environment.TickCount64+50,true);
   if(name=="handle-release-failure")n.Fail="release-thread";if(name=="process-release-failure")n.Fail="release-process";if(name=="job-release-failure")n.Fail="release-job";if(name=="drain-read-failure")n.RecordDrainFailure("protocol");if(name=="drain-release-failure")n.RecordDrainFailure("release");
   if(name=="exit-handshake"||name.Contains("release-failure")||name=="drain-read-failure")r.Exit();
  }catch(NativeFailure){threw=true;}catch(OperationCanceledException){threw=true;}
  bool expectedFailure=new[]{"create-failure","partial-create-failure","assign-failure","resume-failure","process-wait-timeout","job-query-failure","nonzero-active","abort-pending-command","finish-nonzero-fixture","handle-release-failure","process-release-failure","job-release-failure","drain-read-failure","drain-release-failure"}.Contains(name);Require(threw==expectedFailure);
  if(name=="assign-before-resume")Require(n.Events.Take(4).SequenceEqual(new[]{"job","create","assign","resume"}));
  if(name=="partial-create-failure"||name=="assign-failure"||name=="resume-failure")Require(n.Events.Contains("terminate")&&n.Events.Last()=="wait");
  if(name=="abort-pending-command")Require(!n.Events.Contains("assign")&&!n.Events.Contains("resume")&&n.Events.Contains("terminate"));
  if(name=="abort-stuck-fixture")Require(n.Events.IndexOf("terminate-job")<n.Events.IndexOf("wait"));
  if(name=="finish-nonzero-fixture"){Require(r.Failed&&!r.Empty);r.Finish(Environment.TickCount64+50,true);Require(r.Failed&&r.Empty);}
  if(name=="exit-handshake")Require(r.Empty&&r.Closed);if(name.Contains("drain-"))Require(r.Failed&&!r.Closed&&!n.Events.Any(e=>e.StartsWith("release-")));if(name.Contains("release-failure"))Require(r.Failed&&!r.Closed);if(name=="partial-create-failure"){r.Finish(Environment.TickCount64+50,true);r.Exit();Require(n.Events.Contains("release-thread")&&n.Events.Contains("release-process")&&n.Events.Contains("release-job"));}
  Require(ProductionNative.ConstructionCount==0&&ProductionNative.EntryCount==0);
  return JsonSerializer.Serialize(new{caseName=name,passed=true,productionConstructors=ProductionNative.ConstructionCount,productionEntries=ProductionNative.EntryCount,events=n.Events});
 }
}
public static class Wire {
 static readonly object outputLock=new object();static Stream output;static int sequence;static JobRunner runner;static readonly Dictionary<string,int> logs=new Dictionary<string,int>();
 static readonly DrainSettlement transportFailures=new DrainSettlement();
 public static void TransportFailed(NativeFailure failure=null){transportFailures.Record(failure??new NativeFailure("protocol"));if(runner!=null)runner.Cancel();}
 public static void ThrowIfTransportFailed(){transportFailures.ThrowIfFailed();}
 public static void Log(string slot,string stream,string text){lock(outputLock){string key=stream;int total=logs.ContainsKey(key)?logs[key]:0;int bytes=Encoding.UTF8.GetByteCount(text);if(bytes>16384||total+bytes>8388608){TransportFailed();return;}logs[key]=total+bytes;Send("00000000000000000000000000000000","log",new{slot=slot=="fixture"?(object)slot:int.Parse(slot),stream,text});}}
 static void Send(string id,string type,object payload){lock(outputLock){if(++sequence>4096)throw new NativeFailure("protocol");byte[] body=JsonSerializer.SerializeToUtf8Bytes(new{v=1,seq=sequence,id,type,payload});if(body.Length>65536)throw new NativeFailure("protocol");byte[] header=BitConverter.GetBytes(System.Net.IPAddress.HostToNetworkOrder(body.Length));var task=output.WriteAsync(header,0,4).ContinueWith(t=>{t.GetAwaiter().GetResult();return output.WriteAsync(body,0,body.Length);}).Unwrap();if(!task.Wait(5000))throw new NativeFailure("protocol");task.GetAwaiter().GetResult();output.Flush();}}
 static void Exact(JsonElement value,params string[] keys){if(value.ValueKind!=JsonValueKind.Object||!value.EnumerateObject().Select(x=>x.Name).OrderBy(x=>x).SequenceEqual(keys.OrderBy(x=>x)))throw new NativeFailure("protocol");}
 static void Unique(JsonElement value){if(value.ValueKind==JsonValueKind.Object){var names=new HashSet<string>();foreach(var p in value.EnumerateObject()){if(!names.Add(p.Name))throw new NativeFailure("protocol");Unique(p.Value);}}else if(value.ValueKind==JsonValueKind.Array)foreach(var item in value.EnumerateArray())Unique(item);}
 static async Task<byte[]> Read(Stream input,int size,bool header){byte[] data=new byte[size];int offset=0;long end=Environment.TickCount64+(header?21900000:5000);while(offset<size){int left=(int)(end-Environment.TickCount64);if(left<=0)throw new NativeFailure("protocol");var pending=input.ReadAsync(data,offset,size-offset);if(await Task.WhenAny(pending,Task.Delay(left))!=pending)throw new NativeFailure("protocol");int n=await pending;if(n==0){if(header&&offset==0)return null;throw new NativeFailure("protocol");}if(offset==0)end=Math.Min(end,Environment.TickCount64+5000);offset+=n;}return data;}
 static int Budget(JsonElement payload,int ceiling){int value=payload.GetProperty("remainingMs").GetInt32();if(value<1||value>ceiling)throw new NativeFailure("protocol");return value;}
 static bool Hex(string value,int count){return value!=null&&value.Length==count&&value.All(c=>c>='0'&&c<='9'||c>='a'&&c<='f');}
 static Dictionary<string,string> PrivateEnvironment(JsonElement configuredEnvironment,JsonElement payload,bool worker,int expectedEpochCount){
  int epoch=0;
  if(worker){
   JsonElement value=payload.GetProperty("epoch");
   if(value.ValueKind!=JsonValueKind.Number||!value.TryGetInt32(out epoch)||epoch<1||epoch>expectedEpochCount||value.GetRawText()!=epoch.ToString(System.Globalization.CultureInfo.InvariantCulture))throw new NativeFailure("protocol");
  }
  string pipe=payload.GetProperty("pipe").GetString(),token=payload.GetProperty("token").GetString();
  if(!Hex(token,64)||pipe==null||!pipe.StartsWith("\\\\.\\pipe\\explorers-public-parity-")||pipe.Length>256)throw new NativeFailure("protocol");
  var environment=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
  foreach(var item in configuredEnvironment.EnumerateObject()){
   if(String.Equals(item.Name,"PUBLIC_PARITY_POWERSHELL_EXECUTABLE",StringComparison.OrdinalIgnoreCase))throw new NativeFailure("protocol");
   string value=item.Value.GetString();
   if(item.Name.Length>128||value==null||value.Length>4096||item.Name.Contains("=")||item.Name.Any(c=>c<' ')||value.Contains('\0')||!environment.TryAdd(item.Name,value))throw new NativeFailure("protocol");
  }
  foreach(string key in new[]{"PUBLIC_PARITY_PRIVATE_PIPE","PUBLIC_PARITY_PRIVATE_TOKEN","PUBLIC_PARITY_PRIVATE_EPOCH"})if(environment.ContainsKey(key))throw new NativeFailure("protocol");
  environment.Add("PUBLIC_PARITY_PRIVATE_PIPE",pipe);environment.Add("PUBLIC_PARITY_PRIVATE_TOKEN",token);
  environment.Add("PUBLIC_PARITY_PRIVATE_EPOCH",epoch.ToString(System.Globalization.CultureInfo.InvariantCulture));
  return environment;
 }
 public static string EpochEnvironmentRegression(){
  string token=new string('a',64),pipe="\\\\.\\pipe\\explorers-public-parity-test";
  using(var empty=JsonDocument.Parse("{}")){
   Func<object,bool,Dictionary<string,string>> build=(epoch,worker)=>{
    object payload=worker?(object)new{epoch,pipe,token}:new{pipe,token};
    using(var document=JsonDocument.Parse(JsonSerializer.Serialize(payload)))return PrivateEnvironment(empty.RootElement,document.RootElement,worker,32);
   };
   string fixture=build(0,false)["PUBLIC_PARITY_PRIVATE_EPOCH"];
   string[] workers=Enumerable.Range(1,32).Select(epoch=>build(epoch,true)["PUBLIC_PARITY_PRIVATE_EPOCH"]).ToArray();
   int reservedOverridesRefused=0,invalidEpochsRefused=0;
   foreach(string key in new[]{"PUBLIC_PARITY_PRIVATE_PIPE","PUBLIC_PARITY_PRIVATE_TOKEN","public_parity_private_epoch"}){
    using(var configured=JsonDocument.Parse(JsonSerializer.Serialize(new Dictionary<string,string>{{key,"caller"}})))
    using(var payload=JsonDocument.Parse(JsonSerializer.Serialize(new{epoch=1,pipe,token})))
     try{PrivateEnvironment(configured.RootElement,payload.RootElement,true,32);}catch(NativeFailure){reservedOverridesRefused++;}
   }
   foreach(object epoch in new object[]{0,33,-1,"01",1.5})try{build(epoch,true);}catch(NativeFailure){invalidEpochsRefused++;}
   if(fixture!="0"||reservedOverridesRefused!=3||invalidEpochsRefused!=5)throw new Exception("epoch contract failed");
   string[] peopleWorkers=Enumerable.Range(1,12).Select(epoch=>{using(var payload=JsonDocument.Parse(JsonSerializer.Serialize(new{epoch,pipe,token})))return PrivateEnvironment(empty.RootElement,payload.RootElement,true,12)["PUBLIC_PARITY_PRIVATE_EPOCH"];}).ToArray();
   int invalidPeopleEpochsRefused=0;foreach(int epoch in new[]{13,16,44})using(var payload=JsonDocument.Parse(JsonSerializer.Serialize(new{epoch,pipe,token})))try{PrivateEnvironment(empty.RootElement,payload.RootElement,true,12);}catch(NativeFailure){invalidPeopleEpochsRefused++;}
   if(invalidPeopleEpochsRefused!=3)throw new Exception("people epoch contract failed");   return JsonSerializer.Serialize(new{fixture,workers,peopleWorkers,invalidPeopleEpochsRefused,reservedOverridesRefused,invalidEpochsRefused,productionConstructors=ProductionNative.ConstructionCount,productionEntries=ProductionNative.EntryCount});
  }
 } public static string ReplyTailRegression(){
  var slot=new OrdinarySlot();long owner=slot.Begin();bool overlapRefused=false;
  try{slot.Begin();}catch(NativeFailure){overlapRefused=true;}
  var tail=new TaskCompletionSource<bool>();bool exitAdmitted=false,successorAdmitted=false,tailPending=false;
  slot.Publish(owner,()=>{
   tailPending=!tail.Task.IsCompleted;
   slot.RequireIdle();exitAdmitted=true;
   long successor=slot.Begin();successorAdmitted=true;
   slot.Publish(successor,()=>{});
  });
  tail.SetResult(true);
  long cancelledOwner=slot.Begin();long priorityOwner=slot.Begin(true);bool priorityKeptOwnership=false;
  slot.Publish(cancelledOwner,()=>{try{slot.RequireIdle();}catch(NativeFailure){priorityKeptOwnership=true;}});
  slot.Publish(priorityOwner,()=>slot.RequireIdle());
  if(!priorityKeptOwnership)throw new Exception("priority owner lost");
  if(!overlapRefused||!exitAdmitted||!successorAdmitted||!tailPending)throw new Exception("dispatcher contract failed");
  return JsonSerializer.Serialize(new{passed=true,overlapRefused,exitAdmitted,successorAdmitted,tailPending,priorityKeptOwnership,productionConstructors=ProductionNative.ConstructionCount,productionEntries=ProductionNative.EntryCount});
 }
 public static string HandleCustodyRegression(){var native=new ScriptedNative();var runner=new JobRunner(native,32);runner.Launch(new Launch{Slot="1"},Environment.TickCount64+1000);var proof=runner.Retire(1,Environment.TickCount64+1000);bool retained;using(var json=JsonDocument.Parse(JsonSerializer.Serialize(proof)))retained=json.RootElement.GetProperty("handlesRetained").GetBoolean();bool before=native.Events.Any(value=>value=="release-process"||value=="release-thread");runner.Finish(Environment.TickCount64+1000,true);runner.Exit();bool after=native.Events.Contains("release-process")&&native.Events.Contains("release-thread")&&runner.Closed;return JsonSerializer.Serialize(new{retained,closedBeforeFinal=before,closedAfterFinal=after});}
public static string FamilyRegression(){
  string root=Path.GetFullPath(Path.Combine(Path.GetTempPath(),"public-parity-definition-test"));
  Func<string,string> configuration=suite=>JsonSerializer.Serialize(new{nodeExecutable=Path.Combine(root,"node.exe"),loaderPath=Path.Combine(root,"tunes","node_modules","tsx","dist","loader.mjs"),fixtureEntrypoint=Path.Combine(root,"tunes","scripts","public-parity-browser-fixture.ts"),workerEntrypoint=Path.Combine(root,"tunes","scripts","public-parity-resource-worker.ts"),cwd=root,environment=new Dictionary<string,string>(),receiptArguments=new[]{"--suite",suite,"--ack","TASK4_FIXTURE_OWNED_DISPOSABLE_PG15","--receipt-directory",Path.Combine(root,"receipts"),"--receipt-capability",new string('a',64)}});
  var counts=new List<int>();foreach(string suite in new[]{"public-parity","people"}){string json=configuration(suite);ValidateConfigure(json,root);using(var document=JsonDocument.Parse(json))counts.Add(ExpectedEpochCount(document.RootElement));}
  int refused=0;
  var invalid=new List<string>{configuration("guides"),configuration("public-parity,people"),configuration("unknown"),configuration("public-parity").Replace("\"environment\":{}","\"environment\":{},\"environment\":{}"),configuration("public-parity").Replace("\"environment\":{}","\"environment\":{\"PATH\":\"a\",\"path\":\"b\"}"),configuration("people").Replace("\"environment\":{}","\"environment\":{\"PUBLIC_PARITY_PRIVATE_EPOCH\":\"1\"}"),configuration("people").Replace("\"environment\":{}","\"environment\":{\"x\":\"a\",\"x\":\"b\"}")};
  foreach(string json in invalid)try{ValidateConfigure(json,root);throw new Exception("invalid configure admitted");}catch(NativeFailure){refused++;}
  if(!counts.SequenceEqual(new[]{32,12})||refused!=7||ProductionNative.ConstructionCount!=0||ProductionNative.EntryCount!=0)throw new Exception("family binding failed");
  return JsonSerializer.Serialize(new{counts,refused,productionConstructors=ProductionNative.ConstructionCount,productionEntries=ProductionNative.EntryCount});
 } public static int ExpectedEpochCount(JsonElement payload){string[] receipt=payload.GetProperty("receiptArguments").EnumerateArray().Select(x=>x.GetString()).ToArray();if(receipt.Length!=8||receipt[0]!="--suite"||receipt[2]!="--ack"||receipt[3]!="TASK4_FIXTURE_OWNED_DISPOSABLE_PG15"||receipt[4]!="--receipt-directory"||receipt[6]!="--receipt-capability"||!Hex(receipt[7],64)||receipt[5]==null||!Path.IsPathFullyQualified(receipt[5])||receipt[5].Length>4096||receipt[5].Any(c=>c<' '))throw new NativeFailure("protocol");if(receipt[1]=="public-parity")return 32;if(receipt[1]=="people")return 12;throw new NativeFailure("protocol");} public static void ValidateConfigure(string json,string root){using(var doc=JsonDocument.Parse(json)){Unique(doc.RootElement);ValidateConfigure(doc.RootElement,root);}}
 static void ValidateConfigure(JsonElement payload,string root){Exact(payload,"nodeExecutable","loaderPath","fixtureEntrypoint","workerEntrypoint","cwd","environment","receiptArguments");foreach(string key in new[]{"nodeExecutable","loaderPath","fixtureEntrypoint","workerEntrypoint","cwd"}){string path=payload.GetProperty(key).GetString();if(path==null||path.Length>4096||!Path.IsPathFullyQualified(path)||path.Any(c=>c<' '))throw new NativeFailure("protocol");}
    if(payload.GetProperty("cwd").GetString()!=root||payload.GetProperty("fixtureEntrypoint").GetString()!=Path.Combine(root,"tunes","scripts","public-parity-browser-fixture.ts")||payload.GetProperty("workerEntrypoint").GetString()!=Path.Combine(root,"tunes","scripts","public-parity-resource-worker.ts")||payload.GetProperty("loaderPath").GetString()!=Path.Combine(root,"tunes","node_modules","tsx","dist","loader.mjs"))throw new NativeFailure("protocol");
    if(payload.GetProperty("environment").EnumerateObject().Count()>64||payload.GetProperty("receiptArguments").GetArrayLength()!=8)throw new NativeFailure("protocol");
    using(var bootstrap=JsonDocument.Parse(JsonSerializer.Serialize(new{pipe="\\\\.\\pipe\\explorers-public-parity-validation",token=new string('a',64)})))PrivateEnvironment(payload.GetProperty("environment"),bootstrap.RootElement,false,ExpectedEpochCount(payload));
    string[] receipt=payload.GetProperty("receiptArguments").EnumerateArray().Select(x=>x.GetString()).ToArray();
    if(receipt[0]!="--suite"||(receipt[1]!="public-parity"&&receipt[1]!="people")||receipt[2]!="--ack"||receipt[3]!="TASK4_FIXTURE_OWNED_DISPOSABLE_PG15"||receipt[4]!="--receipt-directory"||receipt[6]!="--receipt-capability"||!Hex(receipt[7],64)||receipt[5]==null||!Path.IsPathFullyQualified(receipt[5])||receipt[5].Length>4096||receipt[5].Any(c=>c<' '))throw new NativeFailure("protocol");
}
 public static async Task<int> Run(string root){
  output=Console.OpenStandardOutput();Stream input=Console.OpenStandardInput();runner=null;JsonElement configure=default(JsonElement);bool configured=false;int incoming=0;Task ordinary=null;var serial=new SemaphoreSlim(1);var operationSlot=new OrdinarySlot();bool exiting=false;
  try{while(!exiting){byte[] header=await Read(input,4,true);if(header==null)throw new NativeFailure("protocol");int size=System.Net.IPAddress.NetworkToHostOrder(BitConverter.ToInt32(header,0));if(size<1||size>65536)throw new NativeFailure("protocol");byte[] bytes=await Read(input,size,false);string decoded=new UTF8Encoding(false,true).GetString(bytes);using(var doc=JsonDocument.Parse(decoded)){var msg=doc.RootElement.Clone();Unique(msg);Exact(msg,"v","seq","id","type","payload");if(msg.GetProperty("v").GetInt32()!=1||msg.GetProperty("seq").GetInt32()!=++incoming||incoming>4096)throw new NativeFailure("protocol");string id=msg.GetProperty("id").GetString(),type=msg.GetProperty("type").GetString();if(!Hex(id,32))throw new NativeFailure("protocol");JsonElement payload=msg.GetProperty("payload");
   if(type=="abort-job"){
    if(!configured||runner==null)throw new NativeFailure("protocol");
    Exact(payload,"remainingMs");int budget=Budget(payload,15000);long abortDeadline=Environment.TickCount64+budget;
    runner.Cancel();Task previous=ordinary;long abortOwner=operationSlot.Begin(true);
    ordinary=Task.Run(async()=>{
     if(previous!=null)try{await previous;}catch{runner.Cancel();}
     await serial.WaitAsync();string replyType;object replyPayload;
     try{replyPayload=runner.Finish(abortDeadline,true);replyType="job-empty";}
     catch(NativeFailure e){replyType="failed";replyPayload=new{stage=e.Stage,nativeCode=e.Code};}
     catch{replyType="failed";replyPayload=new{stage="protocol",nativeCode=0};}
     finally{serial.Release();}
     operationSlot.Publish(abortOwner,()=>Send(id,replyType,replyPayload));
    });continue;
   }
   operationSlot.RequireIdle();if(runner!=null&&runner.Cancelled&&type!="exit")throw new NativeFailure("protocol");
   if(type=="configure"){if(configured)throw new NativeFailure("protocol");ValidateConfigure(payload,root);
    int expectedEpochCount=ExpectedEpochCount(payload);runner=new JobRunner(new ProductionNative(),expectedEpochCount);configure=payload;configured=true;Send(id,"configured",new{});continue;}
   if(!configured)throw new NativeFailure("protocol");
   if(type=="exit"){Exact(payload,"remainingMs");int exitBudget=Budget(payload,5000);runner.Exit(Environment.TickCount64+exitBudget);Send(id,"exit-ack",new{handlesClosed=true});exiting=true;continue;}
   if(type!="launch-fixture"&&type!="launch-worker"&&type!="terminate-worker"&&type!="finish-job")throw new NativeFailure("protocol");
   long commandOwner=operationSlot.Begin();ordinary=Task.Run(async()=>{await serial.WaitAsync();string replyType=null;object replyPayload=null;try{
    if(type=="launch-fixture"||type=="launch-worker"){bool worker=type=="launch-worker";Exact(payload,worker?new[]{"epoch","pipe","token"}:new[]{"pipe","token"});string slot=worker?payload.GetProperty("epoch").GetInt32().ToString():"fixture";if(worker&&(int.Parse(slot)<1||int.Parse(slot)>ExpectedEpochCount(configure)))throw new NativeFailure("protocol");string pipe=payload.GetProperty("pipe").GetString(),token=payload.GetProperty("token").GetString();if(!Hex(token,64)||pipe==null||!pipe.StartsWith("\\\\.\\pipe\\explorers-public-parity-")||pipe.Length>256)throw new NativeFailure("protocol");var env=PrivateEnvironment(configure.GetProperty("environment"),payload,worker,ExpectedEpochCount(configure));var args=new List<string>{"--import",new Uri(configure.GetProperty("loaderPath").GetString()).AbsoluteUri,configure.GetProperty(worker?"workerEntrypoint":"fixtureEntrypoint").GetString()};if(!worker)args.AddRange(configure.GetProperty("receiptArguments").EnumerateArray().Select(x=>x.GetString()));runner.Launch(new Launch{Executable=configure.GetProperty("nodeExecutable").GetString(),Arguments=args.ToArray(),Cwd=root,Environment=env,Slot=slot},Environment.TickCount64+10000);replyType="launched";replyPayload=new{slot=worker?(object)int.Parse(slot):slot};}
    if(type=="terminate-worker"){Exact(payload,"epoch","remainingMs");int epoch=payload.GetProperty("epoch").GetInt32();replyPayload=runner.Retire(epoch,Environment.TickCount64+Budget(payload,10000));replyType="terminated";}
    if(type=="finish-job"){Exact(payload,"remainingMs");replyPayload=runner.Finish(Environment.TickCount64+Budget(payload,15000),false);replyType="job-empty";}
   }catch(OperationCanceledException){replyType="cancelled";replyPayload=new{commandId=id};}
   catch(NativeFailure e){runner.Cancel();replyType="failed";replyPayload=new{stage=e.Stage,nativeCode=e.Code};}
   catch{runner.Cancel();replyType="failed";replyPayload=new{stage="protocol",nativeCode=0};}
   finally{serial.Release();}
   operationSlot.Publish(commandOwner,()=>{
    if(runner.Cancelled&&replyType!="failed"){replyType="cancelled";replyPayload=new{commandId=id};}
    Send(id,replyType,replyPayload);
   });
  });
  }}return 0;}catch{if(runner!=null)runner.Cancel();return 1;}
 }
}
}
"@
if ($DefinitionsOnly) { return }
if (-not $IsWindows) { throw 'Public parity requires qualified Windows containment' }
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$code = [PublicParityJob.Wire]::Run($repository).GetAwaiter().GetResult()
exit $code







