import {describe,it,expect,vi} from 'vitest';
import path from 'node:path';
import {tmpdir} from 'node:os';
const state=vi.hoisted(()=>({writes:0,decoded:[] as unknown[],report:{} as unknown,execution:false,diagnostics:0}));
vi.mock('node:fs',()=>({readFileSync:(file:string)=>JSON.stringify(file.endsWith('.protected-owned.json')?{version:1,lane:'apps',capability:'e'.repeat(64),provenance:{bound:true}}:{lanes:[{name:'apps',config:'fixed-apps-config'}]}),writeFileSync:()=>{state.writes++;},lstatSync:()=>({isSymbolicLink:()=>false}),realpathSync:(value:string)=>value,existsSync:()=>false}));
vi.mock('../../../../scripts/replatform-e2e.mjs',()=>({validateManifest:()=>true,snapshotSource:()=>({provenance:{bound:true}}),decodeProtectedReport:(report:unknown,_lane:unknown,_root:unknown,execution:boolean,policy:unknown)=>{if(!policy||execution!==state.execution||report!==state.report)throw Error('actual decoder argument refusal');state.decoded.push(report);return {results:['exact-discovery'],playwright:'locked-version'};},decodeProtectedFailureDiagnostics:(report:unknown)=>{expect(report).toBe(state.report);state.diagnostics++;return [];}}));
import {createProtectedReceipt} from '../../../scripts/protected-browser-receipt';
describe('Additive protected parsed discovery seam',()=>{
 it('passes bounded parsed report to existing decoder without filesystem read or synchronous child',async()=>{const receipt=await createProtectedReceipt(path.resolve(import.meta.dirname,'../../../..'),'apps',{args:[],directory:path.join(tmpdir(),'replatform-e2e-owned123','apps'),capability:'e'.repeat(64)});expect(receipt).toBeDefined();receipt!.arguments([],'C:\\owned-fixture');state.report={actual:'parsed report'};expect(typeof (receipt as any).decodeDiscovery).toBe('function');(receipt as any).decodeDiscovery(state.report);expect(state.decoded).toEqual([state.report]);expect(state.writes).toBe(1);});
});
it('delegates parsed execution to exact existing execution policy and diagnostics',async()=>{
 state.execution=true;state.decoded=[];state.diagnostics=0;state.report={actual:'bounded execution'};
 const receipt=await createProtectedReceipt(path.resolve(import.meta.dirname,'../../../..'),'apps',{args:[],directory:path.join(tmpdir(),'replatform-e2e-owned123','apps'),capability:'e'.repeat(64)});
 receipt!.arguments([],'C:\\owned-fixture');receipt!.decodeExecution(state.report,1,'SIGTERM');
 expect(state.decoded).toEqual([state.report]);expect(state.diagnostics).toBe(1);state.execution=false;
});
it('refuses parsed execution before fixed artifact policy allocation',async()=>{
 state.execution=true;state.decoded=[];const receipt=await createProtectedReceipt(path.resolve(import.meta.dirname,'../../../..'),'apps',{args:[],directory:path.join(tmpdir(),'replatform-e2e-owned123','apps'),capability:'e'.repeat(64)});
 expect(()=>receipt!.decodeExecution({},0,null)).toThrow();expect(state.decoded).toEqual([]);state.execution=false;
});