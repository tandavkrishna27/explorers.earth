import {it,expect} from 'vitest';
import {MovieCatalog,mapMovieDetail} from '../services/movieCatalog';
const actor={accountId:'a',userId:'u',role:'owner' as const,credential:{kind:'web-session' as const,sessionId:'s',sessionVersion:1}};
// TMDB details-with-credits shapes (popular titles such as Inception carry hundreds of cast and 1,000+ crew).
const person=(i:number)=>({adult:false,gender:i%3,id:1000+i,known_for_department:'Acting',name:`Person ${i}`,original_name:`Person ${i}`,popularity:1.5+i,profile_path:i%4?`/p${i}.jpg`:null,credit_id:`52fe4${i.toString(16).padStart(19,'0')}`});
const cast=(n:number)=>Array.from({length:n},(_,i)=>({...person(i),cast_id:i+1,character:`Character ${i}`,order:n-1-i}));
const crew=(n:number,lead:string)=>Array.from({length:n},(_,i)=>({...person(5000+i),department:i===n-7?'Directing':'Crew',job:i===n-7?lead:`Job ${i%40}`}));
const detail=(kind:'movie'|'tv')=>({adult:false,backdrop_path:'/b.jpg',genres:[{id:28,name:'Action'}],id:27205,overview:'A thief.',poster_path:'/p.jpg',vote_average:8.4,
 ...(kind==='movie'?{title:'Inception',original_title:'Inception',release_date:'2010-07-15',runtime:148}:{name:'Show',original_name:'Show',first_air_date:'2011-04-17',episode_run_time:[60],number_of_seasons:8,created_by:[{id:9,name:'Creator'}]}),
 credits:{cast:cast(400),crew:crew(1200,'Director')}});
const catalog=(kind:'movie'|'tv')=>new MovieCatalog({accessToken:'fixture',authorize:async()=>{},fetch:async(u:any)=>new Response(JSON.stringify(String(u).includes('/watch/providers')?{id:27205,results:{}}:detail(kind)))});
for(const kind of ['movie','tv'] as const)it(`resolves a popular ${kind} with 400 cast and 1,200 crew by truncating credits`,async()=>{
 const r=await catalog(kind).resolve(actor,kind,'27205');
 expect(r.details.cast).toHaveLength(20);expect(r.details.cast.map(c=>c.order)).toEqual(Array.from({length:20},(_,i)=>i));
 expect(r.details.director).toBe(kind==='movie'?'Person 6193':null);
});
it('truncates in the mapper too, so storage never sees the full credit list',()=>{const r=mapMovieDetail(detail('movie'),'movie','27205',1,{});expect(r.details.cast).toHaveLength(20);expect(r.details.cast[0].order).toBe(0);});
it('still rejects degenerate bodies that are within the byte cap but exceed the node budget',async()=>{const c=new MovieCatalog({accessToken:'fixture',authorize:async()=>{},fetch:async()=>new Response(`{"id":27205,"x":[${Array(200001).fill('0').join(',')}]}`)});await expect(c.resolve(actor,'movie','27205')).rejects.toMatchObject({status:502});});
it('still rejects excessive nesting and bad image paths',async()=>{let d:any={};for(let i=0;i<20;i++)d={a:d};const deep=new MovieCatalog({accessToken:'fixture',authorize:async()=>{},fetch:async()=>new Response(JSON.stringify({...detail('movie'),x:d}))});await expect(deep.resolve(actor,'movie','27205')).rejects.toMatchObject({status:502});const bad=detail('movie');bad.credits.cast[399].profile_path='/../x';expect(()=>mapMovieDetail(bad,'movie','27205',1,{})).toThrow();});
// Real-world TMDB shapes for a small title (report: Paterson, 2016, 370755) that previously answered 502.
const REGIONS='AD AE AR AT AU BE BG BO BR CA CH CL CO CR CZ DE DK DO EC EE ES FI FR GB GR GT HK HN HR HU ID IE IN IS IT JP KR LT LV MX MY NL NO NZ PE PH PL PT PY RO RU SE SG SK TH TR TW US UY VE ZA'.split(' ');
const offer=(i:number)=>({logo_path:`/l${i}.jpg`,provider_id:10+i,provider_name:`Provider ${i}`,display_priority:i});
const watchAll={id:370755,results:Object.fromEntries(REGIONS.map((r,i)=>[r,{link:`https://www.themoviedb.org/movie/370755-paterson/watch?locale=${r}`,flatrate:[offer(i%7)],rent:[offer(8),offer(9)],buy:[offer(8)],ads:[offer(20)],free:[offer(21)]}]))};
const small=(kind:'movie'|'tv')=>({adult:false,video:false,backdrop_path:'',belongs_to_collection:null,budget:0,homepage:'',imdb_id:null,origin_country:['US'],original_language:'en',popularity:9.1,poster_path:null,production_companies:[{id:1,logo_path:null,name:'Amazon Studios',origin_country:'US'}],production_countries:[{iso_3166_1:'US',name:'United States of America'}],spoken_languages:[{english_name:'English',iso_639_1:'en',name:'English'}],status:'Released',tagline:'',vote_count:0,vote_average:0,genres:[{id:18,name:'Drama'}],id:370755,
 overview:'A week in the life of Paterson.\n\nHe writes poems.\r\n\tEvery day.',
 ...(kind==='movie'?{title:'Paterson',original_title:'Paterson',release_date:'',runtime:null}:{name:'Paterson',original_name:'Paterson',first_air_date:null,episode_run_time:[],number_of_seasons:1,number_of_episodes:0,created_by:[],networks:[],seasons:[],last_episode_to_air:null,next_episode_to_air:null,in_production:false,languages:[],type:'Scripted'}),
 credits:{cast:[{...cast(1)[0],original_name:'',name:'Adam Driver',character:'Paterson\t(voice)\n',order:0},{...cast(2)[0],character:null,order:1}],crew:[{...crew(1,'Director')[0],name:'Jim Jarmusch',job:'Director'}]}});
for(const kind of ['movie','tv'] as const)it(`resolves a small ${kind} with real-world TMDB shapes (60 watch regions, empty/null fields, control characters)`,async()=>{
 const c=new MovieCatalog({accessToken:'fixture',authorize:async()=>{},fetch:async(u:any)=>new Response(JSON.stringify(String(u).includes('/watch/providers')?watchAll:small(kind)))});
 const r=await c.resolve(actor,kind,'370755');
 const regions=Object.keys(r.details.watchProviders);expect(regions).toHaveLength(32);expect(regions.slice(0,5)).toEqual(['US','IN','GB','CA','AU']);
 expect(r.details).toMatchObject({yearText:null,posterUrl:null,backdropUrl:null,providerRating:0,runtimeMinutes:null,director:kind==='movie'?'Jim Jarmusch':null,overview:'A week in the life of Paterson. He writes poems. Every day.'});
 expect(r.details.cast[0]).toMatchObject({name:'Adam Driver',character:'Paterson (voice)'});expect(r.details.cast[1].character).toBe('');
});
it('still rejects absurd watch region counts and malformed region keys',()=>{expect(()=>mapMovieDetail(small('movie'),'movie','370755',1,Object.fromEntries(Array.from({length:301},(_,i)=>[`R${i}`,{}])))).toThrow();expect(()=>mapMovieDetail(small('movie'),'movie','370755',1,{us:{}})).toThrow();});
