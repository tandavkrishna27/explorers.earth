import { createContext, forwardRef, useContext, useMemo, type ReactNode } from 'react';

// A local adapter for application controls/configuration. It renders no Google tiles or provider UI.
const calls: { method: string; args: unknown[] }[] = [];
Object.assign(globalThis, { __categoryMapCalls: calls });
const record = (method: string, ...args: unknown[]) => { calls.push({ method, args }); };
class LatLng {
  constructor(private latitude: number, private longitude: number) {}
  lat() { return this.latitude; }
  lng() { return this.longitude; }
}
class LatLngBounds { constructor(public southwest: LatLng, public northeast: LatLng) {} }
class Polyline {
  constructor(options: unknown) { record('Polyline', options); }
  setMap(map: unknown) { record('polyline.setMap', Boolean(map)); }
  setPath(path: unknown) { record('polyline.setPath', path); }
}
Object.assign(globalThis, { google: { maps: { LatLng, LatLngBounds, Polyline, SymbolPath: { FORWARD_CLOSED_ARROW: 'FORWARD_CLOSED_ARROW' } } } });
const MapContext = createContext<any>(null);
export const APIProvider = ({ children }: { children?: ReactNode; apiKey?: string }) => <>{children}</>;
export const useApiIsLoaded = () => !(globalThis as any).__categoryMapUnavailable;
export const useMapsLibrary = () => null;
export const useMap = () => useContext(MapContext);
export function Map({ children, style, onClick, ...props }: any) {
  const controller = useMemo(() => ({
    getCenter: () => new LatLng(26.9124, 75.7873), getZoom: () => 13,
    panTo: (...args: unknown[]) => record('panTo', ...args), setZoom: (...args: unknown[]) => record('setZoom', ...args),
    moveCamera: (...args: unknown[]) => record('moveCamera', ...args), fitBounds: (...args: unknown[]) => record('fitBounds', ...args),
  }), []);
  const options = Object.fromEntries(['defaultCenter', 'center', 'defaultZoom', 'zoom', 'mapId', 'scrollwheel', 'gestureHandling', 'fullscreenControl', 'disableDefaultUI', 'mapTypeId'].filter(key => props[key] !== undefined).map(key => [key, props[key]]));
  return <MapContext.Provider value={controller}><div data-category-theme-map data-map-id={props.mapId} data-map-options={JSON.stringify(options)} style={{ position: 'relative', ...style }} onClick={onClick}>{children}</div></MapContext.Provider>;
}
// A fixed local anchor makes real pointer selection possible. This is NOT map projection:
// coordinates remain recorded unchanged, and overlapping fixture markers are intentionally explicit.
export const AdvancedMarker = forwardRef<HTMLDivElement, any>(({ children, position, zIndex, onClick }, ref) => <div ref={ref} data-map-marker data-marker-position={JSON.stringify(position)} data-marker-z-index={zIndex} style={{ position: 'absolute', left: 'calc(50% - 16px)', top: '52%', width: 32, height: 32, zIndex }} onClick={onClick}>{children}</div>);
export const Pin = ({ background, borderColor, glyphColor }: any) => <span aria-hidden="true" data-map-pin data-pin-colors={JSON.stringify({ background, borderColor, glyphColor })} style={{ display: 'block', width: 20, height: 20, borderRadius: '50%', background }} />;
