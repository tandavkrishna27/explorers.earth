import {expect,it,vi} from 'vitest';
import {searchAppleApps,appleSearchUrl} from '../services/appleSearch';
import fixture from './fixtures/apple-search/notion.json';
it('builds a keyword search for iOS and macOS software',()=>{
 expect(appleSearchUrl('notion','IN','software')).toBe('https://itunes.apple.com/search?term=notion&country=IN&media=software&entity=software&limit=10');
 expect(appleSearchUrl('notion','US','macSoftware')).toContain('entity=macSoftware');
});
it('maps hits to app candidates',async()=>{
 const get=vi.fn().mockResolvedValue(fixture);
 const hits=await searchAppleApps('notion','IN',get);
 expect(hits[0]).toEqual(expect.objectContaining({title:'Notion: Notes, Tasks, AI',developer:'Notion Labs, Inc',appUrl:expect.stringMatching(/^https:\/\/apps\.apple\.com\//),iconUrl:expect.stringMatching(/^https:\/\/is\d-ssl\.mzstatic\.com\//),priceTier:'Free',platforms:['iOS']}));
 expect(get).toHaveBeenCalledTimes(2);
});
it('dedupes across the two searches, falls back to artistName and rejects bad input',async()=>{
 const hits=await searchAppleApps('notion','IN',vi.fn().mockResolvedValue(fixture));
 expect(hits).toHaveLength(2);expect(hits[1].developer).toBe('Notion Labs, Incorporated');
 await expect(searchAppleApps('','IN',vi.fn())).rejects.toThrow();
 await expect(searchAppleApps('x'.repeat(101),'IN',vi.fn())).rejects.toThrow();
 expect(appleSearchUrl('a b&c','in' as never,'software')).toContain('term=a+b%26c&country=US');
});
it('drops hits whose links are not Apple https URLs',async()=>{
 const hits=await searchAppleApps('x','US',vi.fn().mockResolvedValue({results:[{kind:'software',trackName:'Bad',trackViewUrl:'javascript:alert(1)',artworkUrl512:'https://evil.example/i.png',price:1}]}));
 expect(hits).toEqual([]);
});
