import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {expect,it,vi} from 'vitest';

it('actual case5 HTTP helper preserves the existing response/dispose/assertion and captures only an actual failed status',async()=>{
 const file='e2e/replatform/people.spec.ts',ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true),helper=ast.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='peopleSectorHttp');
 if(!helper)throw Error('Actual case5 HTTP helper missing');
 const consumeFile='e2e/replatform/public-parity-spec-support.ts',consumeAst=ts.createSourceFile(consumeFile,readFileSync(consumeFile,'utf8'),ts.ScriptTarget.Latest,true),consumeNode=consumeAst.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='consume');
 if(!consumeNode)throw Error('Actual consume missing');
 const consume=Function('expect','PUBLIC_PARITY_QUALIFICATION_POLICY',ts.transpileModule(consumeNode.getText(consumeAst).replace(/^export /,'')+';return consume;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(expect,{responseBytes:9*1024*1024});
 const run=Function('consume',ts.transpileModule(helper.getText(ast)+';return peopleSectorHttp;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(consume);
 for(const [operation,status] of [['catalog-read',200],['unknown-sector-read',404],['unknown-assignment-patch',422]] as const){
  const capture=vi.fn(),dispose=vi.fn(async()=>{}),request=vi.fn(async()=>({status:()=>status,body:async()=>Buffer.from('{}'),headers:()=>({}),dispose})),scope={client:{trackProducer:(work:()=>Promise<unknown>)=>work(),capturePeopleSectorFailure:capture}};
  expect(await run(scope,operation,request,status)).toEqual({status,headers:{},body:{}});expect(request).toHaveBeenCalledOnce();expect(dispose).toHaveBeenCalledOnce();expect(capture).not.toHaveBeenCalled();
  const mismatch=await run(scope,operation,async()=>({status:()=>503,body:async()=>Buffer.from('{}'),headers:()=>({}),dispose}),status).catch((error:unknown)=>error);expect(capture).toHaveBeenLastCalledWith(mismatch,operation,503);
  const original=Error('same native assertion'),failureConsume=async(reply:unknown)=>{await dispose();throw original},failed=Function('consume',ts.transpileModule(helper.getText(ast)+';return peopleSectorHttp;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(failureConsume);
  await expect(failed(scope,operation,request,status)).rejects.toBe(original);expect(capture).toHaveBeenLastCalledWith(original,operation,status);
 }
 const original=new Proxy({}, {get(){throw Error('No private error inspection');}}),capture=vi.fn();let caught:unknown;await run({client:{trackProducer:(work:()=>Promise<unknown>)=>work(),capturePeopleSectorFailure:capture}},'catalog-read',async()=>{throw original},200).catch((error:unknown)=>{caught=error;});expect(caught===original).toBe(true);expect(capture.mock.calls).toHaveLength(1);expect(capture.mock.calls[0][0]===original).toBe(true);expect(capture.mock.calls[0].slice(1)).toEqual(['catalog-read',undefined]);
});
