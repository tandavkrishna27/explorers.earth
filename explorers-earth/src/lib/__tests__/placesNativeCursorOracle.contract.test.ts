// The native oracle is evaluated from its actual AST without collecting Playwright tests.
import {describe,it,expect} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {encodePlacePinsCursor,decodePlacePinsCursor} from '../../../../tunes/server/application/placePinsRead';

const binding={account:'00000000-0000-0000-0000-000000000001',username:'inert',collection:'00000000-0000-0000-0000-000000000002',slug:'inert-list',limit:24,collectionRevision:'1',categoryRevision:'1',accountRevision:'1',catalogVersion:'inert',eligibilityFingerprint:'a'.repeat(64)};
const secret='inert-key-'.repeat(5);
const tuple=(n:number)=>({pinBucket:1 as const,sortPosition:n,id:`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`});
const tokens=[23,47].map(n=>encodePlacePinsCursor(secret,binding,tuple(n)));
// VACUITY GUARD (path): `new URL(<literal>,import.meta.url)` is statically rewritten by
// Vite into a served http:// asset URL, which under jsdom made readFileSync throw and this
// whole file fail at collection. Resolve from __dirname instead, which Vite does not touch,
// and assert the spec is actually on disk so a move fails by name rather than by ENOENT.
const specPath=resolve(__dirname,'../../../e2e/replatform/places.spec.ts');
expect(existsSync(specPath),`native Places oracle source missing: ${specPath}`).toBe(true);
const source=readFileSync(specPath,'utf8');
expect(source.length,'native Places oracle source is empty').toBeGreaterThan(0);
const ast=ts.createSourceFile('places.ts',source,ts.ScriptTarget.Latest,true);
const functions:string[]=[];
function visit(node:ts.Node){if(ts.isFunctionDeclaration(node)&&['recordPublicPages','assertPublicPageShape'].includes(node.name?.text??''))functions.push(node.getText(ast));ts.forEachChild(node,visit);}
visit(ast);
// VACUITY GUARD (extraction): both oracles must still be extractable by name.
expect(functions,'recordPublicPages/assertPublicPageShape no longer extractable from places.spec.ts').toHaveLength(2);
const code=ts.transpileModule(functions.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const {recordPublicPages,assertPublicPageShape}=new Function('expect','base',code+';return {recordPublicPages,assertPublicPageShape};')(expect,'/api');
const ids=Array.from({length:53},(_,n)=>`id${n}`),shape=[[0,24,24,0],[24,24,24,0],[48,24,5,1]];
let directSource='';
function findDirect(node:ts.Node){
 if(ts.isDoStatement(node)&&node.getText(ast).includes('recommendationIds.push')){
  const block=node.parent;if(!ts.isBlock(block))throw Error('Detail loop block missing');
  const index=block.statements.indexOf(node);
  // Execute the real declaration, loop, exact sizes, ordered IDs and uniqueness assertions.
  let start=index-1;
  while(start>=0 && !block.statements[start].getText(ast).includes('const recommendationIds:'))start--;
  if(start<0)throw Error('Detail loop declaration missing');
  directSource=block.statements.slice(start,index+4).map(statement=>statement.getText(ast)).join('\n');
 }
 ts.forEachChild(node,findDirect);
}
findDirect(ast);
// VACUITY GUARD (extraction): the real direct paging loop must still be locatable.
expect(directSource.length,'direct paging loop no longer extractable from places.spec.ts').toBeGreaterThan(0);
const directCode=ts.transpileModule(directSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function runDirect(next:unknown[]= [...tokens,null],sizes=[24,24,5]){
 const requests:string[]=[];let index=0,offset=0;
 const json=async(url:string)=>{requests.push(url);const size=sizes[index],rows=ids.slice(offset,offset+size);offset+=size;return {recommendationLists:[{recommended_places:rows.map(documentId=>({documentId})),recommended_places_next_cursor:next[index++]}]};};
 await new AsyncFunction('expect','json','publicPath','lists','manifest',directCode)(expect,json,()=>'/places/inert-list',[{slug:'inert-list'}],{expectedPublic:{recommendationIds:ids}});
 return requests;
}
function page(){let handler:(response:unknown)=>void;return {on:(_kind:string,fn:typeof handler)=>{handler=fn;},off(){},emit(cursor:string|null,rows:string[],nextCursor:unknown,detail=true,query?:string){
 const url='https://inert.invalid/api/places'+(detail?'/inert-list':'')+'?'+(query??`limit=${detail?24:12}${cursor===null?'':`&cursor=${encodeURIComponent(cursor)}`}`);
 handler({url:()=>url,status:()=>200,request:()=>({method:()=> 'GET',url:()=>url}),json:async()=>({recommendationLists:detail?[{recommended_places:rows.map(documentId=>({documentId})),recommended_places_next_cursor:nextCursor}]:rows.map(documentId=>({documentId}))})});
}};}
async function detail(change?:(p:ReturnType<typeof page>)=>void){const p=page(),record=recordPublicPages(p,'/places/inert-list',true);p.emit(null,ids.slice(0,24),tokens[0]);p.emit(tokens[0],ids.slice(24,48),tokens[1]);p.emit(tokens[1],ids.slice(48),null);change?.(p);return record();}

describe('native Places opaque continuation oracle without resources',()=>{
 it('the actual direct paging loop reuses each exact emitted token through canonical URL encoding',async()=>{
  const requests=await runDirect();expect(requests).toEqual(['/places/inert-list?limit=24',`/places/inert-list?limit=24&cursor=${encodeURIComponent(tokens[0])}`,`/places/inert-list?limit=24&cursor=${encodeURIComponent(tokens[1])}`]);
 });
 it('the actual direct paging loop rejects repeated or empty tokens, wrong terminal and rebound sizes',async()=>{
  for(const next of [[tokens[0],tokens[0],null],['',tokens[1],null],[tokens[0],tokens[1],tokens[0]],[tokens[0],null,null]])await expect(runDirect(next)).rejects.toThrow();
  await expect(runDirect([...tokens,null],[23,25,5])).rejects.toThrow();
 });
 it('accepts actual signed continuations and derives exact 0/24/48 positions and all53 IDs',async()=>{
  expect(decodePlacePinsCursor(tokens[0],secret,binding)).toEqual(tuple(23));
  expect(()=>decodePlacePinsCursor(tokens[0],secret,{...binding,collectionRevision:'2'})).toThrow();
  const rows=assertPublicPageShape(await detail(),shape);expect(rows.map((r:any)=>[r.offset,r.limit,r.ids.length,r.terminal])).toEqual([[0,24,24,false],[24,24,24,false],[48,24,5,true]]);expect(rows.flatMap((r:any)=>r.ids)).toEqual(ids);expect(new Set(rows.flatMap((r:any)=>r.ids)).size).toBe(53);
 });
 it('permits the same physical token and identical page observed twice',async()=>{expect(assertPublicPageShape(await detail(p=>p.emit(tokens[0],ids.slice(24,48),tokens[1])),shape)).toHaveLength(3);});
 it('derives the chain independently of physical observation order',async()=>{const p=page(),record=recordPublicPages(p,'/places/inert-list',true);p.emit(tokens[1],ids.slice(48),null);p.emit(tokens[0],ids.slice(24,48),tokens[1]);p.emit(null,ids.slice(0,24),tokens[0]);expect(assertPublicPageShape(await record(),shape).flatMap((r:any)=>r.ids)).toEqual(ids);});
 it('rejects conflicting duplicate IDs, limits and continuations',async()=>{
  for(const emit of [(p:ReturnType<typeof page>)=>p.emit(tokens[0],['wrong',...ids.slice(25,48)],tokens[1]),(p:ReturnType<typeof page>)=>p.emit(tokens[0],ids.slice(24,48),tokens[0]),(p:ReturnType<typeof page>)=>p.emit(tokens[0],ids.slice(24,48),tokens[1],true,`limit=24&limit=12&cursor=${tokens[0]}`)]){const conflict=await detail(emit);expect(()=>assertPublicPageShape(conflict,shape)).toThrow();}
 });
 it('keeps independent twelve-row previews out of the twenty-four-row detail census',async()=>{
  const recording=await detail(p=>p.emit(tokens[0],ids.slice(24,36),tokens[1],true,`limit=12&cursor=${tokens[0]}`));
  expect(assertPublicPageShape(recording,shape).flatMap((row:any)=>row.ids)).toEqual(ids);
 });
 it('rejects orphan requests, missing links, cycles, empty or malformed tokens and multiple terminals',async()=>{
  const variants=[{request:tokens[1],next:tokens[1]},{request:tokens[0],next:tokens[0]},{request:tokens[0],next:null},{request:tokens[0],next:''},{request:tokens[0],next:'o48'},{request:'',next:tokens[1]}];
  for(const v of variants){const p=page(),record=recordPublicPages(p,'/places/inert-list',true);p.emit(null,ids.slice(0,24),tokens[0]);p.emit(v.request,ids.slice(24,48),v.next);p.emit(tokens[1],ids.slice(48),null);const result=await record();expect(()=>assertPublicPageShape(result,shape)).toThrow();}
 });
 it('rejects duplicate query parameters and rebound page sizes',async()=>{
  for(const query of [`limit=24&cursor=${tokens[0]}&cursor=${tokens[0]}`,`limit=24&limit=24&cursor=${tokens[0]}`]){const result=await detail(p=>p.emit(tokens[0],ids.slice(24,48),tokens[1],true,query));expect(()=>assertPublicPageShape(result,shape)).toThrow();}
  const p=page(),record=recordPublicPages(p,'/places/inert-list',true);p.emit(null,ids.slice(0,23),tokens[0]);p.emit(tokens[0],ids.slice(23,48),tokens[1]);p.emit(tokens[1],ids.slice(48),null);const result=await record();expect(()=>assertPublicPageShape(result,shape)).toThrow();
 });
 it('retains category-parent oN admission and five pages with exact53 IDs',async()=>{
  const p=page(),record=recordPublicPages(p,'/places',false),expected=[[0,12,12],[12,12,12],[24,12,12],[36,12,12],[48,12,5]];for(const[offset,,size]of expected)p.emit(offset?`o${offset}`:null,ids.slice(offset,offset+size),null,false);expect(assertPublicPageShape(await record(),expected).flatMap((r:any)=>r.ids)).toEqual(ids);
  const bad=page(),badRecord=recordPublicPages(bad,'/places',false);bad.emit(tokens[0],ids.slice(0,12),null,false);expect((await badRecord()).parseFailures).toBe(1);
 });
});
