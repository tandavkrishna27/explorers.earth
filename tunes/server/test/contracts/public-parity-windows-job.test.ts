import {describe,it,expect} from 'vitest';
import {existsSync,statSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../../../scripts/public-parity-windows-job.ps1',import.meta.url));
const powershell=process.env.GUIDES_POWERSHELL_EXECUTABLE;
const unavailable=(()=>{
 if(process.platform!=='win32')return `Windows-only definitions gate on ${process.platform}`;
 if(!powershell)return 'GUIDES_POWERSHELL_EXECUTABLE is required to select PowerShell 7';
 try{if(!statSync(powershell).isFile()||realpathSync(powershell)!==powershell)return 'PowerShell executable must be a canonical regular file';}
 catch{return 'selected PowerShell executable is unavailable';}
 return undefined;
})();
if(unavailable&&process.platform==='win32'&&process.env.PUBLIC_PARITY_WINDOWS_JOB_REQUIRED)throw Error(`Required public Windows Job gate unavailable: ${unavailable}`);
if(unavailable)console.warn(`[SKIP] public Windows Job definitions: ${unavailable}`);
const suite=unavailable?describe.skip:describe;

function definitions(code:string){
 expect(existsSync(script),'new public native definitions exist').toBe(true);
 const command=`. '${script.replaceAll("'","''")}' -DefinitionsOnly; ${code}; if ([PublicParityJob.ProductionNative]::ConstructionCount -ne 0 -or [PublicParityJob.ProductionNative]::EntryCount -ne 0) { throw 'production native entered' }`;
 return execFileSync(powershell!,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{encoding:'utf8',timeout:30000,windowsHide:true}).trim();
}
suite('public Windows Job definitions',()=>{
it('binds each closed receipt family before native construction, refuses unknown/mixed and duplicate configuration',()=>{
 expect(JSON.parse(definitions('[PublicParityJob.Wire]::FamilyRegression()'))).toEqual({counts:[32,12],refused:7,productionConstructors:0,productionEntries:0});
});
it('finishes only the full family and refuses guides16, mixed44 and out of family epochs without native admission',()=>{
 expect(JSON.parse(definitions('[PublicParityJob.ContractCases]::FamilyRegression()'))).toEqual({counts:[32,12],refused:6,productionConstructors:0,productionEntries:0});
});
it('preserves suspended assignment, cancellation, positive waits, drains and partial process handle cleanup without native entry',()=>{
 const names=['assign-before-resume','create-failure','partial-create-failure','assign-failure','resume-failure','process-wait-timeout','job-query-failure','nonzero-active','abort-stuck-fixture','abort-pending-command','finish-nonzero-fixture','exit-handshake','handle-release-failure','process-release-failure','job-release-failure','drain-read-failure','drain-release-failure'];
 const result=JSON.parse(definitions(`$values=@(${names.map(n=>`[PublicParityJob.ContractCases]::Run('${n}') | ConvertFrom-Json`).join(';')}); ConvertTo-Json -Compress -Depth 8 -InputObject $values`));
 expect(result.map((v:any)=>v.caseName)).toEqual(names);expect(result.every((v:any)=>v.passed&&v.productionConstructors===0&&v.productionEntries===0)).toBe(true);
});
it('preserves private epoch and environment collision refusal and priority command custody',()=>{
 const result=JSON.parse(definitions('$epoch=[PublicParityJob.Wire]::EpochEnvironmentRegression() | ConvertFrom-Json; $tail=[PublicParityJob.Wire]::ReplyTailRegression() | ConvertFrom-Json; ConvertTo-Json -Compress -Depth 8 @{epoch=$epoch;tail=$tail}'));
 expect(result.epoch.workers).toHaveLength(32);expect(result.epoch.peopleWorkers).toEqual(Array.from({length:12},(_,i)=>String(i+1)));expect(result.epoch.invalidPeopleEpochsRefused).toBe(3);expect(result.epoch.reservedOverridesRefused).toBe(3);expect(result.epoch.invalidEpochsRefused).toBe(5);expect(result.tail.priorityKeptOwnership).toBe(true);
});


it('worker retirement positively signals the original process while retaining handles until checked final close',()=>{expect(JSON.parse(definitions('[PublicParityJob.Wire]::HandleCustodyRegression()'))).toEqual({retained:true,closedBeforeFinal:false,closedAfterFinal:true});});

});
