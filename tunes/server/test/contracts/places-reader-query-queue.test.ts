import {expect,it} from 'vitest';
import type {PoolClient} from 'pg';
import {createReaderQueryQueue} from '../helpers/placesReaderQueryQueue';
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
it('queues original requests in submission order and refuses unsettled release',async()=>{
 let release!:()=>void;const calls:string[]=[];
 const q=createReaderQueryQueue(async(text:string)=>{calls.push(text);if(text==='first')await new Promise<void>(r=>release=r);return {rows:[text]};});
 const first=q.query('first'),second=q.query('second');await flush();const observed=[...calls],pending=q.status().pending;let refused=false;try{q.assertSettled();}catch{refused=true;}release();expect(await first).toEqual({rows:['first']});expect(await second).toEqual({rows:['second']});expect(observed).toEqual(['first']);expect(pending).toBe(2);expect(refused).toBe(true);q.assertSettled();expect(calls).toEqual(['first','second']);
});
it('retains the exact original error and never forwards queued or later calls after failure',async()=>{
 const original=Error('inert original'),calls:string[]=[];
 const q=createReaderQueryQueue(async(text:string)=>{calls.push(text);throw original;});
 const first=q.query('first'),second=q.query('second');await expect(first).rejects.toBe(original);await expect(second).rejects.toBe(original);await expect(q.query('third')).rejects.toBe(original);expect(calls).toEqual(['first']);q.assertSettled();expect(q.status()).toEqual({pending:0,closed:true});
});
it('checks irreversible external admission before every forward, including queued requests',async()=>{
 let open=true,release!:()=>void;const calls:string[]=[];
 const q=createReaderQueryQueue(async(text:string)=>{calls.push(text);if(text==='first')await new Promise<void>(r=>release=r);return text;},()=>open);
 const first=q.query('first'),second=q.query('second');const outcome=second.then(value=>({value}),error=>({error}));await flush();open=false;release();expect(await first).toBe('first');expect(await outcome).toHaveProperty('error');open=true;await expect(q.query('third')).rejects.toThrow('admission');expect(calls).toEqual(['first']);q.assertSettled();
});
it('normal checkout uses the shared FIFO for concurrent readers and releases once',async()=>{
 const {createReaderPoolAdapter}=await import('../helpers/placesReaderAcceptanceFixture');let releases=0,finish!:()=>void;const calls:string[]=[];
 const pool=createReaderPoolAdapter({connect:async()=>({query:async(text:string)=>{calls.push(text);if(text==='first')await new Promise<void>(r=>finish=r);return text;},release:()=>releases++})},()=>true),client=await pool.connect();
 const first=client.query('first'),second=client.query('second');await flush();let refused=false;try{client.release();}catch{refused=true;}finish();expect(await Promise.all([first,second])).toEqual(['first','second']);expect(refused).toBe(true);client.release();expect(()=>client.release()).toThrow();expect(releases).toBe(1);expect(calls).toEqual(['first','second']);
});
it('retained reader queues concurrent reads, pool scope reads and refuses premature finish',async()=>{
 const {createReaderLeaseAdapter}=await import('../helpers/placesReaderAcceptanceFixture');let releases=0,finish!:()=>void;const calls:string[]=[];
 const adapter=createReaderLeaseAdapter({query:async(text:string)=>{calls.push(text);if(text==='first')await new Promise<void>(r=>finish=r);return {command:text.split(' ')[0],rows:[]};},release:()=>releases++},async()=>{}),client=await adapter.pool.connect();
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const first=client.query('first'),second=client.query('second');await flush();const observed=[...calls];let refused=false;try{adapter.finish();}catch{refused=true;}finish();await Promise.all([first,second]);expect(refused).toBe(true);expect(observed).toEqual(['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','first']);await client.query('COMMIT');client.release();await Promise.all([adapter.pool.query('scope1'),adapter.pool.query('scope2')]);const next=await adapter.pool.connect();await next.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await next.query('COMMIT');next.release();adapter.finish();expect(releases).toBe(1);expect(adapter.status()).toMatchObject({busy:false,logicalReleases:2,physicalReleases:1});
});
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const integration=readFileSync(new URL('../explorers-place-pins.integration.test.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('fixture.ts',integration,ts.ScriptTarget.Latest,true);
function calls(name:string){const found:ts.CallExpression[]=[];function visit(n:ts.Node){if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text===name)found.push(n);ts.forEachChild(n,visit);}visit(ast);return found;}
it('all appended compatibility projection calls mount the shared admitted pool boundary',()=>{
 const projections=calls('publicPlacesProjection');expect(projections).toHaveLength(4);
 for(const call of projections){const arg=call.arguments[0];expect(ts.isAwaitExpression(arg)).toBe(true);if(!ts.isAwaitExpression(arg))continue;expect(ts.isCallExpression(arg.expression)&&ts.isIdentifier(arg.expression.expression)&&arg.expression.expression.text==='p2ReaderPool').toBe(true);}
 const leases=calls('createReaderLeaseAdapter');expect(leases).toHaveLength(1);expect(leases[0].arguments[2]?.getText(ast)).toBe('p2ReaderAdmission');
});
it('source mounted pool helper uses the actual shared adapter and controller admission',async()=>{
 let found:ts.FunctionDeclaration|undefined;function visit(n:ts.Node){if(ts.isFunctionDeclaration(n)&&n.name?.text==='p2ReaderPool')found=n;ts.forEachChild(n,visit);}visit(ast);expect(found).toBeDefined();if(!found)return;
 const {createReaderPoolAdapter}=await import('../helpers/placesReaderAcceptanceFixture');let open=true,release!:()=>void;const calls:string[]=[];
 const code=ts.transpileModule(found.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const mounted=new Function('p2Modules','p2ReaderAdmission',`${code};return p2ReaderPool;`)(async()=>({createReaderPoolAdapter}),()=>open);
 const pool=await mounted({connect:async()=>({query:async(text:string)=>{calls.push(text);if(text==='first')await new Promise<void>(r=>release=r);return text;},release:()=>{}})}),db=await pool.connect();
 const first=db.query('first'),second=db.query('second'),rejected=expect(second).rejects.toThrow('admission');await flush();open=false;release();await first;await rejected;expect(calls).toEqual(['first']);db.release();
});
import {createWriterSuiteController} from '../helpers/placesWriterRaceController';
import {publicLinkedPeopleLists} from '../../publicProfile/publicPeopleProjection';
import {publicLinkedProductsLists} from '../../publicProfile/publicProductsProjection';
import {createReaderPoolAdapter} from '../helpers/placesReaderAcceptanceFixture';
it('actual controller and actual linked readers preserve lawful pg query admission',async()=>{
 let release!:()=>void,releases=0;const calls:string[]=[],events:unknown[]=[];
 const controller=createWriterSuiteController({identity:{database:'inert',runtimeLogin:'inert_login'},admission:()=>{},guardFailure:e=>events.push(e),clock:{now:()=>0,setTimeout:()=>0,clearTimeout(){}}});controller.admit('inert-reader');
 const raw={processID:1,release:()=>releases++,query:async(sql:string)=>{if(sql.includes('pg_backend_pid()'))return {rows:[{pid:1,database:'inert',effective:'music_runtime',login:'inert_login'}]};calls.push(sql.includes("child_category='people'")?'people':'products');if(calls.length===1)await new Promise<void>(r=>release=r);return {rows:[]};}};
 const owned=controller.wrapPool({totalCount:0,idleCount:0,waitingCount:0,connect:async()=>raw,end:async()=>{}},'runtime');
 const pool=createReaderPoolAdapter(owned,()=>!controller.status().admissionClosed);
 const operation=controller.runOwned(async()=>{const db=await pool.connect();try{return await Promise.all([publicLinkedPeopleLists(db as unknown as PoolClient,'inert','inert'),publicLinkedProductsLists(db as unknown as PoolClient,'inert','inert')]);}finally{db.release();}});
 await flush();expect(calls).toEqual(['people']);expect(events).toEqual([]);release();expect(await operation).toEqual([[],[]]);await controller.settleCase();expect(calls).toEqual(['people','products']);expect(events).toEqual([]);expect(releases).toBe(1);expect(controller.status().leaseRestored).toBe(true);
});
it('external abort leaves a running original unresolved until its actual settlement',async()=>{
 let open=true,release!:()=>void;const calls:string[]=[];const q=createReaderQueryQueue(async(text:string)=>{calls.push(text);await new Promise<void>(r=>release=r);return text;},()=>open);
 const first=q.query('first'),second=q.query('second');const refusal=expect(second).rejects.toThrow('admission');await flush();open=false;await flush();expect(q.status().pending).toBe(2);expect(()=>q.assertSettled()).toThrow('unsettled');release();await first;await refusal;expect(calls).toEqual(['first']);q.assertSettled();
});
it('installed pg queue physically submits its two accepted logical requests in the same order',async()=>{
 const {createRequire}=await import('node:module'),require=createRequire(import.meta.url),Client=require('pg/lib/client.js'),submitted:string[]=[],completed:string[]=[];
 const client=Object.create(Client.prototype);Object.assign(client,{_queryQueue:[],_activeQuery:null,readyForQuery:true,connectionParameters:{},connection:{},_queryable:true,_ending:false});
 const query=(id:string)=>({callback(){},submit(){submitted.push(id);},handleReadyForQuery(){completed.push(id);}});
 client.query(query('people'));client.query(query('products'));expect(submitted).toEqual(['people']);client._handleReadyForQuery({});expect(submitted).toEqual(['people','products']);client._handleReadyForQuery({});expect(completed).toEqual(['people','products']);
});
import {publicPlacesProjection} from '../../publicProfile/publicPlacesProjection';
import {createReaderLeaseAdapter} from '../helpers/placesReaderAcceptanceFixture';
function mountedCompat(admitted:()=>boolean){
 const declarations:ts.FunctionDeclaration[]=[];function visit(n:ts.Node){if(ts.isFunctionDeclaration(n)&&['p2ReaderPool','p2Compat'].includes(n.name?.text??''))declarations.push(n);ts.forEachChild(n,visit);}visit(ast);expect(declarations).toHaveLength(2);
 const code=ts.transpileModule(declarations.map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return new Function('p2Modules','p2ReaderAdmission','runtime','p2Secret',`${code};return p2Compat;`)(async()=>({createReaderPoolAdapter,publicPlacesProjection}),admitted,undefined,'inert-retained-compat-secret');
}
for(const empty of [true,false])for(const raced of [false,true])it(`actual mounted compatibility preserves retained scope protocol for ${empty?'empty':'populated'} list ${raced?'raced':'stable'} validation`,async()=>{
 const list='00000000-0000-0000-0000-000000000001',account='00000000-0000-0000-0000-000000000002',recommendation='00000000-0000-0000-0000-000000000003',entity='00000000-0000-0000-0000-000000000004';let releases=0,aggregates=0,barriers=0;
 const lease={release:()=>releases++,query:async(text:string)=>{
  let rows:any[]=[];
  if(text.includes('public_places_eligibility_aggregate')){aggregates++;rows=[{item_count:String((empty?0:1)+(raced&&aggregates===2?1:0)),pin_count:'0',lane_0:'0',lane_1:'0',lane_2:'0',lane_3:'0'}];}
  else if(text.includes('public_places_current_eligibility'))rows=empty?[]:[{id:recommendation,entity_id:entity,collection_id:list}];
  else if(text.startsWith('SELECT r.id,r.account_id'))rows=empty?[]:[{id:recommendation,account_id:account,entity_id:entity,entity_kind:'place',note:null,note_bytes:0,override_bytes:0,display_order:0,pin_order:null,pin_bucket:1,sort_position:0,collection_id:list,collection_title:'Inert',collection_slug:'inert-list'}];
  else if(text.startsWith('SELECT e.id,e.kind,e.title,e.origin'))rows=[{id:entity,kind:'place',title:'Inert place',origin:'manual'}];
  else if(text.includes('public_places_current_list'))rows=[{id:list,collection_revision:'1',category_revision:'1'}];
  else if(text.includes("s.category='places'"))rows=[{id:account,handle:'inert',account_revision:'1',content_revision:'1'}];
  else if(text.startsWith('SELECT c.id,c.revision::text AS collection_revision'))rows=[{id:list,collection_revision:'1',title:'Inert',description:null,slug:'inert-list',heading:null,display_order:0,cover_media_id:null}];
  return {rows,command:text.split(' ')[0]};
 }};
 const adapter=createReaderLeaseAdapter(lease,async()=>{barriers++;expect(adapter.status()).toMatchObject({begins:1,commits:1,logicalReleases:1,physicalReleases:0,transaction:false});},()=>true);
 const compat=mountedCompat(()=>true),operation=compat({handle:'inert',list,lists:[list],slugs:['inert-list']},24,undefined,list,adapter.pool);
 if(raced){const {PublicPlaceRestartConflict}=await import('../../application/placePinsRead');await expect(operation).rejects.toBeInstanceOf(PublicPlaceRestartConflict);}else {const places=(await operation).recommendationLists[0].recommended_places;expect(places).toHaveLength(empty?0:1);if(!empty)expect(places[0].documentId).toBe(recommendation);}
 expect(barriers).toBe(1);expect(aggregates).toBe(2);adapter.finish();expect(releases).toBe(1);expect(adapter.status()).toMatchObject({logicalReleases:2,physicalReleases:1,transaction:false,connected:false,busy:false});
});

it('retained boundary selection preserves both original and outer irreversible admission',async()=>{
 let open=true,calls=0;const adapter=createReaderLeaseAdapter({query:async(text:string)=>{calls++;return {rows:[],command:text.split(' ')[0]};},release:()=>{}},async()=>{},()=>true);
 const wrapped=createReaderPoolAdapter(adapter.pool,()=>open),client=await wrapped.connect();open=false;await expect(client.query('SELECT never')).rejects.toThrow('admission');expect(calls).toBe(0);client.release();adapter.finish();
});
