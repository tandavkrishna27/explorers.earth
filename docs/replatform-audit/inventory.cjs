// Read-only source inventory. Writes documentation artifacts only.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const graphql = require(process.argv[2]);
const ts = require(path.join(path.dirname(process.argv[2]), 'typescript'));
const files = cp.execFileSync('git', ['ls-files'], {cwd:root,encoding:'utf8'}).trim().split('\n');
const source = files.filter(f => /\.(tsx?|jsx?|mjs|cjs)$/.test(f) && /^(explorers-earth\/src|tunes\/(server|client\/src|shared))\//.test(f) && !/(\/(__tests__|test|tests)\/|\.(test|spec)\.)/.test(f));
const ops=[], failures=[], calls=[], routes=[], sockets=[], dependencies=[], untagged=[];
const lineAt=(s,i)=>s.slice(0,i).split('\n').length;
for(const f of source){
 const s=fs.readFileSync(path.join(root,f),'utf8');
 const sf=ts.createSourceFile(f,s,ts.ScriptTarget.Latest,true,f.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 function visit(n){
  if((ts.isNoSubstitutionTemplateLiteral(n)||ts.isTemplateExpression(n)||ts.isStringLiteral(n))&&!(ts.isTaggedTemplateExpression(n.parent)&&n.parent.tag.getText(sf)==='gql')){
   const v=ts.isTemplateExpression(n)?n.head.text:n.text;
   let candidate = /^\s*(query|mutation|subscription)\b/.test(v);
   if(candidate && !ts.isTemplateExpression(n)){try{candidate=graphql.parse(v).definitions.some(d=>d.kind==='OperationDefinition');}catch{candidate=false;}}
   if(candidate){
    const match=v.match(/^\s*(query|mutation|subscription)\s*([A-Za-z_][A-Za-z_0-9]*)?/);
    untagged.push({file:f,line:lineAt(s,n.getStart(sf)),kind:match[1],name:match[2]||'(anonymous or dynamic)',dynamic:ts.isTemplateExpression(n),document:n.getText(sf)});
   }
  }
  ts.forEachChild(n,visit);
 }
 visit(sf);
 const documents=[...s.matchAll(/(?:gql\s*`)([\s\S]*?)`/g)];
 for(const m of documents){
  const raw=m[1];
  try {
   const ast=graphql.parse(raw.replace(/\$\{[^}]+\}/g,''));
   for(const d of ast.definitions){
    if(d.kind!=='OperationDefinition')continue;
    ops.push({file:f,line:lineAt(s,m.index),kind:d.operation,name:d.name?.value||'(anonymous)',roots:d.selectionSet.selections.filter(x=>x.kind==='Field').map(x=>x.name.value),variables:(d.variableDefinitions||[]).map(x=>x.variable.name.value),document:raw});
   }
  }catch(e){failures.push({file:f,line:lineAt(s,m.index),error:e.message});}
 }
 for(const m of s.matchAll(/\b(?:app|router)\.(get|post|put|patch|delete|all)\s*\(\s*(["'`])([^\n]*?)\2/g))routes.push({file:f,line:lineAt(s,m.index),method:m[1].toUpperCase(),path:m[3]});
 for(const m of s.matchAll(/\.(on|emit)\s*\(\s*['"]([^'"]+)['"]/g))if(/socket|playlistRoutes/.test(f))sockets.push({file:f,line:lineAt(s,m.index),direction:m[1],event:m[2]});
 s.split('\n').forEach((l,i)=>{
  if(/(?:fetch(?:Impl)?\(|axios\.|\/api\/|REST_API_URL|\/upload|STRAPI_|\/graphql)/.test(l)&&!/^\s*(\/\/|\*|import)/.test(l))calls.push({file:f,line:i+1,text:l.trim()});
 });
 const tags=[];
 if(documents.length)tags.push('GRAPHQL');
 if(/Strapi|strapi|VITE_REST_API_URL|VITE_API_URL|api.localqr.earth/.test(s))tags.push('STRAPI_REFERENCE');
 if(/\/upload|FormData/.test(s))tags.push('UPLOAD');
 if(/documentId/.test(s))tags.push('DOCUMENT_ID');
 if(tags.length)dependencies.push({file:f,tags});
}
const report={commit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),method:'All tracked runtime TS/JS source; excludes test directories and test/spec files. Parse gql template literals; occurrences count separately, not unique names or proven live operations. TypeScript AST additionally identifies untagged operation strings/templates. REST lines are candidates, not registered endpoints.',operations:ops,untaggedOperations:untagged,parseFailures:failures,routes,sockets,networkCandidates:calls,dependencyFiles:dependencies};
fs.writeFileSync(path.join(__dirname,'source-inventory.json'),JSON.stringify(report,null,2)+'\n');
const counts={};for(const o of ops){const group=o.file.startsWith('explorers-earth/')?'Explorers':'Tunes'; counts[group]??={query:0,mutation:0,subscription:0};counts[group][o.kind]++;}
let md='# Source inventory\n\nCommit `'+report.commit+'`. '+report.method+'\n\n';
md+='## Tagged GraphQL operation counts\n\n```json\n'+JSON.stringify(counts,null,2)+'\n```\n\nParse failures: '+failures.length+'. Untagged client and server GraphQL strings/templates are separately inventoried below; these counts exclude them. See the architecture report for combined totals.\n\n## GraphQL declarations\n\n| Kind | Name | Root fields | Source |\n|---|---|---|---|\n';
for(const o of ops)md+=`| ${o.kind} | ${o.name} | ${o.roots.join(', ')} | ${o.file}:${o.line} |\n`;
md+='\n## Untagged GraphQL strings and templates\n\nDynamic templates may generate multiple category-specific documents. Counts are template sites.\n\n| Kind | Name | Dynamic | Source |\n|---|---|---|---|\n';
for(const o of untagged)md+=`| ${o.kind} | ${o.name} | ${o.dynamic} | ${o.file}:${o.line} |\n`;
md+='\n## HTTP declarations\n\nThese require reachability classification in the architecture report; declaration is not evidence of deployment.\n\n| Method | Path | Source |\n|---|---|---|\n';
for(const r of routes)md+=`| ${r.method} | ${r.path} | ${r.file}:${r.line} |\n`;
md+='\n## Socket declarations\n\n| Direction | Event | Source |\n|---|---|---|\n';
for(const r of sockets)md+=`| ${r.direction} | ${r.event} | ${r.file}:${r.line} |\n`;
md+='\n## Files with coupling signals\n\n| File | Signals |\n|---|---|\n';
for(const r of dependencies)md+=`| ${r.file} | ${r.tags.join(', ')} |\n`;
fs.writeFileSync(path.join(__dirname,'source-inventory.md'),md);
const extraCounts={};for(const o of untagged){const group=o.file.startsWith('explorers-earth/')?'Explorers':o.file.startsWith('tunes/client/')?'Tunes client':'Tunes server';extraCounts[group]??={query:0,mutation:0,subscription:0};extraCounts[group][o.kind]++;}
console.log(JSON.stringify({commit:report.commit,sourceFiles:source.length,counts,untaggedCounts:extraCounts,parseFailures:failures,routes:routes.length,sockets:sockets.length,networkCandidates:calls.length,dependencyFiles:dependencies.length},null,2));
