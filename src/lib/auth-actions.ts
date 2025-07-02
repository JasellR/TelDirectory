
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb, bcrypt } from './db';
import type { UserSession } from '@/types';

const AUTH_COOKIE_NAME = 'teldirectory-session';

export async function loginAction(
  formData: FormData
): Promise<{ success: boolean; message: string; redirectTo?: string }> {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;
  const redirectTo = formData.get('redirectTo') as string | null;

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
        console.log(`[Auth @ ${new Date().toISOString()}] Session cookie SET for user: ${username}.`);
        
      } catch (cookieError: any) {
        console.error(`[Auth @ ${new Date().toISOString()}] Error setting session cookie:`, cookieError);
        return { success: false, message: 'Error finalizing login session. Please try again.'};
      }
      
      const targetRedirectPath = redirectTo || '/import-xml';
      console.log(`[Auth @ ${new Date().toISOString()}] Login successful for ${username}. Preparing client-side redirect to: ${targetRedirectPath}`);
      return { success: true, message: 'Login successful', redirectTo: targetRedirectPath };

    } else {
      console.log(`[Auth @ ${new Date().toISOString()}] Invalid password for user: ${username}`);
      return { success: false, message: 'Invalid username or password.' };
    }
  } catch (error: any) {
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
  redirect('/');
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user;
}

export async function getCurrentUser(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(AUTH_COOKIE_NAME);
  const cookieValue = sessionCookie?.value;
  
  if (!cookieValue) {
    return null;
  }
  try {
    const session = JSON.parse(cookieValue) as UserSession;
    if (session.userId && session.username && typeof session.userId === 'number' && session.userId > 0) {
      return session;
    }
    return null;
  } catch (error) {
    console.error(`[Auth - getCurrentUser] Error parsing session cookie:`, error, "Cookie Value (first 50 chars):", cookieValue.substring(0,50));
    return null;
  }
}
