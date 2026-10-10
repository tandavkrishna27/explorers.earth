import type {RequestHandler} from 'express';

type SessionAuth={handler:(request:globalThis.Request)=>Promise<globalThis.Response>};
/** Fixture-only transport for the actual canonical session handler. No body pump is detached. */
export function createCanonicalSessionNodeHandler(auth:SessionAuth,origin:string):RequestHandler {
 if(!/^http:\/\/127\.0\.0\.1:[1-9]\d{3,4}$/.test(origin)||Number(new URL(origin).port)<1024||Number(new URL(origin).port)>65535)throw Error('Canonical session transport failed');
 return async(request,response)=>{
  if(request.method!=='GET'||request.originalUrl!=='/api/auth/get-session'||request.aborted)throw Error('Canonical session transport failed');
  const abort=new AbortController();let failed=false,finished=false,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  let cancellation:Promise<void>|undefined;let wake:(()=>void)|undefined;
  const stop=()=>{failed=true;abort.abort();if(reader&&!cancellation)cancellation=reader.cancel().then(()=>{},()=>{failed=true;});wake?.();};
  const closed=()=>{if(!finished)stop();};
  const finish=()=>{finished=true;wake?.();};
  request.once('aborted',stop);request.once('error',stop);response.once('close',closed);response.once('error',stop);response.once('finish',finish);
  try {
   const headers=new Headers();for(const [name,value] of Object.entries(request.headers))if(value!==undefined){if(Array.isArray(value))for(const item of value)headers.append(name,item);else headers.set(name,value);}
   const actual=await auth.handler(new globalThis.Request(`${origin}/api/auth/get-session`,{method:'GET',headers,signal:abort.signal}));
   if(actual.body)reader=actual.body.getReader();
   if(failed){stop();throw Error();}
   response.statusCode=actual.status;
   for(const [name,value] of actual.headers)if(name!=='set-cookie')response.setHeader(name,value);
   const cookies=actual.headers.getSetCookie();if(cookies.length)response.setHeader('set-cookie',cookies);
   if(reader){
    for(;;){const item=await reader.read();if(failed)throw Error();if(item.done)break;
     if(!response.write(item.value))await new Promise<void>(resolve=>{const drained=()=>{response.off('drain',drained);wake=undefined;resolve();};wake=drained;response.once('drain',drained);if(failed)drained();});
     if(failed)throw Error();
    }
   }
   response.end();if(!finished)await new Promise<void>(resolve=>{wake=resolve;if(finished||failed)resolve();});
   if(failed||!finished)throw Error();
  }catch{stop();throw Error('Canonical session transport failed');}
  finally {
   // Cancellation can itself remain pending; the original handler promise retains it.
   if(cancellation)await cancellation;
   reader?.releaseLock();wake=undefined;
   request.off('aborted',stop);request.off('error',stop);response.off('close',closed);response.off('error',stop);response.off('finish',finish);
  }
 };
}
