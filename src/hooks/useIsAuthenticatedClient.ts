
'use client';

import { useState, useEffect } from 'react';
import Cookies from 'js-cookie'; // Using js-cookie for easier client-side cookie access

const AUTH_COOKIE_NAME = 'teldirectory-auth-session';

/**
 * Custom hook to check authentication status on the client-side.
 * Reads the authentication cookie.
 * @returns boolean - true if authenticated, false otherwise.
 */
export function useIsAuthenticatedClient(): boolean {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const sessionCookie = Cookies.get(AUTH_COOKIE_NAME);
    setIsAuthenticated(!!sessionCookie && sessionCookie === 'authenticated');
  }, []);

  return isAuthenticated;
}
