import {act, render, screen, waitFor} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {StrictMode} from 'react';
import Quill from 'quill';
import AddAppPage from '../AddAppPage';
import useAuthStore from '../../../../../store/store';

// Real AddAppPage, panel, hook, ReactQuill, Quill and emoji extension. Only the
// native read boundaries are supplied inert responses; no editor mock.
const fixture=vi.hoisted(()=>({content:undefined as any, read:vi.fn()}));
vi.mock('../../../hooks/useAppsOwner',()=>({useAppsOwner:()=>({content:fixture.content,loading:false,error:undefined}),invalidateApps:vi.fn()}));
vi.mock('../../../api/query',()=>({useAppsCommands:()=>({loading:false})}));
vi.mock('../../../api/appEnrichmentClient',()=>({AppEnrichmentClient:{read:fixture.read}}));

async function mountEditor(strict:boolean){
 useAuthStore.setState({isAuthenticated:true,accountId:'owner',generation:1});
 const observed={resourceId:'app',accountId:'owner',generation:1,resourceRevision:1,detail:{category:'apps',id:'app',entityId:'entity',revision:1,appScreenshots:{screenshotMediaIds:[]}}};
 fixture.content={view:{lists:[{documentId:'list',recommended_apps:[{documentId:'app',title:'Manual enrichment app 1 website',app_url:'https://apps.example.invalid/manual-1-website',developer:'Manual developer website',logo_url:null,description:'Manual description website',download_url:null,price_tier:'Paid',platforms:['Web'],user_recommendation_note:'',user_rating:null}]}]},details:new Map([['app',observed]])};
 fixture.read.mockResolvedValue({binding:null,suggestions:[],sources:[{identity:{sourceId:'website-metadata',sourceIdentity:'https://example.invalid/',sourceIdentityHash:'a'.repeat(64),canonicalizationVersion:'website-url-v1'},label:'Approved website',sourceUrl:'https://example.invalid/'}]});
 const tree=<MemoryRouter initialEntries={['/apps/list/edit/app']}><Routes><Route path="/apps/:listId/edit/:appId" element={<AddAppPage/>}/></Routes></MemoryRouter>;
 const view=render(strict?<StrictMode>{tree}</StrictMode>:tree);
 await screen.findByRole('combobox',{name:'Enrichment source'});
 await waitFor(()=>expect(screen.queryByText('Loading suggestions…')).toBeNull());
 expect(view.container.querySelector('.ql-editor')).not.toBeNull();
 expect(view.container.querySelector('.ql-editor')?.innerHTML).toBe('<p><br></p>');
 expect(screen.queryByText(/Save or revert your manual edits/)).toBeNull();
 expect(screen.getByRole('combobox',{name:'Enrichment source'})).toBeEnabled();
 return view;
}
it('native fixture empty manual note initializes without locking enrichment in production StrictMode',async()=>{
 await mountEditor(true);
});
it('the same real editor remains clean without StrictMode',async()=>{
 await mountEditor(false);
});
it('genuine real Quill note changes lock enrichment and reverting to the empty document unlocks it',async()=>{
 const view=await mountEditor(true);
 const editor=Quill.find(view.container.querySelector('.ql-container')!) as Quill;
 expect(editor).toBeInstanceOf(Quill);
 await act(async()=>{editor.setText('Genuine unsaved note','user');});
 expect(screen.getByText(/Save or revert your manual edits/)).toBeVisible();
 expect(screen.getByRole('combobox',{name:'Enrichment source'})).toBeDisabled();
 await act(async()=>{editor.setText('','user');});
 expect(screen.queryByText(/Save or revert your manual edits/)).toBeNull();
 expect(screen.getByRole('combobox',{name:'Enrichment source'})).toBeEnabled();
});
