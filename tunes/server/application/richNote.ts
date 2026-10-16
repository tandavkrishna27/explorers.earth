import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { richNoteSchema, RICH_NOTE_BYTES, type RichNote } from '../../shared/explorersRichNoteContract';
import emojiData from './quillEmojiData.json';
import { RecommendationFailure } from '../repositories/explorersRecommendationRepository';

const window=new JSDOM('').window;
const purifier=createDOMPurify(window);
const tags=['p','br','h1','h2','h3','strong','b','em','i','u','s','span','ol','ul','li'];
const attrs=['style','class','data-list','data-name','contenteditable'];
type Node=DefaultTreeAdapterMap['node'];
type Element=DefaultTreeAdapterMap['element'];
const invalid=():never=>{throw new RecommendationFailure(422,'Invalid rich note markup');};
const tooLarge=():never=>{throw new RecommendationFailure(413,'Rich note exceeds the authoring bound');};
const text=(node:Node):string=>'value' in node?node.value:'childNodes' in node?node.childNodes.map(text).join(''):'';
function safeColor(value:string) {
 if(/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value))return true;
 const match=value.match(/^(rgb|rgba)\(([^)]+)\)$/i);if(!match)return false;
 const values=match[2].split(',').map(x=>x.trim());if(values.length!==(match[1].toLowerCase()==='rgba'?4:3)||values.some(x=>!/^\d+(?:\.\d+)?$/.test(x)))return false;
 return values.slice(0,3).every(x=>Number.isInteger(Number(x))&&Number(x)<=255)&&(values.length===3||Number(values[3])<=1);
}
function style(value:string) {
 const fields=value.split(';').filter(x=>x.trim());const keys=new Set<string>();
 for(const field of fields) {
  const match=field.match(/^\s*(color|background-color)\s*:\s*(.*?)\s*$/i);if(!match||keys.has(match[1].toLowerCase())||!safeColor(match[2]))invalid();keys.add(match![1].toLowerCase());
 }
 if(!fields.length)invalid();
}
/** Parse/validate a small authoring grammar before final sanitizer; never silently drop unsupported data. */
export function normalizeRichNote(raw:unknown):RichNote|null {
 if(raw===null)return null;
 if(raw&&typeof raw==='object'&&'html' in raw&&typeof raw.html==='string'&&Buffer.byteLength(raw.html,'utf8')>RICH_NOTE_BYTES)tooLarge();
 const parsed=richNoteSchema.safeParse(raw);if(!parsed.success)return invalid();
 const html=parsed.data.html;
 // Lone UTF16 surrogates would be changed by JSON/UTF8 transport; reject loss.
 if(html.isWellFormed&&!html.isWellFormed())invalid();
 let parseError=false;
 const root=parseFragment(html,{sourceCodeLocationInfo:true,onParseError:()=>{parseError=true;}});
 if(parseError)invalid();
 // Bound the whole tree iteratively before recursive text/grammar checks.
 const pending=root.childNodes.map(node=>({node,depth:1}));let nodes=0;
 while(pending.length){const {node,depth}=pending.pop()!;if(++nodes>10000||depth>128)tooLarge();if('childNodes' in node)for(const child of node.childNodes)pending.push({node:child,depth:depth+1});}
 const visit=(node:Node,depth:number)=>{
  if(node.nodeName==='#text')return;
  if(!('tagName' in node))invalid();
  const el=node as Element;if(el.namespaceURI!=='http://www.w3.org/1999/xhtml'||!tags.includes(el.tagName))invalid();
  if(!el.sourceCodeLocation?.startTag||el.tagName!=='br'&&!el.sourceCodeLocation.endTag)invalid();
  const values=Object.fromEntries(el.attrs.map(a=>[a.name,a.value]));
  for(const attr of el.attrs) {
   if(attr.namespace||!attrs.includes(attr.name))invalid();
   if(attr.name==='style') {if(!['span','strong','b','em','i','u','s'].includes(el.tagName))invalid();style(attr.value);}
   if(attr.name==='data-list'&&(el.tagName!=='li'||!['ordered','bullet'].includes(attr.value)))invalid();
   if(attr.name==='contenteditable'&&(el.tagName!=='span'||attr.value!=='false'))invalid();
   if(attr.name==='data-name'&&(el.tagName!=='span'||values.class!=='ql-emojiblot'||!(attr.value in emojiData.emoji)))invalid();
  }
  if(values.class!==undefined) {
   const name=values['data-name'];
   if(values.class==='ql-ui') {if(el.tagName!=='span'||el.parentNode?.nodeName!=='li'||text(el)!==''||el.childNodes.length)invalid();}
   else if(values.class==='ql-emojiblot') {
    if(!name||!Object.hasOwn(emojiData.emoji,name))invalid();
    const expected=emojiData.emoji[name as keyof typeof emojiData.emoji];
    if(text(el).replace(/\uFEFF/g,'')!==expected)invalid();
    if(el.attrs.some(a=>!['class','data-name'].includes(a.name)))invalid();
    const children=el.childNodes.filter((n):n is Element=>'tagName' in n),guards=el.childNodes.filter(n=>!('tagName' in n));
    if(children.length!==1||guards.some(n=>n.nodeName!=='#text'||text(n)!=='\uFEFF')||guards.length!==0&&guards.length!==2)invalid();
    let leaf=children[0];
    if(leaf.attrs.length===1&&leaf.attrs[0].name==='contenteditable'&&leaf.attrs[0].value==='false') {
     if(leaf.childNodes.length!==1||!('tagName' in leaf.childNodes[0]))invalid();leaf=leaf.childNodes[0] as Element;
    }
    if(leaf.tagName!=='span'||leaf.attrs.length!==1||leaf.attrs[0].name!=='class'||leaf.attrs[0].value!==`ap ap-${name}`||leaf.childNodes.length!==1||leaf.childNodes[0].nodeName!=='#text'||text(leaf)!==expected)invalid();
   } else if(/^ap ap-[a-zA-Z0-9_+-]+$/.test(values.class)) {
    const name=values.class.slice(6);let parent=el.parentNode;
    if(parent&&'attrs' in parent&&parent.attrs.some(a=>a.name==='contenteditable'&&a.value==='false'))parent=parent.parentNode;
    if(!parent||!('attrs' in parent)||!parent.attrs.some(a=>a.name==='class'&&a.value==='ql-emojiblot')||!parent.attrs.some(a=>a.name==='data-name'&&a.value===name)||text(el)!==emojiData.emoji[name as keyof typeof emojiData.emoji])invalid();
   } else invalid();
  }
  if(values.contenteditable!==undefined&&values.class!=='ql-ui'&&values.class!=='ql-emojiblot'&&!(el.parentNode&&'attrs' in el.parentNode&&el.parentNode.attrs.some(a=>a.name==='class'&&a.value==='ql-emojiblot')))invalid();
  for(const child of el.childNodes)visit(child,depth+1);
 };
 for(const node of root.childNodes)visit(node,1);
 const canonical=serialize(root);
 const safe=purifier.sanitize(canonical,{ALLOWED_TAGS:tags,ALLOWED_ATTR:attrs,ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false});
 // DOMPurify also records removal of its synthetic BODY container, which is
 // not author data. Any change to serialized author data remains fail-closed.
 if(safe!==canonical)invalid();
 if(Buffer.byteLength(safe,'utf8')>RICH_NOTE_BYTES)tooLarge();
 if(safe===''||safe==='<p><br></p>')return null;
 return {version:1,format:'quill-html',html:safe};
}
