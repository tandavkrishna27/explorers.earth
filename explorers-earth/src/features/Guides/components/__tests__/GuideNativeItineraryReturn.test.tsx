import React,{useState} from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {expect,it} from 'vitest';
import {motion} from 'framer-motion';
import '@testing-library/jest-dom/vitest';
import CircularTabs from '../../../../components/ui/CircularTabs';
import ItineraryView from '../GuideDetails/ItineraryView';

const file=resolve('src/features/Guides/pages/GuideDetailsPage.tsx'),source=readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let branch:ts.Expression|undefined,tabs:ts.ArrayLiteralExpression|undefined;
function visit(node:ts.Node){if(ts.isJsxExpression(node)&&node.expression&&ts.isBinaryExpression(node.expression)&&node.expression.left.getText(ast)==='activeTab === "journey"')branch=node.expression;if(ts.isJsxAttribute(node)&&ts.isIdentifier(node.name)&&node.name.text==='tabs'&&node.initializer&&ts.isJsxExpression(node.initializer)&&node.initializer.expression&&ts.isArrayLiteralExpression(node.initializer.expression))tabs=node.initializer.expression;ts.forEachChild(node,visit);}
visit(ast);if(!branch||!tabs)throw Error('Actual guide tab contract missing');
const renderBranch=Function('React','motion','activeTab','renderJourneyTab',ts.transpileModule('return '+branch.getText(ast)+';',{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText);
const actualTabs=tabs.elements.map(node=>{if(!ts.isObjectLiteralExpression(node))throw Error('Actual guide tab refused');const get=(key:string)=>{const property=node.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(ast)===key) as ts.PropertyAssignment;return (property.initializer as ts.StringLiteral).text;};return {id:get('id'),label:get('label'),icon:null};});

it('the native post-update sequence returns through the real Journey tab before its unchanged Add Day/Stop check',async()=>{
 const noop=()=>{};
 function Harness(){const [activeTab,setActiveTab]=useState('transportation');return <><CircularTabs tabs={actualTabs} activeTab={activeTab} onTabChange={setActiveTab}/>{renderBranch(React,motion,activeTab,()=> <ItineraryView sections={[]} viewMode="list" onViewModeChange={noop} onAddSection={noop} onSectionSelect={noop} onSectionEdit={noop} onSectionDelete={noop} openMenuId={null} deletingSection={null} kebabRefs={{current:{}}} onMenuToggle={noop}/>)}</>;}
 render(<Harness/>);expect(screen.queryByRole('button',{name:'+ Add Day/Stop'})).toBeNull();
 const spec=readFileSync(resolve('e2e/replatform/guides.spec.ts'),'utf8'),parsed=ts.createSourceFile('native.ts',spec,ts.ScriptTarget.Latest,true);let helper:ts.ArrowFunction|undefined;const find=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&node.name.getText(parsed)==='finishNative')helper=node.initializer as ts.ArrowFunction;ts.forEachChild(node,find);};find(parsed);const statements=(helper!.body as ts.Block).statements,start=statements.findIndex(n=>ts.isTryStatement(n)&&n.catchClause?.variableDeclaration?.name.getText(parsed)==='transportPrimaryError'),end=statements.findIndex((n,i)=>i>start&&n.getText(parsed)==='await reloadGuides(page);');expect(start).toBeGreaterThanOrEqual(0);expect(end).toBeGreaterThan(start);const sequence=statements.slice(start+1,end).map(n=>n.getText(parsed)).join('\n');
 const events:string[]=[],page={getByText(label:string,options:unknown){expect(label).toBe('Journey');expect(options).toEqual({exact:true});return {async click(){events.push('journey');fireEvent.click(screen.getByText(label,{exact:true}));}};},getByRole(role:string,options:any){expect(role).toBe('button');expect(options).toEqual({name:'+ Add Day/Stop',exact:true});return {};}};
 const execute=Function('page','expect',ts.transpileModule('return(async()=>{'+sequence+'})();',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText);
 await execute(page,()=>({async toBeVisible(){events.push('add-check');await waitFor(()=>expect(screen.getByRole('button',{name:'+ Add Day/Stop'})).toBeVisible());}}));expect(events).toEqual(['journey','add-check']);
});

it('both conflict-case successful tip saves return from actual Tips to Journey before checking Add Day/Stop',async()=>{
 const noop=()=>{};
 function Harness(){const [activeTab,setActiveTab]=useState('tips');return <><CircularTabs tabs={actualTabs} activeTab={activeTab} onTabChange={setActiveTab}/>{renderBranch(React,motion,activeTab,()=> <ItineraryView sections={[]} viewMode="list" onViewModeChange={noop} onAddSection={noop} onSectionSelect={noop} onSectionEdit={noop} onSectionDelete={noop} openMenuId={null} deletingSection={null} kebabRefs={{current:{}}} onMenuToggle={noop}/>)}</>;}
 const spec=readFileSync(resolve('e2e/replatform/guides.spec.ts'),'utf8'),parsed=ts.createSourceFile('native.ts',spec,ts.ScriptTarget.Latest,true);let body:ts.Block|undefined;
 function find(node:ts.Node){if(ts.isCallExpression(node)&&node.expression.getText(parsed)==='test'&&node.arguments[0]?.getText(parsed)==='GUIDES_CASES[2]')body=(node.arguments[1] as ts.ArrowFunction).body as ts.Block;ts.forEachChild(node,find);}find(parsed);if(!body)throw Error('Actual conflict case missing');
 const checks:ts.ExpressionStatement[]=[];function collect(node:ts.Node){if(ts.isExpressionStatement(node)&&node.getText(parsed).startsWith('await expect(')&&/getByRole\('button',\{name:'\+ Add Day\/Stop'/.test(node.getText(parsed)))checks.push(node);ts.forEachChild(node,collect);}collect(body);expect(checks).toHaveLength(2);
 for(const check of checks){const statements=(check.parent as ts.Block).statements,index=statements.indexOf(check),before=statements[index-1].getText(parsed),receiver=check.getText(parsed).includes('expect(other.')?'other':'page';expect(before).toBe(`await ${receiver}.getByText('Journey',{exact:true}).click();`);
 const mounted=render(<Harness/>);expect(screen.queryByRole('button',{name:'+ Add Day/Stop'})).toBeNull();const events:string[]=[],page={getByText(label:string,options:unknown){expect(options).toEqual({exact:true});return {async click(){events.push('journey');fireEvent.click(screen.getByText(label,{exact:true}));}};},getByRole(){return {};}};
 await Function(receiver,'expect',ts.transpileModule('return(async()=>{'+before+check.getText(parsed)+'})();',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(page,()=>({async toBeVisible(){events.push('add-check');await waitFor(()=>expect(screen.getByRole('button',{name:'+ Add Day/Stop'})).toBeVisible());}}));expect(events).toEqual(['journey','add-check']);mounted.unmount();}
});
