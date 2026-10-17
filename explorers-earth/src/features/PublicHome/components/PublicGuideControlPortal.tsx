import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { usePublicCategoryThemeStyles } from './PublicCategoryThemeContext';

interface PublicGuideControlPortalProps {
  kind: 'launcher' | 'map';
  children: ReactNode;
}

const PublicGuideControlPortal = ({ kind, children }: PublicGuideControlPortalProps) => {
  const categoryStyles = usePublicCategoryThemeStyles();
  if (typeof document === 'undefined') return null;

  const isLauncher = kind === 'launcher';
  return createPortal(
    <div
      {...(isLauncher ? { 'data-public-guide-map-launcher': true } : { 'data-public-guide-map-surface': true })}
      className={isLauncher
        ? 'public-guide-map-launcher fixed left-1/2 -translate-x-1/2'
        : `public-guide-map-surface fixed inset-0 ${categoryStyles ? 'bg-[var(--category-page)]' : 'bg-black'}`}
      style={categoryStyles ?? undefined}
    >
      {children}
    </div>,
    document.body,
  );
};

export default PublicGuideControlPortal;
