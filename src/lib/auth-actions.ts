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

  console.log(`[Login Attempt] Received login request for username: "${username}"`);

  if (!username || !password) {
    console.error('[Login Error] Username or password not provided.');
    return { error: 'Username and password are required.' };
  }

  let userRecord;
  try {
    const db = await getDb();
    console.log('[Login DB] Database connection obtained.');

    userRecord = await db.get('SELECT * FROM users WHERE username = ?', username);
    
    if (!userRecord) {
      console.warn(`[Login Auth] User not found in database for username: "${username}"`);
      return { error: 'Invalid username or password.' };
    }
    
    console.log(`[Login Auth] User record found for username: "${username}". ID: ${userRecord.id}`);

    const passwordMatch = await bcrypt.compare(password, userRecord.hashedPassword);

    if (!passwordMatch) {
      console.warn(`[Login Auth] Password mismatch for username: "${username}"`);
      return { error: 'Invalid username or password.' };
    }
    
    console.log(`[Login Auth] Password match successful for username: "${username}".`);

    const sessionData: UserSession = { userId: userRecord.id, username: userRecord.username };
    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE_NAME, JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    
    console.log(`[Login Success] Session cookie set for user: "${username}".`);
    
    revalidatePath('/', 'layout');

  } catch (error: any) {
    console.error('[Login Action] A critical error occurred during the login process:', error);
    return { error: 'An unexpected server error occurred.' };
  }
  
  // Instead of redirecting from the action, we can return the user
  // and let the client-side handle the redirect after state update.
  // This helps with client state consistency.
  redirect('/import-xml');
  return { user: { userId: userRecord.id, username: userRecord.username } };
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
