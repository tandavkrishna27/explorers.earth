import { parsePublicRuntimeConfig } from '../src/lib/publicRuntimeContract.ts';
import { readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export function renderRuntimeFiles(input, template) {
  const config = parsePublicRuntimeConfig(input);
  if (typeof template !== 'string' || template.length > 1024*1024 || !template.includes('</head>')) throw new Error('PUBLIC_RUNTIME_TEMPLATE_INVALID');
  const qa = config.environment === 'qa';
  const escaped = config.origin.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const canonical = `<link rel="canonical" href="${escaped}/" /><meta name="robots" content="${qa ? 'noindex,nofollow':'index,follow'}" />`;
  const origin = config.origin;
  const maps = config.mapsBrowserKey ? ' https://maps.googleapis.com https://maps.gstatic.com https://places.googleapis.com' : '';
  const analytics = config.analytics?.enabled ? ' https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com' : '';
  const csp = `default-src 'self'; script-src 'self'${maps}${analytics}; connect-src 'self'${maps}${analytics}; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; media-src 'self' blob: https:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'`;
  return {
    'runtime-config.json':JSON.stringify(config),
    'index.html':template.replace('</head>',canonical+'</head>'),
    'robots.txt':qa ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nDisallow: /api/\nDisallow: /settings\nDisallow: /onboarding\nSitemap: ${origin}/sitemap.xml\n`,
    'sitemap.xml':`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${qa?'':['/','/about','/use-cases','/contact','/privacy','/terms','/cookies'].map(path=>`<url><loc>${escaped}${path}</loc></url>`).join('')}</urlset>`,
    'headers.conf':`add_header X-Content-Type-Options "nosniff" always;\nadd_header Referrer-Policy "strict-origin-when-cross-origin" always;\nadd_header Content-Security-Policy "${csp}" always;\n${qa?'add_header X-Robots-Tag "noindex,nofollow" always;\n':''}`,
  };
}
function readBounded(path,max) {
  const info=lstatSync(path);
  if(!info.isFile()||info.isSymbolicLink()||info.size>max)throw new Error('PUBLIC_RUNTIME_INPUT_INVALID');
  return readFileSync(path,'utf8');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if(process.argv.length!==5)throw new Error('PUBLIC_RUNTIME_ARGUMENTS_INVALID');
    const [input,template,output]=process.argv.slice(2);
    const files=renderRuntimeFiles(JSON.parse(readBounded(input,4096)),readBounded(template,1024*1024));
    mkdirSync(output,{recursive:true});
    if(!lstatSync(output).isDirectory()||lstatSync(output).isSymbolicLink())throw new Error('PUBLIC_RUNTIME_OUTPUT_INVALID');
    for(const [name,contents] of Object.entries(files))writeFileSync(join(output,name),contents,{flag:'wx',mode:0o644});
  } catch { process.stderr.write('Public runtime generation failed\n');process.exitCode=1; }
}
