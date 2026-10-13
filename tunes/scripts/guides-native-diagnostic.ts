import {types as utilTypes} from 'node:util';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {fileURLToPath,URL} from 'node:url';
import ts from 'typescript';
export const GUIDES_NATIVE_MATCHERS=Object.freeze(['unknown','toBe','toEqual','toMatchObject','toBeVisible','toHaveText','toHaveCount','toHaveLength','toBeDefined','toBeNull','toBeGreaterThan','toBeLessThanOrEqual','toHaveValue','toBeChecked','toBeEnabled','toBeDisabled','toContainText','toContain','toHaveAttribute','toBeUndefined','toBeLessThan','toHaveClass','toMatch'] as const);
export const GUIDES_NATIVE_STAGES=Object.freeze(['unknown','initial-detail','reordered-detail','deleted-detail'] as const);
export const GUIDES_CLIENT_BOUNDARIES=Object.freeze(['start-response','context-allocation','context-session','producer','observe-transport','observe-response','observe-provider','observe-personas','observe-rows','observe-relations','observe-attachments','context-close','retire'] as const);
export const GUIDES_PRODUCER_STAGES=Object.freeze(['initial-load','section-edit','transport-edit','stay-edit','budget-edit','tip-edit','general-tips-edit','journey-prepare','journey-edit'] as const);
export type GuidesNativeMetadata=Readonly<{kind:'assertion'|'timeout'|'unknown';matcher:typeof GUIDES_NATIVE_MATCHERS[number];line:number|null;column:number|null;stage:typeof GUIDES_NATIVE_STAGES[number];clientBoundary?:typeof GUIDES_CLIENT_BOUNDARIES[number];producerStage?:typeof GUIDES_PRODUCER_STAGES[number]}>;
export type GuidesNativeCapsule=Readonly<{version:1;epoch:number;caseIndex:number;project:'guides-desktop'|'guides-mobile';repeat:0;action:'start'|'observe'|'retire'|'fail'}>&GuidesNativeMetadata;
const unknown=():GuidesNativeMetadata=>Object.freeze({kind:'unknown',matcher:'unknown',line:null,column:null,stage:'unknown'});
const specURL=new URL('../../explorers-earth/e2e/replatform/guides.spec.ts',import.meta.url);
const specFile=()=>specURL.protocol==='file:'?fileURLToPath(specURL):undefined;
const nativeStackGetter=Object.getOwnPropertyDescriptor(new Error(),'stack')?.get;
let census:readonly Readonly<{line:number;column:number}>[]|undefined;
const matcherPoints=new Map<string,Readonly<{matcher:string;line:number;column:number}>>();
const actionPoints=new Map<string,Readonly<{line:number;column:number}>>();
const callerStages=new Map<string,GuidesNativeMetadata['stage']>();
export function guidesNativeCallsites(){
 if(census)return census;const file=specFile();if(!file)throw Error('Guides diagnostic source refused');const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>262144||realpathSync(file)!==file)throw Error('Guides diagnostic source refused');
 const source=readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),points=new Map<string,Readonly<{line:number;column:number}>>();
 const visit=(node:ts.Node)=>{if(ts.isCallExpression(node)){const p=ast.getLineAndCharacterOfPosition(node.getStart(ast)),point=Object.freeze({line:p.line+1,column:p.character+1});points.set(`${point.line}:${point.column}`,point);
  // Playwright captures the invoked property name, while metadata emits only
  // canonical call starts. Admit an exact AST point and exact matcher together.
  if(ts.isPropertyAccessExpression(node.expression)&&GUIDES_NATIVE_MATCHERS.includes(node.expression.name.text as any)&&node.expression.name.text!=='unknown'){const name=ast.getLineAndCharacterOfPosition(node.expression.name.getStart(ast));matcherPoints.set(`${name.line+1}:${name.character+1}`,Object.freeze({matcher:node.expression.name.text,...point}));}
  else if(ts.isPropertyAccessExpression(node.expression)){const name=ast.getLineAndCharacterOfPosition(node.expression.name.getStart(ast));actionPoints.set(`${name.line+1}:${name.character+1}`,point);}
 }ts.forEachChild(node,visit);};visit(ast);
 const selected=ast.statements.find(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(ast)==='test'&&node.expression.arguments[0]?.getText(ast)==='GUIDES_CASES[3]');
 if(selected){const calls:ts.CallExpression[]=[];const collect=(node:ts.Node)=>{if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='sectionOrder')calls.push(node);ts.forEachChild(node,collect)};collect(selected);if(calls.length===3)calls.forEach((node,index)=>{const p=ast.getLineAndCharacterOfPosition(node.getStart(ast));callerStages.set(`${p.line+1}:${p.character+1}`,GUIDES_NATIVE_STAGES[index+1]);});}
 census=Object.freeze([...points.values()]);return census;
}
function own(input:unknown):Record<string,unknown>{
 if(!input||typeof input!=='object'||utilTypes.isProxy(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw Error('Guides diagnostic refused');
 const d=Object.getOwnPropertyDescriptors(input);if(Reflect.ownKeys(d).some(k=>typeof k!=='string')||Object.values(d).some(v=>!v.enumerable||!Object.hasOwn(v,'value')))throw Error('Guides diagnostic refused');return Object.fromEntries(Object.entries(d).map(([k,v])=>[k,v.value]));
}
export function validateGuidesNativeMetadata(input:unknown):GuidesNativeMetadata{
 const v=own(input),stage=v.stage,boundary=Object.hasOwn(v,'clientBoundary'),producer=Object.hasOwn(v,'producerStage');if(Object.keys(v).sort().join(',')!==['column','kind','line','matcher','stage',...(boundary?['clientBoundary']:[]),...(producer?['producerStage']:[])].sort().join(',')||boundary&&!GUIDES_CLIENT_BOUNDARIES.includes(v.clientBoundary as any)||producer&&!GUIDES_PRODUCER_STAGES.includes(v.producerStage as any)||!GUIDES_NATIVE_STAGES.includes(stage as any)||stage!=='unknown'&&(v.kind!=='assertion'||v.matcher!=='toBeVisible'||v.line===null)||!['assertion','timeout','unknown'].includes(v.kind as string)||!GUIDES_NATIVE_MATCHERS.includes(v.matcher as any)||v.kind!=='assertion'&&v.matcher!=='unknown'||(v.line===null)!==(v.column===null)||v.line!==null&&(!Number.isSafeInteger(v.line)||!Number.isSafeInteger(v.column)||!guidesNativeCallsites().some(p=>p.line===v.line&&p.column===v.column)))throw Error('Guides diagnostic refused');return Object.freeze({kind:v.kind,matcher:v.matcher,line:v.line,column:v.column,stage,...(boundary?{clientBoundary:v.clientBoundary}:{}),...(producer?{producerStage:v.producerStage}:{})}) as GuidesNativeMetadata;
}
export function validateGuidesNativeCapsule(input:unknown):GuidesNativeCapsule{
 const v=own(input),boundary=Object.hasOwn(v,'clientBoundary'),producer=Object.hasOwn(v,'producerStage');if(Object.keys(v).sort().join(',')!==['action','caseIndex','column','epoch','kind','line','matcher','project','repeat','stage','version',...(boundary?['clientBoundary']:[]),...(producer?['producerStage']:[])].sort().join(',')||v.version!==1||!Number.isSafeInteger(v.epoch)||(v.epoch as number)<1||(v.epoch as number)>16||!Number.isSafeInteger(v.caseIndex)||(v.caseIndex as number)<0||(v.caseIndex as number)>7||!['guides-desktop','guides-mobile'].includes(v.project as string)||v.repeat!==0||!['start','observe','retire','fail'].includes(v.action as string))throw Error('Guides diagnostic refused');
 const metadata=validateGuidesNativeMetadata({kind:v.kind,matcher:v.matcher,line:v.line,column:v.column,stage:v.stage,...(boundary?{clientBoundary:v.clientBoundary}:{}),...(producer?{producerStage:v.producerStage}:{})});if(producer&&(v.caseIndex!==1||v.action!=='fail')||metadata.stage!=='unknown'&&v.caseIndex!==3||v.action!=='fail'&&(boundary||metadata.kind!=='unknown'||metadata.matcher!=='unknown'||metadata.line!==null||metadata.stage!=='unknown'))throw Error('Guides diagnostic refused');return Object.freeze({version:1,epoch:v.epoch,caseIndex:v.caseIndex,project:v.project,repeat:0,action:v.action,...metadata}) as GuidesNativeCapsule;
}
function dataProperty(error:object,key:string):unknown{let current:object|null=error;for(let depth=0;current&&depth<4;depth++,current=Object.getPrototypeOf(current)){if(utilTypes.isProxy(current))return;const d=Object.getOwnPropertyDescriptor(current,key);if(d)return Object.hasOwn(d,'value')?d.value:undefined;}}
function nativeStack(error:object):unknown{
 if(!nativeStackGetter||!utilTypes.isNativeError(error))return;
 for(let current:object|null=error,depth=0;current;current=Object.getPrototypeOf(current),depth++)if(depth>=8||utilTypes.isProxy(current))return;
 if(typeof dataProperty(error,'name')!=='string'||typeof dataProperty(error,'message')!=='string')return;
 const formatter=Object.getOwnPropertyDescriptor(Error,'prepareStackTrace');
 if(formatter&&(!formatter.configurable||!Object.hasOwn(formatter,'value')))return;
 // Synchronous owned window: the previous formatter is never invoked. Restore
 // all attributes even when native stack extraction throws.
 try{if(formatter)Object.defineProperty(Error,'prepareStackTrace',{value:undefined,configurable:true,writable:true});return Reflect.apply(nativeStackGetter,error,[]);}
 finally{if(formatter)Object.defineProperty(Error,'prepareStackTrace',formatter);}
}
export function captureGuidesNativeFailure(error:unknown):GuidesNativeMetadata{
 try{
  if(!error||typeof error!=='object'||utilTypes.isProxy(error)||!utilTypes.isNativeError(error))return unknown();
  let kind:GuidesNativeMetadata['kind']='unknown',matcher:GuidesNativeMetadata['matcher']='unknown';
  const match=dataProperty(error,'matcherResult');if(match){const value=own(match).name;if(typeof value==='string'&&value!=='unknown'&&GUIDES_NATIVE_MATCHERS.includes(value as any)){kind='assertion';matcher=value as GuidesNativeMetadata['matcher'];}}
  if(kind==='unknown'&&dataProperty(error,'name')==='TimeoutError')kind='timeout';
  let stack:unknown;const descriptor=Object.getOwnPropertyDescriptor(error,'stack');
  if(descriptor&&Object.hasOwn(descriptor,'value'))stack=descriptor.value;
  else if(descriptor?.get===nativeStackGetter)stack=nativeStack(error);
  const name=dataProperty(error,'name'),message=dataProperty(error,'message');let frames:string|undefined;
  if(typeof stack==='string'&&stack.length<=65536&&typeof name==='string'&&name.length<=256&&typeof message==='string'&&message.length<=65536){const headers=[`${name}: ${message}\n`,...(message?[]:[`${name}\n`])],header=headers.find(v=>stack.startsWith(v));if(header)frames=stack.slice(header.length);}
  let selectedPoint:Readonly<{line:number;column:number}>|undefined;const stages=new Set<GuidesNativeMetadata['stage']>();
  if(frames!==undefined)for(const frame of frames.split('\n')){
   if(!/^\s{1,16}at /.test(frame))continue;let location=frame.trim().slice(3);const open=location.lastIndexOf('(');if(open!==-1)location=location.slice(open+1);if(location.endsWith(')'))location=location.slice(0,-1);
   if(location.startsWith('async '))location=location.slice(6);
   const file=specFile(),m=/^(.*):(\d{1,6}):(\d{1,6})$/.exec(location);if(!file||!m||![file.replaceAll('\\','/'),specURL.href].includes(m[1].replaceAll('\\','/')))continue;
   const line=Number(m[2]),column=Number(m[3]);guidesNativeCallsites();
   if(!selectedPoint){if(guidesNativeCallsites().some(p=>p.line===line&&p.column===column))selectedPoint={line,column};else{const normalized=matcherPoints.get(`${line}:${column}`);if(kind==='assertion'&&normalized?.matcher===matcher)selectedPoint=normalized;else selectedPoint=actionPoints.get(`${line}:${column}`);}}
   const caller=callerStages.get(`${line}:${column}`);if(caller&&kind==='assertion'&&matcher==='toBeVisible')stages.add(caller);
  }
  return Object.freeze({kind,matcher,line:selectedPoint?.line??null,column:selectedPoint?.column??null,stage:selectedPoint&&stages.size===1?[...stages][0]:'unknown'});
 }catch{return unknown();}
}
