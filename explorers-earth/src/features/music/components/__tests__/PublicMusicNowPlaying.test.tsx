import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PublicMusicNowPlaying } from '../PublicMusicNowPlaying';
import type { MusicFeaturedCard } from '../../publicMusicPresentation';
const cards: MusicFeaturedCard[] = ['current', 'queue'].map((source, index) => ({ key: source, source: source as 'current' | 'queue', song: { id: String(index).repeat(43), youtubeId: 'abcdefghijk', title: index ? 'Next song' : 'Current song', artist: 'Artist', thumbnailUrl: 'https://images.example/art.jpg', position: index, status: index ? 'queued' : 'playing', playedAt: null } }));
describe('PublicMusicNowPlaying', () => {
  const pointerEvent = (element: Element, type: string, x: number, y: number, pointerId = 1) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperties(event, { isPrimary: { value: true }, pointerId: { value: pointerId } });
    fireEvent(element, event);
  };
  it("does not turn an abandoned drag into the next Listen click", () => {
    const onListen = vi.fn();
    render(<PublicMusicNowPlaying cards={cards} canListen onListen={onListen} />);
    const art = screen.getByTestId("music-featured-active");
    pointerEvent(art, "pointerdown", 280, 80);
    pointerEvent(document.body, "pointerup", 260, 80);
    const listen = screen.getByRole("button", { name: "Listen on this device" });
    pointerEvent(listen, "pointerdown", 70, 80);
    pointerEvent(listen, "pointerup", 70, 80);
    fireEvent.click(listen);
    expect(onListen).toHaveBeenCalledWith(cards[0]);
  });
  it("allows horizontal swipes but not vertical scrolling or another pointer's release", () => {
    render(<PublicMusicNowPlaying cards={cards} canListen={false} onListen={vi.fn()} />);
    const art = screen.getByTestId("music-featured-active");
    pointerEvent(art, "pointerdown", 280, 80);
    pointerEvent(art, "pointerup", 70, 80, 2);
    expect(art).toHaveTextContent("Current song");
    pointerEvent(art, "pointerdown", 280, 80);
    pointerEvent(art, "pointerup", 230, 220);
    expect(art).toHaveTextContent("Current song");
    pointerEvent(art, "pointerdown", 280, 80);
    pointerEvent(art, "pointerup", 70, 85);
    expect(art).toHaveTextContent("Next song");
  });
  it('browses manually without invoking playback until the separate listen action', async () => {
    const onListen = vi.fn(); render(<PublicMusicNowPlaying cards={cards} canListen onListen={onListen} />);
    await userEvent.click(screen.getByRole('button', {name: 'Next music card'}));
    expect(screen.getByTestId('music-featured-active')).toHaveTextContent('Next song');
    expect(onListen).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', {name: 'Listen on this device'}));
    expect(onListen).toHaveBeenCalledWith(cards[1]);
  });
  it('shows no device controls for a read-only queue', () => {
    render(<PublicMusicNowPlaying cards={cards} canListen={false} onListen={vi.fn()} />);
    expect(screen.queryByRole('button', {name: 'Listen on this device'})).not.toBeInTheDocument();
    expect(screen.getByText('Current song')).toBeInTheDocument();
  });
  it('shows a quiet empty state without image or media requests', () => {
    const view = render(<PublicMusicNowPlaying cards={[]} canListen={false} onListen={vi.fn()} />);
    expect(screen.getByText('A little quiet right now')).toBeInTheDocument();
    expect(view.container.querySelector('img,iframe,video')).not.toBeInTheDocument();
  });
  it('labels queue-only artwork honestly and hides redundant navigation', () => {
    render(<PublicMusicNowPlaying cards={[cards[1]]} canListen={false} onListen={vi.fn()} />);
    expect(screen.getByText('Up next')).toBeInTheDocument();
    expect(screen.queryByText('Now playing')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Next music card'})).not.toBeInTheDocument();
  });
  it('preserves the selected key on update and falls back when it disappears', async () => {
    const view = render(<PublicMusicNowPlaying cards={cards} canListen onListen={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', {name: 'Next music card'}));
    view.rerender(<PublicMusicNowPlaying cards={[{...cards[0]}, {...cards[1]}]} canListen onListen={vi.fn()} />);
    expect(screen.getByTestId('music-featured-active')).toHaveTextContent('Next song');
    view.rerender(<PublicMusicNowPlaying cards={[cards[0]]} canListen onListen={vi.fn()} />);
    expect(screen.getByTestId('music-featured-active')).toHaveTextContent('Current song');
  });
  it('replaces failed artwork without loading a default photo', () => {
    const view = render(<PublicMusicNowPlaying cards={[cards[0]]} canListen={false} onListen={vi.fn()} />);
    fireEvent.error(view.container.querySelector('img')!);
    expect(view.container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('Current song')).toBeInTheDocument();
  });
});
