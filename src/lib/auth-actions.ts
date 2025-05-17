
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb, bcrypt } from './db';
import type { UserSession } from '@/types';

const AUTH_COOKIE_NAME = 'teldirectory-session';

export async function loginAction(
  formData: FormData,
  redirectTo?: string | null
): Promise<{ success: boolean; message: string } | void> {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  if (!username || !password) {
    console.log('[Auth] Username or password missing from form data.');
    return { success: false, message: 'Username and password are required.' };
  }

  try {
    console.log(`[Auth @ ${new Date().toISOString()}] Attempting login for user:`, username);
    let db;
    try {
      db = await getDb();
    } catch (dbError: any) {
      console.error(`[Auth @ ${new Date().toISOString()}] Error connecting to database:`, dbError);
      return { success: false, message: 'Error connecting to the database. Please try again later.' };
    }

    let user;
    try {
      user = await db.get('SELECT * FROM users WHERE username = ?', username);
    } catch (dbQueryError: any) {
      console.error(`[Auth @ ${new Date().toISOString()}] Error querying user from database:`, dbQueryError);
      return { success: false, message: 'Error retrieving user information. Please try again later.' };
    }

    if (!user) {
      console.log(`[Auth @ ${new Date().toISOString()}] User not found:`, username);
      return { success: false, message: 'Invalid username or password.' };
    }

    console.log(`[Auth @ ${new Date().toISOString()}] User found, comparing password for:`, username);
    let passwordMatch;
    try {
      passwordMatch = await bcrypt.compare(password, user.hashedPassword);
    } catch (bcryptError: any) {
      console.error(`[Auth @ ${new Date().toISOString()}] Error comparing password with bcrypt:`, bcryptError);
      return { success: false, message: 'Error during authentication process. Please try again.' };
    }

    if (passwordMatch) {
      console.log(`[Auth @ ${new Date().toISOString()}] Password match for user:`, username);
      const sessionData: UserSession = { userId: user.id, username: user.username };
      const cookieStore = await cookies();
      try {
        cookieStore.set(AUTH_COOKIE_NAME, JSON.stringify(sessionData), {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7, // 1 week
        });
        console.log(`[Auth @ ${new Date().toISOString()}] Session cookie SET for user: ${username}. Value: ${JSON.stringify(sessionData)}`);
        
        const cookieJustSet = cookieStore.get(AUTH_COOKIE_NAME);
        if (cookieJustSet) {
          console.log(`[Auth @ ${new Date().toISOString()}] Successfully read cookie "${AUTH_COOKIE_NAME}" immediately after setting. Value:`, cookieJustSet.value);
        } else {
          console.warn(`[Auth @ ${new Date().toISOString()}] FAILED to read cookie "${AUTH_COOKIE_NAME}" immediately after setting.`);
        }
        
      } catch (cookieError: any) {
        console.error(`[Auth @ ${new Date().toISOString()}] Error setting session cookie:`, cookieError);
         // Check if it's a redirect error, if so, rethrow it
        if (typeof cookieError === 'object' && cookieError !== null && 'digest' in cookieError && (cookieError as any).digest?.startsWith('NEXT_REDIRECT')) {
          throw cookieError;
        }
        return { success: false, message: 'Error finalizing login session. Please try again.'};
      }
      
      const targetRedirectPath = redirectTo || '/import-xml';
      console.log(`[Auth @ ${new Date().toISOString()}] Login successful for ${username}. Redirecting to: ${targetRedirectPath}`);
      redirect(targetRedirectPath); // Perform server-side redirect

    } else {
      console.log(`[Auth @ ${new Date().toISOString()}] Invalid password for user: ${username}`);
      return { success: false, message: 'Invalid username or password.' };
    }
  } catch (error: any) {
    // If it's a redirect error from a nested call (like redirect itself), rethrow it
    if (typeof error === 'object' && error !== null && 'digest' in error && (error as any).digest?.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    console.error(`[Auth @ ${new Date().toISOString()}] General login error caught in loginAction:`, error);
    return { success: false, message: 'An unexpected critical error occurred during login.' };
  }
}

export async function logoutAction(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(AUTH_COOKIE_NAME);
    console.log(`[Auth @ ${new Date().toISOString()}] User logged out, cookie deleted.`);
  } catch (error) {
    console.error(`[Auth @ ${new Date().toISOString()}] Error during logout (clearing cookie):`, error);
  }
  redirect('/login');
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user;
}

export async function getCurrentUser(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(AUTH_COOKIE_NAME);
  const cookieValue = sessionCookie?.value;
  
  console.log(`[Auth - getCurrentUser @ ${new Date().toISOString()}] Attempting to read cookie "${AUTH_COOKIE_NAME}". Has value: ${!!cookieValue}`);
  if (cookieValue) {
    // console.log(`[Auth - getCurrentUser] Cookie value found: ${cookieValue.substring(0, 50)}${cookieValue.length > 50 ? '...' : ''}`);
  }

  if (!cookieValue) {
    console.log(`[Auth - getCurrentUser @ ${new Date().toISOString()}] Cookie "${AUTH_COOKIE_NAME}" not found or value is empty.`);
    const allCookies = cookieStore.getAll(); 
    if (allCookies.length > 0) {
        console.log(`[Auth - getCurrentUser @ ${new Date().toISOString()}] All cookies received by server for this request:`, allCookies.map(c => ({ name: c.name, value: c.value.substring(0, 50) + (c.value.length > 50 ? '...' : '') })));
    } else {
        console.log(`[Auth - getCurrentUser @ ${new Date().toISOString()}] No cookies received by server for this request.`);
    }
    return null;
  }
  try {
    const session = JSON.parse(cookieValue) as UserSession;
    if (session.userId && session.username) {
      console.log(`[Auth - getCurrentUser @ ${new Date().toISOString()}] Cookie found, parsed, returning user:`, {userId: session.userId, username: session.username});
      return session;
    }
    console.warn(`[Auth - getCurrentUser @ ${new Date().toISOString()}] Cookie found, parsed, but invalid session structure:`, session);
    return null;
  } catch (error) {
    console.error(`[Auth - getCurrentUser @ ${new Date().toISOString()}] Error parsing session cookie:`, error, "Cookie Value was:", cookieValue);
    return null;
  }
}
