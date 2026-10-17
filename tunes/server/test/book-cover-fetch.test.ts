import {describe,it,expect} from 'vitest';
import {BookCoverFetcher,publicAddress} from '../services/bookCoverFetch';
const png=Buffer.from([137,80,78,71,13,10,26,10,1]);
const url='https://books.google.com/books/content?id=canonical';
const fixture=(overrides:Record<string,unknown>={})=>new BookCoverFetcher({mode:'deterministic-fixture',resolve:async()=>[{address:'142.250.1.1',family:4}],connect:async()=>({status:200,mimeType:'image/png',body:(async function*(){yield png;})()}),...overrides} as any);
describe('trusted Book cover byte boundary',()=>{
 it.each(['127.0.0.1','10.0.0.1','172.16.1.1','192.168.1.1','169.254.1.1','100.64.0.1','192.0.2.1','192.88.99.1','198.51.100.1','203.0.113.1','224.1.1.1','0.0.0.0','::1','::','fc00::1','fe80::1','::ffff:142.250.1.1','2001:db8::1'])('rejects reserved address %s',ip=>expect(publicAddress(ip)).toBe(false));
 it.each(['142.250.1.1','2607:f8b0:4004:800::200e'])('allows public address %s',ip=>expect(publicAddress(ip)).toBe(true));
 it.each(['http://books.google.com/a','https://books.google.com:444/a','https://user@books.google.com/a','https://evil.example/a','https://books.google.com.evil.example/a'])('rejects URL before DNS %s',async u=>{let resolutions=0;await expect(fixture({resolve:async()=>{resolutions++;return [];}}).fetch(u)).rejects.toThrow();expect(resolutions).toBe(0);});
 it('rejects mixed answers before connection',async()=>{let calls=0;await expect(fixture({resolve:async()=>[{address:'142.250.1.1',family:4},{address:'127.0.0.1',family:4}],connect:async()=>{calls++;throw Error();}}).fetch(url)).rejects.toThrow();expect(calls).toBe(0);});
 it('passes pinned IP and original TLS hostname to fixture transport',async()=>{let target:any;const result=await fixture({connect:async(t:any)=>{target=t;return {status:200,mimeType:'image/png',body:(async function*(){yield png;})()};}}).fetch(url);expect(target).toMatchObject({address:'142.250.1.1',family:4,servername:'books.google.com'});expect(result).toEqual({bytes:png,mimeType:'image/png'});});
 it('denies redirect responses',async()=>{await expect(fixture({connect:async()=>({status:302,mimeType:'image/png',body:(async function*(){yield png;})()})}).fetch(url)).rejects.toThrow();});
 it('denies mismatched MIME',async()=>{await expect(fixture({connect:async()=>({status:200,mimeType:'image/jpeg',body:(async function*(){yield png;})()})}).fetch(url)).rejects.toThrow();});
 it('cancels streamed overflow',async()=>{let stopped=false;await expect(fixture({connect:async()=>({status:200,mimeType:'image/png',body:(async function*(){try{yield Buffer.alloc(5*1024*1024+1);}finally{stopped=true;}})()})}).fetch(url)).rejects.toThrow();expect(stopped).toBe(true);});
 it('bounds DNS deadline',async()=>{await expect(fixture({deadlineMs:20,resolve:()=>new Promise(()=>{})}).fetch(url)).rejects.toThrow();});
 it('bounds stalled body deadline and aborts transport',async()=>{let signal:AbortSignal|undefined;await expect(fixture({deadlineMs:20,connect:async(t:any)=>{signal=t.signal;return {status:200,mimeType:'image/png',body:{[Symbol.asyncIterator]:()=>({next:()=>new Promise(()=>{})})}};}}).fetch(url)).rejects.toThrow();expect(signal?.aborted).toBe(true);});
});
