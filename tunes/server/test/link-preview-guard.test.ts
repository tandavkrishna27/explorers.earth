import {describe,expect,it} from 'vitest';
import {guardLinkPreviewTarget} from '../services/linkPreviewGuard';
const resolver=(map:Record<string,string[]>)=>async(host:string)=>(map[host]??[]).map(address=>({address,family:address.includes(':')?6:4}));
describe('link preview SSRF guard',()=>{
 it('pins a public address',async()=>{expect(await guardLinkPreviewTarget('https://shop.example/p',resolver({'shop.example':['93.184.216.34']}))).toMatchObject({address:{address:'93.184.216.34'}});});
 it.each([['127.0.0.1'],['10.0.0.5'],['169.254.169.254'],['192.168.1.1'],['::1'],['fd00::1'],['100.64.0.1']])('refuses %s',async ip=>{
  await expect(guardLinkPreviewTarget('https://shop.example/p',resolver({'shop.example':[ip]}))).rejects.toThrow('LINK_PREVIEW_BLOCKED');
 });
 it('refuses when ANY resolved address is private (rebinding)',async()=>{await expect(guardLinkPreviewTarget('https://a.example',resolver({'a.example':['93.184.216.34','10.0.0.1']}))).rejects.toThrow('LINK_PREVIEW_BLOCKED');});
 it.each(['https://127.0.0.1/','https://[::1]/','https://localhost/','https://x.internal/','https://printer.local/','https://localhost./','https://x.internal./','https://printer.local./'])('refuses literal/internal host %s',async url=>{await expect(guardLinkPreviewTarget(url,resolver({}))).rejects.toThrow('LINK_PREVIEW_BLOCKED');});
 it('refuses unresolvable hosts and resolver failures',async()=>{
  await expect(guardLinkPreviewTarget('https://none.example/',resolver({}))).rejects.toThrow('LINK_PREVIEW_BLOCKED');
  await expect(guardLinkPreviewTarget('https://none.example/',async()=>{throw new Error('dns');})).rejects.toThrow('LINK_PREVIEW_BLOCKED');
 });
 it('test-only loopback allowance permits exactly 127.0.0.1 and ::1 resolutions, nothing else private',async()=>{
  const opts={allowLoopbackForTest:true};
  await expect(guardLinkPreviewTarget('https://shop.example/',resolver({'shop.example':['127.0.0.1']}),opts)).resolves.toMatchObject({address:{address:'127.0.0.1'}});
  await expect(guardLinkPreviewTarget('https://shop.example/',resolver({'shop.example':['::1']}),opts)).resolves.toMatchObject({address:{address:'::1'}});
  for(const ip of ['127.0.0.2','10.0.0.1','169.254.169.254','192.168.1.1','fd00::1','0.0.0.0'])await expect(guardLinkPreviewTarget('https://shop.example/',resolver({'shop.example':[ip]}),opts)).rejects.toThrow('LINK_PREVIEW_BLOCKED');
  // Literal IPs and internal names stay refused even with the allowance.
  for(const url of ['https://127.0.0.1/','https://[::1]/','https://localhost/'])await expect(guardLinkPreviewTarget(url,resolver({}),opts)).rejects.toThrow('LINK_PREVIEW_BLOCKED');
 });
});
