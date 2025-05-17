
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation'; // Still needed for logoutAction

const AUTH_COOKIE_NAME = 'teldirectory-auth-session';
const HARDCODED_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'; // Use environment variable or default

export async function loginAction(password: string): Promise<{ success: boolean; message: string }> {
  if (password === HARDCODED_PASSWORD) {
    cookies().set({
      name: AUTH_COOKIE_NAME,
      value: 'authenticated',
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: 'lax',
      // secure: process.env.NODE_ENV === 'production', // Enable in production
    });
    // DO NOT redirect from here. Let the client handle it.
    return { success: true, message: 'Login successful.' };
  } else {
    return { success: false, message: 'Invalid password.' };
  }
}

export async function logoutAction(): Promise<void> {
  cookies().delete(AUTH_COOKIE_NAME);
  redirect('/login'); // Server-side redirect for logout is fine
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get(AUTH_COOKIE_NAME);
  return !!sessionCookie && sessionCookie.value === 'authenticated';
}
