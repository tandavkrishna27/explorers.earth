import { useTranslation } from "react-i18next";
import { useOriginBack, type BackFallback } from "./useOriginBack";

/** v3/v5 mock ".back": muted, 10px, letter-spacing .08em, uppercase, left aligned; 44px touch target. */
export function BackToOrigin({ fallback, className = "" }: { fallback: BackFallback; className?: string }) {
  const { t } = useTranslation();
  const back = useOriginBack(fallback);
  const text = back.label && back.source === "state" ? t("dashboard.wp1.back.to", { name: back.label }) : fallback.label;
  return (
    <button
      type="button"
      onClick={() => back.goBack()}
      aria-label={text}
      data-back-source={back.source}
      className={`inline-flex min-h-[44px] items-center self-start bg-transparent p-0 text-[10px] uppercase tracking-[0.08em] text-[#8b93a1] hover:text-white ${className}`}
    >
      ‹ {text}
    </button>
  );
}
