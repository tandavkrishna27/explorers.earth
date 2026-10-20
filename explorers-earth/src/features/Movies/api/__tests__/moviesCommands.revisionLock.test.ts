import {archiveMovie,archiveMovieList,changeMovieList} from '../explorersAdapter';
import {itemId,listId} from '../../../../test/revisionLockHarness';
import {describeRevisionLock} from '../../../../test/revisionLockSuite';

describeRevisionLock('Movies commands','movies',[
 {name:'changeMovieList',kind:'list',method:'PATCH'},
 {name:'archiveMovieList',kind:'list',method:'DELETE'},
 {name:'archiveMovie',kind:'item',method:'DELETE'},
],async name=>{
 if(name==='changeMovieList')await changeMovieList(listId,{title:'Renamed'});
 else if(name==='archiveMovieList')await archiveMovieList(listId);
 else await archiveMovie(itemId);
});
