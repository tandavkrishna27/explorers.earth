import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {it,expect} from 'vitest';
import {createWriterSuiteController} from '../helpers/placesWriterRaceController';
import {ExplorersPlacePinsRepository} from '../../repositories/explorersPlacePinsRepository';

// Execute the integration fixture's exact helper without collecting its DB suite.
const source=readFileSync(new URL('../explorers-place-pins.integration.test.ts',import.meta.url),'utf8');
const parsed=ts.createSourceFile('fixture.ts',source,ts.ScriptTarget.Latest,true);
let helper:ts.FunctionDeclaration|undefined;
function find(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='cOutcome')helper=node;ts.forEachChild(node,find);}
find(parsed);
if(!helper)throw Error('Fixture outcome helper unavailable');
const javascript=ts.transpileModule(helper.getText(parsed),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const outcomeFor=(controller:ReturnType<typeof createWriterSuiteController>):((operation:()=>Promise<any>)=>Promise<any>)=>new Function('controller',`${javascript};return cOutcome;`)(controller);
const policy={policyId:'inert',policyVersion:1,transportChunkBytes:4096,transportChunkIds:32,replacementBytes:8192,replacementIds:64,ownerDraftQuota:2,ownerStagingBytes:100000,draftExpiryMs:60000,stagingRetentionMs:120000,receiptRetentionMs:180000,commitProcessingBytes:200000,commitProcessingMs:10000,commitWorkUnits:10000,cleanupBatchSize:10,cleanupWorkUnits:100};
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function harness(){
 let time=0,next=0;const timers=new Map<number,{fn:()=>void;at:number}>(),events:any[]=[],queries:string[]=[];let releases=0;
 const clock={now:()=>time,setTimeout:(fn:()=>void,ms:number)=>{const id=++next;timers.set(id,{fn,at:time+ms});return id;},clearTimeout:(id:number)=>{timers.delete(id);}};
 const controller=createWriterSuiteController({identity:{database:'inert',runtimeLogin:'inert_login'},admission:()=>{},guardFailure:e=>events.push(e),clock});controller.admit('inert-case');
 const repo=new ExplorersPlacePinsRepository({connect:async()=>({query:async(sql:string)=>{queries.push(sql);if(sql==='SELECT clock_timestamp() AS command_clock')return {rows:[{command_clock:new Date()}]};if(sql==='SELECT status FROM creator_accounts WHERE id=$1 FOR UPDATE')return {rows:[{status:'pending_deletion'}]};return {rows:[]};},release:()=>{releases++;}})} as any);
 const denial=()=>repo.execute('inert-account',{operation:'commitPlacePinsDraft',collectionId:'inert-list',draftId:'inert-draft',body:{totalCount:2,sequenceHash:'0'.repeat(64)}},{requestId:'inert',idempotencyKey:'inert-key'},100,policy);
 return {controller,outcome:outcomeFor(controller),denial,events,queries,releases:()=>releases,advance:async(ms:number)=>{time+=ms;for(const [id,t]of[...timers])if(t.at<=time){timers.delete(id);t.fn();}await flush();}};
}
it('expected repository 404 keeps the held purge blocked until explicit gate opening',async()=>{
 const h=harness(),gate=h.controller.gate();gate.arrive();await gate.acquired;let purgeAdvanced=false;
 const purge=h.controller.runOwned(async()=>{await gate.wait();purgeAdvanced=true;});
 try{expect(await h.outcome(h.denial)).toMatchObject({ok:false,error:{status:404,message:'Account unavailable'}});await flush();expect(purgeAdvanced).toBe(false);expect(h.controller.status().admissionClosed).toBe(false);expect(h.queries.at(-1)).toBe('ROLLBACK');expect(h.releases()).toBe(1);}finally{gate.open();await purge;}
 expect(purgeAdvanced).toBe(true);expect(h.events).toEqual([]);
});
it('denial-first returns the actual repository 404 with admission open',async()=>{
 const h=harness();expect(await h.outcome(h.denial)).toMatchObject({ok:false,error:{status:404,message:'Account unavailable'}});expect(h.controller.status().admissionClosed).toBe(false);expect(h.releases()).toBe(1);expect(h.events).toEqual([]);
});
it('controller five-second failure still rejects the outer outcome and releases held gates',async()=>{
 const h=harness(),gate=h.controller.gate();gate.arrive();await gate.acquired;let opened=false;gate.wait().then(()=>{opened=true;});
 const result=h.outcome(()=>new Promise(()=>{}));await h.advance(4999);expect(opened).toBe(false);expect(h.controller.status().admissionClosed).toBe(false);await h.advance(1);
 expect(await result).toMatchObject({ok:false,error:{message:'Fixture controller deadline'}});expect(opened).toBe(true);expect(h.controller.status().admissionClosed).toBe(true);expect(h.events).toMatchObject([{reason:'settlement',phase:'settle'}]);
});
it('capturing an operation failure cannot reopen an underlying identity failure',async()=>{
 const h=harness();expect((await h.outcome(async()=>{h.controller.fail('identity','preflight');throw Error('inert identity failure');})).ok).toBe(false);
 expect(h.controller.status().admissionClosed).toBe(true);expect(()=>h.controller.admit('another')).toThrow();expect(h.events).toMatchObject([{reason:'identity',phase:'preflight'}]);
});
