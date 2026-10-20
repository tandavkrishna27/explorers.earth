import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import useAuthStore from '../../../../store/store';
import {explorersApiClient} from '../../../../lib/explorersApiClient';
import {PlacesClient,type ManualPlaceDraft} from '../placesClient';
import {emptyPlaceContext} from '../../../../../../tunes/shared/explorersPlaceContract';

function signIn(){const generation=useAuthStore.getState().beginVerification();useAuthStore.getState().acceptVerified(generation,{id:'00000000-0000-4000-8000-000000000701',userId:'u',username:'u',email:'u@example.invalid',onboardingStatus:'complete',revision:1});}
vi.mock('../../../../lib/explorersApiClient',async orig=>({...(await orig() as object),assertOwnerDetailObservation:vi.fn()}));
const draft:ManualPlaceDraft={title:'Cafe',details:{},context:emptyPlaceContext(),note:null,userRating:null,photoMediaIds:[]};

describe('Places creation publication state',()=>{
 beforeEach(()=>{signIn();history.replaceState({},'','/places');});
 afterEach(()=>{vi.restoreAllMocks();useAuthStore.getState().logout();});
 for(const kind of ['place','person'] as const)it(`creates a ${kind} recommendation published so a published list is not empty`,async()=>{
  const parent={detail:{category:'places'}} as never;
  vi.spyOn(explorersApiClient,'resolvePlaceEntity').mockResolvedValue({id:'e'} as never);
  vi.spyOn(explorersApiClient,'resolvePersonEntity').mockResolvedValue({id:'e'} as never);
  const create=vi.spyOn(explorersApiClient,'createMyRecommendation').mockResolvedValue({} as never);
  const intent=kind==='place'?PlacesClient.prepareManualIntent(parent,draft):PlacesClient.prepareManualPersonIntent(parent,draft);
  await PlacesClient.createManual(intent);
  expect(create.mock.calls[0][1]).toMatchObject({publicationState:'published'});
 });
});
