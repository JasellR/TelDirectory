
'use client';

import type { Dispatch, ReactNode, SetStateAction} from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

export type Language = 'en' | 'es';

interface LanguageContextType {
  language: Language;
  setLanguage: Dispatch<SetStateAction<Language>>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('en'); // Default to English

  useEffect(() => {
    const storedLanguage = localStorage.getItem('language') as Language | null;
    if (storedLanguage && (storedLanguage === 'en' || storedLanguage === 'es')) {
      setLanguage(storedLanguage);
      document.documentElement.lang = storedLanguage;
    } else {
      // If no language is stored, or if it's invalid, default to English
      // and update localStorage and html lang attribute.
      localStorage.setItem('language', 'en');
      document.documentElement.lang = 'en';
      setLanguage('en');
    }
  }, []);

  const handleSetLanguage = (langUpdater: SetStateAction<Language>) => {
    setLanguage(prevLang => {
      const newLang = typeof langUpdater === 'function' ? langUpdater(prevLang) : langUpdater;
      if (newLang === 'en' || newLang === 'es') {
        localStorage.setItem('language', newLang);
        document.documentElement.lang = newLang;
        return newLang;
      }
      // Fallback to previous language if newLang is invalid, though this case should be rare with typed inputs.
      return prevLang; 
    });
  };


  const value = { language, setLanguage: handleSetLanguage };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
