import type { PropsWithChildren } from 'react';

// Only third-party Maps is replaced. No navigation, publication or auth code is
// substituted. These journeys do not qualify Maps functionality or rendering.
export const APIProvider = ({ children }: PropsWithChildren) => <>{children}</>;
export const Map = () => null;
export const AdvancedMarker = () => null;
export const Pin = () => null;
export const useMap = () => null;
export const useApiIsLoaded = () => false;
export const useMapsLibrary = () => null;
