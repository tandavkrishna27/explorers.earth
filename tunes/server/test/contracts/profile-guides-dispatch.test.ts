import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Run the actual entry statements; closed imports forbid native effects.
const source=readFileSync(new URL('../../../scripts/profile-browser-fixture.ts',import.meta.url),'utf8');
function entry(run:()=>Promise<void>,factoryError?:unknown,formatter=(error:unknown)=>'Guides owned fixture failed\n'){
 const parsed=ts.createSourceFile('fixture.ts',source,ts.ScriptTarget.Latest,true);
 const body=ts.createPrinter().printList(ts.ListFormat.MultiLine,ts.factory.createNodeArray(parsed.statements.filter(node=>!ts.isImportDeclaration(node))),parsed).replaceAll('import.meta.dirname','fixtureModuleDirectory');
 const code=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const legacy=vi.fn(()=>{throw Error('Legacy allocation reached');}),write=vi.fn(),apps=vi.fn(()=>{throw Error('Apps dispatch reached');});
 const names=['process','fixtureModuleDirectory','extractProtectedReceiptArguments','parseBrowserSuite','assertBrowserEnvironment','createAppsBrowserFixture','extractAppsFixtureDiagnostic','createGuidesBrowserFixture','resolve','createProtectedReceipt','randomBytes','mkdtempSync','prepareFixtureMusicTokenSecret','formatGuidesFixtureFailure'];
 const process={argv:['node','fixture','--suite','guides','--ack','TASK4_FIXTURE_OWNED_DISPOSABLE_PG15','--receipt-directory','C:\\private','--receipt-capability','a'.repeat(64)],env:{},exitCode:undefined as number|undefined,stderr:{write}};
 const factory=vi.fn(()=>{if(factoryError)throw factoryError;return{run};});
 const values=[process,'closed-fake-module-directory',()=>({args:process.argv.slice(2)}),()=> 'guides',()=>undefined,apps,apps,factory,legacy,legacy,legacy,legacy,legacy,formatter];
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 return {execute:()=>new AsyncFunction(...names,code)(...values),legacy,apps,factory,process,write};
}

describe('Guides profile entry dispatch ordering',()=>{
 it('passes the original failure to the private bounded formatter exactly once',async()=>{const error=Error('private'),format=vi.fn(()=> 'bounded marker\n'),s=entry(async()=>{throw error;},undefined,format);await s.execute();expect(format).toHaveBeenCalledExactlyOnceWith(error);expect(s.write).toHaveBeenCalledExactlyOnceWith('bounded marker\n');});
 it('awaits the original Guides run before entry completion without legacy allocation',async()=>{
  let finish!:()=>void;const run=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;})),s=entry(run);let complete=false;
  const result=s.execute().then(()=>{complete=true;});result.catch(()=>undefined);await Promise.resolve();
  expect(s.factory).toHaveBeenCalledExactlyOnceWith();expect(run).toHaveBeenCalledExactlyOnceWith();expect(complete).toBe(false);expect(s.legacy).not.toHaveBeenCalled();expect(s.apps).not.toHaveBeenCalled();
  finish();await result;expect(complete).toBe(true);expect(s.legacy).not.toHaveBeenCalled();expect(s.write).not.toHaveBeenCalled();expect(s.process.exitCode).toBeUndefined();
 });
 it.each([Error('private capability and cookie'),{name:'Refusal',message:'GUIDES_ROOT_FAILED',stage:'PRIVATE_SENTINEL',category:'PRIVATE_SENTINEL'},'PRIVATE_SENTINEL',null])('sanitizes runner rejection without fallback or forged branding: %j',async error=>{
  const s=entry(async()=>{throw error;});await s.execute();expect(s.process.exitCode).toBe(1);expect(s.write).toHaveBeenCalledExactlyOnceWith('Guides owned fixture failed\n');expect(s.legacy).not.toHaveBeenCalled();expect(s.apps).not.toHaveBeenCalled();
 });
 it('sanitizes factory refusal without allocating legacy resources',async()=>{
  const run=vi.fn(async()=>{}),s=entry(run,Error('PRIVATE_SENTINEL'));await s.execute();expect(run).not.toHaveBeenCalled();expect(s.process.exitCode).toBe(1);expect(s.write).toHaveBeenCalledExactlyOnceWith('Guides owned fixture failed\n');expect(s.legacy).not.toHaveBeenCalled();
 });
 it('uses the approved fixed effect-free Guides factory import',()=>{
  const parsed=ts.createSourceFile('fixture.ts',source,ts.ScriptTarget.Latest,true);
  expect(parsed.statements.some(node=>ts.isImportDeclaration(node)&&node.moduleSpecifier.getText(parsed)==="'./guides-browser-fixture'"&&node.importClause?.namedBindings?.getText(parsed)==='{ createGuidesBrowserFixture, formatGuidesFixtureFailure }')).toBe(true);
 });
});
