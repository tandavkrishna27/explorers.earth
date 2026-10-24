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
import {createWriterSuiteController} from '../helpers/placesWriterRaceController';
import {publicLinkedPeopleLists} from '../../publicProfile/publicPeopleProjection';
import {publicLinkedProductsLists} from '../../publicProfile/publicProductsProjection';
import {createReaderPoolAdapter} from '../helpers/placesReaderAcceptanceFixture';
it('actual controller and actual linked readers preserve lawful pg query admission',async()=>{
 let release!:()=>void,releases=0;const calls:string[]=[],events:unknown[]=[];
 const controller=createWriterSuiteController({identity:{database:'inert',runtimeLogin:'inert_login'},admission:()=>{},guardFailure:e=>events.push(e),clock:{now:()=>0,setTimeout:()=>0,clearTimeout(){}}});controller.admit('inert-reader');
 const raw={processID:1,release:()=>releases++,query:async(sql:string,values?:unknown[])=>{if(sql.includes('pg_backend_pid()'))return {rows:[{pid:1,database:'inert',effective:'music_runtime',login:'inert_login'}]};
  // WP10: both readers share publicLinkedLists' SQL text; the category is bound as $3.
  if(!sql.includes('FROM collection_list_links')||!['people','products'].includes(String(values?.[2])))throw Error('unexpected linked reader query');calls.push(String(values![2]));if(calls.length===1)await new Promise<void>(r=>release=r);return {rows:[]};}};
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
import {createReaderLeaseAdapter} from '../helpers/placesReaderAcceptanceFixture';
it('retained boundary selection preserves both original and outer irreversible admission',async()=>{
 let open=true,calls=0;const adapter=createReaderLeaseAdapter({query:async(text:string)=>{calls++;return {rows:[],command:text.split(' ')[0]};},release:()=>{}},async()=>{},()=>true);
 const wrapped=createReaderPoolAdapter(adapter.pool,()=>open),client=await wrapped.connect();open=false;await expect(client.query('SELECT never')).rejects.toThrow('admission');expect(calls).toBe(0);client.release();adapter.finish();
});
