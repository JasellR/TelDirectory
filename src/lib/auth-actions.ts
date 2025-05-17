
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb, bcrypt } from './db'; // Assuming db.ts is in the same directory
import type { UserSession } from '@/types';

const AUTH_COOKIE_NAME = 'teldirectory-session';
const ADMIN_PASSWORD_ENV_VAR = 'ADMIN_PASSWORD'; // For a single, hardcoded password scenario

// For SQLite based auth
export async function loginAction(formData: FormData): Promise<{ success: boolean; message: string }> {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  if (!username || !password) {
    return { success: false, message: 'Username and password are required.' };
  }

  try {
    const db = await getDb();
    const user = await db.get('SELECT * FROM users WHERE username = ?', username);

    if (!user) {
      return { success: false, message: 'Invalid username or password.' };
    }

    const passwordMatch = await bcrypt.compare(password, user.hashedPassword);

    if (passwordMatch) {
      const sessionData: UserSession = { userId: user.id, username: user.username };
      cookies().set(AUTH_COOKIE_NAME, JSON.stringify(sessionData), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 1 week
      });
      console.log(`[Auth] Login successful for user: ${username}`);
      // Redirect is handled by this server action upon success
      redirect('/import-xml'); 
      // Note: redirect() throws an error, so the return below is for type consistency but won't be reached on success.
      // return { success: true, message: 'Login successful. Redirecting...' }; 
    } else {
      return { success: false, message: 'Invalid username or password.' };
    }
  } catch (error) {
    console.error('[Auth] Login error:', error);
    return { success: false, message: 'An unexpected error occurred during login.' };
  }
}

export async function logoutAction(): Promise<void> {
  cookies().delete(AUTH_COOKIE_NAME);
  console.log('[Auth] User logged out.');
  redirect('/login');
}

export async function isAuthenticated(): Promise<boolean> {
  const sessionCookie = cookies().get(AUTH_COOKIE_NAME);
  if (!sessionCookie?.value) {
    return false;
  }
  try {
    const session = JSON.parse(sessionCookie.value) as UserSession;
    // Basic check: does it have a userId? For more security, you might validate this session ID against a DB sessions table.
    return !!session.userId;
  } catch (error) {
    console.warn('[Auth] Error parsing session cookie:', error);
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
