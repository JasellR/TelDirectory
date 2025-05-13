
'use client';

import { useEffect } from 'react';

export function ThemeInitializer() {
  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      // Ensure light mode is default if nothing stored or 'light' is stored
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return null; // This component does not render anything
}
