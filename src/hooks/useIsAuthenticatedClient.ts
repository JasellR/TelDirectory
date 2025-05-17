
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
    // console.log('[useIsAuthenticatedClient] Cookie check on mount. Value:', sessionCookie);
    if (sessionCookie) {
      try {
        const session = JSON.parse(sessionCookie) as UserSession;
        setIsAuthenticated(!!session.userId);
      } catch (error) {
        console.warn('[AuthClient - useIsAuthenticatedClient] Error parsing session cookie:', error);
        setIsAuthenticated(false);
      }
    } else {
      setIsAuthenticated(false);
    }
  }, []); // Runs once on component mount

  return isAuthenticated;
}

export function useCurrentUserClient(): UserSession | null {
  const [user, setUser] = useState<UserSession | null>(null);

  useEffect(() => {
    const sessionCookie = Cookies.get(AUTH_COOKIE_NAME);
    // console.log('[useCurrentUserClient] Cookie check on mount. Value:', sessionCookie);
    if (sessionCookie) {
      try {
        const session = JSON.parse(sessionCookie) as UserSession;
        if (session.userId && session.username) {
          setUser(session);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.warn('[AuthClient - useCurrentUserClient] Error parsing session cookie for currentUser:', error);
        setUser(null);
      }
    } else {
      setUser(null);
    }
  }, []); // Runs once on component mount
  return user;
}
