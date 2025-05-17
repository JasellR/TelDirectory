
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb, bcrypt } from './db';
import type { UserSession } from '@/types';

const AUTH_COOKIE_NAME = 'teldirectory-session';

export async function loginAction(
  formData: FormData,
  redirectTo?: string | null // Added redirectTo parameter
): Promise<{ success: boolean; message: string } | void> { // Return type can be void due to redirect
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  if (!username || !password) {
    console.log('[Auth] Username or password missing from form data.');
    return { success: false, message: 'Username and password are required.' };
  }

  try {
    console.log('[Auth] Attempting login for user:', username);
    let db;
    try {
      db = await getDb();
    } catch (dbError: any) {
      console.error('[Auth] Error connecting to database:', dbError);
      return { success: false, message: 'Error connecting to the database. Please try again later.' };
    }

    let user;
    try {
      user = await db.get('SELECT * FROM users WHERE username = ?', username);
    } catch (dbQueryError: any) {
      console.error('[Auth] Error querying user from database:', dbQueryError);
      return { success: false, message: 'Error retrieving user information. Please try again later.' };
    }

    if (!user) {
      console.log('[Auth] User not found:', username);
      return { success: false, message: 'Invalid username or password.' };
    }

    console.log('[Auth] User found, comparing password for:', username);
    let passwordMatch;
    try {
      passwordMatch = await bcrypt.compare(password, user.hashedPassword);
    } catch (bcryptError: any) {
      console.error('[Auth] Error comparing password with bcrypt:', bcryptError);
      return { success: false, message: 'Error during authentication process. Please try again.' };
    }

    if (passwordMatch) {
      console.log('[Auth] Password match for user:', username);
      const sessionData: UserSession = { userId: user.id, username: user.username };
      try {
        cookies().set(AUTH_COOKIE_NAME, JSON.stringify(sessionData), {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7, // 1 week
        });
        console.log(`[Auth] Session cookie SET for user: ${username}. Value: ${JSON.stringify(sessionData)}`);
        
        const cookieJustSet = cookies().get(AUTH_COOKIE_NAME);
        if (cookieJustSet) {
          console.log(`[Auth] Successfully read cookie "${AUTH_COOKIE_NAME}" immediately after setting. Value:`, cookieJustSet.value);
        } else {
          console.warn(`[Auth] FAILED to read cookie "${AUTH_COOKIE_NAME}" immediately after setting.`);
        }

        const targetRedirectPath = redirectTo || '/import-xml';
        console.log(`[Auth] Login successful for ${username}. Redirecting to: ${targetRedirectPath}`);
        redirect(targetRedirectPath); // Perform server-side redirect
        // Code below redirect() will not be executed.
      } catch (cookieError: any) {
        console.error('[Auth] Error setting session cookie or redirecting:', cookieError);
        // Check if it's a redirect error, if so, let Next.js handle it
        if (typeof cookieError === 'object' && cookieError !== null && 'digest' in cookieError && (cookieError as any).digest?.startsWith('NEXT_REDIRECT')) {
          throw cookieError;
        }
        return { success: false, message: 'Error finalizing login session. Please try again.'};
      }
    } else {
      console.log(`[Auth] Invalid password for user: ${username}`);
      return { success: false, message: 'Invalid username or password.' };
    }
  } catch (error: any) {
    // If it's a redirect error, re-throw it so Next.js can handle it
    if (typeof error === 'object' && error !== null && 'digest' in error && (error as any).digest?.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    console.error('[Auth] General login error caught in loginAction:', error);
    return { success: false, message: 'An unexpected critical error occurred during login.' };
  }
}

export async function logoutAction(): Promise<void> {
  try {
    cookies().delete(AUTH_COOKIE_NAME);
    console.log('[Auth] User logged out, cookie deleted.');
  } catch (error) {
    console.error('[Auth] Error during logout (clearing cookie):', error);
  }
  redirect('/login');
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user;
}

export async function getCurrentUser(): Promise<UserSession | null> {
  const sessionCookie = cookies().get(AUTH_COOKIE_NAME);
  const cookieValue = sessionCookie?.value;
  // console.log(`[Auth - getCurrentUser] Attempting to read cookie "${AUTH_COOKIE_NAME}". Value:`, cookieValue);

  if (!cookieValue) {
    // console.log(`[Auth - getCurrentUser] Cookie "${AUTH_COOKIE_NAME}" not found or value is empty.`);
    const allCookies = cookies().getAll();
    if (allCookies.length > 0) {
        // console.log("[Auth - getCurrentUser] All cookies received by server:", allCookies.map(c => ({ name: c.name, value: c.value.substring(0, 50) + (c.value.length > 50 ? '...' : '') })));
    } else {
        // console.log("[Auth - getCurrentUser] No cookies received by server.");
    }
    return null;
  }
  try {
    const session = JSON.parse(cookieValue) as UserSession;
    if (session.userId && session.username) {
      // console.log('[Auth - getCurrentUser] Cookie found, parsed, returning user:', session);
      return session;
    }
    // console.warn('[Auth - getCurrentUser] Cookie found, parsed, but invalid session structure:', session);
    return null;
  } catch (error) {
    console.error('[Auth - getCurrentUser] Error parsing session cookie:', error, "Cookie Value was:", cookieValue);
    return null;
  }
}
