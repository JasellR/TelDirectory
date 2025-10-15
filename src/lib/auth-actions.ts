
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb, bcrypt } from './db';
import type { UserSession } from '@/types';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';


const AUTH_COOKIE_NAME = 'teldirectory-session';

const UserSessionSchema = z.object({
  userId: z.number().int().positive(),
  username: z.string().min(1),
});


export async function loginAction(formData: FormData): Promise<{ error?: string; user?: UserSession }> {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  if (!username || !password) {
    return { error: 'Username and password are required.' };
  }

  let userRecord;
  try {
    const db = await getDb();
    userRecord = await db.get('SELECT * FROM users WHERE username = ?', username);

    if (!userRecord) {
      return { error: 'Invalid username or password.' };
    }

    const passwordMatch = await bcrypt.compare(password, userRecord.hashedPassword);

    if (!passwordMatch) {
      return { error: 'Invalid username or password.' };
    }

    const sessionData: UserSession = { userId: userRecord.id, username: userRecord.username };
    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE_NAME, JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    
    // Revalidate the layout to ensure session changes are picked up everywhere.
    revalidatePath('/', 'layout');

    // Return the user data instead of redirecting from the server action
    return { user: { userId: userRecord.id, username: userRecord.username } };

  } catch (error: any) {
    console.error('[Login Action] Error:', error);
    return { error: 'An unexpected server error occurred.' };
  }
}


export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
  revalidatePath('/', 'layout');
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user;
}

export async function getCurrentUser(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  
  // Prevent parsing if cookie is empty or undefined
  if (!cookieValue) {
    return null;
  }

  try {
    const sessionData = JSON.parse(cookieValue);
    const validation = UserSessionSchema.safeParse(sessionData);

    if (validation.success) {
      // Database validation: Ensure the user from the cookie still exists.
      const db = await getDb();
      const user = await db.get('SELECT id FROM users WHERE id = ?', validation.data.userId);
      
      if (!user) {
        // User does not exist, invalidate session by returning null.
        // Optionally, delete the invalid cookie.
        cookieStore.delete(AUTH_COOKIE_NAME);
        return null;
      }
      return validation.data;
    } else {
      console.warn('[Auth - getCurrentUser] Session data in cookie failed validation:', validation.error);
      return null;
    }
  } catch (error) {
    console.error(`[Auth - getCurrentUser] Error parsing session cookie:`, error);
    return null;
  }
}
