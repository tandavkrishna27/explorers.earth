import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from './ui/landingButton';
import { loadAnalytics } from '../../../utils/analytics';
import { useTranslation } from 'react-i18next';
import { ANALYTICS_CONSENT_CHANGED_EVENT } from '../../../services/explorersAnalyticsClient';
import { useLocation } from 'react-router-dom';
import { validateUsername } from '../../../utils/usernameValidation';

interface CookiePreferences {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
}

const INTERNAL_FIRST_PATH_SEGMENTS = new Set([
  '404',
  'about',
  'analytics',
  'claimaccount',
  'checkout',
  'contact',
  'cookies',
  'email-confirmed',
  'email-verification',
  'forgot-password',
  'google-auth',
  'guides',
  'home',
  'hub',
  'instagram',
  'login',
  'music',
  'onboarding',
  'privacy',
  'reactivate',
  'reactivate-confirm',
  'recommendations',
  'register',
  'reset-link-sent',
  'reset-password',
  'sso',
  'subscription-plans',
  'terms',
  'use-cases',
]);

export default function CookieConsent() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [isVisible, setIsVisible] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    essential: true, // Always true
    analytics: false,
    marketing: false,
  });

  const storeConsent = (consent: CookiePreferences): boolean => {
    try {
      localStorage.setItem(
        'explorers-cookie-consent',
        JSON.stringify({ ...consent, timestamp: new Date().toISOString() }),
      );
      window.dispatchEvent(new Event(ANALYTICS_CONSENT_CHANGED_EVENT));
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    // Check if user has already made a choice
    let storedConsent: string | null = null;
    try {
      storedConsent = localStorage.getItem('explorers-cookie-consent');
    } catch {
      // Storage can be unavailable in restricted browser contexts. Consent
      // remains fail-closed and the banner is still shown for this page.
    }
    if (!storedConsent) {
      // Show banner after 2 seconds delay
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 2000);
      return () => clearTimeout(timer);
    }

    try {
      const consent = JSON.parse(storedConsent);
      if (consent.analytics) {
        loadAnalytics();
      }
    } catch {
      // ignore parsing errors
    }
  }, []);

  const handleAcceptAll = () => {
    const consentData = {
      essential: true,
      analytics: true,
      marketing: true,
      timestamp: new Date().toISOString(),
    };
    if (storeConsent(consentData)) loadAnalytics();
    setIsVisible(false);
  };

  const handleRejectNonEssential = () => {
    const consentData = {
      essential: true,
      analytics: false,
      marketing: false,
      timestamp: new Date().toISOString(),
    };
    storeConsent(consentData);
    setIsVisible(false);
  };

  const handleSavePreferences = () => {
    const consentData = {
      ...preferences,
      timestamp: new Date().toISOString(),
    };
    const stored = storeConsent(consentData);
    if (stored && consentData.analytics) {
      loadAnalytics();
    }
    setIsVisible(false);
    setShowPreferences(false);
  };

  const handleClose = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  const firstPathSegment = pathname.split('/').filter(Boolean)[0] ?? '';
  const isPublicProfileRoute =
    !INTERNAL_FIRST_PATH_SEGMENTS.has(firstPathSegment.toLowerCase()) &&
    validateUsername(firstPathSegment).isValid;

  return (
    <AnimatePresence>
      <motion.div
        data-testid="cookie-consent-positioner"
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
        className={`fixed left-3 right-3 z-50 sm:left-0 sm:right-0 sm:p-6 ${
          isPublicProfileRoute ? 'bottom-16' : 'bottom-3 sm:bottom-0'
        }`}
      >
        <div
          className="mx-auto max-h-[42dvh] max-w-6xl overflow-y-auto backdrop-blur-sm border border-gray-200 rounded-lg shadow-2xl sm:max-h-none"
          style={{ backgroundColor: '#F3F4F6' }}
        >
          {!showPreferences ? (
            // Main banner
            <div className="p-3 sm:p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 pr-4">
                  <h3 className="font-semibold text-lg mb-2" style={{ color: '#1B3B1A' }}>
                    {t('cookieConsent.title')}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#1B3B1A' }}>
                    {t('cookieConsent.description')}
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  className="flex-shrink-0 p-1 rounded-full hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500"
                  aria-label={t('cookieConsent.closeBanner')}
                >
                  <X size={20} style={{ color: '#1B3B1A' }} />
                </button>
              </div>

              {/* Buttons */}
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                <Button
                  onClick={handleAcceptAll}
                  className="flex-1 font-semibold text-white rounded-full transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
                  style={{ backgroundColor: '#1B3B1A' }}
                >
                  {t('cookieConsent.acceptAll')}
                </Button>

                <Button
                  onClick={() => setShowPreferences(true)}
                  variant="outline"
                  className="flex-1 font-semibold border-2 rounded-full transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
                  style={{
                    borderColor: '#1B3B1A',
                    color: '#1B3B1A',
                    backgroundColor: 'white'
                  }}
                >
                  {t('cookieConsent.customize')}
                </Button>

                <Button
                  onClick={handleRejectNonEssential}
                  variant="outline"
                  className="flex-1 font-semibold border-2 rounded-full transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
                  style={{
                    borderColor: '#1B3B1A',
                    color: '#1B3B1A',
                    backgroundColor: 'white'
                  }}
                >
                  {t('cookieConsent.rejectNonEssential')}
                </Button>
              </div>
            </div>
          ) : (
            // Preferences panel
            <div className="p-4 sm:p-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-semibold text-lg" style={{ color: '#1B3B1A' }}>
                  {t('cookieConsent.preferencesTitle')}
                </h3>
                <button
                  onClick={() => setShowPreferences(false)}
                  className="flex-shrink-0 p-1 rounded-full hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500"
                  aria-label={t('cookieConsent.goBack')}
                >
                  <X size={20} style={{ color: '#1B3B1A' }} />
                </button>
              </div>

              <div className="space-y-4 mb-6">
                {/* Essential Cookies */}
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div className="flex-1">
                    <h4 className="font-medium" style={{ color: '#1B3B1A' }}>{t('cookieConsent.essentialCookies.title')}</h4>
                    <p className="text-sm text-gray-600">{t('cookieConsent.essentialCookies.description')}</p>
                  </div>
                  <div className="ml-4">
                    <div className="w-12 h-6 bg-green-500 rounded-full flex items-center justify-end px-1">
                      <div className="w-4 h-4 bg-white rounded-full"></div>
                    </div>
                    <span className="text-xs text-gray-500 mt-1 block">{t('cookieConsent.essentialCookies.alwaysOn')}</span>
                  </div>
                </div>

                {/* Analytics Cookies */}
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div className="flex-1">
                    <h4 className="font-medium" style={{ color: '#1B3B1A' }}>{t('cookieConsent.analyticsCookies.title')}</h4>
                    <p className="text-sm text-gray-600">{t('cookieConsent.analyticsCookies.description')}</p>
                  </div>
                  <div className="ml-4">
                    <button
                      onClick={() => setPreferences(prev => ({ ...prev, analytics: !prev.analytics }))}
                      type="button"
                      role="switch"
                      aria-checked={preferences.analytics}
                      aria-label={t('cookieConsent.analyticsCookies.title')}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <span
                        className={`flex h-6 w-12 items-center rounded-full px-1 transition-all ${preferences.analytics ? 'justify-end bg-green-500' : 'justify-start bg-gray-300'}`}
                        aria-hidden="true"
                      >
                        <span className="h-4 w-4 rounded-full bg-white" />
                      </span>
                    </button>
                  </div>
                </div>

                {/* Marketing Cookies */}
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div className="flex-1">
                    <h4 className="font-medium" style={{ color: '#1B3B1A' }}>{t('cookieConsent.marketingCookies.title')}</h4>
                    <p className="text-sm text-gray-600">{t('cookieConsent.marketingCookies.description')}</p>
                  </div>
                  <div className="ml-4">
                    <button
                      onClick={() => setPreferences(prev => ({ ...prev, marketing: !prev.marketing }))}
                      type="button"
                      role="switch"
                      aria-checked={preferences.marketing}
                      aria-label={t('cookieConsent.marketingCookies.title')}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <span
                        className={`flex h-6 w-12 items-center rounded-full px-1 transition-all ${preferences.marketing ? 'justify-end bg-green-500' : 'justify-start bg-gray-300'}`}
                        aria-hidden="true"
                      >
                        <span className="h-4 w-4 rounded-full bg-white" />
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Save Preferences Button */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleSavePreferences}
                  className="flex-1 font-semibold text-white rounded-full transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
                  style={{ backgroundColor: '#1B3B1A' }}
                >
                  {t('cookieConsent.savePreferences')}
                </Button>
                <Button
                  onClick={handleAcceptAll}
                  variant="outline"
                  className="flex-1 font-semibold border-2 rounded-full transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
                  style={{
                    borderColor: '#1B3B1A',
                    color: '#1B3B1A',
                    backgroundColor: 'white'
                  }}
                >
                  {t('cookieConsent.acceptAllButton')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
