import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const source=readFileSync(new URL('../node_modules/quill2-emoji/dist/index.js',import.meta.url),'utf8');
const data=source.slice(source.indexOf('let ee = ['),source.indexOf('const me ='));
const emoji=Object.fromEntries([...data.matchAll(/name: "([a-zA-Z0-9_+-]+)",\s+unicode: "([a-fA-F0-9-]+)"/g)].map(([,name,unicode])=>[name,String.fromCodePoint(...unicode.split('-').map(x=>parseInt(x,16)))]));
if(Object.keys(emoji).length<1000) throw new Error('Installed emoji data format changed; review generator');
const target=new URL('../../tunes/server/application/quillEmojiData.json',import.meta.url);
const output=JSON.stringify({package:'quill2-emoji',version:'0.1.2',sourceSha256:createHash('sha256').update(source).digest('hex'),emoji},null,2)+'\n';
if(process.argv.includes('--check')) {if(readFileSync(target,'utf8')!==output) throw new Error('Emoji metadata differs from installed editor');}
else writeFileSync(target,output);
