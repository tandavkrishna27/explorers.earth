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
