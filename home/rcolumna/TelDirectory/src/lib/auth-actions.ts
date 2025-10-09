'use server';

import { cookies, headers } from 'next/headers';
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

// The server action now returns either an error or the user session object.
// It no longer handles redirection itself.
export async function loginAction(formData: FormData): Promise<{ error: string } | { user: UserSession }> {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  if (!username || !password) {
    return { error: 'Username and password are required.' };
  }

  let userRecord;
  let sessionData: UserSession;
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

    sessionData = { userId: userRecord.id, username: userRecord.username };
    const cookieStore = cookies();
    
    const requestHeaders = await headers(); // Await headers() call
    const host = requestHeaders.get('host');
    const protocol = requestHeaders.get('x-forwarded-proto') || (host?.startsWith('localhost') || host?.startsWith('192.168.') ? 'http' : 'https');
    const isSecure = protocol === 'https';

    cookieStore.set(AUTH_COOKIE_NAME, JSON.stringify(sessionData), {
      httpOnly: true,
      secure: isSecure, // This logic correctly handles local HTTP
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    
  } catch (error: any) {
    console.error('[Login Action] Error:', error);
    return { error: 'An unexpected server error occurred.' };
  }

  // Revalidate the layout to ensure subsequent server components get the new auth state
  revalidatePath('/', 'layout'); 
  // Return the user data on success
  return { user: sessionData };
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
