
'use client';

import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/hooks/useTranslation';
import type { Language } from '@/context/LanguageContext';

export function LanguageToggleHeader() {
  const { t, currentLanguage, setLanguage } = useTranslation();

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
  };

  const currentLanguageAcronym = currentLanguage === 'en' ? 'EN' : 'ES';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('languageSettings')} className="px-2.5">
          <span className="font-medium">{currentLanguageAcronym}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleLanguageChange('en')}>
          <span className="flex items-center justify-between w-full">
            {t('english')}
            {currentLanguage === 'en' && <Check className="h-4 w-4 ml-2" />}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleLanguageChange('es')}>
          <span className="flex items-center justify-between w-full">
            {t('spanish')}
            {currentLanguage === 'es' && <Check className="h-4 w-4 ml-2" />}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
