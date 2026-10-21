import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import TextBlot,{escapeText} from 'quill/blots/text';
import {expect,it} from 'vitest';
import {normalizeRichNote} from '../../../../../../../tunes/server/application/richNote';
const editorFile=resolve('node_modules/quill/core/editor.js'),editor=ts.createSourceFile(editorFile,readFileSync(editorFile,'utf8'),ts.ScriptTarget.Latest,true),serializer=editor.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='convertHTML')!;
const serialize=new Function('TextBlot','escapeText',serializer.getText(editor)+';return convertHTML;')(TextBlot,escapeText);
const file=resolve('e2e/replatform/people.spec.ts'),source=readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
let assertion:ts.ExpressionStatement|undefined,helper:ts.FunctionDeclaration|undefined;
const visit=(node:ts.Node)=>{if(ts.isExpressionStatement(node)&&node.getText(ast).includes('final.note.html')&&node.getText(ast).includes('Native qualification note'))assertion=node;if(ts.isFunctionDeclaration(node)&&node.name?.text==='renderedPeopleNoteText')helper=node;ts.forEachChild(node,visit);};visit(ast);
if(!assertion)throw Error('Actual persisted People note assertion missing');
const code=ts.transpileModule((helper?helper.getText(ast):'')+';return(async()=>{'+assertion.getText(ast)+'})();',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const oracle=new Function('expect','final','page','scope',code);
const check=(html:string)=>oracle(expect,{note:{version:1,format:'quill-html',html}},{evaluate:async(project:(html:string)=>string,value:string)=>project(value)},{client:{trackProducer:(operation:()=>Promise<unknown>)=>operation()}});
it('the actual persisted People oracle preserves exact note text from installed Quill and native normalization',async()=>{const text='Native qualification note',blot=Object.create(TextBlot.prototype);blot.value=()=>text;const html='<p>'+serialize(blot,0,text.length)+'</p>';expect(html).toContain('&nbsp;');const note=normalizeRichNote({version:1,format:'quill-html',html});expect(note).toMatchObject({version:1,format:'quill-html'});// BKS-X01: the server now stores Quill's &nbsp; as plain spaces.
expect(note?.html).toBe('<p>'+text+'</p>');await check(note!.html);});
it('the actual persisted People oracle rejects changed or missing note text',async()=>{for(const html of ['<p>Changed qualification note</p>','<p>Native qualification</p>','<p><br></p>'])await expect(check(html)).rejects.toThrow();});
