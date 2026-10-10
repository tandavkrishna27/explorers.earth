param([switch]$DefinitionsOnly)
$ErrorActionPreference = 'Stop'
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
namespace GuidesJob {
public sealed class NativeFailure : Exception { public readonly string Stage; public readonly uint Code; public Child OwnedChild; public NativeFailure(string stage, uint code=0):base(stage){Stage=stage;Code=code;} }
public sealed class Child { public IntPtr Process, Thread; public string Slot; public bool Retired; }
public sealed class Launch { public string Executable, Cwd; public string[] Arguments; public Dictionary<string,string> Environment; public string Slot; }
public interface IJobNative {
 IntPtr Job(); Child Create(Launch launch); void Assign(IntPtr job, Child child); void Resume(Child child);
 bool Wait(Child child, uint ms); uint ExitCode(Child child); void Terminate(Child child, uint code);
 void TerminateJob(IntPtr job,uint code); uint Active(IntPtr job); void Release(IntPtr handle,string kind); void WaitLogs(long deadline);
}
public sealed class JobRunner {
 readonly IJobNative native; readonly IntPtr job; readonly List<Child> retained = new List<Child>();
 public volatile bool Cancelled; public bool Failed {get;private set;} public bool Empty {get;private set;} public bool Closed {get;private set;}
 bool admission=true; public JobRunner(IJobNative native){this.native=native;job=native.Job();}
 public void Cancel(){Cancelled=true;Failed=true;admission=false;}
 void Check(){if(Cancelled)throw new OperationCanceledException();}
 void WaitPositive(Child child,long deadline,bool cancellable){while(true){if(cancellable)Check();long left=deadline-Environment.TickCount64;if(left<=0)throw new NativeFailure("wait");if(native.Wait(child,(uint)Math.Min(100,left)))return;}}
 public Child Launch(Launch launch,long deadline){
  Check();if(!admission||retained.Any(c=>c.Slot==launch.Slot))throw new NativeFailure("protocol");
  Child child=null;try{child=native.Create(launch);retained.Add(child);Check();native.Assign(job,child);Check();native.Resume(child);Check();return child;}
  catch(Exception error){Failed=true;admission=false;if(child==null&&error is NativeFailure)child=((NativeFailure)error).OwnedChild;if(child!=null&&!retained.Contains(child))retained.Add(child);if(child!=null){native.Terminate(child,0xE0470001);WaitPositive(child,deadline,false);}throw;}
 }
 public void Retire(int epoch,long deadline){Check();Child c=retained.SingleOrDefault(x=>x.Slot==epoch.ToString());if(c==null||c.Retired)throw new NativeFailure("protocol");if(native.Wait(c,0))throw new NativeFailure("wait");native.Terminate(c,0xE0470001);WaitPositive(c,deadline,true);Check();c.Retired=true;}
 public object Finish(long deadline,bool abort){
  admission=false;if(abort)Cancel();
  Child fixture=retained.SingleOrDefault(c=>c.Slot=="fixture");
  if(!abort){try{if(fixture==null||retained.Count(c=>c.Slot!="fixture"&&c.Retired)!=16)throw new NativeFailure("protocol");WaitPositive(fixture,Math.Min(deadline,Environment.TickCount64+5000),true);if(native.ExitCode(fixture)!=0)throw new NativeFailure("wait");}catch{Cancel();throw;}}
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
 public readonly List<string> Events=new List<string>(); public string Fail;public bool Stuck,Exited;public uint FixtureCode,ActiveCount;public Action OnCreate;
 void Call(string stage){Events.Add(stage);if(Fail==stage)throw new NativeFailure(stage);}
 public IntPtr Job(){Call("job");return (IntPtr)1;} public Child Create(Launch launch){Call("create");Exited=false;if(OnCreate!=null)OnCreate();return new Child{Process=(IntPtr)2,Thread=(IntPtr)3,Slot=launch.Slot};}
 public void WaitLogs(long deadline){Call("drains");drainSettlement.ThrowIfFailed();} public void Assign(IntPtr job,Child child){Call("assign");}public void Resume(Child child){Call("resume");}
 public bool Wait(Child child,uint ms){Call("wait");if(Stuck&&ms>0)Thread.Sleep((int)Math.Min(ms,10));return !Stuck&&(ms!=0||Exited);}
 public uint ExitCode(Child child){Call("exit-code");return FixtureCode;}public void Terminate(Child child,uint code){Call("terminate");Exited=true;}
 public void TerminateJob(IntPtr job,uint code){Call("terminate-job");Exited=true;}public uint Active(IntPtr job){Call("query");return ActiveCount;}
 public void Release(IntPtr handle,string kind){Call("release-"+kind);}
}
public static class ContractCases {
 static void Require(bool value){if(!value)throw new Exception("contract failed");}
 public static string Run(string name){
  string[] allowed={"assign-before-resume","create-failure","assign-failure","resume-failure","process-wait-timeout","job-query-failure","nonzero-active","abort-stuck-fixture","abort-pending-command","finish-nonzero-fixture","exit-handshake","handle-release-failure"};
  if(!allowed.Contains(name))throw new ArgumentException("case refused");var n=new ScriptedNative();var r=new JobRunner(n);var launch=new Launch{Slot="fixture"};bool threw=false;
  try{
   if(name=="create-failure")n.Fail="create";if(name=="assign-failure")n.Fail="assign";if(name=="resume-failure")n.Fail="resume";
   if(name=="abort-pending-command")n.OnCreate=()=>r.Cancel();
   r.Launch(launch,Environment.TickCount64+50);
   if(name=="process-wait-timeout")n.Stuck=true;
   if(name=="job-query-failure")n.Fail="query";if(name=="nonzero-active")n.ActiveCount=1;
   if(name=="finish-nonzero-fixture"){for(int i=1;i<=16;i++){r.Launch(new Launch{Slot=i.ToString()},Environment.TickCount64+50);r.Retire(i,Environment.TickCount64+50);}n.FixtureCode=7;r.Finish(Environment.TickCount64+50,false);}
   if(name=="abort-stuck-fixture")n.Stuck=false;
   r.Finish(Environment.TickCount64+50,true);
   if(name=="handle-release-failure")n.Fail="release-thread";
   if(name=="exit-handshake"||name=="handle-release-failure")r.Exit();
  }catch(NativeFailure){threw=true;}catch(OperationCanceledException){threw=true;}
  bool expectedFailure=new[]{"create-failure","assign-failure","resume-failure","process-wait-timeout","job-query-failure","nonzero-active","abort-pending-command","finish-nonzero-fixture","handle-release-failure"}.Contains(name);Require(threw==expectedFailure);
  if(name=="assign-before-resume")Require(n.Events.Take(4).SequenceEqual(new[]{"job","create","assign","resume"}));
  if(name=="assign-failure"||name=="resume-failure")Require(n.Events.Contains("terminate")&&n.Events.Last()=="wait");
  if(name=="abort-pending-command")Require(!n.Events.Contains("assign")&&!n.Events.Contains("resume")&&n.Events.Contains("terminate"));
  if(name=="abort-stuck-fixture")Require(n.Events.IndexOf("terminate-job")<n.Events.IndexOf("wait"));
  if(name=="finish-nonzero-fixture"){Require(r.Failed&&!r.Empty);r.Finish(Environment.TickCount64+50,true);Require(r.Failed&&r.Empty);}
  if(name=="exit-handshake")Require(r.Empty&&r.Closed);
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
 public static string ReplyTailRegression(){
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
 public static async Task<int> Run(string root){
  output=Console.OpenStandardOutput();Stream input=Console.OpenStandardInput();runner=new JobRunner(new ProductionNative());JsonElement configure=default(JsonElement);bool configured=false;int incoming=0;Task ordinary=null;var serial=new SemaphoreSlim(1);var operationSlot=new OrdinarySlot();bool exiting=false;
  try{while(!exiting){byte[] header=await Read(input,4,true);if(header==null)throw new NativeFailure("protocol");int size=System.Net.IPAddress.NetworkToHostOrder(BitConverter.ToInt32(header,0));if(size<1||size>65536)throw new NativeFailure("protocol");byte[] bytes=await Read(input,size,false);string decoded=new UTF8Encoding(false,true).GetString(bytes);using(var doc=JsonDocument.Parse(decoded)){var msg=doc.RootElement.Clone();Unique(msg);Exact(msg,"v","seq","id","type","payload");if(msg.GetProperty("v").GetInt32()!=1||msg.GetProperty("seq").GetInt32()!=++incoming||incoming>4096)throw new NativeFailure("protocol");string id=msg.GetProperty("id").GetString(),type=msg.GetProperty("type").GetString();if(!Hex(id,32))throw new NativeFailure("protocol");JsonElement payload=msg.GetProperty("payload");
   if(type=="abort-job"){
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
   operationSlot.RequireIdle();if(runner.Cancelled&&type!="exit")throw new NativeFailure("protocol");
   if(type=="configure"){if(configured)throw new NativeFailure("protocol");Exact(payload,"nodeExecutable","loaderPath","fixtureEntrypoint","workerEntrypoint","cwd","environment","receiptArguments");foreach(string key in new[]{"nodeExecutable","loaderPath","fixtureEntrypoint","workerEntrypoint","cwd"}){string path=payload.GetProperty(key).GetString();if(path==null||path.Length>4096||!Path.IsPathFullyQualified(path)||path.Any(c=>c<' '))throw new NativeFailure("protocol");}
    if(payload.GetProperty("cwd").GetString()!=root||payload.GetProperty("fixtureEntrypoint").GetString()!=Path.Combine(root,"tunes","scripts","profile-browser-fixture.ts")||payload.GetProperty("workerEntrypoint").GetString()!=Path.Combine(root,"tunes","scripts","guides-resource-worker.ts")||payload.GetProperty("loaderPath").GetString()!=Path.Combine(root,"tunes","node_modules","tsx","dist","loader.mjs"))throw new NativeFailure("protocol");
    if(payload.GetProperty("environment").EnumerateObject().Count()>64||payload.GetProperty("receiptArguments").GetArrayLength()!=6)throw new NativeFailure("protocol");
    string[] receipt=payload.GetProperty("receiptArguments").EnumerateArray().Select(x=>x.GetString()).ToArray();
    if(receipt[0]!="--ack"||receipt[1]!="TASK4_FIXTURE_OWNED_DISPOSABLE_PG15"||receipt[2]!="--receipt-directory"||receipt[4]!="--receipt-capability"||!Hex(receipt[5],64)||receipt[3]==null||!Path.IsPathFullyQualified(receipt[3])||receipt[3].Length>4096||receipt[3].Any(c=>c<' '))throw new NativeFailure("protocol");
    configure=payload;configured=true;Send(id,"configured",new{});continue;}
   if(!configured)throw new NativeFailure("protocol");
   if(type=="exit"){Exact(payload,"remainingMs");int exitBudget=Budget(payload,5000);runner.Exit(Environment.TickCount64+exitBudget);Send(id,"exit-ack",new{handlesClosed=true});exiting=true;continue;}
   if(type!="launch-fixture"&&type!="launch-worker"&&type!="terminate-worker"&&type!="finish-job")throw new NativeFailure("protocol");
   long commandOwner=operationSlot.Begin();ordinary=Task.Run(async()=>{await serial.WaitAsync();string replyType=null;object replyPayload=null;try{
    if(type=="launch-fixture"||type=="launch-worker"){bool worker=type=="launch-worker";Exact(payload,worker?new[]{"epoch","pipe","token"}:new[]{"pipe","token"});string slot=worker?payload.GetProperty("epoch").GetInt32().ToString():"fixture";if(worker&&(int.Parse(slot)<1||int.Parse(slot)>16))throw new NativeFailure("protocol");string pipe=payload.GetProperty("pipe").GetString(),token=payload.GetProperty("token").GetString();if(!Hex(token,64)||pipe==null||!pipe.StartsWith("\\\\.\\pipe\\explorers-guides-")||pipe.Length>256)throw new NativeFailure("protocol");var env=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);foreach(var item in configure.GetProperty("environment").EnumerateObject()){string value=item.Value.GetString();if(item.Name.Length>128||value==null||value.Length>4096||item.Name.Contains("=")||item.Name.Any(c=>c<' ')||value.Contains('\0')||!env.TryAdd(item.Name,value))throw new NativeFailure("protocol");}env.Add("GUIDES_PRIVATE_PIPE",pipe);env.Add("GUIDES_PRIVATE_TOKEN",token);var args=new List<string>{"--import",configure.GetProperty("loaderPath").GetString(),configure.GetProperty(worker?"workerEntrypoint":"fixtureEntrypoint").GetString()};if(!worker)args.AddRange(configure.GetProperty("receiptArguments").EnumerateArray().Select(x=>x.GetString()));runner.Launch(new Launch{Executable=configure.GetProperty("nodeExecutable").GetString(),Arguments=args.ToArray(),Cwd=root,Environment=env,Slot=slot},Environment.TickCount64+10000);replyType="launched";replyPayload=new{slot=worker?(object)int.Parse(slot):slot};}
    if(type=="terminate-worker"){Exact(payload,"epoch","remainingMs");int epoch=payload.GetProperty("epoch").GetInt32();runner.Retire(epoch,Environment.TickCount64+Budget(payload,10000));replyType="terminated";replyPayload=new{epoch,processSignaled=true};}
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
  }}return 0;}catch{runner.Cancel();return 1;}
 }
}
}
"@
if ($DefinitionsOnly) { return }
if (-not $IsWindows) { throw 'Guides requires qualified Windows containment' }
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$code = [GuidesJob.Wire]::Run($repository).GetAwaiter().GetResult()
exit $code


