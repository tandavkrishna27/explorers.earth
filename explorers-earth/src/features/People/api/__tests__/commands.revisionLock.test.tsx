import React from 'react';
import {act,renderHook} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {usePeopleCommands} from '../query';
import {itemId,listId} from '../../../../test/revisionLockHarness';
import {describeRevisionLock} from '../../../../test/revisionLockSuite';

function commands(){return renderHook(()=>usePeopleCommands(),{wrapper:({children})=><MemoryRouter initialEntries={['/people']}>{children}</MemoryRouter>}).result;}
describeRevisionLock('People commands','people',[
 {name:'updateList',kind:'list',method:'PATCH'},
 {name:'archiveList',kind:'list',method:'DELETE'},
 {name:'publishRecommendation',kind:'item',method:'PATCH'},
 {name:'archivePerson',kind:'item',method:'DELETE'},
],async name=>{
 const hook=commands();
 await act(async()=>{
  const c=hook.current;
  if(name==='updateList')await c.updateList(listId,{title:'Renamed'});
  else if(name==='archiveList')await c.archiveList(listId);
  else if(name==='archivePerson')await c.archivePerson(itemId);
  else await c.publishRecommendation(itemId,true);
 });
});
