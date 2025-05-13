
'use client';

import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark') {
      document.documentElement.classList.add('dark');
      setIsDarkMode(true);
    } else {
      document.documentElement.classList.remove('dark');
      setIsDarkMode(false);
    }
  }, []);

  const handleThemeChange = (checked: boolean) => {
    if (checked) {
      localStorage.setItem('theme', 'dark');
      document.documentElement.classList.add('dark');
      setIsDarkMode(true);
    } else {
      localStorage.setItem('theme', 'light');
      document.documentElement.classList.remove('dark');
      setIsDarkMode(false);
    }
  };

  return (
    <div className="flex items-center space-x-2 p-4 border rounded-lg shadow-sm">
      {isDarkMode ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}
      <Label htmlFor="theme-switch" className="flex-grow text-base">
        Dark Mode
      </Label>
      <Switch
        id="theme-switch"
        checked={isDarkMode}
        onCheckedChange={handleThemeChange}
        aria-label="Toggle dark mode"
      />
    </div>
  );
}
