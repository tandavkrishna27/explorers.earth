// Read-only GitHub source inspection. Stores schema evidence, never environment files.
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const repo = 'MeteoriteLabs/localqr-strapi-v2';
const ref = '50b6c6e180de4a1290b0c0a3c8450ac5947566d5';
const gh = args => new Promise((resolve,reject)=>cp.execFile('gh',args,{maxBuffer:8*1024*1024},(error,stdout)=>error?reject(error):resolve(stdout)));
(async()=>{
 const tree = JSON.parse(await gh(['api',`repos/${repo}/git/trees/${ref}?recursive=1`]));
 const paths=tree.tree.filter(x=>x.type==='blob'&&(/schema\.json$/.test(x.path)||/^src\/api\/.*\/(controllers|routes|services)\/.*\.ts$/.test(x.path)||['package.json','src/index.ts','config/plugins.ts','config/api.ts','config/middlewares.ts','Dockerfile','.github/workflows/main.yml'].includes(x.path))).map(x=>x.path);
 const schemas=[], implementation=[]; let cursor=0;
 await Promise.all(Array.from({length:6},async()=>{while(cursor<paths.length){const file=paths[cursor++];const raw=await gh(['api',`repos/${repo}/contents/${file}?ref=${ref}`,'-H','Accept: application/vnd.github.raw+json']);if(file.endsWith('schema.json'))schemas.push({file,schema:JSON.parse(raw)});else implementation.push({file,source:raw});}}));
 schemas.sort((a,b)=>a.file.localeCompare(b.file));implementation.sort((a,b)=>a.file.localeCompare(b.file));
 fs.writeFileSync(path.join(__dirname,'strapi-schema-inventory.json'),JSON.stringify({repo,commit:ref,schemas},null,2)+'\n');
 let md=`# Verified Strapi schema inventory\n\nRepository ${repo}, commit \`${ref}\`. Schema definitions, not deployed database rows or administrator role settings.\n\n`;
 for(const {file,schema} of schemas){md+=`## ${schema.info.displayName}\n\nSource: [${file}](https://github.com/${repo}/blob/${ref}/${file}). Draft/publish: ${!!schema.options?.draftAndPublish}. Localized: ${!!schema.pluginOptions?.i18n?.localized}.\n\n| Field | Type/relation | Required | Default | Target / enum / constraint |\n|---|---|---|---|---|\n`;for(const [key,v]of Object.entries(schema.attributes)){md+=`| ${key} | ${v.type}${v.relation?' / '+v.relation:''} | ${!!v.required} | ${JSON.stringify(v.default)??''} | ${[v.target,v.enum?.join(', '),v.unique?'unique':'',v.private?'private':'',v.mappedBy?'mappedBy '+v.mappedBy:'',v.inversedBy?'inversedBy '+v.inversedBy:''].filter(Boolean).join('; ')} |\n`;}md+='\n';}
 fs.writeFileSync(path.join(__dirname,'strapi-schema-inventory.md'),md);
 const factory=implementation.filter(x=>/^src\/api\//.test(x.file)&&/factories\.createCore(Controller|Router|Service)/.test(x.source));
 console.log(JSON.stringify({commit:ref,schemas:schemas.length,implementationFiles:implementation.length,factoryFiles:factory.length,nonFactory:implementation.filter(x=>!factory.includes(x))},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
