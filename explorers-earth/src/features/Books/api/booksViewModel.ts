import type { EditableOwnerRecommendation, OwnerCollectionDto, OwnerMembershipDto } from '../../../../../tunes/shared/explorersOwnerContentContract';
import { emptyBookDetails, safeBookUrlSchema, type BookRecommendationContext } from '../../../../../tunes/shared/explorersBookContract';
import type { BookList, BuyLink, RecommendedBook } from '../types';

type Pin = { recommendationId:string; collectionId:string; position:number };
export function bookContextFromLinks(links:BuyLink[]):BookRecommendationContext {
  return {buyLinks:links.map(({name,url,logo})=>({name,url,...(logo&&safeBookUrlSchema.safeParse(logo).success?{logo}:{})}))};
}
export function bookViewModel(detail:Readonly<EditableOwnerRecommendation>,membership:Readonly<OwnerMembershipDto>,pin?:Readonly<Pin>):RecommendedBook {
  const facts=detail.effectiveBookDetails??emptyBookDetails();
  const provenance='provenance' in detail.entity?detail.entity.provenance:null;
  return {
    documentId:detail.id,entity_id:detail.entityId,volume_id:provenance?.externalId??'',
    title:detail.displayTitle??'Untitled book',subtitle:facts.subtitle,authors:[...facts.authors],year:facts.yearText,
    cover_url:detail.bookCovers?.thumbnail?.url??facts.coverUrl,
    cover_url_large:detail.bookCovers?.cover?.url??facts.coverLargeUrl,
    subjects:[...facts.subjects],publisher:facts.publisher,page_count:facts.pageCount,google_rating:facts.providerRating,
    description:facts.description,isbn_13:facts.isbn13,isbn_10:facts.isbn10,published_date:facts.publishedDateText,
    language_tag:facts.languageTag,ratings_count:facts.ratingsCount,preview_link:facts.previewLink,
    user_recommendation_note:detail.note?.html??'',user_rating:detail.userRating,
    buy_links:(detail.bookContext?.buyLinks??[]).map(link=>({...link})),
    is_pinned:!!pin,pin_order:pin?.position??null,display_order:membership.displayOrder,
    media_details:null,book_list:{documentId:membership.collectionId,List_Name:'',slug:''},book_categories:null,
    Media:detail.mediaIds.map(id=>({documentId:id,url:`/api/explorers/v1/media/${id}/content`})),
  };
}
export function collectionViewModel(collection:Readonly<OwnerCollectionDto>,books:RecommendedBook[],username=''):BookList {
  return {documentId:collection.id,List_Name:collection.title,list_description:collection.description,slug:collection.slug,
    visibility:collection.visibility==='public'&&collection.publicationState==='published',
    cover_image:collection.coverMediaId?{documentId:collection.coverMediaId,url:`/api/explorers/v1/media/${collection.coverMediaId}/content`}:null,
    display_order:collection.displayOrder,top_reads_heading:collection.heading,
    recommended_books:books.map(book=>({...book,book_list:{documentId:collection.id,List_Name:collection.title,slug:collection.slug}})),
    account:{documentId:collection.accountId,username}};
}
