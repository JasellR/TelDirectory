
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb, bcrypt } from './db';
import type { UserSession } from '@/types';

const AUTH_COOKIE_NAME = 'teldirectory-session';

export async function loginAction(formData: FormData): Promise<{ success: boolean; message: string }> {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  if (!username || !password) {
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
        console.log('[Auth] Session cookie set for user:', username);
      } catch (cookieError: any) {
        console.error('[Auth] Error setting session cookie:', cookieError);
        return { success: false, message: 'Error finalizing login session. Please try again.'};
      }
      
      console.log('[Auth] Login successful for user:', username, '. Redirecting to /import-xml');
      redirect('/import-xml'); 
      // redirect() throws an error that Next.js catches, so this line below won't be reached.
      // For type consistency, though, some might add: return { success: true, message: 'Login successful' };
    } else {
      console.log('[Auth] Invalid password for user:', username);
      return { success: false, message: 'Invalid username or password.' };
    }
  } catch (error: any) {
    // This catch block is for truly unexpected errors or if redirect() itself throws something other than NEXT_REDIRECT
    console.error('[Auth] General login error caught in loginAction:', error);
    if (typeof error === 'object' && error !== null && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) {
      throw error; // Re-throw NEXT_REDIRECT to let Next.js handle it
    }
    return { success: false, message: 'An unexpected critical error occurred during login.' };
  }
}

export async function logoutAction(): Promise<void> {
  try {
    cookies().delete(AUTH_COOKIE_NAME);
    console.log('[Auth] User logged out.');
  } catch (error) {
    console.error('[Auth] Error during logout (clearing cookie):', error);
  }
  redirect('/login');
}

export async function isAuthenticated(): Promise<boolean> {
  const sessionCookie = cookies().get(AUTH_COOKIE_NAME);
  if (!sessionCookie?.value) {
    return false;
  }
  try {
    const session = JSON.parse(sessionCookie.value) as UserSession;
    return !!session.userId;
  } catch (error) {
    console.warn('[Auth] Error parsing session cookie in isAuthenticated:', error);
    return false;
  }
}

export async function getCurrentUser(): Promise<UserSession | null> {
  const sessionCookie = cookies().get(AUTH_COOKIE_NAME);
  if (!sessionCookie?.value) {
    return null;
  }
  try {
    const session = JSON.parse(sessionCookie.value) as UserSession;
    if (session.userId && session.username) {
      return session;
    }
    return null;
  } catch (error) {
    console.warn('[Auth] Error parsing session cookie for getCurrentUser:', error);
    return null;
  }
}
