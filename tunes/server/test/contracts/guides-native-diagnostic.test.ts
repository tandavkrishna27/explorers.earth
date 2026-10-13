import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {createHash} from 'node:crypto';
const load=()=>import('../../../scripts/guides-native-diagnostic').catch(()=>undefined as any);
it('captures only a native error with an exact source AST callsite and finite matcher',async()=>{
 const module=await load();expect(typeof module?.captureGuidesNativeFailure).toBe('function');
 const points=module.guidesNativeCallsites(),point=points[0],file=fileURLToPath(new URL('../../../../explorers-earth/e2e/replatform/guides.spec.ts',import.meta.url));
 const error=Error('PRIVATE_SENTINEL');Object.defineProperty(error,'stack',{configurable:true,value:`Error: PRIVATE_SENTINEL\n    at check (${file}:${point.line}:${point.column})`});Object.defineProperty(error,'matcherResult',{value:{name:'toBe'}});
 expect(module.captureGuidesNativeFailure(error)).toEqual({kind:'assertion',matcher:'toBe',line:point.line,column:point.column});
 for(const location of [`${file}:999999:1`,`${file}:${point.line}:999999`,`${file}-foreign:${point.line}:${point.column}`]){Object.defineProperty(error,'stack',{configurable:true,value:`Error: private\n    at check (${location})`});expect(module.captureGuidesNativeFailure(error)).toMatchObject({line:null,column:null});}
});
it('refuses executable errors, field getters and changed stack formatters without invoking them',async()=>{
 const module=await load();expect(typeof module?.captureGuidesNativeFailure).toBe('function');let reads=0;
 const proxy=new Proxy({}, {get(){reads++;throw Error();},getPrototypeOf(){reads++;throw Error();},ownKeys(){reads++;throw Error();}});
 expect(module.captureGuidesNativeFailure(proxy)).toEqual({kind:'unknown',matcher:'unknown',line:null,column:null});
 const error=Error('private');Object.defineProperty(error,'stack',{get(){reads++;throw Error();}});Object.defineProperty(error,'matcherResult',{get(){reads++;throw Error();}});
 expect(module.captureGuidesNativeFailure(error)).toEqual({kind:'unknown',matcher:'unknown',line:null,column:null});
 const prior=Object.getOwnPropertyDescriptor(Error,'prepareStackTrace');try{const raw=Error('private');Object.defineProperty(Error,'prepareStackTrace',{configurable:true,get(){reads++;return ()=>{reads++;return 'private';}}});expect(module.captureGuidesNativeFailure(raw)).toMatchObject({line:null,column:null});}finally{if(prior)Object.defineProperty(Error,'prepareStackTrace',prior);else Reflect.deleteProperty(Error,'prepareStackTrace');}expect(reads).toBe(0);
});
it('does not mistake an error message for trusted frames and requires exact AST coordinates',async()=>{
 const module=await load(),point=module.guidesNativeCallsites()[0],file=fileURLToPath(new URL('../../../../explorers-earth/e2e/replatform/guides.spec.ts',import.meta.url));
 const message=`private\n    at forged (${file}:${point.line}:${point.column})`,error=Error(message);Object.defineProperty(error,'stack',{value:`Error: ${message}\n    at actual (foreign.ts:1:1)`});expect(module.captureGuidesNativeFailure(error)).toEqual({kind:'unknown',matcher:'unknown',line:null,column:null});
 expect(()=>module.validateGuidesNativeMetadata({kind:'unknown',matcher:'unknown',line:point.line,column:point.column+999999})).toThrow();
 const malicious=Object.defineProperty({},'kind',{enumerable:true,get(){throw Error('getter invoked');}});expect(()=>module.validateGuidesNativeMetadata(malicious)).toThrow('Guides diagnostic refused');
});
it('native spec catches only to capture synchronously and rethrows the exact original before unchanged finally',()=>{
 const source=readFileSync(new URL('../../../../explorers-earth/e2e/replatform/guides.spec.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('guides.ts',source,ts.ScriptTarget.Latest,true);
 const tests=ast.statements.filter((n):n is ts.ExpressionStatement=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='test');expect(tests).toHaveLength(8);
 for(const test of tests){const call=test.expression as ts.CallExpression,callback=call.arguments[1] as ts.ArrowFunction,body=callback.body as ts.Block,guard=body.statements.find(ts.isTryStatement)!;expect(guard.catchClause).toBeDefined();expect(guard.catchClause!.block.statements.map(n=>n.getText(ast))).toEqual(['harness.captureFailure(error);','throw error;']);expect(guard.finallyBlock).toBeDefined();}
});
it('retains the exact prior native business AST and rejects altered waits assertions or rethrows',()=>{
 const source=readFileSync(new URL('../../../../explorers-earth/e2e/replatform/guides.spec.ts',import.meta.url),'utf8');
 const fingerprint=(value:string)=>{const ast=ts.createSourceFile('guides.ts',value,ts.ScriptTarget.Latest,true),guards=new Set<ts.TryStatement>();for(const n of ast.statements)if(ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='test'){const callback=n.expression.arguments[1] as ts.ArrowFunction,guard=(callback.body as ts.Block).statements.find(ts.isTryStatement)!;if(guard.catchClause?.block.statements.map(n=>n.getText(ast)).join('')!=='harness.captureFailure(error);throw error;')return;guards.add(guard);}if(guards.size!==8)return;const result=ts.transform(ast,[context=>root=>{const visit=(node:ts.Node):ts.Node=>guards.has(node as ts.TryStatement)?ts.factory.updateTryStatement(node as ts.TryStatement,(node as ts.TryStatement).tryBlock,undefined,(node as ts.TryStatement).finallyBlock):ts.visitEachChild(node,visit,context);return ts.visitNode(root,visit) as ts.SourceFile;}]);try{return createHash('sha256').update(ts.createPrinter().printFile(result.transformed[0])).digest('hex');}finally{result.dispose();}};
 const frozen='fc09569e18c90a202fb843517b8b78fff738f4f4c662ebc06bc1c341ce517a70';expect(fingerprint(source)).toBe(frozen);
 for(const mutant of [source.replace('throw error;','throw Error();'),source.replace('harness.captureFailure(error);','harness.captureFailure(null);'),source.replace('toBe(200)','toBe(201)'),source.replace('await harness.retire();','await Promise.resolve();')])expect(fingerprint(mutant)).not.toBe(frozen);
});
