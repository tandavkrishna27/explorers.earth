/**
 * Country Code to Name Mapping Utility
 * 
 * This utility provides a centralized mapping of country codes to full country names
 * to avoid duplication across analytics components.
 * 
 * For i18n support, use getTranslatedCountryName which uses translation keys.
 */

export const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  'US': 'United States',
  'IN': 'India',
  'GB': 'United Kingdom',
  'CA': 'Canada',
  'AU': 'Australia',
  'DE': 'Germany',
  'FR': 'France',
  'IT': 'Italy',
  'ES': 'Spain',
  'BR': 'Brazil',
  'MX': 'Mexico',
  'JP': 'Japan',
  'CN': 'China',
  'RU': 'Russia',
  'KR': 'South Korea',
  'NL': 'Netherlands',
  'SE': 'Sweden',
  'NO': 'Norway',
  'DK': 'Denmark',
  'FI': 'Finland',
  'CH': 'Switzerland',
  'AT': 'Austria',
  'BE': 'Belgium',
  'PL': 'Poland',
  'CZ': 'Czech Republic',
  'HU': 'Hungary',
  'RO': 'Romania',
  'BG': 'Bulgaria',
  'GR': 'Greece',
  'PT': 'Portugal',
  'IE': 'Ireland',
  'IS': 'Iceland',
  'LU': 'Luxembourg',
  'MT': 'Malta',
  'CY': 'Cyprus',
  'EE': 'Estonia',
  'LV': 'Latvia',
  'LT': 'Lithuania',
  'SI': 'Slovenia',
  'SK': 'Slovakia',
  'HR': 'Croatia',
  'BA': 'Bosnia and Herzegovina',
  'RS': 'Serbia',
  'ME': 'Montenegro',
  'MK': 'North Macedonia',
  'AL': 'Albania',
  'XK': 'Kosovo',
  'MD': 'Moldova',
  'UA': 'Ukraine',
  'BY': 'Belarus',
  'GE': 'Georgia',
  'AM': 'Armenia',
  'AZ': 'Azerbaijan',
  'KZ': 'Kazakhstan',
  'UZ': 'Uzbekistan',
  'KG': 'Kyrgyzstan',
  'TJ': 'Tajikistan',
  'TM': 'Turkmenistan',
  'AF': 'Afghanistan',
  'PK': 'Pakistan',
  'BD': 'Bangladesh',
  'LK': 'Sri Lanka',
  'MV': 'Maldives',
  'NP': 'Nepal',
  'BT': 'Bhutan',
  'MM': 'Myanmar',
  'TH': 'Thailand',
  'LA': 'Laos',
  'KH': 'Cambodia',
  'VN': 'Vietnam',
  'MY': 'Malaysia',
  'SG': 'Singapore',
  'BN': 'Brunei',
  'ID': 'Indonesia',
  'PH': 'Philippines',
  'TL': 'East Timor',
  'MN': 'Mongolia',
  'KP': 'North Korea',
  'TW': 'Taiwan',
  'HK': 'Hong Kong',
  'MO': 'Macau',
  'SA': 'Saudi Arabia',
  'AE': 'United Arab Emirates',
  'QA': 'Qatar',
  'KW': 'Kuwait',
  'BH': 'Bahrain',
  'OM': 'Oman',
  'YE': 'Yemen',
  'IQ': 'Iraq',
  'IR': 'Iran',
  'SY': 'Syria',
  'LB': 'Lebanon',
  'JO': 'Jordan',
  'IL': 'Israel',
  'PS': 'Palestine',
  'TR': 'Turkey',
  'EG': 'Egypt',
  'LY': 'Libya',
  'TN': 'Tunisia',
  'DZ': 'Algeria',
  'MA': 'Morocco',
  'SD': 'Sudan',
  'SS': 'South Sudan',
  'ET': 'Ethiopia',
  'ER': 'Eritrea',
  'DJ': 'Djibouti',
  'SO': 'Somalia',
  'KE': 'Kenya',
  'UG': 'Uganda',
  'TZ': 'Tanzania',
  'RW': 'Rwanda',
  'BI': 'Burundi',
  'MW': 'Malawi',
  'ZM': 'Zambia',
  'ZW': 'Zimbabwe',
  'BW': 'Botswana',
  'NA': 'Namibia',
  'ZA': 'South Africa',
  'LS': 'Lesotho',
  'SZ': 'Eswatini',
  'MG': 'Madagascar',
  'MU': 'Mauritius',
  'SC': 'Seychelles',
  'KM': 'Comoros',
  'MZ': 'Mozambique',
  'AO': 'Angola',
  'CD': 'Democratic Republic of the Congo',
  'CG': 'Republic of the Congo',
  'CF': 'Central African Republic',
  'TD': 'Chad',
  'CM': 'Cameroon',
  'NG': 'Nigeria',
  'NE': 'Niger',
  'ML': 'Mali',
  'BF': 'Burkina Faso',
  'CI': 'Ivory Coast',
  'GH': 'Ghana',
  'TG': 'Togo',
  'BJ': 'Benin',
  'SN': 'Senegal',
  'GM': 'Gambia',
  'GW': 'Guinea-Bissau',
  'GN': 'Guinea',
  'SL': 'Sierra Leone',
  'LR': 'Liberia',
  'MR': 'Mauritania',
  'CV': 'Cape Verde',
  'ST': 'São Tomé and Príncipe',
  'GQ': 'Equatorial Guinea',
  'GA': 'Gabon',
  'AR': 'Argentina',
  'BO': 'Bolivia',
  'CL': 'Chile',
  'CO': 'Colombia',
  'EC': 'Ecuador',
  'FK': 'Falkland Islands',
  'GF': 'French Guiana',
  'GY': 'Guyana',
  'PY': 'Paraguay',
  'PE': 'Peru',
  'SR': 'Suriname',
  'UY': 'Uruguay',
  'VE': 'Venezuela',
  'CU': 'Cuba',
  'JM': 'Jamaica',
  'HT': 'Haiti',
  'DO': 'Dominican Republic',
  'PR': 'Puerto Rico',
  'TT': 'Trinidad and Tobago',
  'BB': 'Barbados',
  'LC': 'Saint Lucia',
  'VC': 'Saint Vincent and the Grenadines',
  'GD': 'Grenada',
  'AG': 'Antigua and Barbuda',
  'KN': 'Saint Kitts and Nevis',
  'DM': 'Dominica',
  'BS': 'Bahamas',
  'BZ': 'Belize',
  'GT': 'Guatemala',
  'SV': 'El Salvador',
  'HN': 'Honduras',
  'NI': 'Nicaragua',
  'CR': 'Costa Rica',
  'PA': 'Panama',
  'NZ': 'New Zealand',
  'FJ': 'Fiji',
  'PG': 'Papua New Guinea',
  'SB': 'Solomon Islands',
  'VU': 'Vanuatu',
  'NC': 'New Caledonia',
  'PF': 'French Polynesia',
  'WS': 'Samoa',
  'TO': 'Tonga',
  'KI': 'Kiribati',
  'TV': 'Tuvalu',
  'NR': 'Nauru',
  'PW': 'Palau',
  'FM': 'Micronesia',
  'MH': 'Marshall Islands',
  'GL': 'Greenland',
  'EH': 'Western Sahara',
  'AQ': 'Antarctica',
  'TF': 'French Southern Territories',
};

/**
 * Get full country name from country code (English fallback)
 * @param countryCode - The country code (e.g., 'US', 'IN')
 * @returns Full country name or original code if not found
 */
export const getCountryName = (countryCode: string): string => {
  return COUNTRY_CODE_TO_NAME[countryCode] || countryCode;
};

/**
 * Get translated country name from country code using i18n
 * @param countryCode - The country code (e.g., 'US', 'IN')
 * @param t - Translation function from useTranslation hook
 * @returns Translated country name or English fallback
 */
export const getTranslatedCountryName = (countryCode: string, t: (key: string) => string): string => {
  const translationKey = `countries.${countryCode}`;
  const translated = t(translationKey);
  // If translation key doesn't exist, fallback to English
  if (translated === translationKey) {
    return getCountryName(countryCode);
  }
  return translated;
};

/**
 * ISO 3166-1 numeric id (the `id` of every country in the world-atlas topology) to the
 * alpha-2 code the analytics events carry. Matching the map by id instead of by display
 * name keeps shading right where the topology spells a name differently ("Czechia",
 * "Dem. Rep. Congo", "eSwatini").
 */
export const ISO_NUMERIC_TO_ALPHA2: Record<string, string> = {
  '004': 'AF', '008': 'AL', '010': 'AQ', '012': 'DZ', '024': 'AO', '031': 'AZ', '032': 'AR', '036': 'AU', '040': 'AT',
  '044': 'BS', '050': 'BD', '051': 'AM', '056': 'BE', '064': 'BT', '068': 'BO', '070': 'BA', '072': 'BW', '076': 'BR',
  '084': 'BZ', '090': 'SB', '096': 'BN', '100': 'BG', '104': 'MM', '108': 'BI', '112': 'BY', '116': 'KH', '120': 'CM',
  '124': 'CA', '140': 'CF', '144': 'LK', '148': 'TD', '152': 'CL', '156': 'CN', '158': 'TW', '170': 'CO', '178': 'CG',
  '180': 'CD', '188': 'CR', '191': 'HR', '192': 'CU', '196': 'CY', '203': 'CZ', '204': 'BJ', '208': 'DK', '214': 'DO',
  '218': 'EC', '222': 'SV', '226': 'GQ', '231': 'ET', '232': 'ER', '233': 'EE', '238': 'FK', '242': 'FJ', '246': 'FI',
  '250': 'FR', '260': 'TF', '262': 'DJ', '266': 'GA', '268': 'GE', '270': 'GM', '275': 'PS', '276': 'DE', '288': 'GH',
  '300': 'GR', '304': 'GL', '320': 'GT', '324': 'GN', '328': 'GY', '332': 'HT', '340': 'HN', '348': 'HU', '352': 'IS',
  '356': 'IN', '360': 'ID', '364': 'IR', '368': 'IQ', '372': 'IE', '376': 'IL', '380': 'IT', '384': 'CI', '388': 'JM',
  '392': 'JP', '398': 'KZ', '400': 'JO', '404': 'KE', '408': 'KP', '410': 'KR', '414': 'KW', '417': 'KG', '418': 'LA',
  '422': 'LB', '426': 'LS', '428': 'LV', '430': 'LR', '434': 'LY', '440': 'LT', '442': 'LU', '450': 'MG', '454': 'MW',
  '458': 'MY', '466': 'ML', '478': 'MR', '484': 'MX', '496': 'MN', '498': 'MD', '499': 'ME', '504': 'MA', '508': 'MZ',
  '512': 'OM', '516': 'NA', '524': 'NP', '528': 'NL', '540': 'NC', '554': 'NZ', '558': 'NI', '562': 'NE', '566': 'NG',
  '578': 'NO', '586': 'PK', '591': 'PA', '598': 'PG', '600': 'PY', '604': 'PE', '608': 'PH', '616': 'PL', '620': 'PT',
  '624': 'GW', '626': 'TL', '630': 'PR', '634': 'QA', '642': 'RO', '643': 'RU', '646': 'RW', '682': 'SA', '686': 'SN',
  '688': 'RS', '694': 'SL', '703': 'SK', '704': 'VN', '705': 'SI', '706': 'SO', '710': 'ZA', '716': 'ZW', '724': 'ES',
  '728': 'SS', '729': 'SD', '732': 'EH', '740': 'SR', '748': 'SZ', '752': 'SE', '756': 'CH', '760': 'SY', '762': 'TJ',
  '764': 'TH', '768': 'TG', '780': 'TT', '784': 'AE', '788': 'TN', '792': 'TR', '795': 'TM', '800': 'UG', '804': 'UA',
  '807': 'MK', '818': 'EG', '826': 'GB', '834': 'TZ', '840': 'US', '854': 'BF', '858': 'UY', '860': 'UZ', '862': 'VE',
  '887': 'YE', '894': 'ZM',
};

// Other spellings of a country that events and the topology use.
const COUNTRY_NAME_ALIASES: Record<string, string> = {
  uk: 'GB', 'great britain': 'GB', england: 'GB', 'united states of america': 'US', usa: 'US', 'u.s.': 'US',
  czechia: 'CZ', 'dem. rep. congo': 'CD', 'democratic republic of congo': 'CD', congo: 'CG', 'dominican rep.': 'DO',
  'falkland is.': 'FK', 'fr. s. antarctic lands': 'TF', "côte d'ivoire": 'CI', "cote d'ivoire": 'CI', 'central african rep.': 'CF',
  'eq. guinea': 'GQ', eswatini: 'SZ', swaziland: 'SZ', 'solomon is.': 'SB', 'bosnia and herz.': 'BA', macedonia: 'MK',
  's. sudan': 'SS', 'w. sahara': 'EH', 'timor-leste': 'TL', 'russian federation': 'RU', 'south korea': 'KR',
  'korea, republic of': 'KR', 'north korea': 'KP', burma: 'MM', 'viet nam': 'VN', 'türkiye': 'TR', turkey: 'TR',
  kosovo: 'XK',
};
const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_CODE_TO_NAME).map(([code, name]) => [name.toLowerCase(), code]),
);

/**
 * The alpha-2 code for whatever an event carries as its country: a code in any case, "UK",
 * an ISO numeric id, or an English name. Anything unrecognised (such as "Local") comes back
 * trimmed and unchanged, so it is still counted but never shaded.
 */
export const normalizeCountryKey = (raw: string): string => {
  const value = raw.trim();
  if (!value) return value;
  const upper = value.toUpperCase();
  if (upper === 'UK') return 'GB';
  if (COUNTRY_CODE_TO_NAME[upper]) return upper;
  if (ISO_NUMERIC_TO_ALPHA2[value]) return ISO_NUMERIC_TO_ALPHA2[value];
  const lower = value.toLowerCase();
  return NAME_TO_CODE[lower] ?? COUNTRY_NAME_ALIASES[lower] ?? value;
};

/** The alpha-2 code of a world-atlas feature: by numeric id, else by name (Kosovo has no id). */
export const countryCodeForGeography = (geo: { id?: string | number; properties?: { name?: string } }): string | undefined => {
  if (geo.id !== undefined && geo.id !== null) {
    const byId = ISO_NUMERIC_TO_ALPHA2[String(geo.id).padStart(3, '0')];
    if (byId) return byId;
  }
  const name = geo.properties?.name;
  if (!name) return undefined;
  const code = normalizeCountryKey(name);
  return COUNTRY_CODE_TO_NAME[code] ? code : undefined;
};
