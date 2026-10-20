import React from 'react';
import {act,renderHook} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {useGamesCommands} from '../query';
import {itemId,listId} from '../../../../test/revisionLockHarness';
import {describeRevisionLock} from '../../../../test/revisionLockSuite';

function commands(){return renderHook(()=>useGamesCommands(),{wrapper:({children})=><MemoryRouter initialEntries={['/games']}>{children}</MemoryRouter>}).result;}
describeRevisionLock('Games commands','games',[
 {name:'updateList',kind:'list',method:'PATCH'},
 {name:'archiveList',kind:'list',method:'DELETE'},
 {name:'publishRecommendation',kind:'item',method:'PATCH'},
],async name=>{
 const hook=commands();
 await act(async()=>{
  const c=hook.current;
  if(name==='updateList')await c.updateList(listId,{title:'Renamed'});
  else if(name==='archiveList')await c.archiveList(listId);
  else await c.publishRecommendation(itemId,true);
 });
});
