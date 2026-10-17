import { forwardRef, useImperativeHandle, useState } from 'react';

// Observable inert transport, not playback proof. Exposes both imperative play
// attempts and declarative playing=true so either accidental start is detected.
const PresentationMedia = forwardRef<{ play(): Promise<void>; pause(): void }, {
  playing?: boolean; src?: string; onPlay?(): void; onPause?(): void;
}>(({ playing, src, onPlay, onPause }, ref) => {
  const [attempts, setAttempts] = useState(0);
  useImperativeHandle(ref, () => ({
    async play() { setAttempts(value => value + 1); onPlay?.(); },
    pause() { onPause?.(); },
  }), [onPlay, onPause]);
  return <div data-testid="contained-music-media" data-play-attempts={attempts} data-playing={String(Boolean(playing))} data-src={src} aria-label="Inert test media" />;
});
PresentationMedia.displayName = 'PresentationMedia';
export default PresentationMedia;
