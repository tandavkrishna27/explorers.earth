import {readdirSync,readFileSync,statSync} from 'node:fs';import {join,relative} from 'node:path';
import express from 'express';import request from 'supertest';import {describe,expect,it,vi} from 'vitest';
import {registerLinkPreviewRoutes} from '../routes/explorersCatalogRoutes';
import {createLinkPreviewService,LinkPreviewRateLimited,LinkPreviewService} from '../application/linkPreview';
const app=(service:any)=>{const a=express();a.use(express.json());registerLinkPreviewRoutes(a,{baseURL:'https://app.example',resolveActor:async()=>({accountId:'a1'}) as never,service});return a;};
const preview={url:'https://x.example',title:'t',description:null,imageUrl:null,siteName:null,product:null,person:null};
it('POST only, trusted origin only, no-store',async()=>{
 const service={preview:vi.fn().mockResolvedValue(preview)};
 const ok=await request(app(service)).post('/api/explorers/v1/catalog/link-preview').set('origin','https://app.example').send({url:'https://x.example'});
 expect(ok.status).toBe(200);expect(ok.headers['cache-control']).toBe('no-store');expect(ok.body.preview).toEqual(preview);
 expect((await request(app(service)).post('/api/explorers/v1/catalog/link-preview').set('origin','https://evil.example').send({url:'https://x.example'})).status).toBe(403);
 expect((await request(app(service)).post('/api/explorers/v1/catalog/link-preview').send({url:'https://x.example'})).status).toBe(403);
 expect((await request(app(service)).get('/api/explorers/v1/catalog/link-preview?url=https://x.example')).status).toBe(405);
 expect(service.preview).toHaveBeenCalledTimes(1);
});
it('the URL is never accepted from the query string',async()=>{
 const service={preview:vi.fn().mockResolvedValue(preview)};
 const r=await request(app(service)).post('/api/explorers/v1/catalog/link-preview?url=https://x.example').set('origin','https://app.example').send({url:'https://x.example'});
 expect(r.status).toBe(422);expect(service.preview).not.toHaveBeenCalled();
});
it('blocked target maps to 422 LINK_PREVIEW_BLOCKED, failure to 200 with nulls is NOT done (502 LINK_PREVIEW_UNAVAILABLE)',async()=>{
 const blocked=await request(app({preview:vi.fn().mockRejectedValue(new Error('LINK_PREVIEW_BLOCKED'))})).post('/api/explorers/v1/catalog/link-preview').set('origin','https://app.example').send({url:'https://x.example'});
 expect(blocked.status).toBe(422);expect(blocked.body.error.code).toBe('LINK_PREVIEW_BLOCKED');
 const down=await request(app({preview:vi.fn().mockRejectedValue(new Error('LINK_PREVIEW_UNAVAILABLE'))})).post('/api/explorers/v1/catalog/link-preview').set('origin','https://app.example').send({url:'https://x.example'});
 expect(down.status).toBe(502);expect(down.body.error.code).toBe('LINK_PREVIEW_UNAVAILABLE');
 const limited=await request(app({preview:vi.fn().mockRejectedValue(new LinkPreviewRateLimited(12))})).post('/api/explorers/v1/catalog/link-preview').set('origin','https://app.example').send({url:'https://x.example'});
 expect(limited.status).toBe(429);expect(limited.headers['retry-after']).toBe('12');
});
it('image import needs origin and Idempotency-Key; apps search is GET with no-store',async()=>{
 const service={importImage:vi.fn().mockResolvedValue({id:'m1'}),searchApps:vi.fn().mockResolvedValue([])};
 const path='/api/explorers/v1/catalog/link-preview/image';
 expect((await request(app(service)).post(path).set('origin','https://app.example').send({imageUrl:'https://cdn.example/i.png'})).status).toBe(422);
 const ok=await request(app(service)).post(path).set('origin','https://app.example').set('Idempotency-Key','k-1234567890').send({imageUrl:'https://cdn.example/i.png'});
 expect(ok.status).toBe(201);expect(ok.body.media).toEqual({id:'m1'});expect(ok.headers['cache-control']).toBe('no-store');
 expect((await request(app(service)).post(path).set('origin','https://evil.example').set('Idempotency-Key','k').send({})).status).toBe(403);
 const apps=await request(app(service)).get('/api/explorers/v1/catalog/apps?query=notion&country=IN');
 expect(apps.status).toBe(200);expect(apps.headers['cache-control']).toBe('no-store');expect(service.searchApps).toHaveBeenCalledWith({accountId:'a1'},{query:'notion',country:'IN'});
 expect((await request(app(service)).delete('/api/explorers/v1/catalog/apps')).status).toBe(405);
});
describe('per-actor rate limits',()=>{
 const pool={query:vi.fn().mockResolvedValue({rows:[]})} as any;
 it('30 previews per minute per actor, 20 apple searches per minute per actor',async()=>{
  let now=0;const service=new LinkPreviewService(pool,{} as never,{now:()=>now,authorize:async()=>{},fetch:{resolve:async()=>[{address:'93.184.216.34',family:4}],connect:async()=>{throw new Error('down');}},appleGet:async()=>({results:[]})});
  const actor={accountId:'a1'} as never,other={accountId:'a2'} as never;
  for(let i=0;i<30;i++)await expect(service.preview(actor,{url:'https://x.example/'})).rejects.toThrow('LINK_PREVIEW_UNAVAILABLE');
  await expect(service.preview(actor,{url:'https://x.example/'})).rejects.toBeInstanceOf(LinkPreviewRateLimited);
  await expect(service.preview(other,{url:'https://x.example/'})).rejects.toThrow('LINK_PREVIEW_UNAVAILABLE');
  for(let i=0;i<20;i++)await service.searchApps(actor,{query:'n'});
  await expect(service.searchApps(actor,{query:'n'})).rejects.toBeInstanceOf(LinkPreviewRateLimited);
  now=60_001;await expect(service.preview(actor,{url:'https://x.example/'})).rejects.toThrow('LINK_PREVIEW_UNAVAILABLE');
 });
});
describe('allowLoopbackForTest never reaches production wiring',()=>{
 it('the production factory leaves it off',()=>{expect(createLinkPreviewService({} as never).loopbackAllowedForTest).toBe(false);});
 it('no production source sets it; only the guard, fetch and service plumbing name it',()=>{
  const root=join(__dirname,'..'),hits:string[]=[];
  const walk=(dir:string)=>{for(const name of readdirSync(dir)){const p=join(dir,name);if(name==='test'||name==='node_modules')continue;if(statSync(p).isDirectory())walk(p);else if(/\.(ts|mjs|js)$/.test(name)&&readFileSync(p,'utf8').includes('allowLoopbackForTest'))hits.push(relative(root,p).replaceAll('\\','/'));}};
  walk(root);
  expect(hits.sort()).toEqual(['application/linkPreview.ts','services/linkPreviewFetch.ts','services/linkPreviewGuard.ts']);
  for(const f of hits)expect(readFileSync(join(root,f),'utf8')).not.toMatch(/allowLoopbackForTest\s*:\s*true/);
 });
});
