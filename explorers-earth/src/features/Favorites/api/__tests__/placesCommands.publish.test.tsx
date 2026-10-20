import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,renderHook} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import useAuthStore from '../../../../store/store';

const client=vi.hoisted(()=>({observeCollection:vi.fn(),observeRecommendation:vi.fn(),updateCollection:vi.fn(),updateRecommendation:vi.fn(),archiveRecommendation:vi.fn()}));
vi.mock('../placesClient',()=>({PlacesClient:client}));
const {usePlacesCommands}=await import('../placesCommands');

function signIn(){const generation=useAuthStore.getState().beginVerification();useAuthStore.getState().acceptVerified(generation,{id:'00000000-0000-4000-8000-000000000701',userId:'u',username:'u',email:'u@example.invalid',onboardingStatus:'complete',revision:1});}
const mount=()=>renderHook(()=>usePlacesCommands(),{wrapper:({children})=><MemoryRouter initialEntries={['/places']}>{children}</MemoryRouter>});

describe('Places publish commands',()=>{
 beforeEach(()=>{vi.clearAllMocks();signIn();
  client.observeCollection.mockResolvedValue({detail:{publicationState:'draft'}});
  client.observeRecommendation.mockImplementation(async(id:string)=>({detail:{publicationState:id==='already'?'published':'draft'}}));
  client.updateCollection.mockResolvedValue({});client.updateRecommendation.mockResolvedValue({});client.archiveRecommendation.mockResolvedValue({});});
 afterEach(()=>{cleanup();useAuthStore.getState().logout();});

 it('publishes the list and every draft place in one command, without racing',async()=>{
  const hook=mount();
  await act(async()=>{await hook.result.current.publishListWithPlaces('list',true,['a','b','already','c']);});
  expect(client.updateCollection).toHaveBeenCalledWith(expect.anything(),{visibility:'public',publicationState:'published'},expect.any(String),expect.anything());
  expect(client.updateRecommendation).toHaveBeenCalledTimes(3);
  expect(client.updateRecommendation.mock.calls.every(call=>call[1].publicationState==='published')).toBe(true);
 });

 it('leaves places alone when the list is unpublished',async()=>{
  const hook=mount();
  await act(async()=>{await hook.result.current.publishListWithPlaces('list',false,['a','b']);});
  expect(client.updateCollection).toHaveBeenCalledWith(expect.anything(),{visibility:'private',publicationState:'draft'},expect.any(String),expect.anything());
  expect(client.updateRecommendation).not.toHaveBeenCalled();
 });

 it('archives several places in sequence under one command',async()=>{
  const hook=mount();
  await act(async()=>{await hook.result.current.archivePlaces(['a','b','c']);});
  expect(client.archiveRecommendation).toHaveBeenCalledTimes(3);
 });
});
