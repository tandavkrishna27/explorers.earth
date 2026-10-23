import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {publicAddress} from './bookCoverFetch';
import {linkPreviewUrlSchema} from '../../shared/explorersLinkPreviewContract';
export type Address={address:string;family:number};
export type Resolver=(host:string)=>Promise<Address[]>;
/**
 * allowLoopbackForTest lets integration tests reach a 127.0.0.1/::1 test server through a
 * resolver seam. Production wiring never sets it (asserted in link-preview-route.test.ts).
 */
export type GuardOptions={allowLoopbackForTest?:boolean};
export class LinkPreviewBlocked extends Error{constructor(){super('LINK_PREVIEW_BLOCKED');}}
const defaultResolver:Resolver=host=>lookup(host,{all:true,verbatim:true});
const testLoopback=new Set(['127.0.0.1','::1']);
/** One owner-pasted URL -> a pinned public address. Literal IPs and internal names are refused outright. */
export async function guardLinkPreviewTarget(raw:string,resolve:Resolver=defaultResolver,options:GuardOptions={}):Promise<{url:URL;address:Address}>{
 if(!linkPreviewUrlSchema.safeParse(raw).success)throw new LinkPreviewBlocked();
 const url=new URL(raw),host=url.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'').toLowerCase();
 if(isIP(host)||host==='localhost'||!host.includes('.')||/\.(local|localhost|internal|lan|home|corp|test|invalid)$/.test(host))throw new LinkPreviewBlocked();
 const addresses=await resolve(host).catch(()=>[] as Address[]);
 const allowed=(a:Address)=>publicAddress(a.address)||options.allowLoopbackForTest===true&&testLoopback.has(a.address);
 if(!addresses.length||addresses.some(a=>!allowed(a)||isIP(a.address)!==a.family))throw new LinkPreviewBlocked();
 return {url,address:addresses[0]};
}
