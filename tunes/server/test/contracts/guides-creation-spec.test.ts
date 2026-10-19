import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {expect,it} from 'vitest';
import {createCollectionResultSchema} from '../../../shared/explorersContract';
const path=resolve(import.meta.dirname,'../../../..','explorers-earth/e2e/replatform/guides.spec.ts');
const source=()=>ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true);
it('case zero uses the native wizard and original creation evidence',()=>{
 const ast=source(),cases=ast.statements.filter(ts.isExpressionStatement).map(n=>n.expression).filter(ts.isCallExpression).filter(n=>n.expression.getText(ast)==='test');
 const card=cases.find(n=>n.arguments[0].getText(ast)==='GUIDES_CASES[0]');expect(card).toBeDefined();const text=card!.getText(ast);
 for(const required of ['Use entered location','Search for a location','Itinerary','3 Days','Add “','Search and select months...','Enter guide title','contenteditable','Create Guide','createCollectionResultSchema.parse','guideAggregateDtoSchema.parse','assertCreationPersistedScope','reloadGuides','settleGuidesBootstrap','harness.retire'])expect(text).toContain(required);
 expect(text).not.toMatch(/\.route\(|\.fulfill\(|request\.post\(|request\.put\(|request\.patch\(/);
});
it('actual original creation body refuses status, oversized bytes and incomplete response',async()=>{
 const ast=source(),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='originalCreationBody')!;
 const js=ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const read=new Function('expect',js+';return originalCreationBody;')(expect);
 const response=(bytes:Buffer,status=201,finished:unknown=null)=>({status:()=>status,body:async()=>bytes,finished:async()=>finished});
 expect(await read(response(Buffer.from('{"collection":{}}')),201)).toEqual({collection:{}});
 for(const value of [response(Buffer.from('{}'),200),response(Buffer.alloc(65537)),response(Buffer.from('{}'),201,'failed')])await expect(read(value,201)).rejects.toThrow();
 expect(createCollectionResultSchema.safeParse({id:'not-a-uuid'}).success).toBe(false);
});
it('wizard selectors match actual native controls including the optional budget and creator categories',()=>{
 const root=resolve(import.meta.dirname,'../../../..','explorers-earth/src/features/Guides/components');
 const one=readFileSync(resolve(root,'CreateGuideStep1.tsx'),'utf8'),two=readFileSync(resolve(root,'CreateGuideStep2.tsx'),'utf8'),three=readFileSync(resolve(root,'CreateGuideStep3.tsx'),'utf8');
 for(const label of ['Search for a location','Use entered location','Itinerary'])expect(one).toContain(label);
 for(const label of ['Search and select categories...','Add more categories...','Add &ldquo;','Search and select months...','Select budget type...','October','(optional)'])expect(two).toContain(label);
 expect(two).not.toContain('Please select a budget type');
 expect(three).toContain('Enter guide title');expect(three).toContain('TiptapEditor');
});
function actualScope(){const ast=source(),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='assertCreationPersistedScope');expect(fn).toBeDefined();const js=ts.transpileModule(fn!.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return new Function('expect',js+';return assertCreationPersistedScope;')(expect);}
it('creation scope rejects unrelated rows, added sections/media and wrong new identity',()=>{
 const check=actualScope(),before={guides:[{id:'old',accountId:'A',displayOrder:0,categoryContentRevision:2},{id:'foreign',accountId:'B',categoryContentRevision:5}],sections:[],personas:{ownerA:{accountId:'A',guidesContentRevision:2},ownerB:{accountId:'B',guidesContentRevision:5}},media:[],objects:[],attachments:[]};
 const row={id:'new',accountId:'A',category:'guides',title:'यात्रा café',description:'सुबह',slug:'guide-new',displayOrder:1,revision:1,categoryContentRevision:4,visibility:'private',publicationState:'draft',pinOrder:null,archivedAt:null,details:{categories:['संस्कृति']}};
 const after={...structuredClone(before),guides:[{...before.guides[0],categoryContentRevision:4},before.guides[1],row],personas:{ownerA:{accountId:'A',guidesContentRevision:4},ownerB:before.personas.ownerB}};
 const collection={...row},guide={coverMediaId:null,collectionId:'new',revision:4,details:row.details,sections:[],sectionCount:0,nextCursor:null};check(before,after,collection,guide);expect(()=>check(before,after,collection,{...guide,coverMediaId:'00000000-0000-4000-8000-000000000001'})).toThrow();
 for(const change of [(v:any)=>v.guides[1].title='drift',(v:any)=>v.guides.push({...row,id:'extra'}),(v:any)=>v.sections.push({id:'extra'}),(v:any)=>v.media.push({id:'extra'}),(v:any)=>v.personas.ownerB.guidesContentRevision++,(v:any)=>v.guides[2].accountId='B',(v:any)=>v.guides[2].details.categories.push('lost')]){const bad=structuredClone(after);change(bad);expect(()=>check(before,bad,collection,guide)).toThrow();}
});
