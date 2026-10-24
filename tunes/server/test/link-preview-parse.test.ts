import {readFileSync} from 'node:fs';import {join} from 'node:path';import {describe,expect,it} from 'vitest';
import {parseLinkPreview,oembedEndpoint} from '../services/linkPreviewParse';
const html=(n:string)=>readFileSync(join(__dirname,'fixtures/link-preview',n),'utf8');
describe('parseLinkPreview',()=>{
 it('Product JSON-LD fills name, brand, price, currency, image',()=>{expect(parseLinkPreview('https://shop.example/p',html('product-jsonld.html'))).toEqual({url:'https://shop.example/p',title:'Trail Shoe',description:null,imageUrl:'https://cdn.example/shoe-1.jpg',siteName:'Example Store',product:{name:'Trail Shoe',brand:'Acme',price:'119.90',currencyCode:'EUR'},person:null});});
 it('Person JSON-LD (incl. ProfilePage.mainEntity)',()=>{expect(parseLinkPreview('https://p.example/ada',html('person-jsonld.html')).person).toEqual({name:'Ada Example',headline:'Travel writer',sameAs:['https://www.instagram.com/ada.example']});});
 it('OG/Twitter only',()=>{const p=parseLinkPreview('https://x.example',html('og-only.html'));expect(p.product).toBeNull();expect(p.imageUrl).toMatch(/^https:/);});
 it('too many JSON-LD blocks degrades to OG only, never throws',()=>{expect(parseLinkPreview('https://x.example',html('huge-jsonld.html')).product).toBeNull();});
 it('relative og:image resolves against the page; javascript: images are dropped',()=>{
  expect(parseLinkPreview('https://x.example/a/b','<meta property="og:image" content="/i.png">').imageUrl).toBe('https://x.example/i.png');
  expect(parseLinkPreview('https://x.example','<meta property="og:image" content="javascript:alert(1)">').imageUrl).toBeNull();
 });
 it('malformed JSON-LD and control characters never throw',()=>{
  const p=parseLinkPreview('https://x.example','<title>a\u0001b</title><script type="application/ld+json">{not json</script>');
  expect(p.product).toBeNull();expect(p.title).toBe('a b');
 });
 it('oEmbed only for YouTube and Vimeo',()=>{expect(oembedEndpoint('https://www.youtube.com/@creator')).toMatch(/^https:\/\/www\.youtube\.com\/oembed\?/);expect(oembedEndpoint('https://vimeo.com/1')).toMatch(/^https:\/\/vimeo\.com\/api\/oembed\.json\?/);expect(oembedEndpoint('https://shop.example')).toBeNull();});
});
