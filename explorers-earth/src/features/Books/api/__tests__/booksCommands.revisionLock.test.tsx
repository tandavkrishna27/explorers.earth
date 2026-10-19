import {act,renderHook} from '@testing-library/react';
import {useBookListCommands} from '../useBookListCommands';
import {listId} from '../../../../test/revisionLockHarness';
import {describeRevisionLock} from '../../../../test/revisionLockSuite';

describeRevisionLock('Books commands','books',[
 {name:'update',kind:'list',method:'PATCH'},
 {name:'archive',kind:'list',method:'DELETE'},
],async name=>{
 const hook=renderHook(()=>useBookListCommands()).result;
 await act(async()=>{
  if(name==='update')await hook.current.update({variables:{documentId:listId,List_Name:'Renamed'}});
  else await hook.current.archive({variables:{documentId:listId}});
 });
});
