import {useState} from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import PersonCarouselRow from '../PersonCarouselRow';
import PersonDetailModal from '../PersonDetailModal';
import {publicPeopleLists} from '../../../api/publicPeopleSectorViewModel';
import type {RecommendedPerson} from '../../../types';
vi.mock('../../../../../components/ui/MediaViewer',()=>({default:()=>null}));
vi.mock('../../../../../hooks/useMediaViewer',()=>({convertToMediaItems:()=>[],useMediaViewer:()=>({isOpen:false,currentIndex:0,openViewer:vi.fn(),closeViewer:vi.fn()})}));
afterEach(cleanup);
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const rawPerson=(n:number)=>({documentId:id(n),title:'Title '+n,full_name:'Person '+n,username_handle:'public_handle_'+n,headline:'Public headline',location_text:'Pune',avatar_url:null,platform:'x',primary_platform:'twitter',profile_url:null,social_urls:{primary:'https://same.example'},skills_tags:['Code'],follower_count:null,user_recommendation_note:'<p>Distinct note '+n+'</p>',user_rating:null,is_pinned:false,pin_order:null,display_order:n,person_list:{documentId:id(200),List_Name:'Public list',slug:'list'},person_category:null,people_category:null});
const list=()=>publicPeopleLists({personLists:[{documentId:id(200),List_Name:'Public list',slug:'list',list_description:null,Visibility:true,cover_image:null,display_order:1,top_picks_heading:null,account:{documentId:id(300),username:'reader'},recommended_people:[rawPerson(1),rawPerson(2)]}]})[0];
it('real public carousel preserves distinct equal-URL recommendation cards and sends exact mapped props without invented biography or profile link',()=>{
 const data=list(),click=vi.fn();render(<PersonCarouselRow list={data} onPersonClick={click} onViewAll={()=>{}}/>);
 expect(screen.getByRole('button',{name:/Person 1/})).toBeTruthy();expect(screen.getByRole('button',{name:/Person 2/})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:/Person 2/}));
 expect(click).toHaveBeenCalledWith(data.recommended_people[1]);const selected=click.mock.calls[0][0];expect(selected).not.toHaveProperty('bio');expect(selected.profile_url).toBeUndefined();expect(selected).not.toHaveProperty('media_details');
});
it('real card and modal consumers render mapped handle, location, tags and the selected distinct note without inventing private content',()=>{
 function Consumer(){const [selected,setSelected]=useState<RecommendedPerson|null>(null);return <><PersonCarouselRow list={list()} onPersonClick={setSelected} onViewAll={()=>{}}/><PersonDetailModal open={Boolean(selected)} person={selected} onClose={()=>setSelected(null)}/></>}
 render(<Consumer/>);fireEvent.click(screen.getByRole('button',{name:/Person 2/}));
 expect(screen.getAllByText('@public_handle_2')).toHaveLength(2);expect(screen.getByText('📍 Pune')).toBeTruthy();expect(screen.getByText('Code')).toBeTruthy();expect(screen.getByText('Distinct note 2')).toBeTruthy();expect(screen.queryByText('Distinct note 1')).toBeNull();expect(screen.queryByRole('link',{name:'View Profile'})).toBeNull();expect(screen.queryByText(/followers$/)).toBeNull();
});
