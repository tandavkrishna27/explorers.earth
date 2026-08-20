import { Instagram } from "lucide-react";
import { LogoFull } from "../../../assets/icons/EoeLogo";
import { useReducedMotion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GlobePattern } from "./BackgroundPatterns";

export default function Footer() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const reducedMotion = useReducedMotion();

  const scrollToSection = (sectionId: string) => {
    if (location.pathname === "/") {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
      }
    } else {
      navigate(`/#${sectionId}`);
    }
  };

  return (
    <footer
      className="relative overflow-hidden py-16 pb-8 text-white"
      style={{
        background:
          "radial-gradient(circle at 18% 0%, rgba(216,161,93,.18), transparent 28%), radial-gradient(circle at 88% 12%, rgba(184,201,171,.12), transparent 30%), #102513",
      }}
    >
      <GlobePattern />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-5">
            <LogoFull className="h-7 text-[#f6f1e7]" />
            <p className="max-w-sm text-sm leading-6 text-white/68">{t("footer.tagline")}</p>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm font-black text-[#f6f1e7]">
              <span className="h-2 w-2 rounded-full bg-[#c87941]" />
              {t("footer.freeForever")}
            </div>
            <div className="flex gap-3">
              <a
                href="https://www.instagram.com/explorers_earth/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/10 p-2 text-white/62 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941]"
                aria-label="Instagram"
              >
                <Instagram size={18} />
              </a>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-[0.1em] text-white">{t("footer.sections.product")}</h3>
            <div className="space-y-2 text-sm font-semibold">
              <button
                onClick={() => scrollToSection("product")}
                className="flex min-h-11 w-fit items-center text-white/68 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941]"
              >
                {t("footer.links.product")}
              </button>
              <Link to="/use-cases" className="flex min-h-11 w-fit items-center text-white/68 transition-colors hover:text-white visited:text-[#b8c9ab] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941]">
                {t("footer.links.useCases")}
              </Link>
              <button
                onClick={() => scrollToSection("how-it-works")}
                className="flex min-h-11 w-fit items-center text-white/68 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941]"
              >
                {t("footer.links.howItWorks")}
              </button>
              <button
                onClick={() => scrollToSection("share")}
                className="flex min-h-11 w-fit items-center text-white/68 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941]"
              >
                {t("footer.links.shareAnywhere")}
              </button>
              <button
                onClick={() => scrollToSection("faq")}
                className="flex min-h-11 w-fit items-center text-white/68 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941]"
              >
                {t("footer.links.faq")}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-[0.1em] text-white">{t("footer.sections.company")}</h3>
            <div className="space-y-2 text-sm font-semibold">
              <Link to="/about" className="flex min-h-11 w-fit items-center text-white/68 transition-colors hover:text-white visited:text-[#b8c9ab] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941]">
                {t("footer.links.about")}
              </Link>
              <Link to="/contact" className="flex min-h-11 w-fit items-center text-white/68 transition-colors hover:text-white visited:text-[#b8c9ab] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941]">
                {t("footer.links.contact")}
              </Link>
            <a
              href={`mailto:${t("footer.email")}`}
              className="flex min-h-11 w-fit items-center text-white/68 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941]"
            >
              {t("footer.email")}
            </a>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-[0.1em] text-white">{t("footer.sections.legal")}</h3>
            <div className="space-y-2 text-sm font-semibold">
              <Link to="/terms" className="flex min-h-11 w-fit items-center text-white/68 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941]">
                {t("footer.links.terms")}
              </Link>
              <Link to="/privacy" className="flex min-h-11 w-fit items-center text-white/68 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941]">
                {t("footer.links.privacy")}
              </Link>
              <Link to="/cookies" className="flex min-h-11 w-fit items-center text-white/68 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941]">
                {t("footer.links.cookies")}
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col justify-between gap-4 border-t border-white/10 pt-6 text-sm text-white/50 sm:flex-row">
          <p className="text-sm text-white/54">{t("footer.copyright")}</p>
          <p className="text-sm text-white/54">{t("footer.madeWithLove")}</p>
        </div>
      </div>
    </footer>
  );
}
