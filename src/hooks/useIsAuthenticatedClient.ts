
'use client';

import { useState, useEffect } from 'react';
import Cookies from 'js-cookie'; 
import type { UserSession } from '@/types';

const AUTH_COOKIE_NAME = 'teldirectory-session';

/**
 * Client-side hook to check if the user is authenticated by looking for the session cookie.
 * @returns boolean - true if authenticated, false otherwise.
 */
export function useIsAuthenticatedClient(): boolean {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const sessionCookie = Cookies.get(AUTH_COOKIE_NAME);
    if (sessionCookie) {
      try {
        const session = JSON.parse(sessionCookie) as UserSession;
        setIsAuthenticated(!!session.userId);
      } catch (error) {
        console.warn('[AuthClient] Error parsing session cookie:', error);
        setIsAuthenticated(false);
      }
    } else {
      setIsAuthenticated(false);
    }
    // This effect should re-run if the cookie potentially changes,
    // but direct cookie changes don't trigger React re-renders.
    // Navigation or router.refresh() after login/logout should cause components using this hook to re-mount or re-render.
  }, []); // Re-run if cookie value could change by external means, though typically on navigation.

  return isAuthenticated;
}

export function useCurrentUserClient(): UserSession | null {
  const [user, setUser] = useState<UserSession | null>(null);

  useEffect(() => {
    const sessionCookie = Cookies.get(AUTH_COOKIE_NAME);
    if (sessionCookie) {
      try {
        const session = JSON.parse(sessionCookie) as UserSession;
        if (session.userId && session.username) {
          setUser(session);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.warn('[AuthClient] Error parsing session cookie for currentUser:', error);
        setUser(null);
      }
    } else {
      setUser(null);
    }
  }, []);
  return user;
}
