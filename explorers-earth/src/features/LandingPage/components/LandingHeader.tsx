import { useEffect, useRef, useState } from 'react';
import { LogoFull } from '../../../assets/icons/EoeLogo';
import { motion, useReducedMotion } from 'framer-motion';
import { Globe, ChevronDown, Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../../../store/store';
import LanguageModal from '../../../components/LanguageModal';
import useMarketingHashNavigation from '../hooks/useMarketingHashNavigation';

export default function LandingHeader() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const reducedMotion = useReducedMotion();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuId = 'marketing-mobile-menu';
  const navItems = [
    { label: t('header.nav.product'), kind: 'section', target: 'product' },
    { label: t('header.nav.howItWorks'), kind: 'section', target: 'how-it-works' },
    { label: t('header.nav.useCases'), kind: 'route', target: '/use-cases' },
    { label: t('header.nav.about'), kind: 'route', target: '/about' },
    { label: t('header.nav.faq'), kind: 'section', target: 'faq' },
  ] as const;

  useMarketingHashNavigation(Boolean(reducedMotion));

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  const scrollToSection = (sectionId: string) => {
    if (isAuthenticated) {
      navigate('/home');
      return;
    }

    if (location.pathname !== '/') {
      navigate(`/#${sectionId}`);
      setIsMobileMenuOpen(false);
      return;
    }

    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    }
    setIsMobileMenuOpen(false);
  };

  const handleNavigation = (item: (typeof navItems)[number]) => {
    if (item.kind === 'route') {
      navigate(item.target);
      setIsMobileMenuOpen(false);
      return;
    }

    scrollToSection(item.target);
  };

  const handleLogoClick = () => {
    if (isAuthenticated) {
      navigate('/home');
      return;
    }

    scrollToSection('hero');
  };

  // Check if we're on a non-home page to always show background
  const isNonHomePage = location.pathname !== '/';

  // Handle authentication button clicks
  const handleAuthButtonClick = (route: string) => {
    if (isAuthenticated) {
      // If user is logged in, redirect to dashboard
      navigate('/home');
    } else {
      // If user is not logged in, navigate to the specified route
      navigate(route);
    }
  };

  // Handle language change
  const handleLanguageChange = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
  };

  const hasSolidHeader = isScrolled || isNonHomePage || isMobileMenuOpen;

  return (
    <motion.header
      initial={reducedMotion ? false : { opacity: 0, y: -20 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      className={`fixed left-3 right-3 top-4 z-50 mx-auto max-w-[1060px] rounded-full border transition-all duration-300 ${
        hasSolidHeader
          ? 'border-white/60 bg-[#fbf7ef]/92 text-[#17231a] shadow-[0_16px_48px_rgba(23,35,26,0.13)] backdrop-blur-xl'
          : 'border-white/60 bg-[#fbf7ef]/78 text-[#17231a] shadow-[0_16px_48px_rgba(23,35,26,0.12)] backdrop-blur-xl'
      }`}
    >
      <div className="px-4 py-3 sm:px-5">
        <nav className="flex items-center justify-between gap-4">
          {/* Logo */}
          <button 
            onClick={handleLogoClick}
            className="flex min-h-11 items-center transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941] focus-visible:ring-offset-2"
          >
            <LogoFull className="h-6 text-[#17231a] sm:h-7" />
          </button>

          {/* Desktop Navigation */}
          <div className="hidden items-center gap-4 rounded-full bg-transparent p-1 xl:flex">
            {navItems.map((item) => {
              const className = `relative flex min-h-11 items-center rounded-full px-1 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941] focus-visible:ring-offset-2 ${
                item.kind === 'route' && location.pathname === item.target
                  ? 'text-[#17231a] after:absolute after:inset-x-1 after:bottom-1 after:h-0.5 after:rounded-full after:bg-[#c87941]'
                  : 'text-[#17231a]/75 hover:text-[#17231a]'
              }`;

              return item.kind === 'route' ? (
                <Link key={`${item.kind}-${item.target}`} to={item.target} aria-current={location.pathname === item.target ? 'page' : undefined} className={className}>
                  {item.label}
                </Link>
              ) : (
                <button key={`${item.kind}-${item.target}`} onClick={() => handleNavigation(item)} className={className}>
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <button
              onClick={() => setIsLanguageModalOpen(true)}
              aria-label={t('languageModal.title')}
              className="flex min-h-11 items-center gap-1 rounded-full px-2.5 py-2 text-sm font-medium transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941] focus-visible:ring-offset-2"
            >
              <Globe size={16} />
              <span className="hidden sm:inline">{i18n.language.toUpperCase()}</span>
              <ChevronDown size={12} />
            </button>

            {/* Auth Buttons */}
            <div className="hidden items-center gap-2 xl:flex">
              <button 
                onClick={() => handleAuthButtonClick('/login')}
                className="min-h-11 rounded-full border border-[rgba(23,35,26,.18)] bg-[#fffcf6] px-4 py-2 text-sm font-extrabold text-[#1b3b1a] transition-all hover:bg-[#f6f1e7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941] focus-visible:ring-offset-2"
              >
                {t('header.auth.login')}
              </button>
              <button 
                onClick={() => handleAuthButtonClick('/register')}
                className="landing-green-button min-h-11 rounded-full px-4 py-2 text-sm font-extrabold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941] focus-visible:ring-offset-2"
              >
                {t('header.auth.claimFreePage')}
              </button>
            </div>

            {/* Mobile Menu Toggle */}
            <button
              ref={menuButtonRef}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-expanded={isMobileMenuOpen}
              aria-controls={mobileMenuId}
              aria-label={
                isMobileMenuOpen
                  ? t('header.nav.closeMenu')
                  : t('header.nav.openMenu')
              }
              className="min-h-11 min-w-11 rounded-full p-2 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941] focus-visible:ring-offset-2 xl:hidden"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </nav>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <motion.div
            id={mobileMenuId}
            initial={reducedMotion ? false : { opacity: 0, height: 0 }}
            animate={reducedMotion ? undefined : { opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden rounded-[22px] bg-[#fffcf6] shadow-lg xl:hidden"
          >
            <div className="p-4 space-y-4">
              {navItems.map((item) => {
                const className = `flex min-h-11 w-full items-center rounded-lg px-2 text-left text-[#17231a] transition-colors hover:bg-[#f6f1e7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941] ${
                  item.kind === 'route' && location.pathname === item.target ? 'underline decoration-2 decoration-[#c87941] underline-offset-8' : ''
                }`;

                return item.kind === 'route' ? (
                  <Link
                    key={`${item.kind}-${item.target}`}
                    to={item.target}
                    onClick={() => setIsMobileMenuOpen(false)}
                    aria-current={location.pathname === item.target ? 'page' : undefined}
                    className={className}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <button key={`${item.kind}-${item.target}`} onClick={() => handleNavigation(item)} className={className}>
                    {item.label}
                  </button>
                );
              })}
              <hr className="border-gray-200" />
              <div className="flex flex-col gap-3 sm:flex-row">
                <button 
                  onClick={() => handleAuthButtonClick('/login')}
                  className="min-h-11 flex-1 rounded-full border border-[#17231a] px-4 py-2 text-[#17231a] transition-all hover:bg-[#17231a] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941]">
                  {t('header.auth.login')}
                </button>
                <button 
                  onClick={() => handleAuthButtonClick('/register')}
                  className="landing-green-button min-h-11 flex-1 rounded-full px-4 py-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87941]"
                >
                  {t('header.auth.claimFree')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Language Modal */}
      <LanguageModal
        isOpen={isLanguageModalOpen}
        onClose={() => setIsLanguageModalOpen(false)}
        currentLanguage={i18n.language}
        onLanguageChange={handleLanguageChange}
      />
    </motion.header>
  );
}
