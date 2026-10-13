import {describe,it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {assertGuidesPowerShellRuntime} from '../../../scripts/guides-launcher';
import path from 'node:path';
import * as fixture from '../../../scripts/guides-browser-fixture';
import {statSync} from 'node:fs';
// HARNESS GATE (not a product assertion). Every case below drives a real PowerShell 7 (Core) host
// chosen explicitly through GUIDES_POWERSHELL_EXECUTABLE; `assertGuidesPowerShellRuntime` has no
// discovery fallback by design. Nothing in the repo or in CI sets that variable, so this file used
// to report three failures that read as Guides product defects on any host where no PS7 was
// selected. Rule now: executable genuinely unavailable => LOUD, explicit, reasoned skip; variable
// set and naming a real file => the cases run and FAIL for real if the gate's subject is wrong.
// A silent skip is as bad as a false failure, so the reason is both logged and put in the suite name.
const configured=process.env.GUIDES_POWERSHELL_EXECUTABLE;
const unavailable=((): string|undefined=>{
 if(process.platform!=='win32')return `host platform is ${process.platform}, and this Guides bootstrap gate is Windows-only`;
 if(!configured)return 'GUIDES_POWERSHELL_EXECUTABLE is unset, so no PowerShell 7 host was selected for the Guides bootstrap gate';
 try{if(!statSync(configured).isFile())return 'GUIDES_POWERSHELL_EXECUTABLE is set but does not name a regular file';}
 catch{return 'GUIDES_POWERSHELL_EXECUTABLE is set but the executable it names is not present on this host';}
 return undefined;
})();
// A loud skip is right on a developer machine, but WRONG in the CI lane that exists to exercise
// this gate: there, an unavailable host must fail, or the gate silently never runs again.
if(unavailable&&process.env.GUIDES_BOOTSTRAP_GATE_REQUIRED)throw new Error(`GUIDES_BOOTSTRAP_GATE_REQUIRED is set, so the Guides bootstrap gate must execute, but ${unavailable}`);
if(unavailable)console.warn(`[SKIP] guides-bootstrap-contract.test.ts: ${unavailable}. Harness gate unavailable - this is NOT a passing Guides product contract and NOT a product defect.`);
const suite=unavailable?describe.skip:describe;
const pwsh=configured as string;
const root=path.resolve(import.meta.dirname,'../../../..');
const script=path.join(root,'tunes/scripts/guides-windows-job.ps1');
const argv=['--suite','guides','--ack','TASK4_FIXTURE_OWNED_DISPOSABLE_PG15','--receipt-directory','C:\\receipts','--receipt-capability','a'.repeat(64)];
function ps(command:string,input?:Buffer){return execFileSync(pwsh,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(`$ErrorActionPreference='Stop'\n. '${script.replaceAll("'","''")}' -DefinitionsOnly\n${command}`,'utf16le').toString('base64')],{input,encoding:'utf8',timeout:10000,windowsHide:true,maxBuffer:1024*1024,stdio:['pipe','pipe','pipe']}).trim();}
suite(`Guides actual configure boundary before native allocation${unavailable?` [SKIPPED - ${unavailable}]`:''}`,()=>{
 it('admits actual direct host configure and refuses unauthorized shapes without native entry',()=>{
  const build=(fixture as any).buildGuidesLauncherConfigure;
  expect(typeof build).toBe('function');
  const configure=build(root,process.execPath,{GUIDES_POWERSHELL_EXECUTABLE:pwsh},argv);
  expect(configure.environment).toEqual({});
  expect(configure.fixtureEntrypoint).toBe(path.join(root,'tunes/scripts/guides-browser-fixture.ts'));
  const cases=[configure,{...configure,fixtureEntrypoint:path.join(root,'tunes/scripts/profile-browser-fixture.ts')},{...configure,receiptArguments:argv.slice(2)},{...configure,receiptArguments:[...argv,'extra']},{...configure,receiptArguments:['--suite','apps',...argv.slice(2)]},{...configure,receiptArguments:argv.map((x,i)=>i===7?'secret':x)},{...configure,environment:{guides_powershell_executable:'private'}},{...configure,environment:{GUIDES_PRIVATE_TOKEN:'private'}},{...configure,cwd:'C:\\elsewhere'},{...configure,receiptArguments:argv.map((x,i)=>i===5?'relative':x)},{...configure,receiptArguments:argv.map((x,i)=>i===2?'--receipt-directory':x)}];
  const payload=Buffer.from(JSON.stringify(cases));
  expect(payload.length).toBeLessThan(65536);
  const result=JSON.parse(ps(`$reader=[IO.StreamReader]::new([Console]::OpenStandardInput(),[Text.Encoding]::UTF8); $data=$reader.ReadToEnd(); if([Text.Encoding]::UTF8.GetByteCount($data) -gt 65536){throw 'test payload refused'}; $cases=$data | ConvertFrom-Json -Depth 10\n$accepted=@(); foreach($case in $cases){try{[GuidesJob.Wire]::ValidateConfigure(($case | ConvertTo-Json -Depth 10 -Compress),'${root.replaceAll("'","''")}');$accepted+=$true}catch{$accepted+=$false}}\n[Console]::Out.WriteLine((@{accepted=$accepted;constructors=[GuidesJob.ProductionNative]::ConstructionCount;entries=[GuidesJob.ProductionNative]::EntryCount}|ConvertTo-Json -Compress))`,payload));
  expect(result).toEqual({accepted:[true,false,false,false,false,false,false,false,false,false,false],constructors:0,entries:0});
 });
 it('real wire rejects the recursive profile entry before constructing native ownership',()=>{
  const configure=(fixture as any).buildGuidesLauncherConfigure(root,process.execPath,{},argv);
  configure.fixtureEntrypoint=path.join(root,'tunes/scripts/profile-browser-fixture.ts');
  const bytes=Buffer.from(JSON.stringify({v:1,seq:1,id:'b'.repeat(32),type:'configure',payload:configure}));
  const header=Buffer.alloc(4);header.writeUInt32BE(bytes.length);
  const command=`$ErrorActionPreference='Stop'\n. '${script.replaceAll("'","''")}' -DefinitionsOnly\n$code=[GuidesJob.Wire]::Run('${root.replaceAll("'","''")}').GetAwaiter().GetResult(); [Console]::Out.WriteLine((@{code=$code;constructors=[GuidesJob.ProductionNative]::ConstructionCount;entries=[GuidesJob.ProductionNative]::EntryCount}|ConvertTo-Json -Compress))`;
  const output=execFileSync(pwsh,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{input:Buffer.concat([header,bytes]),encoding:'utf8',timeout:10000,windowsHide:true,maxBuffer:65536,stdio:['pipe','pipe','pipe']});
  expect(JSON.parse(output)).toEqual({code:1,constructors:0,entries:0});
 });
 it('selected explicit PS7 compiles actual supervisor with zero native constructions',async()=>{
  await expect(assertGuidesPowerShellRuntime(pwsh,script)).resolves.toBe(pwsh);
 });
 it('legacy Windows PowerShell fails capability admission with finite diagnostics',async()=>{
  await expect(assertGuidesPowerShellRuntime('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',script)).rejects.toThrow('GUIDES_RUNTIME_UNSUPPORTED');
 });
});
