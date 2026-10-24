import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {expect,it} from 'vitest';
import {buildGuidesSeedPlan,GUIDES_CASES} from '../../../scripts/guides-browser-support';
import {toGuideSection,toCanonicalSectionBlocks} from '../../../../explorers-earth/src/features/Guides/api/guidesViewModel';
import {guideSectionBlocksSchema} from '../../../shared/explorersGuideContract';
import {calculateDistance} from '../../../../explorers-earth/src/features/Guides/utils/distanceCalculator';
import {calculateTravelTime} from '../../../../explorers-earth/src/features/Guides/utils/travelModeConfig';
// handleSubmit calls guideDescriptionText, and this harness compiles that initializer with
// new Function(...Object.keys(context)), so the binding has to be injected or every case dies
// with a ReferenceError that reads as a form defect. The sibling
// GuideSectionForm.description.test.ts already injects it this way.
import {guideDescriptionText} from '../../../../explorers-earth/src/utils/guideDescriptionText';

const file=resolve(import.meta.dirname,'../../../..','explorers-earth/src/features/Guides/components/GuideSectionForm.tsx');
function actual(names:string[],context:Record<string,unknown>){
 const ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),found=new Map<string,ts.VariableDeclaration>();
 function walk(n:ts.Node){if(ts.isVariableDeclaration(n)&&names.includes(n.name.getText(ast)))found.set(n.name.getText(ast),n);ts.forEachChild(n,walk);}walk(ast);
 expect(found.size).toBe(names.length);
 const code=ts.transpileModule(names.map(name=>'const '+name+' = '+ts.createPrinter().printNode(ts.EmitHint.Expression,found.get(name)!.initializer!,ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function(...Object.keys(context),code+';return {'+names.join(',')+'};')(...Object.values(context));
}
function fixture(){
 const seed=buildGuidesSeedPlan(GUIDES_CASES[1]).sections[0];
 const blocks=guideSectionBlocksSchema.parse({...seed.blocks,mapDetails:{center:{lat:12,lng:13},zoom:9},packingList:{items:[{localId:'pack',label:'Water',done:true}]},preTasks:{items:[{localId:'task',label:'Book',done:false}]},tags:['दिन']});
 const initialData=toGuideSection({id:'section',collectionId:'guide',title:seed.title,description:seed.description,displayOrder:0,blocks,archived:false,createdAt:'2026-10-11T00:00:00Z',updatedAt:'2026-10-11T00:00:00Z'});
 return {blocks,initialData};
}
async function submit(initialData:ReturnType<typeof fixture>['initialData'],overrides:Record<string,unknown>={}){
 let saved:any;
 const context={initialData,sectionId:'section',title:'Edited title',description:'',morningPlaces:initialData.Timeline.morning,afternoonPlaces:initialData.Timeline.afternoon,eveningPlaces:initialData.Timeline.evening,transportSegments:initialData.Transport.segments,stayAccommodations:initialData.Stay.accommodations,activityPlaces:initialData.Recommendation_Activity.activities,pendingActivityUploadsRef:{current:[]},isMultiCityGuide:false,selectedLocation:'',sequence:1,htmlToBlocks:()=>[],setLoading:()=>{},onLoadingChange:undefined,onSuccess:undefined,toast:{success:()=>{},error:()=>{}},saveSection:async (_:string,data:unknown)=>{saved=data;},calculateDistance,calculateTravelTime,guideDescriptionText,...overrides};
 const functions=actual(['generateCompleteTransportSegments','handleSubmit'],context);
 await functions.handleSubmit({preventDefault(){}});
 expect(saved).toBeDefined();return saved;
}
it('actual title-only submit preserves every canonical block and independent budget metadata',async()=>{
 const {blocks,initialData}=fixture();
 blocks.budget.entries[0].budgetAmount='0.00';
 initialData.Budget.morning[0].budgetAmount=0;
 const stayBudget={...initialData.Budget.morning[0],localId:initialData.Stay.accommodations[0].id};
 initialData.Budget.evening.push(stayBudget);
 blocks.budget.entries.push({...blocks.budget.entries[0],localId:stayBudget.localId});
 const saved=await submit(initialData);
 expect(guideSectionBlocksSchema.parse(toCanonicalSectionBlocks(saved))).toEqual(blocks);
});
it('actual edit submit retains absent and nonadjacent transport and explicit mode changes',async()=>{
 const {initialData}=fixture();
 expect((await submit(initialData,{transportSegments:[]})).Transport.segments).toEqual([]);
 const changed=initialData.Transport.segments.map(s=>({...s,mode:'bike'}));
 expect((await submit(initialData,{transportSegments:changed})).Transport.segments).toEqual(changed);
 const nonadjacent=[{...changed[0],toPlaceId:initialData.Timeline.evening[0].id,distanceKm:null,estimatedMinutes:null}];
 expect((await submit(initialData,{transportSegments:nonadjacent})).Transport.segments).toEqual(nonadjacent);
});
it('actual changed timeline removes dangling transport and generates only local adjacent pairs',async()=>{
 const {initialData}=fixture();
 const first=initialData.Timeline.morning[0],added={...first,id:'another-local',place_id:first.place_id};
 const saved=await submit(initialData,{morningPlaces:[first,added],afternoonPlaces:[],eveningPlaces:[]});
 expect(saved.Transport.segments.map((s:any)=>[s.fromPlaceId,s.toPlaceId])).toEqual([[first.id,added.id]]);
});
it('actual local budget edit changes only the intended row despite duplicate provider IDs',async()=>{
 const {initialData}=fixture();
 const first=initialData.Timeline.morning[0],second={...first,id:'second-local'};
 initialData.Timeline.morning.push(second);
 initialData.Budget.morning.push({...initialData.Budget.morning[0],localId:second.id,budgetAmount:0,budgetCurrency:'EUR'});
 const saved=await submit(initialData,{morningPlaces:[{...first,budgetAmount:12.34,budgetCurrency:'USD'},second]});
 expect(saved.Budget.morning[0]).toMatchObject({localId:first.id,budgetAmount:12.34,budgetCurrency:'USD'});
 expect(saved.Budget.morning[1]).toEqual(initialData.Budget.morning[1]);
 expect(saved.Budget.afternoon).toEqual(initialData.Budget.afternoon);
});
it('actual transport helpers isolate same-provider local entries and persist explicit mode without geometry',()=>{
 const {initialData}=fixture(),first=initialData.Timeline.morning[0],second={...first,id:'second-local',geometry:undefined};
 const existing={fromPlaceId:first.id,toPlaceId:second.id,mode:'walk',distanceKm:null,estimatedMinutes:null};
 let state=[existing];
 const helpers=actual(['getTransportSegment','updateTransportSegment'],{transportSegments:state,setTransportSegments:(fn:(p:typeof state)=>typeof state)=>{state=fn(state);},calculateDistance,calculateTravelTime,toast:{success(){}}});
 expect(helpers.getTransportSegment(first,second)).toEqual(existing);
 helpers.updateTransportSegment(first,second,'bike');
 expect(state).toEqual([{...existing,mode:'bike'}]);
});
it('actual new section generation retains defaults using local references',()=>{
 const {initialData}=fixture();
 const helpers=actual(['generateCompleteTransportSegments'],{initialData:undefined,morningPlaces:initialData.Timeline.morning,afternoonPlaces:initialData.Timeline.afternoon,eveningPlaces:initialData.Timeline.evening,stayAccommodations:initialData.Stay.accommodations,activityPlaces:initialData.Recommendation_Activity.activities,transportSegments:[],calculateDistance,calculateTravelTime});
 expect(helpers.generateCompleteTransportSegments().map((s:any)=>[s.fromPlaceId,s.toPlaceId,s.mode])).toEqual([['morning','afternoon','drive'],['afternoon','evening','drive']]);
});
it('actual changed route retains valid manual nonadjacent connections and rejects foreign references',async()=>{
 const {initialData}=fixture(),first=initialData.Timeline.morning[0],last=initialData.Timeline.evening[0];
 const manual={fromPlaceId:first.id,toPlaceId:last.id,mode:'walk',distanceKm:1,estimatedMinutes:20};
 const saved=await submit(initialData,{morningPlaces:[first,{...first,id:'new'}],transportSegments:[manual,{...manual,fromPlaceId:first.place_id}]});
 expect(saved.Transport.segments[0]).toEqual(manual);
 expect(saved.Transport.segments.some((s:any)=>s.fromPlaceId===first.place_id)).toBe(false);
});
it('actual changed timeline retains manual connections to persisted stay and activity entries',async()=>{
 const {initialData}=fixture(),first=initialData.Timeline.morning[0];
 const stay=initialData.Stay.accommodations[0],activity=initialData.Recommendation_Activity.activities[0];
 const manual=[
  {fromPlaceId:first.id,toPlaceId:stay.id,mode:'walk',distanceKm:1,estimatedMinutes:20},
  {fromPlaceId:stay.id,toPlaceId:activity.id,mode:'bike',distanceKm:null,estimatedMinutes:null},
 ];
 const dangling={...manual[0],toPlaceId:'removed-local'};
 const saved=await submit(initialData,{morningPlaces:[first,{...first,id:'new'}],transportSegments:[...manual,dangling]});
 expect(saved.Transport.segments.slice(0,2)).toEqual(manual);
 expect(saved.Transport.segments.some((s:any)=>s.toPlaceId==='removed-local')).toBe(false);
 expect(guideSectionBlocksSchema.safeParse(toCanonicalSectionBlocks(saved)).success).toBe(true);
});
