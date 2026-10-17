import {describe,it,expect} from 'vitest';
import express from 'express';
import request from 'supertest';
import {setupExplorersMediaRoutes} from '../../routes/explorersMediaRoutes';

describe('actual Express canonical media denial',()=>{
 it('preserves authorized object validators and range responses',async()=>{
  const app=express();const hash='a'.repeat(64);
  setupExplorersMediaRoutes(app,{} as any,{} as any,{} as any,{resolveMediaContent:async()=>({sha256:hash,mimeType:'image/png',length:4,bytes:Buffer.from([1,2,3,4]),publicAttachment:true})} as any);
  const url='/api/explorers/v1/media/11111111-1111-4111-8111-111111111111/content';
  const conditional=await request(app).get(url).set('If-None-Match',`"${hash}"`);expect(conditional.status).toBe(304);expect(conditional.headers.etag).toBe(`"${hash}"`);
  const partial=await request(app).get(url).set('Range','bytes=1-2');expect(partial.status).toBe(206);expect(partial.body).toEqual(Buffer.from([2,3]));expect(partial.headers.etag).toBe(`"${hash}"`);
 });
 it.each([
  ['GET',{}],['HEAD',{}],['GET',{'If-None-Match':'"previous-private-hash"'}],
  ['GET',{Range:'bytes=0-2'}],['HEAD',{Range:'bytes=0-2','If-None-Match':'"previous-private-hash"'}],
 ] as const)('denied %s has no validator or media bytes (%j)',async(method,headers)=>{
  const app=express();let resolved=0;
  setupExplorersMediaRoutes(app,{} as any,{} as any,{} as any,{resolveMediaContent:async()=>{resolved++;throw Error('PRIVATE_MEDIA_BYTES');}} as any);
  const response=await (method==='HEAD'?request(app).head('/api/explorers/v1/media/11111111-1111-4111-8111-111111111111/content'):request(app).get('/api/explorers/v1/media/11111111-1111-4111-8111-111111111111/content')).set(headers);
  expect(resolved).toBe(1);expect(response.status).toBe(404);expect(response.headers['cache-control']).toBe('no-store');expect(response.headers.etag).toBeUndefined();expect(response.headers['content-range']).toBeUndefined();
  if(method==='GET'){expect(response.body.error.code).toBe('NOT_FOUND');expect(response.text).not.toContain('PRIVATE_MEDIA_BYTES');}else expect(response.text??'').toBe('');
 });
});
