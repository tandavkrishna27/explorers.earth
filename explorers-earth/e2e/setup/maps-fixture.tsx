import type { PropsWithChildren } from 'react';

// Only third-party Maps is replaced. No navigation, publication or auth code is
// substituted. These journeys do not qualify Maps functionality or rendering.
export const APIProvider = ({ children }: PropsWithChildren) => <>{children}</>;
export const Map = () => null;
export const AdvancedMarker = () => null;
export const Pin = () => null;
export const useMap = () => null;
// A journey opts in to a usable Maps by defining `google.maps.marker.AdvancedMarkerElement`
// before load (the same signal `useMapsUsable` requires); otherwise Maps reports not loaded.
export const useApiIsLoaded = () => Boolean((globalThis as any).google?.maps?.marker?.AdvancedMarkerElement);
export const useMapsLibrary = () => null;
