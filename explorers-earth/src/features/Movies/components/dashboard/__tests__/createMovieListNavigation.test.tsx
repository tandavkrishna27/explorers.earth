import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loginSurface, surfaceHarness } from "../../../../navigation/__tests__/surfaceHarness";
import { explorersApiClient } from '../../../../../lib/explorersApiClient';

vi.mock('../../../api/moviesClient', () => ({readMoviesOwnerContent: vi.fn(async () => ({lists:[],details:new Map(),observation:{}})),moviesCommandKey:()=> 'movie-command-key'}));

// Spy on navigation so we can assert the newly created list is opened.
const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

// Authenticated user.
const createFn = vi.fn(async () => ({
  data: { createMovieList: { documentId: "movie-1" } },
}));
import MoviesHome from "../MoviesHome";
import TopPicksManager from '../TopPicksManager';
import {render} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import AddMoviePage from '../AddMoviePage';
import {emptyMovieDetails} from '../../../../../../../tunes/shared/explorersMovieContract';
import PublicMovieGenre from '../../public/PublicMovieGenre';
import {usePublicMovieGenre} from '../../../api/usePublicMovieGenre';
vi.mock('../../../../PublicHome/api/usePublicProfileShell',()=>({usePublicProfileShell:()=>({data:{documentId:'creator',public_movie:'Yes'},loading:false,refetch:vi.fn()})}));
vi.mock('../../../api/usePublicMovieGenre',()=>({usePublicMovieGenre:vi.fn(()=>({data:{genre:{documentId:'genre',slug:'drama',genre_name:'Drama'},recommended_movies:[{documentId:'genre-only',title:'Genre-only recommendation',genres:[],Media:[]}]},loading:false,hasMore:false,refetch:vi.fn()}))}));
vi.mock('../../../../PublicHome/components/PublicHeaderDescriptorContext',()=>({usePublicHeaderDescriptor:()=>{}}));
vi.mock('../../../../../components/SEO',()=>({default:()=>null}));

describe("MoviesHome create-list navigation (BUG-3)", () => {
  beforeEach(() => {
    loginSurface();
    navigateSpy.mockClear();
    createFn.mockClear();
    vi.spyOn(explorersApiClient,'createMyCollection').mockResolvedValue({id:'movie-1'} as never);
  });

  it("navigates into the newly created list with justCreatedList state", async () => {
    const h = surfaceHarness(<MoviesHome />, { initial: { documentId: "acc-1", public_movie: "No" },
      respond: name => name === "CreateMovieList" ? createFn().then(result => result.data) : undefined,
    });
    await h.ready();

    // Open the create-list modal (header renders a New List button).
    const newListButtons = await screen.findAllByRole("button", {
      name: /New List/i,
    });
    await userEvent.click(newListButtons[0]);

    // Fill the list name and submit.
    const nameInput = await screen.findByPlaceholderText(/Enter List Name/i);
    await userEvent.type(nameInput, "Sci-Fi Picks");

    await userEvent.click(
      screen.getByRole("button", { name: /Create List/i })
    );

    await waitFor(() => expect(explorersApiClient.createMyCollection).toHaveBeenCalledWith(expect.objectContaining({category:'movies',title:'Sci-Fi Picks',visibility:'private',publicationState:'draft'}),expect.any(String)));
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith("/recommendations/movies/movie-1", {
        state: { justCreatedList: true },
      })
    );
    expect(h.writes).toEqual([]);
  });
});

it('saves category top picks as one exact observed command', async()=>{
  const save=vi.spyOn(explorersApiClient,'setMyCategoryTopPicks').mockResolvedValue({} as never);
  const {readMoviesOwnerContent}=await import('../../../api/moviesClient');
  vi.mocked(readMoviesOwnerContent).mockResolvedValueOnce({lists:[],details:new Map(),observation:{memberships:[{recommendationId:'a',collectionId:'first',collectionArchived:false,recommendationArchived:false},{recommendationId:'b',collectionId:'second',collectionArchived:false,recommendationArchived:false}],topPicks:[]}} as never);
  render(<TopPicksManager movies={[{documentId:'a',title:'First',pin_order:0},{documentId:'b',title:'Second',pin_order:1}] as never} allMovies={[]} listId="first" onClose={()=>{}} onRefetch={()=>{}}/>);
  await userEvent.click(screen.getByRole('button',{name:'Save Top Picks'}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({memberships:expect.any(Array)}),[{recommendationId:'a',collectionId:'first'},{recommendationId:'b',collectionId:'second'}],expect.any(String)));
});

it('creates a manual recommendation with canonical entity identity and observed parent',async()=>{
 vi.spyOn(explorersApiClient,'getMovieGenres').mockResolvedValue({items:[]} as never);
 const parent={resourceId:'list',detail:{id:'list',category:'movies'}};
 vi.spyOn(explorersApiClient,'getMyEditableCollection').mockResolvedValue(parent as never);
 const resolve=vi.spyOn(explorersApiClient,'resolveMovieEntity').mockResolvedValue({id:'entity',title:'Manual movie',origin:'manual',details:emptyMovieDetails(),provenance:null} as never);
 const create=vi.spyOn(explorersApiClient,'createMyRecommendation').mockResolvedValue({id:'recommendation'} as never);
 render(<MemoryRouter initialEntries={['/recommendations/movies/list/add']}><Routes><Route path="/recommendations/movies/:listId/add" element={<AddMoviePage/>}/></Routes></MemoryRouter>);
 await userEvent.click(screen.getByRole('button',{name:'Add manually'}));
 await userEvent.type(screen.getAllByPlaceholderText('Movie title')[0],'Manual movie');
 await userEvent.click(screen.getByRole('button',{name:'Add to List'}));
 await waitFor(()=>expect(resolve).toHaveBeenCalledWith(expect.objectContaining({kind:'manual',category:'movies',details:expect.objectContaining({title:'Manual movie'})}),expect.any(String),expect.any(AbortSignal)));
 expect(create).toHaveBeenCalledWith(parent,expect.objectContaining({entityId:'entity',publicationState:'published',mediaIds:[]}),expect.any(String),expect.any(AbortSignal));
});

it('renders a server genre page without filtering a category preview',async()=>{
 render(<MemoryRouter initialEntries={['/creator/movies/genre/drama']}><Routes><Route path="/:username/movies/genre/:genreSlug" element={<PublicMovieGenre/>}/></Routes></MemoryRouter>);
 await screen.findByText('Genre-only recommendation');
 expect(usePublicMovieGenre).toHaveBeenCalledWith('creator','drama',expect.objectContaining({enabled:true}));
});

it('preserves an edited draft and its original revision after owner invalidation', async()=>{
 loginSurface();
 vi.spyOn(explorersApiClient,'getMovieGenres').mockResolvedValue({items:[]} as never);
 const original={resourceId:'rec',resourceRevision:1,detail:{id:'rec'}};
 const changed={resourceId:'rec',resourceRevision:2,detail:{id:'rec'}};
 const movie={documentId:'rec',entity_id:'entity',title:'Original',media_type:'Movie',poster_path:null,backdrop_path:null,genres:[],watch_providers:[],Media:[],movie_categories:[],movie_list:{documentId:'list'},user_recommendation_note:null};
 const {readMoviesOwnerContent}=await import('../../../api/moviesClient');
 vi.mocked(readMoviesOwnerContent).mockResolvedValueOnce({lists:[{documentId:'list',recommended_movies:[movie]}],details:new Map([['rec',original]]),observation:{}} as never);
 const update=vi.spyOn(explorersApiClient,'updateMyRecommendation').mockResolvedValue({} as never);
 render(<MemoryRouter initialEntries={['/recommendations/movies/list/edit/rec']}><Routes><Route path="/recommendations/movies/:listId/edit/:movieId" element={<AddMoviePage/>}/></Routes></MemoryRouter>);
 const title=await screen.findByDisplayValue('Original');
 await userEvent.clear(title);await userEvent.type(title,'My unsaved draft');
 vi.mocked(readMoviesOwnerContent).mockResolvedValueOnce({lists:[{documentId:'list',recommended_movies:[{...movie,title:'External update'}]}],details:new Map([['rec',changed]]),observation:{}} as never);
 const {invalidateMovies}=await import('../../../api/explorersAdapter');
 const {act}=await import('@testing-library/react');await act(async()=>invalidateMovies());
 expect(screen.getByDisplayValue('My unsaved draft')).toBeInTheDocument();
 await userEvent.click(screen.getByRole('button',{name:'Save Changes'}));
 await waitFor(()=>expect(update).toHaveBeenCalledWith(original,expect.objectContaining({displayOverrides:expect.objectContaining({title:'My unsaved draft'})}),expect.any(String),expect.any(AbortSignal)));
});

it('replays an unchanged create intent with its original parent observation after a lost response', async()=>{
 loginSurface();vi.spyOn(explorersApiClient,'getMovieGenres').mockResolvedValue({items:[]} as never);
 const parent={resourceId:'list',resourceRevision:1,detail:{id:'list',category:'movies'}};
 const readParent=vi.spyOn(explorersApiClient,'getMyEditableCollection').mockResolvedValue(parent as never);
 vi.spyOn(explorersApiClient,'resolveMovieEntity').mockResolvedValue({id:'entity',title:'Retry movie',origin:'manual',details:emptyMovieDetails(),provenance:null} as never);
 const create=vi.spyOn(explorersApiClient,'createMyRecommendation').mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce({id:'recommendation'} as never);
 readParent.mockClear();create.mockClear();
 render(<MemoryRouter initialEntries={['/recommendations/movies/list/add']}><Routes><Route path="/recommendations/movies/:listId/add" element={<AddMoviePage/>}/></Routes></MemoryRouter>);
 await userEvent.click(screen.getByRole('button',{name:'Add manually'}));await userEvent.type(screen.getAllByPlaceholderText('Movie title')[0],'Retry movie');
 await userEvent.click(screen.getByRole('button',{name:'Add to List'}));await waitFor(()=>expect(create).toHaveBeenCalledTimes(1));
 await userEvent.click(screen.getByRole('button',{name:'Add to List'}));await waitFor(()=>expect(create).toHaveBeenCalledTimes(2));
 expect(readParent).toHaveBeenCalledTimes(1);
 expect(create.mock.calls[1].slice(0,3)).toEqual(create.mock.calls[0].slice(0,3));
});

import GenreBrowse from '../../public/GenreBrowse';
it('uses backend taxonomy slugs rather than provider genre-name guesses',()=>{
 render(<MemoryRouter><GenreBrowse username="creator" movies={[{documentId:'r',genres:[{id:12,name:'Provider-only'}],movie_categories:[{documentId:'term',genre_name:'Catalog label',slug:'fixed-catalog-slug'}]}] as never}/></MemoryRouter>);
 expect(screen.getByRole('link',{name:/Catalog label/})).toHaveAttribute('href','/creator/movies/genre/fixed-catalog-slug');
 expect(screen.queryByText('Provider-only')).not.toBeInTheDocument();
});

it('fences owner summary data when the canonical account generation changes',async()=>{
 const {renderHook,act}=await import('@testing-library/react');
 const {default:auth}=await import('../../../../../store/store');
 const {useMoviesOwner}=await import('../../../api/explorersAdapter');
 const {readMoviesOwnerContent}=await import('../../../api/moviesClient');
 const previous=auth.getState();let releaseOld:(value:unknown)=>void=()=>{};
 vi.mocked(readMoviesOwnerContent).mockReturnValueOnce(new Promise(resolve=>{releaseOld=resolve as (value:unknown)=>void;}) as never).mockResolvedValueOnce({lists:[{documentId:'new-account-list'}],details:new Map(),observation:{}} as never);
 auth.setState({accountId:'account-a',generation:previous.generation+1});
 const hook=renderHook(()=>useMoviesOwner());
 try{
   await act(async()=>auth.setState({accountId:'account-b',generation:previous.generation+2}));
   await waitFor(()=>expect(hook.result.current.data?.movieLists[0].documentId).toBe('new-account-list'));
   await act(async()=>releaseOld({lists:[{documentId:'old-account-list'}],details:new Map(),observation:{}}));
   expect(hook.result.current.data?.movieLists[0].documentId).toBe('new-account-list');
 }finally{hook.unmount();auth.setState(previous);}
});

it('shows an empty manual Original Title field before the user enters a value',async()=>{
 loginSurface();vi.spyOn(explorersApiClient,'getMovieGenres').mockResolvedValue({items:[]} as never);
 render(<MemoryRouter initialEntries={['/recommendations/movies/list/add']}><Routes><Route path="/recommendations/movies/:listId/add" element={<AddMoviePage/>}/></Routes></MemoryRouter>);
 await userEvent.click(screen.getByRole('button',{name:'Add manually'}));
 const inputs=screen.getAllByPlaceholderText('Movie title');expect(inputs).toHaveLength(2);
 await userEvent.type(inputs[1],'Original manual title');expect(screen.getByDisplayValue('Original manual title')).toBeInTheDocument();
});

it.each([['manual','account'],['manual','route'],['parent','account'],['parent','route']] as const)('stops a deferred %s save after %s abandonment',async(stage,abandonment)=>{
 const {act}=await import('@testing-library/react');const {default:auth}=await import('../../../../../store/store');
 const actualRouter=await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
 function SwitchRoute(){const navigate=actualRouter.useNavigate();return <button onClick={()=>navigate('/recommendations/movies/other/add')}>Switch route</button>;}
 loginSurface();const previous=auth.getState();navigateSpy.mockClear();
 const {toast}=await import('sonner');const success=vi.spyOn(toast,'success').mockReturnValue('success');const error=vi.spyOn(toast,'error').mockReturnValue('error');const info=vi.spyOn(toast,'info').mockReturnValue('info');success.mockClear();error.mockClear();info.mockClear();
 vi.spyOn(explorersApiClient,'getMovieGenres').mockResolvedValue({items:[]} as never);
 let release:(value:unknown)=>void=()=>{};const pending=new Promise(resolve=>{release=resolve;});
 const entity={id:'entity',title:'Manual',origin:'manual',details:emptyMovieDetails(),provenance:null};
 const parent={resourceId:'list',resourceRevision:1,detail:{id:'list',category:'movies'}};
 const resolve=vi.spyOn(explorersApiClient,'resolveMovieEntity').mockImplementation(()=>stage==='manual'?pending as never:Promise.resolve(entity as never));resolve.mockClear();
 const readParent=vi.spyOn(explorersApiClient,'getMyEditableCollection').mockImplementation(()=>stage==='parent'?pending as never:Promise.resolve(parent as never));readParent.mockClear();
 const create=vi.spyOn(explorersApiClient,'createMyRecommendation').mockResolvedValue({id:'r'} as never);create.mockClear();
 const copy=vi.spyOn(explorersApiClient,'importMovieMedia').mockResolvedValue({slots:[]} as never);copy.mockClear();
 render(<MemoryRouter initialEntries={['/recommendations/movies/list/add']}><SwitchRoute/><Routes><Route path="/recommendations/movies/:listId/add" element={<AddMoviePage/>}/></Routes></MemoryRouter>);
 await userEvent.click(screen.getByRole('button',{name:'Add manually'}));await userEvent.type(screen.getAllByPlaceholderText('Movie title')[0],'Manual');await userEvent.click(screen.getByRole('button',{name:'Add to List'}));
 await waitFor(()=>expect(stage==='manual'?resolve:readParent).toHaveBeenCalledTimes(1));
 if(abandonment==='account')await act(async()=>auth.setState({generation:previous.generation+1,accountId:'new-account'}));else await userEvent.click(screen.getByRole('button',{name:'Switch route'}));
 await act(async()=>release(stage==='manual'?entity:parent));
 expect(create).not.toHaveBeenCalled();expect(copy).not.toHaveBeenCalled();expect(navigateSpy).not.toHaveBeenCalled();
 const signal=stage==='manual'?resolve.mock.calls[0][2]:readParent.mock.calls[0][1];expect(signal?.aborted).toBe(true);expect(success).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(info).not.toHaveBeenCalled();
 if(stage==='manual')expect(readParent).not.toHaveBeenCalled();auth.setState(previous);
});
