/// <reference types="vite/client" />

declare global {
  interface Window {
    google: typeof google;
    googleMapsLoaded?: boolean;
  }
}

// quill2-emoji ships no type declarations
declare module 'quill2-emoji';