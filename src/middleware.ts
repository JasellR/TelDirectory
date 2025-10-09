import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE_NAME = 'teldirectory-session';
const PROTECTED_ROUTES = ['/import-xml'];
const LOGIN_PATH = '/login';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthenticated = request.cookies.has(AUTH_COOKIE_NAME);

  // If user is trying to access a protected route and is not authenticated, redirect to login
  if (PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    if (!isAuthenticated) {
      const loginUrl = new URL(LOGIN_PATH, request.url);
      loginUrl.searchParams.set('redirect_to', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // If user is authenticated and tries to access the login page, redirect them to the admin dashboard
  if (pathname === LOGIN_PATH && isAuthenticated) {
    const redirectTo = request.nextUrl.searchParams.get('redirect_to');
    return NextResponse.redirect(new URL(redirectTo || '/import-xml', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // The matcher is updated to correctly exclude static files and API routes
  // while covering all other pages.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.xml$).*)'],
};
