import {it,expect,vi} from 'vitest';
import {publicGamesProjection,discardGamePublicResult,gamePublicBudgetSnapshot,createGamePublicExecutor,runGamePublicRead} from '../publicProfile/publicGamesProjection';
import {PublicProfileService} from '../publicProfile/publicProfileService';
import {SqlStatementRecorder} from './helpers/sqlStatementRecorder';
import {gamesPublicRules,gamesPublicStructural,gamesNativeReply} from './helpers/publicGamesStatementRules';
/**
 * Every Games query mock below was keyed on the `SELECT a.id,a.handle` prefix of the
 * public account scope SELECT list - the exact shape that went vacuous in 343df2dd, and
 * a SELECT list shared verbatim by nine projection files. They are now keyed on
 * FROM/JOIN/WHERE structure (see helpers/publicGamesStatementRules.ts) and guarded:
 * `recorder.assertExercised` fails if any structural statement reached the `[]`
 * fallback, or if the scope read was never actually answered.
 */
function gamesRecorder(){return new SqlStatementRecorder(gamesPublicRules,gamesPublicStructural);}
it('bounds queued callers at32 and starts FIFO only after actual settlement',async()=>{
 const order:string[]=[],settlers:Array<()=>void>=[];
 const executor=createGamePublicExecutor(undefined,async(_dependency,input)=>{order.push(input.username);await new Promise<void>(resolve=>settlers.push(resolve));return undefined;});
 const reads=Array.from({length:32},(_,i)=>runGamePublicRead({username:`owner${i}`,kind:'category',limit:12},executor));reads.forEach(read=>void read.catch(()=>{}));
 await Promise.resolve();await Promise.resolve();
 try{
  expect(order).toEqual(['owner0','owner1']);expect(gamePublicBudgetSnapshot()).toEqual({active:2,callers:32,memory:48*1024*1024+30*8192});
  await expect(runGamePublicRead({username:'overflow',kind:'category',limit:12},executor)).rejects.toMatchObject({code:'READ_LIMIT'});
  for(let i=0;i<32;i++){settlers[i]?.();await new Promise(resolve=>setImmediate(resolve));}
  await Promise.all(reads);expect(order).toEqual(Array.from({length:32},(_,i)=>`owner${i}`));
 }finally{settlers.forEach(resolve=>resolve());await Promise.allSettled(reads);}
 expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
});
it('selected cancellation never starts authority and native cancellation refunds only on actual settlement',async()=>{
 let settle:()=>void=()=>{};const work=vi.fn(async()=>{await new Promise<void>(resolve=>settle=resolve);return undefined;});
 const executor=createGamePublicExecutor(undefined,work),selected=new AbortController();
 const first=runGamePublicRead({username:'owner',kind:'category',limit:12},executor,selected.signal);const firstRejected=expect(first).rejects.toMatchObject({code:'READ_LIMIT'});selected.abort();await firstRejected;expect(work).not.toHaveBeenCalled();
 const native=new AbortController(),second=runGamePublicRead({username:'owner',kind:'category',limit:12},executor,native.signal);const secondRejected=expect(second).rejects.toMatchObject({code:'READ_LIMIT'});
 await Promise.resolve();native.abort();await secondRejected;expect(work).toHaveBeenCalledTimes(1);expect(gamePublicBudgetSnapshot()).toEqual({active:1,callers:1,memory:24*1024*1024});
 settle();await new Promise(resolve=>setImmediate(resolve));expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
});
it('queued expiration never receives a fresh activation deadline or starts work',async()=>{
 vi.useFakeTimers();const settlers:Array<()=>void>=[],work=vi.fn(async()=>{await new Promise<void>(resolve=>settlers.push(resolve));return undefined;});const executor=createGamePublicExecutor(undefined,work);
 const reads=[0,1,2].map(i=>runGamePublicRead({username:`owner${i}`,kind:'category',limit:12},executor));reads.forEach(read=>void read.catch(()=>{}));
 try{await vi.advanceTimersByTimeAsync(15001);expect(work).toHaveBeenCalledTimes(2);expect(gamePublicBudgetSnapshot()).toEqual({active:2,callers:2,memory:48*1024*1024});settlers.forEach(resolve=>resolve());await vi.advanceTimersByTimeAsync(0);await Promise.allSettled(reads);expect(work).toHaveBeenCalledTimes(2);expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});}
 finally{settlers.forEach(resolve=>resolve());vi.useRealTimers();}
});
it('activation near expiry preserves the enqueue deadline while late native work retains custody',async()=>{
 vi.useFakeTimers();const settlers:Array<()=>void>=[];const executor=createGamePublicExecutor(undefined,async()=>{await new Promise<void>(resolve=>settlers.push(resolve));return undefined;});
 const reads=[0,1,2].map(i=>runGamePublicRead({username:`owner${i}`,kind:'category',limit:12},executor));reads.forEach(read=>void read.catch(()=>{}));
 try{await vi.advanceTimersByTimeAsync(14900);settlers[0]();await vi.advanceTimersByTimeAsync(0);expect(settlers).toHaveLength(3);expect(gamePublicBudgetSnapshot()).toEqual({active:2,callers:2,memory:48*1024*1024});
  await vi.advanceTimersByTimeAsync(101);const outcomes=await Promise.allSettled(reads);expect(outcomes[0].status).toBe('fulfilled');expect(outcomes.slice(1).every(outcome=>outcome.status==='rejected'&&(outcome.reason as any).code==='READ_LIMIT')).toBe(true);
  expect(gamePublicBudgetSnapshot()).toEqual({active:2,callers:2,memory:48*1024*1024});settlers.slice(1).forEach(resolve=>resolve());await vi.advanceTimersByTimeAsync(0);expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
 }finally{settlers.forEach(resolve=>resolve());vi.useRealTimers();}
});
it('rejects oversized or graph-carrying pending inputs before caller admission',async()=>{
 const work=vi.fn(async()=>undefined),executor=createGamePublicExecutor(undefined,work);
 for(const input of [{username:'x'.repeat(65),kind:'category',limit:12},{username:'\u0130'.repeat(64),kind:'category',limit:12},{username:'owner',kind:'category',limit:12,cursor:'x'.repeat(2049)},{username:'owner',kind:'detail',limit:12,slug:'x'.repeat(257)},{username:'owner',kind:'category',limit:12,request:{body:'unbounded'}}])await expect(runGamePublicRead(input as any,executor)).rejects.toMatchObject({code:'READ_LIMIT'});
 expect(work).not.toHaveBeenCalled();expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
});
it('retains only an immutable maximum scalar copy while queued despite caller input mutation',async()=>{
 const settlers:Array<()=>void>=[],seen:any[]=[];const executor=createGamePublicExecutor(undefined,async(_dependency,input)=>{seen.push(input);await new Promise<void>(resolve=>settlers.push(resolve));return undefined;});
 const first=runGamePublicRead({username:'first',kind:'category',limit:12},executor),second=runGamePublicRead({username:'second',kind:'category',limit:12},executor);
 const input:any={username:'O'.repeat(64),kind:'detail',limit:24,cursor:'x'.repeat(2048),slug:'s'.repeat(256)};const third=runGamePublicRead(input,executor);input.username='changed';input.cursor='changed';input.slug='changed';input.request={body:'not copied'};
 try{await Promise.resolve();expect(seen).toHaveLength(2);expect(gamePublicBudgetSnapshot()).toEqual({active:2,callers:3,memory:48*1024*1024+8192});settlers[0]();await new Promise(resolve=>setImmediate(resolve));
  expect(seen[2]).toEqual({username:'o'.repeat(64),kind:'detail',limit:24,cursor:'x'.repeat(2048),slug:'s'.repeat(256)});expect(Object.isFrozen(seen[2])).toBe(true);expect(Object.keys(seen[2])).toHaveLength(5);settlers.slice(1).forEach(resolve=>resolve());await Promise.all([first,second,third]);
 }finally{settlers.forEach(resolve=>resolve());await Promise.allSettled([first,second,third]);}
 expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
});
it('queues a third bounded read without starting authority until native capacity actually releases',async()=>{
 let settle:(value:any)=>void=()=>{};const pending=new Promise<any>(resolve=>{settle=resolve;});
 const resolveAccount=vi.fn(()=>pending);const service=new PublicProfileService({resolveAccount,resolveCategory:async()=>undefined,resolveDetail:async()=>undefined});
 const requests=[service.category('owner','games',12),service.detail('owner','games','list',12),service.category('owner2','games',12)];
 requests.forEach(request=>void request.catch(()=>{}));
 try{await Promise.resolve();await Promise.resolve();expect(resolveAccount).toHaveBeenCalledTimes(2);expect(gamePublicBudgetSnapshot()).toEqual({active:2,callers:3,memory:48*1024*1024+8192});}
 finally{settle(undefined);await Promise.allSettled(requests);}
 expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
});
it('keeps result memory across a caller deadline until noncooperative fresh authority actually settles',async()=>{
 vi.useFakeTimers();let settle:(value:any)=>void=()=>{};let result:unknown;
 try{
  const id='00000000-0000-4000-8000-000000000001';
  const seen=gamesRecorder();
  const query=vi.fn(async(sql:string)=>{const kind=seen.kind(sql);return gamesNativeReply(sql,kind,seen.serve(kind,kind==='scope'?[{id,handle:'owner',account_revision:'1',content_revision:'1'}]:[]));});
  const pool={query,connect:vi.fn(async()=>({query,release:vi.fn()}))};
  let calls=0;const pending=new Promise(resolve=>{settle=resolve;});
  const service=new PublicProfileService({resolveAccount:async()=>++calls===1?{documentId:id,public_profile:'Yes',public_games:'Yes'}:pending as any,resolveCategory:async(_u,_c,_l,_cursor,operation)=>result=await publicGamesProjection(pool as any,'owner',12,undefined,undefined,'test-only-'.repeat(5),operation),resolveDetail:async()=>undefined});
  const read=service.category('owner','games',12);const rejected=expect(read).rejects.toMatchObject({status:503,code:'READ_LIMIT'});
  await vi.advanceTimersByTimeAsync(15001);await rejected;
  expect(gamePublicBudgetSnapshot()).toEqual({active:1,callers:1,memory:24*1024*1024});
  settle({documentId:id,public_profile:'Yes',public_games:'No'});await vi.advanceTimersByTimeAsync(0);
  expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
  seen.assertExercised([],['scope']);
 }finally{settle(undefined);discardGamePublicResult(result);vi.useRealTimers();}
});
it('discards a charged Games result when fresh public authorization changes after composition',async()=>{
 const id='00000000-0000-4000-8000-000000000001';
 const seen=gamesRecorder();
 const query=vi.fn(async(sql:string)=>{const kind=seen.kind(sql);return gamesNativeReply(sql,kind,seen.serve(kind,kind==='scope'?[{id,handle:'owner',account_revision:'1',content_revision:'1'}]:[]));});
 const pool={query,connect:vi.fn(async()=>({query,release:vi.fn()}))};
 let result:unknown;let calls=0;const service=new PublicProfileService({resolveAccount:async()=>({documentId:id,public_profile:'Yes',public_games:++calls===1?'Yes':'No'}),resolveCategory:async(_u,_c,_l,_cursor,operation)=>result=await publicGamesProjection(pool as any,'owner',12,undefined,undefined,'test-only-'.repeat(5),operation),resolveDetail:async()=>undefined});
 try{expect(await service.category('owner','games',12)).toBeUndefined();expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});seen.assertExercised([],['scope']);}finally{discardGamePublicResult(result);}
});
it('charges completed real result custody until its consumer discards it exactly once',async()=>{
 const id='00000000-0000-4000-8000-000000000001';
 const seen=gamesRecorder();
 const query=vi.fn(async(sql:string)=>{const kind=seen.kind(sql);return gamesNativeReply(sql,kind,seen.serve(kind,kind==='scope'?[{id,handle:'owner',account_revision:'1',content_revision:'1'}]:[]));});
 const pool={query,connect:vi.fn(async()=>({query,release:vi.fn()}))};
 const result=await publicGamesProjection(pool as any,'owner',12,undefined,undefined,'test-only-'.repeat(5));
 seen.assertExercised([],['scope']);
 try{expect(gamePublicBudgetSnapshot()).toEqual({active:1,callers:1,memory:24*1024*1024});}
 finally{discardGamePublicResult(result);discardGamePublicResult(result);}
 expect(gamePublicBudgetSnapshot()).toEqual({active:0,callers:0,memory:0});
});
it('category24 retains a signed list preview12 and does not confuse its continuation limit',async()=>{
 const id='00000000-0000-4000-8000-000000000001',collection='00000000-0000-4000-8000-000000000002';
 const rows=Array.from({length:13},(_,index)=>({id:`00000000-0000-4000-8000-${String(index+10).padStart(12,'0')}`,entity_id:id,account_id:id,collection_id:collection,collection_title:'Games',collection_slug:'games',user_rating:null,note:null,display_values:null,canonical_title:'Manual',title_bytes:8,note_bytes:0,override_bytes:0,display_order:index,pin_order:null}));
 const seen=gamesRecorder();
 const reply:Record<string,any[]>={scope:[{id,handle:'owner',account_revision:'1',content_revision:'1'}],lists:[{id:collection,title:'Games',description:null,slug:'games',heading:null,display_order:0,cover_media_id:null,revision:'1',item_bytes:40}],children:rows,manualOrigin:[{origin:'manual',kind:'game'}]};
 const query=vi.fn(async(sql:string)=>{const kind=seen.kind(sql);return gamesNativeReply(sql,kind,seen.serve(kind,reply[kind??'']??[]));});
 const pool={query,connect:vi.fn(async()=>({query,release:vi.fn()}))};
 const result=await publicGamesProjection(pool as any,'owner',24,undefined,undefined,'test-only-'.repeat(5)) as any;
 seen.assertExercised(['hero','manualMedia'],['scope','lists','children','manualOrigin']);
 expect(result.gameLists[0].recommendations).toHaveLength(12);
 expect(result.gameLists[0].nextCursor).toEqual(expect.any(String));
 const payload=JSON.parse(Buffer.from(result.gameLists[0].nextCursor.split('.')[0],'base64url').toString('utf8'));
 expect(payload).toMatchObject({purpose:'games-list',limit:12,listId:collection});
 discardGamePublicResult(result);
 await expect(publicGamesProjection(pool as any,'owner',24,result.gameLists[0].nextCursor,'games','test-only-'.repeat(5))).rejects.toThrow('continuation');
});
it('returns actual native Games collections rather than a successful empty compatibility response',async()=>{
 const id='00000000-0000-4000-8000-000000000001';
 const seen=gamesRecorder();
 const reply:Record<string,any[]>={scope:[{id,handle:'owner',account_revision:'1',content_revision:'1'}],lists:[{id,title:'Games',description:null,slug:'games',heading:null,display_order:0,cover_media_id:null,revision:'1',item_bytes:40}]};
 const query=vi.fn(async(sql:string)=>{const kind=seen.kind(sql);return gamesNativeReply(sql,kind,seen.serve(kind,reply[kind??'']??[]));});
 const pool={query,connect:vi.fn(async()=>({query,release:vi.fn()}))};
 const result=await publicGamesProjection(pool as any,'owner',24,undefined,undefined,'test-only-'.repeat(5));
 seen.assertExercised(['children','hero'],['scope','lists']);
 expect(result).toMatchObject({version:'explorers-manual-games-page/v1',gameLists:[{id,title:'Games',slug:'games',recommendations:[],nextCursor:null}],nextCursor:null});
 discardGamePublicResult(result);
});
it('projects an eligible empty manual Games scope without a provider or fabricated rows',async()=>{
 const scope={id:'00000000-0000-4000-8000-000000000001',handle:'owner',account_revision:'1',content_revision:'1'};
 const seen=gamesRecorder();
 const query=vi.fn(async(sql:string)=>{const kind=seen.kind(sql);return gamesNativeReply(sql,kind,seen.serve(kind,kind==='scope'?[scope]:[]));});
 const release=vi.fn();const pool={query,connect:vi.fn(async()=>({query,release}))};
 const result=await publicGamesProjection(pool as any,'owner',12,undefined,undefined,'test-only-'.repeat(5));
 seen.assertExercised(['lists','hero'],['scope']);
 expect(result).toEqual({version:'explorers-manual-games-page/v1',gameLists:[],topPicks:[],nextCursor:null});discardGamePublicResult(result);
 expect(release).toHaveBeenCalledTimes(1);
});
