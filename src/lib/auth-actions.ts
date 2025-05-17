
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation'; // Import redirect

const AUTH_COOKIE_NAME = 'teldirectory-auth-session';
const HARDCODED_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'; // Use environment variable or default

export async function loginAction(password: string): Promise<{ success: boolean; message: string }> {
  if (password === HARDCODED_PASSWORD) {
    cookies().set({
      name: AUTH_COOKIE_NAME,
      value: 'authenticated', // Simple value, could be a JWT in a real app
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: 'lax',
      // secure: process.env.NODE_ENV === 'production', // Enable in production
    });
    redirect('/import-xml'); // Server-side redirect after setting cookie
    // Note: redirect() throws an error to stop execution, so this line below might not be reached
    // or its return value might not be processed by the client if the redirect is successful.
    // However, returning a consistent shape helps if redirect fails or for typing.
    // return { success: true, message: 'Login successful. Redirecting...' }; 
  } else {
    return { success: false, message: 'Invalid password.' };
  }
}

export async function logoutAction(): Promise<void> {
  cookies().delete(AUTH_COOKIE_NAME);
  redirect('/login');
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get(AUTH_COOKIE_NAME);
  return !!sessionCookie && sessionCookie.value === 'authenticated';
}
