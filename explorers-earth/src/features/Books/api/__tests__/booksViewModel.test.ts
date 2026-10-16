import { describe, expect, it } from 'vitest';
import { emptyBookDetails } from '../../../../../../tunes/shared/explorersBookContract';
import { bookViewModel, collectionViewModel, bookContextFromLinks } from '../booksViewModel';

describe('canonical Books presentation', () => {
  const detail = { id:'rec', entityId:'entity', displayTitle:null, entity:{id:'entity',kind:'book',origin:'manual',provenance:null}, effectiveBookDetails:{...emptyBookDetails(),isbn10:'123456789X',publishedDateText:'2020-03',languageTag:'en',ratingsCount:4,coverUrl:'https://books.google.com/thumb',coverLargeUrl:'https://books.google.com/large'},bookContext:{buyLinks:[]},note:{version:1,format:'quill-html',html:'<p>😀 note</p>'},userRating:8,mediaIds:['snapshot'],bookCovers:{cover:null,thumbnail:{url:'/api/explorers/v1/media/copied/content'}} };
  it('keeps null title, manual identity, rich HTML, bibliography and independent cover slots', () => {
    const book=bookViewModel(detail as never,{collectionId:'list',recommendationId:'rec',displayOrder:3} as never,{recommendationId:'rec',collectionId:'list',position:0} as never);
    expect(book.volume_id).toBe('');expect(book.entity_id).toBe('entity');expect(book.title).toBe('Untitled book');
    expect(book.user_recommendation_note).toBe('<p>😀 note</p>');expect(book.pin_order).toBe(0);expect(book.display_order).toBe(3);
    expect(book.cover_url).toBe('/api/explorers/v1/media/copied/content');expect(book.cover_url_large).toBe('https://books.google.com/large');
    expect(book.isbn_10).toBe('123456789X');expect(book.Media[0].url).toBe('/api/explorers/v1/media/snapshot/content');
  });
  it('requires both collection publication and visibility', () => {
    const collection={id:'list',title:'List',description:null,heading:null,slug:'list',accountId:'account',displayOrder:0,visibility:'public',publicationState:'draft',coverMediaId:null};
    expect(collectionViewModel(collection as never,[]).visibility).toBe(false);
    expect(collectionViewModel({...collection,publicationState:'published'} as never,[]).visibility).toBe(true);
  });
  it('keeps symbolic logos local and sends valid URLs only', () => {
    expect(bookContextFromLinks([{name:'Buy',url:'https://example.com/book',logo:'google-books'}])).toEqual({buyLinks:[{name:'Buy',url:'https://example.com/book'}]});
  });
});
