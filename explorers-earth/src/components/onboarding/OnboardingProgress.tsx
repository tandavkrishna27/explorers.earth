import { useTranslation } from "react-i18next";
import "./onboarding.css";

interface OnboardingProgressProps {
  /** zero-based index of the active step */
  stepIndex: number;
  /** total number of steps */
  total: number;
  /** short, localized title of the current step (e.g. "Contact") */
  title: string;
  /** one-line, localized helper text for the current step */
  subtitle?: string;
}

/**
 * Slim onboarding progress indicator: the current step's title, a "Step X of Y"
 * counter, and a filled bar. Replaces the old four-column numbered stepper, which
 * wrapped to two lines per label on mobile and pushed the form below the fold.
 */
const OnboardingProgress = ({
  stepIndex,
  total,
  title,
  subtitle,
}: OnboardingProgressProps) => {
  const { t } = useTranslation();
  const current = Math.min(stepIndex + 1, total);
  const pct = Math.round((current / Math.max(total, 1)) * 100);

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <h1 className="ob-prog-title">{title}</h1>
        <span className="ob-prog-count">
          {t("auth.onboarding.stepCount", {
            current,
            total,
            defaultValue: "Step {{current}} of {{total}}",
          })}
        </span>
      </div>
      <div className="ob-track">
        <div
          className="ob-fill"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label={title}
        />
      </div>
      {subtitle && <p className="ob-prog-sub">{subtitle}</p>}
    </div>
  );
};

export default OnboardingProgress;
