import React from 'react';
import {act,renderHook} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {useProductsCommands} from '../query';
import {itemId,listId} from '../../../../test/revisionLockHarness';
import {describeRevisionLock} from '../../../../test/revisionLockSuite';

function commands(){return renderHook(()=>useProductsCommands(),{wrapper:({children})=><MemoryRouter initialEntries={['/products']}>{children}</MemoryRouter>}).result;}
describeRevisionLock('Products commands','products',[
 {name:'updateList',kind:'list',method:'PATCH'},
 {name:'archiveList',kind:'list',method:'DELETE'},
 {name:'publishRecommendation',kind:'item',method:'PATCH'},
 {name:'archiveProduct',kind:'item',method:'DELETE'},
],async name=>{
 const hook=commands();
 await act(async()=>{
  const c=hook.current;
  if(name==='updateList')await c.updateList(listId,{title:'Renamed'});
  else if(name==='archiveList')await c.archiveList(listId);
  else if(name==='archiveProduct')await c.archiveProduct(itemId);
  else await c.publishRecommendation(itemId,true);
 });
});
