import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {expect,it} from 'vitest';
import {buildGuidesSeedPlan,GUIDES_CASES} from '../../../scripts/guides-browser-support';
import {toDayPlace,toCanonicalDayPlace,toCanonicalBudgetPlace,toTransportSegment,toGuide,toGuideSection} from '../../../../explorers-earth/src/features/Guides/api/guidesViewModel';
import {guideAggregateDtoSchema,legacyBudgetFromEntries,legacyTimelineFromItems,type GuideSectionBlocks} from '../../../shared/explorersGuideContract';
// The seed is v2 day items; these forms still read the legacy slot view.
const slotted=(b:GuideSectionBlocks)=>({timeline:legacyTimelineFromItems(b.items),budget:legacyBudgetFromEntries(b.budget.entries,b.items)});
import {ownerCollectionDtoSchema} from '../../../shared/explorersOwnerContentContract';
import {calculateDistance} from '../../../../explorers-earth/src/features/Guides/utils/distanceCalculator';
import {calculateTravelTime} from '../../../../explorers-earth/src/features/Guides/utils/travelModeConfig';
import {getTransportSegments} from '../../../../explorers-earth/src/features/Guides/utils/guideHelpers';
import {parseTimeline,parseStay,parseActivity} from '../../../../explorers-earth/src/features/Guides/utils/guideDataParser';
import type {DayPlace} from '../../../../explorers-earth/src/features/Guides/types/guideSectionTypes';

// Execute the actual retained editor's replacement expression. No browser,
// database, mocked command, or rewritten implementation supplies this evidence.
function actualStayReplacement(){
 const file=resolve(import.meta.dirname,'../../../..','explorers-earth/src/features/Guides/components/GuideDetails/EditStayModal.tsx');
 const ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const declarations:ts.VariableDeclaration[]=[];
 function walk(node:ts.Node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='updatedStay')declarations.push(node);ts.forEachChild(node,walk);}walk(ast);
 expect(declarations).toHaveLength(1);expect(declarations[0].initializer).toBeDefined();
 const expression=ts.createPrinter().printNode(ts.EmitHint.Expression,declarations[0].initializer!,ast);
 const code=ts.transpileModule(`function replacement(stay,stayPlace,location){return (${expression});}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function(code+';return replacement;')() as (stay:DayPlace,place:Record<string,unknown>,location:{lat:()=>number;lng:()=>number})=>DayPlace;
}

it('native accommodation replacement preserves the seeded exact money and complete place fields',()=>{
 const canonical=buildGuidesSeedPlan(GUIDES_CASES[1]).sections[0].blocks.stay.accommodations[0];
 const stay=toDayPlace(canonical),location={lat:()=>stay.geometry!.location.lat,lng:()=>stay.geometry!.location.lng};
 const replacement=actualStayReplacement()(stay,{name:stay.name,formatted_address:stay.formatted_address,place_id:stay.place_id,geometry:{location},types:stay.types},location);
 expect(toCanonicalDayPlace(replacement)).toEqual(canonical);
});

function specFunctions(names:string[]){
 const file=resolve(import.meta.dirname,'../../../..','explorers-earth/e2e/replatform/guides.spec.ts'),ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 const nodes=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text??''));expect(nodes).toHaveLength(names.length);
 const code=ts.transpileModule(nodes.map(n=>ts.createPrinter().printNode(ts.EmitHint.Unspecified,n,ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function('expect','origin','base',code+';return {'+names.join(',')+'};')(expect,'http://127.0.0.1:6000','/api/explorers/v1');
}
it('actual section acknowledgement requires original PATCH, exact path and complete expected command',async()=>{
 const {sectionAcknowledgement}=specFunctions(['sectionAcknowledgement']);let predicate!:(r:unknown)=>boolean;
 const page={waitForResponse:(fn:(r:unknown)=>boolean)=>{predicate=fn;return Promise.resolve();}},draft={revision:7,title:'दिन',description:'café',blocks:{tags:['दिन']}};
 await sectionAcknowledgement(page,'guide','section',draft);
 const response=(body:unknown=draft,method='PATCH',url='http://127.0.0.1:6000/api/explorers/v1/collections/guide/guide/sections/section')=>({url:()=>url,request:()=>({method:()=>method,postDataJSON:()=>body})});
 expect(predicate(response())).toBe(true);
 for(const r of [response({...draft,revision:6}),response({...draft,blocks:{tags:[]}}),response(draft,'PUT'),response(draft,'PATCH','http://127.0.0.1:6001/api/explorers/v1/collections/guide/guide/sections/section')])expect(predicate(r)).toBe(false);
});
it('actual error evidence requires bounded finished original transport and exact status/code/message',async()=>{
 const {guideErrorEvidence}=specFunctions(['guideErrorEvidence']);const response=(status=409,body={error:{code:'CONFLICT',message:'Guide changed; reload and retry',requestId:'request'}},finished:unknown=null)=>({status:()=>status,body:async()=>Buffer.from(JSON.stringify(body)),finished:async()=>finished});
 expect(await guideErrorEvidence(response(),409,'CONFLICT','Guide changed; reload and retry')).toEqual({code:'CONFLICT',message:'Guide changed; reload and retry'});
 for(const r of [response(200),response(409,undefined,'failed'),response(409,{error:{code:'NOT_FOUND',message:'Guide changed; reload and retry',requestId:'request'}})])await expect(guideErrorEvidence(r,409,'CONFLICT','Guide changed; reload and retry')).rejects.toThrow();
});

it('native full section form retains seeded budget entry local identity',()=>{
 const file=resolve(import.meta.dirname,'../../../..','explorers-earth/src/features/Guides/components/GuideSectionForm.tsx'),ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const found:ts.VariableDeclaration[]=[];function walk(n:ts.Node){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='extractBudgetData')found.push(n);ts.forEachChild(n,walk);}walk(ast);expect(found).toHaveLength(1);
 const code=ts.transpileModule('const extract='+ts.createPrinter().printNode(ts.EmitHint.Expression,found[0].initializer!,ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const extract=new Function(code+';return extract;')() as (places:DayPlace[])=>Parameters<typeof toCanonicalBudgetPlace>[0][];
 const blocks=slotted(buildGuidesSeedPlan(GUIDES_CASES[1]).sections[0].blocks);
 expect(extract(blocks.timeline.morning.map(toDayPlace)).map(toCanonicalBudgetPlace)).toEqual(blocks.budget.morning);
});

it('native full section form retains existing transport by entry identity',()=>{
 const file=resolve(import.meta.dirname,'../../../..','explorers-earth/src/features/Guides/components/GuideSectionForm.tsx'),ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const found:ts.VariableDeclaration[]=[];function walk(n:ts.Node){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='generateCompleteTransportSegments')found.push(n);ts.forEachChild(n,walk);}walk(ast);expect(found).toHaveLength(1);
 const code=ts.transpileModule('const generate='+ts.createPrinter().printNode(ts.EmitHint.Expression,found[0].initializer!,ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const seedBlocks=buildGuidesSeedPlan(GUIDES_CASES[1]).sections[0].blocks,blocks=slotted(seedBlocks),existing=seedBlocks.transport.segments.map(toTransportSegment);
 const generate=new Function('morningPlaces','afternoonPlaces','eveningPlaces','transportSegments','calculateDistance','calculateTravelTime','initialData',code+';return generate;')(blocks.timeline.morning.map(toDayPlace),blocks.timeline.afternoon.map(toDayPlace),blocks.timeline.evening.map(toDayPlace),existing,calculateDistance,calculateTravelTime,{Timeline:{morning:blocks.timeline.morning.map(toDayPlace),afternoon:blocks.timeline.afternoon.map(toDayPlace),evening:blocks.timeline.evening.map(toDayPlace)}}) as ()=>typeof existing;
 const actual=generate();expect(actual[0]).toEqual(existing[0]);expect(actual.every(s=>[...blocks.timeline.morning,...blocks.timeline.afternoon,...blocks.timeline.evening].some(p=>p.localId===s.fromPlaceId)&&[...blocks.timeline.morning,...blocks.timeline.afternoon,...blocks.timeline.evening].some(p=>p.localId===s.toPlaceId))).toBe(true);
});

it('actual owner guide mapper hands native detail and full edit surfaces the complete section DTO',()=>{
 const seed=buildGuidesSeedPlan(GUIDES_CASES[1]),id='aaaaaaaa-0000-4000-8000-000000000001',sectionId='aaaaaaaa-0000-4000-8000-000000000002',time='2026-10-11T00:00:00.000Z';
 const collection=ownerCollectionDtoSchema.parse({id,accountId:'aaaaaaaa-0000-4000-8000-000000000003',category:'guides',title:seed.guides[0].title,slug:seed.guides[0].slug,visibility:'public',publicationState:'published',revision:1,description:null,heading:null,coverMediaId:null,archived:false,displayOrder:0});
 const input=seed.sections[0],aggregate=guideAggregateDtoSchema.parse({collectionId:id,revision:1,details:seed.guides[0].details,coverMediaId:null,sections:[{id:sectionId,collectionId:id,title:input.title,description:input.description,displayOrder:0,blocks:input.blocks,archived:false,createdAt:time,updatedAt:time}],sectionCount:1,nextCursor:null});
 expect(toGuide(collection,aggregate).guide_sections?.[0]).toEqual(toGuideSection(aggregate.sections[0]));
});

it('actual transport tab renders seeded canonical entry endpoints for native mode editing',()=>{
 const file=resolve(import.meta.dirname,'../../../..','explorers-earth/src/features/Guides/components/GuideDetails/TransportationTimeline.tsx'),ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const found:ts.VariableDeclaration[]=[];function walk(n:ts.Node){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='sectionGroups')found.push(n);ts.forEachChild(n,walk);}walk(ast);expect(found).toHaveLength(1);expect(ts.isCallExpression(found[0].initializer!)).toBe(true);
 const callback=(found[0].initializer as ts.CallExpression).arguments[0],code=ts.transpileModule('const groups='+ts.createPrinter().printNode(ts.EmitHint.Expression,callback,ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const seed=buildGuidesSeedPlan(GUIDES_CASES[1]).sections[0],section=toGuideSection({id:'section',collectionId:'guide',title:seed.title,description:seed.description,displayOrder:0,blocks:seed.blocks,archived:false,createdAt:'old',updatedAt:'old'});
 const groups=new Function('guide','getTransportSegments','parseTimeline','parseStay','parseActivity',code+';return groups;')({guide_sections:[section]},getTransportSegments,parseTimeline,parseStay,parseActivity) as ()=>{sectionId:string;transportNodes:{segment:unknown;from:{name:string};to:{name:string}}[]}[];
 expect(groups()).toMatchObject([{sectionId:'section',transportNodes:[{segment:toTransportSegment(seed.blocks.transport.segments[0]),from:{name:slotted(seed.blocks).timeline.morning[0].name},to:{name:slotted(seed.blocks).timeline.afternoon[0].name}}]}]);
});

it('actual editor scope accepts only addressed content plus owning category revisions',()=>{
 const {assertEditorPersistedScope}=specFunctions(['assertEditorPersistedScope']);
 const before={guides:[{id:'target',accountId:'A',revision:1,categoryContentRevision:10,details:{tags:['old']}},{id:'sibling',accountId:'A',revision:2,categoryContentRevision:10,details:{tags:['sibling']}},{id:'foreign',accountId:'B',revision:3,categoryContentRevision:20,details:{tags:['foreign']}}],sections:[{id:'section',collectionId:'target',accountId:'A',title:'दिन',description:'old',blocks:{tags:['café']},displayOrder:0,createdAt:'old',updatedAt:'old'},{id:'foreign-section',collectionId:'foreign',accountId:'B',title:'foreign',description:null,blocks:{tags:[]},displayOrder:0,createdAt:'old',updatedAt:'old'}],personas:{ownerA:{accountId:'A',guidesContentRevision:10},ownerB:{accountId:'B',guidesContentRevision:20}},media:[{id:'asset'}],objects:[],attachments:[]};
 const expected={collectionId:'target',revision:11,details:{tags:['old']},sections:[{id:'section',title:'दिन café',description:'new',blocks:{tags:['café']}}]},after=structuredClone(before);
 after.guides.filter(g=>g.accountId==='A').forEach(g=>g.categoryContentRevision=11);after.personas.ownerA.guidesContentRevision=11;Object.assign(after.sections[0],expected.sections[0],{updatedAt:'new'});
 assertEditorPersistedScope(before,after,expected,'section');
 for(const mutate of [(x:typeof after)=>x.guides[1].details.tags.push('lost'),(x:typeof after)=>x.sections[1].title='changed',(x:typeof after)=>x.sections[0].createdAt='changed',(x:typeof after)=>x.guides[0].revision++,(x:typeof after)=>x.media.push({id:'extra'}),(x:typeof after)=>x.personas.ownerB.guidesContentRevision++]){const bad=structuredClone(after);mutate(bad);expect(()=>assertEditorPersistedScope(before,bad,expected,'section')).toThrow();}
 const details=structuredClone(before);details.guides.filter(g=>g.accountId==='A').forEach(g=>g.categoryContentRevision=11);details.personas.ownerA.guidesContentRevision=11;details.guides[0].details={tags:['new']};assertEditorPersistedScope(before,details,{...expected,details:{tags:['new']}},undefined);
});

it('actual editor aggregate and original command keys reject unowned changes and reused intent keys',()=>{
 const {assertEditorAggregate,assertOriginalGuideCommandKey}=specFunctions(['assertEditorAggregate','assertOriginalGuideCommandKey']);
 const expected={collectionId:'guide',revision:10,details:{estimatedBudget:'1234.50',place:{lat:0,lng:0}},sections:[{id:'one',title:'दिन café',description:'edited',blocks:{tags:['old']},displayOrder:0,createdAt:'old',updatedAt:'old'},{id:'two',title:'sibling',description:null,blocks:{tags:['sibling']},displayOrder:1,createdAt:'old',updatedAt:'old'}],sectionCount:2,nextCursor:null},actual=structuredClone(expected);actual.revision=11;actual.sections[0].updatedAt='new';assertEditorAggregate(expected,actual,'one');
 for(const mutate of [(v:typeof actual)=>v.revision=10,(v:typeof actual)=>v.sections[1].blocks.tags.push('changed'),(v:typeof actual)=>v.sections[0].displayOrder=1,(v:typeof actual)=>v.details.estimatedBudget='0.00']){const bad=structuredClone(actual);mutate(bad);expect(()=>assertEditorAggregate(expected,bad,'one')).toThrow();}
 const seen=new Set<string>(),key='aaaaaaaa-0000-4000-8000-000000000001',response=(value?:string)=>({request:()=>({headers:()=>value?{'idempotency-key':value}:{}})});assertOriginalGuideCommandKey(response(key),seen);expect(seen.has(key)).toBe(true);expect(()=>assertOriginalGuideCommandKey(response(key),seen)).toThrow();expect(()=>assertOriginalGuideCommandKey(response(),seen)).toThrow();expect(()=>assertOriginalGuideCommandKey(response('invalid'),seen)).toThrow();
});

it('actual parent details acknowledgement requires the original whole PUT command',async()=>{
 const {detailsAcknowledgement}=specFunctions(['detailsAcknowledgement']);let predicate!:(r:unknown)=>boolean;const page={waitForResponse:(fn:(r:unknown)=>boolean)=>{predicate=fn;return Promise.resolve();}},command={revision:9,details:{tags:['café'],place:{lat:0,lng:0}}};await detailsAcknowledgement(page,'guide',command);
 const response=(data:unknown=command,method='PUT',path='/collections/guide/guide')=>({url:()=>`http://127.0.0.1:6000/api/explorers/v1${path}`,request:()=>({method:()=>method,postDataJSON:()=>data})});expect(predicate(response())).toBe(true);expect(predicate(response({...command,details:{tags:[]}}))).toBe(false);expect(predicate(response(command,'PATCH'))).toBe(false);expect(predicate(response(command,'PUT','/collections/foreign/guide'))).toBe(false);
});

it('actual native tip selector reaches the component ancestor containing its editable draft',()=>{
 const root=resolve(import.meta.dirname,'../../../..'),component=ts.createSourceFile('tip.tsx',readFileSync(resolve(root,'explorers-earth/src/features/Guides/components/GuideDetails/EditTipModal.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const headings:ts.JsxElement[]=[];function walk(n:ts.Node){if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(component)==='h2'&&n.children.some(c=>ts.isJsxText(c)&&c.text.trim()==='Edit Tip'))headings.push(n);ts.forEachChild(n,walk);}walk(component);expect(headings).toHaveLength(1);
 let ancestor:ts.Node=headings[0],depth=0;while(ancestor.parent){ancestor=ancestor.parent;if(!ts.isJsxElement(ancestor))continue;depth++;let textareas=0;function inspect(n:ts.Node){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(component)==='textarea')textareas++;ts.forEachChild(n,inspect);}inspect(ancestor);if(textareas)break;}expect(depth).toBe(4);
 const ast=ts.createSourceFile('spec.ts',readFileSync(resolve(root,'explorers-earth/e2e/replatform/guides.spec.ts'),'utf8'),ts.ScriptTarget.Latest,true),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='openNativeTip');expect(fn?.getText(ast)).toContain("locator('"+Array(depth).fill('..').join('/')+"')");
});

it('case one awaits the retained Timeline view and exact section headings before opening its editor',()=>{
 const file=resolve(import.meta.dirname,'../../../..','explorers-earth/e2e/replatform/guides.spec.ts'),ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 const tests:ts.CallExpression[]=[];function collect(n:ts.Node){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='test'&&n.arguments[0]?.getText(ast)==='GUIDES_CASES[1]')tests.push(n);ts.forEachChild(n,collect);}collect(ast);expect(tests).toHaveLength(1);
 const readiness:ts.CallExpression[]=[],rows:ts.VariableDeclaration[]=[];function inspect(n:ts.Node){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='sectionOrder')readiness.push(n);if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='row')rows.push(n);ts.forEachChild(n,inspect);}inspect(tests[0].arguments[1]);expect(rows).toHaveLength(1);expect(readiness).toHaveLength(1);expect(ts.isAwaitExpression(readiness[0].parent)).toBe(true);expect(readiness[0].pos).toBeLessThan(rows[0].pos);expect(readiness[0].arguments.map(a=>a.getText(ast))).toEqual(['page','guide.title','current.sections.map(s=>s.title)']);
});
