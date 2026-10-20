import { useTranslation } from "react-i18next";
import type { ListQrCategory } from "../utils/listShareUrls";

/** The pill under a QR code: one translated line per category. */
export default function QrCardTagline({ className, category }: { className: string; category: ListQrCategory }) {
  const { t } = useTranslation();
  return <p className={className}>{t(`qrCard.tagline.${category}`)}</p>;
}
