import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {expect,it} from 'vitest';
import {buildGuidesSeedPlan,GUIDES_CASES} from '../../../scripts/guides-browser-support';
import {toDayPlace,toCanonicalDayPlace,toCanonicalBudgetPlace,toTransportSegment,toGuide,toGuideSection} from '../../../../explorers-earth/src/features/Guides/api/guidesViewModel';
import {guideAggregateDtoSchema} from '../../../shared/explorersGuideContract';
import {ownerCollectionDtoSchema} from '../../../shared/explorersOwnerContentContract';
import {calculateDistance} from '../../../../explorers-earth/src/features/Guides/utils/distanceCalculator';
import {calculateTravelTime} from '../../../../explorers-earth/src/features/Guides/utils/travelModeConfig';
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
 const blocks=buildGuidesSeedPlan(GUIDES_CASES[1]).sections[0].blocks;
 expect(extract(blocks.timeline.morning.map(toDayPlace)).map(toCanonicalBudgetPlace)).toEqual(blocks.budget.morning);
});

it('native full section form retains existing transport by entry identity',()=>{
 const file=resolve(import.meta.dirname,'../../../..','explorers-earth/src/features/Guides/components/GuideSectionForm.tsx'),ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const found:ts.VariableDeclaration[]=[];function walk(n:ts.Node){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='generateCompleteTransportSegments')found.push(n);ts.forEachChild(n,walk);}walk(ast);expect(found).toHaveLength(1);
 const code=ts.transpileModule('const generate='+ts.createPrinter().printNode(ts.EmitHint.Expression,found[0].initializer!,ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const blocks=buildGuidesSeedPlan(GUIDES_CASES[1]).sections[0].blocks,existing=blocks.transport.segments.map(toTransportSegment);
 const generate=new Function('morningPlaces','afternoonPlaces','eveningPlaces','transportSegments','calculateDistance','calculateTravelTime','initialData',code+';return generate;')(blocks.timeline.morning.map(toDayPlace),blocks.timeline.afternoon.map(toDayPlace),blocks.timeline.evening.map(toDayPlace),existing,calculateDistance,calculateTravelTime,{Timeline:{morning:blocks.timeline.morning.map(toDayPlace),afternoon:blocks.timeline.afternoon.map(toDayPlace),evening:blocks.timeline.evening.map(toDayPlace)}}) as ()=>typeof existing;
 const actual=generate();expect(actual[0]).toEqual(existing[0]);expect(actual.every(s=>[...blocks.timeline.morning,...blocks.timeline.afternoon,...blocks.timeline.evening].some(p=>p.localId===s.fromPlaceId)&&[...blocks.timeline.morning,...blocks.timeline.afternoon,...blocks.timeline.evening].some(p=>p.localId===s.toPlaceId))).toBe(true);
});

it('actual owner guide mapper hands native detail and full edit surfaces the complete section DTO',()=>{
 const seed=buildGuidesSeedPlan(GUIDES_CASES[1]),id='aaaaaaaa-0000-4000-8000-000000000001',sectionId='aaaaaaaa-0000-4000-8000-000000000002',time='2026-10-11T00:00:00.000Z';
 const collection=ownerCollectionDtoSchema.parse({id,accountId:'aaaaaaaa-0000-4000-8000-000000000003',category:'guides',title:seed.guides[0].title,slug:seed.guides[0].slug,visibility:'public',publicationState:'published',revision:1,description:null,heading:null,coverMediaId:null,archived:false,displayOrder:0});
 const input=seed.sections[0],aggregate=guideAggregateDtoSchema.parse({collectionId:id,revision:1,details:seed.guides[0].details,coverMediaId:null,sections:[{id:sectionId,collectionId:id,title:input.title,description:input.description,displayOrder:0,blocks:input.blocks,archived:false,createdAt:time,updatedAt:time}],sectionCount:1,nextCursor:null});
 expect(toGuide(collection,aggregate).guide_sections?.[0]).toEqual(toGuideSection(aggregate.sections[0]));
});
