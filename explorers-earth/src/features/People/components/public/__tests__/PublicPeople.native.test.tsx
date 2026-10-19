import {act,fireEvent,render,screen,waitFor,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,Routes,Route,useLocation,useNavigate} from 'react-router-dom';
const mocks=vi.hoisted(()=>({gateway:{category:vi.fn(),categoryPage:vi.fn(),detailPage:vi.fn(),peekCategory:vi.fn(),peopleSectorPage:vi.fn()},shell:{data:{documentId:'account',Account_Name:'Reader',public_people:'Yes'},loading:false,error:null,refetch:vi.fn()},trackClick:vi.fn()}));
vi.mock('../../../../PublicHome/api/publicProfileGatewayClient',()=>({publicProfileGatewayClient:mocks.gateway}));
vi.mock('../../../../PublicHome/api/usePublicProfileShell',()=>({usePublicProfileShell:()=>mocks.shell}));
vi.mock('../../../../../services/analyticsService',()=>({createAnalyticsOptions:{people:()=>({})},useTrackAnalytics:()=>({trackClick:mocks.trackClick})}));
vi.mock('../../../../PublicHome/components/PublicHeaderDescriptorContext',()=>({usePublicHeaderDescriptor:vi.fn()}));
vi.mock('../../../../../components/SEO',()=>({default:({canonical}:any)=><div data-testid="canonical">{canonical}</div>}));
vi.mock('../PersonDetailModal',()=>({default:({open,person}:any)=>open?<div role="dialog">{person.handle}|{person.location}|{person.tags?.join(',')}|{person.platform}|{person.user_recommendation_note}</div>:null}));
vi.mock('../PersonCarouselRow',()=>({default:({list,onPersonClick}:any)=><div>{list.recommended_people.map((p:any)=><button key={p.documentId} onClick={()=>onPersonClick(p)}>{p.full_name}</button>)}</div>}));
vi.mock('../PersonTopPicksHero',()=>({default:()=>null}));vi.mock('../PersonTopPicksMobileHero',()=>({default:()=>null}));
import PublicPeople from '../PublicPeople';
import PublicPersonSector from '../PublicPersonSector';
import {publishPublicProfileInvalidation} from '../../../../PublicHome/api/publicProfileInvalidation';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const term={documentId:id(100),id:id(100),slug:'canonical-sector',Category_name:'Default locale label'};
const person=(n:number)=>({documentId:id(n),title:'Person '+n,full_name:'Person '+n,username_handle:'handle'+n,headline:'headline',location_text:'Pune',avatar_url:null,platform:'x',primary_platform:'twitter',profile_url:'https://same.example',social_urls:{primary:'https://same.example'},skills_tags:['Code'],follower_count:null,user_recommendation_note:'note'+n,user_rating:null,is_pinned:false,pin_order:null,display_order:n,person_list:{documentId:id(200),List_Name:'List',slug:'list'},person_category:term,people_category:term});
const page=(people:unknown[],cursor:string|null=null,alias=false)=>({version:'explorers-public-people-sector/v1',sector:{documentId:term.documentId,slug:term.slug,Category_name:term.Category_name},canonicalSlug:term.slug,redirectSlug:alias?term.slug:null,recommended_people:people,nextCursor:cursor});
function Path(){const navigate=useNavigate();return <><div data-testid="path">{useLocation().pathname}</div><button onClick={()=>navigate('/other/people/sector/canonical-sector')}>Change reader</button><button onClick={()=>navigate('/reader/people/sector/other-sector')}>Change sector</button></>}
function mount(path:string){return render(<MemoryRouter initialEntries={[path]}><Path/><Routes><Route path="/:username/people" element={<PublicPeople/>}/><Route path="/:username/people/sector/:sectorSlug" element={<PublicPersonSector/>}/></Routes></MemoryRouter>)}
beforeEach(()=>{Object.values(mocks.gateway).forEach(f=>f.mockReset());mocks.shell.data.public_people='Yes';mocks.gateway.category.mockResolvedValue({personLists:[]});});afterEach(cleanup);
it('uses native sector pages beyond 24 and later lists, default label, canonical identity and mapped modal fields',async()=>{
 mocks.gateway.peopleSectorPage.mockImplementation(async(_user,slug,query)=>query.cursor?page([{...person(25),person_list:{documentId:id(201),List_Name:'Later list',slug:'later'}}],null,slug==='old-alias'):page(Array.from({length:24},(_,i)=>person(i+1)),'signed.next',slug==='old-alias'));
 mount('/reader/people/sector/old-alias');
 await waitFor(()=>expect(screen.getByTestId('path').textContent).toBe('/reader/people/sector/canonical-sector'));
 await waitFor(()=>expect(screen.getByRole('heading',{name:term.Category_name})).toBeTruthy());
 expect(screen.getByTestId('canonical').textContent).toContain('/reader/people/sector/canonical-sector');
 await waitFor(()=>expect(screen.getByTestId('path').textContent).toBe('/reader/people/sector/canonical-sector'));
 fireEvent.click(screen.getByText('Person 25'));expect(screen.getByRole('dialog').textContent).toBe('handle25|Pune|Code|x|note25');
 expect(screen.getAllByText(/^Person \d+$/)).toHaveLength(25);
});
it('keeps a known empty sector valid and unknown404 not-found without an empty-sector message',async()=>{
 mocks.gateway.peopleSectorPage.mockResolvedValue(page([]));mount('/reader/people/sector/canonical-sector');
 await waitFor(()=>expect(screen.getByText('No people recommended in this sector.')).toBeTruthy());cleanup();
 mocks.gateway.peopleSectorPage.mockRejectedValue(Error('PUBLIC_PROFILE_404'));mount('/reader/people/sector/missing');
 await waitFor(()=>expect(screen.getByText('Not found')).toBeTruthy());expect(screen.queryByText('No people recommended in this sector.')).toBeNull();expect(screen.queryByRole('button',{name:'Retry'})).toBeNull();
});
it('withdraws an open sector modal immediately on public invalidation and ignores late response',async()=>{
 let late!:(p:any)=>void;mocks.gateway.peopleSectorPage.mockResolvedValueOnce(page([person(1)])).mockImplementationOnce(()=>new Promise(resolve=>{late=resolve}));
 mount('/reader/people/sector/canonical-sector');await waitFor(()=>expect(screen.getByText('Person 1')).toBeTruthy());fireEvent.click(screen.getByText('Person 1'));expect(screen.getByRole('dialog')).toBeTruthy();
 act(()=>publishPublicProfileInvalidation({username:'reader',category:'public_people',eventId:'sector-withdrawal',accountDocumentId:'account',action:'unpublish'}));expect(screen.queryByRole('dialog')).toBeNull();
 cleanup();await act(async()=>late(page([person(2)])));expect(screen.queryByText('Person 2')).toBeNull();
});
it('overview discovers a canonical sector beyond the first twelve preview children without merging equal URLs',async()=>{
 const preview=Array.from({length:12},(_,i)=>({...person(i+1),people_category:null,person_category:null}));
 const list={documentId:id(200),List_Name:'List',slug:'list',recommended_people:preview,recommended_people_next_cursor:'o12'};
 mocks.gateway.category.mockResolvedValue({personLists:[list]});mocks.gateway.detailPage.mockResolvedValue({personLists:[{...list,recommended_people:[person(13)],recommended_people_next_cursor:null}]});
 mount('/reader/people');await waitFor(()=>expect(screen.getByText(term.Category_name)).toBeTruthy());expect(screen.getAllByText(/^Person \d+$/)).toHaveLength(13);
 fireEvent.click(screen.getByText('Person 13'));expect(screen.getByRole('dialog').textContent).toBe('handle13|Pune|Code|x|note13');
 fireEvent.click(screen.getByText(term.Category_name));await waitFor(()=>expect(screen.getByTestId('path').textContent).toBe('/reader/people/sector/canonical-sector'));
});
it.each(['Change reader','Change sector'])('revokes retained sector modal objects on %s',async(change)=>{
 mocks.gateway.peopleSectorPage.mockResolvedValueOnce(page([person(1)])).mockImplementationOnce(()=>new Promise(()=>{}));mount('/reader/people/sector/canonical-sector');
 await waitFor(()=>expect(screen.getByText('Person 1')).toBeTruthy());fireEvent.click(screen.getByText('Person 1'));expect(screen.getByRole('dialog')).toBeTruthy();fireEvent.click(screen.getByText(change));expect(screen.queryByRole('dialog')).toBeNull();expect(screen.queryByText('Person 1')).toBeNull();
});
it('revokes overview modal and all public rows on eligibility loss',async()=>{
 const list={documentId:id(200),List_Name:'List',slug:'list',recommended_people:[person(1)],recommended_people_next_cursor:null};mocks.gateway.category.mockResolvedValue({personLists:[list]});
 const view=mount('/reader/people');await waitFor(()=>expect(screen.getByText('Person 1')).toBeTruthy());fireEvent.click(screen.getByText('Person 1'));expect(screen.getByRole('dialog')).toBeTruthy();
 mocks.shell.data.public_people='No';view.rerender(<MemoryRouter initialEntries={['/reader/people']}><Path/><Routes><Route path="/:username/people" element={<PublicPeople/>}/><Route path="/:username/people/sector/:sectorSlug" element={<PublicPersonSector/>}/></Routes></MemoryRouter>);
 expect(screen.queryByRole('dialog')).toBeNull();expect(screen.queryByText('Person 1')).toBeNull();expect(screen.getByText('Not found')).toBeTruthy();
});
it('overview closes its retained modal immediately on public invalidation',async()=>{
 const list={documentId:id(200),List_Name:'List',slug:'list',recommended_people:[person(1)],recommended_people_next_cursor:null};mocks.gateway.category.mockResolvedValueOnce({personLists:[list]}).mockImplementationOnce(()=>new Promise(()=>{}));mount('/reader/people');
 await waitFor(()=>expect(screen.getByText('Person 1')).toBeTruthy());fireEvent.click(screen.getByText('Person 1'));act(()=>publishPublicProfileInvalidation({username:'reader',category:'public_people',accountDocumentId:'account',eventId:'overview-modal-withdrawal',action:'unpublish'}));expect(screen.queryByRole('dialog')).toBeNull();expect(screen.queryByText('Person 1')).toBeNull();
});
