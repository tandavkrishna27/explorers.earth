import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';
import en from '../resources/en.json';
import es from '../resources/es.json';
import fr from '../resources/fr.json';
import ar from '../resources/ar.json';
import he from '../resources/he.json';
import de from '../resources/de.json';
import hi from '../resources/hi.json';
import it_ from '../resources/it.json';
import pt from '../resources/pt.json';

// I18N-X01 (analytics): the owner Analytics charts hard-coded English titles, legends, tooltips,
// empty states and "Analytics Summary" blocks, so the Spanish dashboard still read "Views".
const dig = (source: any, key: string) => key.split('.').reduce((value, part) => value?.[part], source);
const MAINTAINED: Record<string, any> = { es, fr, ar, he, de, hi, it: it_, pt };

const D = 'analytics.dashboard.';
const media = ['movies', 'books', 'games'].flatMap((c) =>
  ['listsTitle', 'listsSubtitle', 'itemsTitle', 'itemsSubtitle', 'noEngagement', 'engagementHint', 'noClickData',
    'clickEvents', 'itemsHint', 'shown', 'avgClicks', 'noActivity', 'unique', 'topClicked', 'allClicked']
    .map((k) => `media.${c}.${k}`));
const analyticsKeys = [
  ...['selectList', 'selectListPlaceholder', 'allLists', 'clicksByList', 'totalLists', 'totalViews', 'totalClicks',
    'totalItemClicks', 'itemClicks', 'pageViews', 'views', 'clicks', 'opens', 'allClicksSeries', 'listClicksSeries',
    'date', 'clicksValue', 'noClickDataForList', 'listsWithClickData', 'analyticsSummary', 'unknown'].map((k) => `common.${k}`),
  ...['places', 'profile', 'movies', 'books', 'games', 'guides'].map((k) => `categories.${k}`),
  ...['title', 'subtitle', 'empty', 'emptyHint', 'mediaViews', 'viewsAndClicksByPage', 'mostClickedItems', 'pageBreakdown', 'pageCounts']
    .map((k) => `charts.contentEngagement.${k}`),
  ...['title', 'subtitle', 'empty', 'emptyHint', 'guideOpens', 'uniqueGuides', 'mostOpened', 'allOpened'].map((k) => `charts.guides.${k}`),
  ...['title', 'subtitle', 'empty'].map((k) => `charts.pageViewsTrend.${k}`),
  ...['recordsWithLocationId', 'uniqueLocations', 'totalViewEvents', 'willAppear'].map((k) => `charts.locationEngagement.${k}`),
  'charts.worldMap.noGeographicDescription',
  ...media,
  // Keys that already existed in en but were missing from the maintained locales.
  'dateRange.maxRange', 'dateRange.endBeforeStart', 'emptyState.customRange.endBeforeStart', 'emptyState.customRange.tooLong',
  'emptyState.unavailableTitle', 'emptyState.unavailableMessage', 'error.retry', 'untitledList',
].map((k) => D + k);
const pluralKeys = [
  'common.listClicks', 'common.clickCount', 'common.openCount', 'charts.guides.viewsNoOpens',
  ...['movies', 'books', 'games'].map((c) => `media.${c}.viewsNoClicks`),
].map((k) => D + k);
// Same word in the language as in English.
const SAME_AS_ENGLISH = new Set<string>([]);

const exists = (value: unknown) => typeof value === 'string' && value.length > 0;

describe('maintained locales translate the analytics chart strings (I18N-X01)', () => {
  it.each(Object.keys(MAINTAINED))('%s has every analytics key with a non-English value', (lang) => {
    for (const key of analyticsKeys) {
      const english = dig(en, key);
      const value = dig(MAINTAINED[lang], key);
      expect(exists(english), `${key} missing in en`).toBe(true);
      expect(exists(value), `${key} missing in ${lang}`).toBe(true);
      if (!SAME_AS_ENGLISH.has(key)) expect(value, `${key} still English in ${lang}`).not.toBe(english);
    }
  });

  it.each(Object.keys(MAINTAINED))('%s translates the pluralised analytics counts', (lang) => {
    for (const key of pluralKeys) {
      for (const form of ['one', 'other']) {
        const english = dig(en, `${key}_${form}`);
        const value = dig(MAINTAINED[lang], `${key}_${form}`);
        expect(exists(english), `${key}_${form} missing in en`).toBe(true);
        expect(exists(value), `${key}_${form} missing in ${lang}`).toBe(true);
        expect(value, `${key}_${form} still English in ${lang}`).not.toBe(english);
        // Arabic and Hebrew spell out "one" in words, so only the general form must carry the number.
        if (form === 'other') expect(value).toContain('{{count}}');
      }
    }
  });

  it('Arabic and Hebrew carry their extra plural forms', () => {
    for (const key of pluralKeys) {
      for (const form of ['zero', 'two', 'few', 'many']) expect(exists(dig(ar, `${key}_${form}`)), `${key}_${form} in ar`).toBe(true);
      expect(exists(dig(he, `${key}_two`)), `${key}_two in he`).toBe(true);
    }
  });

  it('the Spanish legend says Vistas, not Views', async () => {
    const i18n = createInstance();
    await i18n.init({ lng: 'es', fallbackLng: 'en', resources: { en: { translation: en }, es: { translation: es } } });
    expect(i18n.t(`${D}common.views`)).not.toBe('Views');
    expect(i18n.t(`${D}common.clickCount`, { count: 2 })).toBe('2 clics');
  });
});

describe('analytics components carry no hard-coded English copy', () => {
  const dir = resolve(__dirname, '../../features/Analytics/components');
  const files = [
    ...readdirSync(dir).filter((f) => f.endsWith('.tsx')).map((f) => resolve(dir, f)),
    ...readdirSync(resolve(dir, 'charts')).filter((f) => f.endsWith('.tsx')).map((f) => resolve(dir, 'charts', f)),
  ];
  const LITERALS = [
    "'All Sources'", "'Direct'", "'QR Code'", "label: 'Instagram'", 'Select Traffic Source:', 'No Traffic Data Available',
    'Analytics Summary:', 'total view events', 'events with UTM source', 'direct traffic events',
    'name="Views"', 'name="Page Views"', 'name="Clicks"', 'name="Opens"', 'dataKey="Views"', 'dataKey="Clicks"', 'Views:</',
    'Total Views', 'Total Clicks', 'Total Locations', 'Avg Views/Location', 'All Locations', "'Select Location'", 'Select Location:',
    'No location view data available', 'records with Location ID', '} views)', "'Location'", '`Date: ', '>Date: ',
    'Places Shown', 'Avg Clicks/Place', '>Category: ', '>Clicks: ', "'Unknown Place'", "'Unknown Category'", '} places)',
    'No recommended places data available', 'Please select a location', 'No recommendation clicks found',
    'No Social Media Interaction Data', 'Avg Clicks/Platform', '>Platforms<', 'total social media clicks',
    'Country Data Unavailable', 'Resolving country data', 'events with country data', 'pending geolocation', '`Country: ',
    'No Geographic Data Available', 'countries with views', '>Low<', '>Medium<', '>High<', '>Highest<', '} views',
    '>Content Page Performance<', '>Engagement with Movie Lists<', '>Engagement with Book Lists<', '>Engagement with Game Lists<',
    'Clicked within a List<', 'Select a list to see', '>Travel Guides<', '>Daily Views Trend by Section<', 'Track views &amp; clicks',
    "label: 'Movies'", "label: 'Books'", "label: 'Games'", "label: 'Guides'", "label: 'Places'", "label: 'Profile'",
    'pageLabel="', 'itemLabel="', 'No media page activity', 'Media Views', 'Item Clicks', 'Views &amp; Clicks by Page',
    'Most Clicked Items', 'Page Breakdown', "click{", "open{", "view{", 'No guides page activity', 'Guide Opens', 'Unique Guides',
    'Most Opened Guides', 'All Opened Guides', 'Not enough data to show trends', 'Select List:', "'Select a list'", "'All Lists'",
    'Clicks by List', 'Total Lists', 'Total Item Clicks', 'No click data for this list', 'lists with click data', 'Shown<',
    'Avg Clicks /', 'engagement data yet', 'click data available', 'page activity yet', 'Most Clicked {', 'All Clicked',
    "'en-US'", "?? 'Unknown'", '"Unknown"',
  ];
  it.each(files.map((f) => [f.split(/[\\/]/).pop()!, f]))('%s has no English literals', (_name, file) => {
    const source = readFileSync(file, 'utf8');
    for (const literal of LITERALS) expect(source, `${literal} still in source`).not.toContain(literal);
  });
});
