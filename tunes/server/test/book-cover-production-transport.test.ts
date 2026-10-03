import {it,expect,vi} from 'vitest';
import {Readable} from 'node:stream';
const sockets=vi.hoisted(()=>({options:null as any}));
vi.mock('node:dns/promises',()=>({lookup:async()=>[{address:'142.250.1.1',family:4}]}));
vi.mock('node:https',()=>({request:(_url:any,options:any,respond:any)=>{sockets.options=options;const req={on:()=>req,end:()=>{const res=Readable.from([Buffer.from([137,80,78,71,13,10,26,10,1])]) as any;res.statusCode=200;res.headers={'content-type':'image/png'};respond(res);}};return req;}}));
import {BookCoverFetcher} from '../services/bookCoverFetch';
it('default HTTPS socket uses one validated IP, original hostname verification and no alternate address selection',async()=>{
 await new BookCoverFetcher().fetch('https://books.google.com/books/content?id=canonical');
 expect(sockets.options).toMatchObject({agent:false,rejectUnauthorized:true,servername:'books.google.com',family:4,autoSelectFamily:false});
 let pin:any[]=[];sockets.options.lookup('books.google.com',{},(...v:any[])=>pin=v);expect(pin).toEqual([null,'142.250.1.1',4]);
});
