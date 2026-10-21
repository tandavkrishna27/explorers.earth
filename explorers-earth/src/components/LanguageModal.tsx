import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Globe, Check } from 'lucide-react';
import DialogPanel from "../components/ui/DialogPanel";

interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

const languages: Language[] = [
  // Global Languages
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', flag: '🇸🇪' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', flag: '🇬🇷' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', flag: '🇨🇿' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', flag: '🇷🇴' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', flag: '🇲🇾' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', flag: '🇮🇷' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa', flag: '🇳🇬' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', flag: '🇹🇿' },
  { code: 'tl', name: 'Filipino', nativeName: 'Filipino', flag: '🇵🇭' },
  { code: 'my', name: 'Burmese', nativeName: 'မြန်မာ', flag: '🇲🇲' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', flag: '🇮🇱' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', flag: '🇭🇺' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', flag: '🇧🇬' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски', flag: '🇷🇸' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', flag: '🇭🇷' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', flag: '🇫🇮' },
  
  // Indian Languages
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: '🇮🇳' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', flag: '🇮🇳' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', flag: '🇮🇳' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', flag: '🇮🇳' },
  { code: 'or', name: 'Oriya', nativeName: 'ଓଡ଼ିଆ', flag: '🇮🇳' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', flag: '🇮🇳' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', flag: '🇮🇳' },
  { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', flag: '🇮🇳' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', flag: '🇳🇵' }
];

interface LanguageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLanguage: string;
  onLanguageChange: (language: string) => void;
}

const LanguageModal: React.FC<LanguageModalProps> = ({
  isOpen,
  onClose,
  currentLanguage,
  onLanguageChange
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLanguages = useMemo(() => {
    if (!searchTerm) return languages;
    
    const term = searchTerm.toLowerCase();
    return languages.filter(lang => 
      lang.name.toLowerCase().includes(term) ||
      lang.nativeName.toLowerCase().includes(term) ||
      lang.code.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  const handleLanguageSelect = (languageCode: string) => {
    onLanguageChange(languageCode);
    onClose();
  };

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const modal = (
    <AnimatePresence>
      {isOpen && (
        <DialogPanel onClose={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.1 }}
            className="mx-4 flex max-h-[85vh] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-[#e7dcc8] bg-[#fffcf6] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative shrink-0 border-b border-[#e7dcc8] bg-[#f6f1e7] px-8 py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="rounded-xl bg-[#dce9ce] p-2">
                    <Globe className="h-6 w-6 text-[#1b3b1a]" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-[#17231a]">
                      {t('languageModal.title')}
                    </h2>
                    <p className="mt-1 text-sm text-[#7a7568]">
                      {t('languageModal.subtitle')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label={t('languageModal.close')}
                  className="group rounded-xl p-2 transition-all duration-200 hover:bg-white/80"
                >
                  <X className="h-5 w-5 text-[#7a7568] group-hover:text-[#17231a]" />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="shrink-0 border-b border-[#e7dcc8] bg-[#f8f2e7]/60 px-8 py-6">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7a7568]" />
                <input
                  type="text"
                  placeholder={t('languageModal.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-2xl border border-[#e7dcc8] bg-[#fffcf6] py-4 pl-12 pr-4 text-[#17231a] shadow-sm outline-none transition-all duration-200 placeholder:text-[#7a7568] focus:border-[#2f6b55] focus:ring-2 focus:ring-[#2f6b55]"
                />
              </div>
            </div>

            {/* Language List */}
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#d8d0c0] scrollbar-track-[#f6f1e7]">
              {filteredLanguages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-8">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#f6f1e7]">
                    <Search className="h-8 w-8 text-[#7a7568]" />
                  </div>
                  <h3 className="mb-2 text-lg font-medium text-[#17231a]">
                    {t('languageModal.noLanguagesFound')}
                  </h3>
                  <p className="text-center text-[#7a7568]">
                    {t('languageModal.tryDifferentSearch')}
                  </p>
                </div>
              ) : (
                <div className="p-6">
                  {/* Responsive: 1 → 2 → 3 → 4 columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredLanguages.map((language) => (
                      <motion.button
                        key={language.code}
                        whileHover={{ 
                          scale: 1.02, 
                          backgroundColor: currentLanguage === language.code ? '#e7efdc' : '#f8f2e7',
                          boxShadow: '0 8px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                        }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleLanguageSelect(language.code)}
                        className={`group flex items-center p-5 rounded-2xl transition-all duration-300 border-2 ${
                          currentLanguage === language.code
                            ? 'bg-[#e7efdc] text-[#1b3b1a] border-[#2f6b55]/30 shadow-lg'
                            : 'border-[#e7dcc8] bg-white text-[#17231a] hover:border-[#2f6b55]/30 hover:bg-[#f8f2e7]'
                        }`}
                      >
                        <div className="flex items-center space-x-4 flex-1 min-w-0">
                          <span className="text-3xl flex-shrink-0">{language.flag}</span>
                          <div className="flex-1 text-left min-w-0">
                            <div className="truncate text-base font-semibold group-hover:text-[#17231a]">
                              {language.nativeName}
                            </div>
                            <div className="truncate text-sm text-[#7a7568] group-hover:text-[#5d6258]">
                              {language.name}
                            </div>
                          </div>
                        </div>
                        {currentLanguage === language.code && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="flex-shrink-0 ml-3"
                          >
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1b3b1a]">
                              <Check className="h-4 w-4 text-white" />
                            </div>
                          </motion.div>
                        )}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-[#e7dcc8] bg-[#f8f2e7]/60 px-8 py-4">
              <div className="flex items-center justify-between text-sm text-[#7a7568]">
                <span>{t('languageModal.languagesAvailable', { count: filteredLanguages.length })}</span>
                <span>{t('languageModal.escToClose')}</span>
              </div>
            </div>
          </motion.div>
        </DialogPanel>
      )}
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
};

export default LanguageModal;
