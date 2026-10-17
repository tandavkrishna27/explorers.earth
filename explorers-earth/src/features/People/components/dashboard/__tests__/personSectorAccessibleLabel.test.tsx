import {readFileSync} from 'node:fs';
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {MockedProvider} from '@apollo/client/testing';
import AddPersonPage from '../AddPersonPage';
import {PeopleClient} from '../../../api/peopleClient';
import useAuthStore from '../../../../../store/store';

vi.mock('../../../hooks/usePeopleOwner',()=>({usePeopleOwner:()=>({content:{view:{lists:[]}},data:{personLists:[]},loading:false,refetch:vi.fn()}),invalidatePeople:vi.fn()}));
vi.mock('../../../api/peopleClient',()=>({PeopleClient:{readSectorCatalog:vi.fn()}}));
vi.mock('../../../../Favorites/components/TiptapEditor',()=>({default:()=>null}));
afterEach(()=>{cleanup();useAuthStore.getState().logout();});
function installedPlaywrightLabels(element:Element):ReadonlyArray<{normalized:string}>{
 const bundle=readFileSync('node_modules/playwright-core/lib/coreBundle.js','utf8');
 const literal=bundle.match(/source4 = ('(?:[^'\\]|\\.)*');/);
 if(!literal)throw Error('Installed Playwright injected selector source unavailable');
 const source=Function('return '+literal[1])() as string;
 const labels=Function('module',source+'\nreturn getElementLabels;')({exports:{}}) as (cache:Map<Element,unknown>,element:Element)=>ReadonlyArray<{normalized:string}>;
 return labels(new Map(),element);
}
it('mounted native configured-empty Sector control has the exact installed Playwright label while retaining its sole No sector option',async()=>{
 useAuthStore.getState().login({id:'u1',documentId:'u1',username:'owner',email:'owner@example.invalid',blocked:false,token:'fixture'});useAuthStore.setState({accountId:'a1'});
 vi.mocked(PeopleClient.readSectorCatalog).mockResolvedValue({complete:true,category:'people',state:'CONFIGURED',catalogVersion:1,defaultLocale:'en',requestedLocale:null,items:[],nextCursor:null} as never);
 render(<MockedProvider><MemoryRouter initialEntries={['/people/list-1/add']}><Routes><Route path="/people/:listId/add" element={<AddPersonPage/>}/></Routes></MemoryRouter></MockedProvider>);
 const option=await screen.findByRole('option',{name:'No sector'}),select=option.closest('select');
 if(!select)throw Error('Actual Sector select absent');
 expect(installedPlaywrightLabels(select).some(label=>label.normalized==='Sector')).toBe(true);
 expect(select.options).toHaveLength(1);expect(select.value).toBe('');expect(select.options[0].value).toBe('');
});
