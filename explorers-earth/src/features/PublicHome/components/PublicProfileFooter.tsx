import { memo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PublicBrandWordmark } from "./PublicBranding";

interface PublicProfileFooterProps {
  brandingStyle?: 'enabled' | 'minimal' | 'disabled';
  username?: string;
}

export const PublicProfileFooter = memo(({ brandingStyle = 'enabled' }: PublicProfileFooterProps) => {
  const { t } = useTranslation();
  if (brandingStyle === 'disabled') return null;

  return (
    <footer className="public-brand-footer relative z-0 mt-auto w-full px-4 pt-10 text-center">
      <div className="inline-flex min-h-12 flex-col items-center gap-1 px-5 py-2.5">
        <span className="font-poppins text-sm font-medium" style={{ color: "var(--public-chrome-muted)" }}>
          {t("publicProfile.footer.poweredBy", "Powered by")}
        </span>
        <PublicBrandWordmark />
      </div>

      {brandingStyle === 'enabled' && (
        <div data-public-footer-links className="mt-4 flex flex-wrap items-center justify-center gap-3 font-poppins text-xs sm:gap-4">
          <Link to="/" className="profile-presentation-focus inline-flex min-h-11 items-center rounded-md px-2 transition-colors">{t("publicProfile.footer.createProfile", "Create your profile")}</Link>
          <span>•</span>
          <a href="mailto:support@explorers.earth" className="profile-presentation-focus inline-flex min-h-11 items-center rounded-md px-2 transition-colors">{t("publicProfile.footer.report", "Report")}</a>
          <span>•</span>
          <Link to="/privacy" className="profile-presentation-focus inline-flex min-h-11 items-center rounded-md px-2 transition-colors">{t("publicProfile.footer.privacy", "Privacy")}</Link>
        </div>
      )}
    </footer>
  );
});

PublicProfileFooter.displayName = "PublicProfileFooter";
export default PublicProfileFooter;
