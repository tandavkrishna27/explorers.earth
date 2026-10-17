import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Headphones, Music2 } from 'lucide-react';
import type { MusicFeaturedCard } from '../publicMusicPresentation';
import { PublicMusicArtwork } from './PublicMusicArtwork';
export interface PublicMusicNowPlayingProps { cards: readonly MusicFeaturedCard[]; canListen: boolean; onListen(card: MusicFeaturedCard): void }
export function PublicMusicNowPlaying({ cards, canListen, onListen }: PublicMusicNowPlayingProps) {
  const [selectedKey, setSelectedKey] = useState<string>();
  const pointer = useRef<{x: number; y: number; id: number}>();
  const index = Math.max(0, cards.findIndex(card => card.key === selectedKey));
  const active = cards[index];
  useLayoutEffect(() => {
    if (selectedKey && !cards.some(card => card.key === selectedKey)) setSelectedKey(undefined);
  }, [cards, selectedKey]);
  const move = (direction: number) => setSelectedKey(cards[(index + direction + cards.length) % cards.length]?.key);
  if (!active) return <section className="public-music__quiet public-music__surface" aria-label="Music activity"><Music2 aria-hidden="true" /><p>A little quiet right now</p><span className="public-music__muted">No live tracks to show yet.</span></section>;
  return <section className="public-music__featured" aria-label="Now playing and up next">
    <div className="public-music__card-stack" onPointerDown={event => {
      pointer.current = undefined;
      if ((event.target as HTMLElement).closest('button') || !event.isPrimary || event.button !== 0) return;
      pointer.current = {x: event.clientX, y: event.clientY, id: event.pointerId};
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }} onLostPointerCapture={() => { pointer.current = undefined; }} onPointerLeave={event => {
      if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) pointer.current = undefined;
    }} onPointerCancel={() => { pointer.current = undefined; }} onPointerUp={event => {
      const start = pointer.current; pointer.current = undefined;
      if (!start || start.id !== event.pointerId || cards.length < 2) return;
      const dx = event.clientX - start.x; const dy = event.clientY - start.y;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
    }}>
      {cards.length > 1 && <div className="public-music__stack-back public-music__stack-back--second" aria-hidden="true" />}
      {cards.length > 2 && <div className="public-music__stack-back public-music__stack-back--third" aria-hidden="true" />}
      <div className="public-music__artwork-card" data-testid="music-featured-active">
        <PublicMusicArtwork url={active.song.thumbnailUrl} className="public-music__featured-image" />
        <div className="public-music__artwork-copy">
          <span className="public-music__playing-badge"><span aria-hidden="true" />{active.source === 'current' ? 'Now playing' : 'Up next'}</span>
          <p className="public-music__track-title">{active.song.title}</p><p className="public-music__track-artist">{active.song.artist}</p>
          {canListen && <button type="button" className="public-music__listen" onClick={() => onListen(active)}><Headphones aria-hidden="true" size={16} />Listen on this device</button>}
        </div>
      </div>
    </div>
    {cards.length > 1 && <div className="public-music__card-navigation">
      <button type="button" className="public-music__icon-button" aria-label="Previous music card" onClick={() => move(-1)}><ArrowLeft aria-hidden="true" size={18} /></button>
      <div className="public-music__card-choices">{cards.map((card, i) => <button key={card.key} type="button" aria-label={`View music card ${i + 1}: ${card.song.title}`} aria-pressed={i === index} onClick={() => setSelectedKey(card.key)} className="public-music__card-choice"><span className="public-music__card-dot" /><span className="public-music__thumbnail"><PublicMusicArtwork url={card.song.thumbnailUrl} /></span></button>)}</div>
      <button type="button" className="public-music__icon-button" aria-label="Next music card" onClick={() => move(1)}><ArrowRight aria-hidden="true" size={18} /></button>
    </div>}
  </section>;
}
