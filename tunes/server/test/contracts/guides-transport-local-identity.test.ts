import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {expect,it} from 'vitest';
import {buildGuidesSeedPlan,GUIDES_CASES} from '../../../scripts/guides-browser-support';
import {guideSectionBlocksSchema, type GuideSectionBlocks} from '../../../shared/explorersGuideContract';
import {toGuideSection} from '../../../../explorers-earth/src/features/Guides/api/guidesViewModel';
import {getTransportSegments} from '../../../../explorers-earth/src/features/Guides/utils/guideHelpers';
import {parseTimeline,parseStay,parseActivity} from '../../../../explorers-earth/src/features/Guides/utils/guideDataParser';
import type {DayPlace,TransportSegment} from '../../../../explorers-earth/src/features/Guides/types/guideSectionTypes';

const file=resolve(import.meta.dirname,'../../../..','explorers-earth/src/features/Guides/components/GuideDetails/TransportationTimeline.tsx');
type Section=ReturnType<typeof toGuideSection>;
type Node={id:string;from:Pick<DayPlace,'name'|'place_id'>;to:Pick<DayPlace,'name'|'place_id'>;segment:TransportSegment};
type Group={sectionId:string;transportNodes:Node[]};
function actualGroups(sections:Section[]):Group[]{
 const ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const found:ts.VariableDeclaration[]=[];
 function walk(node:ts.Node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='sectionGroups')found.push(node);ts.forEachChild(node,walk);}walk(ast);
 expect(found).toHaveLength(1);
 const call=found[0].initializer;
 if(!call||!ts.isCallExpression(call)||call.expression.getText(ast)!=='useMemo'||!ts.isArrowFunction(call.arguments[0]))throw new Error('Expected actual sectionGroups memo callback');
 const expression=ts.createPrinter().printNode(ts.EmitHint.Expression,call.arguments[0],ast);
 const code=ts.transpileModule('const actual = '+expression,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function('guide','getTransportSegments','parseTimeline','parseStay','parseActivity',code+';return actual();')({guide_sections:sections},getTransportSegments,parseTimeline,parseStay,parseActivity) as Group[];
}
function fixture(change?:(blocks:GuideSectionBlocks)=>void){
 const seed=buildGuidesSeedPlan(GUIDES_CASES[1]).sections[0];
 const blocks=guideSectionBlocksSchema.parse(seed.blocks);change?.(blocks);
 const valid=guideSectionBlocksSchema.parse(blocks);
 return toGuideSection({id:'section',collectionId:'guide',title:seed.title,description:seed.description,displayOrder:0,blocks:valid,archived:false,createdAt:'2026-10-11T00:00:00Z',updatedAt:'2026-10-11T00:00:00Z'});
}
it('actual transport memo resolves seeded local handles and retains provider IDs for directions',()=>{
 const section=fixture(),groups=actualGroups([section]);
 expect(groups).toHaveLength(1);
 expect(groups[0].transportNodes).toHaveLength(1);
 expect(groups[0].transportNodes[0]).toMatchObject({from:{name:section.Timeline.morning[0].name,place_id:'guide_morning'},to:{name:section.Timeline.afternoon[0].name,place_id:'guide_afternoon'},segment:section.Transport.segments[0]});
});
it('actual transport memo distinguishes repeated visits to one provider and deduplicates only identical local pairs',()=>{
 const section=fixture(blocks=>{
  const first=blocks.items[0];if(first.kind!=='place')throw new Error('Seed day starts with a place');
  blocks.items.push({kind:'place',localId:'return-visit',timeLabel:'afternoon',place:{...first.place,localId:'return-visit',name:'Return visit'}});
  blocks.transport.segments.push({...blocks.transport.segments[0],toLocalId:'return-visit'});
  blocks.transport.segments.push({...blocks.transport.segments[0]});
 });
 const nodes=actualGroups([section,section])[0]?.transportNodes;
 expect(nodes).toHaveLength(2);
 expect(nodes?.map(node=>[node.segment.fromPlaceId,node.segment.toPlaceId,node.to.name])).toEqual([['morning','afternoon',section.Timeline.afternoon[0].name],['morning','return-visit','Return visit']]);
 expect(new Set(nodes?.map(node=>node.id)).size).toBe(2);
});
it('actual transport memo renders valid persisted stay and activity endpoints without creating transitions',()=>{
 const section=fixture(blocks=>{blocks.transport.segments=[
  {...blocks.transport.segments[0],toLocalId:'stay'},
  {...blocks.transport.segments[0],fromLocalId:'stay',toLocalId:'activity',mode:'bike'},
 ];});
 const nodes=actualGroups([section])[0]?.transportNodes;
 expect(nodes?.map(node=>[node.segment.fromPlaceId,node.segment.toPlaceId])).toEqual([['morning','stay'],['stay','activity']]);
 expect(nodes?.[1]).toMatchObject({from:{place_id:section.Stay.accommodations[0].place_id},to:{place_id:section.Recommendation_Activity.activities[0].place_id},segment:{mode:'bike'}});
});
it('actual transport memo rejects dangling and provider-keyed references and tolerates absent blocks',()=>{
 const section=fixture();
 const original=section.Transport.segments[0];
 section.Transport.segments.push({...original,toPlaceId:'missing-local'},{...original,fromPlaceId:section.Timeline.morning[0].place_id});
 expect(actualGroups([section])[0]?.transportNodes.map(node=>node.segment)).toEqual([original]);
 expect(actualGroups([{...section,Timeline:undefined,Stay:undefined,Recommendation_Activity:undefined} as unknown as Section])).toEqual([]);
 expect(actualGroups([{...section,Transport:{segments:null}} as unknown as Section])).toEqual([]);
});
