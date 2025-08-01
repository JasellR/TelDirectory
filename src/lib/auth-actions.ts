
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb, bcrypt } from './db';
import type { UserSession } from '@/types';
import { revalidatePath } from 'next/cache';

const AUTH_COOKIE_NAME = 'teldirectory-session';

export async function loginAction(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  let user;
  try {
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    if (!username || !password) {
      return { error: 'Username and password are required.' };
    }

    const db = await getDb();
    user = await db.get('SELECT * FROM users WHERE username = ?', username);
    
    if (!user) {
      return { error: 'Invalid username or password.' };
    }

    const passwordMatch = await bcrypt.compare(password, user.hashedPassword);

    if (!passwordMatch) {
      return { error: 'Invalid username or password.' };
    }

  } catch (dbError: any) {
    console.error('[Login Action] DB or bcrypt Error:', dbError);
    return { error: 'An unexpected server error occurred during authentication.' };
  }
  
  // At this point, login is successful.
  // This part must be outside the main try block to avoid issues with redirect()
  try {
    const sessionData: UserSession = { userId: user.id, username: user.username };
    cookies().set(AUTH_COOKIE_NAME, JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    
    // Revalidate to ensure new session is picked up on next navigation.
    revalidatePath('/', 'layout');
  } catch (cookieError: any) {
    console.error('[Login Action] Cookie or Revalidation Error:', cookieError);
    return { error: 'An unexpected server error occurred setting the session.' };
  }

  // Redirect after successful cookie setting.
  redirect('/import-xml');
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
