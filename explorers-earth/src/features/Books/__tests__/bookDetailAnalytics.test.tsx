import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BookDetailModal from '../components/public/BookDetailModal';
describe('Book detail actions analytics boundary', () => {
    it('reports issued book and collection targets for share and outbound action without URL metadata', () => {
        Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn(async () => undefined) });
        const track = vi.fn();
        const book = { documentId: 'book-1', title: 'Reading', authors: [], subjects: [], book_list: { documentId: 'list-1' }, buy_links: [{ name: 'Store', url: 'https://store.example/private?token=x' }] } as any;
        render(<BookDetailModal book={book} open onClose={vi.fn()} onTrackClick={track}/>);
        fireEvent.click(screen.getByText('Share'));
        fireEvent.click(screen.getByText('Store'));
        expect(track.mock.calls).toEqual([['book-share', { id: 'book-1', listId: 'list-1' }], ['book-outbound', { id: 'book-1', listId: 'list-1' }]]);
    });
});
