
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers'; // Import cookies from next/headers
import type { UserSession } from '@/types'; // Assuming UserSession type is defined

const AUTH_COOKIE_NAME = 'teldirectory-session';
const PROTECTED_ROUTES = ['/import-xml']; // Add other admin routes here
const LOGIN_PATH = '/login';

// Helper function to check authentication status from cookies
async function checkAuthFromCookies(): Promise<boolean> {
  const sessionCookie = cookies().get(AUTH_COOKIE_NAME);
  if (!sessionCookie?.value) {
    return false;
  }
  try {
    const session = JSON.parse(sessionCookie.value) as UserSession;
    return !!session.userId; // Check if userId exists in the session
  } catch (error) {
    console.warn('[Middleware] Error parsing session cookie:', error);
    return false;
  }
}


export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthenticated = await checkAuthFromCookies();

  if (PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    if (!isAuthenticated) {
      const loginUrl = new URL(LOGIN_PATH, request.url);
      loginUrl.searchParams.set('redirect_to', pathname); // Pass along where the user was going
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname === LOGIN_PATH && isAuthenticated) {
    // If user is authenticated and tries to access login page, redirect to settings or home
    return NextResponse.redirect(new URL('/import-xml', request.url)); 
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes) - though you might want to protect these too
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
