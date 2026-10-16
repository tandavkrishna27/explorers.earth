import {PUBLIC_PARITY_QUALIFICATION_POLICY} from '../../../../explorers-earth/e2e/replatform/public-parity-controller';
import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {z} from 'zod/v3';
import {PublicContentService,PublicContentFailure} from '../../application/publicContent';
import {ownerCollectionDtoSchema} from '../../../shared/explorersOwnerContentContract';
import {publicContentRequestSchema,publicRecommendationDetailSchema,publicRecommendationSummarySchema} from '../../../shared/explorersPublicContentContract';

const account='10000000-0000-4000-8000-000000000001',id=(n:number)=>`20000000-0000-4000-8000-${String(n+1).padStart(12,'0')}`,handle='public-parity-a';
function fixture(mutant?:'private-id'|'extra-field'|'missing-row'){
 let visible=true;const lists=Array.from({length:53},(_,n)=>({id:id(n),accountId:account,title:'People list '+n,slug:'people-list-'+n,description:null,heading:null,displayOrder:n,control:null,visibility:'public',publicationState:'published',archived:false}));
 const query=vi.fn(async(sql:string,params:unknown[]=[])=>{
  if(sql.includes('SELECT a.id FROM creator_accounts'))return {rows:[{id:account}]};
  if(sql.includes('SELECT id,revision::text FROM collections'))return {rows:visible?[{id:id(0),revision:'1'}]:[]};
  if(sql.includes('SELECT coalesce((SELECT revision::text'))return {rows:[{revision:'7'}]};
  if(sql.includes('SELECT id,title,slug,description,heading,display_order FROM collections'))return {rows:lists.filter(r=>(visible||r.id!==id(0))&&(params[2]===null||r.displayOrder>Number(params[2]))).slice(0,Number(params[4])).map(r=>({id:r.id,title:r.title,slug:r.slug,description:null,heading:null,display_order:r.displayOrder}))};
  if(sql.includes('SELECT r.id,'))return {rows:Array.from({length:53},(_,n)=>({id:`30000000-0000-4000-8000-${String(n+1).padStart(12,'0')}`,canonical_title:'Person '+n,kind:'person',user_rating:null,title_bytes:20,content_category:'people',override_schema_version:null,display_values:{},display_order:n})).filter(r=>params[3]===null||r.display_order>Number(params[3])).slice(0,Number(params[5]))};
  if(/^(BEGIN|COMMIT|ROLLBACK)/.test(sql))return {rows:[]};throw Error('Unexpected native statement');
 });
 const service=new PublicContentService({connect:async()=>({query,release(){}})} as never,'fixed-resource-free-cursor-secret'),calls:string[]=[],disposed=vi.fn();
 async function read(_context:unknown,path:string,status=200){calls.push(path);const u=new URL(path,'http://127.0.0.1:3100'),parts=u.pathname.split('/'),raw={username:parts[6],category:parts[8],...(parts[9]?{slug:parts[9]}:{}),...Object.fromEntries(u.searchParams)};let actual=200,body:unknown;
  try{const value=await service.page(raw);if(value===undefined){actual=404;body={version:'explorers-public-error/v1',error:{code:'NOT_FOUND'}};}else body=value;}catch(error){if(!(error instanceof PublicContentFailure))throw error;actual=error.status;body={version:'explorers-public-error/v1',error:{code:actual===409?'PAGE_CHANGED':'BAD_REQUEST'}};}
  if(!visible&&parts[9]===undefined&&actual===200&&mutant){const value=structuredClone(body) as {items:Record<string,unknown>[]};if(mutant==='private-id')value.items[0].id=id(0);if(mutant==='extra-field')value.items[0].accountId=account;if(mutant==='missing-row')value.items.pop();body=value;}
  return consume({status:()=>actual,body:async()=>Buffer.from(JSON.stringify(body)),headers:()=>({}),dispose:disposed},status);
 }
 const support=readFileSync(new URL('../../../../explorers-earth/e2e/replatform/public-parity-spec-support.ts',import.meta.url),'utf8'),supportAst=ts.createSourceFile('support.ts',support,ts.ScriptTarget.Latest,true),consumeNode=supportAst.statements.find((n):n is ts.FunctionDeclaration=>ts.isFunctionDeclaration(n)&&n.name?.text==='consume')!;
 const consume=Function('expect','PUBLIC_PARITY_QUALIFICATION_POLICY',ts.transpileModule(consumeNode.getText(supportAst).replace(/^export /,'')+';return consume;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(expect,PUBLIC_PARITY_QUALIFICATION_POLICY);
 return {service,lists,calls,disposed,read,hide(){visible=false;}};
}
function actualFinalProbe(){const source=readFileSync(new URL('../../../../explorers-earth/e2e/replatform/public-parity.spec.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('spec.ts',source,ts.ScriptTarget.Latest,true);let clause:ts.CaseClause|undefined;function visit(n:ts.Node){if(ts.isCaseClause(n)&&n.expression.getText(ast)==='5')clause=n;ts.forEachChild(n,visit);}visit(ast);const block=clause!.statements.find(ts.isBlock)!,start=block.statements.findIndex(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='first')),tail=block.statements.slice(start).filter(n=>!ts.isBreakStatement(n)),schemas=ast.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['livePublicCollectionPageSchema','livePublicRecommendationPageSchema'].includes(d.name.getText(ast))));
 const code=ts.transpileModule(schemas.map(n=>n.getText(ast)).join(';')+';return async(scope,anonymous,a,owner,list,people)=>{'+tail.map(n=>n.getText(ast)).join(';')+'};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return Function('expect','genericURL','patch','z','ownerCollectionDtoSchema','publicContentRequestSchema','publicRecommendationDetailSchema','publicRecommendationSummarySchema',code)(expect,(h:string,c:string,s?:string)=>`/api/explorers/v1/public/profiles/${h}/collections/${c}${s?'/'+s+'/recommendations':''}`,async(scope:{hide:()=>void})=>scope.hide(),z,ownerCollectionDtoSchema,publicContentRequestSchema,publicRecommendationDetailSchema,publicRecommendationSummarySchema);
}
it('actual service and actual case5 probe distinguish live category continuation from hidden parent cursor denial',async()=>{const f=fixture();await expect(actualFinalProbe()({read:f.read,hide:f.hide}, {},{handle,accountId:account},{},f.lists[0],{lists:f.lists})).resolves.toBeUndefined();expect(f.calls).toHaveLength(4);expect(f.disposed).toHaveBeenCalledTimes(4);expect(f.calls.filter(p=>p.includes('/people-list-0/recommendations'))).toHaveLength(2);});
it.each(['private-id','extra-field','missing-row'] as const)('actual case5 strict live-page oracle refuses %s rather than weakening privacy or page completeness',async mutant=>{const f=fixture(mutant);await expect(actualFinalProbe()({read:f.read,hide:f.hide},{},{handle,accountId:account},{},f.lists[0],{lists:f.lists})).rejects.toThrow();});
