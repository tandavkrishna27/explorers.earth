import {EventEmitter} from 'node:events';
import {describe,it,expect} from 'vitest';
import {createCanonicalSessionNodeHandler} from '../../auth/canonicalSessionNodeHandler';

const deferred=()=>{let resolve!:(value?:any)=>void;const promise=new Promise<any>(r=>resolve=r);return {promise,resolve};};
function pair(){
 const req=Object.assign(new EventEmitter(),{method:'GET',originalUrl:'/api/auth/get-session',headers:{cookie:'test-cookie'},aborted:false});
 const chunks:Buffer[]=[];
 const res=Object.assign(new EventEmitter(),{destroyed:false,headersSent:false,statusCode:0,headers:new Map<string,unknown>(),
  setHeader(name:string,value:unknown){this.headers.set(name,value);},
  write(chunk:Uint8Array):boolean{chunks.push(Buffer.from(chunk));return true;},
  end(){queueMicrotask(()=>res.emit('finish'));},destroy(){this.destroyed=true;res.emit('close');}});
 return {req,res,chunks};
}
describe('owned canonical session transport',()=>{
 it('retains cancellation of a late auth body after disconnect before reader acquisition',async()=>{
  const p=pair(),auth=deferred(),cancel=deferred();let cancelled=false,complete=false;
  const stream=new ReadableStream<Uint8Array>({cancel(){cancelled=true;return cancel.promise;}});
  const run=createCanonicalSessionNodeHandler({handler:()=>auth.promise},'http://127.0.0.1:54001')(p.req as any,p.res as any,()=>{});
  void Promise.resolve(run).then(()=>complete=true,()=>complete=true);
  p.res.destroy();auth.resolve(new Response(stream));await new Promise(r=>setImmediate(r));
  expect(cancelled).toBe(true);expect(complete).toBe(false);expect(p.req.listenerCount('aborted')).toBe(1);
  cancel.resolve();await expect(run).rejects.toThrow('Canonical session transport failed');
  expect(p.req.listenerCount('aborted')).toBe(0);expect(p.res.listenerCount('close')).toBe(0);
 });
 it('retains body cancellation when forwarding an actual header throws',async()=>{
  const p=pair(),cancel=deferred();let cancelled=false,complete=false;
  p.res.setHeader=()=>{throw Error('private-header-secret');};
  const stream=new ReadableStream<Uint8Array>({cancel(){cancelled=true;return cancel.promise;}});
  const run=createCanonicalSessionNodeHandler({handler:async()=>new Response(stream,{headers:{'content-type':'application/json'}})},'http://127.0.0.1:54001')(p.req as any,p.res as any,()=>{});
  void Promise.resolve(run).then(()=>complete=true,()=>complete=true);await new Promise(r=>setImmediate(r));
  expect(cancelled).toBe(true);expect(complete).toBe(false);cancel.resolve();
  await expect(run).rejects.toThrow(/^Canonical session transport failed$/);
  expect(p.res.listenerCount('error')).toBe(0);expect(p.res.listenerCount('finish')).toBe(0);
 });
 it('awaits original body reads after auth returns its Response',async()=>{
  const p=pair(),held=deferred();let complete=false;
  const stream=new ReadableStream<Uint8Array>({async start(c){await held.promise;c.enqueue(new TextEncoder().encode('actual'));c.close();}});
  const run=createCanonicalSessionNodeHandler({handler:async()=>new Response(stream)},'http://127.0.0.1:54001')(p.req as any,p.res as any,()=>{});
  void Promise.resolve(run).then(()=>complete=true);await Promise.resolve();expect(complete).toBe(false);
  held.resolve();await run;expect(Buffer.concat(p.chunks).toString()).toBe('actual');expect(complete).toBe(true);
 });
 it('awaits backpressure and final response finish',async()=>{
  const p=pair();let complete=false;p.res.write=function(chunk){p.chunks.push(Buffer.from(chunk));return false;};p.res.end=()=>{};
  const run=createCanonicalSessionNodeHandler({handler:async()=>new Response('bytes')},'http://127.0.0.1:54001')(p.req as any,p.res as any,()=>{});
  void Promise.resolve(run).then(()=>complete=true);await new Promise(r=>setImmediate(r));expect(complete).toBe(false);
  p.res.emit('drain');await new Promise(r=>setImmediate(r));expect(complete).toBe(false);
  p.res.emit('finish');await run;expect(complete).toBe(true);
 });
 it('retains original cancellation after disconnect',async()=>{
  const p=pair(),cancel=deferred();let cancelled=false,complete=false;
  const stream=new ReadableStream<Uint8Array>({cancel(){cancelled=true;return cancel.promise;}});
  const run=createCanonicalSessionNodeHandler({handler:async()=>new Response(stream)},'http://127.0.0.1:54001')(p.req as any,p.res as any,()=>{});
  void Promise.resolve(run).then(()=>complete=true,()=>complete=true);await new Promise(r=>setImmediate(r));p.res.destroy();
  await new Promise(r=>setImmediate(r));expect(cancelled).toBe(true);expect(complete).toBe(false);
  cancel.resolve();await expect(run).rejects.toThrow('Canonical session transport failed');expect(complete).toBe(true);
 });
 it('forwards actual headers, status and request to the canonical handler',async()=>{
  const p=pair();let actual:globalThis.Request|undefined;
  const run=createCanonicalSessionNodeHandler({handler:async request=>{actual=request;return new Response('ok',{status:401,headers:{'set-cookie':'session=actual; HttpOnly','content-type':'application/json'}});}},'http://127.0.0.1:54001')(p.req as any,p.res as any,()=>{});
  await run;expect(actual?.url).toBe('http://127.0.0.1:54001/api/auth/get-session');expect(actual?.headers.get('cookie')).toBe('test-cookie');expect(p.res.statusCode).toBe(401);expect(p.res.headers.get('set-cookie')).toEqual(['session=actual; HttpOnly']);
 });
 it.each([['POST','/api/auth/get-session'],['GET','/api/auth/sign-in/social'],['GET','//foreign/get-session'],['GET','/api/auth/get-session?refresh=true']])('refuses unsupported transport %s %s before auth',async(method,path)=>{
  const p=pair();p.req.method=method;p.req.originalUrl=path;let calls=0;
  const run=createCanonicalSessionNodeHandler({handler:async()=>{calls++;return new Response('never');}},'http://127.0.0.1:54001')(p.req as any,p.res as any,()=>{});
  await expect(run).rejects.toThrow('Canonical session transport failed');expect(calls).toBe(0);
 });
});
