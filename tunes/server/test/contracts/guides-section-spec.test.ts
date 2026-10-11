import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {EventEmitter} from 'node:events';
import {expect,it} from 'vitest';

const file=resolve(import.meta.dirname,'../../../..','explorers-earth/e2e/replatform/guides.spec.ts');
function source(){expect(existsSync(file),'bounded Guides spec exists').toBe(true);return ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);}
function actualScope(){
 const ast=source(),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='assertPersistedScope');expect(fn).toBeDefined();
 const code=ts.transpileModule(ts.createPrinter().printNode(ts.EmitHint.Unspecified,fn!,ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function('expect',code+';return assertPersistedScope;')(expect);
}
function fixture(){
 const guides=[{id:'target',accountId:'A',revision:2,categoryContentRevision:10,archivedAt:null,details:{tags:['café']}},{id:'sibling',accountId:'A',revision:3,categoryContentRevision:10,archivedAt:'old',details:{tags:['sibling']}},{id:'foreign',accountId:'B',revision:4,categoryContentRevision:20,archivedAt:null,details:{tags:['foreign']}}];
 const sections=['one','two','three','four'].map((id,displayOrder)=>({id,collectionId:'target',accountId:'A',displayOrder,title:id,description:'retained',blocks:{tags:['दिन']},archivedAt:null,createdAt:'old',updatedAt:'old'}));
 sections.push({...sections[0],id:'sibling-section',collectionId:'sibling'}, {...sections[0],id:'foreign-section',collectionId:'foreign',accountId:'B'});
 return {guides,sections,personas:{ownerA:{accountId:'A',guidesContentRevision:10},ownerB:{accountId:'B',guidesContentRevision:20},ownerC:{accountId:'C',guidesContentRevision:0}},media:[],objects:[],attachments:[]};
}
function reordered(){const before=fixture(),after=structuredClone(before),ids=['three','one','four','two'];for(const s of after.sections.filter(s=>s.collectionId==='target')){s.displayOrder=ids.indexOf(s.id);s.updatedAt='new';}after.guides.filter(g=>g.accountId==='A').forEach(g=>{g.categoryContentRevision=14;});after.personas.ownerA.guidesContentRevision=14;return {before,after,ids};}
it('actual scope accepts exact reordered state and rejects sibling, owner, content and order drift',()=>{
 const check=actualScope(),{before,after,ids}=reordered();check(before,after,'target',ids,false,14);
 for(const mutate of [(x:any)=>x.sections.find((s:any)=>s.id==='foreign-section').blocks.tags.push('changed'),(x:any)=>x.guides.find((g:any)=>g.id==='sibling').revision++,(x:any)=>x.sections.find((s:any)=>s.id==='one').displayOrder=0,(x:any)=>x.sections.find((s:any)=>s.id==='one').blocks.tags.push('lost'),(x:any)=>x.personas.ownerB.guidesContentRevision++,(x:any)=>x.sections.push({...x.sections[0],id:'extra'})]){const bad=structuredClone(after);mutate(bad);expect(()=>check(before,bad,'target',ids,false,14)).toThrow();}
});
it('actual scope proves physical deletion, compact order and archive retention',()=>{
 const check=actualScope(),{before,after}=reordered();after.sections=after.sections.filter(s=>s.id!=='one');const ids=['three','four','two'];after.sections.filter(s=>s.collectionId==='target').forEach(s=>{s.displayOrder=ids.indexOf(s.id);});check(before,after,'target',ids,false,14);
 const archived=structuredClone(after);archived.guides[0].archivedAt='now';archived.guides[0].revision++;check(after,archived,'target',ids,true,14);
 const lost=structuredClone(archived);lost.sections=lost.sections.filter(s=>s.id!=='two');expect(()=>check(after,lost,'target',ids,true,14)).toThrow();
 const drift=structuredClone(archived);drift.sections[0].updatedAt='archive touched section';expect(()=>check(after,drift,'target',ids,true,14)).toThrow();
});

function actualBootstrap(){
 const ast=source(),names=['guidesBootstraps','trackGuidesBootstrap','settleGuidesBootstrap','navigateGuides','reloadGuides'];
 const nodes=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text??'')||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.includes(d.name.getText(ast))));expect(nodes).toHaveLength(5);
 const code=ts.transpileModule(nodes.map(n=>ts.createPrinter().printNode(ts.EmitHint.Unspecified,n,ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function('origin','base',code+';return {trackGuidesBootstrap,settleGuidesBootstrap,navigateGuides,reloadGuides};')('http://127.0.0.1:6000','/api/explorers/v1');
}
const owner={userId:'user-A',accountId:'account-A',handle:'owner-a'};
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
class FakePage extends EventEmitter {
 href='about:blank';closed=false;positive=true;actions:string[]=[];onGoto=()=>{};onReload=()=>{};
 url(){return this.href;}isClosed(){return this.closed;}
 async evaluate(fn:(expected:unknown)=>Promise<boolean>,expected:unknown){const state={status:this.positive?'active-complete':'loading',isAuthenticated:true,accountId:owner.accountId,user:{id:owner.userId,documentId:owner.userId,username:owner.handle},token:null};const callback=new Function('moduleValue','return ('+fn.toString().replace(/await import\([^)]*\)/,'moduleValue')+');')({default:{getState:()=>state}});return callback(expected);}
 async goto(path:string){this.href=path;this.actions.push('goto');this.onGoto();}async reload(){this.actions.push('reload');this.onReload();}
}
function transport(page:FakePage,kind:'session'|'me',{holdBody=false,holdFinished=false,wrong=false}={}){
 const body=kind==='session'?{user:{id:wrong?'foreign':owner.userId},session:{id:'session'}}:{account:{id:wrong?'foreign':owner.accountId,handle:owner.handle,onboardingStatus:'complete'}};
 const bytes=deferred<Buffer>(),done=deferred<null>(),request={url:()=>`http://127.0.0.1:6000${kind==='session'?'/api/auth/get-session':'/api/explorers/v1/me'}`,method:()=> 'GET'},response={request:()=>request,status:()=>200,body:()=>holdBody?bytes.promise:Promise.resolve(Buffer.from(JSON.stringify(body))),finished:()=>holdFinished?done.promise:Promise.resolve(null)};
 page.emit('request',request);page.emit('response',response);return {body:()=>bytes.resolve(Buffer.from(JSON.stringify(body))),responseDone:()=>done.resolve(null),finish:()=>page.emit('requestfinished',request),fail:()=>page.emit('requestfailed',request)};
}
function bootstrapped(){const api=actualBootstrap(),page=new FakePage();api.trackGuidesBootstrap(page,owner);page.href='/recommendations/guides';return {api,page};}
it('actual bootstrap requires original body, response completion and terminal request event',async()=>{
 const {api,page}=bootstrapped(),session=transport(page,'session',{holdBody:true,holdFinished:true});transport(page,'me').finish();let settled=false;const work=api.settleGuidesBootstrap(page,1500).then(()=>{settled=true;});
 await new Promise(r=>setTimeout(r,5));expect(settled).toBe(false);session.body();await new Promise(r=>setTimeout(r,5));expect(settled).toBe(false);session.finish();await new Promise(r=>setTimeout(r,5));expect(settled).toBe(false);session.responseDone();await work;expect(settled).toBe(true);
});
it('actual bootstrap refuses missing, wrong and failed original requests despite positive state',async()=>{
 for(const variant of ['missing','wrong','failed']){const {api,page}=bootstrapped();if(variant!=='missing'){const session=transport(page,'session',{wrong:variant==='wrong'});variant==='failed'?session.fail():session.finish();transport(page,'me').finish();}await expect(api.settleGuidesBootstrap(page,25)).rejects.toThrow('Guides bootstrap');}
});
it('actual navigation and reload settle the prior document then require the new document requests',async()=>{
 for(const kind of ['navigate','reload']){const {api,page}=bootstrapped(),old=transport(page,'session');transport(page,'me').finish();let next:ReturnType<typeof transport>|undefined;const change=()=>{next=transport(page,'session');transport(page,'me').finish();};page.onGoto=change;page.onReload=change;
  let settled=false;const work=(kind==='navigate'?api.navigateGuides(page,'/recommendations/guides/target'):api.reloadGuides(page)).then(()=>{settled=true;});await new Promise(r=>setTimeout(r,5));expect(page.actions).toEqual([]);old.finish();await new Promise(r=>setTimeout(r,5));expect(page.actions).toEqual([kind==='navigate'?'goto':'reload']);expect(settled).toBe(false);next!.finish();await work;
 }
});

function actualFunctions(names:string[],bindings:Record<string,unknown>={}){const ast=source(),nodes=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text??''));expect(nodes).toHaveLength(names.length);const code=ts.transpileModule(nodes.map(n=>ts.createPrinter().printNode(ts.EmitHint.Unspecified,n,ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return new Function('expect',...Object.keys(bindings),code+';return {'+names.join(',')+'};')(expect,...Object.values(bindings));}
it('actual API response consumer disposes successful and rejected bodies',async()=>{
 const {consume}=actualFunctions(['consume']);for(const failing of [false,true]){let disposed=0;const response={dispose:async()=>{disposed++;}};const result=consume(response,async()=>{if(failing)throw Error('refused');return 'read';});if(failing)await expect(result).rejects.toThrow('refused');else expect(await result).toBe('read');expect(disposed).toBe(1);}
});
it('actual native acknowledgement accepts only target DELETE and exact observed revision',async()=>{
 const {acknowledgement}=actualFunctions(['acknowledgement'],{origin:'http://127.0.0.1:6000',base:'/api/explorers/v1'});let predicate!:(r:unknown)=>boolean;const page={waitForResponse:(fn:(r:unknown)=>boolean)=>{predicate=fn;return Promise.resolve();}};await acknowledgement(page,'/collections/target/guide/sections/one',(body:{revision:number})=>body.revision===14);
 const response=(url:string,method:string,revision:number)=>({url:()=>url,request:()=>({method:()=>method,postDataJSON:()=>({revision})})});const path='http://127.0.0.1:6000/api/explorers/v1/collections/target/guide/sections/one';expect(predicate(response(path,'DELETE',14))).toBe(true);
 for(const row of [response(path,'PATCH',14),response(path,'DELETE',13),response(path.replace('/one','/two'),'DELETE',14),response(path.replace('6000','6001'),'DELETE',14)])expect(predicate(row)).toBe(false);
});
it('actual browser response requires bounded body and finished original transport',async()=>{
 const {browserBody}=actualFunctions(['browserBody']);const response=(bytes:Buffer,finished:unknown=null,status=200)=>({status:()=>status,body:async()=>bytes,finished:async()=>finished});expect(await browserBody(response(Buffer.from('{"guide":{"collectionId":"target"}}')))).toEqual({guide:{collectionId:'target'}});
 await expect(browserBody(response(Buffer.alloc(65537)))).rejects.toThrow();await expect(browserBody(response(Buffer.from('{}'),'failed'))).rejects.toThrow();await expect(browserBody(response(Buffer.from('{}'),null,409))).rejects.toThrow();
});
it('only frozen authored cases are present; native deletion/archive follow reload and precede retirement',()=>{
 const ast=source(),tests:ts.CallExpression[]=[];function walk(n:ts.Node){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='test')tests.push(n);ts.forEachChild(n,walk);}walk(ast);
 expect(tests.map(t=>t.arguments[0].getText(ast)).sort()).toEqual(['GUIDES_CASES[2]','GUIDES_CASES[3]']);
 const sectionCase=tests.find(t=>t.arguments[0].getText(ast)==='GUIDES_CASES[3]')!;
 const body=sectionCase.arguments[1].getText(ast);expect(body).toContain('repeat: 0');expect(body).toContain('harness.trackProducer');expect(body).toContain('harness.closeContext');expect(body.indexOf('harness.observe')).toBeLessThan(body.indexOf('harness.retire'));
 const calls:string[]=[];function collect(n:ts.Node){if(ts.isCallExpression(n))calls.push(n.expression.getText(ast));ts.forEachChild(n,collect);}collect(sectionCase);
 expect(calls.filter(c=>c==='nativeDeleteSection'||c==='nativeArchiveGuide')).toEqual(['nativeDeleteSection','nativeArchiveGuide']);
 expect(calls.filter(c=>c==='reloadGuides').length).toBeGreaterThanOrEqual(3);
 const deletes:ts.CallExpression[]=[];function deleteCalls(n:ts.Node){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='delete')deletes.push(n);ts.forEachChild(n,deleteCalls);}deleteCalls(ast);expect(deletes).toHaveLength(0);
});
