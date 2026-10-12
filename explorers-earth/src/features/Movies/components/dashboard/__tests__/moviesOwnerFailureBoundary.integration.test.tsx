import {it,expect} from 'vitest';
import {render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import {Routes,Route} from 'react-router-dom';
import {context,fixture,gate,list} from './moviesOwnerBoundaryFixture';
import MovieListView from '../MovieListView';
it.each(['accepted','rejected'] as const)('actual edit-return owner boundary: %s',async outcome=>{
 const c=context(),server=fixture(),g=gate();server.hold(g);
 const old=Object.getOwnPropertyDescriptor(globalThis,'__moviesOwnerDiagnostic');
 const slot={version:1,snapshot:{owner:'unavailable',phase:'unavailable',cause:'none',view:'unavailable',list:'unavailable',visibility:'unavailable',signal:'unavailable',guard:'unavailable',prompt:'unavailable'}};
 Object.defineProperty(globalThis,'__moviesOwnerDiagnostic',{configurable:true,writable:true,value:slot});
 let view:ReturnType<typeof render>|undefined;
 try{
  view=render(c.wrap(<Routes><Route path="/recommendations/movies/:listId" element={<MovieListView/>}/></Routes>));
  await waitFor(()=>expect(slot.snapshot).toMatchObject({owner:'pending',phase:'initial-category',guard:'fresh',signal:'present',prompt:'closed'}),{timeout:2000});
  expect(screen.queryByRole('button',{name:'Keep Draft'})).toBeNull();
  if(outcome==='rejected')server.reject();
  await act(async()=>g.release());
  await waitFor(()=>expect(slot.snapshot.owner).toBe(outcome),{timeout:4000});
  if(outcome==='accepted'){
   await waitFor(()=>expect(screen.getByRole('button',{name:'Keep Draft'})).toBeEnabled(),{timeout:2000});
   expect(slot.snapshot).toMatchObject({list:'ready-nonempty',visibility:'draft',guard:'consumed',signal:'absent',prompt:'open'});
  }else{
   expect(slot.snapshot).toMatchObject({phase:'initial-category',cause:'unavailable',list:'error',visibility:'unavailable',guard:'fresh',signal:'present',prompt:'closed'});
   expect(screen.queryByRole('button',{name:'Keep Draft'})).toBeNull();
  }
 }finally{server.close();view?.unmount();g.release();try{await act(async()=>server.drain());}finally{c.restore();old?Object.defineProperty(globalThis,'__moviesOwnerDiagnostic',old):Reflect.deleteProperty(globalThis,'__moviesOwnerDiagnostic');}}
});






