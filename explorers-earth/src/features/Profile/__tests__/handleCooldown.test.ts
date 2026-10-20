import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {toast} from 'sonner';
import useAuthStore from '../../../store/store';
import {explorersApiClient} from '../../../lib/explorersApiClient';
import {formatCooldownDate,handleCooldownFor,handleCooldownMessage,nextAllowedAtFrom} from '../handleCooldown';
import {reportProfileSaveError} from '../profileSaveError';
import en from '../../../i18n/resources/en.json';

vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn(),warning:vi.fn()}}));
const t=(key:string,options?:Record<string,unknown>)=>{
 const text=key.split('.').reduce<unknown>((node,part)=>(node as Record<string,unknown>)?.[part],en) as string|undefined;
 return Object.entries(options??{}).reduce((value,[name,v])=>(value??key).replace(`{{${name}}}`,String(v)),text??key);
};
const NOW=new Date('2026-10-19T12:00:00.000Z');

describe('handle cooldown shown to the owner',()=>{
 it('is locked only while the server says the next change is in the future',()=>{
  expect(handleCooldownFor(undefined,NOW)).toEqual({locked:false,allowedAt:null});
  expect(handleCooldownFor(null,NOW)).toEqual({locked:false,allowedAt:null});
  expect(handleCooldownFor('2026-10-19T11:59:59.000Z',NOW).locked).toBe(false);
  expect(handleCooldownFor('not a date',NOW).locked).toBe(false);
  const locked=handleCooldownFor('2026-11-18T12:00:00.000Z',NOW);
  expect(locked.locked).toBe(true);expect(locked.allowedAt?.toISOString()).toBe('2026-11-18T12:00:00.000Z');
 });
 it('formats the date with the UI language instead of the browser regional format',()=>{
  const date=new Date('2026-11-18T12:00:00.000Z');
  expect(formatCooldownDate(date,'es')).toBe('18 de noviembre de 2026');
  expect(formatCooldownDate(date,'de')).toBe('18. November 2026');
  expect(formatCooldownDate(date,'en')).toBe('November 18, 2026');
  expect(formatCooldownDate(date,'not a locale!!')).toMatch(/2026/);
 });
 it('follows the document language when no locale is given',()=>{
  document.documentElement.lang='es';
  try{expect(handleCooldownMessage(t,new Date('2026-11-18T12:00:00.000Z'))).toContain('18 de noviembre de 2026');}
  finally{document.documentElement.lang='';}
 });
 it('names the date the server reported',()=>{
  const date=new Date('2026-11-18T12:00:00.000Z');
  expect(handleCooldownMessage(t,date,'en')).toBe('You can change your username again on November 18, 2026.');
  expect(handleCooldownMessage(t,null)).toBe(en.toast.warning.usernameCooldownReady);
 });
});

describe('a handle change the server refused for the cooldown',()=>{
 beforeEach(()=>{vi.mocked(toast.error).mockClear();useAuthStore.setState({isAuthenticated:true,accountId:'acc',generation:1});});
 afterEach(()=>vi.unstubAllGlobals());

 it('carries the next-allowed date through the API client',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:{code:'HANDLE_COOLDOWN',message:'The handle can be changed again on 2026-11-18',nextAllowedAt:'2026-11-18T12:00:00.000Z',requestId:'r'}}),{status:409})));
  const failure=await explorersApiClient.updateAccount({expectedRevision:3,handle:'another'} as never).catch(error=>error);
  expect(failure).toMatchObject({status:409,code:'HANDLE_COOLDOWN',details:{nextAllowedAt:'2026-11-18T12:00:00.000Z'}});
  expect(nextAllowedAtFrom(failure)).toBe('2026-11-18T12:00:00.000Z');
 });
 it('is told as a date, not as "unexpected error" or a conflict to reload',()=>{
  const refusal=Object.assign(new Error('The handle can be changed again on 2026-11-18'),{status:409,code:'HANDLE_COOLDOWN',details:{nextAllowedAt:'2026-11-18T12:00:00.000Z'}});
  reportProfileSaveError(refusal,t as never);
  expect(toast.error).toHaveBeenCalledTimes(1);
  expect(vi.mocked(toast.error).mock.calls[0][0]).toBe('You can change your username again on November 18, 2026.');
 });
 it('is not mistaken for a stale-revision conflict',()=>{
  expect(nextAllowedAtFrom(Object.assign(new Error('x'),{code:'CONFLICT'}))).toBeUndefined();
 });
});
