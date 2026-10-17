import {types as utilTypes} from 'node:util';
import {z} from 'zod/v3';
export type AppSchedulerClock=Readonly<{now:()=>number;setTimeout:(callback:()=>void,ms:number)=>unknown;clearTimeout:(handle:unknown)=>void}>;
const nativeClock:AppSchedulerClock={now:Date.now,setTimeout:(callback,ms)=>setTimeout(callback,ms),clearTimeout:handle=>clearTimeout(handle as ReturnType<typeof setTimeout>)};
export type AppLocalSchedule=Readonly<{utcHour:number;utcMinute:number}>;
/** One owned daily timer and one active invocation. Clock injection is trusted tests only. */
export function createAppLocalScheduler<T>(input:AppLocalSchedule,run:(signal:AbortSignal)=>Promise<T>,clock:AppSchedulerClock=nativeClock){
 let policy:AppLocalSchedule;
 try{if(!input||utilTypes.isProxy(input)||Object.getPrototypeOf(input)!==Object.prototype)throw Error();for(const d of Object.values(Object.getOwnPropertyDescriptors(input)))if(!d.enumerable||!Object.hasOwn(d,'value'))throw Error();if(Object.getOwnPropertySymbols(input).length)throw Error();policy=Object.freeze(z.object({utcHour:z.number().int().min(0).max(23),utcMinute:z.number().int().min(0).max(59)}).strict().parse(input));if(typeof run!=='function')throw Error();}catch{throw new Error('Invalid App local schedule');}
 let state:'running'|'stopped'|'stopping'|'failed'='stopped',timer:unknown,nextDueAt:string|undefined,epoch=0,controller:AbortController|undefined,active:Promise<T>|undefined,stopPromise:Promise<void>|undefined;
 const waiters=new Set<{resolve:(value:T)=>void;reject:(error:Error)=>void}>();
 const instant=()=>{const now=clock.now();if(!Number.isSafeInteger(now)||now<0||!Number.isFinite(new Date(now).getTime()))throw Error();return now;};
 const clear=()=>{if(timer!==undefined)clock.clearTimeout(timer);timer=undefined;nextDueAt=undefined;};
 const settleWaiters=(error?:Error,value?:T)=>{for(const waiter of waiters){if(error)waiter.reject(error);else waiter.resolve(value as T);}waiters.clear();};
 const fail=()=>{state='failed';epoch++;clear();controller?.abort();settleWaiters(new Error('App scheduled invocation failed'));};
 const arm=()=>{if(state!=='running')return;const now=instant(),due=new Date(now);due.setUTCHours(policy.utcHour,policy.utcMinute,0,0);if(due.getTime()<=now)due.setUTCDate(due.getUTCDate()+1);nextDueAt=due.toISOString();const captured=epoch;timer=clock.setTimeout(()=>{timer=undefined;nextDueAt=undefined;if(state!=='running'||captured!==epoch)return;if(active){arm();return;}void invoke(true).catch(()=>{});},due.getTime()-now);};
 const invoke=(scheduled:boolean):Promise<T>=>{
  if(state!=='running')return Promise.reject(new Error(state==='failed'?'App scheduler failed':'App scheduler stopped'));if(active)return Promise.reject(new Error('App scheduler busy'));
  controller=new AbortController();const owned=controller;
  const pending=(async()=>{try{const result=await Promise.resolve().then(()=>run(owned.signal));if(scheduled)settleWaiters(undefined,result);return result;}catch{fail();throw new Error('App scheduled invocation failed');}finally{if(controller===owned)controller=undefined;active=undefined;if(state==='running'){try{clear();arm();}catch{fail();}}}})();active=pending;return pending;
 };
 return Object.freeze({
  start(){if(state==='failed')throw new Error('App scheduler failed');if(state==='stopping')throw new Error('App scheduler stopping');if(state==='running')return;state='running';epoch++;try{arm();}catch{fail();throw new Error('App scheduler failed');}},
  trigger:()=>invoke(false),
  waitForScheduledInvocation():Promise<T>{if(state!=='running')return Promise.reject(new Error(state==='failed'?'App scheduler failed':'App scheduler stopped'));return new Promise((resolve,reject)=>waiters.add({resolve,reject}));},
  stop():Promise<void>{if(stopPromise)return stopPromise;const wasFailed=state==='failed';if(!wasFailed)state='stopping';epoch++;clear();controller?.abort();settleWaiters(new Error(wasFailed?'App scheduler failed':'App scheduler stopped'));const pending=active;stopPromise=(async()=>{if(pending){try{await pending;}catch{/* Preserve failed lifecycle below. */}}if(state==='failed')throw new Error('App scheduler failed');state='stopped';})().finally(()=>{stopPromise=undefined;});return stopPromise;},
  inspect:()=>Object.freeze({state,active:Boolean(active),failed:state==='failed',nativeClock:clock===nativeClock,...(nextDueAt?{nextDueAt}:{})}),
 });
}
