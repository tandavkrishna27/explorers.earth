import type {GuardFailure,GuardPhase,GuardReason} from './placesWriterGuardTransport';

type QueryResult={rows:any[];command?:string};
type Client={processID?:number;query:(...args:any[])=>Promise<QueryResult>;release:(destroy?:boolean)=>void};
type Pool={connect:()=>Promise<Client>;end:()=>Promise<void>;totalCount:number;idleCount:number;waitingCount:number};
type Clock={now:()=>number;setTimeout:(fn:()=>void,ms:number)=>any;clearTimeout:(timer:any)=>void};
type Kind='admin'|'runtime'|'direct';
type Task={original:Promise<any>;settled:boolean;failed:boolean;caseId:string;lease?:Lease;supervisor:boolean};
type Binding={pid:number;backend_start:string;database:string;login:string;backend_type:string};
type Operation={text:string;values:readonly unknown[];task:Task};
type Lease={raw:Client;kind:Kind;caseId:string;verified:boolean;released:boolean;unsafe:boolean;transaction:boolean;binding?:Binding;current?:Operation;wrapper:Client};
type NativeAdmission={caseId:string;lease:Lease;task?:Task;deadline:number;entered:boolean;finished:boolean;arm:(deadline:number)=>void;close:()=>void};
type Options={identity:{database:string;runtimeLogin:string};guardFailure:(event:GuardFailure)=>void;admission:(caseId:string)=>void;clock?:Clock};
export const writerSuiteFrames=['suite-bootstrap','suite-teardown'] as const;
// The installed beforeAll listener supplies the collected suite as its second argument.
// No names come from a file, environment path, or duplicated case inventory.
export function collectedWriterCaseIds(suite:{tasks?:readonly any[]}):string[]{
 const ids:string[]=[];
 function visit(tasks:readonly any[]){for(const task of tasks){if(task.type==='test'){if(typeof task.name!=='string'||!task.name.length)throw Error('Fixture identity');ids.push(task.name);}else if(task.type==='suite')visit(task.tasks??[]);else throw Error('Fixture identity');}}
 visit(suite.tasks??[]);if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>(writerSuiteFrames as readonly string[]).includes(id)))throw Error('Fixture identity');return ids;
}

const identitySql='SELECT pg_backend_pid() pid,current_database() database,current_user effective,session_user login';
const authoritySql=`SELECT pg_backend_pid() pid,current_database() database,current_user effective,session_user login,
 a.backend_start::text,a.backend_type,
 (SELECT rolsuper FROM pg_roles WHERE rolname='music_migrator') admin_super,
 (SELECT rolsuper FROM pg_roles WHERE rolname=$1) runtime_super,
 has_function_privilege(current_user,'pg_cancel_backend(integer)','EXECUTE') cancel_execute,
 has_function_privilege(current_user,'pg_terminate_backend(integer)','EXECUTE') terminate_execute
 FROM pg_stat_activity a WHERE a.pid=pg_backend_pid()`;
const activitySql=`SELECT pid,backend_start::text,datname database,usename login,backend_type,state,wait_event_type,query,pg_blocking_pids(pid) blockers FROM pg_stat_activity WHERE pid=$1`;
const expired=()=>Error('Fixture controller deadline');
const textOf=(args:any[])=>typeof args[0]==='string'?args[0]:args[0]?.text;
const valuesOf=(args:any[])=>typeof args[0]==='string'?(args[1]??[]):(args[0]?.values??[]);
const queryTimeout=(error:unknown)=>{const e=error as {message?:unknown;code?:unknown};return e?.message==='Query read timeout'||e?.code==='ETIMEDOUT';};

// All resources are injected. Import/collection allocates no Pool, timer, SQL, or channel.
export function createWriterSuiteController(options:Options){
 const clock=options.clock??{now:()=>performance.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:timer=>clearTimeout(timer)};
 const tasks=new Set<Task>(),leases=new Set<Lease>(),pools=new Set<Pool>(),gates=new Set<ReturnType<typeof makeGate>>();
 const rawPools=new WeakMap<object,Pool>();
 let caseId:string='suite-bootstrap',closed=false,serverUnresolved=false,scopeDeadline=Infinity,nativeDeadline=Infinity,aborting:Promise<void>|undefined;
 let observer:Client|undefined;
 let nativeAdmission:NativeAdmission|undefined;
 function error(){return Error('Fixture writer controller');}
 function pending(){return [...tasks].filter(task=>!task.settled);}
 function openGates(){for(const gate of gates)gate.open();}
 function fail(reason:GuardReason,phase:GuardPhase){
  if(closed)return;closed=true;if([...leases].some(lease=>lease.current&&!lease.current.task.settled))serverUnresolved=true;for(const value of gates)value.fail();nativeAdmission?.close();
  // Latch precedes delivery; the sink may fail or block without reopening admission.
  try{options.guardFailure({caseId,reason,phase,unsettledCount:Math.min(16,pending().length)});}catch{/* Root supervision remains responsible for delivery failure. */}
 }
 function admit(id:string){if(closed)throw error();if(nativeAdmission){fail('lease','acquire');throw error();}try{options.admission(id);}catch{caseId=id;fail('transport','preflight');throw error();}caseId=id;aborting=undefined;nativeDeadline=Infinity;}
 function check(){if(closed)throw error();options.admission(caseId);}
 function own<T>(operation:()=>Promise<T>,lease?:Lease,supervisor=false):Task{
  let original:Promise<T>;try{original=Promise.resolve(operation());}catch{original=Promise.reject(error());}
  const task:Task={original,settled:false,failed:false,caseId,lease,supervisor};tasks.add(task);
  // Handlers attach in the same turn as the original, before any controller wait.
  original.then(()=>{task.settled=true;},()=>{task.settled=true;task.failed=true;});return task;
 }
 async function bound<T>(task:Task,ms:number,onExpiry:()=>void,absolute=scopeDeadline):Promise<T>{
  const remaining=Math.max(0,Math.min(ms,absolute-clock.now()));let timer:any;
  if(remaining<=0){onExpiry();throw expired();}
  try{return await Promise.race([task.original,new Promise<never>((_,reject)=>{timer=clock.setTimeout(()=>{onExpiry();reject(expired());},remaining);})]);}finally{clock.clearTimeout(timer);}
 }
 function releaseRequest(lease:Lease,destroyRequested:boolean){
  const task=own(async()=>lease.raw.release(destroyRequested),lease);
  task.original.catch(()=>{serverUnresolved=true;fail('lease','teardown');});
 }
 function destroy(lease:Lease){if(lease.released)return;lease.released=true;releaseRequest(lease,true);}
 function unsafe(lease:Lease,phase:GuardPhase){lease.unsafe=true;serverUnresolved=true;fail('admin-timeout',phase);destroy(lease);}
 function exactIdentity(raw:Client,row:any,kind:Kind){return Number.isInteger(raw.processID)&&raw.processID!>0&&row?.pid===raw.processID&&row.database===options.identity.database&&row.login===(kind==='admin'?'music_migrator':options.identity.runtimeLogin)&&row.effective===(kind==='admin'?'music_migrator':kind==='direct'?options.identity.runtimeLogin:'music_runtime');}
 function binding(row:any):Binding{if(!Number.isInteger(row?.pid)||row.pid<=0||typeof row.backend_start!=='string'||!row.backend_start||row.backend_type!=='client backend'||row.database!==options.identity.database||typeof row.login!=='string')throw error();return {pid:row.pid,backend_start:row.backend_start,database:row.database,login:row.login,backend_type:row.backend_type};}
 function sameBinding(a:Binding|undefined,b:any){return !!a&&a.pid===b?.pid&&a.backend_start===b.backend_start&&a.database===b.database&&a.login===b.login&&a.backend_type===b.backend_type;}
 async function forward(lease:Lease,args:any[],cleanup=false,phase:GuardPhase='preflight',boundIdentity=false):Promise<QueryResult>{
  if(!cleanup)check();if(lease.released||lease.unsafe||lease.current&&!lease.current.task.settled){fail('lease',phase);throw error();}
  const text=textOf(args),values=valuesOf(args);if(typeof text!=='string'||!Array.isArray(values)||args.some(arg=>typeof arg==='function')){fail('binding',phase);throw error();}
  let forwarded=args;
  const budget=Math.max(0,Math.min(2000,scopeDeadline-clock.now()));
  if(lease.kind==='admin'||lease.kind==='direct'){
   if(!budget){unsafe(lease,phase);throw expired();}
   const config=typeof args[0]==='string'?{text,values}: {...args[0]};
   config.query_timeout=Math.max(1,Math.min(budget,typeof config.query_timeout==='number'?config.query_timeout:budget));forwarded=[config];
  }
  if(lease.kind==='runtime'&&nativeDeadline!==Infinity&&text==='BEGIN'&&clock.now()>=nativeDeadline){fail('settlement','settle');throw expired();}
  // Only the explicitly admitted native lease can transition its original's wait.
  // Origin is immediately before forwarding this actual BEGIN, after acquisition.
  if(text==='BEGIN'&&nativeAdmission?.lease===lease&&!nativeAdmission.entered&&!nativeAdmission.finished)nativePhase(nativeAdmission);
  const task=own(()=>lease.raw.query(...forwarded),lease),operation:Operation={text,values:[...values],task};lease.current=operation;
  try{
   const result=lease.kind==='runtime'&&caseId!=='suite-bootstrap'&&!boundIdentity?await task.original:await bound<QueryResult>(task,2000,()=>{
    if(lease.kind!=='runtime'){unsafe(lease,phase);return;}
    if(boundIdentity){lease.unsafe=true;serverUnresolved=true;fail('identity',phase);destroy(lease);}else fail('settlement',phase);
   });
   // pg simple-protocol batches return the original array of command results.
   // The final server COMMIT tag, rather than a regex over SQL text, proves the
   // unchanged Places deadline/constraint batch left its transaction safely.
   const last=Array.isArray(result)?result.at(-1):result;
   if(text==='BEGIN'||last?.command==='BEGIN')lease.transaction=true;
   if(text==='COMMIT'||text==='ROLLBACK'||last?.command==='COMMIT'||last?.command==='ROLLBACK')lease.transaction=false;return result;
  }catch(e){if(queryTimeout(e)){if(lease.kind==='runtime'){lease.unsafe=true;serverUnresolved=true;fail('settlement',phase);destroy(lease);}else unsafe(lease,phase);}throw e;}
  finally{if(task.settled&&lease.current===operation)lease.current=undefined;}
 }
 async function verify(lease:Lease,cleanup=false){
  const result=await forward(lease,lease.kind==='admin'?[authoritySql,[options.identity.runtimeLogin]]:[identitySql],cleanup,'preflight',lease.kind==='runtime');
  const row=result.rows[0];if(result.rows.length!==1||!exactIdentity(lease.raw,row,lease.kind)){fail('identity','preflight');destroy(lease);throw error();}
  if(lease.kind==='admin'){
   if(row.admin_super!==true||row.runtime_super!==false||row.cancel_execute!==true||row.terminate_execute!==true){fail('authority','preflight');destroy(lease);throw error();}
   lease.binding=binding(row);
  }
  lease.verified=true;
 }
 function release(lease:Lease,destroyRequested=false){
  if(lease.released)throw error();
  if(destroyRequested){destroy(lease);return;}
  if(lease.unsafe||lease.transaction||lease.current&&!lease.current.task.settled){fail('lease','settle');destroy(lease);throw error();}
  lease.released=true;releaseRequest(lease,false);
 }
 function makeLease(raw:Client,kind:Kind):Lease{
  const lease:Lease={raw,kind,caseId,verified:false,released:false,unsafe:false,transaction:false,wrapper:undefined!};
  lease.wrapper={processID:raw.processID,query:(...args)=>forward(lease,args),release:destroyRequested=>release(lease,destroyRequested)};leases.add(lease);return lease;
 }
 async function acquire(pool:Pool,kind:Kind){
  pool=rawPools.get(pool)??pool;
  check();let expiredAcquisition=false;
  const task=own(()=>pool.connect());
  task.original.then(raw=>{if(expiredAcquisition||closed){const lease=makeLease(raw,kind);destroy(lease);}},()=>{});
  let raw:Client;try{raw=await bound<Client>(task,2000,()=>{expiredAcquisition=true;fail('acquisition','acquire');});}catch{fail('acquisition','acquire');throw error();}
  if(closed){throw error();}const lease=makeLease(raw,kind);
  try{await verify(lease);return lease.wrapper;}catch(e){destroy(lease);throw e;}
 }
 function wrapPool<T extends Pool>(pool:T,kind:Kind):T{
  pools.add(pool);
  const wrapper=new Proxy(pool,{get(target,key){
   if(key==='connect')return ()=>acquire(target,kind);
   if(key==='query')return async(...args:any[])=>{const client=await acquire(target,kind);try{return await client.query(...args);}finally{const lease=find(client);if(!lease.released)release(lease);}};
   if(key==='end')return ()=>endPool(target);
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});rawPools.set(wrapper,pool);return wrapper;
 }
 function find(client:Client){const lease=[...leases].find(value=>value.wrapper===client);if(!lease)throw error();return lease;}
 function makeGate(){
  let opened=false,acquired=false,open!:()=>void,arrive!:()=>void,reject!:()=>void;
  const waiting=new Promise<void>(resolve=>{open=()=>{opened=true;resolve();};}),signal=new Promise<void>((resolve,no)=>{arrive=()=>{acquired=true;resolve();};reject=()=>no(error());});
  signal.then(()=>{},()=>{});waiting.then(()=>{},()=>{});
  return {acquired:signal,arrive,open,wait:()=>waiting,fail:()=>{if(!acquired)reject();open();},get opened(){return opened;}};
 }
 function gate(){check();const value=makeGate();gates.add(value);const acquired=bound<void>(own(()=>value.acquired),2000,()=>{value.fail();fail('gate','gate');});acquired.then(()=>{},()=>{});return {...value,acquired};}
 function runOwned<T>(operation:()=>Promise<T>){check();const task=own(operation);task.original.catch(()=>{for(const value of gates)value.fail();});return bound<T>(task,5000,()=>fail('settlement','settle'));}
 function runOwnedNative<T>(client:Client,operation:()=>Promise<T>):Promise<T>{
  check();const lease=find(client);
  if(nativeAdmission||lease.kind!=='runtime'||lease.caseId!==caseId||!lease.verified||lease.released||lease.unsafe||lease.transaction||lease.current&&!lease.current.task.settled){fail('lease','acquire');throw error();}
  let timer:any,resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;
  const waiting=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});waiting.then(()=>{},()=>{});
  const admission:NativeAdmission={caseId,lease,deadline:clock.now()+5000,entered:false,finished:false,
   close:()=>{if(admission.finished)return;admission.finished=true;clock.clearTimeout(timer);reject(error());},
   arm:deadline=>{clock.clearTimeout(timer);admission.deadline=Math.min(deadline,scopeDeadline);const remaining=Math.max(0,admission.deadline-clock.now());
    const expire=()=>{admission.close();fail('settlement','settle');};if(remaining<=0){expire();return;}timer=clock.setTimeout(expire,remaining);
   }};
  nativeAdmission=admission;admission.arm(clock.now()+5000);
  if(closed)return waiting;
  const task=own(operation);admission.task=task;
  const finish=(success:boolean,value:unknown)=>{
   if(admission.finished)return;
   if(clock.now()>=admission.deadline){admission.close();fail('settlement','settle');return;}
   if(!admission.entered){admission.close();fail('binding','preflight');return;}
   admission.finished=true;clock.clearTimeout(timer);if(success)resolve(value as T);else reject(value);
  };
  task.original.then(value=>finish(true,value),failure=>{for(const value of gates)value.fail();finish(false,failure);});
  return waiting;
 }
 async function reservePair(id:string,admin:Pool,runtime:Pool){
  admit(id);if(runtime.totalCount-runtime.idleCount!==0||runtime.waitingCount!==0){fail('lease','acquire');throw error();}
  observer=await acquire(admin,'admin');const first=await acquire(runtime,'runtime'),second=await acquire(runtime,'runtime');
  if(first.processID===second.processID){fail('binding','preflight');throw error();}
  for(const client of [first,second]){const result=await forward(find(observer),[activitySql,[client.processID]],false,'preflight');const row=result.rows[0];if(result.rows.length!==1||row?.pid!==client.processID||row.login!==options.identity.runtimeLogin){fail('binding','preflight');throw error();}find(client).binding=binding(row);}
  let index=0;
  const wrappedPool={connect:async()=>{check();if(index>=2){fail('lease','acquire');throw error();}return [first,second][index++];}};
  return {first,second,pool:wrappedPool,observer};
 }
 async function freshTarget(client:Client,expected?:{text:string;values:readonly unknown[]},cleanup=false){
  const target=find(client),operation=target.current;
  if(target.kind!=='runtime'){fail('authority','cancel');throw error();}
  if(target.released||!operation||operation.task.settled)return undefined;
  if(!observer||find(observer).unsafe){fail('authority','cancel');throw error();}
  // Reattest the safe observer on each individual signal; never queue behind unsafe work.
  const observerLease=find(observer);const prior=observerLease.binding;await verify(observerLease,cleanup);if(!sameBinding(prior,observerLease.binding)){fail('binding','cancel');throw error();}
  const result=await forward(observerLease,[activitySql,[client.processID]],cleanup,'cancel'),row=result.rows[0];
  if(target.released||operation.task.settled)return undefined;
  if(!row&&result.rows.length===0){fail('binding','cancel');throw error();}
  if(result.rows.length!==1||!sameBinding(target.binding,row)||row.state!=='active'||row.query!==operation.text||target.current!==operation||operation.task.settled||expected&&(expected.text!==operation.text||expected.values.length!==operation.values.length||expected.values.some((value,index)=>value!==operation.values[index]))){fail('binding','cancel');throw error();}
  return {target,operation,row};
 }
 // Readiness polling is observation only. It never supplies signal authority:
 // freshTarget above still requires the active exact query for every signal.
 async function observationTarget(client:Client,expected:{text:string;values:readonly unknown[]},operation:Operation|undefined){
  check();const target=find(client);
  const stillOwned=()=>!closed&&target.kind==='runtime'&&target.caseId===caseId&&target.verified&&!target.released&&!target.unsafe&&!!operation&&target.current===operation&&!operation.task.settled&&target.binding?.pid===client.processID&&target.raw.processID===client.processID&&expected.text===operation.text&&expected.values.length===operation.values.length&&expected.values.every((value,index)=>value===operation.values[index]);
  if(!stillOwned()){fail('binding','observe');throw error();}
  if(!observer||find(observer).released||find(observer).unsafe){fail('authority','observe');throw error();}
  const observerLease=find(observer),prior=observerLease.binding;await verify(observerLease);
  if(!sameBinding(prior,observerLease.binding)||!stillOwned()){fail('binding','observe');throw error();}
  const result=await forward(observerLease,[activitySql,[client.processID]],false,'observe'),row=result.rows[0];
  if(!stillOwned()||result.rows.length!==1||!sameBinding(target.binding,row)||typeof row.query!=='string'||!['active','idle','idle in transaction','idle in transaction (aborted)'].includes(row.state)||!Array.isArray(row.blockers)||row.blockers.some((pid:unknown)=>!Number.isInteger(pid)||(pid as number)<=0)){fail('binding','observe');throw error();}
  return row;
 }
 async function observeBlocker(client:Client,winner:Client,expected:{text:string;values:readonly unknown[]}){
  check();const operation=find(client).current,prior=scopeDeadline,deadline=Math.min(scopeDeadline,clock.now()+2000);scopeDeadline=deadline;
  try{for(;;){if(clock.now()>=deadline){fail('blocker','observe');throw error();}const row=await observationTarget(client,expected,operation);
   if(row.blockers.some((pid:number)=>pid!==winner.processID)||clock.now()>=deadline){fail('blocker','observe');throw error();}
   if(row.state==='active'&&row.query===operation!.text&&row.wait_event_type==='Lock'&&row.blockers.length===1&&row.blockers[0]===winner.processID)return;
   const yieldTask=own(()=>new Promise<void>(resolve=>clock.setTimeout(resolve,0)));await bound(yieldTask,Math.max(1,deadline-clock.now()),()=>fail('blocker','observe'),deadline);
  }}finally{scopeDeadline=prior;}
 }
 async function signal(client:Client,terminate=false,cleanup=false){
  const prior=scopeDeadline;scopeDeadline=Math.min(prior,clock.now()+2000);
  try{const target=await freshTarget(client,undefined,cleanup);if(!target)return true;
  const phase:GuardPhase=terminate?'terminate':'cancel';
  const result=await forward(find(observer!),[`SELECT pg_${terminate?'terminate':'cancel'}_backend($1) accepted`,[client.processID]],cleanup,phase);
  if(result.rows.length!==1||typeof result.rows[0]?.accepted!=='boolean'){fail(terminate?'terminate-failed':'cancel-failed',phase);throw error();}
  if(!result.rows[0].accepted){await freshTarget(client,undefined,cleanup);fail(terminate?'terminate-failed':'cancel-failed',phase);throw error();}
  return true; // Only signal acceptance. Settlement is established by retained originals below.
  }finally{scopeDeadline=prior;}
 }
 // Optional guard-directed cleanup only: handoff must already have latched, and
 // an existing safe observer must still be owned. Never reacquire behind a hang.
 async function terminateAfterHandoff(client:Client){
  if(!closed||!observer||find(observer).released||find(observer).unsafe)throw error();
  await signal(client,true,true);
  const deadline=clock.now()+2000;
  const finalCleanup=own(async()=>{await originals(Math.max(0,deadline-clock.now()));await rollbackLeases();await originals(Math.max(0,deadline-clock.now()));},undefined,true);
  try{await bound(finalCleanup,2000,()=>{serverUnresolved=true;},deadline);}catch{serverUnresolved=true;throw error();}finally{for(const lease of leases)if(!lease.released)destroy(lease);}
 }
 async function originals(ms:number){
  const selected=pending().filter(task=>task.caseId===caseId&&!task.supervisor);if(!selected.length)return;
  const joined=own(()=>Promise.allSettled(selected.map(task=>task.original)),undefined,true);
  await bound(joined,ms,()=>{},Infinity);
 }
 async function rollbackLeases(){
  for(const lease of leases){if(lease.released||lease.unsafe||lease.current&&!lease.current.task.settled)continue;
   if(lease.transaction)await bound(own(()=>forward(lease,['ROLLBACK'],true,'settle'),lease),2000,()=>lease.kind==='runtime'?fail('settlement','settle'):unsafe(lease,'settle'),Infinity);
   release(lease);
  }
 }
 async function settleCase(){
  openGates();if(closed)throw error();
  try{const budget=nativeDeadline===Infinity?5000:Math.max(0,nativeDeadline-clock.now());await originals(budget);await rollbackLeases();await originals(2000);
   if(closed||serverUnresolved||[...leases].some(lease=>!lease.released)||[...pools].some(pool=>pool.waitingCount!==0||pool.totalCount-pool.idleCount!==0)){fail('lease','settle');throw error();}
   gates.clear();for(const task of tasks)if(task.settled)tasks.delete(task);for(const lease of leases)if(lease.released&&!lease.unsafe)leases.delete(lease);nativeDeadline=Infinity;nativeAdmission=undefined;
  }catch{await abortCase();throw error();}
 }
 async function abortCase(){
  if(aborting)return aborting;openGates();
  aborting=(async()=>{
   if(closed){for(const lease of leases)if(!lease.released)destroy(lease);return;}
   try{
    for(const lease of leases)if(lease.kind==='runtime'&&!lease.released&&lease.current&&!lease.current.task.settled)await signal(lease.wrapper);
    try{await originals(2000);}catch{fail('settlement','settle');}
    if(closed){for(const lease of leases)if(!lease.released)destroy(lease);return;}
    await rollbackLeases();await originals(2000);
   }catch{fail('settlement','settle');for(const lease of leases)if(!lease.released)destroy(lease);}
   // An aborted case is never acceptance, even when originals eventually resolve.
   fail('settlement','settle');
  })();return aborting;
 }
 const ending=new Map<Pool,Promise<void>>();
 function endPool(pool:Pool){const previous=ending.get(pool);if(previous)return previous;
  const task=own(()=>pool.end());const result=bound<void>(task,5000,()=>{serverUnresolved=true;fail('settlement','teardown');},Infinity).catch(()=>{fail('settlement','teardown');throw error();});ending.set(pool,result);return result;
 }
 async function shutdown(){caseId='suite-teardown';openGates();if(closed){for(const lease of leases)if(!lease.released)destroy(lease);}else if([...leases].some(lease=>!lease.released)){fail('lease','teardown');for(const lease of leases)if(!lease.released)destroy(lease);}
  const results=await Promise.allSettled([...pools].map(pool=>endPool(pool)));if(results.some(result=>result.status==='rejected')||closed)throw error();
 }
 async function bootstrap<T>(operation:()=>Promise<T>,readyAt=clock.now()){
  admit('suite-bootstrap');if(!Number.isFinite(readyAt)||readyAt>clock.now()){fail('transport','preflight');throw error();}scopeDeadline=readyAt+20000;
  try{if(scopeDeadline<=clock.now()){fail('settlement','preflight');throw expired();}return await bound<T>(own(operation,undefined,true),20000,()=>fail('settlement','preflight'));}catch{fail('guard','preflight');throw error();}finally{scopeDeadline=Infinity;}
 }
 async function directPreflight<T>(operation:()=>Promise<T>){const prior=scopeDeadline;scopeDeadline=Math.min(prior,clock.now()+8000);try{return await bound<T>(own(operation,undefined,true),8000,()=>fail('settlement','preflight'));}finally{scopeDeadline=prior;}}
 function nativePhase(admission:NativeAdmission){check();if(nativeAdmission!==admission||admission.caseId!==caseId||admission.entered||admission.finished||admission.task?.settled)throw error();if(clock.now()>=admission.deadline){admission.close();fail('settlement','settle');throw expired();}admission.entered=true;nativeDeadline=clock.now()+12000;admission.arm(nativeDeadline);}
 return {admit,wrapPool,bootstrap,directPreflight,runOwned,runOwnedNative,gate,reservePair,observeBlocker,signal:(client:Client)=>signal(client),terminateAfterHandoff,settleCase,abortCase,shutdown,fail,status:()=>({admissionClosed:closed,unsettledCount:pending().length,serverUnresolved,leases:[...leases].filter(lease=>!lease.released).length,leaseRestored:!closed&&!serverUnresolved&&![...leases].some(lease=>!lease.released)&&!pending().length})};
}
