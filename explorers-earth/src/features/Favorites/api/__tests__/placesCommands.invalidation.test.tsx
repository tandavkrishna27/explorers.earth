import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import React from 'react';
import {act,cleanup,renderHook} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import useAuthStore from '../../../../store/store';
import {signIn} from '../../../../test/revisionLockHarness';

// OWN-17 (WP5). Every places command used to restart the 1 + N + 1 owner read when it
// finished, uploads included, so a place added with three photos reloaded the owner view
// several times before the save was done. Media uploads change nothing the owner view
// shows until they are attached, so they no longer reload it.
const invalidatePlaces=vi.hoisted(()=>vi.fn());
vi.mock('../../hooks/usePlacesOwner',async orig=>({...(await orig<object>()),invalidatePlaces}));
const client=vi.hoisted(()=>({upload:vi.fn(),importPlacePhoto:vi.fn()}));
vi.mock('../placesClient',async orig=>{const actual=await orig<{PlacesClient:object}>();return {...actual,PlacesClient:{...actual.PlacesClient,...client}};});
import {usePlacesCommands} from '../placesCommands';

function commands(){return renderHook(()=>usePlacesCommands(),{wrapper:({children})=><MemoryRouter initialEntries={['/places']}>{children}</MemoryRouter>}).result;}

describe('places command invalidation',()=>{
 beforeEach(()=>{vi.clearAllMocks();signIn();client.upload.mockResolvedValue({id:'m1'});client.importPlacePhoto.mockResolvedValue({id:'m2'});});
 afterEach(()=>{cleanup();useAuthStore.getState().logout();});

 it('uploads and photo imports never reload the owner view',async()=>{
  const hook=commands();
  await act(async()=>{await hook.current.upload(new File(['x'],'a.jpg',{type:'image/jpeg'}));});
  await act(async()=>{await hook.current.importPlacePhoto('places/abc/photos/1');});
  expect(client.upload).toHaveBeenCalledTimes(1);
  expect(client.importPlacePhoto).toHaveBeenCalledTimes(1);
  expect(invalidatePlaces).not.toHaveBeenCalled();
 });

 // Place photos upload in parallel; one upload must not cancel another as a superseded command.
 it('runs uploads side by side without superseding each other',async()=>{
  let next=0;client.upload.mockImplementation(async()=>{await new Promise(resolve=>setTimeout(resolve,5));return {id:`m${next++}`};});
  const hook=commands();
  let ids:string[]=[];
  await act(async()=>{ids=(await Promise.all(['a','b','c'].map(name=>hook.current.upload(new File([name],`${name}.jpg`,{type:'image/jpeg'}))))).map(media=>media.id);});
  expect(ids).toHaveLength(3);
  expect(invalidatePlaces).not.toHaveBeenCalled();
 });

 it('refresh() reloads exactly once',()=>{
  const hook=commands();
  act(()=>{hook.current.refresh();});
  expect(invalidatePlaces).toHaveBeenCalledTimes(1);
 });
});
