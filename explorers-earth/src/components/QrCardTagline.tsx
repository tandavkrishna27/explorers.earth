import { useTranslation } from "react-i18next";

/**
 * The pill under a list's QR code. "Travel like a local" belongs to Places; every other
 * category's QR card uses this neutral line instead.
 */
export default function QrCardTagline({ className }: { className: string }) {
  const { t } = useTranslation();
  return <p className={className}>{t("sections.shareAnywhere.visual.scanForPicks")}</p>;
}
