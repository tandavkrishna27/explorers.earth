import {describe,it,expect,vi,beforeEach} from 'vitest';
import {render,screen,waitFor,fireEvent} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import AddBookPage from '../AddBookPage';
import useAuthStore from '../../../../../store/store';
import {explorersApiClient} from '../../../../../lib/explorersApiClient';
import {resolveManualBookSchema} from '../../../../../../../tunes/shared/explorersBookContract';

// A book can be added without Google Books, the same way Movies and Games offer a manual add.
vi.mock('../../../api/useBooksOwnerContent',()=>({useBooksOwnerContent:()=>({})}));
vi.mock('../../../../Favorites/components/TiptapEditor',()=>({default:({value,onChange}:any)=><textarea aria-label="Recommendation note" value={value} onChange={e=>onChange(e.target.value)}/>}));
vi.mock('../../../../../lib/explorersApiClient',()=>({explorersApiClient:{updateMyRecommendation:vi.fn(),getMyEditableRecommendation:vi.fn(),getCompleteMyCategoryTopPicks:vi.fn(),setMyCategoryTopPicks:vi.fn(),createMedia:vi.fn(),searchBookCandidates:vi.fn(),resolveBookEntity:vi.fn(),getMyEditableCollection:vi.fn(),createMyRecommendation:vi.fn(),importBookCovers:vi.fn(),getCompleteTaxonomyCatalog:vi.fn(async()=>({state:'UNCONFIGURED',items:[]}))}}));
vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn(),info:vi.fn()}}));

const page=()=>render(<MemoryRouter initialEntries={['/books/list/add']}><Routes><Route path="/books/:listId/add" element={<AddBookPage/>}/><Route path="/recommendations/books/:listId" element={<p>Saved list</p>}/></Routes></MemoryRouter>);

describe('manual Add a book',()=>{
 beforeEach(()=>{vi.clearAllMocks();useAuthStore.setState({generation:2,accountId:'owner'});
  vi.mocked(explorersApiClient.resolveBookEntity).mockResolvedValue({id:'00000000-0000-4000-8000-000000000003'} as never);
  vi.mocked(explorersApiClient.getMyEditableCollection).mockResolvedValue({collection:{id:'list',revision:1}} as never);
  vi.mocked(explorersApiClient.createMyRecommendation).mockResolvedValue({id:'rec'} as never);
  vi.mocked(explorersApiClient.getMyEditableRecommendation).mockResolvedValue({detail:{id:'rec',revision:2}} as never);
  vi.mocked(explorersApiClient.getCompleteMyCategoryTopPicks).mockResolvedValue({topPicks:[]} as never);
  vi.mocked(explorersApiClient.setMyCategoryTopPicks).mockResolvedValue(undefined as never);
 });

 it('keeps Google Books search and offers a manual add next to it',()=>{
  page();
  expect(screen.getByPlaceholderText('Search by title, author, or ISBN...')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:/Add manually/})).toBeInTheDocument();
 });

 it('requires a title, resolves a manual book entity and saves it without a cover import',async()=>{
  page();
  fireEvent.click(screen.getByRole('button',{name:/Add manually/}));
  const use=screen.getByRole('button',{name:'Use these details'});
  expect(use).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/^Title/),{target:{value:'  The Overstory '}});
  fireEvent.change(screen.getByLabelText(/^Author/),{target:{value:'Richard Powers, A. N. Other ,'}});
  fireEvent.change(screen.getByLabelText(/^Year/),{target:{value:'2018'}});
  fireEvent.change(screen.getByLabelText(/^Publisher/),{target:{value:'Norton'}});
  fireEvent.change(screen.getByLabelText(/^Pages/),{target:{value:'502'}});
  fireEvent.click(use);
  await screen.findByLabelText('Recommendation note');
  const [input]=vi.mocked(explorersApiClient.resolveBookEntity).mock.calls[0];
  expect(input).toEqual({kind:'manual',category:'books',details:{title:'The Overstory',authors:['Richard Powers','A. N. Other'],yearText:'2018',publisher:'Norton',pageCount:502}});
  expect(resolveManualBookSchema.safeParse(input).success).toBe(true);
  expect(screen.getByText('The Overstory')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Save'}));
  await screen.findByText('Saved list');
  expect(explorersApiClient.createMyRecommendation).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({entityId:'00000000-0000-4000-8000-000000000003'}),expect.any(String),expect.any(AbortSignal));
  expect(explorersApiClient.importBookCovers).not.toHaveBeenCalled();
 });

 it('sends only the title when nothing else is filled in',async()=>{
  page();
  fireEvent.click(screen.getByRole('button',{name:/Add manually/}));
  fireEvent.change(screen.getByLabelText(/^Title/),{target:{value:'Untitled notes'}});
  fireEvent.click(screen.getByRole('button',{name:'Use these details'}));
  await screen.findByLabelText('Recommendation note');
  expect(vi.mocked(explorersApiClient.resolveBookEntity).mock.calls[0][0]).toEqual({kind:'manual',category:'books',details:{title:'Untitled notes'}});
 });
});
