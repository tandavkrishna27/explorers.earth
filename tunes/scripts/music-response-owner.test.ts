// @vitest-environment node
import {EventEmitter} from 'node:events';
import {describe, it, expect} from 'vitest';
import {ownMusicResponses, musicCleanup, withMusicCleanup} from '../../explorers-earth/e2e/replatform/music-response-owner';
const deferred = <T>() => { let resolve!: (value:T)=>void, reject!: (error:unknown)=>void; const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;}); return {promise,resolve,reject}; };
const response = (promise:Promise<any>, method='GET') => ({status:()=>200,url:()=>'/public',request:()=>({method:()=>method}),json:()=>promise});
const matches = (r:any) => r.status()===200 && r.url()==='/public' && r.request().method()==='GET';
describe('Music response ownership repair',()=>{
 it('handles rejection immediately and throws original error from owning drain',async()=>{
  const page=new EventEmitter(),owner=ownMusicResponses(page,matches),read=deferred(),error=new Error('genuine body failure'),unhandled:unknown[]=[];
  const listener=(error:unknown)=>unhandled.push(error);process.on('unhandledRejection',listener);
  try {page.emit('response',response(read.promise));read.reject(error);await new Promise(resolve=>setImmediate(resolve));await expect(owner.drain()).rejects.toBe(error);expect(()=>owner.assertHealthy()).toThrow(error);expect(unhandled).toEqual([]);} finally {process.off('unhandledRejection',listener);}
 });
 it('detaches then awaits pending settlement before close without suppressing rejection',async()=>{
  const page=new EventEmitter(),owner=ownMusicResponses(page,matches),read=deferred(),error=new Error('pending genuine failure');page.emit('response',response(read.promise));let finished=false;
  const stopped=owner.stop().then(()=>{finished=true;},(caught:unknown)=>{expect(caught).toBe(error);finished=true;});
  await Promise.resolve();expect(page.listenerCount('response')).toBe(0);expect(finished).toBe(false);read.reject(error);await stopped;expect(finished).toBe(true);
 });
 it('requires a matching post-fence read and tolerates older raw successful revisions',async()=>{
  const page=new EventEmitter(),owner=ownMusicResponses(page,matches);page.emit('response',response(Promise.resolve({revision:7})));await owner.drain();const fence=owner.fence();expect(owner.valuesAfter(fence)).toEqual([]);
  page.emit('response',response(Promise.resolve({revision:7}),'POST'));await owner.drain();expect(owner.valuesAfter(fence)).toEqual([]);
  page.emit('response',response(Promise.resolve({revision:6})));page.emit('response',response(Promise.resolve({revision:7})));await owner.drain();expect(owner.valuesAfter(fence)).toEqual([{revision:6},{revision:7}]);expect(()=>owner.assertHealthy()).not.toThrow();await owner.stop();
 });
 it('attempts every close and reset while preserving first cleanup failure',async()=>{
  const calls:string[]=[],first=new Error('first close'),last=new Error('reset');let caught:any;
  try {await musicCleanup([()=>{calls.push('close1');throw first;},async()=>{calls.push('close2');},()=>{calls.push('reset');throw last;}]);}catch(error){caught=error;}
  expect(calls).toEqual(['close1','close2','reset']);expect(caught).toBeInstanceOf(AggregateError);expect(caught.errors).toEqual([first,last]);expect(caught.cause).toBe(first);
 });
 it('preserves body failure when cleanup also fails',async()=>{
  const body=new Error('body'),cleanup=new Error('cleanup');let caught:any;try {await withMusicCleanup(async()=>{throw body;},async()=>{throw cleanup;});}catch(error){caught=error;}expect(caught).toBeInstanceOf(AggregateError);expect(caught.errors).toEqual([body,cleanup]);expect(caught.cause).toBe(body);
 });
 it('preserves the original finite marker when body health and stop report the same failure',async()=>{
  const page=new EventEmitter(),owner=ownMusicResponses(page,matches),read=deferred();
  const error=new Error('[music-stage:public-response-body-body] [music-cause:public-read-json-syntax]');
  page.emit('response',response(read.promise));read.reject(error);
  await expect(owner.drain()).rejects.toBe(error);
  let caught:unknown;
  try { await withMusicCleanup(async()=>{owner.assertHealthy();},()=>owner.stop()); } catch(error) {caught=error;}
  expect(caught).toBe(error);
  expect((caught as Error).message).toBe('[music-stage:public-response-body-body] [music-cause:public-read-json-syntax]');
 });

});
