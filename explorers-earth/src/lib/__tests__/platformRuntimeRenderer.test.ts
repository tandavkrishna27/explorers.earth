// @ts-expect-error Node-only renderer has no browser declaration.
import { renderRuntimeFiles } from '../../../scripts/render-platform-runtime.mjs';
import {describe,it,expect} from 'vitest';
const config = {version:1,environment:'qa',origin:'https://qa.example',apiPath:'/api',socketPath:'/socket.io',analytics:{enabled:false}};
const html = '<html><head><title>App</title></head><body><script type="module" src="/assets/bootstrap-hash.js"></script></body></html>';
describe('immutable image runtime files',()=>{
  it('renders QA noindex and no sitemap URLs without modifying assets',()=>{
    const files=renderRuntimeFiles(config,html);
    expect(JSON.parse(files['runtime-config.json'])).toEqual(config);
    expect(files['index.html']).toContain('noindex,nofollow');
    expect(files['index.html']).toContain('https://qa.example/');
    expect(files['index.html']).toContain('/assets/bootstrap-hash.js');
    expect(files['robots.txt']).toContain('Disallow: /');
    expect(files['sitemap.xml']).not.toContain('<loc>');
    expect(files['headers.conf']).toContain('X-Robots-Tag "noindex,nofollow"');
    expect(files['headers.conf']).toContain("connect-src 'self'");
    expect(files['headers.conf']).not.toContain('googletagmanager');
  });
  it('uses validated production origin and explicit consent-dependent vendor allowlist',()=>{
    const files=renderRuntimeFiles({...config,environment:'production',origin:'https://prod.example',analytics:{enabled:true,identifier:'G-ABCDE'}},html);
    expect(files['robots.txt']).toContain('https://prod.example/sitemap.xml');
    expect(files['sitemap.xml']).toContain('https://prod.example/about');
    expect(files['sitemap.xml']).not.toContain('/login');
    expect(files['headers.conf']).toContain('https://www.googletagmanager.com');
    expect(files['headers.conf']).not.toContain('clarity.ms');
  });
  it('rejects unknown/server config instead of serializing values',()=>expect(()=>renderRuntimeFiles({...config,AWS_SECRET_ACCESS_KEY:'SENTINEL'},html)).toThrow('PUBLIC_RUNTIME_CONFIG_INVALID'));
});
