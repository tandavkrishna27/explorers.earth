import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
const bundle=await build({stdin:{contents:`import Quill from 'quill';import 'quill2-emoji';
const formats=['header','bold','italic','underline','strike','color','background','list','emoji'];
const editor=new Quill(document.querySelector('#editor'),{modules:{toolbar:false},formats});
editor.setContents([{insert:'हैलो café',attributes:{bold:true,italic:true,underline:true,strike:true,color:'#e60000',background:'#ffff00'}},{insert:'\\n',attributes:{header:2}},{insert:{emoji:'grinning'}},{insert:'\\n'},{insert:'First'},{insert:'\\n',attributes:{list:'ordered'}},{insert:'Second'},{insert:'\\n',attributes:{list:'bullet'}}]);
globalThis.fixture={quillVersion:Quill.version,emojiVersion:'0.1.2',html:editor.root.innerHTML,ops:editor.getContents().ops};
const reload=new Quill(document.querySelector('#reload'),{modules:{toolbar:false},formats});reload.clipboard.dangerouslyPasteHTML(globalThis.fixture.html);globalThis.fixture.reloadedOps=reload.getContents().ops;
`,resolveDir:new URL('../',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')},bundle:true,format:'iife',write:false});
const browser=await chromium.launch({headless:true});
let fixture;
try {
 const page=await browser.newPage();await page.route('**/*',route=>route.abort());
 await page.setContent('<div id="editor"></div><div id="reload"></div>');await page.addScriptTag({content:bundle.outputFiles.find(file=>file.path.endsWith('.js')||file.path==='<stdout>').text});
 fixture=await page.evaluate(()=>globalThis.fixture);
}finally {await browser.close();}
const directory=new URL('../../tunes/shared/test-fixtures/',import.meta.url);mkdirSync(directory,{recursive:true});
writeFileSync(new URL('quill-note-v1.json',directory),JSON.stringify(fixture,null,2)+'\n');
