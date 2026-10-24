import { LocateFixed, Map as MapIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ItemSearch, { type ItemSearchResult } from "./ItemSearch";
import PickOnMapSheet from "./PickOnMapSheet";
import { parseCoordinates, type LatLng } from "./parseCoordinates";
import type { createNearbyCache } from "./nearbyCache";

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  searchPlaces: (query: string, signal: AbortSignal) => Promise<ItemSearchResult[]>;
  nearby: ReturnType<typeof createNearbyCache>;
  locate: () => Promise<LatLng>;
  onPick: (result: ItemSearchResult) => void;
  onPickPin: (pin: LatLng) => void;
  onAddManually: () => void;
};

type Near = { origin: "coords" | "me"; at: LatLng; items: ItemSearchResult[] | null; failed?: boolean } | null;

// One field for a place name or coordinates, plus my location and pick on map (scope ADD-06..08).
export default function LocationSearchField({ query, onQueryChange, searchPlaces, nearby, locate, onPick, onPickPin, onAddManually }: Props) {
  const { t } = useTranslation();
  const [near, setNear] = useState<Near>(null);
  const [denied, setDenied] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const coords = parseCoordinates(query);

  useEffect(() => {
    if (!coords) { setNear((n) => (n?.origin === "coords" ? null : n)); return; }
    const at = coords;
    const timer = setTimeout(() => {
      setNear({ origin: "coords", at, items: null });
      nearby.get(at).then((items) => setNear({ origin: "coords", at, items }), () => setNear({ origin: "coords", at, items: [], failed: true }));
    }, 300);
    return () => clearTimeout(timer);
  }, [coords?.lat, coords?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const useMyLocation = async () => {
    try {
      const at = await locate();
      setNear({ origin: "me", at, items: null });
      setNear({ origin: "me", at, items: await nearby.get(at) });
    } catch (error) {
      if ((error as { code?: number }).code === 1) setDenied(true);
      else setNear(null);
    }
  };

  const textSearch = (text: string, signal: AbortSignal) => (parseCoordinates(text) ? Promise.resolve([]) : searchPlaces(text, signal));
  const rows = (items: ItemSearchResult[]) => (
    <ul role="listbox" className="grid gap-1">{items.map((item) => (
      <li key={item.id} role="option" aria-selected={false} tabIndex={0} onClick={() => onPick(item)} onKeyDown={(e) => { if (e.key === "Enter") onPick(item); }}
        className="min-h-11 cursor-pointer rounded-lg p-2 hover:bg-white/5">
        <b className="block text-sm">{item.title}</b>{item.subtitle && <span className="text-xs text-gray-400">{item.subtitle}</span>}</li>))}</ul>
  );

  const override = denied ? <p role="alert" className="text-sm text-amber-300">{t("dashboard.wp4.locationOff", "Location is off. Type a place or use the map.")}</p>
    : near ? (
      <div className="grid gap-2">
        {near.origin === "coords" && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
            <b>{t("dashboard.wp4.pinAt", "Pin at {{lat}}, {{lng}}", { lat: near.at.lat.toFixed(4), lng: near.at.lng.toFixed(4) })}</b>
          </div>
        )}
        {near.items === null ? <p className="text-xs text-gray-400">{t("dashboard.wp4.findingNearby", "Finding nearby places…")}</p>
          : near.items.length ? <><p className="text-xs text-gray-400">{t("dashboard.wp4.nearest", "Nearest named places")}</p>{rows(near.items)}</>
          : <p className="text-xs text-gray-400">{t("dashboard.wp4.noNearby", "No named places nearby. Use the pin.")}</p>}
        <button type="button" onClick={() => onPickPin(near.at)} className="min-h-11 justify-self-start rounded-xl border border-white/10 px-3">
          {t("dashboard.wp4.usePin", "Use the pin as a custom place")}</button>
      </div>
    ) : undefined;

  return (
    <>
      <ItemSearch query={query} onQueryChange={(q) => { if (near?.origin === "me") setNear(null); onQueryChange(q); }} search={textSearch}
        onPick={onPick} onAddManually={onAddManually} override={override}
        placeholder={t("dashboard.wp4.placePlaceholder", "Search a place or paste coordinates")}
        trailing={<>
          <button type="button" onClick={useMyLocation} disabled={denied} aria-label={t("dashboard.wp4.useMyLocation", "Use my current location")} title={t("dashboard.wp4.useMyLocation", "Use my current location")} className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 text-blue-400 disabled:opacity-40"><LocateFixed aria-hidden className="h-4 w-4" /></button>
          <button type="button" onClick={() => setMapOpen(true)} aria-label={t("dashboard.wp4.pickOnMap", "Pick on map")} title={t("dashboard.wp4.pickOnMap", "Pick on map")} className="grid h-11 w-11 place-items-center rounded-lg border border-white/10"><MapIcon aria-hidden className="h-4 w-4" /></button>
        </>} />
      {mapOpen && <PickOnMapSheet initial={near?.at ?? coords} onClose={() => setMapOpen(false)} onUse={(pin) => { setMapOpen(false); onPickPin(pin); }} />}
    </>
  );
}
