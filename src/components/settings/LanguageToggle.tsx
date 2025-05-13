
'use client';

import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/useTranslation';
import { Languages } from 'lucide-react';
import type { Language } from '@/context/LanguageContext';

export function LanguageToggle() {
  const { t, currentLanguage, setLanguage } = useTranslation();

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
  };

  return (
    <div className="flex items-center space-x-2 p-4 border rounded-lg shadow-sm">
      <Languages className="h-5 w-5 text-primary" />
      <span className="flex-grow text-base">{t('languageSettings')}</span>
      <div className="space-x-2">
        <Button
          variant={currentLanguage === 'en' ? 'default' : 'outline'}
          onClick={() => handleLanguageChange('en')}
          size="sm"
        >
          {t('english')}
        </Button>
        <Button
          variant={currentLanguage === 'es' ? 'default' : 'outline'}
          onClick={() => handleLanguageChange('es')}
          size="sm"
        >
          {t('spanish')}
        </Button>
      </div>
    </div>
  );
}
