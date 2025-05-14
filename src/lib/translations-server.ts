
import 'server-only';
import { cookies } from 'next/headers';
import type { Language } from '@/context/LanguageContext';
import enTranslations from '@/locales/en.json';
import esTranslations from '@/locales/es.json';

type TranslationKeys = keyof typeof enTranslations;
type TranslationsType = Record<TranslationKeys, string>;

const translations = {
  en: enTranslations as TranslationsType,
  es: esTranslations as TranslationsType,
};

export async function getTranslations() {
  const langCookie = cookies().get('language');
  const currentLanguage: Language = (langCookie?.value === 'es' || langCookie?.value === 'en') ? langCookie.value : 'en';
  
  const currentTranslations = translations[currentLanguage];

  return (key: TranslationKeys, replacements?: Record<string, string | number>): string => {
    let text = currentTranslations[key] || String(key); 

    if (replacements) {
      Object.keys(replacements).forEach(placeholder => {
        const regex = new RegExp(`{${placeholder}}`, 'g');
        text = text.replace(regex, String(replacements[placeholder]));
      });
    }
    return text;
  };
}
