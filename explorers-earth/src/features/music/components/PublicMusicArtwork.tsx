import { useState } from 'react';
import { Music2 } from 'lucide-react';

export function PublicMusicArtwork({ url, className = '' }: { url?: string | null; className?: string }) {
  const [failed, setFailed] = useState<string>();
  return url && failed !== url
    ? <img className={className} src={url} alt="" onError={() => setFailed(url)} loading="lazy" />
    : <span className={`public-music__artwork-fallback ${className}`} aria-hidden="true"><Music2 /></span>;
}
