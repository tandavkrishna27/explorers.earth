import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup} from '@testing-library/react';
import useAuthStore from '../store/store';
import {conflictEvents,signIn,stubOwnerApi,viewed,type Category} from './revisionLockHarness';

export type LockOp={name:string;kind:'list'|'item';method:'PATCH'|'DELETE'};

const LIST_VIEWED=5,ITEM_VIEWED=3;

/**
 * The lost-update contract for one command module. Each operation must send the revision
 * the owner's view showed. When the re-read right before the write is newer than that, the
 * edit is refused as a conflict and nothing is sent, so another tab's save is never
 * overwritten. (Before the fix the re-read revision was sent, the lock never tripped and the
 * last write silently won.)
 */
export function describeRevisionLock(label:string,category:Category,operations:LockOp[],run:(name:string)=>Promise<unknown>){
 describe(`${label} lost-update guard`,()=>{
  beforeEach(()=>{vi.unstubAllGlobals();signIn();history.replaceState({},'','/');});
  afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();useAuthStore.getState().logout();});
  const names=operations.map(op=>op.name);
  it.each(names)('%s sends the revision the user was looking at',async name=>{
   const writes=stubOwnerApi(category,{list:LIST_VIEWED,item:ITEM_VIEWED});viewed(LIST_VIEWED,ITEM_VIEWED);
   const op=operations.find(candidate=>candidate.name===name)!;
   await run(name);
   expect(writes).toHaveLength(1);
   expect(writes[0].method).toBe(op.method);
   expect(writes[0].body.expectedRevision).toBe(op.kind==='list'?LIST_VIEWED:ITEM_VIEWED);
  });
  it.each(names)('%s is refused as a conflict when another tab saved first',async name=>{
   const writes=stubOwnerApi(category,{list:LIST_VIEWED+1,item:ITEM_VIEWED+1});viewed(LIST_VIEWED,ITEM_VIEWED);
   const seen=conflictEvents();
   await expect(run(name)).rejects.toMatchObject({status:409,code:'CONFLICT'});
   expect(writes).toHaveLength(0);
   expect(seen).toHaveBeenCalled();
  });
 });
}
