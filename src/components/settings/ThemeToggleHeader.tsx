
'use client';

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

export function ThemeToggleHeader() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const { t } = useTranslation(); // For ARIA label

  // Effect to read the initial theme from localStorage
  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    // If no theme is stored, default to light mode (isDarkMode = false)
    // ThemeInitializer will handle system preference for the very first load.
    setIsDarkMode(storedTheme === 'dark');
  }, []);

  const toggleTheme = () => {
    setIsDarkMode(prevMode => {
      const newMode = !prevMode;
      if (newMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
      return newMode;
    });
  };

  const ariaLabel = isDarkMode ? t('switchToLightTheme') : t('switchToDarkTheme');

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={ariaLabel}>
      {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
