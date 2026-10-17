import {BookCatalog} from '../server/services/bookCatalog';
import {BookCoverFetcher} from '../server/services/bookCoverFetch';
import {LocalObjectStorage} from '../server/services/objectStorage';
import {join} from 'node:path';
import type pg from 'pg';
export async function seedBooks(pool:pg.Pool,accountId:string,name:string){
  await pool.query("INSERT INTO account_category_pin_state(account_id,category) VALUES($1,'books') ON CONFLICT DO NOTHING",[accountId]);
  let pinned=0;
  for(let n=0;n<14;n++){
    const list=(await pool.query("INSERT INTO collections(account_id,category,title,slug,description,heading,visibility,publication_state,display_order) VALUES($1,'books',$2,$3,'Seed description','Seed heading','public','published',$4) RETURNING id",[accountId,`${name} seed list ${n}`,`seed-list-${n}`,n])).rows[0].id;
    for(let position=0;position<(n===0?30:1);position++){
      const entity=(await pool.query("INSERT INTO entities(kind,title,origin) VALUES('book',$1,'manual') RETURNING id",[`${name} seed book ${n}-${position}`])).rows[0].id;
      await pool.query("INSERT INTO book_entity_details(entity_id,authors,subjects,published_date_text,year_text,language_tag,isbn_10) VALUES($1,ARRAY['Seed author'],ARRAY[$2],'2020-03','2020','en','123456789X')",[entity,n===13?'Page Two Subject':position===29?'Later Subject':'Seed Science']);
      const recommendation=(await pool.query("INSERT INTO recommendations(account_id,category,entity_id,user_rating,note,publication_state) VALUES($1,'books',$2,8,$3::jsonb,'published') RETURNING id",[accountId,entity,JSON.stringify({version:1,format:'quill-html',html:'<p>Seed rich note 😀</p>'})])).rows[0].id;
      await pool.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'books',$4)",[list,recommendation,accountId,position]);
      if((n===0&&position<14||n===13)&&pinned<15){await pool.query("INSERT INTO category_recommendation_pins(account_id,category,recommendation_id,collection_id,position) VALUES($1,'books',$2,$3,$4)",[accountId,recommendation,list,pinned===1?0:pinned]);pinned++;}
    }
  }
}

export function fixtureProviders(secret:string,disposable:string){
const config={secret};
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==","base64");
  const volume=(id:string)=>({id,volumeInfo:{title:`Fixture ${id}`,authors:["Fixture author"],publishedDate:"2024-03",description:"Fixture bibliography",categories:["Fixture Science"],pageCount:123,averageRating:4,ratingsCount:5,language:"en",imageLinks:{thumbnail:`https://books.google.com/books/content?id=${id}&size=thumb`,large:`https://books.google.com/books/content?id=${id}&size=cover`}},saleInfo:{buyLink:"https://books.google.com/buy"}});
  const bookCatalog=new BookCatalog({apiKey:"deterministic-fixture-only",secret:config.secret,fetch:async(target:any)=>{
    if(!target.pathname.endsWith('/volumes'))return new Response(JSON.stringify(volume(target.pathname.split('/').at(-1))));
    const query=target.searchParams.get('q')??'',offset=Number(target.searchParams.get('startIndex')??0);
    if(query.startsWith('continuation')){if(offset)await new Promise(resolve=>setTimeout(resolve,1500));return new Response(JSON.stringify({totalItems:24,items:Array.from({length:12},(_,n)=>volume(`${offset?'obsolete':'continuation'}-${n}`))}));}
    return new Response(JSON.stringify({totalItems:3,items:['success','one-fallback','both-fallback'].map(volume)}));
  }});
  const bookCoverFetcher=new BookCoverFetcher({mode:"deterministic-fixture",resolve:async()=>[{address:"142.250.1.1",family:4}],connect:async(target)=>{const id=target.url.searchParams.get("id");if(id==="both-fallback"||id==="one-fallback"&&target.url.searchParams.get("size")==="thumb")throw new Error("Deterministic optional copy failure");return{status:200,mimeType:"image/png",body:(async function*(){yield png;})()};}});
return {bookCatalog,bookCoverFetcher,mediaStorage:new LocalObjectStorage(join(disposable,"media"))};
}
