import {createHmac,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';import {mkdtemp,rm} from 'node:fs/promises';
import {createServer,type Server} from 'node:http';import type {AddressInfo} from 'node:net';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import pg from 'pg';import request from 'supertest';import {afterAll,beforeAll,expect,it} from 'vitest';
import {createCanonicalApp} from '../../auth/canonicalApp';import {resolveExplorersAuthConfig} from '../../auth/betterAuth';
import {LinkPreviewService} from '../../application/linkPreview';import {MediaService} from '../../application/media';
import {connectPinned} from '../../services/linkPreviewFetch';import {LocalObjectStorage} from '../../services/objectStorage';

/**
 * WP8. Owner-initiated link preview through the real HTTP surface on PostgreSQL. The pasted
 * page is served by a local http server on 127.0.0.1; the test reaches it only through the
 * resolver seam (shop.example -> 127.0.0.1), the test-only loopback allowance on the guard,
 * and a port remap around the real pinned connector. Literal loopback URLs stay blocked.
 */
const config=resolveExplorersAuthConfig({EXPLORERS_PUBLIC_ORIGIN:'http://127.0.0.1:51645',EXPLORERS_AUTH_SECRET:'link-preview-integration-'.repeat(4),GOOGLE_CLIENT_ID:'fixture-only',GOOGLE_CLIENT_SECRET:'fixture-only'});
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(32,1)]);
let admin:pg.Pool,app:ReturnType<typeof createCanonicalApp>,server:Server,root:string;
beforeAll(async()=>{
 const page=readFileSync(join(__dirname,'../fixtures/link-preview/product-jsonld.html'));
 server=createServer((req,res)=>{
  if(req.headers.cookie){res.writeHead(400).end();return;}
  if(req.url==='/p'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(page);return;}
  if(req.url==='/i.png'){res.writeHead(200,{'content-type':'image/png'}).end(png);return;}
  res.writeHead(404).end();
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=(server.address() as AddressInfo).port;
 admin=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:4});
 root=await mkdtemp(join(tmpdir(),'link-preview-media-'));const storage=new LocalObjectStorage(root);
 const linkPreviewService=new LinkPreviewService(admin,new MediaService(admin,storage),{fetch:{
  resolve:async host=>host==='shop.example'||host==='cdn.example'?[{address:'127.0.0.1',family:4}]:[],
  connect:target=>connectPinned({...target,port}),
  allowLoopbackForTest:true,
 }});
 app=createCanonicalApp(admin,config,{mediaStorage:storage,linkPreviewService});
});
afterAll(async()=>{await admin?.end();await new Promise(r=>server?.close(r));if(root)await rm(root,{recursive:true,force:true});});
async function persona(){const userId='link-preview-'+randomUUID();await admin.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Link owner',$2)",[userId,userId+'@example.invalid']);await admin.query("INSERT INTO auth_account(id,account_id,provider_id,user_id,updated_at) VALUES($1,$2,'google',$3,now())",[randomUUID(),'google-'+userId,userId]);const context=await app.auth.$context,session=await context.internalAdapter.createSession(userId,false);const cookie=`${context.authCookies.sessionToken.name}=${session.token}.${createHmac('sha256',config.secret).update(session.token).digest('base64')}`;const me=await request(app.app).get('/api/explorers/v1/me').set('cookie',cookie);expect(me.status).toBe(200);return {userId,accountId:me.body.account.id as string,cookie};}
const post=(owner:{cookie:string},path:string,body:object,key?:string)=>{const r=request(app.app).post('/api/explorers/v1/catalog'+path).set('cookie',owner.cookie).set('origin',config.baseURL);return (key?r.set('Idempotency-Key',key):r).send(body);};

it('prefills a product from a pasted link',async()=>{
 const a=await persona();
 const reply=await post(a,'/link-preview',{url:'http://shop.example/p'});
 expect(reply.status,JSON.stringify(reply.body)).toBe(200);expect(reply.headers['cache-control']).toBe('no-store');
 expect(reply.body.preview).toMatchObject({url:'http://shop.example/p',title:'Trail Shoe',siteName:'Example Store',imageUrl:'https://cdn.example/shoe-1.jpg',product:{name:'Trail Shoe',brand:'Acme',price:'119.90',currencyCode:'EUR'}});
});
it('a literal loopback URL is blocked even with the test loopback allowance',async()=>{
 const a=await persona();
 for(const url of ['https://127.0.0.1/','http://127.0.0.1/p','http://[::1]/p','http://localhost/p']){
  const reply=await post(a,'/link-preview',{url});expect(reply.status,url).toBe(422);expect(reply.body.error.code).toBe('LINK_PREVIEW_BLOCKED');
 }
 // A host the resolver does not map resolves to nothing and is blocked too.
 expect((await post(a,'/link-preview',{url:'http://other.example/p'})).status).toBe(422);
});
it('unauthenticated and cross-origin calls are refused',async()=>{
 expect((await request(app.app).post('/api/explorers/v1/catalog/link-preview').set('origin',config.baseURL).send({url:'http://shop.example/p'})).status).toBe(401);
 const a=await persona();
 expect((await request(app.app).post('/api/explorers/v1/catalog/link-preview').set('cookie',a.cookie).set('origin','https://evil.example').send({url:'http://shop.example/p'})).status).toBe(403);
});
it('image import creates a media_assets row owned by the actor',async()=>{
 const a=await persona();
 const reply=await post(a,'/link-preview/image',{imageUrl:'http://cdn.example/i.png'},'link-preview-'+randomUUID());
 expect(reply.status,JSON.stringify(reply.body)).toBe(201);
 const row=(await admin.query('SELECT account_id,purpose,status,mime_type,byte_size FROM media_assets WHERE id=$1',[reply.body.media.id])).rows[0];
 expect(row).toMatchObject({account_id:a.accountId,purpose:'recommendation',status:'ready',mime_type:'image/png'});expect(Number(row.byte_size)).toBe(png.length);
});
