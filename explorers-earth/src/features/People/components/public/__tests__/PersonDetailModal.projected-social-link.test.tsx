import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {personEntityDetailsSchema,emptyPersonDetails,type PersonEntityDetails} from '../../../../../../../tunes/shared/explorersPersonContract';
import {displayOverridesReadSchema} from '../../../../../../../tunes/shared/explorersContract';
import {effectivePersonDetails} from '../../../../../../../tunes/server/repositories/personCatalogRepository';
import {normalizeRichNote} from '../../../../../../../tunes/server/application/richNote';
import {publicPersonViewModel} from '../../../api/publicPeopleSectorViewModel';
import PersonDetailModal from '../PersonDetailModal';

vi.mock('../../../../../components/ui/MediaViewer',()=>({default:()=>null}));
vi.mock('../../../../../hooks/useMediaViewer',()=>({convertToMediaItems:()=>[],useMediaViewer:()=>({isOpen:false,currentIndex:0,openViewer:vi.fn(),closeViewer:vi.fn()})}));
afterEach(cleanup);
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function actualProjection(){
 const path='../tunes/server/publicProfile/publicPeopleProjection.ts',source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true);
 const declaration=source.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='richPerson');
 if(!declaration)throw Error('Actual public person projection unavailable');
 const body=ts.transpileModule(declaration.getText(source)+'\nreturn richPerson;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return Function('publicAssignedTaxonomy','readPersonEntity','displayOverridesReadSchema','effectivePersonDetails','presentedPlatform','normalizeRichNote','projectedPersonEntities',body)(
  async()=>({root:null}),async(_db:unknown,entityId:string)=>({id:entityId,title:'Explicit person',details:currentFacts}),displayOverridesReadSchema,effectivePersonDetails,
  (stored:string|null)=>stored==='twitter'?'x':stored,normalizeRichNote,new WeakMap<object,string>(),
 ) as (db:unknown,row:Record<string,unknown>)=>Promise<unknown>;
}
let currentFacts:PersonEntityDetails=emptyPersonDetails();
async function mount(facts:Partial<PersonEntityDetails>){
 currentFacts=personEntityDetailsSchema.parse({...emptyPersonDetails(),...facts});
 const raw=await actualProjection()({}, {id:id(1),account_id:id(2),entity_id:id(3),note:null,note_bytes:0,override_bytes:0,display_values:{},user_rating:null,pin_order:null,display_order:0,collection_id:id(4),collection_title:'List',collection_slug:'list'});
 const person=publicPersonViewModel(raw);
 render(<PersonDetailModal person={person} open onClose={()=>{}}/>);
 return person;
}
it('actual public projection and mounted modal expose an explicitly stored website without inventing a primary platform',async()=>{
 const person=await mount({socialUrls:{website:'https://example.test/person'}});
 expect(screen.getByRole('link',{name:'View Profile'}).getAttribute('href')).toBe('https://example.test/person');
 expect(person.primary_platform).toBeNull();expect(person.platform).toBeNull();expect(person.social_urls).toEqual({website:'https://example.test/person'});
});
it('explicit primary and selected-platform links retain precedence over website',async()=>{
 await mount({primaryPlatform:'twitter',socialUrls:{primary:'https://example.test/primary',twitter:'https://example.test/twitter',website:'https://example.test/website'}});
 expect(screen.getByRole('link',{name:'View Profile'}).getAttribute('href')).toBe('https://example.test/primary');cleanup();
 await mount({primaryPlatform:'twitter',socialUrls:{twitter:'https://example.test/twitter',website:'https://example.test/website'}});
 expect(screen.getByRole('link',{name:'View Profile'}).getAttribute('href')).toBe('https://example.test/twitter');
});
it('absent social URLs retain null facts and render no invented profile link',async()=>{
 const person=await mount({});expect(person.profile_url).toBeUndefined();expect(person.primary_platform).toBeNull();expect(person.social_urls).toBeNull();
 expect(screen.queryByRole('link',{name:'View Profile'})).toBeNull();
});
