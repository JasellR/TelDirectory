
import { useLanguage } from '@/context/LanguageContext';
import enTranslations from '@/locales/en.json';
import esTranslations from '@/locales/es.json';

// Define a more specific type for translations if possible, or use a generic Record
// For now, assuming enTranslations structure is the master.
type TranslationKeys = keyof typeof enTranslations;
type Translations = Record<TranslationKeys, string>;


export function useTranslation() {
  const { language, setLanguage: setGlobalLanguage } = useLanguage();

  const translations: Translations = language === 'es' ? esTranslations as Translations : enTranslations as Translations;

  const t = (key: TranslationKeys, replacements?: Record<string, string | number>): string => {
    let text = translations[key] || String(key); // Fallback to key if translation is missing

    if (replacements) {
      Object.keys(replacements).forEach(placeholder => {
        const regex = new RegExp(`{${placeholder}}`, 'g');
        text = text.replace(regex, String(replacements[placeholder]));
      });
    }
    return text;
  };

  return { t, currentLanguage: language, setLanguage: setGlobalLanguage };
}

