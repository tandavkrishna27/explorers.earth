import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {describe,expect,it} from 'vitest';
import TextBlot,{escapeText} from 'quill/blots/text';
import {htmlToBlocks} from '../../../../utils/strapiBlocksConverter';
import {guideDescriptionText} from '../../../../utils/guideDescriptionText';

// Execute the installed serializer and the production form's exact projection.
const editorFile=resolve('node_modules/quill/core/editor.js');
const editor=ts.createSourceFile(editorFile,readFileSync(editorFile,'utf8'),ts.ScriptTarget.Latest,true);
const serializer=editor.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='convertHTML')!;
const serialize=new Function('TextBlot','escapeText',`${serializer.getText(editor)};return convertHTML;`)(TextBlot,escapeText);
const formFile=resolve('src/features/Guides/components/GuideSectionForm.tsx');
const form=ts.createSourceFile(formFile,readFileSync(formFile,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let projection:ts.VariableDeclaration|undefined;
function visit(node:ts.Node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='descriptionText')projection=node;ts.forEachChild(node,visit);}
visit(form);
if(!projection)throw Error('Production description projection missing');
const compiled=ts.transpileModule(`const ${projection.getText(form)};return descriptionText;`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const project=new Function('descriptionBlocks','guideDescriptionText',compiled);
const plain=(html:string)=>project(htmlToBlocks(html),guideDescriptionText);

describe('GuideSectionForm canonical description',()=>{
 it('preserves exact Unicode text from the installed Quill semantic serializer',()=>{
  const text='सुबह की सैर — café और भोजन';
  const blot=Object.create(TextBlot.prototype);blot.value=()=>text;
  const serialized=serialize(blot,0,text.length);
  expect(serialized).toContain('&nbsp;');
  expect(plain(`<p>${serialized}</p>`)).toBe(text);
 });
 it('decodes once while preserving inline concatenation, paragraph breaks and null emptiness',()=>{
  expect(plain('<p>A<strong>&amp; B</strong>&nbsp;C</p><p>&lt;tag&gt; &#x1F30D; &amp;nbsp;</p>')).toBe('A& B C\n<tag> 🌍 &nbsp;');
  expect(plain('<p><br></p>')).toBeNull();
  expect(plain('<p>&nbsp;</p>')).toBeNull();
  expect(plain('<p>Plain <strong>Unicode</strong> — 東京</p><p>Second line</p>')).toBe('Plain Unicode — 東京\nSecond line');
 });
});
