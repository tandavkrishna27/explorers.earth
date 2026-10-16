import {busy,unavailable,LIMITS,type Credentials,type Release,GameCatalogFailure} from './gameCatalogTypes';
const credentials=new WeakMap<GameProviderCoordinator,Credentials>();
const once=(work:()=>void):Release=>{let released=false;return()=>{if(!released){released=true;work();}};};
export class GameProviderCoordinator {
 private callers=0;private memory=0;private catalogNative=0;private tokenNative=0;private starts:{catalog:number[];token:number[]}={catalog:[],token:[]};private accounts=new Set<string>();private rates=new Map<string,{at:number;count:number}>();
 constructor(readonly now:()=>number=Date.now){}
 bindCredentials(c:Credentials):void{if(!c||typeof c.clientId!=='string'||typeof c.clientSecret!=='string'||!/^[A-Za-z0-9_-]{1,512}$/.test(c.clientId)||!/^[A-Za-z0-9_-]{1,512}$/.test(c.clientSecret))throw unavailable();const old=credentials.get(this);if(old&&(old.clientId!==c.clientId||old.clientSecret!==c.clientSecret))throw unavailable();if(!old)credentials.set(this,Object.freeze({...c}));}
 reserveCaller():Release{if(this.callers>=LIMITS.callers)throw busy();this.callers++;return once(()=>this.callers--);}
 reserveMemory(n:number):Release{if(!Number.isSafeInteger(n)||n<1||this.memory+n>LIMITS.memory)throw busy();this.memory+=n;return once(()=>this.memory-=n);}
 reserveStart(kind:'catalog'|'token'):Release{const now=this.now();this.starts[kind]=this.starts[kind].filter(t=>now-t<1000);const active=kind==='catalog'?this.catalogNative:this.tokenNative;if(active>=(kind==='catalog'?8:1)||this.starts[kind].length>=(kind==='catalog'?4:1))throw busy();this.starts[kind].push(now);if(kind==='catalog')this.catalogNative++;else this.tokenNative++;return once(()=>{if(kind==='catalog')this.catalogNative--;else this.tokenNative--;});}
 reserveAccount(account:string):Release{if(this.accounts.has(account))throw busy();this.accounts.add(account);return once(()=>this.accounts.delete(account));}
 rate(account:string):void{const now=this.now();for(const [key,r]of Array.from(this.rates))if(now-r.at>=60000)this.rates.delete(key);const r=this.rates.get(account);if(r&&r.count>=30||!r&&this.rates.size>=10000)throw new GameCatalogFailure(429,'RATE_LIMITED');this.rates.set(account,{at:r?.at??now,count:(r?.count??0)+1});}
 snapshot(){return {callers:this.callers,memory:this.memory,catalogNative:this.catalogNative,tokenNative:this.tokenNative,accounts:this.accounts.size};}
}
export const createGameProviderCoordinator=(options:{now:()=>number})=>new GameProviderCoordinator(options.now);
