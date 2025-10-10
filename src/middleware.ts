
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { UserSession } from '@/types';
import { getDb } from './lib/db';

const AUTH_COOKIE_NAME = 'teldirectory-session';
const PROTECTED_ROUTES = ['/import-xml'];
const LOGIN_PATH = '/login';

// This check now only validates the cookie's content, without a DB call.
// This is safe to run in the middleware's lightweight environment.
async function checkAuth(request: NextRequest): Promise<boolean> {
    const cookie = request.cookies.get(AUTH_COOKIE_NAME);
    if (!cookie?.value) {
        return false;
    }
    try {
        const session = JSON.parse(cookie.value) as UserSession;
        // Simple structural validation
        if (typeof session.userId !== 'number' || session.userId <= 0 || !session.username) {
            return false;
        }
        return true;
    } catch (e) {
        console.error('[Middleware Auth Check] Error parsing cookie:', e);
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
    const redirectTo = request.nextUrl.searchParams.get('redirect_to');
    return NextResponse.redirect(new URL(redirectTo || '/import-xml', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // The matcher is updated to correctly exclude static files, API routes,
  // and now also the ivoxsdir path to allow public access for IP phones.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|ivoxsdir).*)'],
};
