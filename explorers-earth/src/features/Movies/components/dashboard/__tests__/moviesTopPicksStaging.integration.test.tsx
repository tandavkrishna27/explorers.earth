import {it,expect} from 'vitest';
import {render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import {Routes,Route} from 'react-router-dom';
import {context,fixture,gate,list} from './moviesOwnerBoundaryFixture';
import {useState} from 'react';
import TopPicksManager from '../TopPicksManager';
import {readMoviesOwnerContent} from '../../../api/moviesClient';
it.each(['accepted','rejected'] as const)('actual staged reorder pre-read: %s',async outcome=>{
 const c=context(),server=fixture(),g=gate();
 let view:ReturnType<typeof render>|undefined;const reads:Promise<void>[]=[];
 try{
  const content=await readMoviesOwnerContent(),movies=content.lists.flatMap(l=>l.recommended_movies);
  let refetches=0,closed=0,renderedReads=0;
  function Parent(){const [current,setCurrent]=useState(movies);return <TopPicksManager movies={current.filter(m=>m.is_pinned)} allMovies={current} listId={list} onClose={()=>closed++} onRefetch={()=>{refetches++;reads.push(readMoviesOwnerContent().then(next=>{setCurrent(next.lists.flatMap(l=>l.recommended_movies));renderedReads++;}));}}/>;}
  view=render(c.wrap(<Parent/>));
  const row=()=>screen.getByText('Movie 0').closest('li')!;
  fireEvent.click(row().querySelectorAll('button')[2]);
  expect(screen.getByText('Manage Top Picks (14/15)')).toBeInTheDocument();
  expect(server.pins).toHaveLength(15);
  server.hold(g);if(outcome==='rejected')server.reject();
  const first=screen.getByText('Movie 1').closest('li')!;
  fireEvent.click(first.querySelectorAll('button')[1]);
  expect(screen.getByRole('button',{name:'Save Top Picks'})).toBeDisabled();
  expect(server.writes).toHaveLength(0);
  await act(async()=>g.release());
  if(outcome==='rejected'){
   await waitFor(()=>expect(screen.getByRole('button',{name:'Save Top Picks'})).toBeEnabled(),{timeout:4000});
   expect(server.writes).toHaveLength(0);expect(refetches).toBe(0);
   expect(screen.getByText('Manage Top Picks (14/15)')).toBeInTheDocument();expect(server.pins).toHaveLength(15);
   fireEvent.click(screen.getByRole('button',{name:'Save Top Picks'}));
   await waitFor(()=>expect(screen.getByRole('button',{name:'Save Top Picks'})).toBeEnabled(),{timeout:4000});
   expect(server.writes).toHaveLength(0);expect(closed).toBe(0);
   expect(screen.getByText('Manage Top Picks (14/15)')).toBeInTheDocument();
  }else{
   await waitFor(()=>expect(refetches).toBe(1),{timeout:4000});
   await waitFor(()=>expect(renderedReads).toBe(1),{timeout:4000});
   await waitFor(()=>expect(screen.getByRole('button',{name:'Save Top Picks'})).toBeEnabled(),{timeout:4000});
   expect(server.writes[0]).toMatchObject({method:'PATCH',body:{orderedPins:expect.any(Array)}});expect(server.writes[0].body.orderedPins).toHaveLength(14);
   expect(server.pins).toHaveLength(15);
   expect(screen.getByText('Manage Top Picks (14/15)')).toBeInTheDocument();
   fireEvent.click(screen.getByRole('button',{name:'Save Top Picks'}));
   await waitFor(()=>expect(closed).toBe(1),{timeout:4000});
   expect(server.writes.map(w=>w.method)).toEqual(['PATCH','PUT']);
   expect(server.writes[1].body.orderedPins).toEqual(server.writes[0].body.orderedPins);
   expect(server.pins).toHaveLength(14);
  }
 }finally{server.close();view?.unmount();g.release();try{await act(async()=>{await server.drain();await Promise.allSettled(reads);});}finally{c.restore();}}
});
