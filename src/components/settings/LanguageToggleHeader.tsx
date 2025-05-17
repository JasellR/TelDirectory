
'use client';

import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/useTranslation';
import type { Language } from '@/context/LanguageContext';

export function LanguageToggleHeader() {
  const { t, currentLanguage, setLanguage } = useTranslation();

  const toggleLanguage = () => {
    const nextLanguage: Language = currentLanguage === 'en' ? 'es' : 'en';
    setLanguage(nextLanguage);
  };

  const currentLanguageAcronym = currentLanguage === 'en' ? 'EN' : 'ES';
  const nextLanguageName = currentLanguage === 'en' ? t('spanish') : t('english');
  const ariaLabel = t('switchToLanguage', { languageName: nextLanguageName });


  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      aria-label={ariaLabel}
      className="px-2.5 w-[44px]" // Adjusted width for consistent size like "EN" / "ES"
    >
      <span className="font-medium">{currentLanguageAcronym}</span>
    </Button>
  );
}
