import {describe,it,expect} from 'vitest';
import {PlacePhotoFetcher} from '../services/placePhotoFetch';
// The Places list cover is fetched by the API, not the browser: following Google's photo
// redirect in the browser lands on googleusercontent.com, which production CSP refuses.
// The browser sends only the key-free photoUri that skipHttpRedirect=true returns, so this
// is the boundary that decides which hosts the server will fetch for an owner.
const jpeg=Buffer.from([255,216,255,224,0,16]);
const url='https://lh3.googleusercontent.com/place-photos/AJnk2cz-abc_123=s4800-w400';
const fixture=(overrides:Record<string,unknown>={})=>new PlacePhotoFetcher({mode:'deterministic-fixture',resolve:async()=>[{address:'142.250.1.1',family:4}],connect:async()=>({status:200,mimeType:'image/jpeg',body:(async function*(){yield jpeg;})()}),...overrides} as any);
describe('Google place photo byte boundary',()=>{
 it.each(['https://lh3.googleusercontent.com/p/x','https://lh5.googleusercontent.com/p/x','https://lh6.googleusercontent.com/places/x=w400'])('fetches a Google photo host %s',async u=>{
  let target:any;const result=await fixture({connect:async(t:any)=>{target=t;return {status:200,mimeType:'image/jpeg',body:(async function*(){yield jpeg;})()};}}).fetch(u);
  expect(result).toEqual({bytes:jpeg,mimeType:'image/jpeg'});
  // Pinned to the vetted address, TLS still verified against the original host name.
  expect(target).toMatchObject({address:'142.250.1.1',family:4,servername:new URL(u).hostname});
 });
 it.each([
  'http://lh3.googleusercontent.com/p/x','https://lh3.googleusercontent.com:444/p/x','https://user@lh3.googleusercontent.com/p/x',
  'https://evil.example/p/x','https://lh3.googleusercontent.com.evil.example/p/x','https://googleusercontent.com/p/x',
  'https://storage.googleusercontent.com/p/x','https://lh7.googleusercontent.com/p/x',
  // The key-bearing provider URL is not a photo URI: the server holds no Maps key and
  // must never be handed one to replay.
  'https://places.googleapis.com/v1/places/x/photos/y/media?key=k','not a url',
 ])('rejects %s before DNS',async u=>{let resolutions=0;await expect(fixture({resolve:async()=>{resolutions++;return [];}}).fetch(u)).rejects.toThrow();expect(resolutions).toBe(0);});
 it('rejects an oversized URI before DNS',async()=>{let resolutions=0;await expect(fixture({resolve:async()=>{resolutions++;return [];}}).fetch(`${url}${'a'.repeat(2048)}`)).rejects.toThrow();expect(resolutions).toBe(0);});
 it('rejects a private answer before connecting',async()=>{let calls=0;await expect(fixture({resolve:async()=>[{address:'142.250.1.1',family:4},{address:'10.0.0.1',family:4}],connect:async()=>{calls++;throw Error();}}).fetch(url)).rejects.toThrow();expect(calls).toBe(0);});
 it('denies redirects',async()=>{await expect(fixture({connect:async()=>({status:302,mimeType:'image/jpeg',body:(async function*(){yield jpeg;})()})}).fetch(url)).rejects.toThrow();});
 it('denies a non-image type',async()=>{await expect(fixture({connect:async()=>({status:200,mimeType:'text/html',body:(async function*(){yield Buffer.from('<html>');})()})}).fetch(url)).rejects.toThrow();});
 it('denies bytes that do not match the declared type',async()=>{await expect(fixture({connect:async()=>({status:200,mimeType:'image/png',body:(async function*(){yield jpeg;})()})}).fetch(url)).rejects.toThrow();});
 it('denies a declared length over the cover limit',async()=>{await expect(fixture({connect:async()=>({status:200,mimeType:'image/jpeg',length:5*1024*1024+1,body:(async function*(){yield jpeg;})()})}).fetch(url)).rejects.toThrow();});
 it('cancels a streamed overflow',async()=>{let stopped=false;await expect(fixture({connect:async()=>({status:200,mimeType:'image/jpeg',body:(async function*(){try{yield Buffer.alloc(5*1024*1024+1);}finally{stopped=true;}})()})}).fetch(url)).rejects.toThrow();expect(stopped).toBe(true);});
 it('bounds a stalled body and aborts the transport',async()=>{let signal:AbortSignal|undefined;await expect(fixture({deadlineMs:20,connect:async(t:any)=>{signal=t.signal;return {status:200,mimeType:'image/jpeg',body:{[Symbol.asyncIterator]:()=>({next:()=>new Promise(()=>{})})}};}}).fetch(url)).rejects.toThrow();expect(signal?.aborted).toBe(true);});
});
