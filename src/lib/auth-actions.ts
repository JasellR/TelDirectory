
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb, bcrypt } from './db';
import type { UserSession } from '@/types';
import { revalidatePath } from 'next/cache';

const AUTH_COOKIE_NAME = 'teldirectory-session';


export async function loginAction(formData: FormData): Promise<{ error?: string }> {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  if (!username || !password) {
    return { error: 'Username and password are required.' };
  }

  let user;
  try {
    const db = await getDb();
    user = await db.get('SELECT * FROM users WHERE username = ?', username);
  } catch (dbError: any) {
    console.error('[Login Action] Database error:', dbError);
    return { error: 'An unexpected critical error occurred during login.' };
  }

  if (!user) {
    return { error: 'Invalid username or password.' };
  }

  let passwordMatch = false;
  try {
    passwordMatch = await bcrypt.compare(password, user.hashedPassword);
  } catch (bcryptError: any) {
    console.error('[Login Action] Bcrypt error:', bcryptError);
    return { error: 'An unexpected critical error occurred during login.' };
  }

  if (!passwordMatch) {
    return { error: 'Invalid username or password.' };
  }

  // If we reach here, credentials are valid. Proceed with session setting and redirect.
  const sessionData: UserSession = { userId: user.id, username: user.username };
  cookies().set(AUTH_COOKIE_NAME, JSON.stringify(sessionData), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 1 week
  });

  revalidatePath('/', 'layout');

  const redirectTo = formData.get('redirectTo') as string || '/import-xml';
  redirect(redirectTo); // This throws NEXT_REDIRECT and should be handled by Next.js
}


export async function logoutAction(): Promise<void> {
  cookies().delete(AUTH_COOKIE_NAME);
  revalidatePath('/', 'layout');
  redirect('/');
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user;
}

export async function getCurrentUser(): Promise<UserSession | null> {
  const cookieStore = cookies();
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
