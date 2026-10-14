import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import TextBlot,{escapeText} from 'quill/blots/text';
import {encode} from 'html-entities';
import {expect,it} from 'vitest';
import {htmlToBlocks,blocksToHtml} from '../../../../utils/strapiBlocksConverter';
import {guideDescriptionText} from '../../../../utils/guideDescriptionText';

const editorFile=resolve('node_modules/quill/core/editor.js'),editor=ts.createSourceFile(editorFile,readFileSync(editorFile,'utf8'),ts.ScriptTarget.Latest,true),serializer=editor.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='convertHTML')!;
const serialize=new Function('TextBlot','escapeText',serializer.getText(editor)+';return convertHTML;')(TextBlot,escapeText);
function semantic(text:string){const blot=Object.create(TextBlot.prototype);blot.value=()=>text;return serialize(blot,0,text.length);}
const file=resolve('src/features/Guides/components/GuideDetails/EditGeneralTipsModal.tsx'),source=readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let submit:ts.VariableDeclaration|undefined,hydration:ts.VariableDeclaration|undefined;
function visit(node:ts.Node){if(ts.isVariableDeclaration(node)){if(node.name.getText(ast)==='handleSubmit')submit=node;if(node.name.getText(ast)==='htmlContent')hydration=node;}ts.forEachChild(node,visit);}
visit(ast);if(!submit||!hydration)throw Error('Actual tips save/hydration closures missing');
const compile=(declaration:ts.VariableDeclaration,result:string)=>ts.transpileModule('const '+declaration.getText(ast)+';return '+result+';',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
async function save(html:string,tags:string[]=[],convert=htmlToBlocks){let saved:any;const run=Function('tipsNotes','tags','htmlToBlocks','guideDescriptionText','setLoading','saveTips','toast','onSuccess','onClose',compile(submit!,'handleSubmit'))(html,tags,convert,guideDescriptionText,()=>{},async(value:unknown)=>{saved=value;},{success(){},error(){}},()=>{},()=>{});await run();return saved;}
const reopen=(blocks:unknown[],render=blocksToHtml)=>Function('guide','blocksToHtml','encode',compile(hydration!,'htmlContent'))({Tips_Notes:blocks},render,encode);

it('stores exact canonical Unicode leaf text from the installed semantic serializer while preserving bold and tags',async()=>{const text='यात्रा के लिए café — पानी साथ रखें',html='<p><strong>'+semantic(text)+'</strong></p>';expect(html).toContain('&nbsp;');const saved=await save(html,['संस्मरण']);expect(saved).toEqual({tipsNotes:[{type:'paragraph',children:[{type:'text',text,bold:true}]}],tags:['संस्मरण']});});
it('decodes each leaf once and preserves literal entity/markup intent across actual modal reopening',async()=>{const text='Literal &nbsp; <tag> & café',first=await save('<p><strong>'+semantic(text)+'</strong></p>');expect(first.tipsNotes[0].children[0]).toEqual({type:'text',text,bold:true});const second=await save(reopen(first.tipsNotes));expect(second).toEqual(first);});
it('preserves block order, newlines and all nontext leaf attributes while decoding only string leaves',async()=>{const blocks=[{type:'paragraph',local:'first',children:[{type:'text',text:'A&nbsp;B\nC',bold:true,italic:false,custom:{value:1}}]},{type:'paragraph',local:'second',children:[{type:'text',text:'&#x1F30D; &amp;nbsp;',underline:true},{type:'other',custom:'preserve'}]}],saved=await save('synthetic',[],()=>structuredClone(blocks));expect(saved).toEqual({tipsNotes:[{...blocks[0],children:[{...blocks[0].children[0],text:'A B\nC'}]},{...blocks[1],children:[{...blocks[1].children[0],text:'🌍 &nbsp;'},blocks[1].children[1]]}],tags:[]});});
it('hydration escapes only text and preserves URLs, other attributes and blocks without children',()=>{const blocks=[{type:'image',url:'/owned/synthetic-image',custom:{preserve:true}},{type:'paragraph',children:[{type:'text',text:'Unicode café <tag> &nbsp; "quoted"',bold:true,url:'/owned/synthetic-link'},{type:'other',url:'/owned/other'}]}],before=structuredClone(blocks);let received:unknown;expect(reopen(blocks,(value:any[])=>{received=value;return 'synthetic HTML';})).toBe('synthetic HTML');expect(received).toEqual([blocks[0],{...blocks[1],children:[{...blocks[1].children![0],text:'Unicode café &lt;tag&gt; &amp;nbsp; &quot;quoted&quot;'},blocks[1].children![1]]}]);expect(blocks).toEqual(before);});
