import {describe,it,expect} from 'vitest';
import {createWriterGuardTransport} from '../helpers/placesWriterGuardTransport';
const nonce='a'.repeat(32);
const env={PLACE_PINS_GUARD_ENTERED_PATH:'/owned/writer-entered.json',PLACE_PINS_GUARD_READY_PATH:'/owned/writer-ready.json',PLACE_PINS_GUARD_FAILURE_PATH:'/owned/writer-failure.json',PLACE_PINS_GUARD_NONCE:nonce};
describe('fixture writer guard transport with injected adapters',()=>{
 it('returns the monotonic ready write origin for the consumer bootstrap deadline',()=>{
  let time=10;const guard=createWriterGuardTransport({env,caseIds:['registered'],now:()=>time,writeExclusive:()=>{time+=20;}});
  expect(guard.bootstrap()).toBe(30);expect(guard.admitted()).toBe(true);
 });
 it('closes admission before emitting a finite first failure and never reopens',()=>{
  const writes:Array<{path:string,value:string}>=[];let guard:ReturnType<typeof createWriterGuardTransport>;
  guard=createWriterGuardTransport({env,caseIds:['registered'],now:()=>0,writeExclusive:(path,value)=>{if(path.endsWith('failure.json'))expect(guard.admitted()).toBe(false);writes.push({path,value});}});
  guard.bootstrap();expect(guard.admitted()).toBe(true);guard.admit('registered');guard.failStop({caseId:'registered',reason:'settlement',phase:'settle',unsettledCount:1});guard.failStop({caseId:'registered',reason:'guard',phase:'teardown',unsettledCount:0});
  expect(writes.map(w=>JSON.parse(w.value).kind)).toEqual(['entered','ready','failure']);expect(()=>guard.admit('registered')).toThrow();
 });
 it('missing or invalid environment and a failed write admit no fixture work',()=>{
  for(const candidate of [{},{...env,PLACE_PINS_GUARD_READY_PATH:'/other/writer-ready.json'},{...env,PLACE_PINS_GUARD_NONCE:'wrong'}]){
   const guard=createWriterGuardTransport({env:candidate,caseIds:['registered'],now:()=>0,writeExclusive:()=>{}});expect(()=>guard.bootstrap()).toThrow();expect(guard.admitted()).toBe(false);
  }
  const guard=createWriterGuardTransport({env,caseIds:['registered'],now:()=>0,writeExclusive:()=>{throw Error();}});expect(()=>guard.bootstrap()).toThrow();expect(guard.admitted()).toBe(false);
 });
 it('collection remains inert and bootstrap has a local 1000ms budget',()=>{
  let writes=0,time=0;const collection=createWriterGuardTransport({env:{},caseIds:[],collection:true,now:()=>0,writeExclusive:()=>{writes++;}});collection.bootstrap();expect(writes).toBe(0);expect(collection.admitted()).toBe(false);
  const guard=createWriterGuardTransport({env,caseIds:['registered'],now:()=>time,writeExclusive:()=>{time+=1000;}});expect(()=>guard.bootstrap()).toThrow();expect(guard.admitted()).toBe(false);
 });
 it('unknown failure identity or injected extra authority closes the gate without outputting it',()=>{
  const writes:string[]=[];const guard=createWriterGuardTransport({env,caseIds:['registered'],now:()=>0,writeExclusive:(_p,v)=>writes.push(v)});guard.bootstrap();expect(()=>guard.failStop({caseId:'unknown',reason:'guard',phase:'teardown',unsettledCount:0})).toThrow();expect(guard.admitted()).toBe(false);expect(writes.length).toBe(2);
 });
});
it('optional bootstrap metadata is exact finite data and cannot widen ordinary frames',()=>{
 const valid={caseId:'suite-bootstrap',reason:'guard' as const,phase:'preflight' as const,unsettledCount:0,setupStage:'direct-verifier' as const,category:'database' as const,sqlState:'42501'};
 const invalid=[{...valid,setupStage:'private'},{...valid,category:'private'},{...valid,sqlState:'private'},{...valid,category:'assertion'},{...valid,message:'private'},{...valid,caseId:'registered'},{...valid,setupStage:undefined},{...valid,category:undefined},{...valid,sqlState:undefined}];
 for(const event of invalid){const writes:string[]=[];const guard=createWriterGuardTransport({env,caseIds:['registered','suite-bootstrap'],now:()=>0,writeExclusive:(_p,b)=>writes.push(b)});guard.bootstrap();expect(()=>guard.failStop(event as any)).toThrow();expect(guard.admitted()).toBe(false);expect(writes).toHaveLength(2);}
 const writes:string[]=[];const guard=createWriterGuardTransport({env,caseIds:['suite-bootstrap'],now:()=>0,writeExclusive:(_p,b)=>writes.push(b)});guard.bootstrap();guard.failStop(valid);guard.failStop({...valid,setupStage:'settle'});expect(writes).toHaveLength(3);expect(Buffer.byteLength(writes[2])).toBeLessThanOrEqual(512);expect(JSON.parse(writes[2])).toMatchObject(valid);
});
