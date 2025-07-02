
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb, bcrypt } from './db';
import type { UserSession } from '@/types';
import { revalidatePath } from 'next/cache';

const AUTH_COOKIE_NAME = 'teldirectory-session';


export async function loginAction(formData: FormData): Promise<{ error: string } | void> {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;
  const redirectTo = (formData.get('redirect_to') as string) || '/import-xml';

  if (!username || !password) {
    return { error: 'Username and password are required.' };
  }

  try {
    const db = await getDb();
    const user = await db.get('SELECT * FROM users WHERE username = ?', username);

    if (!user) {
      console.log(`[Auth @ ${new Date().toISOString()}] User not found:`, username);
      return { error: 'Invalid username or password.' };
    }

    const passwordMatch = await bcrypt.compare(password, user.hashedPassword);

    if (passwordMatch) {
      const sessionData: UserSession = { userId: user.id, username: user.username };
      const cookieStore = cookies();
      cookieStore.set(AUTH_COOKIE_NAME, JSON.stringify(sessionData), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 1 week
      });
      // Revalidate the layout to ensure the new cookie is picked up on the next render
      revalidatePath('/', 'layout');
    } else {
      console.log(`[Auth @ ${new Date().toISOString()}] Invalid password for user: ${username}`);
      return { error: 'Invalid username or password.' };
    }
  } catch (error: any) {
    console.error(`[Auth @ ${new Date().toISOString()}] General login error caught in loginAction:`, error);
    return { error: 'An unexpected critical error occurred during login.' };
  }
  
  // If we get here, login was successful, so redirect.
  redirect(redirectTo);
}


export async function logoutAction(): Promise<void> {
  try {
    cookies().delete(AUTH_COOKIE_NAME);
    revalidatePath('/', 'layout');
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
