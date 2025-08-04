
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb, bcrypt } from './db';
import type { UserSession } from '@/types';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';


const AUTH_COOKIE_NAME = 'teldirectory-session';

// Define a Zod schema for robust session validation
const UserSessionSchema = z.object({
  userId: z.number().int().positive(),
  username: z.string().min(1),
});


export async function loginAction(formData: FormData): Promise<{ error?: string }> {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  if (!username || !password) {
    return { error: 'Username and password are required.' };
  }

  try {
    const db = await getDb();
    const user = await db.get('SELECT * FROM users WHERE username = ?', username);

    if (!user) {
      return { error: 'Invalid username or password.' };
    }

    const passwordMatch = await bcrypt.compare(password, user.hashedPassword);

    if (!passwordMatch) {
      return { error: 'Invalid username or password.' };
    }

    const sessionData: UserSession = { userId: user.id, username: user.username };
    
    cookies().set(AUTH_COOKIE_NAME, JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    
    revalidatePath('/', 'layout');

  } catch (error: any) {
    console.error('[Login Action] Error:', error);
    return { error: 'An unexpected server error occurred.' };
  }
  
  redirect('/import-xml');
}


export async function logoutAction(): Promise<void> {
  cookies().delete(AUTH_COOKIE_NAME);
  revalidatePath('/', 'layout');
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user;
}

export async function getCurrentUser(): Promise<UserSession | null> {
  const cookieStore = cookies();
  const cookieValue = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  
  if (!cookieValue) {
    return null;
  }

  try {
    const sessionData = JSON.parse(cookieValue);
    const validation = UserSessionSchema.safeParse(sessionData);

    if (validation.success) {
      return validation.data;
    } else {
      console.warn('[Auth - getCurrentUser] Session data failed validation:', validation.error);
      return null;
    }
  } catch (error) {
    console.error(`[Auth - getCurrentUser] Error parsing session cookie:`, error);
    return null;
  }
}
