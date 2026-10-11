import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {expect,it} from 'vitest';
import {guideSectionBlocksSchema} from '../../../shared/explorersGuideContract';
import {buildGuidesSeedPlan,GUIDES_CASES} from '../../../scripts/guides-browser-support';
import {toDayPlace,toStay,toTimeline,toBudget,toTransport,toActivities,toCanonicalSectionBlocks} from '../../../../explorers-earth/src/features/Guides/api/guidesViewModel';
import {parseStay,parseTimeline,parseBudget} from '../../../../explorers-earth/src/features/Guides/utils/guideDataParser';

// Execute the retained handler, with only its UI and persistence boundaries closed.
// This catches dropped fields and wrong identity matches in the actual save payload.
function actualSubmit(){
 const file=resolve(import.meta.dirname,'../../../..','explorers-earth/src/features/Guides/components/GuideDetails/EditStayModal.tsx');
 const ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const matches:ts.VariableDeclaration[]=[];
 function walk(n:ts.Node){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='handleSubmit')matches.push(n);ts.forEachChild(n,walk);}walk(ast);
 expect(matches).toHaveLength(1);
 const expression=ts.createPrinter().printNode(ts.EmitHint.Expression,matches[0].initializer!,ast);
 const code=ts.transpileModule(`function create({stay,stayPlace,sectionId,getSection,saveSection,setLoading,toast,onSuccess,onClose,parseStay,parseTimeline,parseBudget}){return (${expression});}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function(code+';return create;')();
}

function fixture(){
 const blocks=structuredClone(buildGuidesSeedPlan(GUIDES_CASES[1]).sections[0].blocks);
 const stay=toDayPlace(blocks.stay.accommodations[0]);
 const section={Title:'Preserved title',Description:'Preserved description',Stay:toStay(blocks),Timeline:toTimeline(blocks),Budget:toBudget(blocks),Transport:toTransport(blocks),Recommendation_Activity:toActivities(blocks),Map_Details:blocks.mapDetails,Packing_List:blocks.packingList.items,Pre_Tasks:blocks.preTasks.items,Section_tags:blocks.tags};
 return {blocks,stay,section};
}

async function submit(f:ReturnType<typeof fixture>,changed=false){
 let patch:any;
 const errors:string[]=[];
 const location={lat:()=>changed?12:f.stay.geometry!.location.lat,lng:()=>changed?34:f.stay.geometry!.location.lng};
 await actualSubmit()({stay:f.stay,stayPlace:{name:changed?'New hotel':f.stay.name,formatted_address:changed?'New address':f.stay.formatted_address,place_id:changed?'new-provider':f.stay.place_id,types:changed?['lodging']:f.stay.types,geometry:{location}},sectionId:'section',getSection:(id:string)=>{expect(id).toBe('section');return f.section;},saveSection:async(id:string,value:any)=>{expect(id).toBe('section');patch=value;},setLoading:()=>{},toast:{error:(m:string)=>errors.push(m),success:()=>{}},onClose:()=>{},parseStay,parseTimeline,parseBudget})();
 expect(errors).toEqual([]);expect(patch).toBeDefined();
 return {patch,canonical:toCanonicalSectionBlocks({...f.section,...patch})};
}

it('unchanged accommodation save preserves every canonical stay field and seeded exact money',async()=>{
 const f=fixture();const {canonical}=await submit(f);
 expect(canonical.stay).toEqual(f.blocks.stay);
 expect(canonical.stay.accommodations[0].budgetAmount).toBe('100.00');
 expect(canonical.stay.accommodations[0].budgetCurrency).toBe('INR');
});

it('provider changes preserve stay metadata and synchronize each matching timeline and budget entry',async()=>{
 const f=fixture();
 f.stay.photos=[{id:'activity-photo-8e8160b5-f454-4a88-8595-a2f7d4bcc994',documentId:'8e8160b5-f454-4a88-8595-a2f7d4bcc994',url:'/api/explorers/v1/media/8e8160b5-f454-4a88-8595-a2f7d4bcc994/content',fileName:'Hotel.jpg',width:640,height:480,aspectRatio:'4:3'}];
 f.stay.tips='Keep this note';f.stay.source='google';f.stay.isVerified=true;
 const row={localId:f.stay.id,place_id:f.stay.place_id,name:f.stay.name,budgetAmount:100.25,budgetCurrency:'INR',customBudget:'Hotel budget',priceRange:'Range',priceLevel:2};
 // Retain the seed's other entries: its untouched transport segments refer to them.
 for(const period of ['morning','afternoon','evening'] as const){f.section.Timeline[period]=[f.stay,...f.section.Timeline[period].filter(p=>p.id!==f.stay.id)];f.section.Budget[period]=[{...row}];}
 const {patch,canonical}=await submit(f,true);
 expect(guideSectionBlocksSchema.parse(canonical)).toEqual(canonical);
 expect(patch.Stay.accommodations[0]).toEqual({...f.stay,name:'New hotel',formatted_address:'New address',place_id:'new-provider',geometry:{location:{lat:12,lng:34}},types:['lodging']});
 for(const period of ['morning','afternoon','evening'] as const){
  expect(patch.Timeline[period][0]).toEqual(patch.Stay.accommodations[0]);
  expect(patch.Timeline[period].slice(1)).toEqual(f.section.Timeline[period].slice(1));
  expect(patch.Budget[period]).toEqual([{...row,place_id:'new-provider',name:'New hotel'}]);
  expect(canonical.budget[period][0].budgetAmount).toBe('100.25');
 }
 expect(Object.keys(patch).sort()).toEqual(['Budget','Stay','Timeline','description','title']);
 for(const key of ['transport','activities','mapDetails','packingList','preTasks','tags'] as const)expect(canonical[key]).toEqual(toCanonicalSectionBlocks(f.section)[key]);
});

it('money-only stays create a budget row without removing a different local entry sharing the provider',async()=>{
 const f=fixture();delete f.stay.priceLevel;delete f.stay.priceRange;delete f.stay.customBudget;
 f.stay.budgetAmount=0;f.stay.budgetCurrency='INR';
 f.section.Timeline.morning=[f.stay];
 const other={localId:'other-local',place_id:f.stay.place_id,name:'Other visit',budgetAmount:51.75,budgetCurrency:'USD'};
 f.section.Budget.morning=[other];
 const {patch}=await submit(f,true);
 expect(patch.Budget.morning).toEqual([other,{localId:f.stay.id,place_id:'new-provider',name:'New hotel',priceLevel:undefined,priceRange:undefined,customBudget:undefined,budgetAmount:0,budgetCurrency:'INR'}]);
});

it('absent timeline periods remove only the edited local row and preserve untouched entries',async()=>{
 const f=fixture();f.section.Timeline={morning:[],afternoon:[],evening:[]};
 const other={localId:'other-local',place_id:f.stay.place_id,name:'Other visit',budgetAmount:51.75,budgetCurrency:'USD'};
 const matching={localId:f.stay.id,place_id:'stale-provider',name:'Stale row',budgetAmount:100,budgetCurrency:'INR'};
 for(const period of ['morning','afternoon','evening'] as const)f.section.Budget[period]=[other,matching];
 const {patch}=await submit(f);
 for(const period of ['morning','afternoon','evening'] as const)expect(patch.Budget[period]).toEqual([other]);
});
