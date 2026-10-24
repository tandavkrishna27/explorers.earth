import {expect,it} from 'vitest';
import {linkPreviewRequestSchema,linkPreviewSchema} from '../../../shared/explorersLinkPreviewContract';
it('request takes one http(s) url without credentials or port',()=>{
 expect(linkPreviewRequestSchema.safeParse({url:'https://shop.example/p/1'}).success).toBe(true);
 for(const url of ['ftp://x.example','https://u:p@x.example','https://x.example:8443/','javascript:alert(1)'])expect(linkPreviewRequestSchema.safeParse({url}).success).toBe(false);
});
it('response is bounded and optional per field',()=>{
 expect(linkPreviewSchema.parse({url:'https://x.example',title:null,description:null,imageUrl:null,siteName:null,product:null,person:null}).product).toBeNull();
 expect(linkPreviewSchema.safeParse({url:'https://x.example',title:'t',description:null,imageUrl:null,siteName:null,product:{name:'n',brand:null,price:'19.90',currencyCode:'USD'},person:null}).success).toBe(true);
});
