import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {validateGuidesPageCapsule,validateGuidesPageSeal,GUIDES_PAGE_FAMILIES} from '../../../../explorers-earth/e2e/replatform/guides-page-diagnostic';
import {guidesPageNativeScope,validateGuidesNativeCapsule,guidesNativeCallsites} from '../../../scripts/guides-native-diagnostic';

// Execute the actual pure protocol classes with an in-memory authenticated peer.
function protocol(){
 const source=readFileSync(new URL('../../../scripts/guides-parent-supervision.ts',import.meta.url),'utf8');
 const ast=ts.createSourceFile('parent.ts',source,ts.ScriptTarget.Latest,true);
 const names=new Set(['Failure','CleanEof','Channel','exact','integer','hex','parseJson','bounded','extractGuidesSupervisorDiagnostic','GUIDES_HOST_BOUNDARIES','guidesDiagnostics','guidesNativeDiagnostics','extractGuidesSupervisorNativeFailure','guidesPageDiagnostics','extractGuidesSupervisorPageFailure','guidesPageSealDiagnostics','extractGuidesSupervisorPageSeal']);
 const selected=ast.statements.filter(node=>!ts.isImportDeclaration(node)&&((ts.isClassDeclaration(node)||ts.isFunctionDeclaration(node))&&node.name&&names.has(node.name.text)||ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>names.has(d.name.getText(ast)))));
 const body=selected.map(node=>ts.createPrinter().printNode(ts.EmitHint.Unspecified,node,ast)).join('\n').replaceAll('export ','');
 return new Function('guidesPageNativeScope','Buffer','TextDecoder','validateGuidesNativeCapsule','validateGuidesPageCapsule','validateGuidesPageSeal',ts.transpileModule(body+'\nreturn {Channel,extract:typeof extractGuidesSupervisorDiagnostic===\'function\'?extractGuidesSupervisorDiagnostic:()=>undefined,native:typeof extractGuidesSupervisorNativeFailure===\'function\'?extractGuidesSupervisorNativeFailure:()=>undefined,page:extractGuidesSupervisorPageFailure,seal:extractGuidesSupervisorPageSeal};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(guidesPageNativeScope,Buffer,TextDecoder,validateGuidesNativeCapsule,validateGuidesPageCapsule,validateGuidesPageSeal);
}
it.each(['matching','worker','duplicate','wrong-native','unpaired'] as const)('authenticates separate page capsule %s before native fatal without replacing its fixture diagnostic',async mode=>{
 const p=protocol(),point=guidesNativeCallsites()[0],page={version:1,epoch:1,caseIndex:3,project:'guides-desktop',repeat:0,stage:'initial-detail',pageErrors:1,overflow:false,families:Object.fromEntries(GUIDES_PAGE_FAMILIES.map(f=>[f,{seen:0,lastStatus:null}])),dom:{expectedHeading:0,loadFailure:1,earthLoader:0}},native={version:1,epoch:mode==='wrong-native'?2:1,caseIndex:3,project:'guides-desktop',repeat:0,action:'fail',kind:'assertion',matcher:'toBeVisible',...point,stage:'initial-detail'};
 const wire=(seq:number,type:string,payload:unknown)=>{const body=Buffer.from(JSON.stringify({v:1,seq,id:'a'.repeat(32),type,payload})),head=Buffer.alloc(4);head.writeUInt32BE(body.length);return Buffer.concat([head,body]);},frames=[wire(1,'page-failure',page),...(mode==='duplicate'?[wire(2,'page-failure',page)]:mode==='unpaired'?[]:[wire(2,'native-failure',native)]),wire(3,'fatal',{phase:'execution',code:'unsettled',cleanup:null,boundary:'harness-command'})];
 const stream={async read(){return frames.shift()??null;},async write(){},async close(){}},clock={now:()=>0,setTimeout:()=>0,clearTimeout(){}},peer=new p.Channel(stream,clock,()=> 'b'.repeat(32),9*1024*1024,mode==='worker'?'worker':'fixture',mode==='worker'?1:0),error=await new Promise(resolve=>peer.activate(1000,resolve));if(mode==='matching'){expect(p.page(error)).toEqual(page);expect(p.native(error)).toEqual(native);expect(p.extract(error)).toMatchObject({role:'fixture',epoch:0,boundary:'harness-command'});}else expect(p.page(error)).toBeUndefined();
});
async function fatal(role='fixture',epoch=0,payload:any={phase:'bootstrap',code:'failed',cleanup:null,boundary:'protected-context'}){
 const p=protocol(),body=Buffer.from(JSON.stringify({v:1,seq:1,id:'a'.repeat(32),type:'fatal',payload})),head=Buffer.alloc(4);head.writeUInt32BE(body.length);
 let sent=false;const stream={async read(){if(sent)return null;sent=true;return Buffer.concat([head,body]);},async write(){},async close(){}};
 const clock={now:()=>0,setTimeout:()=>0,clearTimeout(){}};
 const peer=new p.Channel(stream,clock,()=> 'b'.repeat(32),9*1024*1024,role,epoch);
 const error=await new Promise(resolve=>peer.activate(1000,resolve));return {p,error};
}
it.each(['sealed-no-page','unattached-with-page','wrong-epoch','wrong-project','unknown','duplicate','worker','unpaired'] as const)('refuses authenticated seal %s without publishing a diagnostic',async mode=>{
 const p=protocol(),seal={version:1,epoch:mode==='wrong-epoch'?2:1,caseIndex:3,project:mode==='wrong-project'?'guides-mobile':'guides-desktop',repeat:0,stage:'initial-detail',outcome:mode==='unattached-with-page'?'unattached':mode==='unknown'?'PRIVATE':'sealed'},page={version:1,epoch:1,caseIndex:3,project:'guides-desktop',repeat:0,stage:'initial-detail',pageErrors:0,overflow:false,families:Object.fromEntries(GUIDES_PAGE_FAMILIES.map(f=>[f,{seen:0,lastStatus:null}])),dom:{expectedHeading:0,loadFailure:1,earthLoader:0}},native={version:1,epoch:1,caseIndex:3,project:'guides-desktop',repeat:0,action:'fail',kind:'assertion',matcher:'toBeVisible',...guidesNativeCallsites()[0],stage:'initial-detail'};
 const payloads=[{type:'page-seal',payload:seal},...(mode==='duplicate'?[{type:'page-seal',payload:seal}]:[]),...(mode==='sealed-no-page'?[]:[{type:'page-failure',payload:page}]),...(mode==='unpaired'?[]:[{type:'native-failure',payload:native}]),{type:'fatal',payload:{phase:'execution',code:'unsettled',cleanup:null,boundary:'harness-command'}}],chunks=payloads.map((f,index)=>{const body=Buffer.from(JSON.stringify({v:1,seq:index+1,id:'a'.repeat(32),...f})),head=Buffer.alloc(4);head.writeUInt32BE(body.length);return Buffer.concat([head,body]);}),peer=new p.Channel({async read(){return chunks.shift()??null;},async write(){},async close(){}},{now:()=>0,setTimeout:()=>0,clearTimeout(){}},()=> 'b'.repeat(32),9*1024*1024,mode==='worker'?'worker':'fixture',mode==='worker'?1:0),error=await new Promise(r=>peer.activate(1000,r));expect(p.seal(error)).toBeUndefined();expect(p.page(error)).toBeUndefined();
 let reads=0;const unsafe=new Proxy({}, {get(){reads++;throw Error('unsafe');},getPrototypeOf(){reads++;throw Error('unsafe');}});expect(p.seal(unsafe)).toBeUndefined();expect(()=>validateGuidesPageSeal(unsafe)).toThrow();const getter=Object.defineProperty({},'outcome',{get(){reads++;throw Error('unsafe');}});expect(()=>validateGuidesPageSeal(getter)).toThrow();expect(reads).toBe(0);
});
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
 const p=protocol(),capsule={version:1,epoch:7,caseIndex:3,project:'guides-mobile',repeat:0,action:'fail',kind:'unknown',matcher:'unknown',line:null,column:null,stage:'unknown'};
 const wire=(seq:number,type:string,payload:unknown)=>{const body=Buffer.from(JSON.stringify({v:1,seq,id:'a'.repeat(32),type,payload})),head=Buffer.alloc(4);head.writeUInt32BE(body.length);return Buffer.concat([head,body]);};
 const chunks=[wire(1,'native-failure',capsule),wire(2,'fatal',{phase:'execution',code:'unsettled',cleanup:null,boundary:'harness-command'})];
 const stream={async read(){return chunks.shift()??null;},async write(){},async close(){}},clock={now:()=>0,setTimeout:()=>0,clearTimeout(){}};
 const peer=new p.Channel(stream,clock,()=> 'b'.repeat(32),9*1024*1024,'fixture',0),error=await new Promise(resolve=>peer.activate(1000,resolve));expect(p.native(error)).toEqual(capsule);expect(p.extract(error)).toMatchObject({role:'fixture',epoch:0,boundary:'harness-command'});
});
it.each(['worker','duplicate','ready','foreign-boundary','bad-capsule'])('refuses native capsule %s without publishing it',async fault=>{
 const p=protocol(),capsule={version:1,epoch:7,caseIndex:3,project:'guides-mobile',repeat:0,action:'fail',kind:'unknown',matcher:'unknown',line:null,column:null,stage:'unknown'};if(fault==='bad-capsule')capsule.caseIndex=8;
 const wire=(seq:number,type:string,payload:unknown)=>{const body=Buffer.from(JSON.stringify({v:1,seq,id:'a'.repeat(32),type,payload})),head=Buffer.alloc(4);head.writeUInt32BE(body.length);return Buffer.concat([head,body]);};
 const frames=[wire(1,'native-failure',capsule),wire(2,fault==='duplicate'?'native-failure':fault==='ready'?'ready':'fatal',fault==='duplicate'?capsule:fault==='ready'?{}:{phase:'execution',code:'failed',cleanup:null,boundary:fault==='foreign-boundary'?'browser-exit':'harness-command'})];
 const stream={async read(){return frames.shift()??null;},async write(){},async close(){}},clock={now:()=>0,setTimeout:()=>0,clearTimeout(){}};
 const peer=new p.Channel(stream,clock,()=> 'b'.repeat(32),9*1024*1024,fault==='worker'?'worker':'fixture',fault==='worker'?1:0),error=await new Promise(resolve=>peer.activate(1000,resolve));expect(p.native(error)).toBeUndefined();
});
