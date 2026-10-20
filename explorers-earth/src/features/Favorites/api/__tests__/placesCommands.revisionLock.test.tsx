import React from 'react';
import {act,renderHook} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {usePlacesCommands} from '../placesCommands';
import {itemId,listId} from '../../../../test/revisionLockHarness';
import {describeRevisionLock} from '../../../../test/revisionLockSuite';

function commands(){return renderHook(()=>usePlacesCommands(),{wrapper:({children})=><MemoryRouter initialEntries={['/places']}>{children}</MemoryRouter>}).result;}
describeRevisionLock('Places commands','places',[
 {name:'updateList',kind:'list',method:'PATCH'},
 {name:'publishList',kind:'list',method:'PATCH'},
 {name:'setListPin',kind:'list',method:'PATCH'},
 {name:'archiveList',kind:'list',method:'DELETE'},
 {name:'publishPlace',kind:'item',method:'PATCH'},
 {name:'archivePlace',kind:'item',method:'DELETE'},
],async name=>{
 const hook=commands();
 await act(async()=>{
  const c=hook.current;
  if(name==='updateList')await c.updateList(listId,{title:'Renamed'});
  else if(name==='publishList')await c.publishList(listId,true);
  else if(name==='setListPin')await c.setListPin(listId,2);
  else if(name==='archiveList')await c.archiveList(listId);
  else if(name==='publishPlace')await c.publishPlace(itemId,true);
  else await c.archivePlace(itemId);
 });
});
