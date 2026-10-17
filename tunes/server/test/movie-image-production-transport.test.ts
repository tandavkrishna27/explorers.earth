import {beforeEach,it,expect,vi} from 'vitest';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
const native=vi.hoisted(()=>({addresses:[{address:'142.250.1.1',family:4}] as Array<{address:string;family:number}>,dns:vi.fn(),request:vi.fn(),options:null as any,status:200,holdClose:false,finishClose:null as null|(()=>void),requestOnly:null as null|(()=>void),socketOnly:null as null|(()=>void)}));
vi.mock('node:dns/promises',()=>({lookup:async(...args:any[])=>{native.dns(...args);return native.addresses;}}));
vi.mock('node:https',()=>({request:(url:any,options:any,respond:any)=>{
 native.request(url,options);native.options=options;const req=new EventEmitter() as any,socket=new EventEmitter();let res:any,closed=false;
 const close=()=>{if(closed)return;closed=true;req.emit('close');socket.emit('close');};
 req.destroy=()=>{res?.destroy();if(!native.holdClose)close();return req;};
 req.end=()=>{req.emit('socket',socket);res=Readable.from([Buffer.from([137,80,78,71,13,10,26,10])]) as any;res.statusCode=native.status;res.headers={'content-type':'image/png','content-length':'8'};res.once('close',()=>{if(!native.holdClose)close();});native.finishClose=close;native.requestOnly=()=>req.emit('close');native.socketOnly=()=>socket.emit('close');respond(res);};return req;
}}));
import {MovieImageFetcher,MovieImageFailure} from '../services/movieImageFetch';
beforeEach(()=>{native.addresses=[{address:'142.250.1.1',family:4}];native.dns.mockClear();native.request.mockClear();native.options=null;native.status=200;native.holdClose=false;native.finishClose=null;});
it('uses the production native DNS/HTTPS path with one validated address and original TLS hostname',async()=>{
 const phases:string[]=[];const owned=new MovieImageFetcher().fetchOwned('https://image.tmdb.org/t/p/w780/poster.jpg','poster',async phase=>{phases.push(phase);});
 expect(await owned.completion).toMatchObject({mimeType:'image/png',bytes:Buffer.from([137,80,78,71,13,10,26,10])});await owned.settlement;
 expect(native.dns).toHaveBeenCalledWith('image.tmdb.org',{all:true,verbatim:true});expect(native.options).toMatchObject({method:'GET',agent:false,rejectUnauthorized:true,servername:'image.tmdb.org',family:4,autoSelectFamily:false});
 let pin:any[]=[];native.options.lookup('image.tmdb.org',{},(...v:any[])=>pin=v);expect(pin).toEqual([null,'142.250.1.1',4]);expect(phases).toEqual(['dns','connect','body']);expect(owned.acceptedBytes()).toBe(8);
});
it('rejects mixed public/private DNS answers before allocating the native request',async()=>{
 native.addresses.push({address:'127.0.0.1',family:4});const owned=new MovieImageFetcher().fetchOwned('https://image.tmdb.org/t/p/w185/cast.png','cast');await expect(owned.completion).rejects.toBeInstanceOf(MovieImageFailure);await owned.settlement;expect(native.request).not.toHaveBeenCalled();
});
it('never follows native HTTPS redirects or charges a redirect body as accepted image bytes',async()=>{
 native.status=302;const phases:string[]=[];const owned=new MovieImageFetcher().fetchOwned('https://image.tmdb.org/t/p/w1280/backdrop.jpg','backdrop',async phase=>{phases.push(phase);});await expect(owned.completion).rejects.toBeInstanceOf(MovieImageFailure);await owned.settlement;expect(native.request).toHaveBeenCalledTimes(1);expect(phases).toEqual(['dns','connect']);expect(owned.acceptedBytes()).toBe(0);
});
it('preserves a trusted admission denial before native DNS rather than accepting arbitrary URL authority',async()=>{
 const denied=new Error('source changed');const owned=new MovieImageFetcher().fetchOwned('https://image.tmdb.org/t/p/w780/poster.jpg','poster',async()=>{throw denied;});await expect(owned.completion).rejects.toBe(denied);await owned.settlement;expect(native.dns).not.toHaveBeenCalled();expect(native.request).not.toHaveBeenCalled();
 expect(()=>new MovieImageFetcher().fetchOwned('https://image.tmdb.org:443/t/p/w780/poster.jpg','poster')).toThrow(MovieImageFailure);
});

it('quarantines a rejected native response until actual request and socket close events',async()=>{
 native.status=302;native.holdClose=true;let settled=false;
 const owned=new MovieImageFetcher().fetchOwned('https://image.tmdb.org/t/p/w780/poster.jpg','poster');owned.settlement.then(()=>{settled=true;});
 await expect(owned.completion).rejects.toBeInstanceOf(MovieImageFailure);await new Promise(r=>setTimeout(r,10));expect(settled).toBe(false);
 native.requestOnly!();await new Promise(r=>setTimeout(r,10));expect(settled).toBe(false);native.socketOnly!();await owned.settlement;expect(settled).toBe(true);expect(owned.acceptedBytes()).toBe(0);
});
it('quarantines trusted body-admission denial until native socket disposal completes',async()=>{
 native.holdClose=true;let settled=false;const denied=new Error('Actor revoked at body');
 const owned=new MovieImageFetcher().fetchOwned('https://image.tmdb.org/t/p/w780/poster.jpg','poster',async phase=>{if(phase==='body')throw denied;});owned.settlement.then(()=>{settled=true;});
 await expect(owned.completion).rejects.toBe(denied);await new Promise(r=>setTimeout(r,10));expect(settled).toBe(false);native.finishClose!();await owned.settlement;
});
