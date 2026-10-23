import {expect,it,vi} from 'vitest';
import {Readable} from 'node:stream';
import {fetchLinkPreviewDocument,fetchLinkPreviewImage,fetchLinkPreviewJson} from '../services/linkPreviewFetch';
type Route={status:number;location?:string;type?:string;body?:string|Buffer};
const deps=(routes:Record<string,Route>,seen:any[]=[])=>({
 resolve:async(h:string)=>[{address:h==='inside.example'?'10.0.0.1':'93.184.216.34',family:4}],
 connect:async(target:any)=>{seen.push(target);const r=routes[target.url.href];if(!r)throw new Error('no route '+target.url.href);return {status:r.status,location:r.location,contentType:r.type??'text/html; charset=utf-8',body:Readable.from([Buffer.from(r.body??'')])};}});
it('returns html under the cap',async()=>{expect((await fetchLinkPreviewDocument('https://a.example/',deps({'https://a.example/':{status:200,body:'<title>x</title>'}}))).html).toContain('<title>');});
it('refuses an https to http redirect downgrade',async()=>{
 await expect(fetchLinkPreviewDocument('https://a.example/',deps({'https://a.example/':{status:302,location:'http://a.example/plain'},'http://a.example/plain':{status:200,body:'<title>x</title>'}}))).rejects.toThrow('LINK_PREVIEW_BLOCKED');
});
it('re-guards every redirect hop (redirect into a private address is blocked)',async()=>{
 await expect(fetchLinkPreviewDocument('https://a.example/',deps({'https://a.example/':{status:302,location:'https://inside.example/'}}))).rejects.toThrow('LINK_PREVIEW_BLOCKED');
});
it('redirect to a literal private IP or internal name is blocked',async()=>{
 for(const location of ['http://169.254.169.254/latest/meta-data','https://127.0.0.1/','http://[::1]/','https://localhost/','https://intranet/'])
  await expect(fetchLinkPreviewDocument('https://a.example/',deps({'https://a.example/':{status:301,location}}))).rejects.toThrow('LINK_PREVIEW_BLOCKED');
});
it('relative Location resolves against the current URL and is re-guarded, pinning the new address',async()=>{
 const seen:any[]=[];
 const r=await fetchLinkPreviewDocument('https://a.example/x/y',deps({'https://a.example/x/y':{status:302,location:'../z'},'https://a.example/z':{status:200,body:'<title>z</title>'}},seen));
 expect(r.url).toBe('https://a.example/z');expect(seen.map(s=>s.url.href)).toEqual(['https://a.example/x/y','https://a.example/z']);
 expect(seen.every(s=>s.address.address==='93.184.216.34')).toBe(true);
});
it('sends no cookies and an owner-initiated user agent',async()=>{
 const seen:any[]=[];await fetchLinkPreviewDocument('https://a.example/',deps({'https://a.example/':{status:200,body:'<p>'}},seen));
 const headers=Object.fromEntries(Object.entries(seen[0].headers).map(([k,v])=>[k.toLowerCase(),v]));
 expect(headers.cookie).toBeUndefined();expect(headers['user-agent']).toBe('explorers-link-preview/1 (+owner-initiated)');
});
it('stops after 3 redirects',async()=>{const r:Record<string,any>={};for(let i=0;i<5;i++)r[`https://a.example/${i}`]={status:302,location:`https://a.example/${i+1}`};await expect(fetchLinkPreviewDocument('https://a.example/0',deps(r))).rejects.toThrow('LINK_PREVIEW_UNAVAILABLE');});
it('follows exactly 3 redirects',async()=>{const r:Record<string,any>={};for(let i=0;i<3;i++)r[`https://a.example/${i}`]={status:302,location:`https://a.example/${i+1}`};r['https://a.example/3']={status:200,body:'ok'};expect((await fetchLinkPreviewDocument('https://a.example/0',deps(r))).html).toBe('ok');});
it('refuses bodies over 1 MiB and non-html types',async()=>{
 await expect(fetchLinkPreviewDocument('https://a.example/',deps({'https://a.example/':{status:200,body:Buffer.alloc(1024*1024+1)}}))).rejects.toThrow('LINK_PREVIEW_UNAVAILABLE');
 await expect(fetchLinkPreviewDocument('https://a.example/',deps({'https://a.example/':{status:200,type:'application/pdf',body:'%PDF'}}))).rejects.toThrow('LINK_PREVIEW_UNAVAILABLE');
 await expect(fetchLinkPreviewDocument('https://a.example/',deps({'https://a.example/':{status:500,body:'x'}}))).rejects.toThrow('LINK_PREVIEW_UNAVAILABLE');
});
it('times out the whole operation',async()=>{
 vi.useFakeTimers();
 try{const p=fetchLinkPreviewDocument('https://a.example/',{resolve:async()=>[{address:'93.184.216.34',family:4}],connect:()=>new Promise(()=>{})});
  const assertion=expect(p).rejects.toThrow('LINK_PREVIEW_UNAVAILABLE');await vi.advanceTimersByTimeAsync(5001);await assertion;}finally{vi.useRealTimers();}
});
it('images: magic bytes must match the declared type; 5 MiB cap',async()=>{
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(8)]);
 expect((await fetchLinkPreviewImage('https://cdn.example/i.png',deps({'https://cdn.example/i.png':{status:200,type:'image/png',body:png}}))).mimeType).toBe('image/png');
 await expect(fetchLinkPreviewImage('https://cdn.example/i.png',deps({'https://cdn.example/i.png':{status:200,type:'image/jpeg',body:png}}))).rejects.toThrow('LINK_PREVIEW_UNAVAILABLE');
 await expect(fetchLinkPreviewImage('https://cdn.example/i.svg',deps({'https://cdn.example/i.svg':{status:200,type:'image/svg+xml',body:'<svg/>'}}))).rejects.toThrow('LINK_PREVIEW_UNAVAILABLE');
 await expect(fetchLinkPreviewImage('https://cdn.example/i.png',deps({'https://cdn.example/i.png':{status:200,type:'image/png',body:Buffer.concat([png,Buffer.alloc(5*1024*1024)])}}))).rejects.toThrow('LINK_PREVIEW_UNAVAILABLE');
});
it('json variant only reaches allowlisted hosts, including across redirects',async()=>{
 const d=deps({'https://itunes.apple.com/search?term=a':{status:200,type:'text/javascript; charset=utf-8',body:'{"resultCount":0}'},'https://itunes.apple.com/r':{status:302,location:'https://a.example/'}});
 expect(await fetchLinkPreviewJson('https://itunes.apple.com/search?term=a',['itunes.apple.com'],d)).toEqual({resultCount:0});
 await expect(fetchLinkPreviewJson('https://a.example/',['itunes.apple.com'],d)).rejects.toThrow('LINK_PREVIEW_BLOCKED');
 await expect(fetchLinkPreviewJson('https://itunes.apple.com/r',['itunes.apple.com'],d)).rejects.toThrow('LINK_PREVIEW_BLOCKED');
});
