import { AdvancedMarker, Map } from "@vis.gl/react-google-maps";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LatLng } from "./parseCoordinates";

const START: LatLng = { lat: 20.5937, lng: 78.9629 }; // same start as RecommendForm.tsx

type Props = { initial?: LatLng | null; onUse: (pin: LatLng) => void; onClose: () => void };

// Must render under the existing GoogleMapsProvider (the consumer provides it).
export default function PickOnMapSheet({ initial, onUse, onClose }: Props) {
  const { t } = useTranslation();
  const [pin, setPin] = useState<LatLng | null>(initial ?? null);
  return (
    <div role="dialog" aria-modal="true" aria-label={t("dashboard.wp4.pickOnMap", "Pick on map")} className="fixed inset-0 z-50 flex items-end justify-center bg-black/65">
      <div className="grid w-full max-w-[640px] gap-3 rounded-t-2xl border border-white/10 bg-[#14171f] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center"><b className="flex-1">{t("dashboard.wp4.pickOnMap", "Pick on map")}</b>
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-white/10 px-3">{t("dashboard.wp4.close", "Close")}</button></div>
        <div className="h-[300px] overflow-hidden rounded-xl">
          <Map defaultCenter={initial ?? START} defaultZoom={initial ? 16 : 5} mapId="mapView" gestureHandling="greedy"
            onClick={(e) => { const p = e.detail.latLng; if (p) setPin({ lat: p.lat, lng: p.lng }); }}>
            {pin && <AdvancedMarker position={pin} />}
          </Map>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex-1 text-xs text-gray-400">{pin ? `${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}` : t("dashboard.wp4.tapToDrop", "Tap the map to drop the pin")}</span>
          <button type="button" disabled={!pin} onClick={() => pin && onUse(pin)} className="min-h-11 rounded-xl bg-blue-400 px-4 text-white disabled:opacity-50">{t("dashboard.wp4.useThisPin", "Use this pin")}</button>
        </div>
      </div>
    </div>
  );
}
