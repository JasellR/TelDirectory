
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { UserSession } from '@/types';

const AUTH_COOKIE_NAME = 'teldirectory-session';
const PROTECTED_ROUTES = ['/import-xml'];
const LOGIN_PATH = '/login';

async function checkAuth(request: NextRequest): Promise<boolean> {
    const cookie = request.cookies.get(AUTH_COOKIE_NAME);
    if (!cookie?.value) {
        return false;
    }
    try {
        const session = JSON.parse(cookie.value) as UserSession;
        // A valid session must have a numeric userId
        return typeof session.userId === 'number' && session.userId > 0;
    } catch (e) {
        // If parsing fails, the cookie is invalid
        return false;
    }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userIsAuthenticated = await checkAuth(request);

  if (PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    if (!userIsAuthenticated) {
      const loginUrl = new URL(LOGIN_PATH, request.url);
      loginUrl.searchParams.set('redirect_to', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname === LOGIN_PATH && userIsAuthenticated) {
    return NextResponse.redirect(new URL('/import-xml', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - and any files with extensions (e.g., .xml, .png)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.[^./]+$).*)'
  ],
};
