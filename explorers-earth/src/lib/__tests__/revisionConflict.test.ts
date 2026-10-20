import {describe,expect,it,vi} from 'vitest';
import {announceRevisionConflict,isRevisionConflict,REVISION_CONFLICT_EVENT,sinceRevisionConflict} from '../revisionConflict';

const failure=(status:number,code:string,message:string)=>Object.assign(new Error(message),{status,code});

describe('revision conflict classification',()=>{
 it.each([
  [failure(409,'CONFLICT','Account changed'),true],
  [failure(409,'REVISION_CONFLICT','Catalog changed'),true],
  [failure(412,'PRECONDITION_FAILED','Stale'),true],
  [failure(409,'CONFLICT','Reload the owner detail before saving'),true],
  [failure(409,'CONFLICT','Handle is unavailable'),false],
  [failure(409,'CONFLICT','Content conflicts with an existing resource'),false],
  [failure(409,'CONFLICT','Request key has already been used'),false],
  [failure(409,'ABORTED','Content command cancelled'),false],
  [failure(500,'CONFLICT','Account changed'),false],
  [new Error('Account changed'),false],
  [null,false],
 ])('%s -> %s',(error,expected)=>expect(isRevisionConflict(error)).toBe(expected));

 it('announces conflicts to the app shell and ignores everything else',()=>{
  const seen=vi.fn();window.addEventListener(REVISION_CONFLICT_EVENT,seen);
  announceRevisionConflict(failure(409,'CONFLICT','Handle is unavailable'));expect(seen).not.toHaveBeenCalled();
  const conflict=failure(409,'CONFLICT','Account changed');
  expect(announceRevisionConflict(conflict)).toBe(conflict);expect(seen).toHaveBeenCalledTimes(1);expect(sinceRevisionConflict()).toBeLessThan(1000);
  window.removeEventListener(REVISION_CONFLICT_EVENT,seen);
 });
});
