import { useTranslation } from "react-i18next";

/** The yellow dashed "Sample" pill (mocks v3). */
export function SampleBadge({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md border border-dashed border-yellow-400/70 bg-yellow-400/[.16] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-yellow-300 ${className}`}>
      {t("samples.badge", "Sample")}
    </span>
  );
}
