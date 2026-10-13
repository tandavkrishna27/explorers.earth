import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {validateGuidesNativeCapsule} from '../../../scripts/guides-native-diagnostic';

// Execute the actual pure protocol classes with an in-memory authenticated peer.
function protocol(){
 const source=readFileSync(new URL('../../../scripts/guides-parent-supervision.ts',import.meta.url),'utf8');
 const ast=ts.createSourceFile('parent.ts',source,ts.ScriptTarget.Latest,true);
 const names=new Set(['Failure','CleanEof','Channel','exact','integer','hex','parseJson','bounded','extractGuidesSupervisorDiagnostic','GUIDES_HOST_BOUNDARIES','guidesDiagnostics','guidesNativeDiagnostics','extractGuidesSupervisorNativeFailure']);
 const selected=ast.statements.filter(node=>!ts.isImportDeclaration(node)&&((ts.isClassDeclaration(node)||ts.isFunctionDeclaration(node))&&node.name&&names.has(node.name.text)||ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>names.has(d.name.getText(ast)))));
 const body=selected.map(node=>ts.createPrinter().printNode(ts.EmitHint.Unspecified,node,ast)).join('\n').replaceAll('export ','');
 return new Function('Buffer','TextDecoder','validateGuidesNativeCapsule',ts.transpileModule(body+'\nreturn {Channel,extract:typeof extractGuidesSupervisorDiagnostic===\'function\'?extractGuidesSupervisorDiagnostic:()=>undefined,native:typeof extractGuidesSupervisorNativeFailure===\'function\'?extractGuidesSupervisorNativeFailure:()=>undefined};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(Buffer,TextDecoder,validateGuidesNativeCapsule);
}
async function fatal(role='fixture',epoch=0,payload:any={phase:'bootstrap',code:'failed',cleanup:null,boundary:'protected-context'}){
 const p=protocol(),body=Buffer.from(JSON.stringify({v:1,seq:1,id:'a'.repeat(32),type:'fatal',payload})),head=Buffer.alloc(4);head.writeUInt32BE(body.length);
 let sent=false;const stream={async read(){if(sent)return null;sent=true;return Buffer.concat([head,body]);},async write(){},async close(){}};
 const clock={now:()=>0,setTimeout:()=>0,clearTimeout(){}};
 const peer=new p.Channel(stream,clock,()=> 'b'.repeat(32),9*1024*1024,role,epoch);
 const error=await new Promise(resolve=>peer.activate(1000,resolve));return {p,error};
}
it('retains authenticated fixture fatal boundary without its private error text',async()=>{
 const {p,error}=await fatal();expect(p.extract(error)).toEqual({version:1,role:'fixture',epoch:0,phase:'bootstrap',code:'failed',boundary:'protected-context'});
 expect(JSON.stringify(error)).not.toContain('protected-context');
});
it('retains authenticated worker identity while refusing unknown boundaries',async()=>{
 const {p,error}=await fatal('worker',7,{phase:'reset',code:'unsettled',cleanup:null});
 expect(p.extract(error)).toEqual({version:1,role:'worker',epoch:7,phase:'reset',code:'unsettled',boundary:null});
 const invalid=await fatal('fixture',0,{phase:'bootstrap',code:'failed',cleanup:null,boundary:'PRIVATE_SENTINEL'});expect(invalid.p.extract(invalid.error)).toBeUndefined();
});
it('extracts only privately branded errors without touching forged getters or proxies',async()=>{
 const {p}=await fatal();let reads=0;const getter=Object.defineProperty({},'diagnostic',{get(){reads++;throw Error('private');}});
 const proxy=new Proxy({}, {get(){reads++;throw Error('private');},ownKeys(){reads++;throw Error('private');}});
 for(const value of [getter,proxy,{version:1,role:'fixture',epoch:0,phase:'bootstrap',code:'failed',boundary:null},null,'private'])expect(p.extract(value)).toBeUndefined();expect(reads).toBe(0);
});
it.each([{phase:['bootstrap'],code:'failed'},{phase:'bootstrap',code:['failed']},{phase:'bootstrap',code:'failed',extra:'PRIVATE_SENTINEL'}])('rejects malformed authenticated diagnostic primitives or keys',async change=>{const {p,error}=await fatal('fixture',0,Object.assign({phase:'bootstrap',code:'failed',cleanup:null,boundary:null},change));expect(p.extract(error)).toBeUndefined();});
it('retains one authenticated passive native frame only when followed by harness fatal',async()=>{
 const p=protocol(),capsule={version:1,epoch:7,caseIndex:3,project:'guides-mobile',repeat:0,action:'fail',kind:'unknown',matcher:'unknown',line:null,column:null};
 const wire=(seq:number,type:string,payload:unknown)=>{const body=Buffer.from(JSON.stringify({v:1,seq,id:'a'.repeat(32),type,payload})),head=Buffer.alloc(4);head.writeUInt32BE(body.length);return Buffer.concat([head,body]);};
 const chunks=[wire(1,'native-failure',capsule),wire(2,'fatal',{phase:'execution',code:'unsettled',cleanup:null,boundary:'harness-command'})];
 const stream={async read(){return chunks.shift()??null;},async write(){},async close(){}},clock={now:()=>0,setTimeout:()=>0,clearTimeout(){}};
 const peer=new p.Channel(stream,clock,()=> 'b'.repeat(32),9*1024*1024,'fixture',0),error=await new Promise(resolve=>peer.activate(1000,resolve));expect(p.native(error)).toEqual(capsule);expect(p.extract(error)).toMatchObject({role:'fixture',epoch:0,boundary:'harness-command'});
});
it.each(['worker','duplicate','ready','foreign-boundary','bad-capsule'])('refuses native capsule %s without publishing it',async fault=>{
 const p=protocol(),capsule={version:1,epoch:7,caseIndex:3,project:'guides-mobile',repeat:0,action:'fail',kind:'unknown',matcher:'unknown',line:null,column:null};if(fault==='bad-capsule')capsule.caseIndex=8;
 const wire=(seq:number,type:string,payload:unknown)=>{const body=Buffer.from(JSON.stringify({v:1,seq,id:'a'.repeat(32),type,payload})),head=Buffer.alloc(4);head.writeUInt32BE(body.length);return Buffer.concat([head,body]);};
 const frames=[wire(1,'native-failure',capsule),wire(2,fault==='duplicate'?'native-failure':fault==='ready'?'ready':'fatal',fault==='duplicate'?capsule:fault==='ready'?{}:{phase:'execution',code:'failed',cleanup:null,boundary:fault==='foreign-boundary'?'browser-exit':'harness-command'})];
 const stream={async read(){return frames.shift()??null;},async write(){},async close(){}},clock={now:()=>0,setTimeout:()=>0,clearTimeout(){}};
 const peer=new p.Channel(stream,clock,()=> 'b'.repeat(32),9*1024*1024,fault==='worker'?'worker':'fixture',fault==='worker'?1:0),error=await new Promise(resolve=>peer.activate(1000,resolve));expect(p.native(error)).toBeUndefined();
});
