import {readFileSync} from 'node:fs';
import type {Pool} from 'pg';
import ts from 'typescript';
import {describe,expect,it} from 'vitest';
import {PublicContentFailure,PublicContentService} from '../../application/publicContent';
import {publicContentRequestSchema,type PublicContentRequest} from '../../../shared/explorersPublicContentContract';

// Execute the authored request expressions without importing the resource-owning
// integration module. Only the database boundary is inert; validation, binding,
// authenticated cursor encoding/decoding and the service read path are real.
const source=readFileSync(new URL('../explorers-place-pins.integration.test.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('places-fixture.ts',source,ts.ScriptTarget.Latest,true);
function descendants(node:ts.Node,predicate:(node:ts.Node)=>boolean):ts.Node[]{
 const result:ts.Node[]=[];
 function visit(current:ts.Node){if(predicate(current))result.push(current);ts.forEachChild(current,visit);}
 visit(node);return result;
}
function caseNode(name:string){
 const found=descendants(ast,node=>ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='it'&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text===name);
 expect(found).toHaveLength(1);return found[0];
}
function pageArgument(node:ts.Node){
 const found=descendants(node,current=>ts.isCallExpression(current)&&ts.isPropertyAccessExpression(current.expression)&&current.expression.name.text==='page');
 expect(found).toHaveLength(1);return (found[0] as ts.CallExpression).arguments[0].getText(ast);
}
const fixture={handle:'reader-inert',list:'00000000-0000-0000-0000-000000000001',lists:['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'],slugs:['reader-list-0','reader-list-1']};
const secret='portable-places-raw-input-secret';
function inertPool(){
 let connects=0,releases=0;const statements:{text:string;values:unknown[]}[]=[];
 const pool={connect:async()=>{connects++;return {query:async(text:string,values:unknown[]=[])=>{statements.push({text,values});return {rows:[]};},release:()=>{releases++;}}}} as unknown as Pool;
 return {pool,status:()=>({connects,releases,statements})};
}
function helper(pool:Pool){
 const found=descendants(ast,node=>ts.isFunctionDeclaration(node)&&node.name?.text==='p2Canonical');expect(found).toHaveLength(1);
 const code=ts.transpileModule(found[0].getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return new Function('p2Modules','runtime','p2Secret',`${code};return p2Canonical;`)(async()=>({PublicContentService}),pool,secret) as (f:typeof fixture,limit?:number,cursor?:string,list?:string,pool?:Pool)=>ReturnType<PublicContentService['page']>;
}
function request(expression:string,input?:{username:string;slug:string;limit:number},cursor?:string):Record<string,unknown>{
 return new Function('f','input','cursors',`return (${expression});`)(fixture,input,{canonical:cursor});
}
function expectReadSnapshot(state:ReturnType<ReturnType<typeof inertPool>['status']>){
 expect(state.connects).toBe(1);expect(state.releases).toBe(1);
 expect(state.statements).toHaveLength(4);
 expect(state.statements[0]).toEqual({text:'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',values:[]});
 expect(state.statements[1]).toEqual({text:"SET LOCAL statement_timeout='2000ms'",values:[]});
 expect(state.statements[2].text).toContain('FROM creator_accounts');
 expect(state.statements[2].values).toEqual(['reader-inert','places']);
 expect(state.statements[3]).toEqual({text:'COMMIT',values:[]});
}
type CursorAccess={
 binding:(input:PublicContentRequest)=>string;
 encode:(cursor:{version:2;binding:string;account:string;revision:string;order:number;id:string;pinBucket:0;eligibilityFingerprint:string})=>string;
 decode:(value:string|undefined,binding:string)=>unknown;
};

describe('P2 canonical raw HTTP request inputs',()=>{
 it('numeric limits reject before SQL while raw strings parse to numeric page sizes',async()=>{
  for(const limit of [12,24]){
   const inert=inertPool(),service=new PublicContentService(inert.pool,secret);
   await expect(service.page({username:fixture.handle,category:'places',slug:fixture.slugs[0],limit})).rejects.toMatchObject({status:400});
   expect(inert.status()).toEqual({connects:0,releases:0,statements:[]});
   expect(publicContentRequestSchema.parse({username:fixture.handle,category:'places',slug:fixture.slugs[0],limit:String(limit)}).limit).toBe(limit);
  }
 });
 it('the exact P2 canonical helper admits both page sizes and its default into the real read snapshot',async()=>{
  for(const limit of [12,24,undefined]){
   const inert=inertPool();await expect(helper(inert.pool)(fixture,limit)).resolves.toBeUndefined();expectReadSnapshot(inert.status());
  }
 });
 it('the exact canonical category request has raw string limit and reaches the real snapshot',async()=>{
  const raw=request(pageArgument(caseNode('P2 SQL canonical public traverses eligible Places across pin boundary')));
  expect(raw).toEqual({username:'reader-inert',category:'places',limit:'24'});
  const inert=inertPool();await expect(new PublicContentService(inert.pool,secret).page(raw)).resolves.toBeUndefined();expectReadSnapshot(inert.status());
 });
 it('all exact rebound variants reach authenticated cursor decoding rather than failing input validation',async()=>{
  const node=caseNode('P2 SQL public Places rejects rebound and legacy child cursors');
  const loops=descendants(node,current=>ts.isForOfStatement(current));expect(loops).toHaveLength(1);
  const inputs=new Function('f','other',`return (${(loops[0] as ts.ForOfStatement).expression.getText(ast)});`)(fixture,{handle:'other-reader'}) as {username:string;slug:string;limit:number}[];
  expect(inputs).toEqual([{username:'other-reader',slug:'reader-list-0',limit:24},{username:'reader-inert',slug:'reader-list-1',limit:24},{username:'reader-inert',slug:'reader-list-0',limit:12}]);
  for(const input of inputs){
   const inert=inertPool(),service=new PublicContentService(inert.pool,secret),actual=service as unknown as CursorAccess;
   const original={username:'reader-inert',category:'places',slug:'reader-list-0',limit:'24'};
   const binding=actual.binding(publicContentRequestSchema.parse(original));
   const cursor=actual.encode({version:2,binding,account:fixture.list,revision:'1:1',order:23,id:fixture.list,pinBucket:0,eligibilityFingerprint:'a'.repeat(64)});
   expect(actual.decode(cursor,binding)).toMatchObject({version:2,binding});
   let decodes=0;const decode=actual.decode;actual.decode=function(value,currentBinding){decodes++;return decode.call(service,value,currentBinding);};
   await expect(service.page({...original,...input,cursor})).rejects.toBeInstanceOf(PublicContentFailure);expect(decodes).toBe(0);
   const raw=request(pageArgument(node),input,cursor);expect(publicContentRequestSchema.safeParse(raw).success).toBe(true);
   await expect(service.page(raw)).rejects.toMatchObject({status:400});expect(decodes).toBe(1);
   expect(inert.status()).toEqual({connects:0,releases:0,statements:[]});
  }
 });
});
