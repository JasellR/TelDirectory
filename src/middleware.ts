
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE_NAME = 'teldirectory-auth-session';
const PROTECTED_ROUTES = ['/import-xml']; // Add other routes as needed
const LOGIN_ROUTE = '/login';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the current route is protected
  if (PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    const sessionCookie = request.cookies.get(AUTH_COOKIE_NAME);

    // If no session cookie or not authenticated, redirect to login
    if (!sessionCookie || sessionCookie.value !== 'authenticated') {
      const loginUrl = new URL(LOGIN_ROUTE, request.url);
      // If trying to access a protected route, store it for redirect after login
      if (pathname !== LOGIN_ROUTE) {
        loginUrl.searchParams.set('redirect_to', pathname);
      }
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
