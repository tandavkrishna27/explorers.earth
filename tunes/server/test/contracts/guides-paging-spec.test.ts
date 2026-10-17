import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {EventEmitter} from 'node:events';
import {expect,it} from 'vitest';
import {z} from 'zod/v3';
import {buildGuidesSeedPlan,GUIDES_CASES} from '../../../scripts/guides-browser-support';
import {guideCollectionDetailsSchema,guideAggregateDtoSchema} from '../../../shared/explorersGuideContract';
const file=resolve(import.meta.dirname,'../../../..','explorers-earth/e2e/replatform/guides.spec.ts');
function actual(names:string[],bindings:Record<string,unknown>={}){const ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);const nodes=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text??'')||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.includes(d.name.getText(ast))));expect(nodes).toHaveLength(names.length);const code=ts.transpileModule(nodes.map(n=>ts.createPrinter().printNode(ts.EmitHint.Unspecified,n,ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return new Function('expect',...Object.keys(bindings),code+';return {'+names.join(',')+'};')(expect,...Object.values(bindings));}
it('case4 fixture alone has overlapping positive varied subsets across complete pages',()=>{
 const plan=buildGuidesSeedPlan(GUIDES_CASES[4]),a=plan.guides.filter(g=>g.owner==='ownerA');expect(a).toHaveLength(54);for(const g of plan.guides)guideCollectionDetailsSchema.parse(g.details);
 expect(a.filter(g=>g.details.guideType==='itinerary').map(g=>g.displayOrder)).toEqual(Array.from({length:9},(_,i)=>[i*6,i*6+2]).flat());
 expect(a.filter(g=>g.details.categories.includes('culture')).length).toBe(27);expect(a.filter(g=>g.details.numberOfDays===3).length).toBe(27);
 for(const index of [0,1,2,3,5,6,7]){const unchanged=buildGuidesSeedPlan(GUIDES_CASES[index]);expect(unchanged.guides.every(g=>JSON.stringify(g.details)===JSON.stringify(a[0].details))).toBe(true);}
 expect(plan.guides.find(g=>g.owner==='ownerB')!.details).toEqual(a[0].details);
});
it('actual ordered paging oracle rejects gaps, duplicates and wrong count',()=>{
 const {assertGuidePage}=actual(['assertGuidePage']);const ids=['a','b','c','d','e'];assertGuidePage(['a','b'],ids,0,2);assertGuidePage(['c','d'],ids,2,2);assertGuidePage(['e'],ids,4,2);
 for(const rows of [['b','a'],['a','a'],['a'],['a','b','c']])expect(()=>assertGuidePage(rows,ids,0,2)).toThrow();
});
it('actual positive filter oracle derives manifest intersections and preserves order',()=>{
 const {guideFilterIds}=actual(['guideFilterIds']);const guides=buildGuidesSeedPlan(GUIDES_CASES[4]).guides.filter(g=>g.owner==='ownerA').map(g=>({...g,id:g.key}));
 expect(guideFilterIds(guides,{guideType:'itinerary'})).toEqual(guides.filter(g=>g.displayOrder%6===0||g.displayOrder%6===2).map(g=>g.id));
 expect(guideFilterIds(guides,{guideType:'itinerary',category:'culture',days:3,budget:'per-person',month:'अक्टूबर',location:'कोलकाता'})).toEqual(guides.filter(g=>g.displayOrder%6===0).map(g=>g.id));
 expect(guideFilterIds(guides,{multiCity:true})).toEqual([]);
});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
function originalRead(page:EventEmitter,{status=200,bytes=Buffer.from('{"guides":[]}'),finished:held=false}={}){const request={url:()=> 'http://127.0.0.1:6000/api/explorers/v1/read',method:()=> 'GET'},done=deferred<null>(),response={request:()=>request,url:request.url,status:()=>status,body:async()=>bytes,finished:()=>held?done.promise:Promise.resolve(null)};page.emit('request',request);page.emit('response',response);return {finish:()=>page.emit('requestfinished',request),fail:()=>page.emit('requestfailed',request),responseDone:()=>done.resolve(null)};}
it('actual original read custody requires both finished response and terminal request before release',async()=>{
 const {trackGuideReads}=actual(['trackGuideReads'],{origin:'http://127.0.0.1:6000'}),page=new EventEmitter(),custody=trackGuideReads(page,()=>true),read=originalRead(page,{finished:true});let settled=false;const work=custody.reads().then(()=>{settled=true;});await new Promise(r=>setTimeout(r,5));expect(settled).toBe(false);read.finish();await new Promise(r=>setTimeout(r,5));expect(settled).toBe(false);read.responseDone();await work;expect(settled).toBe(true);await custody.close();expect(page.eventNames()).toEqual([]);
});
it('actual original read custody refuses failed requests, non200 bodies and oversized evidence',async()=>{
 const {trackGuideReads}=actual(['trackGuideReads'],{origin:'http://127.0.0.1:6000'});
 for(const variant of ['requestfailed','status','size']){const page=new EventEmitter(),custody=trackGuideReads(page,()=>true),read=originalRead(page,{status:variant==='status'?304:200,bytes:variant==='size'?Buffer.alloc(4*1024*1024+1):Buffer.from('{}')});variant==='requestfailed'?read.fail():read.finish();await expect(custody.reads()).rejects.toThrow();await expect(custody.close()).rejects.toThrow();expect(page.eventNames()).toEqual([]);}
});
it('actual original read custody rejects a started request without acknowledged response',async()=>{
 const {trackGuideReads}=actual(['trackGuideReads'],{origin:'http://127.0.0.1:6000'}),page=new EventEmitter(),custody=trackGuideReads(page,()=>true),request={url:()=> 'http://127.0.0.1:6000/api/explorers/v1/read',method:()=> 'GET'};page.emit('request',request);page.emit('requestfinished',request);await expect(custody.close()).rejects.toThrow();expect(page.eventNames()).toEqual([]);
});
const uuid=(number:number)=>`00000000-0000-4000-8000-${number.toString().padStart(12,'0')}`;
it('actual owner section oracle enforces20page revision count cursor and complete ordered identities',()=>{
 const {assertOwnerSectionReads}=actual(['assertGuidePage','assertOwnerSectionReads'],{base:'/api/explorers/v1',guideAggregateDtoSchema}),id=uuid(99),plan=buildGuidesSeedPlan(GUIDES_CASES[4]),sections=plan.sections.filter(s=>s.guideKey==='ownerA-guide-0').map((s,i)=>({id:uuid(i+1),collectionId:id,title:s.title,description:s.description,displayOrder:i,blocks:s.blocks,archived:false,createdAt:'2026-10-09T00:00:00.000Z',updatedAt:'2026-10-09T00:00:00.000Z'}));
 const reads=[0,20,40].map(offset=>({url:new URL(`http://localhost/api/explorers/v1/collections/${id}/guide${offset?`?after=${offset-1}`:''}`),body:{guide:{collectionId:id,revision:8,details:plan.guides[0].details,coverMediaId:null,sections:sections.slice(offset,offset+20),sectionCount:53,nextCursor:offset<40?String(offset+19):null}}}));assertOwnerSectionReads(reads,id,sections);
 for(const mutate of [(rows:typeof reads)=>rows[1].body.guide.revision++,(rows:typeof reads)=>rows[2].body.guide.sectionCount=52,(rows:typeof reads)=>rows[0].body.guide.nextCursor='24',(rows:typeof reads)=>rows[1].body.guide.sections.reverse(),(rows:typeof reads)=>rows[0].url.searchParams.set('limit','24')]){const bad=reads.map(row=>({url:new URL(row.url),body:structuredClone(row.body)}));mutate(bad);expect(()=>assertOwnerSectionReads(bad,id,sections)).toThrow();}
});
it('actual public detail oracle enforces five12pages parent summary cursor and ordered day identity',()=>{
 const {assertPublicGuideReads}=actual(['assertGuidePage','compatibilityGuidePage','assertPublicGuideReads'],{z}),id=uuid(99),path='/api/explorers/v1/profiles/owner/recommendations/guides/guide-1',ids=Array.from({length:53},(_,i)=>uuid(i+1));
 const reads=[0,12,24,36,48].map(offset=>{const sections=ids.slice(offset,offset+12).map((documentId,i)=>({documentId,Sequence:offset+i+1}));return {url:new URL(`http://localhost${path}${offset?`?limit=12&cursor=o${offset}`:''}`),body:{guides:[{documentId:id,guide_sections:sections,Guide_Section_Details:sections,guide_sections_next_cursor:offset<48?`o${offset+12}`:null}]}};});assertPublicGuideReads(reads,path,ids,id);
 for(const mutate of [(rows:typeof reads)=>rows[0].body.guides[0].documentId=uuid(98),(rows:typeof reads)=>rows[4].body.guides[0].guide_sections_next_cursor='o60',(rows:typeof reads)=>rows[1].body.guides[0].guide_sections.reverse(),(rows:typeof reads)=>rows[1].url.searchParams.set('limit','24'),(rows:typeof reads)=>rows[2].body.guides[0].guide_sections[0].Sequence=1]){const bad=reads.map(row=>({url:new URL(row.url),body:structuredClone(row.body)}));mutate(bad);expect(()=>assertPublicGuideReads(bad,path,ids,id)).toThrow();}
});
