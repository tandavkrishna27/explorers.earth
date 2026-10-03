import { isCanonicalRuntime, getPublicRuntimeConfig } from "../lib/publicRuntimeConfig";
import { Helmet } from 'react-helmet-async';
import { GEOData } from '../types/geoTypes';
import { getBaseUrl } from '../utils/getCurrentDomain';

// TypeScript interface for SEO component props (extended with GEO)
export interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string[];
  author?: string;
  canonical?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'profile' | 'product';
  siteName?: string;
  locale?: string;
  twitterHandle?: string;
  noIndex?: boolean;
  noFollow?: boolean;

  // GEO Enhancement Props (optional for backward compatibility)
  geoData?: GEOData;
  enableGEO?: boolean;

  // Breadcrumb navigation for search results
  breadcrumbs?: Array<{ name: string; url: string }>;
}

// Default fallback values - using dynamic URLs
const getDefaultSEO = () => {
  const baseUrl = getBaseUrl();
  return {
    title: 'explorers - Share Your Favorite Places with QR Codes',
    description: 'Create personalized QR codes and shareable links for your favorite places and recommendations. Transform local knowledge into shareable digital experiences.',
    keywords: ['QR codes', 'local recommendations', 'place sharing', 'travel', 'local business', 'digital guide', 'location sharing'],
    author: 'explorers Team',
    canonical: baseUrl,
    image: `${baseUrl}/og-image.jpg`,
    url: baseUrl,
    type: 'website' as const,
    siteName: 'explorers',
    locale: 'en_US',
    twitterHandle: '@explorers',
    noIndex: false,
    noFollow: false,
  };
};

/**
 * SEO Component for managing meta tags, Open Graph, and Twitter Cards
 * 
 * @param props - SEO configuration props
 * @returns JSX element with Helmet containing all meta tags
 */
// GEO Helper Functions
const generateAIMetaTags = (geoData: GEOData) => {
  const tags: Record<string, string> = {};

  if (geoData.pageContext) {
    tags['ai:page-type'] = geoData.pageContext.type;
    if (geoData.pageContext.primaryEntity) {
      tags['ai:primary-entity'] = geoData.pageContext.primaryEntity;
    }
    if (geoData.pageContext.summary) {
      tags['ai:content-summary'] = geoData.pageContext.summary;
    }
    if (geoData.pageContext.intent) {
      tags['ai:user-intent'] = geoData.pageContext.intent;
    }
  }

  if (geoData.naturalLanguage?.commonQueries) {
    tags['ai:common-queries'] = geoData.naturalLanguage.commonQueries.join(' | ');
  }

  if (geoData.naturalLanguage?.conversationalKeywords) {
    tags['ai:conversational-keywords'] = geoData.naturalLanguage.conversationalKeywords.join(', ');
  }

  if (geoData.naturalLanguage?.entities) {
    tags['ai:entities'] = geoData.naturalLanguage.entities.join(', ');
  }

  if (geoData.contextualData?.location) {
    tags['ai:location-context'] = JSON.stringify(geoData.contextualData.location);
  }

  return tags;
};

const generateEnhancedStructuredData = (seoData: Record<string, any>, geoData?: GEOData) => {
  if (!geoData || !geoData.pageContext) return null;

  const baseStructuredData: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": getSchemaType(geoData.pageContext.type),
    name: seoData.title,
    description: geoData.enrichedContent?.fullDescription || seoData.description,
    url: seoData.url
  };

  // Add location-specific data
  if (geoData.contextualData?.location) {
    const location = geoData.contextualData.location;
    baseStructuredData.location = {
      "@type": "Place",
      name: location.name,
      address: location.address
    };

    if (location.coordinates) {
      baseStructuredData.location.geo = {
        "@type": "GeoCoordinates",
        latitude: location.coordinates.lat,
        longitude: location.coordinates.lng
      };
    }
  }

  // Add temporal context
  if (geoData.contextualData?.temporal?.operatingHours) {
    baseStructuredData.openingHours = geoData.contextualData.temporal.operatingHours;
  }

  // Add relationship data
  if (geoData.contextualData?.relationships) {
    const relationships = geoData.contextualData.relationships;
    if (relationships.recommendedBy) {
      baseStructuredData.author = {
        "@type": "Person",
        name: relationships.recommendedBy
      };
    }
    if (relationships.categories) {
      baseStructuredData.category = relationships.categories;
    }
  }

  // Add FAQ structured data if available
  if (geoData.aiDescription?.qaFormat && geoData.aiDescription.qaFormat.length > 0) {
    baseStructuredData.mainEntity = {
      "@type": "FAQPage",
      mainEntity: geoData.aiDescription.qaFormat.map(qa => ({
        "@type": "Question",
        name: qa.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: qa.answer
        }
      }))
    };
  }

  return baseStructuredData;
};

const getSchemaType = (pageType: string): string => {
  switch (pageType) {
    case 'profile': return 'Person';
    case 'location': return 'TouristDestination';
    case 'place': return 'LocalBusiness';
    case 'map': return 'Map';
    case 'recommendations': return 'ItemList';
    default: return 'WebPage';
  }
};

const SEO: React.FC<SEOProps> = ({
  title,
  description,
  keywords = [],
  author,
  canonical,
  image,
  url,
  type = 'website',
  siteName,
  locale,
  twitterHandle,
  noIndex = false,
  noFollow = false,
  geoData,
  enableGEO = false,
  breadcrumbs,
}) => {


  // Get dynamic defaults and merge props with defaults
  const defaultSEO = getDefaultSEO();
  const seoData = {
    title: title || defaultSEO.title,
    description: description || defaultSEO.description,
    keywords: keywords.length > 0 ? keywords : defaultSEO.keywords,
    author: author || defaultSEO.author,
    canonical: canonical || defaultSEO.canonical,
    image: image || defaultSEO.image,
    url: url || canonical || defaultSEO.url,
    type: type || defaultSEO.type,
    siteName: siteName || defaultSEO.siteName,
    locale: locale || defaultSEO.locale,
    twitterHandle: twitterHandle || defaultSEO.twitterHandle,
  };

  // Create robots meta content
  const robotsContent = [];
  if (noIndex || (isCanonicalRuntime() && getPublicRuntimeConfig().environment === 'qa')) robotsContent.push('noindex');
  if (noFollow || (isCanonicalRuntime() && getPublicRuntimeConfig().environment === 'qa')) robotsContent.push('nofollow');
  if (robotsContent.length === 0) robotsContent.push('index', 'follow');

  // GEO Processing - Generate AI-optimized metadata
  const aiMetaTags = enableGEO && geoData ? generateAIMetaTags(geoData) : {};
  const enhancedStructuredData = enableGEO && geoData ? generateEnhancedStructuredData(seoData, geoData) : null;

  // Enhanced keywords for AI understanding
  const enhancedKeywords = enableGEO && geoData ? [
    ...seoData.keywords,
    ...(geoData.naturalLanguage?.conversationalKeywords || []),
    ...(geoData.naturalLanguage?.entities || [])
  ].filter((keyword, index, self) => self.indexOf(keyword) === index) : seoData.keywords;

  // Enhanced description for AI comprehension
  const enhancedDescription = enableGEO && geoData?.aiDescription?.conversational
    ? geoData.aiDescription.conversational
    : seoData.description;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{seoData.title}</title>
      <meta name="description" content={enhancedDescription} />
      <meta name="keywords" content={enhancedKeywords.join(', ')} />
      <meta name="author" content={seoData.author} />
      <meta name="robots" content={robotsContent.join(', ')} />
      <link rel="canonical" href={seoData.canonical} />

      {/* GEO: AI-Specific Meta Tags for LLM Understanding */}
      {enableGEO && Object.entries(aiMetaTags).map(([key, value]) => (
        <meta key={key} name={key} content={value} />
      ))}

      {/* GEO: Enhanced content summary for AI */}
      {enableGEO && geoData?.pageContext?.summary && (
        <meta name="ai:content-summary" content={geoData.pageContext.summary} />
      )}

      {/* GEO: Question-answer format for AI understanding */}
      {enableGEO && geoData?.aiDescription?.qaFormat && (
        <meta name="ai:qa-content" content={geoData.aiDescription.qaFormat.map(qa => `Q: ${qa.question} A: ${qa.answer}`).join(' | ')} />
      )}

      {/* Language and Locale */}
      <meta httpEquiv="content-language" content={seoData.locale.replace('_', '-')} />
      <meta name="language" content={seoData.locale.split('_')[0]} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={seoData.type} />
      <meta property="og:title" content={seoData.title} />
      <meta property="og:description" content={enhancedDescription} />
      <meta property="og:image" content={seoData.image} />
      <meta property="og:url" content={seoData.url} />
      <meta property="og:site_name" content={seoData.siteName} />
      <meta property="og:locale" content={seoData.locale} />

      {/* GEO: Enhanced Open Graph for AI context */}
      {enableGEO && geoData?.contextualData?.location && (
        <>
          <meta property="og:locality" content={geoData.contextualData.location.name} />
          <meta property="og:region" content={geoData.contextualData.location.address} />
          {geoData.contextualData.location.coordinates && (
            <>
              <meta property="og:latitude" content={geoData.contextualData.location.coordinates.lat.toString()} />
              <meta property="og:longitude" content={geoData.contextualData.location.coordinates.lng.toString()} />
            </>
          )}
        </>
      )}

      {/* Open Graph Image Properties */}
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:type" content="image/jpeg" />
      <meta property="og:image:alt" content={seoData.title} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={seoData.twitterHandle} />
      <meta name="twitter:creator" content={seoData.twitterHandle} />
      <meta name="twitter:title" content={seoData.title} />
      <meta name="twitter:description" content={enhancedDescription} />
      <meta name="twitter:image" content={seoData.image} />
      <meta name="twitter:image:alt" content={seoData.title} />

      {/* Additional Meta Tags for Better SEO */}
      <meta name="theme-color" content="#8128d8" />
      <meta name="msapplication-TileColor" content="#8128d8" />
      <meta name="application-name" content={seoData.siteName} />

      {/* Prevent duplicate content */}
      <meta name="referrer" content="origin-when-cross-origin" />

      {/* Mobile Optimization */}
      <meta name="format-detection" content="telephone=no" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <meta name="apple-mobile-web-app-title" content={seoData.siteName} />

      {/* Structured Data for Organization */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: seoData.siteName,
          description: seoData.description,
          url: seoData.url,
          logo: seoData.image,
          sameAs: [
            "https://twitter.com/explorers",
            "https://instagram.com/explorers",
            "https://linkedin.com/company/explorers"
          ],
          contactPoint: {
            "@type": "ContactPoint",
            email: `hello@${getBaseUrl().replace(/https?:\/\//, '')}`,
            contactType: "customer service"
          }
        })}
      </script>

      {/* Website Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: seoData.siteName,
          description: enhancedDescription,
          url: seoData.url,
          potentialAction: {
            "@type": "SearchAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: `${seoData.url}/search?q={search_term_string}`
            },
            "query-input": "required name=search_term_string"
          }
        })}
      </script>

      {/* GEO: Enhanced Structured Data for AI Understanding */}
      {enableGEO && enhancedStructuredData && (
        <script type="application/ld+json">
          {JSON.stringify(enhancedStructuredData)}
        </script>
      )}

      {/* GEO: Contextual Information for AI */}
      {enableGEO && geoData?.enrichedContent && (
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: seoData.title,
            description: geoData.enrichedContent.fullDescription,
            benefits: geoData.enrichedContent.benefits,
            uniqueAspects: geoData.enrichedContent.uniqueAspects,
            userExperience: geoData.enrichedContent.userExperience,
            recommendations: geoData.enrichedContent.recommendations
          })}
        </script>
      )}

      {/* Breadcrumb Navigation Schema */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: breadcrumbs.map((crumb, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: crumb.name,
              item: `${getBaseUrl()}${crumb.url}`,
            })),
          })}
        </script>
      )}
    </Helmet>
  );
};

export default SEO;
