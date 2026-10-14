import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Execute the actual entry control flow with imports replaced by closed fakes.
// This establishes dispatch ordering only; it never imports the native runner.
const source=readFileSync(new URL('../../../scripts/profile-browser-fixture.ts',import.meta.url),'utf8');
function entry(run:()=>Promise<void>,diagnostic?:{stage:string;category:string;enrichmentReset?:unknown}){
 const parsed=ts.createSourceFile('fixture.ts',source,ts.ScriptTarget.Latest,true);
 const body=ts.createPrinter().printList(ts.ListFormat.MultiLine,ts.factory.createNodeArray(parsed.statements.filter(node=>!ts.isImportDeclaration(node))),parsed).replaceAll('import.meta.dirname','fixtureModuleDirectory');
 const code=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const legacy=vi.fn(()=>{throw Error('Legacy allocation reached');}),write=vi.fn();
 const names=['process','fixtureModuleDirectory','extractProtectedReceiptArguments','parseBrowserSuite','assertBrowserEnvironment','createAppsBrowserFixture','extractAppsFixtureDiagnostic','resolve','createProtectedReceipt','randomBytes','mkdtempSync','prepareFixtureMusicTokenSecret'];
 const process={argv:['node','fixture','--suite','apps','--ack','TASK4_FIXTURE_OWNED_DISPOSABLE_PG15','--receipt-directory','private','--receipt-capability','a'.repeat(64)],env:{},exitCode:undefined as number|undefined,stderr:{write}};
 const factory=vi.fn(()=>({run}));
 const values=[process,'closed-fake-module-directory',()=>({args:process.argv.slice(2,6)}),()=> 'apps',()=>undefined,factory,()=>diagnostic,legacy,legacy,legacy,legacy,legacy];
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 return {execute:()=>new AsyncFunction(...names,code)(...values),legacy,factory,process,write};
}
describe('Apps profile entry dispatch ordering',()=>{
 it('prints pending reset explicitly with bounded source proof and no thrown payload',async()=>{
  const s=entry(async()=>{throw Error('private body');},{stage:'execution',category:'refusal',enrichmentReset:{state:'pending',stage:'collection-readback',nativePhase:'native-http',sourceProofMs:15000,caseIndex:1,project:'apps-desktop',repeat:0,epoch:2}});
  await s.execute();expect(s.write).toHaveBeenCalledWith('Apps owned fixture failed: stage=execution; category=refusal; enrichmentResetState=pending; enrichmentResetStage=collection-readback; enrichmentResetCaseIndex=1; enrichmentResetProject=apps-desktop; enrichmentResetRepeat=0; enrichmentResetEpoch=2; enrichmentResetNativePhase=native-http; enrichmentResetSourceProofMs=15000\n');
 });
 it('surfaces only the branded finite diagnostic without raw error content',async()=>{
  const s=entry(async()=>{throw Error('private capability and cookie');},{stage:'migrate',category:'refusal'});
  await s.execute();expect(s.process.exitCode).toBe(1);expect(s.write).toHaveBeenCalledWith('Apps owned fixture failed: stage=migrate; category=refusal\n');expect(s.legacy).not.toHaveBeenCalled();
 });
 it('awaits fixed Apps runner before every legacy allocation',async()=>{
  let finish!:()=>void;const run=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;})),s=entry(run);
  const result=s.execute();result.catch(()=>undefined);await Promise.resolve();expect(s.factory).toHaveBeenCalledOnce();expect(run).toHaveBeenCalledOnce();expect(s.legacy).not.toHaveBeenCalled();finish();await result;expect(s.legacy).not.toHaveBeenCalled();
 });
 it('sanitizes Apps runner rejection without legacy fallback',async()=>{
  const s=entry(async()=>{throw Error('private capability and cookie');});await s.execute();expect(s.process.exitCode).toBe(1);expect(s.write).toHaveBeenCalledWith('Apps owned fixture failed\n');expect(s.legacy).not.toHaveBeenCalled();
 });
 it('uses the fixed effect-free factory import',()=>{
  const parsed=ts.createSourceFile('fixture.ts',source,ts.ScriptTarget.Latest,true);
  expect(parsed.statements.some(node=>ts.isImportDeclaration(node)&&node.moduleSpecifier.getText(parsed)==="'./apps-browser-fixture'"&&node.importClause?.namedBindings?.getText(parsed).includes('createAppsBrowserFixture'))).toBe(true);
 });
});
