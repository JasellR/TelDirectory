
'use server';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import type { UserSession } from '@/types';

const AUTH_COOKIE_NAME = 'teldirectory-session';
const PROTECTED_ROUTES = ['/import-xml'];
const LOGIN_PATH = '/login';

// Helper function to check authentication status from cookies (used only by middleware)
async function checkAuthFromCookiesForMiddleware(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(AUTH_COOKIE_NAME);
  if (!sessionCookie?.value) {
    // console.log('[Middleware Auth Check] No session cookie.');
    return false;
  }
  try {
    const session = JSON.parse(sessionCookie.value) as UserSession;
    const authed = !!session.userId;
    // console.log('[Middleware Auth Check] Cookie found, parsed, userId check:', authed, 'Session:', session);
    return authed;
  } catch (error) {
    console.warn('[Middleware Auth Check] Error parsing session cookie:', error);
    return false;
  }
}


export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthenticated = await checkAuthFromCookiesForMiddleware();
  // console.log(`[Middleware] Path: ${pathname}, IsAuthenticated: ${isAuthenticated}`);

  if (PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    if (!isAuthenticated) {
      const loginUrl = new URL(LOGIN_PATH, request.url);
      loginUrl.searchParams.set('redirect_to', pathname);
      console.log(`[Middleware] User not authenticated, redirecting from ${pathname} to ${loginUrl.toString()}`);
      return NextResponse.redirect(loginUrl);
    }
    // console.log(`[Middleware] User authenticated, allowing access to protected route: ${pathname}`);
  }

  if (pathname === LOGIN_PATH && isAuthenticated) {
    // console.log(`[Middleware] User authenticated, attempting to access login page. Redirecting to /import-xml.`);
    return NextResponse.redirect(new URL('/import-xml', request.url));
  }

  // console.log(`[Middleware] Path ${pathname} not protected or user allowed. Proceeding.`);
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
