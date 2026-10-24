import { useTranslation } from "react-i18next";

type Props = { title: string; subtitle?: string; imageUrl?: string | null; onChange: () => void; locked?: boolean };

// Picked item shown at the top as a confirmed card (scope ADD-04, OWN-09).
export default function PickedItemCard({ title, subtitle, imageUrl, onChange, locked = false }: Props) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-blue-400/35 bg-blue-400/10 p-3">
      {imageUrl ? <img src={imageUrl} alt="" className="h-12 w-9 rounded object-cover" /> : <span className="h-12 w-9 rounded bg-slate-700" />}
      <span className="min-w-0 flex-1"><b className="block truncate">{title}</b>{subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}</span>
      {!locked && <button type="button" onClick={onChange} className="min-h-11 rounded-lg border border-white/10 px-3 text-sm">{t("dashboard.wp4.change", "Change")}</button>}
    </div>
  );
}
