import LandingHeader from '../features/LandingPage/components/LandingHeader';
import Hero from '../features/LandingPage/components/Hero';
import ProductCategoriesSection from '../features/LandingPage/components/ProductCategoriesSection';
import CreateCustomize from '../features/LandingPage/components/CreateCustomize';
import ShareAnywhere from '../features/LandingPage/components/ShareAnywhere';
import Analytics from '../features/LandingPage/components/Analytics';
// import ReferEarn from '../features/LandingPage/components/ReferEarn';
import WhoIsFor from '../features/LandingPage/components/WhoIsFor';
import Testimonials from '../features/LandingPage/components/Testimonials';
import FAQ from '../features/LandingPage/components/FAQ';
// import Features from '../features/LandingPage/components/Features';
import FinalCTA from '../features/LandingPage/components/FinalCTA';
import Footer from '../features/LandingPage/components/Footer';
import SEO from '../components/SEO';
import { createOrganizationGEOData } from '../utils/geoHelpers';
import { createCanonicalUrl, getBaseUrl } from '../utils/getCurrentDomain';
import { useTranslation } from 'react-i18next';

const openGraphLocales: Record<string, string> = {
  ar: 'ar_SA',
  as: 'as_IN',
  bg: 'bg_BG',
  bn: 'bn_IN',
  cs: 'cs_CZ',
  de: 'de_DE',
  el: 'el_GR',
  en: 'en_US',
  es: 'es_ES',
  fa: 'fa_IR',
  fi: 'fi_FI',
  fr: 'fr_FR',
  gu: 'gu_IN',
  ha: 'ha_NG',
  he: 'he_IL',
  hi: 'hi_IN',
  hr: 'hr_HR',
  hu: 'hu_HU',
  id: 'id_ID',
  it: 'it_IT',
  ja: 'ja_JP',
  kn: 'kn_IN',
  ko: 'ko_KR',
  ml: 'ml_IN',
  mr: 'mr_IN',
  ms: 'ms_MY',
  my: 'my_MM',
  ne: 'ne_NP',
  nl: 'nl_NL',
  or: 'or_IN',
  pa: 'pa_IN',
  pl: 'pl_PL',
  pt: 'pt_PT',
  ro: 'ro_RO',
  ru: 'ru_RU',
  sr: 'sr_RS',
  sv: 'sv_SE',
  sw: 'sw_TZ',
  ta: 'ta_IN',
  te: 'te_IN',
  th: 'th_TH',
  tl: 'tl_PH',
  tr: 'tr_TR',
  uk: 'uk_UA',
  ur: 'ur_IN',
  vi: 'vi_VN',
  zh: 'zh_CN',
};

type LandingFaqItem = {
  Question: string;
  Answer: string;
};

export default function Landing() {
  const { t, i18n } = useTranslation();
  const landingKeywords = t('seo.landing.keywords', { returnObjects: true }) as string[];
  const geoFeatures = t('seo.landing.geoFeatures', { returnObjects: true }) as string[];
  const fallbackFaqs = t('sections.faq.fallbackItems', { returnObjects: true }) as LandingFaqItem[];
  const landingDescription = t('seo.landing.description');
  const locale = openGraphLocales[i18n.language] ?? i18n.language;

  // Generate GEO data for landing page
  const geoData = createOrganizationGEOData({
    name: "explorers",
    description: t('seo.landing.geoDescription'),
    url: getBaseUrl(),
    features: geoFeatures,
    industry: t('seo.landing.geoIndustry')
  });
  if (geoData.pageContext) {
    geoData.pageContext.summary = landingDescription;
  }
  if (geoData.aiDescription) {
    geoData.aiDescription.conversational = landingDescription;
  }
  if (geoData.enrichedContent) {
    geoData.enrichedContent.fullDescription = landingDescription;
  }
  if (geoData.aiDescription && Array.isArray(fallbackFaqs)) {
    geoData.aiDescription.qaFormat = fallbackFaqs.map((faq) => ({
      question: faq.Question,
      answer: faq.Answer,
    }));
  }

  return (
    <>
      <SEO
        title={t('seo.landing.title')}
        description={landingDescription}
        keywords={landingKeywords}
        canonical={createCanonicalUrl("/")}
        image={`${getBaseUrl()}/og-landing-image.jpg`}
        type="website"
        author="explorers Team"
        locale={locale}
        enableGEO={true}
        geoData={geoData}
      />

      <div className="landing-page min-h-screen w-full max-w-[100vw] overflow-x-hidden">
        <LandingHeader />
        <Hero />
        <ProductCategoriesSection />
        <CreateCustomize />
        <ShareAnywhere />
        <Analytics />
        {/* <ReferEarn /> */}
        <WhoIsFor />
        <Testimonials />
        <FAQ />
        {/* <Features /> */}
        <FinalCTA />
        <Footer />
      </div>
    </>
  );
}
