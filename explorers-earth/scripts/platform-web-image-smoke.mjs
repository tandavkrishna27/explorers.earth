// Local immutable-web qualification only. No release authority, API fixture or
// registry/deployment action. Every container/port/file belongs to this run.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer as createHttpsServer} from 'node:https';
import {request} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {chromium} from 'playwright';
const image=process.argv[2];
if(!/^sha256:[a-f0-9]{64}$/.test(image??''))throw new Error('LOCAL_IMAGE_ID_REQUIRED');
const root=mkdtempSync(join(tmpdir(),'platform-web-smoke-'));
const prefix='platform-web-smoke-'+randomUUID();
const containers=new Set();
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const hashes=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?hashes(join(directory,entry.name)):[[entry.name,createHash('sha256').update(readFileSync(join(directory,entry.name))).digest('hex')]]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
let browser;
const results=[];
try{
  const id=docker('create','--name',prefix+'-extract',image);containers.add(id);
  docker('cp',id+':/opt/platform-runtime',root);
  docker('cp',id+':/usr/share/nginx/html',join(root,'html'));
  const before=hashes(join(root,'html'));
  const cert=join(root,'cert.pem'),key=join(root,'key.pem');
  execFileSync(process.env.PLATFORM_SMOKE_OPENSSL??'openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{stdio:'ignore'});
  browser=await chromium.launch({headless:true});
  for(const environment of ['qa','production']){
    let upstreamPort;
    const tls=createHttpsServer({key:readFileSync(key),cert:readFileSync(cert)},(incoming,outgoing)=>{
      if(!upstreamPort){outgoing.writeHead(503).end();return;}
      const proxy=request({host:'127.0.0.1',port:upstreamPort,path:incoming.url,method:incoming.method,headers:incoming.headers},response=>{outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);});
      proxy.on('error',()=>{outgoing.writeHead(502).end();});incoming.pipe(proxy);
    });
    await new Promise((resolve,reject)=>{tls.once('error',reject);tls.listen(0,'127.0.0.1',resolve);});
    const origin='https://localhost:'+tls.address().port;
    const input=join(root,environment+'.json'),output=join(root,environment);
    writeFileSync(input,JSON.stringify({version:1,environment,origin,apiPath:'/api',socketPath:'/socket.io',analytics:{enabled:false}}));
    execFileSync(process.execPath,[join(root,'platform-runtime/scripts/render-platform-runtime.mjs'),input,join(root,'html/index.html'),output],{stdio:'pipe'});
    let context;
    try{
      const cid=docker('run','-d','--name',prefix+'-'+environment,'-p','127.0.0.1::80','--mount',`type=bind,source=${resolve(output)},target=/runtime-web,readonly`,image);containers.add(cid);
      const port=docker('port',cid,'80/tcp');upstreamPort=Number(port.split(':').at(-1));
      docker('exec',cid,'nginx','-t');
      context=await browser.newContext({ignoreHTTPSErrors:true});
      const get=path=>context.request.get(origin+path);
      const html=await get('/');const config=await get('/runtime-config.json');const robots=await get('/robots.txt');const sitemap=await get('/sitemap.xml');
      if(html.status()!==200 || (await config.json()).origin!==origin || config.headers()['cache-control']!=='no-store')throw new Error('RUNTIME_HTTP_FAILURE');
      if(environment==='qa' && (html.headers()['x-robots-tag']!=='noindex,nofollow'||!(await robots.text()).includes('Disallow: /')||(await sitemap.text()).includes('<loc>')))throw new Error('QA_INDEXING_FAILURE');
      if(environment==='production' && !(await sitemap.text()).includes(origin+'/about'))throw new Error('PRODUCTION_METADATA_FAILURE');
      if((await get('/api/auth/get-session')).status()!==503||(await get('/graphql')).status()!==503)throw new Error('LEGACY_FALLBACK_FAILURE');
      const page=await context.newPage();const external=[];const errors=[];
      page.on('pageerror',()=>errors.push('PAGE_ERROR'));
      page.on('requestfailed',req=>errors.push(new URL(req.url()).pathname+':'+req.failure()?.errorText));
      page.on('console',message=>{if(message.type()==='error')errors.push('CONSOLE_ERROR');});
      await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){const host=new URL(route.request().url()).origin;external.push({host,type:route.request().resourceType()});return route.request().resourceType()==='image'?route.continue():route.abort();}return route.continue();});
      await page.goto(origin+'/login');
      try { await page.waitForFunction(()=>document.querySelector('#root')?.childElementCount>0 || document.querySelector('#root')?.getAttribute('role')==='alert'); }
      catch { throw new Error('BOOTSTRAP_RENDER_TIMEOUT:'+JSON.stringify({errors})); }
      if(await page.locator('#root').getAttribute('role')==='alert')throw new Error('BOOTSTRAP_FAILURE');
      const clientRequests=external.filter(({host,type})=>!['https://fonts.googleapis.com','https://fonts.gstatic.com'].includes(host)&&type!=='image');
      if(clientRequests.length)throw new Error('UNEXPECTED_EXTERNAL_CLIENT_TRAFFIC:'+JSON.stringify(clientRequests));
      const canonical=await page.locator('link[rel=canonical]').last().getAttribute('href');
      if(!canonical?.startsWith(origin))throw new Error('CANONICAL_FAILURE');
      const deniedFontRequests=external.filter(({host})=>['https://fonts.googleapis.com','https://fonts.gstatic.com'].includes(host)).length;
      if(deniedFontRequests===0)throw new Error('FONT_DENIAL_NOT_EXERCISED');
      results.push({environment,origin,image,metadata:'pass',bootstrap:'pass',legacyFallback:'denied',externalClientTraffic:0,deniedFontRequests,publicAssetOrigins:[...new Set(external.filter(({type})=>type==='image').map(({host})=>host))]});
    }finally{await context?.close();await new Promise(resolve=>tls.close(resolve));}
  }
  if(JSON.stringify(before)!==JSON.stringify(hashes(join(root,'html'))))throw new Error('ASSET_MUTATION');
  writeFileSync(join(root,'receipt.json'),JSON.stringify({version:1,image,results,assetHashes:before,claim:'local static runtime only; API, real Google, storage and deployed acceptance pending'},null,2));
}finally{
  await browser?.close();
  for(const id of containers){docker('rm','-f',id);let exists=false;try{docker('inspect',id);exists=true;}catch{}if(exists)throw new Error('OWNED_CONTAINER_CLEANUP_FAILED');}
}

process.stdout.write(JSON.stringify({status:'PASS',image,environments:results.length,cleanup:'verified',receipt:join(root,'receipt.json')})+'\n');
