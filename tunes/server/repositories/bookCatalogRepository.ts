import type {Pool,PoolClient} from 'pg';
import {bookEntityDtoSchema,bookEntityDetailsSchema,bookRecommendationContextSchema,emptyBookDetails,type BookEntityDetails,type BookCandidate,type BookRecommendationContext} from '../../shared/explorersBookContract';
import {RecommendationFailure} from './explorersRecommendationRepository';
export async function insertBookDetails(db:PoolClient,entityId:string,d:BookEntityDetails){
 await db.query(`INSERT INTO book_entity_details(entity_id,subtitle,authors,publisher,published_date_text,year_text,description,cover_url,cover_large_url,subjects,page_count,isbn_13,isbn_10,provider_rating,ratings_count,language_tag,preview_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,[entityId,d.subtitle,d.authors,d.publisher,d.publishedDateText,d.yearText,d.description,d.coverUrl,d.coverLargeUrl,d.subjects,d.pageCount,d.isbn13,d.isbn10,d.providerRating,d.ratingsCount,d.languageTag,d.previewLink]);
}
export async function readBookEntity(db:Pick<Pool,'query'>,id:string){
 const bounds=(await db.query('SELECT octet_length(to_json(d)::text) AS bytes FROM book_entity_details d WHERE entity_id=$1',[id])).rows[0];
 if(Number(bounds?.bytes??0)>1048576)throw new RecommendationFailure(413,'Book facts exceed the read bound');
 const row=(await db.query(`SELECT e.id,e.kind,e.title,e.origin,e.facts_version,d.*,i.provider,i.external_kind,i.external_id,i.fetched_at,i.source_url FROM entities e LEFT JOIN book_entity_details d ON d.entity_id=e.id LEFT JOIN entity_identifiers i ON i.entity_id=e.id AND i.provider='google_books' AND i.external_kind='volume' WHERE e.id=$1`,[id])).rows[0];
 if(!row)throw new Error('Book catalog unavailable');
 const details=row.entity_id?bookEntityDetailsSchema.parse({subtitle:row.subtitle,authors:row.authors,publisher:row.publisher,publishedDateText:row.published_date_text,yearText:row.year_text,description:row.description,coverUrl:row.cover_url,coverLargeUrl:row.cover_large_url,subjects:row.subjects,pageCount:row.page_count,isbn13:row.isbn_13,isbn10:row.isbn_10,providerRating:row.provider_rating===null?null:Number(row.provider_rating),ratingsCount:row.ratings_count===null?null:Number(row.ratings_count),languageTag:row.language_tag,previewLink:row.preview_url}):emptyBookDetails();
 return bookEntityDtoSchema.parse({id:row.id,kind:row.kind,title:row.title,origin:row.origin,details,provenance:row.provider?{provider:row.provider,externalKind:row.external_kind,externalId:row.external_id,fetchedAt:new Date(row.fetched_at).getTime(),sourceUrl:row.source_url,mappingVersion:Number(row.facts_version)}:null});
}
export async function readBookContext(db:Pick<Pool,'query'>,id:string,accountId:string){
 const bounds=(await db.query('SELECT octet_length(buy_links::text) AS bytes FROM book_recommendation_context WHERE recommendation_id=$1 AND account_id=$2',[id,accountId])).rows[0];
 if(Number(bounds?.bytes??0)>100000)throw new RecommendationFailure(413,'Book context exceeds the read bound');
 const row=(await db.query('SELECT buy_links FROM book_recommendation_context WHERE recommendation_id=$1 AND account_id=$2',[id,accountId])).rows[0];return bookRecommendationContextSchema.parse({buyLinks:row?.buy_links??[]});
}
export async function writeBookContext(db:PoolClient,id:string,accountId:string,context:BookRecommendationContext){await db.query(`INSERT INTO book_recommendation_context(recommendation_id,account_id,buy_links) VALUES($1,$2,$3::jsonb) ON CONFLICT(recommendation_id) DO UPDATE SET buy_links=excluded.buy_links`,[id,accountId,JSON.stringify(context.buyLinks)]);}
export function effectiveBookDetails(details:BookEntityDetails,overrides:Record<string,unknown>){const result={...details};for(const key of Object.keys(details))if(Object.hasOwn(overrides,key))(result as any)[key]=overrides[key];return bookEntityDetailsSchema.parse(result);}
