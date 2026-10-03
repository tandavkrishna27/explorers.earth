import type {Pool} from 'pg';
import {bookCoversSchema} from '../../shared/explorersBookCoverContract';
export async function readBookCovers(db:Pick<Pool,'query'>,recommendationId:string){
 const rows=(await db.query(`SELECT c.slot,m.id,m.mime_type,m.byte_size,m.alternative_text,m.caption FROM recommendation_book_covers c JOIN media_assets m ON m.id=c.media_id AND m.account_id=c.account_id WHERE c.recommendation_id=$1 AND m.status='ready'`,[recommendationId])).rows;
 const value:{cover:any;thumbnail:any}={cover:null,thumbnail:null};for(const row of rows)value[row.slot as 'cover'|'thumbnail']={id:row.id,url:`/api/explorers/v1/media/${row.id}/content`,mimeType:row.mime_type,size:Number(row.byte_size),alternativeText:row.alternative_text,caption:row.caption};return bookCoversSchema.parse(value);
}
