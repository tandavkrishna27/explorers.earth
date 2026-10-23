import type { ItemSearchResult } from "./ItemSearch";
import type { LatLng } from "./parseCoordinates";

export type NearbyLookup = (cell: LatLng) => Promise<ItemSearchResult[]>;

// 3 decimals is a ~110 m cell (scope ADD-08: lookup on tap only, cached per rounded area).
const round = (value: number) => Math.round(value * 1000) / 1000;

export function createNearbyCache(lookup: NearbyLookup, limit = 50) {
  const cells = new Map<string, Promise<ItemSearchResult[]>>();
  return {
    get(point: LatLng): Promise<ItemSearchResult[]> {
      const cell = { lat: round(point.lat), lng: round(point.lng) };
      const key = `${cell.lat},${cell.lng}`;
      const hit = cells.get(key);
      if (hit) { cells.delete(key); cells.set(key, hit); return hit; }
      const pending = lookup(cell).catch((error) => { cells.delete(key); throw error; });
      cells.set(key, pending);
      if (cells.size > limit) cells.delete(cells.keys().next().value!);
      return pending;
    },
  };
}
