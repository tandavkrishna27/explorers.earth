import {afterEach,expect,it,vi} from 'vitest';
import {createPublicProfileGatewayClient} from '../publicProfileGatewayClient';
afterEach(()=>vi.restoreAllMocks());
const promptly=<T,>(work:Promise<T>)=>Promise.race([work,new Promise<string>(resolve=>setTimeout(()=>resolve('still pending'),30))]);
it('always reads People category and detail pages fresh without credentials or conditional cache',async()=>{
 const transport=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({personLists:[]}),{headers:{etag:'"retained"'}}));
 const client=createPublicProfileGatewayClient('https://public.example',transport);
 await client.category('reader','people'); await client.category('reader','people');
 await client.categoryPage('reader','people',{limit:12,cursor:'o12'});
 await client.detail('reader','people','list');await client.detailPage('reader','people','list',{limit:24,cursor:'o12'});
 expect(client.peekCategory('reader','people')).toBeUndefined();
 for(const [,init] of transport.mock.calls){expect(init).toMatchObject({cache:'no-store',credentials:'omit'});expect(init.headers).toEqual({Accept:'application/json'});}
});
const requests=[
 ['category',(client:ReturnType<typeof createPublicProfileGatewayClient>,signal?:AbortSignal)=>client.category('reader','people',signal)],
 ['detail',(client:ReturnType<typeof createPublicProfileGatewayClient>,signal?:AbortSignal)=>client.detail('reader','people','list',signal)],
 ['category continuation',(client:ReturnType<typeof createPublicProfileGatewayClient>,signal?:AbortSignal)=>client.categoryPage('reader','people',{limit:12,cursor:'o12'},signal)],
 ['detail continuation',(client:ReturnType<typeof createPublicProfileGatewayClient>,signal?:AbortSignal)=>client.detailPage('reader','people','list',{limit:24,cursor:'o12'},signal)],
 ['sector',(client:ReturnType<typeof createPublicProfileGatewayClient>,signal?:AbortSignal)=>client.peopleSectorPage('reader','sector',{limit:24},signal)],
] as const;
it.each(requests)('People %s rejects an oversized declared body before materialization and cancels it',async(_name,request)=>{
 const cancel=vi.fn(()=>new Promise<void>(()=>{}));const body=new ReadableStream<Uint8Array>({pull:()=>new Promise(()=>{}),cancel});
 const response=new Response(body,{headers:{'content-length':String(4*1024*1024+1)}}),json=vi.spyOn(response,'json');
 const client=createPublicProfileGatewayClient('https://public.example',vi.fn().mockResolvedValue(response));
 const outcome=request(client).then(()=> 'accepted',error=>error.message);
 expect(await promptly(outcome)).toBe('PUBLIC_PROFILE_READ_LIMIT');expect(json).not.toHaveBeenCalled();expect(cancel).toHaveBeenCalledOnce();expect(body.locked).toBe(false);
});
it('People streaming byte limit cancels and releases before reading the tail or invoking response.json',async()=>{
 let reads=0;const cancel=vi.fn();const body=new ReadableStream<Uint8Array>({pull(controller){reads++;controller.enqueue(new TextEncoder().encode(reads===1?'{"value":"'+'x'.repeat(4*1024*1024):'"}'));if(reads===2)controller.close();},cancel},{highWaterMark:0});
 const response=new Response(body),json=vi.spyOn(response,'json');const client=createPublicProfileGatewayClient('https://public.example',vi.fn().mockResolvedValue(response));
 const outcome=client.category('reader','people').then(()=> 'accepted',error=>error.message);expect(await outcome).toBe('PUBLIC_PROFILE_READ_LIMIT');expect(reads).toBe(1);expect(cancel).toHaveBeenCalledOnce();expect(body.locked).toBe(false);expect(json).not.toHaveBeenCalled();
});
it.each(['fetch','body'] as const)('People deadline settles a stalled %s without waiting for cancellation acknowledgment',async(stage)=>{
 // The deadline is an AbortController + setTimeout now, not AbortSignal.timeout, because
 // .any needs Safari 17.4 and the shell read cannot require it. Drive it by firing the
 // scheduled callback, and keep asserting 15000 so people/games are not silently retimed.
 const timers=vi.spyOn(globalThis,'setTimeout');
 const cancel=vi.fn(()=>new Promise<void>(()=>{}));const body=new ReadableStream<Uint8Array>({pull:()=>new Promise(()=>{}),cancel},{highWaterMark:0});
 const fetchImpl=vi.fn().mockImplementation(()=>stage==='fetch'?new Promise(()=>{}):Promise.resolve(new Response(body)));
 const client=createPublicProfileGatewayClient('https://public.example',fetchImpl);const outcome=client.category('reader','people').then(()=> 'accepted',error=>error.message);
 await Promise.resolve();await Promise.resolve();const deadline=timers.mock.calls.find(([,delay])=>delay===15_000);expect(deadline).toBeDefined();(deadline![0] as ()=>void)();expect(await promptly(outcome)).toBe('PUBLIC_PROFILE_ABORTED');expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
 if(stage==='body'){expect(cancel).toHaveBeenCalledOnce();expect(body.locked).toBe(false);}
 timers.mockRestore();
});
it('People caller abort cancels and releases a stalled body even if cancellation never acknowledges',async()=>{
 const abort=new AbortController(),cancel=vi.fn(()=>new Promise<void>(()=>{}));const body=new ReadableStream<Uint8Array>({pull:()=>new Promise(()=>{}),cancel},{highWaterMark:0});
 const client=createPublicProfileGatewayClient('https://public.example',vi.fn().mockResolvedValue(new Response(body)));const outcome=client.detail('reader','people','list',abort.signal).then(()=> 'accepted',error=>error.message);
 await Promise.resolve();await Promise.resolve();abort.abort();expect(await promptly(outcome)).toBe('PUBLIC_PROFILE_ABORTED');expect(cancel).toHaveBeenCalledOnce();expect(body.locked).toBe(false);
});
it('People abort settles an ignored fetch and cancels its late response body',async()=>{
 const abort=new AbortController();let deliver!:(response:Response)=>void;const fetchImpl=vi.fn().mockImplementation(()=>new Promise<Response>(resolve=>{deliver=resolve}));
 const client=createPublicProfileGatewayClient('https://public.example',fetchImpl);const outcome=client.peopleSectorPage('reader','sector',{limit:24},abort.signal).then(()=> 'accepted',error=>error.message);
 abort.abort();expect(await promptly(outcome)).toBe('PUBLIC_PROFILE_ABORTED');
 const cancel=vi.fn();const body=new ReadableStream<Uint8Array>({cancel});deliver(new Response(body));await Promise.resolve();await Promise.resolve();expect(cancel).toHaveBeenCalledOnce();expect(body.locked).toBe(false);
});
it('People accepts the exact server4MiB byte boundary and rejects larger streamed bodies',async()=>{
 const value='n'.repeat(4*1024*1024-12),serialized=JSON.stringify({value});expect(new TextEncoder().encode(serialized)).toHaveLength(4*1024*1024);
 const client=createPublicProfileGatewayClient('https://public.example',vi.fn().mockResolvedValue(new Response(serialized)));const received=await client.category('reader','people') as {value:string};expect(received.value.length).toBe(value.length);
});
it.each(['fetch','body'] as const)('People normalizes raw %s failures without propagating response or transport diagnostics',async(stage)=>{
 const body=new ReadableStream<Uint8Array>({pull(controller){controller.error(Error('private transport diagnostic'));}});
 const fetchImpl=vi.fn().mockImplementation(()=>stage==='fetch'?Promise.reject(Error('private transport diagnostic')):Promise.resolve(new Response(body)));
 const client=createPublicProfileGatewayClient('https://public.example',fetchImpl);const outcome=client.category('reader','people').then(()=> 'accepted',error=>error.message);
 expect(await outcome).toBe(stage==='fetch'?'PUBLIC_PROFILE_UNAVAILABLE':'PUBLIC_PROFILE_INVALID_RESPONSE');expect(body.locked).toBe(false);
});
it('encodes the native sector endpoint and applies the same fresh public transport policy',async()=>{
 const transport=vi.fn().mockImplementation(async()=>new Response('{}',{headers:{etag:'"retained"'}}));const client=createPublicProfileGatewayClient('https://public.example',transport);
 const controller=new AbortController();await client.peopleSectorPage('reader name','old alias',{limit:24,cursor:'signed+cursor'},controller.signal);await client.peopleSectorPage('reader name','old alias',{limit:24});
 expect(transport.mock.calls[0][0]).toBe('https://public.example/api/explorers/v1/profiles/reader%20name/recommendations/people/sectors/old%20alias?limit=24&cursor=signed%2Bcursor');
 for(const [,init] of transport.mock.calls){expect(init).toMatchObject({cache:'no-store',credentials:'omit',headers:{Accept:'application/json'}});expect(init.headers).not.toHaveProperty('If-None-Match');}
 controller.abort();expect(transport.mock.calls[0][1].signal.aborted).toBe(true);
});
