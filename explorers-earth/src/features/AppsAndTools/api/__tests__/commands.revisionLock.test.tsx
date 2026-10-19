import React from 'react';
import {act,renderHook} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {useAppsCommands} from '../query';
import {itemId,listId} from '../../../../test/revisionLockHarness';
import {describeRevisionLock} from '../../../../test/revisionLockSuite';

function commands(){return renderHook(()=>useAppsCommands(),{wrapper:({children})=><MemoryRouter initialEntries={['/apps']}>{children}</MemoryRouter>}).result;}
describeRevisionLock('AppsAndTools commands','apps',[
 {name:'updateList',kind:'list',method:'PATCH'},
 {name:'archiveList',kind:'list',method:'DELETE'},
 {name:'publishRecommendation',kind:'item',method:'PATCH'},
 {name:'archiveApp',kind:'item',method:'DELETE'},
],async name=>{
 const hook=commands();
 await act(async()=>{
  const c=hook.current;
  if(name==='updateList')await c.updateList(listId,{title:'Renamed'});
  else if(name==='archiveList')await c.archiveList(listId);
  else if(name==='archiveApp')await c.archiveApp(itemId);
  else await c.publishRecommendation(itemId,true);
 });
});
