import {parse} from 'parse5';
import {linkPreviewSchema,linkPreviewUrlSchema,type LinkPreview} from '../../shared/explorersLinkPreviewContract';

const MAX_NODES=5000,MAX_DEPTH=64,MAX_LD_BLOCKS=10,MAX_LD_BYTES=256*1024,MAX_LD_ITEMS=200;
const META_KEYS=new Set(['og:title','og:description','og:image','og:site_name','twitter:title','twitter:description','twitter:image','description']);
const AMOUNT=/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$/;
type Node={nodeName:string;tagName?:string;attrs?:{name:string;value:string}[];childNodes?:Node[];value?:string;content?:Node};
type Json=Record<string,unknown>;

/** Trimmed, control characters replaced, whitespace collapsed, truncated to the contract maximum; empty -> null. */
function clean(value:unknown,max:number):string|null{
 if(typeof value!=='string'&&typeof value!=='number')return null;
 const v=String(value).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max).trim();
 return v||null;
}
function safeUrl(value:unknown,base:string):string|null{
 if(typeof value!=='string')return null;
 try{const href=new URL(value.trim(),base).href;return linkPreviewUrlSchema.safeParse(href).success?href:null;}catch{return null;}
}
function textOf(node:Node):string{let out='';for(const c of node.childNodes??[])if(c.nodeName==='#text')out+=c.value??'';return out;}

function collect(html:string){
 const meta:Record<string,string>={};let title:string|null=null;const ld:string[]=[];
 let doc:Node;try{doc=parse(html) as unknown as Node;}catch{return {meta,title,ld};}
 let visited=0;
 const walk=(node:Node,depth:number)=>{
  if(++visited>MAX_NODES||depth>MAX_DEPTH)return;
  const tag=node.tagName;
  if(tag==='meta'){
   const attr=(n:string)=>node.attrs?.find(a=>a.name===n)?.value;
   const key=(attr('property')??attr('name')??'').trim().toLowerCase();const content=attr('content');
   if(META_KEYS.has(key)&&content!==undefined&&!(key in meta))meta[key]=content;
  }else if(tag==='title'&&title===null)title=textOf(node);
  else if(tag==='script'&&(node.attrs?.find(a=>a.name==='type')?.value??'').trim().toLowerCase()==='application/ld+json'){
   if(ld.length<MAX_LD_BLOCKS+1)ld.push(textOf(node));
  }
  for(const child of node.childNodes??[])walk(child,depth+1);
  if(node.content)walk(node.content,depth+1);
 };
 walk(doc,0);
 return {meta,title,ld};
}

function flatten(blocks:string[]):Json[]{
 const out:Json[]=[];
 const add=(v:unknown,depth:number)=>{
  if(out.length>=MAX_LD_ITEMS||depth>8||v===null||typeof v!=='object')return;
  if(Array.isArray(v)){for(const x of v)add(x,depth+1);return;}
  const o=v as Json;out.push(o);
  if(o['@graph'])add(o['@graph'],depth+1);
  if(o.mainEntity)add(o.mainEntity,depth+1);
 };
 for(const block of blocks){if(Buffer.byteLength(block)>MAX_LD_BYTES)continue;try{add(JSON.parse(block),0);}catch{/* malformed block: skip */}}
 return out;
}
const isType=(o:Json,t:string)=>{const v=o['@type'];return v===t||Array.isArray(v)&&v.includes(t);};
const first=(v:unknown):unknown=>Array.isArray(v)?v[0]:v;
function imageOf(v:unknown):unknown{const f=first(v);return f&&typeof f==='object'?(f as Json).url:f;}
function price(v:unknown):string|null{const s=typeof v==='number'?String(v):typeof v==='string'?v.trim():'';return AMOUNT.test(s)?s:null;}

/** Owner-pasted page -> bounded preview. Never throws on hostile markup; the output is contract-validated. */
export function parseLinkPreview(pageUrl:string,html:string):LinkPreview{
 const {meta,title,ld}=collect(html);
 const items=ld.length>MAX_LD_BLOCKS?[]:flatten(ld);
 const productLd=items.find(o=>isType(o,'Product'));
 const personLd=items.find(o=>isType(o,'Person'));
 let product:LinkPreview['product']=null,person:LinkPreview['person']=null;
 if(productLd){
  const brand=productLd.brand;const offer=first(productLd.offers) as Json|undefined;
  const currency=typeof offer?.priceCurrency==='string'?offer.priceCurrency.trim().toUpperCase():'';
  product={name:clean(productLd.name,500),brand:clean(brand&&typeof brand==='object'?(first(brand) as Json)?.name:brand,200),price:offer&&typeof offer==='object'?price(offer.price):null,currencyCode:/^[A-Z]{3}$/.test(currency)?currency:null};
 }
 if(personLd){
  const sameAs=(Array.isArray(personLd.sameAs)?personLd.sameAs:[personLd.sameAs]).map(v=>safeUrl(v,pageUrl)).filter((v):v is string=>v!==null);
  person={name:clean(personLd.name,500),headline:clean(personLd.jobTitle,500)??clean(personLd.description,500),sameAs:[...new Set(sameAs)].slice(0,8)};
 }
 const imageCandidates=[productLd?imageOf(productLd.image):undefined,personLd?imageOf(personLd.image):undefined,meta['og:image'],meta['twitter:image']];
 let imageUrl:string|null=null;for(const c of imageCandidates){imageUrl=safeUrl(c,pageUrl);if(imageUrl)break;}
 return linkPreviewSchema.parse({
  url:pageUrl,
  title:clean(meta['og:title'],500)??clean(meta['twitter:title'],500)??clean(title,500)??product?.name??person?.name??null,
  description:clean(meta['og:description'],2000)??clean(meta['twitter:description'],2000)??clean(meta.description,2000),
  imageUrl,siteName:clean(meta['og:site_name'],200),product,person,
 });
}

/** oEmbed is consulted only for YouTube and Vimeo. */
export function oembedEndpoint(raw:string):string|null{
 let host:string;try{host=new URL(raw).hostname.toLowerCase();}catch{return null;}
 const enc=encodeURIComponent(raw);
 if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(host))return `https://www.youtube.com/oembed?format=json&url=${enc}`;
 if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(host))return `https://vimeo.com/api/oembed.json?url=${enc}`;
 return null;
}
