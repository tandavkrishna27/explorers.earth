import {lstatSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';

// Privacy evidence only. File inventories, account bindings and disposal authority
// remain with the owning Apps coordinator. No work occurs at import time.
type Rule={principal:string;allow:boolean;full:boolean;inherited:boolean;inheritance:number;propagation:number};
type Metadata={path:string;owner:boolean;protected:boolean;hash:string;rules:Rule[]};
type Snapshot={key:string;hash:string};
type Custody={directories:Set<string>;snapshots:Map<string,Snapshot>};
const roots=new Map<string,Custody>();
const refusal=()=>new Error('Apps private custody refused');
const ps=String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`;
function chain(target:string){const result:string[]=[];for(let current=target;;current=path.dirname(current)){result.push(current);if(current===path.dirname(current))return result;}}
function physical(target:string,trustedExecutable=false){
 if(!path.isAbsolute(target)||path.resolve(target)!==target||target.length>1024||target.startsWith('\\\\')||/[\x00-\x1f\x7f]/.test(target)||target.slice(path.parse(target).root.length).includes(':'))throw refusal();
 const st=lstatSync(target,{bigint:true});if(st.isSymbolicLink()||realpathSync(target)!==target||(!st.isDirectory()&&!st.isFile())||st.isFile()&&!trustedExecutable&&st.nlink!==1n)throw refusal();
 return {directory:st.isDirectory(),key:[st.dev,st.ino,st.uid,st.mode,st.nlink,st.isDirectory()].join(':')};
}
function read(paths:string[]):Metadata[]{
 if(paths.length>32)throw refusal();
 physical(ps,true);
 const encoded=Buffer.from(JSON.stringify(paths)).toString('base64');
 const script=`$ErrorActionPreference='Stop';if($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1){exit 1};$paths=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')));$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$rows=@();foreach($p in $paths){$acl=Get-Acl -LiteralPath $p;$rules=@();foreach($r in $acl.Access){$s=$r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;$principal=if($s -eq $sid){'current'}elseif($s -eq 'S-1-5-18'){'system'}elseif($s -eq 'S-1-5-32-544'){'admin'}else{'foreign'};$rules+=@{principal=$principal;allow=($r.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow);full=($r.FileSystemRights -eq [Security.AccessControl.FileSystemRights]::FullControl);inherited=$r.IsInherited;inheritance=[int]$r.InheritanceFlags;propagation=[int]$r.PropagationFlags}};$sha=[Security.Cryptography.SHA256]::Create();try{$hash=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($acl.Sddl)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()};$rows+=@{path=$p;owner=($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -eq $sid);protected=$acl.AreAccessRulesProtected;hash=$hash;rules=$rules}};ConvertTo-Json -InputObject @($rows) -Depth 5 -Compress`;
 // A successful synchronous return is the original process closure. Timeout,
 // overflow or any process error propagates; callers must retain their custody.
 const command=Buffer.from(script,'utf16le').toString('base64');if(command.length>30000)throw refusal();
 const output=execFileSync(ps,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',command],{windowsHide:true,timeout:10000,maxBuffer:32768,encoding:'utf8',env:{SystemRoot:String.raw`C:\Windows`,TEMP:tmpdir(),TMP:tmpdir()}});
 const rows:unknown=JSON.parse(output);if(!Array.isArray(rows)||rows.length!==paths.length)throw refusal();
 for(let i=0;i<rows.length;i++){const r=rows[i] as Metadata;if(!r||Object.keys(r).sort().join(',')!=='hash,owner,path,protected,rules'||r.path!==paths[i]||typeof r.owner!=='boolean'||typeof r.protected!=='boolean'||!/^[a-f0-9]{64}$/.test(r.hash)||!Array.isArray(r.rules)||r.rules.length>32)throw refusal();}
 return rows as Metadata[];
}
function privateAcl(row:Metadata,directory:boolean,strict:boolean){
 if(!row.owner||row.rules.length!==3||new Set(row.rules.map(r=>r.principal)).size!==3||row.rules.some(r=>!['current','system','admin'].includes(r.principal)||r.allow!==true||r.full!==true||r.propagation!==0||r.inheritance!==(directory?3:0)||r.inherited!==(row.protected?false:true))||strict&&!row.protected)throw refusal();
}
function verify(target:string,custody:Custody,capture:boolean){
 const paths=chain(target),stats=paths.map(p=>physical(p)),rows=read(paths);
 for(let i=0;i<paths.length;i++)if(physical(paths[i]).key!==stats[i].key)throw refusal();
 for(let i=0;i<paths.length;i++){
  const p=paths[i],old=custody.snapshots.get(p),snapshot={key:stats[i].key,hash:rows[i].hash};
  if(old&&(old.key!==snapshot.key||old.hash!==snapshot.hash))throw refusal();
  if(capture)custody.snapshots.set(p,snapshot);
 }
 return {paths,stats,rows};
}
/** Call only after the owner's strict pinned inspection of these fixed roots. */
export function registerAppsPrivateDirectory(target:string):void{
 if(process.platform!=='win32')return;
 const parent=path.dirname(target),isRoot=parent===path.resolve(tmpdir())&&/^explorers-profile-e2e-[a-f0-9]{32}$/.test(path.basename(target));
 const root=isRoot?target:parent;
 if(!isRoot&&!['apps-fixture-files','owned-media'].includes(path.basename(target)))throw refusal();
 let custody=roots.get(root);if(!custody){if(!isRoot||roots.size>=16)throw refusal();custody={directories:new Set(),snapshots:new Map()};}
 const result=verify(target,custody,true);if(!result.stats[0].directory)throw refusal();privateAcl(result.rows[0],true,true);
 custody.directories.add(target);roots.set(root,custody);
}
/** False means use the owner's unchanged strict inspector; rejection never falls back. */
export function inspectAppsPrivateDescendant(target:string):boolean{
 if(process.platform!=='win32')return false;
 const entry=[...roots].find(([root])=>target===root||target.startsWith(root+path.sep));if(!entry)return false;
 const [root,custody]=entry;if(custody.directories.has(target)){const result=verify(target,custody,false);privateAcl(result.rows[0],true,true);return false;}
 if(path.resolve(target)!==target)throw refusal();
 const first=target.slice(root.length+1).split(path.sep)[0];if(['apps-fixture-files','owned-media'].includes(first)&&!custody.directories.has(path.join(root,first)))throw refusal();
 const result=verify(target,custody,false);
 for(let i=0;i<result.paths.length;i++){
  const p=result.paths[i];if(p!==root&&!p.startsWith(root+path.sep))continue;
  if(p!==target&&!result.stats[i].directory)throw refusal();
  privateAcl(result.rows[i],result.stats[i].directory,custody.directories.has(p));
 }
 return true;
}
