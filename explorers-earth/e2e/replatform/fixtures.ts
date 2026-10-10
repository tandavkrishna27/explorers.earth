import {test,expect,type Page,type BrowserContext,type APIRequestContext} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {assertFixtureOrigin} from './proxy-fixture-authority.mjs';
import {readAppsDescriptor} from './apps-descriptor-reader.mjs';

/**
 * The shared replatform lane fixture mandated by epic-04:95. Every existing lane rolled
 * its own sign-in, which is why no two lanes shared an identity model; 4.4, 4.5 and later
 * lanes consume this instead of re-deriving one. Folding the file into ticket 4.3 does not
 * move authority over the identity model away from the Authentication owner.
 *
 * It mounts no test-login endpoint. Sessions are the real ones the lane's in-process
 * fixture runner already minted through better-auth's internal adapter and handed over in
 * its descriptor file, so signing in here is only installing a cookie that already exists.
 *
 * It also does not relax the contained-network restriction: signInAs installs the same
 * origin-only route filter the delivered lanes use, so a spec that reaches for an outside
 * host still fails.
 */

export {test,expect};
export const base='/api/explorers/v1';

/** ownerA and ownerB are accounts. 'suspended' is not a third account - see signInAs. */
export type PersonaName='ownerA'|'ownerB'|'suspended';
export type Persona={readonly userId:string;readonly cookie:string;readonly handle:string};
type Descriptor={origin:string;controlCapability:string;personas:Record<string,Persona>};

function required(name:string):string{
 const value=process.env[name];
 if(!value)throw Error(`Replatform lane fixture requires ${name}`);
 return value;
}

/**
 * The lane name selects the control endpoint and its capability header, both of which the
 * runner namespaces per lane (/api/__games-fixture/control, x-games-fixture-capability).
 */
export const lane=required('REPLATFORM_E2E_LANE');
if(!/^[a-z][a-z0-9-]{2,30}$/.test(lane))throw Error('Invalid replatform lane name');

const descriptor=((): Descriptor => {
 const value=(():Descriptor=>{
  if(lane==='apps'){
   try{return JSON.parse(readAppsDescriptor(required('REPLATFORM_E2E_FIXTURE_PATH'))) as Descriptor;}
   catch{throw Error('APPS_DESCRIPTOR_CUSTODY_INVALID');}
  }
  return JSON.parse(readFileSync(required('REPLATFORM_E2E_FIXTURE_PATH'),'utf8')) as Descriptor;
 })();
 assertFixtureOrigin(value);
 if(value.origin!==process.env.PLAYWRIGHT_EXTERNAL_BASE_URL)throw Error(`${lane} fixture origin mismatch`);
 for(const name of ['ownerA','ownerB']){
  const persona=value.personas?.[name];
  if(!persona?.userId||!persona.cookie||!persona.handle||persona.cookie.indexOf('=')<1)throw Error(`${lane} fixture persona ${name} incomplete`);
 }
 return value;
})();

export const origin=descriptor.origin;
/** The acceptance accounts. The creator account id is not in the descriptor by design - resolve it with accountId. */
export const accounts:{readonly ownerA:Persona;readonly ownerB:Persona}={ownerA:descriptor.personas.ownerA,ownerB:descriptor.personas.ownerB};

const controlPath=`/api/__${lane}-fixture/control`,controlHeader=`x-${lane}-fixture-capability`;

/** One lane control action. Unknown actions are the runner's to reject, not this module's to guess. */
export async function control(api:APIRequestContext,action:string,timeout=20000){
 const response=await api.post(controlPath,{headers:{Origin:origin,[controlHeader]:descriptor.controlCapability},data:{action},timeout});
 expect(response.status(),`${lane} control ${action}`).toBe(200);
 return response.json() as Promise<Record<string,unknown>>;
}

async function installCookie(context:BrowserContext,persona:Persona){
 const split=persona.cookie.indexOf('=');
 await context.addCookies([{name:persona.cookie.slice(0,split),value:persona.cookie.slice(split+1),url:origin,sameSite:'Lax'}]);
}

/** Keeps a lane contained to its own origin; data: and blob: stay usable for uploads. */
async function containOrigin(page:Page){
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  return url.origin===origin||['data:','blob:'].includes(url.protocol)?route.continue():route.abort();
 });
}

/**
 * 'ownerA' and 'ownerB' sign in and assert a live session.
 *
 * 'suspended' is ownerA with the account suspended through the lane's own control action,
 * because that is how suspension is actually modelled - the delivered lanes use
 * suspend-ownerA rather than a third seeded account, and inventing one here would
 * describe an identity model the runners do not have. It therefore returns no account and
 * must not be combined with a plain 'ownerA' sign-in in the same test; call
 * restoreSuspended to undo it.
 */
export async function signInAs(page:Page,who:PersonaName='ownerA'){
 if(who==='suspended'){
  await installCookie(page.context(),accounts.ownerA);
  await containOrigin(page);
  await control(page.request,'suspend-ownerA');
  return undefined;
 }
 const persona=accounts[who];
 await installCookie(page.context(),persona);
 await containOrigin(page);
 const me=await page.request.get(`${base}/me`);
 expect(me.status()).toBe(200);
 const account=(await me.json()).account;
 // The creator account is a distinct record from the login user; a lane that confuses the
 // two would pass against the wrong identity.
 expect(account.id).not.toBe(persona.userId);
 return account as {id:string;handle:string};
}

export async function restoreSuspended(api:APIRequestContext){await control(api,'restore-ownerA');}

/** The lane's API request context. Owner commands carry an origin and an idempotency key. */
export function api(page:Page):APIRequestContext{return page.request;}
export async function command(request:APIRequestContext,method:'post'|'patch'|'put'|'delete',path:string,data:unknown,key=randomUUID()){
 return request[method](`${base}${path}`,{headers:{Origin:origin,'Idempotency-Key':key},data});
}
export async function accountId(request:APIRequestContext){
 const me=await request.get(`${base}/me`);
 expect(me.status()).toBe(200);
 return (await me.json()).account.id as string;
}
