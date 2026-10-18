import { memo, useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDown, Search } from "lucide-react";
import { persistAccountLocale } from "../../../lib/accountLocale";

// Language configuration with flags and display names
const LANGUAGES = [
  { code: "en", flag: "🇺🇸", name: "English", nativeName: "English" },
  { code: "es", flag: "🇪🇸", name: "Español", nativeName: "Spanish" },
  { code: "fr", flag: "🇫🇷", name: "Français", nativeName: "French" },
  { code: "zh", flag: "🇨🇳", name: "中文", nativeName: "Chinese" },
  { code: "ar", flag: "🇸🇦", name: "العربية", nativeName: "Arabic" },
  { code: "pt", flag: "🇵🇹", name: "Português", nativeName: "Portuguese" },
  { code: "ru", flag: "🇷🇺", name: "Русский", nativeName: "Russian" },
  { code: "de", flag: "🇩🇪", name: "Deutsch", nativeName: "German" },
  { code: "ja", flag: "🇯🇵", name: "日本語", nativeName: "Japanese" },
  { code: "ko", flag: "🇰🇷", name: "한국어", nativeName: "Korean" },
  { code: "tr", flag: "🇹🇷", name: "Türkçe", nativeName: "Turkish" },
  { code: "it", flag: "🇮🇹", name: "Italiano", nativeName: "Italian" },
  { code: "vi", flag: "🇻🇳", name: "Tiếng Việt", nativeName: "Vietnamese" },
  { code: "pl", flag: "🇵🇱", name: "Polski", nativeName: "Polish" },
  { code: "nl", flag: "🇳🇱", name: "Nederlands", nativeName: "Dutch" },
  {
    code: "id",
    flag: "🇮🇩",
    name: "Bahasa Indonesia",
    nativeName: "Indonesian",
  },
  { code: "sv", flag: "🇸🇪", name: "Svenska", nativeName: "Swedish" },
  { code: "uk", flag: "🇺🇦", name: "Українська", nativeName: "Ukrainian" },
  { code: "el", flag: "🇬🇷", name: "Ελληνικά", nativeName: "Greek" },
  { code: "cs", flag: "🇨🇿", name: "Čeština", nativeName: "Czech" },
  { code: "ro", flag: "🇷🇴", name: "Română", nativeName: "Romanian" },
  { code: "ms", flag: "🇲🇾", name: "Bahasa Melayu", nativeName: "Malay" },
  { code: "fa", flag: "🇮🇷", name: "فارسی", nativeName: "Persian" },
  { code: "th", flag: "🇹🇭", name: "ไทย", nativeName: "Thai" },
  { code: "ha", flag: "🇳🇬", name: "Hausa", nativeName: "Hausa" },
  { code: "sw", flag: "🇹🇿", name: "Kiswahili", nativeName: "Swahili" },
  { code: "tl", flag: "🇵🇭", name: "Filipino", nativeName: "Filipino" },
  { code: "my", flag: "🇲🇲", name: "မြန်မာ", nativeName: "Burmese" },
  { code: "he", flag: "🇮🇱", name: "עברית", nativeName: "Hebrew" },
  { code: "hu", flag: "🇭🇺", name: "Magyar", nativeName: "Hungarian" },
  { code: "bg", flag: "🇧🇬", name: "Български", nativeName: "Bulgarian" },
  { code: "sr", flag: "🇷🇸", name: "Српски", nativeName: "Serbian" },
  { code: "hr", flag: "🇭🇷", name: "Hrvatski", nativeName: "Croatian" },
  { code: "fi", flag: "🇫🇮", name: "Suomi", nativeName: "Finnish" },
  { code: "hi", flag: "🇮🇳", name: "हिन्दी", nativeName: "Hindi" },
  { code: "bn", flag: "🇮🇳", name: "বাংলা", nativeName: "Bengali" },
  { code: "te", flag: "🇮🇳", name: "తెలుగు", nativeName: "Telugu" },
  { code: "mr", flag: "🇮🇳", name: "मराठी", nativeName: "Marathi" },
  { code: "ta", flag: "🇮🇳", name: "தமிழ்", nativeName: "Tamil" },
  { code: "ur", flag: "🇮🇳", name: "اردو", nativeName: "Urdu" },
  { code: "gu", flag: "🇮🇳", name: "ગુજરાતી", nativeName: "Gujarati" },
  { code: "kn", flag: "🇮🇳", name: "ಕನ್ನಡ", nativeName: "Kannada" },
  { code: "or", flag: "🇮🇳", name: "ଓଡ଼ିଆ", nativeName: "Oriya" },
  { code: "ml", flag: "🇮🇳", name: "മലയാളം", nativeName: "Malayalam" },
  { code: "pa", flag: "🇮🇳", name: "ਪੰਜਾਬੀ", nativeName: "Punjabi" },
  { code: "as", flag: "🇮🇳", name: "অসমীয়া", nativeName: "Assamese" },
  { code: "ne", flag: "🇳🇵", name: "नेपाली", nativeName: "Nepali" },
];

const LanguageSelector = memo(() => {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dropdownPosition, setDropdownPosition] = useState<'below' | 'above'>('below');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Handle language change
  const handleLanguageChange = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
    void persistAccountLocale(languageCode);
    const selectedLanguage = LANGUAGES.find(
      (lang) => lang.code === languageCode
    );
    toast.success(
      t("settings.languagePreference.languageChanged", {
        name: selectedLanguage?.name || languageCode,
      })
    );
    setIsOpen(false);
    setSearchTerm("");
  };

  // Get current language details
  const currentLanguage =
    LANGUAGES.find((lang) => lang.code === i18n.language) || LANGUAGES[0];

  // Filter languages based on search term
  const filteredLanguages = LANGUAGES.filter((language) =>
    language.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    language.nativeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    language.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate dropdown position based on available space
  const calculateDropdownPosition = () => {
    if (!triggerRef.current) return;
    
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    const dropdownHeight = 320; // Approximate height of dropdown
    
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      setDropdownPosition('above');
    } else {
      setDropdownPosition('below');
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setSearchTerm("");
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [isOpen]);

  // Focus search input when dropdown opens and calculate position
  useEffect(() => {
    if (isOpen) {
      calculateDropdownPosition();
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }
  }, [isOpen]);

  // Recalculate position on window resize
  useEffect(() => {
    const handleResize = () => {
      if (isOpen) {
        calculateDropdownPosition();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen]);

  return (
    <div className="mt-4">
      <label className="block text-sm text-dashboard mb-3 font-medium">
        {t("settings.languagePreference.selectLanguage")}
      </label>

      {/* Custom dropdown */}
      <div className="relative" ref={dropdownRef}>
        {/* Dropdown trigger */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full p-3 bg-dashboard-muted border border-dashboard rounded-md text-dashboard font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:border-dashboard-accent flex items-center justify-between hover:bg-dashboard-muted/80 transition-colors"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="flex-shrink-0">{currentLanguage.flag}</span>
            <span className="truncate">{currentLanguage.name}</span>
            <span className="text-dashboard-light truncate hidden sm:inline">({currentLanguage.nativeName})</span>
          </span>
          <ChevronDown 
            className={`w-4 h-4 text-dashboard-light transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`} 
          />
        </button>

        {/* Dropdown menu */}
        {isOpen && (
          <div className={`absolute z-50 w-full bg-dashboard-muted border border-dashboard rounded-md shadow-lg max-h-80 overflow-hidden min-w-0 ${
            dropdownPosition === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}>
            {/* Search input */}
            <div className={`p-3 ${dropdownPosition === 'above' ? 'border-t border-dashboard' : 'border-b border-dashboard'}`}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-dashboard-light" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={t("settings.languagePreference.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-dashboard-muted border border-dashboard rounded text-dashboard font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:border-dashboard-accent placeholder:text-dashboard-muted text-opacity-100"
                  style={{ color: 'var(--dash-text)', backgroundColor: 'var(--dash-muted)' }}
                />
              </div>
            </div>

            {/* Language list */}
            <div className={`max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-dashboard-light scrollbar-track-transparent ${
              dropdownPosition === 'above' ? 'flex flex-col-reverse' : ''
            }`}>
              {filteredLanguages.length > 0 ? (
                filteredLanguages.map((language) => (
                  <button
                    key={language.code}
                    type="button"
                    onClick={() => handleLanguageChange(language.code)}
                    className={`w-full px-3 py-2 text-left hover:bg-dashboard-accent/20 transition-colors flex items-center gap-2 min-w-0 ${
                      language.code === i18n.language 
                        ? 'bg-dashboard-accent/30 text-dashboard-accent' 
                        : 'text-dashboard'
                    }`}
                  >
                    <span className="flex-shrink-0">{language.flag}</span>
                    <span className="font-medium truncate">{language.name}</span>
                    <span className="text-dashboard-light text-sm truncate">({language.nativeName})</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-dashboard-muted text-sm">
                  {t("settings.languagePreference.noLanguagesFound")}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 text-xs text-dashboard-light">
        {t("settings.languagePreference.currentLanguage", {
          flag: currentLanguage.flag,
          name: currentLanguage.name,
        })}
      </div>

      <div className="mt-2 text-xs text-dashboard-light">
        {t("settings.languagePreference.availableLanguages")}
      </div>
    </div>
  );
});

LanguageSelector.displayName = "LanguageSelector";

export default LanguageSelector;
export { LANGUAGES };