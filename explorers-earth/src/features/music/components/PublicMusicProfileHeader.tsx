import { useState } from 'react';
import { MapPin } from 'lucide-react';

export interface PublicMusicProfileHeaderProps { name: string; username?: string; avatarUrl?: string; location?: string }

export function PublicMusicProfileHeader({ name, username, avatarUrl, location }: PublicMusicProfileHeaderProps) {
  const [failedImage, setFailedImage] = useState<string>();
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] ?? '').join('').toUpperCase();
  return <div className="public-music__identity">
    {avatarUrl && failedImage !== avatarUrl
      ? <img className="public-music__avatar" src={avatarUrl} alt={`${name} profile photo`} onError={() => setFailedImage(avatarUrl)} />
      : <span className="public-music__avatar public-music__initials" aria-label={`${name} initials`}>{initials}</span>}
    <div className="public-music__identity-copy"><p className="public-music__identity-name">{name}</p>
      <div className="public-music__identity-meta">{username && <span>@{username}</span>}{location && <span><MapPin aria-hidden="true" size={13} />{location}</span>}</div>
    </div>
  </div>;
}

/** Only selected artwork: this surface never loads the root profile's stock hero. */
export function PublicMusicBackdrop({ url, wallpaper = false }: { url?: string; wallpaper?: boolean }) {
  const [failedImage, setFailedImage] = useState<string>();
  if (!url || failedImage === url) return null;
  return <div className={wallpaper ? 'public-music__wallpaper' : 'public-music__cover'} data-profile-wallpaper={wallpaper ? '' : undefined} aria-hidden="true">
    <img data-music-cover={!wallpaper ? '' : undefined} src={url} alt="" onError={() => setFailedImage(url)} />
  </div>;
}
