import ts from 'typescript';
import {it,expect} from 'vitest';
import {captureCaseErrorMetadata,finiteCaseErrorMetadata,caseSourceFile} from '../helpers/placesCaseErrorDiagnostic';
import {readFileSync} from 'node:fs';
import {types} from 'pg';
it('extracts finite original assertion coordinates without its private payload',()=>{
 const error={name:'AssertionError',message:'private',actual:'private',stack:'AssertionError: private\n at check (C:/checkout/tunes/server/test/explorers-place-pins.integration.test.ts:1265:42)'};
 expect(captureCaseErrorMetadata(error)).toEqual({caseCategory:'assertion',sourceFile:caseSourceFile,sourceLine:1265,sourceColumn:42});
 expect(captureCaseErrorMetadata({code:'57014',stack:'private'})).toEqual({caseCategory:'database',caseSqlState:'57014'});
 expect(captureCaseErrorMetadata({code:'private',name:'private',stack:'private'})).toEqual({caseCategory:'other'});
});
it('fails closed for malformed finite coordinates and private extra keys',()=>{
 for(const value of [{caseCategory:'private'},{caseCategory:'database'},{caseCategory:'other',sourceLine:2},{caseCategory:'other',sourceFile:'private',sourceLine:2,sourceColumn:2},{caseCategory:'other',message:'private'},{caseCategory:'assertion',sourceFile:caseSourceFile,sourceLine:1000001,sourceColumn:1}])expect(finiteCaseErrorMetadata(value)).toBeUndefined();
});
it('binds first error capture before both original abort paths and the lifecycle xid to the original lease',()=>{
 const source=readFileSync(new URL('../explorers-place-pins.integration.test.ts',import.meta.url),'utf8');
 expect(source).toContain("catch(error){controller!.captureCaseError(error);winnerGate.open();await controller!.abortCase();throw Error('Fixture writer race');}");
 expect(source).toContain('controller.captureCaseError(context.task.result.errors?.[0]);await controller.abortCase()');
 expect(source).toContain("const xid=(await client.query('SELECT pg_current_xact_id()::text xid')).rows[0]?.xid");
 expect(source).toContain('capture(pair.first,firstLock)');expect(source).toContain('capture(pair.second,secondLock)');
 expect(source).toContain("lock.text===cLifecycleSql");expect(source).toContain('places_last_mutation_xid:lifecycleXid');
});

it('executes the exact source lifecycle category oracle against independently captured transaction xids',()=>{
 const text=readFileSync(new URL('../explorers-place-pins.integration.test.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('case.ts',text,ts.ScriptTarget.Latest,true);
 let fn!:ts.FunctionDeclaration;const visit=(n:ts.Node)=>{if(ts.isFunctionDeclaration(n)&&n.name?.text==='cLifecycleRace')fn=n;ts.forEachChild(n,visit);};visit(ast);
 const loop=fn.body!.statements.find(n=>ts.isForOfStatement(n)&&n.expression.getText(ast).includes("'apps','books'"))!;
 const compiled=ts.transpileModule(loop.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const run=new Function('expect','transitionBefore','transitionAfter','f','lifecycleXid',compiled);
 const categories=['apps','books','games','guides','movies','people','places','products'],before=categories.map(category=>({account_id:'owner',category,revision:'4',places_last_mutation_xid:category==='places'?'101':null,unchanged:'exact'}));
 const after=before.map(row=>({...row,revision:'5',places_last_mutation_xid:row.category==='places'?'205':null}));
 run(expect,{categories:before},{categories:after},{account:'owner'},'205');
 for(const bad of [after.map(r=>r.category==='places'?{...r,places_last_mutation_xid:'101'}:r),after.map(r=>r.category==='books'?{...r,places_last_mutation_xid:'205'}:r),after.map(r=>({...r,unchanged:'wrong'}))])expect(()=>run(expect,{categories:before},{categories:bad},{account:'owner'},'205')).toThrow();
 expect(()=>run(expect,{categories:before},{categories:after},{account:'owner'},'999')).toThrow();
});
it('runs the exact account gate adapter: same lease capture precedes arrival and default calls remain unchanged',async()=>{
 const text=readFileSync(new URL('../explorers-place-pins.integration.test.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('case.ts',text,ts.ScriptTarget.Latest,true);
 let fn!:ts.FunctionDeclaration;const visit=(n:ts.Node)=>{if(ts.isFunctionDeclaration(n)&&n.name?.text==='cPool')fn=n;ts.forEachChild(n,visit);};visit(ast);
 const compiled=ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const factory=new Function('expect',compiled+';return cPool;')(expect),calls:string[]=[],client={query:async(text:string)=>{calls.push(text);return {rows:[{xid:'205'}]};},release:()=>{}},gate={arrive:()=>calls.push('arrive'),wait:async()=>{calls.push('wait');}};
 const pool=factory(client,'account',['owner'],gate,undefined,async()=>{const result=await client.query('xid');expect(result.rows[0].xid).toBe('205');});await (await pool.connect()).query('account',['owner']);expect(calls).toEqual(['account','xid','arrive','wait']);
 calls.length=0;await (await factory(client,'account',['owner'],gate).connect()).query('account',['owner']);expect(calls).toEqual(['account','arrive','wait']);
});

it('runs the exact C10 draft oracle with driver BIGINT strings and numeric JSON policy version',()=>{
 const schema=readFileSync(new URL('../../../migrations/0054_explorers_place_individual_pins.sql',import.meta.url),'utf8');
 const draftTable=schema.slice(schema.indexOf('CREATE TABLE public.place_pin_drafts ('),schema.indexOf('CREATE TABLE public.place_pin_draft_chunks ('));
 expect(draftTable).toMatch(/\bpolicy_version\s+bigint\b/i);expect(draftTable).toMatch(/\bpolicy_snapshot\s+jsonb\b/i);
 const text=readFileSync(new URL('../explorers-place-pins.integration.test.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('case.ts',text,ts.ScriptTarget.Latest,true);
 let fn!:ts.FunctionDeclaration;const visit=(n:ts.Node)=>{if(ts.isFunctionDeclaration(n)&&n.name?.text==='cBeginRace')fn=n;ts.forEachChild(n,visit);};visit(ast);
 const calls:ts.CallExpression[]=[];const find=(n:ts.Node)=>{if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='toMatchObject'&&n.expression.expression.getText(ast)==='expect(opened)')calls.push(n);ts.forEachChild(n,find);};find(fn);
 expect(calls).toHaveLength(1);
 const compiled=ts.transpileModule(calls[0].getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const run=new Function('expect','opened','f','policy',compiled),parseInt8=types.getTypeParser(20,'text');
 const policySnapshot=types.getTypeParser(3802,'text')('{"policyId":"policy","policyVersion":1}');
 if(typeof policySnapshot!=='object'||policySnapshot===null||Array.isArray(policySnapshot)||!('policyId' in policySnapshot)||!('policyVersion' in policySnapshot))throw Error('Expected parsed policy object');
 const policy={policyId:'policy',policyVersion:1},f={account:'owner',list:'list'},opened={account_id:'owner',collection_id:'list',state:'open',policy_id:'policy',policy_version:parseInt8('1'),policy_snapshot:policySnapshot,accepted_bytes:parseInt8('0'),item_count:parseInt8('0'),chunk_count:parseInt8('0'),terminal_at:null,terminal_result:null};
 expect(opened.policy_version).toBe('1');expect(opened.policy_snapshot.policyVersion).toBe(1);
 run(expect,opened,f,policy);
 expect(()=>run(expect,{...opened,policy_version:parseInt8('2')},f,policy)).toThrow();
 expect(()=>run(expect,{...opened,policy_snapshot:{...opened.policy_snapshot,policyVersion:'1'}},f,policy)).toThrow();
});
